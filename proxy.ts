import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/services/supabase-auth-middleware";

/**
 * Paths that need a fresh Supabase Auth session cookie on every request
 * (issue #67). Scoped narrowly on purpose - the rest of the site has no
 * login and must stay untouched by Supabase Auth's cookie handling.
 *
 * "/admin/hackathons" was removed here when issue #82 retired it as a
 * standalone route - it now just redirects to /admin?status=approved
 * without reading any session state, so it no longer needs a refreshed
 * cookie of its own.
 *
 * "/admin/candidates" no longer exists as a route (renamed to /admin
 * directly, at the maintainer's request) - the dashboard's own session
 * refresh is now covered entirely by the "/admin" check below. The
 * dashboard has no further path segments of its own (every filter/tab is a
 * query param, not a route segment), so no "/admin/:path*" case is needed.
 */
function needsSupabaseSession(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/auth/callback";
}

export async function proxy(request: NextRequest) {
  const usesSupabaseSession = needsSupabaseSession(request.nextUrl.pathname);
  const response = usesSupabaseSession
    ? await updateSupabaseSession(request)
    : NextResponse.next();

  if (usesSupabaseSession) {
    const vary = response.headers.get("Vary");
    const varyValues = vary?.split(",").map((value) => value.trim()) ?? [];
    if (!varyValues.some((value) => value.toLowerCase() === "cookie")) {
      response.headers.set(
        "Vary",
        [...varyValues, "Cookie"].filter(Boolean).join(", "),
      );
    }
  }
  return response;
}

export const config = {
  matcher: ["/admin", "/auth/callback"],
};
