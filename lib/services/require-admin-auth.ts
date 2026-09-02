import { createSupabaseServerClient } from "./supabase-auth-server";

export interface AdminAuthStatus {
  authorized: boolean;
  /** The signed-in user's email, if any - shown in the UI even when not authorized. */
  email: string | null;
}

/**
 * Local-only admin auth bypass (issue #4). Setting up a real Google Cloud
 * OAuth client (see docs/admin-auth-setup.md) is a real barrier for someone
 * who just cloned the repo, ran `npx supabase start`, and wants to poke at
 * the admin dashboard. When this returns true, every request is treated as
 * authorized without a Supabase Auth session.
 *
 * SECURITY: this must never be reachable in production. The `NODE_ENV`
 * check below is not an "outer gate" some caller is trusted to have already
 * applied - both `getAdminAuthStatus()` and `requireAdminAuth()` below call
 * this function themselves and re-check it inline, so a bypass is granted
 * only when this function's own logic allows it, never by inference from
 * some other check having already run. A misconfigured production deploy
 * (e.g. `ADMIN_LOCAL_NO_AUTH` accidentally set, or `GOOGLE_CLIENT_ID`/
 * `ADMIN_ALLOWED_EMAIL` accidentally left unset) still cannot trigger this
 * bypass, because `NODE_ENV === "production"` short-circuits it first.
 *
 * Two ways to enable it locally, both meaningless outside development:
 *   1. Explicit opt-in: `ADMIN_LOCAL_NO_AUTH=true`.
 *   2. Convenience default: neither `GOOGLE_CLIENT_ID` nor
 *      `ADMIN_ALLOWED_EMAIL` is configured, so a real Google sign-in could
 *      not succeed anyway - see .env.example and docs/admin-auth-setup.md.
 */
function isLocalNoAuthBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (process.env.ADMIN_LOCAL_NO_AUTH === "true") {
    return true;
  }
  return !process.env.GOOGLE_CLIENT_ID && !process.env.ADMIN_ALLOWED_EMAIL;
}

/**
 * Server-side admin auth check for the admin pages (issue #67). Single-
 * maintainer allowlist: only the exact email in `ADMIN_ALLOWED_EMAIL` (set
 * server-side only, never exposed to the client) is authorized, regardless
 * of whether other Google accounts could sign in. If the env var is unset,
 * this fails closed (denies everyone) rather than failing open - unless the
 * local no-auth bypass above applies (development only, see its doc
 * comment).
 */
export async function getAdminAuthStatus(): Promise<AdminAuthStatus> {
  if (isLocalNoAuthBypassEnabled()) {
    return { authorized: true, email: "local-dev (ADMIN_LOCAL_NO_AUTH)" };
  }

  const allowedEmail = process.env.ADMIN_ALLOWED_EMAIL;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? null;
  const authorized = Boolean(
    allowedEmail && email && email.toLowerCase() === allowedEmail.toLowerCase(),
  );

  return { authorized, email };
}

/**
 * Throws unless the caller has a valid Supabase Auth session whose email
 * matches `ADMIN_ALLOWED_EMAIL`. Call this at the top of every
 * admin server action (mirroring the existing `assertDevOnly()`
 * pattern in app/admin/actions.ts) - the sign-in gate on the page
 * itself only hides UI, it is not real security on its own since a server
 * action is its own callable endpoint once the client has the page loaded.
 *
 * Checks the local no-auth bypass itself (rather than only relying on
 * `getAdminAuthStatus()` to have checked it) so this function's own
 * behavior is correct even if it is ever called independently.
 */
export async function requireAdminAuth(): Promise<void> {
  if (isLocalNoAuthBypassEnabled()) {
    return;
  }

  const { authorized } = await getAdminAuthStatus();
  if (!authorized) {
    throw new Error("Not authorized");
  }
}
