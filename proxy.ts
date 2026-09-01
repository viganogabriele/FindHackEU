import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/services/supabase-auth-middleware";

/**
 * Paths that need a fresh Supabase Auth session cookie on every request
 * (issue #67). Scoped narrowly on purpose - the rest of the site has no
 * login and must stay untouched by Supabase Auth's cookie handling.
 */
function needsSupabaseSession(pathname: string): boolean {
  return (
    pathname.startsWith("/admin/candidates") ||
    pathname.startsWith("/auth/callback")
  );
}

export async function proxy(request: NextRequest) {
  const response = needsSupabaseSession(request.nextUrl.pathname)
    ? await updateSupabaseSession(request)
    : NextResponse.next();

  const vary = response.headers.get("Vary");
  if (vary) {
    if (!vary.includes("Cookie"))
      response.headers.set("Vary", `${vary}, Cookie`);
  } else {
    response.headers.set("Vary", "Cookie");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
