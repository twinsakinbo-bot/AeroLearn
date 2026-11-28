export type InstitutionalRole = 'school_admin' | 'teacher' | 'learner'
export interface Institution { id: string; name: string; active: boolean; created_at: string }
export interface Membership { institution_id: string; id: string; user_id: string; role: InstitutionalRole; active: boolean; alias: string | null }
export interface Cohort { institution_id: string; id: string; name: string }
export interface CohortMembership { institution_id: string; cohort_id: string; membership_id: string }
export interface SchoolContext { institution: Institution; memberships: Membership[]; cohorts: Cohort[]; assignments: CohortMembership[] }
export type InstitutionalCommand =
 | { action: 'create_institution'; institution_id: null; payload: { name: string } }
 | { action: 'create_cohort'; institution_id: string; payload: { name: string } }
 | { action: 'invite_staff'; institution_id: string; payload: { email: string; role: 'school_admin' | 'teacher' } }
 | { action: 'accept_invite'; institution_id: string; payload: { token: string } }
 | { action: 'revoke_invite' | 'revoke_member' | 'delete_learner_membership'; institution_id: string; payload: { id: string } }
 | { action: 'assign_cohort' | 'remove_from_cohort'; institution_id: string; payload: { membership_id: string; cohort_id: string } }
 | { action: 'enroll_learner'; institution_id: string; payload: { user_id: string; alias: string } }
 | { action: 'withdraw' | 'deactivate_institution'; institution_id: string; payload: Record<string, never> }
export interface CommandResult { id: string | null; institution_id?: string; token?: string; expires_in_hours?: number }
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keys = (v: Record<string, unknown>, names: string[]) => Object.keys(v).length === names.length && names.every(k => Object.prototype.hasOwnProperty.call(v, k))
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f]/.test(v)
/** Reject unexpected fields: actor, role overrides and implicit school context are never accepted. */
export function parseCommand(value: unknown): InstitutionalCommand | null {
 if (!record(value) || !keys(value, ['action','institution_id','payload']) || !record(value.payload)) return null
 const { action, institution_id, payload: p } = value
 if (action === 'create_institution' ? institution_id !== null : !isUuid(institution_id)) return null
 let valid = false
 switch (action) {
  case 'create_institution': valid = keys(p,['name']) && text(p.name,120); break
  case 'create_cohort': valid = keys(p,['name']) && text(p.name,100); break
  case 'invite_staff': valid = keys(p,['email','role']) && text(p.email,254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email)) && ['school_admin','teacher'].includes(String(p.role)); break
  case 'accept_invite': valid = keys(p,['token']) && typeof p.token === 'string' && /^[a-f0-9]{64}$/.test(p.token); break
  case 'revoke_invite': case 'revoke_member': case 'delete_learner_membership': valid = keys(p,['id']) && isUuid(p.id); break
  case 'assign_cohort': case 'remove_from_cohort': valid = keys(p,['membership_id','cohort_id']) && isUuid(p.membership_id) && isUuid(p.cohort_id); break
  case 'enroll_learner': valid = keys(p,['user_id','alias']) && isUuid(p.user_id) && typeof p.alias === 'string' && /^[A-Za-z0-9_-]{2,40}$/.test(p.alias); break
  case 'withdraw': case 'deactivate_institution': valid = keys(p,[]); break
 }
 return valid ? value as InstitutionalCommand : null
}
