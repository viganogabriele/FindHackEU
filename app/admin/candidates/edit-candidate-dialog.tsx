"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { Pencil } from "lucide-react";
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
import { editCandidateFormAction } from "./actions";
import type { Database } from "@/types/database";
import { toast } from "sonner";
import { NO_AUTOFILL_PROPS } from "@/lib/form-utils";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

/** `date_start` is a full ISO timestamp; `<input type="date">` needs `yyyy-mm-dd`. */
function toDateInputValue(dateStart: string | null): string {
  if (!dateStart) return "";
  const parsed = new Date(dateStart);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function fieldsFromCandidate(candidate: CandidateRow) {
  return {
    name: candidate.name,
    city: candidate.city ?? "",
    countryCode: candidate.country_code ?? "",
    dateStart: toDateInputValue(candidate.date_start),
  };
}

/**
 * Issue #94 - lets the maintainer correct a pending (or rejected)
 * candidate's name/date/city/country/topics before approving it, since
 * `promoteCandidate()` copies these fields as-is into the real `hackathons`
 * table on approval (see lib/services/edit-candidate.ts's doc comment).
 * Structurally a near-twin of `ManualSubmitForm` (same controlled-field
 * pattern, same toggleable-topic-badge picker, same `useActionState` +
 * "adjust state during render on a new result" close-on-success trick) -
 * reused deliberately per the issue's own suggestion rather than designing a
 * new form from scratch. The two differences: this edits an existing row
 * (so it's pre-filled from `candidate`, and its server action is bound to a
 * specific `candidateId`) and its URL is read-only (see
 * lib/services/edit-candidate.ts for why).
 */
export function EditCandidateDialog({
  candidate,
  disabled = false,
  disabledReason,
}: {
  candidate: CandidateRow;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(() => fieldsFromCandidate(candidate));
  const [topics, setTopics] = useState<string[]>(candidate.topics ?? []);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Reset to the candidate's current saved values each time the dialog
      // opens, in case a previous open was closed without saving.
      setFields(fieldsFromCandidate(candidate));
      setTopics(candidate.topics ?? []);
      setFormKey((key) => key + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title={disabledReason ?? "Edit candidate"}
          aria-label={disabledReason ?? "Edit candidate"}
          disabled={disabled}
        >
          <Pencil aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit candidate</DialogTitle>
          <DialogDescription>
            Correct the name, date, location, or topics before approving. The
            URL isn&apos;t editable here since it&apos;s this candidate&apos;s
            dedup identity - delete and re-submit manually if the URL itself is
            wrong.
          </DialogDescription>
        </DialogHeader>
        <EditCandidateForm
          key={formKey}
          candidate={candidate}
          fields={fields}
          topics={topics}
          setOpen={setOpen}
          setFields={setFields}
          setTopics={setTopics}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditCandidateForm({
  candidate,
  fields,
  topics,
  setOpen,
  setFields,
  setTopics,
}: {
  candidate: CandidateRow;
  fields: ReturnType<typeof fieldsFromCandidate>;
  topics: string[];
  setOpen: (open: boolean) => void;
  setFields: React.Dispatch<
    React.SetStateAction<ReturnType<typeof fieldsFromCandidate>>
  >;
  setTopics: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const boundAction = editCandidateFormAction.bind(null, candidate.id);
  const [result, formAction, isPending] = useActionState(boundAction, null);

  useEffect(() => {
    if (result?.outcome !== "updated") return;
    toast.success("Candidate saved");
    const closeTimeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(closeTimeout);
  }, [result, setOpen]);

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
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label>URL</Label>
        <p className="truncate rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {candidate.url}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-name">Name *</Label>
        <Input
          id="edit-name"
          name="name"
          required
          placeholder="Event name"
          value={fields.name}
          onChange={updateField("name")}
          {...NO_AUTOFILL_PROPS}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-city">City</Label>
          <Input
            id="edit-city"
            name="city"
            placeholder="Optional"
            value={fields.city}
            onChange={updateField("city")}
            {...NO_AUTOFILL_PROPS}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-countryCode">Country</Label>
          <Input
            id="edit-countryCode"
            name="countryCode"
            placeholder="e.g. Italy or IT"
            value={fields.countryCode}
            onChange={updateField("countryCode")}
            {...NO_AUTOFILL_PROPS}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-dateStart">Start date</Label>
        <Input
          id="edit-dateStart"
          name="dateStart"
          type="date"
          value={fields.dateStart}
          onChange={updateField("dateStart")}
          {...NO_AUTOFILL_PROPS}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Topics</Label>
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
          <input
            key={topic}
            type="hidden"
            name="topics"
            value={topic}
            {...NO_AUTOFILL_PROPS}
          />
        ))}
      </div>

      {result && result.outcome !== "updated" && (
        <p className="text-sm text-destructive">{result.message}</p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
