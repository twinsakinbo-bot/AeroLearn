/**
 * Shared primitives for the document store that replaced Firestore.
 *
 * Every former Firestore collection is a Postgres table of the shape
 *
 *   id text primary key, parent_id text, data jsonb, version bigint,
 *   created_at timestamptz, updated_at timestamptz
 *
 * so document shapes carry over unchanged and the ~300 existing call sites keep
 * working. `lib/db.ts` (browser) and `lib/db-admin.ts` (service role) both build
 * on what is here; anything type- or encoding-related lives in this file only,
 * so the two shims cannot drift apart.
 *
 * Reads and writes that need type-correct comparison go through the SQL
 * functions in supabase/migrations/0001_init.sql rather than being assembled as
 * PostgREST filters. `data->>'xp'` is *text*, so `order by` on it would sort 9
 * after 10; the SQL side casts per declared type instead.
 */

/* ------------------------------------------------------------------ tables */

/** The 13 collections the app actually uses, plus the one subcollection. */
const TABLES = new Set([
  "users",
  "public_profiles",
  "lessons",
  "practice_questions",
  "conversations",
  "messages",
  "challenges",
  "challenge_results",
  "verification_requests",
  "licence_codes",
  "quiz_results",
  "homework",
  "homework_submissions",
  "notes",
  "reports",
  "settings",
])

/** `practiceQuestions` -> `practice_questions`. */
export function toTableName(collectionName: string): string {
  return collectionName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()
}

/**
 * A resolved location in the store. Firestore paths are alternating
 * collection/document segments; the app only ever uses `c/d` and
 * `conversations/{id}/messages`, so a parent id is enough to model the one
 * subcollection — no recursive path handling needed.
 */
export interface Ref {
  /** Postgres table name. */
  table: string
  /** Document id, or null for a collection reference. */
  id: string | null
  /** Owning document id when this is a subcollection. */
  parentId: string | null
  /** The original Firestore-style path, for error messages. */
  path: string
}

/**
 * Turn `("conversations", "abc", "messages")` into a collection ref on
 * `messages` scoped to parent `abc`, and `("users", uid)` into a document ref.
 */
export function resolveRef(segments: string[]): Ref {
  const parts = segments.filter((s) => s !== undefined && s !== null).map(String)
  if (parts.length === 0) throw new Error("A document path needs at least a collection name.")

  const path = parts.join("/")
  let table: string
  let id: string | null = null
  let parentId: string | null = null

  if (parts.length <= 2) {
    table = toTableName(parts[0])
    id = parts[1] ?? null
  } else if (parts.length === 3) {
    // collection / documentId / subcollection
    table = toTableName(parts[2])
    parentId = parts[1]
  } else if (parts.length === 4) {
    // collection / documentId / subcollection / documentId
    table = toTableName(parts[2])
    parentId = parts[1]
    id = parts[3]
  } else {
    throw new Error(`Path "${path}" is nested deeper than this store supports.`)
  }

  if (!TABLES.has(table)) {
    throw new Error(
      `"${table}" is not a known table (from path "${path}"). Add it to TABLES here and to ` +
        `supabase/migrations/0001_init.sql, then re-run the migration.`,
    )
  }

  return { table, id, parentId, path }
}

/* --------------------------------------------------------------- timestamps */

const TS_MARKER = "__ts"

/**
 * Stand-in for Firestore's `Timestamp`. Keeps `seconds` and `toDate()`, which
 * are the two things call sites read, and serialises to
 * `{ __ts: { s, n } }` in jsonb — a shape no application field can collide with.
 */
export class Timestamp {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number = 0,
  ) {}

  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now())
  }

  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime())
  }

  static fromMillis(millis: number): Timestamp {
    return new Timestamp(Math.floor(millis / 1000), (millis % 1000) * 1e6)
  }

  toDate(): Date {
    return new Date(this.toMillis())
  }

  toMillis(): number {
    return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6)
  }

  toJSON() {
    return { [TS_MARKER]: { s: this.seconds, n: this.nanoseconds } }
  }

  isEqual(other: Timestamp): boolean {
    return this.seconds === other.seconds && this.nanoseconds === other.nanoseconds
  }
}

function isTimestampMarker(value: unknown): value is { __ts: { s: number; n: number } } {
  return (
    typeof value === "object" &&
    value !== null &&
    TS_MARKER in value &&
    typeof (value as Record<string, unknown>)[TS_MARKER] === "object"
  )
}

/* ------------------------------------------------------------ field sentinels */

export const SENTINEL = Symbol.for("aerolearn.sentinel")

export type SentinelOp = "serverTimestamp" | "increment" | "arrayUnion" | "arrayRemove" | "delete"

export interface Sentinel {
  [SENTINEL]: SentinelOp
  operand?: unknown
}

export function makeSentinel(op: SentinelOp, operand?: unknown): Sentinel {
  return { [SENTINEL]: op, operand }
}

export function isSentinel(value: unknown): value is Sentinel {
  return typeof value === "object" && value !== null && SENTINEL in value
}

/* ------------------------------------------------------------ encode / decode */

/**
 * JS value -> something `JSON.stringify` will render the way Postgres should
 * store it. `undefined` is dropped rather than written as null, matching
 * Firestore's `ignoreUndefinedProperties` behaviour the app was relying on.
 */
export function encode(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toJSON()
  if (value instanceof Date) return Timestamp.fromDate(value).toJSON()
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map(encode)
  if (value && typeof value === "object") {
    if (isSentinel(value)) {
      throw new Error("A field sentinel reached encode(); split the patch with splitPatch() first.")
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = encode(v)
    }
    return out
  }
  return value
}

/** The inverse: revive stored timestamp markers as `Timestamp` instances. */
export function decode(value: unknown): unknown {
  if (isTimestampMarker(value)) {
    const { s, n } = value[TS_MARKER]
    return new Timestamp(Number(s) || 0, Number(n) || 0)
  }
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = decode(v)
    return out
  }
  return value
}

/* --------------------------------------------------------------- patch split */

export interface PatchOp {
  /** Field name. Dotted paths are supported by the SQL side. */
  f: string
  op: SentinelOp
  v?: unknown
}

/**
 * Separate a Firestore-style update object into the plain fields to merge and
 * the sentinel operations to apply on top. The SQL function runs both in one
 * statement, so `increment` really is atomic rather than read-then-write.
 */
export function splitPatch(patch: Record<string, unknown>): {
  set: Record<string, unknown>
  ops: PatchOp[]
} {
  const set: Record<string, unknown> = {}
  const ops: PatchOp[] = []

  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (isSentinel(value)) {
      const op = value[SENTINEL]
      ops.push({ f: field, op, v: op === "delete" ? undefined : encode(value.operand) })
    } else {
      set[field] = encode(value)
    }
  }

  return { set, ops }
}

/* ------------------------------------------------------------------ queries */

export type WhereOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "array-contains" | "in" | "not-in"

/** How the SQL side should cast `data->>field` before comparing. */
export type ValueKind = "text" | "number" | "bool" | "ts" | "json"

export function kindOf(value: unknown): ValueKind {
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "bool"
  if (value instanceof Timestamp || value instanceof Date) return "ts"
  if (value === null || typeof value === "string") return "text"
  return "json"
}

export interface QueryFilter {
  f: string
  op: WhereOp
  /** Already `encode`d. */
  v: unknown
  k: ValueKind
}

export interface QueryOrder {
  f: string
  dir: "asc" | "desc"
}

/**
 * Everything `doc_query` needs. Deliberately a plain JSON payload rather than a
 * chain of PostgREST calls: ordering and range comparison have to know whether
 * a jsonb field holds a number, a timestamp marker or a string, and only the
 * SQL side can see the stored value to decide.
 */
export interface QueryPlan {
  table: string
  parentId: string | null
  filters: QueryFilter[]
  orders: QueryOrder[]
  /** Null means no limit. */
  limit: number | null
  /** Keyset cursor: the ordered field values of the last row of the previous page. */
  after: unknown[] | null
}

export function emptyPlan(table: string, parentId: string | null): QueryPlan {
  return { table, parentId, filters: [], orders: [], limit: null, after: null }
}

/** Firestore ops that Postgres expresses with a different token. */
export const OP_SQL: Record<WhereOp, string> = {
  "==": "=",
  "!=": "<>",
  "<": "<",
  "<=": "<=",
  ">": ">",
  ">=": ">=",
  "array-contains": "@>",
  in: "in",
  "not-in": "not in",
}
