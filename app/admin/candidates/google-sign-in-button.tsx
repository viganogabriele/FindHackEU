"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/services/supabase-auth-browser";

/**
 * "Sign in with Google" button shown by the /admin/candidates sign-in gate
 * (issue #67) when there is no authorized session. Kicks off Supabase
 * Auth's OAuth redirect flow; the browser comes back through
 * app/auth/callback/route.ts, which exchanges the auth code for a session
 * and redirects to /admin/candidates.
 *
 * Full sign-in was NOT verified end-to-end in this environment - it
 * requires a real Google Cloud OAuth client (see docs/admin-auth-setup.md),
 * which only the maintainer can create.
 */
export function GoogleSignInButton() {
  const [isPending, setIsPending] = useState(false);

  async function handleSignIn() {
    setIsPending(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin/candidates`,
      },
    });
  }

  return (
    <Button onClick={handleSignIn} disabled={isPending}>
      {isPending ? "Redirecting…" : "Sign in with Google"}
    </Button>
  );
}
