"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
 * A submit button for a server-action form that asks for confirmation
 * before submitting, since the actions it's paired with (deleting a
 * candidate or a published hackathon) are permanent, not reversible like
 * Reject. A plain <button type="submit"> with no confirmation risked an
 * accidental permanent deletion from a single misclick.
 */
export function ConfirmDeleteButton({
  confirmMessage,
  disabled = false,
  disabledReason,
}: {
  confirmMessage: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="destructive"
          size="icon"
          title={disabledReason ?? "Delete permanently"}
          aria-label={disabledReason ?? "Delete permanently"}
          disabled={disabled}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete permanently?</AlertDialogTitle>
          <AlertDialogDescription>{confirmMessage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              triggerRef.current?.form?.requestSubmit();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
