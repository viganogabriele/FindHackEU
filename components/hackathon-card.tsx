"use client";

import type { ReactNode } from "react";
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
import { MapPin, Calendar as CalendarIcon, Sparkles } from "lucide-react";
import { europeanCountries } from "@/lib/european-countries";
import { getTopicDisplay } from "@/lib/constants/topics";
import { cn } from "@/lib/utils";

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
  date_start: string | null;
  date_end?: string | null;
  city?: string | null;
  country_code?: string | null;
  location_type?: "physical" | "online" | "hybrid" | "tbd";
  topics?: string[] | null;
  notes?: string | null;
  is_new?: boolean;
}

interface HackathonCardProps {
  hackathon: HackathonCardData;
  /**
   * Footer content, e.g. the public site's Join+Share+Calendar buttons or
   * the admin review queue's Approve/Reject/Edit buttons. Nothing renders
   * below the topics when this is omitted.
   */
  actions?: ReactNode;
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
  className,
}: HackathonCardProps) {
  const { t, formatDateRange } = useTranslation();
  const locationType = hackathon.location_type ?? "tbd";

  return (
    <Card
      className={cn(
        "flex h-full flex-col transition-all duration-200 hover:shadow-lg",
        className,
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-2 flex-1">
            {hackathon.name}
          </CardTitle>
          {hackathon.is_new && (
            <Badge
              variant="default"
              className="shrink-0 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              {t("badge.new")}
            </Badge>
          )}
        </div>
        {hackathon.notes && hackathon.notes.trim() && (
          <CardDescription className="line-clamp-2">
            {hackathon.notes}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            {hackathon.date_start && (
              <div className="flex md:w-1/2 items-center gap-2 text-sm text-muted-foreground">
                <CalendarIcon className="h-4 w-4 shrink-0" />
                <span>
                  {formatDateRange(hackathon.date_start, hackathon.date_end)}
                </span>
              </div>
            )}
            {hackathon.city || hackathon.country_code ? (
              <div className="flex md:w-1/2 items-center gap-2 text-sm text-muted-foreground">
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
                <div className="flex md:w-1/2 items-center gap-2 text-sm text-muted-foreground">
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
          <div className="flex flex-wrap gap-1.5">
            {hackathon.topics
              .slice(0, 4)
              .map((topic: string, index: number) => {
                const topicConfig = getTopicDisplay(topic);
                return (
                  <Badge
                    key={`${topic}-${index}`}
                    variant="outline"
                    className={`text-xs border ${topicConfig.color}`}
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
        <CardFooter className="flex flex-col gap-2">{actions}</CardFooter>
      )}
    </Card>
  );
}
