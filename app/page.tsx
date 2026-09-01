"use client";

import HackathonList from "@/components/hackathon-list";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Hackathon } from "@/types/hackathon";
import { FilterProvider } from "@/contexts/filter-context";
import { buildLocationOptions } from "@/lib/location-filter";
import { dedupeByNormalizedUrl } from "@/lib/dedup/url-normalizer";
import { useTranslation } from "@/contexts/translation-context";
import { AlertCircle } from "lucide-react";
import { FiltersPanel } from "@/components/filters-panel";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  const [upcoming, setUpcoming] = useState<Hackathon[]>([]);
  const [past, setPast] = useState<Hackathon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHackathons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // "estimated" (a status a hackathon can hold when it was approved
      // from a candidate with no recoverable structured date - see
      // lib/services/promote-candidate.ts) was never fetched here, so any
      // such hackathon was permanently invisible on the site despite being
      // a real, approved, published row (found from a real approved
      // event - Yellow Tech's "Hack The Peak" - not showing up after
      // approval). Folded into the `upcoming` bucket: from a visitor's
      // perspective "we know it's happening, just not exactly when" is a
      // form of upcoming, not a separate status worth its own UI section.
      const [upcomingRes, pastRes, estimatedRes] = await Promise.all([
        fetch("/api/hackathons?status=upcoming"),
        fetch("/api/hackathons?status=past"),
        fetch("/api/hackathons?status=estimated"),
      ]);

      if (!upcomingRes.ok || !pastRes.ok || !estimatedRes.ok) {
        const failedRes = !upcomingRes.ok
          ? upcomingRes
          : !pastRes.ok
            ? pastRes
            : estimatedRes;
        let message = `Request failed with status ${failedRes.status}`;
        try {
          const body = await failedRes.json();
          if (body && typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          // Response body wasn't JSON (or was empty) - keep the generic message.
        }
        throw new Error(message);
      }

      const upcomingData = await upcomingRes.json();
      const pastData = await pastRes.json();
      const estimatedData = await estimatedRes.json();

      setUpcoming(
        dedupeByNormalizedUrl([
          ...(upcomingData.data || []),
          ...(estimatedData.data || []),
        ]),
      );
      setPast(pastData.data || []);
    } catch (err) {
      console.error("Error fetching hackathons:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setUpcoming([]);
      setPast([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHackathons();
  }, [fetchHackathons]);

  const { uniqueUpcomingLocations, uniquePastLocations, uniqueTopics } =
    useMemo(() => {
      // Location options for each status, one country-wide entry per
      // distinct country plus every distinct "City, Country" combination
      // (issue #73 - lets a visitor filter by "all of Italy" instead of
      // picking every city one at a time).
      const upcomingLocations = buildLocationOptions(upcoming);
      const pastLocations = buildLocationOptions(past);

      const allHackathons = [...upcoming, ...past];
      const topics = Array.from(
        new Set(allHackathons.flatMap((h) => h.topics || [])),
      );

      return {
        uniqueUpcomingLocations: upcomingLocations,
        uniquePastLocations: pastLocations,
        uniqueTopics: topics.sort(),
      };
    }, [upcoming, past]);

  return (
    <FilterProvider
      locationOptionsByStatus={{
        upcoming: uniqueUpcomingLocations,
        past: uniquePastLocations,
      }}
    >
      <div className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {/* Translated header and subtitle */}
          <TranslatedHeader />
          <Separator className="my-6" />
          <FiltersPanel
            uniqueUpcomingLocations={uniqueUpcomingLocations}
            uniquePastLocations={uniquePastLocations}
            uniqueTopics={uniqueTopics}
          />
          {error ? (
            <ErrorState message={error} onRetry={fetchHackathons} />
          ) : (
            <HackathonList upcoming={upcoming} past={past} loading={loading} />
          )}
        </main>
        <SiteFooter />
      </div>
    </FilterProvider>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <div>
        <p className="font-medium text-destructive">{t("error.loadFailed")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry}>
        {t("error.retry")}
      </Button>
    </div>
  );
}

function TranslatedHeader() {
  const { t } = useTranslation();
  return (
    <div>
      <h1 className="mb-3 text-3xl font-bold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}
