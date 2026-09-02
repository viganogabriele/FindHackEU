import { createSupabaseServerClient } from "./supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdminUserInTable } from "./admin-users";

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
 * Multi-admin authorization check (issue #18). Replaces the old
 * single-email-only comparison with two checks, either of which grants
 * access:
 *
 *   1. `ADMIN_ALLOWED_EMAIL` fallback: if that env var is set and the
 *      signed-in email matches it (case-insensitively), this ALWAYS
 *      returns true - even if the `admin_users` table doesn't (yet)
 *      contain that email, and even if the table is empty, unreachable, or
 *      errors. This guarantees a fresh deploy always has exactly one
 *      guaranteed way in (the original maintainer account, via env var
 *      only - no database dependency) before the "Manage admins" UI has
 *      ever been used, and means the maintainer can never accidentally
 *      lock themselves out by mismanaging the table (e.g. removing every
 *      row, or a bug in the table-management UI). This check is tried
 *      FIRST and short-circuits before the table is even queried.
 *   2. `admin_users` table: otherwise, the signed-in email must be present
 *      in the table (case-insensitively - see lib/services/admin-users.ts's
 *      `normalizeEmail`). A query error here is treated as "not
 *      authorized", not "allowed" - fail closed, same as an empty table or
 *      an unset `ADMIN_ALLOWED_EMAIL` today.
 *
 * Unless the local no-auth bypass above applies (development only, see its
 * doc comment) - that bypass is checked first and short-circuits both of
 * the above.
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

  if (!email) {
    return { authorized: false, email };
  }

  const matchesEnvFallback = Boolean(
    allowedEmail && email.toLowerCase() === allowedEmail.toLowerCase(),
  );

  if (matchesEnvFallback) {
    return { authorized: true, email };
  }

  const authorized = await isAdminUserInTable(supabaseAdmin, email);

  return { authorized, email };
}

/**
 * Throws unless the caller has a valid Supabase Auth session whose email is
 * authorized - either it matches `ADMIN_ALLOWED_EMAIL` (the fallback
 * account, always allowed) or it's present in the `admin_users` table (see
 * `getAdminAuthStatus()`'s doc comment for the full precedence). Call this
 * at the top of every admin server action (mirroring the existing
 * `assertDevOnly()` pattern in app/admin/actions.ts) - the sign-in gate on
 * the page itself only hides UI, it is not real security on its own since a
 * server action is its own callable endpoint once the client has the page
 * loaded.
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
