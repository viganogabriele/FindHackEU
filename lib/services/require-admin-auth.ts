import { createSupabaseServerClient } from "./supabase-auth-server";

export interface AdminAuthStatus {
  authorized: boolean;
  /** The signed-in user's email, if any - shown in the UI even when not authorized. */
  email: string | null;
}

/**
 * Server-side admin auth check for /admin/candidates (issue #67). Single-
 * maintainer allowlist: only the exact email in `ADMIN_ALLOWED_EMAIL` (set
 * server-side only, never exposed to the client) is authorized, regardless
 * of whether other Google accounts could sign in. If the env var is unset,
 * this fails closed (denies everyone) rather than failing open.
 */
export async function getAdminAuthStatus(): Promise<AdminAuthStatus> {
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
 * /admin/candidates server action (mirroring the existing `assertDevOnly()`
 * pattern in app/admin/candidates/actions.ts) - the sign-in gate on the page
 * itself only hides UI, it is not real security on its own since a server
 * action is its own callable endpoint once the client has the page loaded.
 */
export async function requireAdminAuth(): Promise<void> {
  const { authorized } = await getAdminAuthStatus();
  if (!authorized) {
    throw new Error("Not authorized");
  }
}
