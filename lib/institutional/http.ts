import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isUuid, parseCommand, type Cohort, type CohortMembership, type Institution, type Membership, type CommandResult } from './contracts'
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization, X-Institution-Id' }
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers })
interface Config { enabled: boolean; url?: string; key?: string }
export type ClientFactory = (url: string, key: string, token: string) => SupabaseClient
const createCaller: ClientFactory = (url,key,token) => createClient(url,key, {
 auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
 global: { headers: { Authorization: `Bearer ${token}` } },
})
/** Every invocation creates its own caller client; never memoize a session or school. */
export async function institutionalHttp(request: Request, config: Config, factory: ClientFactory = createCaller): Promise<Response> {
 if (!config.enabled) return reply({ error: 'Institutional preview is disabled.' },404)
 const auth = request.headers.get('authorization')
 if (!auth || !/^Bearer \S+$/i.test(auth)) return reply({ error: 'Sign in to continue.' },401)
 if (!config.url || !config.key) return reply({ error: 'Institutional access is unavailable.' },503)
 const token = auth.slice(7)
 try {
  const client = factory(config.url,config.key,token)
  const { data: identity, error: authError } = await client.auth.getUser(token)
  if (authError || !identity.user) return reply({ error: 'Sign in to continue.' },401)
  if (request.method === 'POST') {
   // Bounded streaming prevents a false Content-Length from bypassing the limit.
   const reader = request.body?.getReader()
   if (!reader) return reply({ error: 'Invalid command.' },400)
   const chunks: Uint8Array[] = []; let size = 0
   while (true) {
    const { value, done } = await reader.read(); if (done) break
    size += value.byteLength
    if (size > 4096) { await reader.cancel(); return reply({ error: 'Command too large.' },413) }
    chunks.push(value)
   }
   let body: unknown
   try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return reply({ error: 'Invalid command.' },400) }
   const command = parseCommand(body)
   if (!command) return reply({ error: 'Invalid command.' },400)
   // Explicit context must agree in both the transport and the command.
   if (command.institution_id !== null && request.headers.get('x-institution-id') !== command.institution_id) return reply({ error: 'Select the matching school.' },400)
   const { data, error } = await client.rpc('institutional_command', {
    p_action: command.action, p_institution_id: command.institution_id, p_payload: command.payload,
   }).returns<CommandResult>()
   if (error) return reply({ error: 'Command was not permitted or could not be completed.' }, error.code === '42501' ? 403 : 400)
   return reply(data)
  }
  if (request.method !== 'GET') return reply({ error: 'Method not allowed.' },405)
  const org = request.headers.get('x-institution-id')
  if (!org) {
   const { data, error } = await client.from('institutions').select('id,name,active,created_at').returns<Institution[]>()
   if (error) return reply({ error: 'Could not load schools.' },503)
   return reply({ institutions: data })
  }
  if (!isUuid(org)) return reply({ error: 'Invalid school context.' },400)
  const { data: institution, error } = await client.from('institutions').select('id,name,active,created_at').eq('id',org).maybeSingle<Institution>()
  if (error) return reply({ error: 'Could not load school.' },503)
  if (!institution) return reply({ error: 'School unavailable.' },403)
  const [members,cohorts,assignments] = await Promise.all([
   client.from('institution_memberships').select('institution_id,id,user_id,role,active,alias').eq('institution_id',org).returns<Membership[]>(),
   client.from('school_cohorts').select('institution_id,id,name').eq('institution_id',org).returns<Cohort[]>(),
   client.from('cohort_memberships').select('institution_id,cohort_id,membership_id').eq('institution_id',org).returns<CohortMembership[]>(),
  ])
  if (members.error || cohorts.error || assignments.error) return reply({ error: 'Could not load school.' },503)
  return reply({ institution, memberships: members.data, cohorts: cohorts.data, assignments: assignments.data })
 } catch { return reply({ error: 'Institutional access is unavailable.' },503) }
}
