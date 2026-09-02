import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CRUD for the `admin_users` table (issue #18) - the "Manage admins"
 * section of /admin reads and writes through these functions, and
 * `require-admin-auth.ts`'s table-based authorization check
 * (`isEmailInAdminAllowlist`) reads through the same normalization rules.
 *
 * Every function takes a dependency-injected Supabase client (not the
 * module-level `supabaseAdmin` singleton), matching this codebase's
 * existing pattern (see lib/services/hackathon-moderation.ts) so the exact
 * query shape can be unit-tested against a mocked chainable builder without
 * a live database. Callers must always pass `supabaseAdmin` (the
 * service-role client) - `admin_users` has no RLS policy at all (see its
 * migration), so only the service-role key can read or write it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

export interface AdminUserRow {
  email: string;
  added_at: string;
  added_by: string | null;
}

export interface AddAdminResult {
  outcome: "added" | "already_exists" | "invalid" | "error";
  message?: string;
}

export interface RemoveAdminResult {
  outcome: "removed" | "not_found" | "self_removal_blocked" | "error";
  message?: string;
}

/**
 * Normalizes an email the same way on every read/write path, so
 * "Admin@Example.com" and "admin@example.com" are always treated as the
 * same account (mirrors the case-insensitive comparison
 * `ADMIN_ALLOWED_EMAIL` already used - see require-admin-auth.ts).
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** A deliberately minimal shape check - real verification is Google OAuth itself. */
function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Lists every admin, most recently added first - backs the "Manage admins"
 * table. Bounded to 200 rows (this codebase's existing convention for small
 * admin-facing lists, e.g. app/admin/queries.ts's candidate queries) - the
 * expected size here is a handful of people, not a dataset that needs real
 * pagination.
 */
export async function listAdminUsers(client: AnySupabaseClient) {
  return client
    .from("admin_users")
    .select("*")
    .order("added_at", { ascending: false })
    .limit(200);
}

export function adminUsersCountQuery(client: AnySupabaseClient) {
  return client
    .from("admin_users")
    .select("email", { count: "exact", head: true });
}

/**
 * Adds a new admin. Idempotent against re-adding an email that's already
 * present (`"already_exists"`, not an error) since a double-submit or a
 * stale form shouldn't surface as a failure.
 */
export async function addAdminUser(
  client: AnySupabaseClient,
  email: string,
  addedBy: string | null,
): Promise<AddAdminResult> {
  const normalized = normalizeEmail(email);

  if (!isPlausibleEmail(normalized)) {
    return { outcome: "invalid", message: "Enter a valid email address." };
  }

  const { data: existing, error: fetchError } = await client
    .from("admin_users")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (fetchError) {
    return { outcome: "error", message: fetchError.message };
  }

  if (existing) {
    return { outcome: "already_exists" };
  }

  const { error: insertError } = await client.from("admin_users").insert({
    email: normalized,
    added_by: addedBy ? normalizeEmail(addedBy) : null,
  });

  if (insertError) {
    return { outcome: "error", message: insertError.message };
  }

  return { outcome: "added" };
}

/**
 * Removes an admin by email.
 *
 * Self-removal is blocked (issue #18 explicitly leaves this to
 * implementer judgment): unlike the `ADMIN_ALLOWED_EMAIL` fallback account,
 * which can never be locked out (see require-admin-auth.ts's fallback
 * check), an admin added only through this table has no other way back in
 * once removed - someone else with access would have to re-add them.
 * Disallowing self-removal outright avoids an accidental-click lockout for
 * that admin; `actingAdminEmail` is the currently signed-in admin's own
 * email (from `getAdminAuthStatus()`), compared case-insensitively.
 */
export async function removeAdminUser(
  client: AnySupabaseClient,
  email: string,
  actingAdminEmail: string | null,
): Promise<RemoveAdminResult> {
  const normalized = normalizeEmail(email);

  if (actingAdminEmail && normalizeEmail(actingAdminEmail) === normalized) {
    return {
      outcome: "self_removal_blocked",
      message:
        "You can't remove your own admin access. Ask another admin to remove you if needed.",
    };
  }

  const { data, error } = await client
    .from("admin_users")
    .delete()
    .eq("email", normalized)
    .select("email");

  if (error) {
    return { outcome: "error", message: error.message };
  }

  if (!data || data.length === 0) {
    return { outcome: "not_found" };
  }

  return { outcome: "removed" };
}

/**
 * The real authorization check the table-based path of
 * `require-admin-auth.ts` delegates to: is this email present in
 * `admin_users`? Fails closed (returns `false`) on any query error rather
 * than treating "couldn't check" as "allowed" - mirrors the existing
 * "env var unset -> deny everyone" behavior this replaces/augments.
 */
export async function isAdminUserInTable(
  client: AnySupabaseClient,
  email: string,
): Promise<boolean> {
  const normalized = normalizeEmail(email);

  const { data, error } = await client
    .from("admin_users")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}
