import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/services/supabase-auth-middleware";

/**
 * Paths that need a fresh Supabase Auth session cookie on every request
 * (issue #67). Scoped narrowly on purpose - the rest of the site has no
 * login and must stay untouched by Supabase Auth's cookie handling.
 *
 * "/admin/hackathons" was removed here when issue #82 retired it as a
 * standalone route - it now just redirects to
 * /admin/candidates?status=approved without reading any session state, so
 * it no longer needs a refreshed cookie of its own.
 */
function needsSupabaseSession(pathname: string): boolean {
  if (pathname === "/admin" || pathname === "/auth/callback") {
    return true;
  }
  return (
    pathname === "/admin/candidates" ||
    pathname.startsWith("/admin/candidates/")
  );
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
  matcher: ["/admin", "/admin/candidates/:path*", "/auth/callback"],
};
