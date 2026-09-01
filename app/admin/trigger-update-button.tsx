"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Manual pipeline trigger (issue #81), moved here from the public sidebar's
 * `DevTriggerUpdateButton` (`components/sidebar.tsx`). Same client-side
 * behaviour - POST /api/dev/trigger-update, always in test mode - but now
 * only reachable through this authenticated /admin dashboard instead of a
 * button any visitor running the app locally could see and click. The real
 * security boundary is server-side: the page this renders on is gated by
 * `getAdminAuthStatus()`/`requireAdminAuth()`, and the backing route itself
 * now also calls `requireAdminAuth()` (see app/api/dev/trigger-update/route.ts)
 * so the endpoint isn't reachable by a direct request either.
 */
export function TriggerUpdateButton() {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; parsed: number; inserted: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  const trigger = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/dev/trigger-update", { method: "POST" });
      const body = await res.json();
      if (!res.ok || body.success === false) {
        setState({
          status: "error",
          message: body.error || "Update failed",
        });
        return;
      }
      setState({
        status: "done",
        parsed: body.parsed ?? 0,
        inserted: body.inserted ?? 0,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Update failed",
      });
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={trigger}
        disabled={state.status === "loading"}
      >
        <RefreshCw
          className={cn(
            "mr-2 h-4 w-4 shrink-0",
            state.status === "loading" && "animate-spin",
          )}
        />
        <span className="min-w-0 truncate">
          {state.status === "loading" ? "Aggiornamento..." : "Trigger update"}
        </span>
      </Button>
      {state.status === "done" && (
        <p className="text-xs text-muted-foreground">
          {state.parsed} trovati, {state.inserted} nuovi
        </p>
      )}
      {state.status === "error" && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
    </div>
  );
}
