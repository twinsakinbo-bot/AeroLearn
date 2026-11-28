import { isUuid } from "./contracts";
export interface SchoolChoice {
  id: string;
  name: string;
  active?: boolean;
}
export interface SchoolEntitlement {
  namespace: "institutional_revision";
  institution_id: string;
  term_id: string;
  grant_id: string;
  cohort_id: string;
  expires_at: string;
  capabilities: ["formative_mock"];
}
export interface LicenseTerm {
  id: string;
  cohort_id: string;
  renewal_of: string | null;
  starts_at: string;
  ends_at: string;
  seat_cap: number;
  quoted_minor: number;
  state: "draft" | "approved" | "active" | "suspended" | "cancelled";
  effective_state: string;
  approval_ref: string | null;
  assigned: number;
  reserved: number;
  available: number;
  frozen: number;
  suspended: number;
}
export interface LicenseBatch {
  id: string;
  term_id: string;
  quantity: number;
  code_expires_at: string;
  cancelled_at: string | null;
}
export interface LicenseGrant {
  id: string;
  term_id: string;
  seat_id: string;
  membership_id: string | null;
  alias: string | null;
  state: "active" | "suspended" | "revoked";
}
export interface LicenseEvent {
  id: string;
  action: string;
  target_id: string;
  term_id: string;
  reason: string | null;
  occurred_at: string;
}
export interface LicenseContext {
  institution_active: boolean;
  operator: boolean;
  role: string | null;
  entitlement: SchoolEntitlement | null;
  cohorts: SchoolChoice[];
  terms?: LicenseTerm[];
  batches?: LicenseBatch[];
  grants?: LicenseGrant[];
  events?: LicenseEvent[];
  list_limit?: number;
}
export type LicensingCommand =
  | {
      action: "draft_term";
      institution_id: string;
      payload: {
        id: string;
        cohort_id: string;
        starts_at: string;
        ends_at: string;
        seat_cap: number;
        quoted_minor: number;
        renewal_of: string | null;
      };
    }
  | {
      action: "approve_term";
      institution_id: string;
      payload: { id: string; approval_ref: string };
    }
  | { action: "activate_term"; institution_id: string; payload: { id: string } }
  | {
      action: "issue_batch";
      institution_id: string;
      payload: {
        id: string;
        term_id: string;
        quantity: number;
        expires_at: string;
      };
    }
  | {
      action:
        | "cancel_term"
        | "suspend_term"
        | "resume_term"
        | "cancel_batch"
        | "suspend_grant"
        | "resume_grant"
        | "release_seat";
      institution_id: string;
      payload: { id: string; reason: string };
    }
  | {
      action: "revoke_grant";
      institution_id: string;
      payload: { id: string; reason: string; reclaim: boolean };
    }
  | { action: "redeem"; institution_id: string; payload: { code: string } };
export interface LicensingResult {
  id: string;
  replayed?: boolean;
  state?: string;
  message?: string;
  codes?: { seat_id: string; code: string }[];
  expires_at?: string;
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const exact = (o: Record<string, unknown>, ks: string[]) =>
  Object.keys(o).length === ks.length &&
  ks.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const text = (v: unknown, min: number, max: number) =>
  typeof v === "string" &&
  v.trim().length >= min &&
  v.length <= max &&
  !/[\x00-\x1f]/.test(v);
const date = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
const integer = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
export function parseLicensingCommand(v: unknown): LicensingCommand | null {
  if (
    !object(v) ||
    !exact(v, ["action", "institution_id", "payload"]) ||
    !isUuid(v.institution_id) ||
    !object(v.payload)
  )
    return null;
  const p = v.payload;
  let valid = false;
  switch (v.action) {
    case "draft_term":
      valid =
        exact(p, [
          "id",
          "cohort_id",
          "starts_at",
          "ends_at",
          "seat_cap",
          "quoted_minor",
          "renewal_of",
        ]) &&
        isUuid(p.id) &&
        isUuid(p.cohort_id) &&
        date(p.starts_at) &&
        date(p.ends_at) &&
        integer(p.seat_cap, 1, 5000) &&
        integer(p.quoted_minor, 0, 100000000000) &&
        (p.renewal_of === null || isUuid(p.renewal_of));
      break;
    case "approve_term":
      valid =
        exact(p, ["id", "approval_ref"]) &&
        isUuid(p.id) &&
        typeof p.approval_ref === "string" &&
        p.approval_ref.length >= 3 &&
        p.approval_ref.length <= 80 &&
        /^[A-Za-z0-9._:/ \t\r\n\f\v-]+$/.test(p.approval_ref);
      break;
    case "activate_term":
      valid = exact(p, ["id"]) && isUuid(p.id);
      break;
    case "issue_batch":
      valid =
        exact(p, ["id", "term_id", "quantity", "expires_at"]) &&
        isUuid(p.id) &&
        isUuid(p.term_id) &&
        integer(p.quantity, 1, 100) &&
        date(p.expires_at);
      break;
    case "cancel_term":
    case "suspend_term":
    case "resume_term":
    case "cancel_batch":
    case "suspend_grant":
    case "resume_grant":
    case "release_seat":
      valid =
        exact(p, ["id", "reason"]) && isUuid(p.id) && text(p.reason, 3, 160);
      break;
    case "revoke_grant":
      valid =
        exact(p, ["id", "reason", "reclaim"]) &&
        isUuid(p.id) &&
        text(p.reason, 3, 160) &&
        typeof p.reclaim === "boolean";
      break;
    case "redeem":
      valid =
        exact(p, ["code"]) &&
        typeof p.code === "string" &&
        /^[a-f0-9]{64}$/.test(p.code);
      break;
  }
  return valid ? (v as LicensingCommand) : null;
}
