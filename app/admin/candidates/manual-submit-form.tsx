"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [result, formAction, isPending] = useActionState(
    submitManualCandidateFormAction,
    null,
  );

  return (
    <details className="mb-6 rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        Submit a URL manually
      </summary>
      <form action={formAction} className="mt-4 space-y-3">
        <div>
          <Label htmlFor="url">URL *</Label>
          <Input
            id="url"
            name="url"
            type="url"
            required
            placeholder="https://..."
          />
        </div>
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required placeholder="Event name" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city">City</Label>
            <Input id="city" name="city" placeholder="Optional" />
          </div>
          <div>
            <Label htmlFor="countryCode">Country</Label>
            <Input
              id="countryCode"
              name="countryCode"
              placeholder="e.g. Italy or IT"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="dateStart">Start date</Label>
          <Input id="dateStart" name="dateStart" type="date" />
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Submitting…" : "Add to review queue"}
        </Button>
        {result?.outcome === "created" && (
          <p className="text-sm text-green-600">
            Added to the pending queue below.
          </p>
        )}
        {result && result.outcome !== "created" && (
          <p className="text-sm text-destructive">{result.message}</p>
        )}
      </form>
    </details>
  );
}
