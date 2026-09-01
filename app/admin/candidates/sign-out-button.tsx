"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/services/supabase-auth-browser";

/**
 * Small "Signed in as {email} · Sign out" element for the /admin/candidates
 * header (issue #67).
 */
export function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleSignOut() {
    setIsPending(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
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
  );
}
