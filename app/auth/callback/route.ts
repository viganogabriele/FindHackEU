import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/services/supabase-auth-server";

/**
 * Supabase Auth OAuth callback (issue #67). Only used by the
 * /admin/candidates sign-in flow: `GoogleSignInButton` sends the browser
 * here with `?next=/admin/candidates` after Google redirects back to
 * Supabase and Supabase redirects to this app. Register this route's full
 * URL (e.g. http://127.0.0.1:54321/auth/v1/callback for local Supabase, or
 * this app's own /auth/callback URL depending on the redirect flow used -
 * see docs/admin-auth-setup.md) as an allowed redirect URL in both the
 * Google Cloud OAuth client and `supabase/config.toml`'s
 * `auth.additional_redirect_urls`.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/candidates";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/admin/candidates`);
}
