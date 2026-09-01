"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitManualCandidateFormAction } from "./actions";

/**
 * Manual URL submission (docs/discovery-research.md's "moderated URL
 * submission" idea) - for events no automated fetch/search can reach at
 * all, e.g. one only announced via a LinkedIn post (an unauthenticated
 * fetch to LinkedIn redirects to a login wall, verified live - there is
 * no page content to extract evidence from). The submitter types the
 * fields directly instead of relying on extraction; the result still
 * lands in the normal pending review queue, not straight into `hackathons`.
 */
export function ManualSubmitForm() {
  const [open, setOpen] = useState(false);
  const [result, formAction, isPending] = useActionState(
    submitManualCandidateFormAction,
    null,
  );

  // Close the dialog once a submission succeeds - adjusting state during
  // render (rather than in a useEffect) per React's documented pattern for
  // reacting to a value changing, guarded by comparing against the last
  // result seen so this only runs once per new result.
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    if (result?.outcome === "created") {
      setOpen(false);
    }
  }

  return (
    <div className="mb-6 flex justify-end">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Submit a URL manually
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit a URL manually</DialogTitle>
            <DialogDescription>
              Adds an event to the pending review queue below without running
              automated extraction.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="url">URL *</Label>
              <Input
                id="url"
                name="url"
                type="url"
                required
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" name="name" required placeholder="Event name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" placeholder="Optional" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="countryCode">Country</Label>
                <Input
                  id="countryCode"
                  name="countryCode"
                  placeholder="e.g. Italy or IT"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateStart">Start date</Label>
              <Input id="dateStart" name="dateStart" type="date" />
            </div>

            {result?.outcome === "created" && (
              <p className="text-sm text-green-600">
                Added to the pending queue below.
              </p>
            )}
            {result && result.outcome !== "created" && (
              <p className="text-sm text-destructive">{result.message}</p>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Submitting…" : "Add to review queue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
