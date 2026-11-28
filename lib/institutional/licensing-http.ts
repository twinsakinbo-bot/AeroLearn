import { createClient } from "@supabase/supabase-js";
import { isUuid } from "./contracts";
import {
  parseLicensingCommand,
  type LicenseContext,
  type LicensingResult,
} from "./licensing-contracts";
import type { ClientFactory } from "./http";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization, X-Institution-Id",
};
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers });
const caller: ClientFactory = (url, key, token) =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
export async function licensingHttp(
  request: Request,
  config: { enabled: boolean; url?: string; key?: string },
  factory: ClientFactory = caller,
): Promise<Response> {
  if (!config.enabled)
    return reply({ error: "Institutional licensing is disabled." }, 404);
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return reply({ error: "Sign in to continue." }, 401);
  if (!config.url || !config.key)
    return reply({ error: "Licensing is unavailable." }, 503);
  try {
    const client = factory(config.url, config.key, token);
    const { data: identity, error: authError } =
      await client.auth.getUser(token);
    if (authError || !identity.user)
      return reply({ error: "Sign in to continue." }, 401);
    const org = request.headers.get("x-institution-id");
    if (org !== null && !isUuid(org))
      return reply({ error: "Choose a valid school." }, 400);
    if (request.method === "GET") {
      const { data, error } = await client.rpc(
        "institutional_licensing_context",
        { p_institution_id: org },
      );
      if (error)
        return reply(
          { error: "School licensing is unavailable for this account." },
          403,
        );
      if (!org) return reply(data);
      const context = data as LicenseContext;
      if (context.operator || context.role === "school_admin") {
        const { data: dashboard, error: readError } = await client.rpc(
          "institutional_licensing_dashboard",
          { p_institution_id: org },
        );
        if (readError)
          return reply({ error: "School licensing could not be loaded." }, 403);
        return reply({ ...context, ...dashboard });
      }
      return reply(context);
    }
    if (request.method !== "POST")
      return reply({ error: "Method not allowed." }, 405);
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Invalid command." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return reply({ error: "Command too large." }, 413);
      }
      chunks.push(value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply({ error: "Invalid command." }, 400);
    }
    const command = parseLicensingCommand(body);
    if (!command || org !== command.institution_id)
      return reply({ error: "Invalid command or school context." }, 400);
    const { data, error } = await client.rpc(
      "institutional_licensing_command",
      {
        p_action: command.action,
        p_institution_id: org,
        p_payload: command.payload,
      },
    );
    if (error)
      return reply(
        {
          error:
            error.code === "P0001"
              ? "School issuance limit reached. Retry after the rolling hour clears."
              : error.code === "54000"
                ? "Insufficient available seats."
                : error.code === "42501"
                  ? "This operation is not permitted."
                  : "The operation could not be completed. Check the term, dates, state and reassignment policy.",
        },
        error.code === "P0001"
          ? 429
          : error.code === "54000"
            ? 409
            : error.code === "42501"
              ? 403
              : 400,
      );
    if (data?.error)
      return reply(
        {
          error:
            data.error === "rate_limited"
              ? "Too many code attempts. Retry next hour."
              : data.error === "existing_grant"
                ? "You already have a grant for this cohort and term."
                : "This code is unavailable, expired or not assigned to your school and cohort.",
        },
        data.error === "rate_limited" ? 429 : 409,
      );
    return reply(data as LicensingResult);
  } catch {
    return reply(
      {
        error:
          "Licensing is temporarily unavailable. Retry using the same request.",
      },
      503,
    );
  }
}
