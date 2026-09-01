"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AUTO_PUBLISH_BLOCKER_TAGS,
  type AutoPublishBlockerCode,
} from "@/lib/discovery/auto-publish-blockers";

/** URL-backed pending-reason filter with no separate Apply step. */
export function PendingReasonFilter({
  query,
  selectedCodes,
}: {
  query: string;
  selectedCodes: AutoPublishBlockerCode[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState(selectedCodes);

  useEffect(() => {
    setSelected(selectedCodes);
  }, [selectedCodes]);

  function updateReason(code: AutoPublishBlockerCode, checked: boolean) {
    const next = checked
      ? [...selected, code]
      : selected.filter((selectedCode) => selectedCode !== code);
    setSelected(next);

    const params = new URLSearchParams(searchParams.toString());
    params.set("status", "pending");
    if (query) params.set("q", query);
    else params.delete("q");
    params.delete("reason");
    next.forEach((reason) => params.append("reason", reason));

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function clearReasons() {
    setSelected([]);
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", "pending");
    params.delete("reason");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={selected.length > 0 ? "secondary" : "outline"}
          size="sm"
          aria-label="Filter pending candidates by reason"
        >
          <SlidersHorizontal aria-hidden="true" />
          Reasons
          {selected.length > 0 && (
            <Badge variant="outline" className="min-w-5 justify-center px-1">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
      >
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Filter by pending reason
          </legend>
          <div className="grid gap-1">
            {AUTO_PUBLISH_BLOCKER_TAGS.map((tag) => (
              <label
                key={tag.code}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <input
                  type="checkbox"
                  value={tag.code}
                  checked={selected.includes(tag.code)}
                  onChange={(event) =>
                    updateReason(tag.code, event.target.checked)
                  }
                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
                <Badge
                  variant={selected.includes(tag.code) ? "default" : "outline"}
                >
                  {tag.label}
                </Badge>
              </label>
            ))}
          </div>
        </fieldset>
        {selected.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={clearReasons}
          >
            Clear reasons
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
