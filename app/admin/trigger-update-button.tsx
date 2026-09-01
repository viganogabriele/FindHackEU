"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
 *
 * Issue #91: a misclick used to fire the pipeline immediately with no way to
 * undo it - a real run hits five external scraper sources and, depending on
 * the cooldown window (issue #77), can collide with a recent run. This now
 * asks for confirmation first, via the same `AlertDialog` pattern
 * `ConfirmDeleteButton` (components/confirm-delete-button.tsx) already uses,
 * before calling `trigger()`.
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={state.status === "loading"}
          >
            <RefreshCw
              className={cn(
                "mr-2 h-4 w-4 shrink-0",
                state.status === "loading" && "animate-spin",
              )}
            />
            <span className="min-w-0 truncate">
              {state.status === "loading"
                ? "Aggiornamento..."
                : "Trigger update"}
            </span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run the update pipeline?</AlertDialogTitle>
            <AlertDialogDescription>
              This runs the discovery pipeline now, always in test mode: no
              Discord/Telegram/Twitter notifications and no README/GitHub
              commit. It still hits five external scraper sources, so avoid
              triggering it repeatedly in a short window.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={trigger}>
              Trigger update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
