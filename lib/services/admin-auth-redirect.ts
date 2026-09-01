// "/admin/hackathons" was removed from this allowlist when issue #82
// retired it as a standalone admin route - it now just redirects to
// /admin/candidates?status=approved and needs no auth session of its own,
// so it's no longer a meaningful post-login destination.
export const ADMIN_AUTH_REDIRECT_PATHS = [
  "/admin",
  "/admin/candidates",
] as const;

export type AdminAuthRedirectPath = (typeof ADMIN_AUTH_REDIRECT_PATHS)[number];

export const DEFAULT_ADMIN_AUTH_REDIRECT = "/admin/candidates";

export function isAdminAuthRedirectPath(
  value: string | null | undefined,
): value is AdminAuthRedirectPath {
  return ADMIN_AUTH_REDIRECT_PATHS.includes(value as AdminAuthRedirectPath);
}

/**
 * Accept only same-origin admin paths that are explicitly part of the OAuth
 * flow. Query strings are preserved for the selected admin page, but an
 * absolute URL, protocol-relative URL, or any other path falls back safely.
 */
export function getSafeAdminAuthRedirect(
  origin: string,
  next: string | null,
): string {
  try {
    const url = new URL(next ?? DEFAULT_ADMIN_AUTH_REDIRECT, origin);

    if (url.origin !== origin || !isAdminAuthRedirectPath(url.pathname)) {
      return DEFAULT_ADMIN_AUTH_REDIRECT;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return DEFAULT_ADMIN_AUTH_REDIRECT;
  }
}
