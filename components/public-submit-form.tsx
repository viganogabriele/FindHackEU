"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/translation-context";
import { HACKATHON_TOPICS } from "@/lib/constants/topics";
import { NO_AUTOFILL_PROPS } from "@/app/admin/candidates/form-utils";
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

const EMPTY_FIELDS = {
  url: "",
  name: "",
  city: "",
  countryCode: "",
  dateStart: "",
};

export function PublicSubmitForm() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [topics, setTopics] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function updateField(field: keyof typeof fields) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setFields((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/submit-hackathon", {
        method: "POST",
        body: new FormData(event.currentTarget),
      });
      const result = (await response.json()) as {
        outcome?: string;
        message?: string;
      };
      if (!response.ok || result.outcome !== "created") {
        setError(result.message ?? t("submit.error"));
        return;
      }
      toast.success(t("submit.success"));
      setOpen(false);
      setFields(EMPTY_FIELDS);
      setTopics([]);
    } catch {
      setError(t("submit.error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("submit.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("submit.title")}</DialogTitle>
          <DialogDescription>{t("submit.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="public-submit-url">{t("submit.url")} *</Label>
            <Input
              id="public-submit-url"
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
            <Label htmlFor="public-submit-name">{t("submit.name")} *</Label>
            <Input
              id="public-submit-name"
              name="name"
              required
              placeholder={t("submit.namePlaceholder")}
              value={fields.name}
              onChange={updateField("name")}
              {...NO_AUTOFILL_PROPS}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="public-submit-city">{t("submit.city")}</Label>
              <Input
                id="public-submit-city"
                name="city"
                placeholder={t("submit.optional")}
                value={fields.city}
                onChange={updateField("city")}
                {...NO_AUTOFILL_PROPS}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="public-submit-country">
                {t("submit.country")}
              </Label>
              <Input
                id="public-submit-country"
                name="countryCode"
                placeholder="e.g. Italy or IT"
                value={fields.countryCode}
                onChange={updateField("countryCode")}
                {...NO_AUTOFILL_PROPS}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="public-submit-date">{t("submit.date")}</Label>
            <Input
              id="public-submit-date"
              name="dateStart"
              type="date"
              value={fields.dateStart}
              onChange={updateField("dateStart")}
              {...NO_AUTOFILL_PROPS}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {t("submit.topics")}{" "}
              <span className="font-normal text-muted-foreground">
                ({t("submit.optional")})
              </span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {HACKATHON_TOPICS.map((topic) => {
                const selected = topics.includes(topic);
                return (
                  <Button
                    key={topic}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    aria-pressed={selected}
                    onClick={() =>
                      setTopics((current) =>
                        selected
                          ? current.filter((item) => item !== topic)
                          : [...current, topic],
                      )
                    }
                    className="h-auto px-2 py-0.5 text-xs"
                  >
                    {topic}
                  </Button>
                );
              })}
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
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? t("submit.submitting") : t("submit.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
