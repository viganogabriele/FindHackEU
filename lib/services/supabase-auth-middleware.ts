import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { applySupabaseSessionHeaders } from "./supabase-session-headers";

/**
 * Refreshes the Supabase Auth session cookies for a request, following the
 * `@supabase/ssr` documented middleware pattern. Called from `proxy.ts`
 * (this repo's Next 16 proxy) only for the two admin paths and
 * /auth/callback (issue #67) - the rest of the site stays fully public and
 * untouched by Supabase Auth.
 */
export async function updateSupabaseSession(
  request: NextRequest,
): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          applySupabaseSessionHeaders(supabaseResponse.headers, headers);
        },
      },
    },
  );

  // Refreshing the session (not just reading it) is what keeps a signed-in
  // maintainer from being logged out mid-session - see @supabase/ssr docs.
  await supabase.auth.getUser();

  return supabaseResponse;
}
