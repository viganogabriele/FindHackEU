"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/services/supabase-auth-browser";

/**
 * Small "Signed in as {email} · Sign out" element for an admin-page header
 * (issue #67).
 */
export function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignOut() {
    setIsPending(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      router.refresh();
    } catch {
      setErrorMessage("Unable to sign out. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
      <p className="flex items-center gap-2">
        <span>
          Signed in as <span className="font-medium">{email}</span>
        </span>
        <span aria-hidden="true">·</span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={handleSignOut}
          disabled={isPending}
        >
          {isPending ? "Signing out…" : "Sign out"}
        </Button>
      </p>
      {errorMessage && (
        <p role="alert" className="text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
