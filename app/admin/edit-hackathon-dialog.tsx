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
import { editHackathonFormAction } from "./hackathons/actions";
import type { Database } from "@/types/database";
import { toast } from "sonner";
import { NO_AUTOFILL_PROPS } from "@/lib/form-utils";

type HackathonRow = Database["public"]["Tables"]["hackathons"]["Row"];

/** `date_start` is a full ISO timestamp; `<input type="date">` needs `yyyy-mm-dd`. */
function toDateInputValue(dateStart: string): string {
  const parsed = new Date(dateStart);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function fieldsFromHackathon(hackathon: HackathonRow) {
  return {
    url: hackathon.url,
    name: hackathon.name,
    city: hackathon.city ?? "",
    countryCode: hackathon.country_code ?? "",
    dateStart: toDateInputValue(hackathon.date_start),
  };
}

/**
 * Issue #103 - edits a published `hackathons` row in place. This follows the
 * controlled fields, topic badges, `useActionState`, and close-on-success
 * pattern from `EditCandidateDialog` (issue #94), but the source URL is
 * editable here because a published row has no candidate promotion identity
 * to preserve. The server still validates it as a public HTTP(S) URL.
 */
export function EditHackathonDialog({
  hackathon,
}: {
  hackathon: HackathonRow;
}) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(() => fieldsFromHackathon(hackathon));
  const [topics, setTopics] = useState<string[]>(hackathon.topics ?? []);
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Reset to the latest saved values whenever the dialog opens, including
      // after the server-rendered card has received an edit.
      setFields(fieldsFromHackathon(hackathon));
      setTopics(hackathon.topics ?? []);
      setFormKey((key) => key + 1);
    }
  }

  const fieldIds = {
    url: `edit-hackathon-url-${hackathon.id}`,
    name: `edit-hackathon-name-${hackathon.id}`,
    city: `edit-hackathon-city-${hackathon.id}`,
    countryCode: `edit-hackathon-country-${hackathon.id}`,
    dateStart: `edit-hackathon-date-${hackathon.id}`,
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Edit hackathon"
          aria-label="Edit hackathon"
        >
          <Pencil aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit hackathon</DialogTitle>
          <DialogDescription>
            Correct the name, date, location, topics, or source URL. The URL
            must be a public HTTP(S) address.
          </DialogDescription>
        </DialogHeader>
        <EditHackathonForm
          key={formKey}
          hackathon={hackathon}
          fields={fields}
          topics={topics}
          setOpen={setOpen}
          setFields={setFields}
          setTopics={setTopics}
          fieldIds={fieldIds}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditHackathonForm({
  hackathon,
  fields,
  topics,
  setOpen,
  setFields,
  setTopics,
  fieldIds,
}: {
  hackathon: HackathonRow;
  fields: ReturnType<typeof fieldsFromHackathon>;
  topics: string[];
  setOpen: (open: boolean) => void;
  setFields: React.Dispatch<
    React.SetStateAction<ReturnType<typeof fieldsFromHackathon>>
  >;
  setTopics: React.Dispatch<React.SetStateAction<string[]>>;
  fieldIds: Record<keyof ReturnType<typeof fieldsFromHackathon>, string>;
}) {
  const boundAction = editHackathonFormAction.bind(null, hackathon.id);
  const [result, formAction, isPending] = useActionState(boundAction, null);

  useEffect(() => {
    if (result?.outcome !== "updated") return;
    toast.success("Hackathon saved");
    const closeTimeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(closeTimeout);
  }, [result, setOpen]);

  function updateField(field: keyof typeof fields) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setFields((previous) => ({ ...previous, [field]: e.target.value }));
  }

  function toggleTopic(topic: string) {
    setTopics((previous) =>
      previous.includes(topic)
        ? previous.filter((selected) => selected !== topic)
        : [...previous, topic],
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={fieldIds.url}>URL *</Label>
        <Input
          id={fieldIds.url}
          name="url"
          type="url"
          required
          placeholder="https://..."
          value={fields.url}
          onChange={updateField("url")}
          {...NO_AUTOFILL_PROPS}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={fieldIds.name}>Name *</Label>
        <Input
          id={fieldIds.name}
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
          <Label htmlFor={fieldIds.city}>City</Label>
          <Input
            id={fieldIds.city}
            name="city"
            placeholder="Optional"
            value={fields.city}
            onChange={updateField("city")}
            {...NO_AUTOFILL_PROPS}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={fieldIds.countryCode}>Country</Label>
          <Input
            id={fieldIds.countryCode}
            name="countryCode"
            placeholder="e.g. Italy or IT"
            value={fields.countryCode}
            onChange={updateField("countryCode")}
            {...NO_AUTOFILL_PROPS}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={fieldIds.dateStart}>Start date *</Label>
        <Input
          id={fieldIds.dateStart}
          name="dateStart"
          type="date"
          required
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
        <p role="alert" aria-live="polite" className="text-sm text-destructive">
          {result.message}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
