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

  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="relative flex shrink-0 items-center gap-2">
      <div className="hidden items-center gap-2 rounded-full border bg-muted/40 py-1 pr-3 pl-1 sm:flex">
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className="max-w-40 truncate text-xs text-muted-foreground" title={email}>
          {email}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        disabled={isPending}
      >
        {isPending ? "Signing out…" : "Sign out"}
      </Button>
      {errorMessage && (
        <p
          role="alert"
          className="absolute top-full right-0 mt-1.5 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-destructive shadow-md"
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
