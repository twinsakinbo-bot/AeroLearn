import { institutionalHttp } from '@/lib/institutional/http'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
function handle(request: Request) {
 return institutionalHttp(request, {
  enabled: process.env.INSTITUTIONAL_MVP_ENABLED === 'true',
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
 })
}
export const GET = handle
export const POST = handle
