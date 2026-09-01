#!/usr/bin/env tsx
/**
 * Runs a bounded set of web-search queries (issue #13/#14/#17) and writes
 * whatever plausible event pages they turn up into `hackathon_candidates`
 * as `pending` rows - never directly into `hackathons`. A human reviews
 * each one at /admin/candidates before it becomes a real, published event.
 *
 * This is a manually-triggered, opt-in script (like scripts/trigger-update.mjs),
 * not part of the daily cron - search API quota is limited (see
 * lib/search/search-provider.ts) and results need review either way, so
 * there is no benefit to running this automatically and unattended.
 *
 * Usage:
 *   npx tsx scripts/discover-web-candidates.ts                    # default: 10 queries, 5 results each
 *   npx tsx scripts/discover-web-candidates.ts --max-queries=20
 *   npx tsx scripts/discover-web-candidates.ts --results-per-query=10
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function parseIntArg(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const value = Number.parseInt(arg.split("=")[1], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabase");
  const { fetchAllRows } = await import("../lib/services/fetch-all-rows");
  const { normalizeUrl } = await import("../lib/dedup/url-normalizer");
  const { buildSearchProviderChain } =
    await import("../lib/search/search-provider");
  const { discoverWebCandidates } =
    await import("../lib/discovery/web-search-candidates");
  const { FileBudgetTracker } = await import("../lib/discovery/query-budget");

  const maxQueries = parseIntArg("max-queries", 10);
  const resultsPerQuery = parseIntArg("results-per-query", 5);

  const providers = buildSearchProviderChain();
  if (providers.length === 0) {
    console.error(
      "No search provider API keys configured. Set at least one of " +
        "TAVILY_API_KEY / SERPAPI_API_KEY / SERPER_API_KEY in .env.local.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Using search providers (fallback order): ${providers.map((p) => p.name).join(" -> ")}`,
  );

  // Build the "already known" URL set from both real hackathons and
  // previously-discovered candidates, so re-running this script doesn't
  // keep re-suggesting the same page and doesn't waste search-result
  // fetches re-extracting evidence for a URL already sitting in the
  // review queue.
  interface UrlRow {
    url: string;
  }

  const existingHackathons = await fetchAllRows<UrlRow>((from, to) =>
    supabaseAdmin.from("hackathons").select("url").range(from, to),
  );
  const existingCandidates = await fetchAllRows<UrlRow>((from, to) =>
    supabaseAdmin.from("hackathon_candidates").select("url").range(from, to),
  );

  const knownUrls = new Set([
    ...existingHackathons.map((r) => normalizeUrl(r.url)),
    ...existingCandidates.map((r) => normalizeUrl(r.url)),
  ]);

  console.log(`${knownUrls.size} URL(s) already known, will be skipped.`);

  // Persistent, file-backed daily query budget (issue #18) - shared across
  // separate invocations of this script on the same UTC day, unlike the
  // in-memory knownUrls skip-list above.
  const budget = new FileBudgetTracker();
  console.log(
    `Web-search query budget (issue #18): ${budget.remaining()} quer${
      budget.remaining() === 1 ? "y" : "ies"
    } remaining today before this run.`,
  );

  const { candidates, stats, queries } = await discoverWebCandidates({
    providers,
    maxQueries,
    resultsPerQuery,
    knownUrls,
    budget,
  });

  console.log(
    `Generated ${queries.length} quer${queries.length === 1 ? "y" : "ies"} ` +
      `(issue #17 - multilingual/site-scoped variants included):`,
  );
  for (const query of queries) {
    console.log(`  - ${query}`);
  }

  console.log(
    `Ran ${stats.queriesRun} quer${stats.queriesRun === 1 ? "y" : "ies"}, ` +
      `saw ${stats.resultsSeen} result(s), skipped ${stats.alreadyKnownSkipped} ` +
      `already-known, dropped ${stats.nonEuropeanDropped} non-European, ` +
      `${stats.evidenceNotFound} had no extractable evidence.`,
  );
  console.log(
    `Fetch outcomes (issue #16): ${stats.blockedByRobots} blocked by robots.txt, ` +
      `${stats.httpErrors} http-error, ${stats.timeouts} timeout, ` +
      `${stats.requiresJs} requires-js (likely JS-rendered SPA).`,
  );
  if (stats.queriesSkippedForBudget > 0) {
    console.warn(
      `Budget (issue #18): stopped early, ${stats.queriesSkippedForBudget} ` +
        `quer${stats.queriesSkippedForBudget === 1 ? "y" : "ies"} skipped ` +
        `for lack of remaining daily budget.`,
    );
  }
  console.log(
    `Web-search query budget (issue #18): ${budget.remaining()} quer${
      budget.remaining() === 1 ? "y" : "ies"
    } remaining today after this run.`,
  );
  if (stats.queryErrors.length > 0) {
    console.warn(`Query errors:\n${stats.queryErrors.join("\n")}`);
  }

  if (candidates.length === 0) {
    console.log("No new candidates found.");
    return;
  }

  const { error } = await supabaseAdmin
    .from("hackathon_candidates")
    // @ts-expect-error - Supabase generated types may not include insert shape
    .upsert(candidates, { onConflict: "url,query", ignoreDuplicates: true });

  if (error) {
    console.error("Failed to insert candidates:", error);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Inserted up to ${candidates.length} new candidate(s) (duplicates on ` +
      `url+query silently skipped) for review at /admin/candidates.`,
  );
}

main().catch((error) => {
  console.error("Web-search candidate discovery failed:", error);
  process.exitCode = 1;
});
