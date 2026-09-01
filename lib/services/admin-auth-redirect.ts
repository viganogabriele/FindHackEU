export const ADMIN_AUTH_REDIRECT_PATHS = [
  "/admin",
  "/admin/candidates",
  "/admin/hackathons",
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
