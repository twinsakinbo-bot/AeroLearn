/**
 * The Firestore-shaped client API, backed by Supabase Postgres.
 *
 * The app had ~300 Firestore call sites across 38 files. Rather than rewrite
 * every query, this module re-implements the subset of the Firestore modular API
 * those call sites actually use, so each file changed only its import line:
 *
 *   - import { doc, getDoc } from "firebase/firestore"
 *   + import { doc, getDoc } from "@/lib/db"
 *
 * Documents live in jsonb, one table per former collection, and the comparison
 * and merge logic that jsonb needs lives in SQL (supabase/migrations/0001_init.sql)
 * so ordering by a number sorts numerically and increment() stays atomic.
 *
 * Differences worth knowing:
 *   - Queries are not offline-cached. The Firestore persistent cache is gone.
 *   - runTransaction() is optimistic: it reads, computes, then commits with a
 *     version assertion and retries on conflict. Firestore's was pessimistic.
 *   - startAfter() supports a single orderBy, which is all the app uses.
 */
import { getSupabase } from "@/lib/supabase/client"
import {
  Timestamp,
  decode,
  emptyPlan,
  encode,
  kindOf,
  makeSentinel,
  resolveRef,
  splitPatch,
  type QueryFilter,
  type QueryOrder,
  type QueryPlan,
  type Ref,
  type WhereOp,
} from "@/lib/supabase/documents"

export { Timestamp }
export type DocumentData = Record<string, any>

/**
 * Firestore's modular API takes the database handle as the first argument. There
 * is no handle to pass here — the Supabase client is resolved lazily per call —
 * so this is a sentinel that keeps those signatures intact.
 */
export const db = { __aerolearn: "supabase" } as const
export type Firestore = typeof db

/* ----------------------------------------------------------------- references */

export interface DocumentReference<T = DocumentData> {
  readonly type: "document"
  readonly id: string
  readonly path: string
  /** @internal */ readonly __ref: Ref
}

export interface CollectionReference<T = DocumentData> {
  readonly type: "collection"
  readonly id: string
  readonly path: string
  /** @internal */ readonly __ref: Ref
}

export interface Query<T = DocumentData> {
  readonly type: "query"
  readonly path: string
  /** @internal */ readonly __ref: Ref
  /** @internal */ readonly __constraints: QueryConstraint[]
}

/** `collection(db, "conversations", convId, "messages")` and the plain form. */
export function collection(_db: unknown, ...segments: string[]): CollectionReference {
  const ref = resolveRef(segments)
  if (ref.id) throw new Error(`"${ref.path}" points at a document, not a collection.`)
  return { type: "collection", id: ref.table, path: ref.path, __ref: ref }
}

/** `doc(db, "users", uid)`, or `doc(collectionRef)` for a fresh generated id. */
export function doc(target: unknown, ...segments: string[]): DocumentReference {
  if (segments.length === 0 && target && (target as CollectionReference).type === "collection") {
    const parent = (target as CollectionReference).__ref
    const id = crypto.randomUUID()
    return {
      type: "document",
      id,
      path: `${parent.path}/${id}`,
      __ref: { ...parent, id },
    }
  }
  const ref = resolveRef(segments)
  if (!ref.id) throw new Error(`"${ref.path}" points at a collection, not a document.`)
  return { type: "document", id: ref.id, path: ref.path, __ref: ref }
}

/* ---------------------------------------------------------------- constraints */

export type QueryConstraint =
  | { kind: "where"; field: string; op: WhereOp; value: unknown }
  | { kind: "orderBy"; field: string; dir: "asc" | "desc" }
  | { kind: "limit"; count: number }
  | { kind: "startAfter"; snapshot: DocumentSnapshot }

export function where(field: string | FieldPath, op: WhereOp, value: unknown): QueryConstraint {
  return { kind: "where", field: String(field), op, value }
}

export function orderBy(field: string | FieldPath, dir: "asc" | "desc" = "asc"): QueryConstraint {
  return { kind: "orderBy", field: String(field), dir }
}

export function limit(count: number): QueryConstraint {
  return { kind: "limit", count }
}

export function startAfter(snapshot: DocumentSnapshot): QueryConstraint {
  return { kind: "startAfter", snapshot }
}

export function query<T>(
  source: CollectionReference<T> | Query<T>,
  ...constraints: QueryConstraint[]
): Query<T> {
  const base = source as Query<T> & { __constraints?: QueryConstraint[] }
  return {
    type: "query",
    path: base.path,
    __ref: base.__ref,
    __constraints: [...(base.__constraints ?? []), ...constraints],
  }
}

/**
 * Firestore's `documentId()` sentinel, narrowed to what the one call site needs:
 * a stringifiable field name. `String(FieldPath)` yields the field it wraps.
 */
export class FieldPath {
  private readonly segments: string[]
  constructor(...segments: string[]) {
    this.segments = segments
  }
  toString(): string {
    return this.segments.join(".")
  }
}

export function documentId(): FieldPath {
  return new FieldPath("id")
}

/* ------------------------------------------------------------ field sentinels */

export const serverTimestamp = () => makeSentinel("serverTimestamp") as unknown as Timestamp
export const increment = (n: number) => makeSentinel("increment", n) as unknown as number
export const arrayUnion = (...values: unknown[]) => makeSentinel("arrayUnion", values) as unknown as any[]
export const arrayRemove = (...values: unknown[]) => makeSentinel("arrayRemove", values) as unknown as any[]
export const deleteField = () => makeSentinel("delete") as unknown as any

/* ------------------------------------------------------------------ snapshots */

interface Row {
  id: string
  data: Record<string, unknown>
  version: number | null
}

export class DocumentSnapshot<T = DocumentData> {
  /** @internal raw jsonb, still timestamp-encoded — startAfter() reads cursors from it. */
  readonly __raw: Record<string, unknown> | undefined
  /** @internal for optimistic-concurrency asserts in runTransaction(). */
  readonly __version: number | null

  #decoded: T | undefined

  constructor(
    readonly id: string,
    readonly ref: DocumentReference<T>,
    row: Row | null,
  ) {
    this.__raw = row?.data
    this.__version = row?.version ?? null
    this.#decoded = row ? (decode(row.data) as T) : undefined
  }

  /**
   * A type predicate, exactly as Firestore declares it — which is what lets
   * `if (snap.exists()) snap.data().xp` type-check without a `!`. Dozens of call
   * sites rely on that narrowing.
   */
  exists(): this is QueryDocumentSnapshot<T> {
    return this.#decoded !== undefined
  }

  data(): T | undefined {
    return this.#decoded
  }

  get(field: string): unknown {
    return field
      .split(".")
      .reduce<any>((acc, key) => (acc == null ? acc : acc[key]), this.#decoded)
  }
}

/** A snapshot from a query, where the document is known to exist. */
export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  override data(): T {
    return super.data() as T
  }
}

export class QuerySnapshot<T = DocumentData> {
  constructor(readonly docs: QueryDocumentSnapshot<T>[]) {}

  get empty(): boolean {
    return this.docs.length === 0
  }

  get size(): number {
    return this.docs.length
  }

  forEach(cb: (doc: QueryDocumentSnapshot<T>) => void): void {
    this.docs.forEach(cb)
  }
}

/* -------------------------------------------------------------- plan building */

function buildPlan(source: CollectionReference | Query | DocumentReference): QueryPlan {
  const ref = source.__ref
  const plan = emptyPlan(ref.table, ref.parentId)
  const constraints = (source as Query).__constraints ?? []

  const filters: QueryFilter[] = []
  const orders: QueryOrder[] = []
  let cursor: DocumentSnapshot | null = null

  for (const c of constraints) {
    switch (c.kind) {
      case "where":
        filters.push({
          f: c.field,
          op: c.op,
          v: encode(c.value),
          k: kindOf(c.value),
        })
        break
      case "orderBy":
        orders.push({ f: c.field, dir: c.dir })
        break
      case "limit":
        plan.limit = c.count
        break
      case "startAfter":
        cursor = c.snapshot
        break
    }
  }

  plan.filters = filters
  plan.orders = orders

  if (cursor) {
    // The cursor value has to be the *stored* form, not the decoded one, so the
    // SQL side compares like against like.
    const field = orders[0]?.f
    plan.after = [field ? cursor.__raw?.[field] : null, cursor.id]
  }

  return plan
}

/** SQL compares `array-contains` with `data -> f @> <scalar>`, so no wrapping. */
function rpcArgs(plan: QueryPlan, countOnly = false) {
  return {
    p_table: plan.table,
    p_parent: plan.parentId,
    p_filters: plan.filters,
    p_orders: plan.orders,
    p_limit: plan.limit,
    p_after: plan.after ? { v: plan.after[0] ?? null, id: plan.after[1] } : null,
    p_count_only: countOnly,
  }
}

/* ----------------------------------------------------------------------- reads */

function fail(context: string, error: { message?: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown Supabase error"}`)
}

export async function getDoc<T = DocumentData>(
  ref: DocumentReference<T>,
): Promise<DocumentSnapshot<T>> {
  const { data, error } = await getSupabase()
    .from(ref.__ref.table)
    .select("id, data, version")
    .eq("id", ref.id)
    .maybeSingle()

  if (error) fail(`Could not read ${ref.path}`, error)
  return new DocumentSnapshot<T>(ref.id, ref, (data as Row | null) ?? null)
}

export async function getDocs<T = DocumentData>(
  source: CollectionReference<T> | Query<T>,
): Promise<QuerySnapshot<T>> {
  const plan = buildPlan(source)
  const { data, error } = await getSupabase().rpc("doc_query", rpcArgs(plan))

  if (error) fail(`Could not query ${plan.table}`, error)

  const rows = (data ?? []) as Row[]
  return new QuerySnapshot<T>(
    rows.map((row) => {
      const ref: DocumentReference<T> = {
        type: "document",
        id: row.id,
        path: `${plan.table}/${row.id}`,
        __ref: { table: plan.table, id: row.id, parentId: plan.parentId, path: plan.table },
      }
      return new QueryDocumentSnapshot<T>(row.id, ref, row)
    }),
  )
}

/** Firestore returned `{ data: () => ({ count }) }`; kept so call sites match. */
export async function getCountFromServer(
  source: CollectionReference | Query,
): Promise<{ data: () => { count: number } }> {
  const plan = buildPlan(source)
  const { data, error } = await getSupabase().rpc("doc_query", rpcArgs(plan, true))

  if (error) fail(`Could not count ${plan.table}`, error)
  const count = Number((data as { total?: number }[] | null)?.[0]?.total ?? 0)
  return { data: () => ({ count }) }
}

/* ---------------------------------------------------------------------- writes */

interface PatchArgs {
  p_table: string
  p_id: string | null
  p_parent: string | null
  p_set: Record<string, unknown>
  p_ops: unknown[]
  p_replace: boolean
  p_expected_version: number | null
  p_require_exists: boolean
}

function patchArgs(
  ref: Ref,
  payload: Record<string, unknown>,
  opts: { replace?: boolean; expectedVersion?: number | null; requireExists?: boolean } = {},
): PatchArgs {
  const { set, ops } = splitPatch(payload)
  return {
    p_table: ref.table,
    p_id: ref.id,
    p_parent: ref.parentId,
    p_set: set,
    p_ops: ops,
    p_replace: opts.replace ?? false,
    p_expected_version: opts.expectedVersion ?? null,
    p_require_exists: opts.requireExists ?? false,
  }
}

async function runPatch(context: string, args: PatchArgs): Promise<Row> {
  const { data, error } = await getSupabase().rpc("doc_patch", args)
  if (error) fail(context, error)
  const row = (data as Row[] | null)?.[0]
  if (!row) fail(context, { message: "the write returned no row" })
  return row
}

/** `setDoc(ref, data)` replaces; `setDoc(ref, data, { merge: true })` merges. */
export async function setDoc<T extends DocumentData>(
  ref: DocumentReference<T>,
  data: T,
  options: { merge?: boolean } = {},
): Promise<void> {
  await runPatch(`Could not write ${ref.path}`, patchArgs(ref.__ref, data, { replace: !options.merge }))
}

export async function addDoc<T extends DocumentData>(
  ref: CollectionReference<T>,
  data: T,
): Promise<DocumentReference<T>> {
  const row = await runPatch(`Could not add to ${ref.path}`, patchArgs({ ...ref.__ref, id: null }, data))
  return {
    type: "document",
    id: row.id,
    path: `${ref.path}/${row.id}`,
    __ref: { ...ref.__ref, id: row.id },
  }
}

export async function updateDoc<T extends DocumentData>(
  ref: DocumentReference<T>,
  patch: Record<string, unknown>,
): Promise<void>
/**
 * Firestore's second form: `updateDoc(ref, field, value, field2, value2, …)`.
 * A `FieldPath` stringifies to a dotted key, which is what the SQL side splits on,
 * so both forms end up as the same patch.
 */
export async function updateDoc<T extends DocumentData>(
  ref: DocumentReference<T>,
  field: string | FieldPath,
  value: unknown,
  ...more: unknown[]
): Promise<void>
export async function updateDoc<T extends DocumentData>(
  ref: DocumentReference<T>,
  patchOrField: Record<string, unknown> | string | FieldPath,
  ...rest: unknown[]
): Promise<void> {
  let patch: Record<string, unknown>

  if (typeof patchOrField === "string" || patchOrField instanceof FieldPath) {
    const pairs = [patchOrField, ...rest]
    if (pairs.length % 2 !== 0) {
      throw new Error(`updateDoc(${ref.path}) was given a field with no value.`)
    }
    patch = {}
    for (let i = 0; i < pairs.length; i += 2) {
      patch[String(pairs[i])] = pairs[i + 1]
    }
  } else {
    patch = patchOrField
  }

  await runPatch(`Could not update ${ref.path}`, patchArgs(ref.__ref, patch, { requireExists: true }))
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  const { error } = await getSupabase().from(ref.__ref.table).delete().eq("id", ref.id)
  if (error) fail(`Could not delete ${ref.path}`, error)
}

/* ----------------------------------------------------------------- transactions */

export interface Transaction {
  get<T = DocumentData>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>>
  set<T extends DocumentData>(ref: DocumentReference<T>, data: T, options?: { merge?: boolean }): Transaction
  update<T extends DocumentData>(ref: DocumentReference<T>, patch: Record<string, unknown>): Transaction
  delete(ref: DocumentReference): Transaction
}

const CONFLICT = "40001"
const MAX_ATTEMPTS = 5

/**
 * Optimistic where Firestore's was pessimistic: the callback reads, computes and
 * buffers writes, then each write commits with an assertion on the version it
 * read. A concurrent writer bumps that version, the assert fails with
 * serialization_failure, and the whole callback re-runs against fresh data.
 *
 * The callback must therefore be side-effect free apart from its transaction
 * writes — it can run more than once. That was already true under Firestore.
 */
export async function runTransaction<T>(
  _db: unknown,
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const versions = new Map<string, number | null>()
    const writes: Array<() => Promise<unknown>> = []

    const transaction: Transaction = {
      async get(ref) {
        const snap = await getDoc(ref)
        versions.set(ref.path, snap.__version)
        return snap
      },
      set(ref, data, options = {}) {
        writes.push(() =>
          runPatch(
            `Could not write ${ref.path}`,
            patchArgs(ref.__ref, data, {
              replace: !options.merge,
              expectedVersion: versions.get(ref.path) ?? null,
            }),
          ),
        )
        return transaction
      },
      update(ref, patch) {
        writes.push(() =>
          runPatch(
            `Could not update ${ref.path}`,
            patchArgs(ref.__ref, patch, {
              expectedVersion: versions.get(ref.path) ?? null,
              requireExists: true,
            }),
          ),
        )
        return transaction
      },
      delete(ref) {
        writes.push(() => deleteDoc(ref))
        return transaction
      },
    }

    try {
      const result = await callback(transaction)
      for (const write of writes) await write()
      return result
    } catch (error) {
      const conflict =
        error instanceof Error && (error.message.includes(CONFLICT) || error.message.includes("changed under this transaction"))
      if (!conflict || attempt >= MAX_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }
}

/* -------------------------------------------------------------------- realtime */

export type Unsubscribe = () => void

/**
 * Supabase Realtime in place of Firestore snapshots.
 *
 * Firestore streamed per-document deltas; Postgres logical replication gives a
 * change notification, so this re-runs the query when the table changes. The two
 * call sites (the messages screen) both re-render from the whole snapshot
 * anyway, so the observable behaviour is the same — one extra round trip per
 * change, against a query that is already limited and indexed.
 *
 * Realtime respects RLS, so a listener only ever sees rows the user could read.
 */
export function onSnapshot<T = DocumentData>(
  target: DocumentReference<T>,
  onNext: (snapshot: DocumentSnapshot<T>) => void,
  onError?: (error: Error) => void,
): Unsubscribe
export function onSnapshot<T = DocumentData>(
  target: CollectionReference<T> | Query<T>,
  onNext: (snapshot: QuerySnapshot<T>) => void,
  onError?: (error: Error) => void,
): Unsubscribe
export function onSnapshot<T = DocumentData>(
  target: DocumentReference<T> | CollectionReference<T> | Query<T>,
  onNext: (snapshot: any) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const ref = target.__ref
  const isDoc = target.type === "document"
  let closed = false
  let pending: ReturnType<typeof setTimeout> | null = null

  const read = async () => {
    if (closed) return
    try {
      const snapshot = isDoc
        ? await getDoc(target as DocumentReference<T>)
        : await getDocs(target as Query<T>)
      if (!closed) onNext(snapshot)
    } catch (error) {
      if (!closed) onError?.(error instanceof Error ? error : new Error(String(error)))
    }
  }

  // Coalesce bursts — a conversation receiving three messages at once should
  // cost one re-read, not three.
  const schedule = () => {
    if (pending) clearTimeout(pending)
    pending = setTimeout(read, 60)
  }

  void read()

  const channel = getSupabase()
    .channel(`aerolearn:${ref.table}:${ref.parentId ?? ref.id ?? "all"}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: ref.table,
        ...(isDoc
          ? { filter: `id=eq.${ref.id}` }
          : ref.parentId
            ? { filter: `parent_id=eq.${ref.parentId}` }
            : {}),
      },
      schedule,
    )
    .subscribe()

  return () => {
    closed = true
    if (pending) clearTimeout(pending)
    void getSupabase().removeChannel(channel)
  }
}







