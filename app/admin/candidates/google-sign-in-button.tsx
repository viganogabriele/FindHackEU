"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_ADMIN_AUTH_REDIRECT,
  isAdminAuthRedirectPath,
  type AdminAuthRedirectPath,
} from "@/lib/services/admin-auth-redirect";
import { createSupabaseBrowserClient } from "@/lib/services/supabase-auth-browser";

/**
 * "Sign in with Google" button shown by either admin sign-in gate (issue #67)
 * when there is no authorized session. Kicks off Supabase
 * Auth's OAuth redirect flow; the browser comes back through
 * app/auth/callback/route.ts, which exchanges the auth code for a session
 * and redirects to the requested allowlisted admin page.
 *
 * Full sign-in was NOT verified end-to-end in this environment - it
 * requires a real Google Cloud OAuth client (see docs/admin-auth-setup.md),
 * which only the maintainer can create.
 */
export function GoogleSignInButton({
  next = DEFAULT_ADMIN_AUTH_REDIRECT,
}: {
  next?: AdminAuthRedirectPath;
}) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignIn() {
    setIsPending(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const nextPath = isAdminAuthRedirectPath(next)
        ? next
        : DEFAULT_ADMIN_AUTH_REDIRECT;
      const redirectUrl = new URL("/auth/callback", window.location.origin);
      redirectUrl.searchParams.set("next", nextPath);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl.toString() },
      });

      if (error) {
        throw error;
      }
    } catch {
      setErrorMessage("Unable to start Google sign-in. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={handleSignIn} disabled={isPending}>
        {isPending ? "Redirecting…" : "Sign in with Google"}
      </Button>
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
