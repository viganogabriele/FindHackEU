import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Cookie-aware Supabase client for use in Server Components and Server
 * Actions (issue #67 - Google sign-in for the admin pages). Distinct from
 * `lib/supabase.ts`'s `supabase`/`supabaseAdmin` exports, which are plain
 * anon/service-role clients with no session/cookie awareness and are used
 * for data reads/writes, not auth. This one uses the anon key plus the
 * request's Supabase auth cookies so `auth.getUser()` reflects the signed-in
 * visitor, if any.
 *
 * Writing cookies from a Server Component (rather than a Server Action or
 * Route Handler) throws in Next.js - the `try/catch` below is the documented
 * `@supabase/ssr` pattern for that, and is safe because `proxy.ts`
 * (this repo's Next 16 proxy, scoped to the admin paths and /auth/callback)
 * refreshes the session cookies on every matching request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Server Components have no response object; matching proxy
          // requests apply these headers where the refreshed cookies are sent.
          void headers;
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render - ignored, since
            // proxy.ts refreshes the session on the next request.
          }
        },
      },
    },
  );
}
