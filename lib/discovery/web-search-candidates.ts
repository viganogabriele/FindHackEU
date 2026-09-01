import {
  europeanCountries,
  EUROPEAN_COUNTRIES,
} from "@/lib/european-countries";
import {
  SearchProvider,
  searchWithFallback,
} from "@/lib/search/search-provider";
import { classifyAndFetchPage } from "@/lib/discovery/fetch-classifier";
import { createRobotsCache } from "@/lib/discovery/robots-checker";
import type { QueryBudget } from "@/lib/discovery/query-budget";
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

interface QueryTemplateContext {
  country: string;
  nativeName?: string;
  year: number;
}

/** English-language templates, tried first for every country (issue #17). */
const ENGLISH_QUERY_TEMPLATES: Array<
  (ctx: QueryTemplateContext) => string | undefined
> = [
  (ctx) => `hackathon ${ctx.country} ${ctx.year}`,
  (ctx) => `student hackathon ${ctx.country} ${ctx.year}`,
];

/**
 * Native-language template - only produces a query when a native-language
 * name could be derived for the country (see `getNativeCountryName`).
 * Kept as a distinct, always-last template (rather than folded into
 * `ENGLISH_QUERY_TEMPLATES`) so English queries are never pushed out of a
 * small `maxQueries` budget by a native-language variant.
 */
const NATIVE_LANGUAGE_QUERY_TEMPLATE = (
  ctx: QueryTemplateContext,
): string | undefined =>
  ctx.nativeName ? `hackathon ${ctx.nativeName} ${ctx.year}` : undefined;

const QUERY_TEMPLATES = [
  ...ENGLISH_QUERY_TEMPLATES,
  NATIVE_LANGUAGE_QUERY_TEMPLATE,
];

/**
 * A small, explicitly-curated starting list of known European
 * university/hackathon-community domains, used to build `site:`-scoped
 * queries (issue #17). This is illustrative, not exhaustive - a hand-picked
 * sample of real institutions with an active tech/hackathon scene,
 * informed by this fork's discovery research (see
 * docs/discovery-research.md's "Allowlist domains" section) rather than a
 * survey of every European university. Extend as more organizer domains
 * are identified.
 */
const SITE_SCOPED_DOMAINS = [
  "ethz.ch",
  "epfl.ch",
  "tum.de",
  "tudelft.nl",
  "kth.se",
  "polimi.it",
  "imperial.ac.uk",
  "aalto.fi",
];

function findCountryEntry(countryName: string) {
  const key = countryName.trim().toLowerCase();
  return EUROPEAN_COUNTRIES.find(
    (c) =>
      c.name.toLowerCase() === key ||
      c.aliases.some((alias) => alias.toLowerCase() === key),
  );
}

function capitalizeWords(value: string): string {
  return value.replace(/(^|\s)\p{L}/gu, (match) => match.toUpperCase());
}

/**
 * Derives a "native-language" query variant for a country by reusing the
 * alias data already in `lib/european-countries.ts`'s `EUROPEAN_COUNTRIES`
 * (issue #17 - "reuse the exact data #17 wants", not a hand-maintained
 * translation table). Picks the first alias that (a) isn't just the
 * English country name repeated and (b) isn't a short ISO-code-shaped
 * alias (2/3 letters, e.g. "de"/"deu") - those are codes, not words. For
 * some countries (e.g. France, Portugal) no such alias exists in the data
 * and no native-language variant is produced for them.
 */
function getNativeCountryName(countryName: string): string | undefined {
  const entry = findCountryEntry(countryName);
  if (!entry) {
    return undefined;
  }

  const key = countryName.trim().toLowerCase();
  for (const alias of entry.aliases) {
    if (alias.toLowerCase() === key || alias.length <= 3) {
      continue;
    }
    return capitalizeWords(alias);
  }

  return undefined;
}

export function generateQueries(
  maxQueries: number,
  countries: string[] = DEFAULT_COUNTRIES,
  now: Date = new Date(),
): string[] {
  const year = now.getUTCFullYear();
  const queries: string[] = [];

  outer: for (const country of countries) {
    const nativeName = getNativeCountryName(country);
    for (const template of QUERY_TEMPLATES) {
      if (queries.length >= maxQueries) {
        break outer;
      }
      const query = template({ country, nativeName, year });
      if (query) {
        queries.push(query);
      }
    }
  }

  for (const domain of SITE_SCOPED_DOMAINS) {
    if (queries.length >= maxQueries) {
      break;
    }
    queries.push(`hackathon site:${domain}`);
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
  /**
   * Persistent cross-run query-budget tracker (issue #18). Optional so
   * existing/new unit tests don't need to touch the real filesystem - omit
   * it (or pass an in-memory fake) to run unbounded. When provided,
   * `discoverWebCandidates` checks `remaining()` before each query and
   * stops issuing new ones once it reaches zero, recording how many were
   * skipped rather than silently truncating.
   */
  budget?: QueryBudget;
}

export interface DiscoverCandidatesStats {
  queriesRun: number;
  resultsSeen: number;
  alreadyKnownSkipped: number;
  evidenceNotFound: number;
  nonEuropeanDropped: number;
  candidatesFound: number;
  queryErrors: string[];
  /** Never fetched because robots.txt disallows the path for user-agent `*` (issue #16). */
  blockedByRobots: number;
  /** Fetched but returned a non-2xx status (or a non-timeout network error). */
  httpErrors: number;
  /** The fetch itself timed out (see lib/http/fetch-with-retry.ts). */
  timeouts: number;
  /** Fetched fine, but the body heuristically looks like a JS-only SPA with no server-rendered content. */
  requiresJs: number;
  /** How many generated queries were never run because the daily budget (issue #18) was exhausted mid-run. */
  queriesSkippedForBudget: number;
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
): Promise<{
  candidates: CandidateInsert[];
  stats: DiscoverCandidatesStats;
  queries: string[];
}> {
  const {
    providers,
    maxQueries,
    resultsPerQuery,
    knownUrls,
    countries,
    budget,
  } = options;

  const stats: DiscoverCandidatesStats = {
    queriesRun: 0,
    resultsSeen: 0,
    alreadyKnownSkipped: 0,
    evidenceNotFound: 0,
    nonEuropeanDropped: 0,
    candidatesFound: 0,
    queryErrors: [],
    blockedByRobots: 0,
    httpErrors: 0,
    timeouts: 0,
    requiresJs: 0,
    queriesSkippedForBudget: 0,
  };

  if (providers.length === 0) {
    throw new Error(
      "No search provider API keys configured (TAVILY_API_KEY / SERPAPI_API_KEY / SERPER_API_KEY) - cannot run web-search discovery.",
    );
  }

  const queries = generateQueries(maxQueries, countries);
  const candidates: CandidateInsert[] = [];
  const seenInThisRun = new Set<string>();
  // One robots.txt cache per discovery run (issue #16) - shared across
  // every query/result in this call so the same host's robots.txt is
  // fetched at most once per run, not once per candidate URL on it.
  const robotsCache = createRobotsCache();

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];

    if (budget && budget.remaining() <= 0) {
      const skipped = queries.length - i;
      stats.queriesSkippedForBudget = skipped;
      console.warn(
        `Stopping web-search discovery at query ${i} of ${queries.length}: ` +
          `daily query budget exhausted (issue #18). ${skipped} remaining ` +
          `quer${skipped === 1 ? "y" : "ies"} skipped for this run.`,
      );
      break;
    }

    stats.queriesRun++;
    budget?.recordUsed(1);

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

      const { outcome, evidence } = await classifyAndFetchPage(
        result.url,
        robotsCache,
      );

      if (outcome === "blocked-by-robots") {
        stats.blockedByRobots++;
        console.warn(`Skipping candidate ${result.url}: blocked by robots.txt`);
        continue;
      }
      if (outcome === "http-error") {
        stats.httpErrors++;
        console.warn(
          `Skipping candidate ${result.url}: HTTP error fetching page`,
        );
        continue;
      }
      if (outcome === "timeout") {
        stats.timeouts++;
        console.warn(`Skipping candidate ${result.url}: fetch timed out`);
        continue;
      }
      if (outcome === "requires-js") {
        stats.requiresJs++;
        console.warn(
          `Skipping candidate ${result.url}: looks like a JS-rendered page with no usable server-rendered content`,
        );
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
        has_conflict: evidence.has_conflict,
        source: "web-search",
      });
      stats.candidatesFound++;
    }
  }

  return { candidates, stats, queries };
}
