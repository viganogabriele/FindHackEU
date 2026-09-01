import { europeanCountries } from "@/lib/european-countries";
import {
  SearchProvider,
  searchWithFallback,
} from "@/lib/search/search-provider";
import { extractEventEvidence } from "@/lib/search/extract-event-evidence";
import type { Database } from "@/types/database";

type CandidateInsert =
  Database["public"]["Tables"]["hackathon_candidates"]["Insert"];

/**
 * A small, curated set of European countries to build search queries
 * around, rather than every country in lib/european-countries.ts - this
 * keeps a single discovery run's query count (and therefore its search
 * API quota usage) predictable and bounded. Deliberately biased toward
 * countries with an active tech/startup scene, since that's where an
 * independent hackathon is actually likely to be organized and announced
 * online - not an attempt to rank countries by importance.
 */
const DEFAULT_COUNTRIES = [
  "Germany",
  "France",
  "Netherlands",
  "Spain",
  "Italy",
  "Poland",
  "Sweden",
  "Portugal",
  "Switzerland",
  "United Kingdom",
  "Austria",
  "Belgium",
  "Ireland",
  "Finland",
  "Denmark",
];

const QUERY_TEMPLATES = [
  (country: string, year: number) => `hackathon ${country} ${year}`,
  (country: string, year: number) => `student hackathon ${country} ${year}`,
];

export function generateQueries(
  maxQueries: number,
  countries: string[] = DEFAULT_COUNTRIES,
  now: Date = new Date(),
): string[] {
  const year = now.getUTCFullYear();
  const queries: string[] = [];

  outer: for (const country of countries) {
    for (const template of QUERY_TEMPLATES) {
      if (queries.length >= maxQueries) {
        break outer;
      }
      queries.push(template(country, year));
    }
  }

  return queries;
}

export interface DiscoverCandidatesOptions {
  providers: SearchProvider[];
  maxQueries: number;
  resultsPerQuery: number;
  /** Normalized URLs already known (existing hackathons + candidates) - skipped without spending a fetch. */
  knownUrls: Set<string>;
  countries?: string[];
}

export interface DiscoverCandidatesStats {
  queriesRun: number;
  resultsSeen: number;
  alreadyKnownSkipped: number;
  evidenceNotFound: number;
  nonEuropeanDropped: number;
  candidatesFound: number;
  queryErrors: string[];
}

/**
 * Runs a bounded set of search queries, extracts page evidence for each
 * new result URL, and returns candidate rows ready to insert as `pending`
 * — never anything ready to publish directly. See
 * docs/discovery-research.md and the hackathon_candidates migration for
 * why this is deliberately a review queue, not a parser feeding
 * app/api/update/route.ts.
 */
export async function discoverWebCandidates(
  options: DiscoverCandidatesOptions,
): Promise<{ candidates: CandidateInsert[]; stats: DiscoverCandidatesStats }> {
  const { providers, maxQueries, resultsPerQuery, knownUrls, countries } =
    options;

  const stats: DiscoverCandidatesStats = {
    queriesRun: 0,
    resultsSeen: 0,
    alreadyKnownSkipped: 0,
    evidenceNotFound: 0,
    nonEuropeanDropped: 0,
    candidatesFound: 0,
    queryErrors: [],
  };

  if (providers.length === 0) {
    throw new Error(
      "No search provider API keys configured (TAVILY_API_KEY / SERPAPI_API_KEY / SERPER_API_KEY) - cannot run web-search discovery.",
    );
  }

  const queries = generateQueries(maxQueries, countries);
  const candidates: CandidateInsert[] = [];
  const seenInThisRun = new Set<string>();

  for (const query of queries) {
    stats.queriesRun++;

    let searchOutcome;
    try {
      searchOutcome = await searchWithFallback(
        providers,
        query,
        resultsPerQuery,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stats.queryErrors.push(`[${query}] ${message}`);
      continue;
    }

    for (const result of searchOutcome.results) {
      stats.resultsSeen++;

      if (knownUrls.has(result.url) || seenInThisRun.has(result.url)) {
        stats.alreadyKnownSkipped++;
        continue;
      }
      seenInThisRun.add(result.url);

      let evidence;
      try {
        evidence = await extractEventEvidence(result.url);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Skipping candidate ${result.url}: ${message}`);
        continue;
      }

      if (!evidence) {
        stats.evidenceNotFound++;
        continue;
      }

      // evidence.country_code comes from JSON-LD's addressCountry, which is
      // typically a full country name (e.g. "India"), not a 2-letter code -
      // classifyCountryCode() is designed for exactly-2-letter codes vs.
      // free text and would wrongly call an unrecognized full name
      // "unrecognized" (ambiguous, don't drop) rather than "non_european"
      // (a real name that just isn't in Europe). Same fix as
      // DevfolioParser's explicit-country-name handling: an explicit,
      // non-empty country name that doesn't normalize to a European code
      // is dropped directly, not passed through classifyCountryCode().
      let country_code = europeanCountries.normalizeCountry(
        evidence.country_code,
      );

      if (evidence.country_code && !country_code) {
        stats.nonEuropeanDropped++;
        continue;
      }

      const city = europeanCountries.normalizeCity(evidence.city);

      if (!country_code && city) {
        country_code = europeanCountries.inferCountryFromCity(city);
      } else if (!city && !country_code) {
        // Last resort: JSON-LD/og-meta gave nothing usable for location -
        // try inferring from the query itself (e.g. "hackathon Germany
        // 2026"), same low-confidence tier as a known-city fallback
        // elsewhere in this codebase.
        const inferredFromQuery = europeanCountries.normalizeCountry(query);
        if (inferredFromQuery) {
          country_code = inferredFromQuery;
        }
      }

      candidates.push({
        name: evidence.name,
        city: city ?? null,
        country_code: country_code ?? null,
        date_start: evidence.date_start?.toISOString() ?? null,
        date_end: evidence.date_end?.toISOString() ?? null,
        url: result.url,
        query,
        search_provider: searchOutcome.provider,
        extraction_method: evidence.extraction_method,
        raw_snippet: evidence.raw_snippet,
      });
      stats.candidatesFound++;
    }
  }

  return { candidates, stats };
}
