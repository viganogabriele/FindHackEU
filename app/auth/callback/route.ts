import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/services/supabase-auth-server";
import {
  DEFAULT_ADMIN_AUTH_REDIRECT,
  getSafeAdminAuthRedirect,
} from "@/lib/services/admin-auth-redirect";
import { applySupabaseSessionHeaders } from "@/lib/services/supabase-session-headers";

/**
 * Supabase Auth OAuth callback (issue #67). Used by both development-only
 * admin sign-in flows: `GoogleSignInButton` sends the browser here with a
 * validated `next` path after Google redirects back to
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
  const next = getSafeAdminAuthRedirect(origin, searchParams.get("next"));

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const response = NextResponse.redirect(new URL(next, origin));
        applySupabaseSessionHeaders(response.headers);
        return response;
      }
    } catch {
      // Deliberately avoid reflecting provider or exchange details in the URL.
    }
  }

  const errorUrl = new URL(DEFAULT_ADMIN_AUTH_REDIRECT, origin);
  errorUrl.searchParams.set("error", "oauth_callback_failed");
  const response = NextResponse.redirect(errorUrl);
  applySupabaseSessionHeaders(response.headers);
  return response;
}
