import { licensingHttp } from "@/lib/institutional/licensing-http";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const handle = (request: Request) =>
  licensingHttp(request, {
    enabled:
      process.env.INSTITUTIONAL_MVP_ENABLED === "true" &&
      process.env.INSTITUTIONAL_LICENSING_ENABLED === "true",
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
export const GET = handle;
export const POST = handle;
