"use client";

import { useActionState, useEffect } from "react";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { moveCandidateToPendingAction } from "./actions";

export function MoveCandidateToPendingButton({
  candidateId,
}: {
  candidateId: string;
}) {
  const [result, formAction, isPending] = useActionState(
    moveCandidateToPendingAction.bind(null, candidateId),
    null,
  );

  useEffect(() => {
    if (!result) return;

    if (result.outcome === "updated") {
      toast.success("Candidate moved to pending");
    } else if (result.outcome === "unchanged") {
      toast.message("Candidate was already outside rejected status");
    } else if (result.outcome === "not_found") {
      toast.error("Candidate was not found");
    } else {
      toast.error(result.message);
    }
  }, [result]);

  return (
    <form action={formAction}>
      <Button
        type="submit"
        variant="outline"
        size="icon"
        title="Move to pending"
        aria-label="Move to pending"
        disabled={isPending}
      >
        <Clock3 aria-hidden="true" />
      </Button>
    </form>
  );
}
