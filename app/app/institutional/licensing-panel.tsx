"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth";
import type {
  LicenseContext,
  LicenseTerm,
  LicensingCommand,
  LicensingResult,
  SchoolChoice,
} from "@/lib/institutional/licensing-contracts";
const input = "input-premium w-full min-w-0";
const iso = (value: FormDataEntryValue | null) =>
  new Date(String(value)).toISOString();
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export default function LicensingPanel() {
  const [schools, setSchools] = useState<SchoolChoice[]>([]),
    [school, setSchool] = useState(""),
    [context, setContext] = useState<LicenseContext | null>(null);
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [codes, setCodes] = useState<LicensingResult["codes"]>([]),
    [reason, setReason] = useState(""),
    [reclaim, setReclaim] = useState(false),
    [renewal, setRenewal] = useState("");
  const [authenticated, setAuthenticated] = useState("");
  const pending = useRef<{ key: string; id: string } | null>(null);
  const request = useCallback(
    async (org: string, body?: LicensingCommand, signal?: AbortSignal) => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw Error("Sign in to manage school access.");
      const r = await fetch("/api/institutional/licensing", {
        method: body ? "POST" : "GET",
        cache: "no-store",
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(org ? { "X-Institution-Id": org } : {}),
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "Licensing could not be loaded.");
      return data;
    },
    [],
  );
  useEffect(
    () => onAuthStateChanged(auth, (user) => setAuthenticated(user?.uid || "")),
    [],
  );
  useEffect(() => {
    setCodes([]);
    setContext(null);
    setSchools([]);
    setSchool("");
    if (!authenticated) return;
    const controller = new AbortController();
    void request("", undefined, controller.signal)
      .then((data) => {
        setSchools(data.institutions);
        setSchool(data.institutions[0]?.id || "");
        setLoading(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [authenticated, request]);
  const refresh = useCallback(async () => {
    if (school) setContext(await request(school));
  }, [school, request]);
  useEffect(() => {
    setContext(null);
    setCodes([]);
    setError("");
    setMessage("");
    pending.current = null;
    setRenewal("");
    if (!school) return;
    const controller = new AbortController();
    setLoading(true);
    void request(school, undefined, controller.signal)
      .then(setContext)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [school, request]);
  async function command(
    action: LicensingCommand["action"],
    payload: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    setCodes([]);
    try {
      const result: LicensingResult = await request(school, {
        action,
        institution_id: school,
        payload,
      } as LicensingCommand);
      pending.current = null;
      if (result.codes?.length) setCodes(result.codes);
      setMessage(
        result.message ||
          `${action.replace(/_/g, " ")} completed${result.replayed ? " (safe retry)" : ""}.`,
      );
      // A failed refresh must not discard the one-time delivery already received.
      try {
        await refresh();
      } catch {
        setError("Operation completed. Refresh to reload the latest status.");
      }
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The operation failed. Retry the same request.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  function stableId(key: string) {
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    return pending.current.id;
  }
  function withReason(
    action: LicensingCommand["action"],
    id: string,
    extra: Record<string, unknown> = {},
  ) {
    if (reason.trim().length < 3) {
      setError(
        "Enter a short administrative reason first. Use no learner personal information.",
      );
      return;
    }
    if (
      !window.confirm(
        `Confirm ${action.replace(/_/g, " ")}? ${action === "revoke_grant" ? (reclaim ? "This releases capacity only after offboarding." : "Capacity remains frozen until approved offboarding and release.") : "Retail access is independent."}`,
      )
    )
      return;
    void command(action, { id, reason: reason.trim(), ...extra });
  }
  async function draft(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const amount = String(f.get("amount"));
      if (!/^\d+(\.\d{1,2})?$/.test(amount))
        throw Error(
          "Enter a valid NGN amount with at most two decimal places.",
        );
      const payload = {
        cohort_id: String(f.get("cohort")),
        starts_at: iso(f.get("start")),
        ends_at: iso(f.get("end")),
        seat_cap: Number(f.get("cap")),
        quoted_minor: Math.round(Number(amount) * 100),
        renewal_of: renewal || null,
      };
      await command("draft_term", {
        ...payload,
        id: stableId(JSON.stringify(payload)),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the dates and quote.");
    }
  }
  async function issue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const payload = {
        term_id: String(f.get("term")),
        quantity: Number(f.get("quantity")),
        expires_at: iso(f.get("expiry")),
      };
      await command("issue_batch", {
        ...payload,
        id: stableId(JSON.stringify(payload)),
      });
    } catch {
      setError("Enter a valid code expiry date.");
    }
  }
  const manager =
    !!context && (context.operator || context.role === "school_admin");
  const termName = (id: string) => {
    const t = context?.terms?.find((t) => t.id === id);
    return t
      ? `${context?.cohorts.find((c) => c.id === t.cohort_id)?.name || "Cohort"} · ${date(t.ends_at)}`
      : id;
  };
  const old = context?.terms?.find((t) => t.id === renewal);
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">School licensing</h1>
        <p className="mt-2 text-muted">
          Manually approved school terms. Retail subscriptions stay independent.
          No automatic charges.
        </p>
      </header>
      {error && (
        <p
          role="alert"
          className="card break-words border-danger p-4 text-danger"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="card p-4">
          {message}
        </p>
      )}
      <section className="card space-y-3 p-4">
        <label className="field-label" htmlFor="license-school">
          School
        </label>
        <select
          id="license-school"
          className={input}
          value={school}
          disabled={busy}
          onChange={(e) => setSchool(e.target.value)}
        >
          <option value="">Select a school</option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="btn-secondary"
          disabled={busy || !school}
          onClick={() => {
            setError("");
            void refresh().catch((e) => setError(e.message));
          }}
        >
          Refresh live status
        </button>
        {!loading && !schools.length && (
          <p>
            No active school membership is available. An authorized operator
            must enroll your account.
          </p>
        )}
        {loading && <p role="status">Loading school access…</p>}
        {context && (
          <p className="text-sm text-muted">
            Access: {context.operator ? "institutional operator" : context.role}
            . Times are shown in your device’s timezone.
          </p>
        )}
      </section>
      {context?.role === "learner" && (
        <section className="card space-y-4 p-4">
          <h2 className="text-xl font-semibold">My school access</h2>
          {context.entitlement ? (
            <>
              <p>
                Active formative revision access until{" "}
                {date(context.entitlement.expires_at)}.
              </p>
              <Link
                className="btn-primary"
                href={`/app/mock-exams?institution=${school}`}
              >
                Open school mock revision
              </Link>
              <p className="text-sm text-muted">
                Formative practice only. Shared cohort assessments remain
                disabled.
              </p>
            </>
          ) : (
            <p>
              No active school entitlement. Ask your school for an unused code
              for your assigned cohort.
            </p>
          )}
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const code = String(new FormData(form).get("code")).trim();
              if (await command("redeem", { code })) form.reset();
            }}
            autoComplete="off"
          >
            <label className="field-label" htmlFor="learner-code">
              Learner access code
            </label>
            <input
              id="learner-code"
              name="code"
              className={input}
              type="password"
              autoComplete="new-password"
              required
              minLength={64}
              maxLength={64}
              pattern="[a-f0-9]{64}"
              spellCheck={false}
            />
            <button className="btn-primary" disabled={busy}>
              Redeem school code
            </button>
          </form>
        </section>
      )}
      {manager && (
        <>
          <section className="card space-y-3 p-4">
            <label htmlFor="license-reason" className="field-label">
              Administrative reason for changes
            </label>
            <input
              id="license-reason"
              className={input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={160}
              placeholder="Short reason; no student personal information"
            />
            {context?.operator && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={reclaim}
                  onChange={(e) => setReclaim(e.target.checked)}
                />
                On grant revocation, reclaim the seat. Allowed only after
                membership revocation or removal from the cohort. Otherwise
                capacity remains frozen.
              </label>
            )}
          </section>
          {context?.operator && (
            <section className="card p-4">
              <h2 className="mb-4 text-xl font-semibold">
                Draft term or renewal
              </h2>
              <form
                key={renewal}
                onSubmit={draft}
                className="grid gap-4 sm:grid-cols-2"
              >
                <label className="space-y-1">
                  Renewal of
                  <select
                    aria-label="Renewal of"
                    className={input}
                    value={renewal}
                    onChange={(e) => setRenewal(e.target.value)}
                  >
                    <option value="">New term</option>
                    {context.terms?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {termName(t.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  Cohort
                  <select
                    name="cohort"
                    aria-label="Cohort"
                    className={input}
                    required
                    defaultValue={old?.cohort_id}
                  >
                    {context.cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  Starts (device time)
                  <input
                    name="start"
                    className={input}
                    type="datetime-local"
                    required
                    defaultValue={
                      old
                        ? new Date(
                            new Date(old.ends_at).getTime() -
                              new Date(old.ends_at).getTimezoneOffset() * 60000,
                          )
                            .toISOString()
                            .slice(0, 16)
                        : undefined
                    }
                  />
                </label>
                <label className="space-y-1">
                  Ends (device time)
                  <input
                    name="end"
                    className={input}
                    type="datetime-local"
                    required
                  />
                </label>
                <label className="space-y-1">
                  Seat cap
                  <input
                    name="cap"
                    className={input}
                    type="number"
                    min={1}
                    max={5000}
                    required
                    defaultValue={old?.seat_cap || 10}
                  />
                </label>
                <label className="space-y-1">
                  Agreed quote (NGN)
                  <input
                    name="amount"
                    className={input}
                    inputMode="decimal"
                    required
                    defaultValue="0.00"
                  />
                </label>
                <p className="text-sm text-muted sm:col-span-2">
                  A draft provides no access. Reconcile payment and required
                  pilot sign-offs outside the app before approval and
                  activation. Renewal needs a new approval. Maximum term: two
                  years.
                </p>
                <button
                  className="btn-primary"
                  disabled={busy || !context.cohorts.length}
                >
                  Create draft term
                </button>
              </form>
            </section>
          )}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Terms and seat pools</h2>
            {!context?.terms?.length && (
              <p className="card p-4">No school terms have been created.</p>
            )}
            {context?.terms?.map((t: LicenseTerm) => (
              <article
                key={t.id}
                className="card min-w-0 space-y-3 p-4"
                data-term-id={t.id}
              >
                <h3 className="font-semibold">{termName(t.id)}</h3>
                <p className="text-sm">
                  {t.effective_state} · {date(t.starts_at)} to {date(t.ends_at)}{" "}
                  · NGN {(t.quoted_minor / 100).toLocaleString()}
                </p>
                <p className="break-all text-xs text-muted">
                  Term {t.id}
                  {t.approval_ref ? ` · Approval ${t.approval_ref}` : ""}
                </p>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ["Seat cap", t.seat_cap],
                    ["Assigned", t.assigned],
                    ["Reserved", t.reserved],
                    ["Available", t.available],
                    ["Frozen", t.frozen],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-sm text-muted">{k}</dt>
                      <dd className="text-xl font-bold">{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted">
                  Assigned includes suspended grants ({t.suspended}). Expired
                  unused codes are reclaimable. Expired, suspended and cancelled
                  terms grant no access.
                </p>
                {context.operator && (
                  <div className="flex flex-wrap gap-2">
                    {t.state === "draft" && (
                      <form
                        className="flex w-full flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void command("approve_term", {
                            id: t.id,
                            approval_ref: String(
                              new FormData(e.currentTarget).get("reference"),
                            ),
                          });
                        }}
                      >
                        <input
                          name="reference"
                          className={`${input} sm:max-w-xs`}
                          aria-label="Manual approval reference"
                          placeholder="Reconciled payment / pilot approval reference"
                          required
                          minLength={3}
                          maxLength={80}
                        />
                        <button className="btn-secondary" disabled={busy}>
                          Approve manually
                        </button>
                      </form>
                    )}
                    {t.state === "approved" && (
                      <button
                        className="btn-primary"
                        disabled={busy || t.effective_state === "expired"}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Confirm payment reconciliation and pilot sign-offs are complete. Activate this fixed term?",
                            )
                          )
                            void command("activate_term", { id: t.id });
                        }}
                      >
                        Activate term
                      </button>
                    )}
                    {t.state === "active" && (
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => withReason("suspend_term", t.id)}
                      >
                        Suspend term
                      </button>
                    )}
                    {t.state === "suspended" && (
                      <button
                        className="btn-secondary"
                        disabled={busy || t.effective_state === "expired"}
                        onClick={() => withReason("resume_term", t.id)}
                      >
                        Resume term
                      </button>
                    )}
                    {t.state !== "cancelled" && (
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => withReason("cancel_term", t.id)}
                      >
                        Cancel term
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
          <section className="card space-y-4 p-4">
            <h2 className="text-xl font-semibold">Issue learner codes</h2>
            <p className="text-sm text-muted">
              Up to 100 per batch, valid for at most seven days and within the
              term. Codes appear once. Distribute privately; never put them in
              URLs, analytics or shared records. Lost delivery: cancel the
              unused batch, then issue replacements. Redeemed grants are
              preserved.
            </p>
            <form onSubmit={issue} className="grid gap-3 sm:grid-cols-3">
              <label>
                Term
                <select
                  name="term"
                  aria-label="Term"
                  className={input}
                  required
                >
                  {context?.terms
                    ?.filter(
                      (t) =>
                        t.state === "active" && t.effective_state !== "expired",
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {termName(t.id)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Number of seats
                <input
                  name="quantity"
                  className={input}
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={1}
                  required
                />
              </label>
              <label>
                Code expiry (device time)
                <input
                  name="expiry"
                  className={input}
                  type="datetime-local"
                  required
                />
              </label>
              <button className="btn-primary" disabled={busy}>
                Issue batch
              </button>
            </form>
            {!!codes?.length && (
              <div className="space-y-3 rounded border border-accent p-3">
                <h3 className="font-semibold">One-time code delivery</h3>
                <textarea
                  aria-label="One-time learner codes"
                  className={`${input} font-mono text-sm`}
                  rows={Math.min(10, codes.length + 1)}
                  readOnly
                  value={codes.map((c) => c.code).join("\n")}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="btn-secondary" onClick={() => setCodes([])}>
                  Clear displayed codes
                </button>
              </div>
            )}
          </section>
          <section className="card space-y-3 p-4">
            <h2 className="text-xl font-semibold">Recent batches</h2>
            {context?.batches?.map((b) => (
              <div
                key={b.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-hairline py-3"
              >
                <p className="min-w-0 break-all text-sm">
                  {b.id} · {b.quantity} codes · expires{" "}
                  {date(b.code_expires_at)}
                  {b.cancelled_at ? " · cancelled" : ""}
                </p>
                <button
                  className="btn-secondary"
                  disabled={busy || !!b.cancelled_at}
                  onClick={() => withReason("cancel_batch", b.id)}
                >
                  Cancel unused codes
                </button>
              </div>
            ))}
          </section>
          <section className="card space-y-3 p-4">
            <h2 className="text-xl font-semibold">Recent learner grants</h2>
            {context?.grants?.map((g) => (
              <div
                key={g.id}
                className="space-y-2 border-b border-hairline py-3"
              >
                <p className="break-words">
                  {g.alias || "Offboarded learner"} · {g.state}
                </p>
                <p className="break-all text-xs text-muted">
                  Grant {g.id} · seat {g.seat_id}
                </p>
                <div className="flex flex-wrap gap-2">
                  {g.state === "active" && (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => withReason("suspend_grant", g.id)}
                    >
                      Suspend access
                    </button>
                  )}
                  {context.operator && g.state === "suspended" && (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => withReason("resume_grant", g.id)}
                    >
                      Resume access
                    </button>
                  )}
                  {context.operator && g.state !== "revoked" && (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        withReason("revoke_grant", g.id, { reclaim })
                      }
                    >
                      Revoke grant
                    </button>
                  )}
                  {context.operator && g.state === "revoked" && (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() => withReason("release_seat", g.seat_id)}
                    >
                      Release frozen seat after offboarding
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
          <section className="card space-y-3 p-4">
            <h2 className="text-xl font-semibold">Recent audit events</h2>
            {context?.events?.map((e) => (
              <p
                key={e.id}
                className="break-words border-b border-hairline py-2 text-sm"
              >
                {date(e.occurred_at)} · {e.action.replace(/_/g, " ")}
                {e.reason ? ` · ${e.reason}` : ""}
              </p>
            ))}
            <p className="text-xs text-muted">
              Lists show at most the latest {context?.list_limit || 100} records
              per type. Pool totals include every seat. Request an authorized
              tenant-scoped export for older records.
            </p>
          </section>
        </>
      )}
      {context?.role === "teacher" && !manager && (
        <p className="card p-4">
          School administrators manage licensing. Teachers cannot approve
          payments, issue seats or change entitlements.
        </p>
      )}
    </main>
  );
}
