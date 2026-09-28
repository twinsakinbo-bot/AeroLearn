/**
 * The Firebase-Admin-SDK-shaped API, backed by Supabase with the service role.
 *
 * Replaces lib/firebase-admin.ts. The admin SDK's shape differs from the client
 * SDK's — chained builders (`db.collection("users").doc(uid).get()`) and
 * `snapshot.exists` as a *property* rather than a method — so the 11 route
 * handlers that used it need this rather than lib/db.ts.
 *
 * The service role bypasses row-level security, exactly as the Firebase service
 * account bypassed firestore.rules. Authorisation still happens in
 * lib/api-auth.ts before any of this runs.
 */
import "server-only"

import { getSupabaseAdmin } from "@/lib/supabase/admin"
import {
  Timestamp,
  decode,
  encode,
  kindOf,
  makeSentinel,
  resolveRef,
  splitPatch,
  type QueryFilter,
  type QueryOrder,
  type Ref,
  type WhereOp,
} from "@/lib/supabase/documents"

export { Timestamp }
export type DocumentData = Record<string, any>

/** The admin SDK's `FieldValue`. Same sentinels as lib/db.ts, different name. */
export const FieldValue = {
  serverTimestamp: () => makeSentinel("serverTimestamp") as unknown as Timestamp,
  increment: (n: number) => makeSentinel("increment", n) as unknown as number,
  arrayUnion: (...v: unknown[]) => makeSentinel("arrayUnion", v) as unknown as any[],
  arrayRemove: (...v: unknown[]) => makeSentinel("arrayRemove", v) as unknown as any[],
  delete: () => makeSentinel("delete") as unknown as any,
}

interface Row {
  id: string
  data: Record<string, unknown>
  version: number | null
}

function fail(context: string, error: { message?: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown Supabase error"}`)
}

/* ---------------------------------------------------------------- snapshots */

export class AdminDocumentSnapshot<T = DocumentData> {
  /** A property, not a method — this is the admin SDK's shape. */
  readonly exists: boolean
  /** @internal */ readonly __version: number | null
  /** @internal */ readonly __raw: Record<string, unknown> | undefined
  private readonly decoded: T | undefined

  constructor(
    readonly id: string,
    readonly ref: AdminDocumentReference<T>,
    row: Row | null,
  ) {
    this.exists = row !== null
    this.__version = row?.version ?? null
    this.__raw = row?.data
    this.decoded = row ? (decode(row.data) as T) : undefined
  }

  data(): T | undefined {
    return this.decoded
  }

  get(field: string): unknown {
    return field.split(".").reduce<any>((a, k) => (a == null ? a : a[k]), this.decoded)
  }
}

/**
 * A row returned by a query, where the document is known to exist. The admin SDK
 * narrows `data()` to non-optional here, and call sites iterating `.docs` depend
 * on it — `snapshot.docs.map(d => d.data().email)` with no guard.
 */
export class AdminQueryDocumentSnapshot<T = DocumentData> extends AdminDocumentSnapshot<T> {
  override data(): T {
    return super.data() as T
  }
}

export class AdminQuerySnapshot<T = DocumentData> {
  constructor(readonly docs: AdminQueryDocumentSnapshot<T>[]) {}
  get empty(): boolean {
    return this.docs.length === 0
  }
  get size(): number {
    return this.docs.length
  }
  forEach(cb: (doc: AdminQueryDocumentSnapshot<T>) => void): void {
    this.docs.forEach(cb)
  }
}

/* ------------------------------------------------------------------ queries */

interface Spec {
  table: string
  parentId: string | null
  filters: QueryFilter[]
  orders: QueryOrder[]
  limit: number | null
  after: [unknown, string] | null
}

function rpcArgs(spec: Spec, countOnly = false) {
  return {
    p_table: spec.table,
    p_parent: spec.parentId,
    p_filters: spec.filters,
    p_orders: spec.orders,
    p_limit: spec.limit,
    p_after: spec.after ? { v: spec.after[0] ?? null, id: spec.after[1] } : null,
    p_count_only: countOnly,
  }
}

/**
 * `.where().orderBy().limit().get()`. Every builder method returns a new query
 * rather than mutating, matching the admin SDK — routes reuse a base query and
 * branch off it (see app/api/import-questions/route.ts).
 */
export class AdminQuery<T = DocumentData> {
  /** @internal */ constructor(readonly __spec: Spec) {}

  private derive(patch: Partial<Spec>): AdminQuery<T> {
    return new AdminQuery<T>({ ...this.__spec, ...patch })
  }

  where(field: string, op: WhereOp, value: unknown): AdminQuery<T> {
    return this.derive({
      filters: [...this.__spec.filters, { f: field, op, v: encode(value), k: kindOf(value) }],
    })
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc"): AdminQuery<T> {
    return this.derive({ orders: [...this.__spec.orders, { f: field, dir }] })
  }

  limit(count: number): AdminQuery<T> {
    return this.derive({ limit: count })
  }

  /**
   * Keyset pagination. The cursor value comes from the snapshot's *stored* jsonb
   * so SQL compares like against like; one orderBy, which is all the callers use.
   */
  startAfter(cursor: AdminDocumentSnapshot<any>): AdminQuery<T> {
    const field = this.__spec.orders[0]?.f
    return this.derive({ after: [field ? cursor.__raw?.[field] : null, cursor.id] })
  }

  async get(): Promise<AdminQuerySnapshot<T>> {
    const { data, error } = await getSupabaseAdmin().rpc("doc_query", rpcArgs(this.__spec))
    if (error) fail(`Could not query ${this.__spec.table}`, error)

    const rows = (data ?? []) as Row[]
    return new AdminQuerySnapshot<T>(
      rows.map((row) => {
        const ref = new AdminDocumentReference<T>({
          table: this.__spec.table,
          id: row.id,
          parentId: this.__spec.parentId,
          path: `${this.__spec.table}/${row.id}`,
        })
        return new AdminQueryDocumentSnapshot<T>(row.id, ref, row)
      }),
    )
  }

  /** Firestore's aggregate query. Kept for shape; no admin call site uses it. */
  async count(): Promise<{ get: () => Promise<{ data: () => { count: number } }> }> {
    const run = async () => {
      const { data, error } = await getSupabaseAdmin().rpc("doc_query", rpcArgs(this.__spec, true))
      if (error) fail(`Could not count ${this.__spec.table}`, error)
      const count = Number((data as { total?: number }[] | null)?.[0]?.total ?? 0)
      return { data: () => ({ count }) }
    }
    return { get: run }
  }
}

/* --------------------------------------------------------------------- writes */

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
  const { data, error } = await getSupabaseAdmin().rpc("doc_patch", args)
  if (error) fail(context, error)
  const row = (data as Row[] | null)?.[0]
  if (!row) fail(context, { message: "the write returned no row" })
  return row
}

/* ------------------------------------------------------------------- doc refs */

export class AdminDocumentReference<T = DocumentData> {
  readonly id: string
  readonly path: string
  /** @internal */ readonly __ref: Ref

  constructor(ref: Ref) {
    this.__ref = ref
    this.id = ref.id ?? ""
    this.path = ref.path
  }

  async get(): Promise<AdminDocumentSnapshot<T>> {
    const { data, error } = await getSupabaseAdmin()
      .from(this.__ref.table)
      .select("id, data, version")
      .eq("id", this.id)
      .maybeSingle()

    if (error) fail(`Could not read ${this.path}`, error)
    return new AdminDocumentSnapshot<T>(this.id, this, (data as Row | null) ?? null)
  }

  async set(data: Record<string, unknown>, options: { merge?: boolean } = {}): Promise<void> {
    await runPatch(
      `Could not write ${this.path}`,
      patchArgs(this.__ref, data, { replace: !options.merge }),
    )
  }

  async update(patch: Record<string, unknown>): Promise<void> {
    await runPatch(
      `Could not update ${this.path}`,
      patchArgs(this.__ref, patch, { requireExists: true }),
    )
  }

  async delete(): Promise<void> {
    const { error } = await getSupabaseAdmin().from(this.__ref.table).delete().eq("id", this.id)
    if (error) fail(`Could not delete ${this.path}`, error)
  }

  /** Subcollections — `conversations/{id}/messages` is the only one. */
  collection(name: string): AdminCollectionReference {
    const ref = resolveRef([this.__ref.table, this.id, name])
    return new AdminCollectionReference(ref)
  }
}

/* ------------------------------------------------------------ collection refs */

export class AdminCollectionReference<T = DocumentData> extends AdminQuery<T> {
  readonly id: string
  readonly path: string
  /** @internal */ readonly __collection: Ref

  constructor(ref: Ref) {
    super({ table: ref.table, parentId: ref.parentId, filters: [], orders: [], limit: null, after: null })
    this.__collection = ref
    this.id = ref.table
    this.path = ref.path
  }

  /** `.doc(id)`, or `.doc()` for a generated id — the admin SDK allows both. */
  doc(id?: string): AdminDocumentReference<T> {
    const docId = id ?? crypto.randomUUID()
    return new AdminDocumentReference<T>({
      ...this.__collection,
      id: docId,
      path: `${this.__collection.path}/${docId}`,
    })
  }

  async add(data: Record<string, unknown>): Promise<AdminDocumentReference<T>> {
    const row = await runPatch(
      `Could not add to ${this.path}`,
      patchArgs({ ...this.__collection, id: null }, data),
    )
    return new AdminDocumentReference<T>({
      ...this.__collection,
      id: row.id,
      path: `${this.__collection.path}/${row.id}`,
    })
  }
}

/* ------------------------------------------------------------------- batches */

/** How many writes of a batch are in flight at once during bulk imports. */
const BATCH_CONCURRENCY = 25

/**
 * Firestore's `WriteBatch`. One difference worth knowing: Firestore committed all
 * 500 writes atomically, whereas this issues them as independent statements, so a
 * failure part-way leaves the earlier writes applied. Every call site is a bulk
 * import that already reports per-row results, so it surfaces there rather than
 * silently. Firestore forbade two writes to the same document in one batch, so
 * running them concurrently cannot reorder anything a caller could depend on.
 */
export class AdminWriteBatch {
  private readonly writes: Array<() => Promise<unknown>> = []

  set(ref: AdminDocumentReference<any>, data: Record<string, unknown>, options: { merge?: boolean } = {}): this {
    this.writes.push(() => ref.set(data, options))
    return this
  }

  update(ref: AdminDocumentReference<any>, patch: Record<string, unknown>): this {
    this.writes.push(() => ref.update(patch))
    return this
  }

  delete(ref: AdminDocumentReference<any>): this {
    this.writes.push(() => ref.delete())
    return this
  }

  async commit(): Promise<void> {
    for (let i = 0; i < this.writes.length; i += BATCH_CONCURRENCY) {
      await Promise.all(this.writes.slice(i, i + BATCH_CONCURRENCY).map((write) => write()))
    }
  }
}

/* -------------------------------------------------------------- transactions */

export interface AdminTransaction {
  get<T = DocumentData>(ref: AdminDocumentReference<T>): Promise<AdminDocumentSnapshot<T>>
  set<T>(ref: AdminDocumentReference<T>, data: Record<string, unknown>, options?: { merge?: boolean }): AdminTransaction
  update<T>(ref: AdminDocumentReference<T>, patch: Record<string, unknown>): AdminTransaction
  delete(ref: AdminDocumentReference<any>): AdminTransaction
}

const CONFLICT = "40001"
const MAX_ATTEMPTS = 5

/**
 * Optimistic where Firestore's was pessimistic — the same design as
 * runTransaction() in lib/db.ts, and for the same reason: reads record the row
 * version, each write asserts on it, and a concurrent writer makes the assert
 * fail so the whole callback re-runs against fresh data. The callback must be
 * free of side effects other than its writes, which was already true under
 * Firestore.
 */
export class AdminFirestore {
  collection(name: string): AdminCollectionReference {
    return new AdminCollectionReference(resolveRef([name]))
  }

  doc(path: string): AdminDocumentReference {
    return new AdminDocumentReference(resolveRef(path.split("/")))
  }

  batch(): AdminWriteBatch {
    return new AdminWriteBatch()
  }

  async runTransaction<T>(callback: (transaction: AdminTransaction) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const versions = new Map<string, number | null>()
      const writes: Array<() => Promise<unknown>> = []

      const transaction: AdminTransaction = {
        async get(ref) {
          const snap = await ref.get()
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
          writes.push(() => ref.delete())
          return transaction
        },
      }

      try {
        const result = await callback(transaction)
        for (const write of writes) await write()
        return result
      } catch (error) {
        const conflict =
          error instanceof Error &&
          (error.message.includes(CONFLICT) || error.message.includes("changed under this transaction"))
        if (!conflict || attempt >= MAX_ATTEMPTS) throw error
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
      }
    }
  }
}

/* ----------------------------------------------------------------- admin auth */

/** What the routes actually read off a verified token. */
export interface DecodedIdToken {
  uid: string
  email?: string
  email_verified?: boolean
  name?: string
  picture?: string
  [claim: string]: unknown
}

export interface AdminUserRecord {
  uid: string
  email?: string
  emailVerified: boolean
  displayName?: string
}

class AdminAuth {
  /**
   * Firebase verified the token's signature offline against Google's public keys.
   * Supabase has no offline equivalent, so this asks the auth server, which also
   * catches a token whose user was deleted or banned since it was issued — a case
   * Firebase's offline check missed until the token expired.
   */
  async verifyIdToken(token: string): Promise<DecodedIdToken> {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token)
    if (error || !data.user) throw new Error(error?.message ?? "The session token is not valid.")

    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
    return {
      uid: data.user.id,
      email: data.user.email ?? undefined,
      email_verified: Boolean(data.user.email_confirmed_at ?? data.user.confirmed_at),
      name: (meta.full_name as string) ?? (meta.name as string) ?? undefined,
      picture: (meta.avatar_url as string) ?? (meta.picture as string) ?? undefined,
    }
  }

  private async link(
    type: "recovery" | "magiclink",
    email: string,
    redirectTo?: string,
  ): Promise<string> {
    const { data, error } = await getSupabaseAdmin().auth.admin.generateLink({
      type,
      email,
      options: redirectTo ? { redirectTo } : undefined,
    })
    const url = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link
    if (error || !url) throw new Error(error?.message ?? "Could not generate the link.")
    return url
  }

  generatePasswordResetLink(email: string, settings?: { url?: string }): Promise<string> {
    return this.link("recovery", email, settings?.url)
  }

  /**
   * Supabase's `signup` link type needs the password, which the server does not
   * have, so this issues a magic link instead: following it confirms the address
   * and signs the student in, which is what the confirmation email is for.
   */
  generateEmailVerificationLink(email: string, settings?: { url?: string }): Promise<string> {
    return this.link("magiclink", email, settings?.url)
  }

  async updateUser(
    uid: string,
    changes: { password?: string; email?: string; displayName?: string; emailVerified?: boolean },
  ): Promise<AdminUserRecord> {
    const payload: Record<string, unknown> = {}
    if (changes.password !== undefined) payload.password = changes.password
    if (changes.email !== undefined) payload.email = changes.email
    if (changes.emailVerified !== undefined) payload.email_confirm = changes.emailVerified
    if (changes.displayName !== undefined) payload.user_metadata = { full_name: changes.displayName }

    const { data, error } = await getSupabaseAdmin().auth.admin.updateUserById(uid, payload)
    if (error || !data.user) throw new Error(error?.message ?? "Could not update the account.")
    return toRecord(data.user)
  }

  async getUser(uid: string): Promise<AdminUserRecord> {
    const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(uid)
    if (error || !data.user) throw new Error(error?.message ?? "No such account.")
    return toRecord(data.user)
  }

  /** Deleting the auth user fires the trigger that removes the profile row. */
  async deleteUser(uid: string): Promise<void> {
    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(uid)
    if (error) throw new Error(error.message)
  }
}

function toRecord(user: { id: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null; user_metadata?: Record<string, unknown> | null }): AdminUserRecord {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  return {
    uid: user.id,
    email: user.email ?? undefined,
    emailVerified: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    displayName: (meta.full_name as string) ?? (meta.name as string) ?? undefined,
  }
}

/* ---------------------------------------------------------------- entry points */

let firestore: AdminFirestore | null = null
let adminAuth: AdminAuth | null = null

/** Was `getAdminDb()` over firebase-admin/firestore. */
export function getAdminDb(): AdminFirestore {
  firestore ??= new AdminFirestore()
  return firestore
}

/** Was `getAdminAuth()` over firebase-admin/auth. */
export function getAdminAuth(): AdminAuth {
  adminAuth ??= new AdminAuth()
  return adminAuth
}

/**
 * There is no Supabase equivalent of an "app" handle — the two clients are built
 * from env vars directly. Kept so the deprecated lib/firebase-admin.ts re-export
 * still resolves; nothing calls it.
 */
export function getAdminApp(): { name: string } {
  return { name: "aerolearn" }
}

/** Receipts moved to Supabase Storage; server-side access goes through the SDK. */
export function getAdminBucket(): never {
  throw new Error(
    "getAdminBucket() is gone with Firebase. Use getSupabaseAdmin().storage.from(\"receipts\").",
  )
}

/** `admin.firestore()` / `admin.auth()`, for the one file that used the default export. */
const admin = {
  getAdminApp,
  getAdminDb,
  getAdminAuth,
  getAdminBucket,
  firestore: () => getAdminDb(),
  auth: () => getAdminAuth(),
}

export default admin

export type { AdminAuth, AdminFirestore as Firestore }
