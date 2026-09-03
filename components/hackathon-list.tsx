"use client";

import { useTranslation } from "@/contexts/translation-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { ExportCalendarDropdown } from "@/components/export-calendar-dropdown";
import { ShareHackathonDropdown } from "@/components/share-hackathon-dropdown";
import { HackathonCard } from "@/components/hackathon-card";
import { Hackathon } from "@/types/hackathon";
import Link from "next/link";
import { useFilters } from "@/contexts/filter-context";

interface HackathonListProps {
  upcoming: Hackathon[];
  past: Hackathon[];
  loading: boolean;
  filteredHackathons?: Hackathon[];
}

/**
 * The public site's own card - a thin wrapper around the shared
 * `HackathonCard` (components/hackathon-card.tsx, extracted from this file
 * by issue #93) that supplies the Join+Share+Calendar (or just Share for
 * past events) footer as the card's `actions` slot. A full `Hackathon` row
 * satisfies `HackathonCardData` as-is, so no mapping is needed here (unlike
 * the admin candidate card - see app/admin/candidate-card-data.ts).
 *
 * Declared at module scope, NOT inside `HackathonList`'s render body. A
 * component defined during render gets a brand-new function identity on
 * every render, and React compares element types by identity - so every
 * card in the list was being unmounted and remounted whenever anything
 * re-rendered `HackathonList`. Typing a single character in the search box
 * updates the filter context, which re-renders this list, which threw away
 * and rebuilt the DOM for every visible hackathon. Same failure mode as the
 * one fixed in `FiltersPanel` (PR #27), on a much larger subtree.
 */
function PublicHackathonCard({
  hackathon,
  status,
}: {
  hackathon: Hackathon;
  status: "upcoming" | "past";
}) {
  const { t } = useTranslation();

  return (
    <HackathonCard
      hackathon={hackathon}
      // There can be hundreds of cards in this list. Other consumers keep
      // natural sizing because their containers have different constraints.
      deferOffscreen
      actions={
        <>
          {status === "upcoming" && (
            <>
              <Button asChild className="w-full">
                <Link
                  href={hackathon.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("aria.register", { name: hackathon.name })}
                >
                  {t("action.join")} <ExternalLink className="ml-1 h-4 w-4" />
                </Link>
              </Button>

              <div className="grid grid-cols-2 gap-2 w-full">
                <ShareHackathonDropdown hackathon={hackathon} />
                <ExportCalendarDropdown hackathon={hackathon} />
              </div>
            </>
          )}

          {status === "past" && (
            <ShareHackathonDropdown hackathon={hackathon} />
          )}
        </>
      }
    />
  );
}

export default function HackathonList({
  upcoming,
  past,
  loading,
  filteredHackathons,
}: HackathonListProps) {
  const { t } = useTranslation();
  const { filters } = useFilters();
  const currentHackathons =
    filteredHackathons ?? (filters.status === "upcoming" ? upcoming : past);

  // formatDate is provided by the translation context (formatDateRange)

  if (loading) {
    return (
      <div className="w-full">
        <div className="mb-6">
          <Skeleton className="mb-2 h-7 w-48" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="flex h-full flex-col">
              <CardHeader>
                <Skeleton className="h-6 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                    <div className="flex md:w-1/2 items-center gap-2">
                      <Skeleton className="h-4 w-4 shrink-0" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="flex md:w-1/2 items-center gap-2">
                      <Skeleton className="h-4 w-4 shrink-0" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-14" />
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Skeleton className="h-9 w-full" />
                {filters.status === "upcoming" && (
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                )}
                {filters.status === "past" && (
                  <Skeleton className="h-8 w-full" />
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h2 className="mb-2 text-xl font-semibold">
          {filters.status === "upcoming"
            ? t("header.upcoming")
            : t("header.past")}{" "}
          {t("header.hackathons")}
        </h2>
        <p className="text-muted-foreground">
          {currentHackathons.length}{" "}
          {t("header.found", { count: currentHackathons.length })}
        </p>
      </div>

      {currentHackathons.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          <p>{t("noResults.message")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {currentHackathons.map((hackathon) => (
            <PublicHackathonCard
              key={hackathon.id}
              hackathon={hackathon}
              status={filters.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}
