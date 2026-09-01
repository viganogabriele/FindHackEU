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
import { HACKATHON_TOPICS } from "@/lib/constants/topics";
import { submitManualCandidateFormAction } from "./actions";

const EMPTY_FIELDS = {
  url: "",
  name: "",
  city: "",
  countryCode: "",
  dateStart: "",
};

/**
 * Manual URL submission (docs/discovery-research.md's "moderated URL
 * submission" idea) - for events no automated fetch/search can reach at
 * all, e.g. one only announced via a LinkedIn post (an unauthenticated
 * fetch to LinkedIn redirects to a login wall, verified live - there is
 * no page content to extract evidence from). The submitter types the
 * fields directly instead of relying on extraction; the result still
 * lands in the normal pending review queue, not straight into `hackathons`.
 *
 * Fields are controlled (not left to the browser's default uncontrolled
 * `<input>` behavior) specifically because React resets a `<form>`'s
 * uncontrolled inputs after every action submission, success OR failure -
 * a validation error (e.g. an unrecognized country) used to silently wipe
 * everything the submitter had already typed, forcing a full retype
 * (found from a real report). Controlled state survives that reset;
 * fields are only cleared explicitly, on a real success.
 *
 * Topics are picked explicitly here (toggleable badges, submitted as
 * hidden `topics` inputs - one per selected topic) rather than relying
 * solely on `promoteCandidate()`'s title-based auto-extraction fallback -
 * a submitter who already knows the event is a much better source of
 * truth than a regex over a five-word title (found from a real question:
 * "shouldn't it ask me to set them?").
 */
export function ManualSubmitForm() {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [topics, setTopics] = useState<string[]>([]);
  const [result, formAction, isPending] = useActionState(
    submitManualCandidateFormAction,
    null,
  );

  // Close the dialog and clear the form once a submission succeeds -
  // adjusting state during render (rather than in a useEffect) per React's
  // documented pattern for reacting to a value changing, guarded by
  // comparing against the last result seen so this only runs once per new
  // result.
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    if (result?.outcome === "created") {
      setOpen(false);
      setFields(EMPTY_FIELDS);
      setTopics([]);
    }
  }

  function updateField(field: keyof typeof fields) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function toggleTopic(topic: string) {
    setTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
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
                value={fields.url}
                onChange={updateField("url")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Event name"
                value={fields.name}
                onChange={updateField("name")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  name="city"
                  placeholder="Optional"
                  value={fields.city}
                  onChange={updateField("city")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="countryCode">Country</Label>
                <Input
                  id="countryCode"
                  name="countryCode"
                  placeholder="e.g. Italy or IT"
                  value={fields.countryCode}
                  onChange={updateField("countryCode")}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateStart">Start date</Label>
              <Input
                id="dateStart"
                name="dateStart"
                type="date"
                value={fields.dateStart}
                onChange={updateField("dateStart")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Topics{" "}
                <span className="font-normal text-muted-foreground">
                  (optional - auto-detected from the name if left empty)
                </span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {HACKATHON_TOPICS.map((topic) => (
                  <Button
                    key={topic}
                    type="button"
                    variant={topics.includes(topic) ? "default" : "outline"}
                    size="sm"
                    aria-pressed={topics.includes(topic)}
                    onClick={() => toggleTopic(topic)}
                    className="h-auto px-2 py-0.5 text-xs"
                  >
                    {topic}
                  </Button>
                ))}
              </div>
              {topics.map((topic) => (
                <input key={topic} type="hidden" name="topics" value={topic} />
              ))}
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
