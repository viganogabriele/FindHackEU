"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A submit button for a server-action form that asks for confirmation
 * before submitting, since the actions it's paired with (deleting a
 * candidate or a published hackathon) are permanent, not reversible like
 * Reject. A plain <button type="submit"> with no confirmation risked an
 * accidental permanent deletion from a single misclick.
 */
export function ConfirmDeleteButton({
  confirmMessage,
}: {
  confirmMessage: string;
}) {
  return (
    <Button
      type="submit"
      variant="ghost"
      size="icon"
      title="Delete permanently"
      onClick={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  );
}
