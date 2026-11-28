import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
/** Also checked while preview is OFF: withdrawal/rollback must not republish children. */
export async function isProtectedLearner(uid: string): Promise<boolean> {
 const { data, error } = await getSupabaseAdmin().rpc('institutional_learner_guard', { p_uid: uid })
 if (error || typeof data !== 'boolean') throw new Error('Learner safeguards unavailable')
 return data
}
export async function denyProtectedLearner(uid: string): Promise<NextResponse | null> {
 try {
  return await isProtectedLearner(uid) ? NextResponse.json({ error: 'This feature is unavailable for school learner accounts.' }, { status: 403 }) : null
 } catch { return NextResponse.json({ error: 'Could not verify account safeguards.' }, { status: 503 }) }
}
