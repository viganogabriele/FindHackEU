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
    <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span className="hidden max-w-48 truncate sm:inline" title={email}>
          Signed in as <span className="font-medium">{email}</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={handleSignOut}
          disabled={isPending}
        >
          {isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>
      {errorMessage && (
        <p role="alert" className="text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
