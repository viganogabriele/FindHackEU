"use client";

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/contexts/translation-context";

export interface ActiveFilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilterChips({
  chips,
  className,
}: {
  chips: ActiveFilterChip[];
  className?: string;
}) {
  const { t } = useTranslation();
  if (chips.length === 0) return null;

  return (
    <div
      className={className ?? "flex flex-wrap gap-2"}
      aria-label={t("aria.activeFilters")}
    >
      {chips.map((chip) => (
        <Badge
          key={chip.id}
          variant="secondary"
          className="gap-1 py-1 pr-1 pl-2 text-xs font-medium"
        >
          <span className="max-w-52 truncate">{chip.label}</span>
          <button
            type="button"
            onClick={chip.onRemove}
            className="rounded-sm p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("aria.removeFilter", { filter: chip.label })}
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
