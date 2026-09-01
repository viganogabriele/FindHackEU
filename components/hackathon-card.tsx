"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useTranslation } from "@/contexts/translation-context";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  MapPin,
  Calendar as CalendarIcon,
  Heart,
  Sparkles,
} from "lucide-react";
import { europeanCountries } from "@/lib/european-countries";
import { getTopicDisplay } from "@/lib/constants/topics";
import { cn } from "@/lib/utils";
import {
  useBookmarksHydration,
  useBookmarksStore,
} from "@/lib/bookmarks-store";

/**
 * The subset of a `hackathons` row (see `types/hackathon.ts`) this card
 * needs to render - deliberately smaller than the full `Hackathon` type so
 * it can also be satisfied by a mapped `hackathon_candidates` row, which has
 * a different shape (no `location_type`/`venue`/`is_new`/`notes`, and a
 * nullable `date_start`). A full `Hackathon` is structurally assignable to
 * this type as-is; a candidate needs a small adapter first - see
 * `candidateToHackathonCardData` in
 * `app/admin/candidates/candidate-card-data.ts`.
 */
export interface HackathonCardData {
  id: string;
  name: string;
  url?: string;
  date_start: string | null;
  date_end?: string | null;
  city?: string | null;
  country_code?: string | null;
  location_type?: "physical" | "online" | "hybrid" | "tbd";
  topics?: string[] | null;
  notes?: string | null;
  is_new?: boolean;
  preview_image_url?: string | null;
}

interface HackathonCardProps {
  hackathon: HackathonCardData;
  /**
   * Footer content, e.g. the public site's Join+Share+Calendar buttons or
   * the admin review queue's Approve/Reject/Edit buttons. Nothing renders
   * below the topics when this is omitted.
   */
  actions?: ReactNode;
  /** Optional metadata row used by compact admin cards. */
  meta?: ReactNode;
  /** Render the card title as the event's external source link. */
  titleLink?: boolean;
  /** Use the tighter spacing needed by the admin review queue. */
  compact?: boolean;
  /** Replace public light-mode topic colors with admin theme tokens. */
  adminTheme?: boolean;
  className?: string;
}

/**
 * The hackathon card used across the public site (issue #93). Extracted out
 * of `components/hackathon-list.tsx`, where this markup used to live inline
 * - moving it here didn't change any classNames/structure so the public
 * site's own cards keep rendering identically; only the footer became a
 * swappable `actions` slot instead of hardcoded Share/Calendar buttons.
 */
export function HackathonCard({
  hackathon,
  actions,
  meta,
  titleLink = false,
  compact = false,
  adminTheme = false,
  className,
}: HackathonCardProps) {
  const { t, formatDateRange } = useTranslation();
  useBookmarksHydration();
  const isBookmarked = useBookmarksStore((state) =>
    state.bookmarkedIds.includes(hackathon.id),
  );
  const toggleBookmark = useBookmarksStore((state) => state.toggleBookmark);
  const locationType = hackathon.location_type ?? "tbd";

  return (
    <Card
      className={cn(
        "flex h-full flex-col border-border/80 transition-all duration-200 hover:border-border hover:shadow-md",
        compact && "gap-1 py-1",
        className,
      )}
    >
      <CardHeader className={cn(compact && "gap-1.5 px-4 py-2.5")}>
        {hackathon.preview_image_url && (
          <div className="relative aspect-[16/9] overflow-hidden rounded-md">
            <Image
              src={hackathon.preview_image_url}
              alt={hackathon.name}
              fill
              className="h-full w-full object-cover"
              loading="lazy"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        )}
        <div className="flex items-start justify-between gap-2">
          <CardTitle
            className={cn(
              "line-clamp-2 flex-1 leading-snug tracking-tight",
              compact && "text-[0.9375rem]",
            )}
          >
            {titleLink && hackathon.url ? (
              <a
                href={hackathon.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {hackathon.name}
              </a>
            ) : (
              hackathon.name
            )}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            {!adminTheme && !compact && (
              <button
                type="button"
                onClick={() => toggleBookmark(hackathon.id)}
                aria-label={t(
                  isBookmarked ? "bookmark.remove" : "bookmark.add",
                  { name: hackathon.name },
                )}
                aria-pressed={isBookmarked}
                title={t(isBookmarked ? "bookmark.remove" : "bookmark.add", {
                  name: hackathon.name,
                })}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Heart
                  className={cn(
                    "size-5",
                    isBookmarked && "fill-current text-red-500",
                  )}
                  aria-hidden="true"
                />
              </button>
            )}
            {hackathon.is_new && (
              <Badge
                variant="default"
                className={cn(
                  "shrink-0",
                  !adminTheme &&
                    "bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-sm hover:from-emerald-600 hover:to-teal-700",
                )}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                {t("badge.new")}
              </Badge>
            )}
          </div>
        </div>
        {meta}
        {hackathon.notes && hackathon.notes.trim() && (
          <CardDescription className="line-clamp-2">
            {hackathon.notes}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent
        className={cn("flex-1 space-y-4", compact && "space-y-2 px-4 py-2")}
      >
        <div className="space-y-2">
          <div
            className={cn(
              "flex flex-col items-start gap-4 md:flex-row md:items-center",
              compact && "gap-2.5",
            )}
          >
            {hackathon.date_start && (
              <div
                className={cn(
                  "flex items-center gap-2 text-sm text-muted-foreground md:w-1/2",
                  compact && "text-xs leading-5",
                )}
              >
                <CalendarIcon className="h-4 w-4 shrink-0" />
                <span>
                  {formatDateRange(hackathon.date_start, hackathon.date_end)}
                </span>
              </div>
            )}
            {hackathon.city || hackathon.country_code ? (
              <div
                className={cn(
                  "flex items-center gap-2 text-sm text-muted-foreground md:w-1/2",
                  compact && "text-xs leading-5",
                )}
              >
                <MapPin className="h-4 w-4 shrink-0" />
                <span>
                  {europeanCountries.formatLocation(
                    hackathon.city,
                    hackathon.country_code,
                  )}{" "}
                  {hackathon.country_code &&
                    europeanCountries.getCountryEmoji(hackathon.country_code)}
                </span>
              </div>
            ) : (
              // Issue #21: no city/country resolved (online/hybrid/tbd
              // event) - show a badge explaining why instead of leaving
              // blank space where a location would normally be.
              (locationType === "online" || locationType === "hybrid") && (
                <div
                  className={cn(
                    "flex items-center gap-2 text-sm text-muted-foreground md:w-1/2",
                    compact && "text-xs leading-5",
                  )}
                >
                  <MapPin className="h-4 w-4 shrink-0" />
                  <Badge variant="secondary" className="text-xs">
                    {locationType === "online"
                      ? t("location.online")
                      : t("location.hybrid")}
                  </Badge>
                </div>
              )
            )}
          </div>
        </div>

        {hackathon.topics && hackathon.topics.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {hackathon.topics
              .slice(0, 4)
              .map((topic: string, index: number) => {
                const topicConfig = getTopicDisplay(topic);
                return (
                  <Badge
                    key={`${topic}-${index}`}
                    variant="outline"
                    className={cn(
                      "text-xs",
                      adminTheme ? "admin-topic-badge" : topicConfig.color,
                    )}
                  >
                    {topicConfig.label}
                  </Badge>
                );
              })}
            {hackathon.topics.length > 4 && (
              <Badge variant="outline" className="text-xs">
                {`+${hackathon.topics.length - 4} ${t("topics.more")}`}
              </Badge>
            )}
          </div>
        )}
      </CardContent>

      {actions && (
        <CardFooter
          className={cn(
            "flex flex-col gap-2",
            compact && "flex-row gap-2 border-t border-border/70 px-4 py-2.5",
          )}
        >
          {actions}
        </CardFooter>
      )}
    </Card>
  );
}
