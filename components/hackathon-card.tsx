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
  Globe,
  Shuffle,
  CircleHelp,
} from "lucide-react";
import { europeanCountries } from "@/lib/european-countries";
import { getTopicDisplay } from "@/lib/constants/topics";
import { cn } from "@/lib/utils";
import { useBookmarksStore } from "@/lib/bookmarks-store";

/**
 * The subset of a `hackathons` row (see `types/hackathon.ts`) this card
 * needs to render - deliberately smaller than the full `Hackathon` type so
 * it can also be satisfied by a mapped `hackathon_candidates` row, which has
 * a different shape (no `location_type`/`venue`/`is_new`/`notes`, and a
 * nullable `date_start`). A full `Hackathon` is structurally assignable to
 * this type as-is; a candidate needs a small adapter first - see
 * `candidateToHackathonCardData` in
 * `app/admin/candidate-card-data.ts`.
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
  // Still present in the underlying data/pipeline (see app/api/update) -
  // deliberately no longer rendered as a badge on this card (maintainer
  // feedback: presentation-only removal, not a data change).
  is_new?: boolean;
  preview_image_url?: string | null;
}

/**
 * Icon + style per `location_type`. Deliberately not color-coded at all
 * (round 2 of the badge redesign, maintainer feedback: "online" still read
 * as a distinct hue and shouldn't) - a location type isn't good, bad, or a
 * category worth its own accent color, so every variant shares one flat,
 * neutral treatment (`bg-muted`/`text-muted-foreground`) and only the icon
 * + label differ. `tbd` keeps a dashed border to read as "unconfirmed"
 * without introducing color. Color is never the only signal either way
 * (WCAG 1.4.1). `physical` isn't listed here: it's implied by the
 * city/country text already shown next to it, so it gets no badge.
 */
const LOCATION_TYPE_BADGE = {
  online: {
    icon: Globe,
    className: "border-transparent bg-muted text-muted-foreground",
  },
  hybrid: {
    icon: Shuffle,
    className: "border-transparent bg-muted text-muted-foreground",
  },
  tbd: {
    icon: CircleHelp,
    className: "border-dashed text-muted-foreground",
  },
} as const;

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
  /**
   * Lets the long public list skip browser paint/layout for cards outside
   * the viewport. Compact cards, map popups, and calendar popovers keep
   * their natural sizing.
   */
  deferOffscreen?: boolean;
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
  deferOffscreen = false,
  className,
}: HackathonCardProps) {
  const { t, formatDateRange } = useTranslation();
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
          {/*
            The bookmark button's own hit-area (p-1.5 + a size-5 icon = 32px)
            is taller than a single line of the title text next to it, so
            top-aligning the two by their box edges (items-start on the row)
            left the heart visibly floating above the title's cap-height -
            most noticeable on a short, one-line title. Negative margins
            here pull the button's padding back into the title's own line
            box so the icon glyph (not the invisible padding around it)
            lines up with the first line of text, for both a one-line and a
            two-line (line-clamp-2) title - the hit target stays full size
            for touch/pointer users, only the visual alignment changes.
          */}
          {!adminTheme && !compact && (
            <button
              type="button"
              onClick={() => toggleBookmark(hackathon.id)}
              aria-label={t(isBookmarked ? "bookmark.remove" : "bookmark.add", {
                name: hackathon.name,
              })}
              aria-pressed={isBookmarked}
              title={t(isBookmarked ? "bookmark.remove" : "bookmark.add", {
                name: hackathon.name,
              })}
              className="-mt-1.5 -mr-1.5 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        </div>
        {meta}
        {hackathon.notes && hackathon.notes.trim() && (
          <CardDescription className="line-clamp-2">
            {hackathon.notes}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent
        className={cn(
          "flex-1 space-y-4",
          // Keep the outer card's real height in layout. Only its variable
          // metadata body is deferred, with estimates grouped by whether
          // topic badges exist (measured medians: 30px vs 64px). This avoids
          // the multi-hundred-pixel scroll-height corrections that occur
          // when the whole variable-height card is size-contained.
          deferOffscreen &&
            (hackathon.topics?.length
              ? "[content-visibility:auto] [contain-intrinsic-size:auto_4rem]"
              : "[content-visibility:auto] [contain-intrinsic-size:auto_1.875rem]"),
          compact && "space-y-2 px-4 py-2",
        )}
      >
        <div className="space-y-2">
          <div
            className={cn(
              // Was `flex-nowrap`: on a narrow card the date and the
              // location stayed on one line and both truncated to about
              // half ("10 Oct - 1..." / "Amster... IT"), which loses the
              // two things the card exists to tell you. They now wrap when
              // they don't fit and sit side by side again as soon as they
              // do - `gap-y-1.5` was already here for exactly that case.
              "flex flex-row flex-wrap items-center gap-x-3 gap-y-1.5",
              compact && "gap-x-2",
            )}
          >
            {hackathon.date_start && (
              <div
                className={cn(
                  "flex min-w-0 shrink items-center gap-2 text-sm text-muted-foreground",
                  compact && "text-xs leading-5",
                )}
              >
                <CalendarIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {formatDateRange(hackathon.date_start, hackathon.date_end)}
                </span>
              </div>
            )}
            {hackathon.city || hackathon.country_code ? (
              <div
                className={cn(
                  "flex min-w-0 shrink items-center gap-2 text-sm text-muted-foreground",
                  compact && "text-xs leading-5",
                )}
              >
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">
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
              locationType !== "physical" && (
                <div
                  className={cn(
                    "flex min-w-0 shrink items-center gap-2 text-sm text-muted-foreground",
                    compact && "text-xs leading-5",
                  )}
                >
                  <LocationTypeBadge type={locationType} />
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
                      "topic-chip",
                      adminTheme ? "admin-topic-badge" : topicConfig.color,
                    )}
                  >
                    {topicConfig.label}
                  </Badge>
                );
              })}
            {hackathon.topics.length > 4 && (
              <Badge variant="outline" className="topic-chip topic-chip-more">
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

function LocationTypeBadge({ type }: { type: "online" | "hybrid" | "tbd" }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = LOCATION_TYPE_BADGE[type];
  const label =
    type === "online"
      ? t("location.online")
      : type === "hybrid"
        ? t("location.hybrid")
        : t("location.tbd");
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full text-xs font-medium", className)}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
