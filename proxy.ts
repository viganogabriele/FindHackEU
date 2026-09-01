import { NextResponse, type NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/services/supabase-auth-middleware";

/**
 * Paths that need a fresh Supabase Auth session cookie on every request
 * (issue #67). Scoped narrowly on purpose - the rest of the site has no
 * login and must stay untouched by Supabase Auth's cookie handling.
 */
function needsSupabaseSession(pathname: string): boolean {
  return [
    "/admin",
    "/admin/candidates",
    "/admin/hackathons",
    "/auth/callback",
  ].some(
    (protectedPath) =>
      pathname === protectedPath || pathname.startsWith(`${protectedPath}/`),
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
  matcher: [
    "/admin",
    "/admin/candidates/:path*",
    "/admin/hackathons/:path*",
    "/auth/callback",
  ],
};
