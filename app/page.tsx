"use client";

import HackathonList from "@/components/hackathon-list";
import Sidebar from "@/components/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Hackathon } from "@/types/hackathon";
import { FilterProvider } from "@/contexts/filter-context";
import { europeanCountries } from "@/lib/european-countries";
import { useTranslation } from "@/contexts/translation-context";
import LanguageSelect from "@/components/language-select";
import { AlertCircle } from "lucide-react";

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

      setUpcoming([
        ...(upcomingData.data || []),
        ...(estimatedData.data || []),
      ]);
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
      // Genera le location uniche per eventi upcoming
      const upcomingLocations = Array.from(
        new Set(
          upcoming
            .map((h) =>
              europeanCountries.formatLocation(h.city, h.country_code),
            )
            .filter((loc): loc is string => Boolean(loc)),
        ),
      );

      // Genera le location uniche per eventi past
      const pastLocations = Array.from(
        new Set(
          past
            .map((h) =>
              europeanCountries.formatLocation(h.city, h.country_code),
            )
            .filter((loc): loc is string => Boolean(loc)),
        ),
      );

      const allHackathons = [...upcoming, ...past];
      const topics = Array.from(
        new Set(allHackathons.flatMap((h) => h.topics || [])),
      );

      return {
        uniqueUpcomingLocations: upcomingLocations.sort(),
        uniquePastLocations: pastLocations.sort(),
        uniqueTopics: topics.sort(),
      };
    }, [upcoming, past]);

  return (
    <FilterProvider>
      <div className="flex min-h-screen">
        <Sidebar
          uniqueUpcomingLocations={uniqueUpcomingLocations}
          uniquePastLocations={uniquePastLocations}
          uniqueTopics={uniqueTopics}
        />
        <main className="ml-16 flex-1 p-8 md:ml-60">
          {/* Translated header and subtitle */}
          <TranslatedHeader />
          <Separator className="my-6" />
          {error ? (
            <ErrorState message={error} onRetry={fetchHackathons} />
          ) : (
            <HackathonList upcoming={upcoming} past={past} loading={loading} />
          )}
        </main>
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
    <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h1 className="mb-3 text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <div className="flex items-center md:ml-auto">
        <LanguageSelect />
      </div>
    </div>
  );
}
