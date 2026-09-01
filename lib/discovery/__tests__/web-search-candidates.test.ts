import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverWebCandidates,
  generateQueries,
} from "@/lib/discovery/web-search-candidates";
import { createInMemoryQueryBudget } from "@/lib/discovery/query-budget";
import type { SearchProvider } from "@/lib/search/search-provider";

vi.mock("@/lib/discovery/fetch-classifier", () => ({
  classifyAndFetchPage: vi.fn(),
}));

import { classifyAndFetchPage } from "@/lib/discovery/fetch-classifier";

function stubProvider(
  resultsByQuery: Record<string, Array<{ title: string; url: string }>>,
): SearchProvider {
  return {
    name: "stub",
    search: vi.fn(async (query: string) => resultsByQuery[query] ?? []),
  };
}

describe("generateQueries", () => {
  it("caps the number of generated queries at maxQueries", () => {
    const queries = generateQueries(3, ["Germany", "France", "Spain"]);
    expect(queries).toHaveLength(3);
  });

  it("produces english template variants per country before moving to the next", () => {
    // maxQueries=2 stops Germany after its two English templates, before
    // its native-language variant ("Deutschland") would be generated -
    // proves the per-country cap still applies to a single country.
    const queries = generateQueries(
      2,
      ["Germany", "France"],
      new Date("2026-01-01"),
    );
    expect(queries).toEqual([
      "hackathon Germany 2026",
      "student hackathon Germany 2026",
    ]);
  });

  it("adds a native-language variant per country when one can be derived, then moves to the next country (issue #17)", () => {
    const queries = generateQueries(
      5,
      ["Germany", "France"],
      new Date("2026-01-01"),
    );
    // Germany's alias data has a genuine native word ("deutschland"), so it
    // gets a third query; France's aliases are just "france"/"fr"/"fra" (no
    // native word distinct from the English name and short ISO-code-shaped
    // aliases are skipped), so it only gets the two English templates.
    expect(queries).toEqual([
      "hackathon Germany 2026",
      "student hackathon Germany 2026",
      "hackathon Deutschland 2026",
      "hackathon France 2026",
      "student hackathon France 2026",
    ]);
  });

  it("falls back to site:-scoped domain queries once every country's templates are exhausted (issue #17)", () => {
    const queries = generateQueries(2, []);
    expect(queries).toEqual([
      "hackathon site:ethz.ch",
      "hackathon site:epfl.ch",
    ]);
  });

  it("still respects maxQueries as a hard cap across countries and site:-scoped domains combined", () => {
    // 2 countries with no native-language variant (France, Portugal) => 4
    // English-template queries, then site:-scoped queries fill the rest.
    const queries = generateQueries(
      6,
      ["France", "Portugal"],
      new Date("2026-01-01"),
    );
    expect(queries).toHaveLength(6);
    expect(queries.slice(0, 4)).toEqual([
      "hackathon France 2026",
      "student hackathon France 2026",
      "hackathon Portugal 2026",
      "student hackathon Portugal 2026",
    ]);
    expect(queries.slice(4)).toEqual([
      "hackathon site:ethz.ch",
      "hackathon site:epfl.ch",
    ]);
  });
});

describe("discoverWebCandidates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(classifyAndFetchPage).mockReset();
  });

  it("throws when no search providers are configured", async () => {
    await expect(
      discoverWebCandidates({
        providers: [],
        maxQueries: 1,
        resultsPerQuery: 1,
        knownUrls: new Set(),
      }),
    ).rejects.toThrow(/No search provider/);
  });

  it("builds a pending candidate from a result with usable evidence", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Berlin Hack", url: "https://berlinhack.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "ok",
      evidence: {
        name: "Berlin Hack 2026",
        date_start: new Date("2026-11-01T00:00:00Z"),
        city: "Berlin",
        country_code: "Germany",
        extraction_method: "jsonld-event",
        raw_snippet: "snippet",
        has_conflict: false,
      },
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Berlin Hack 2026",
      city: "Berlin",
      country_code: "DE",
      url: "https://berlinhack.example",
      search_provider: "stub",
      extraction_method: "jsonld-event",
      has_conflict: false,
    });
    expect(stats.candidatesFound).toBe(1);
  });

  it("passes through has_conflict from the extracted evidence", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Conflicting Hack", url: "https://conflicthack.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "ok",
      evidence: {
        name: "Berlin Hack 2026",
        country_code: "Germany",
        extraction_method: "jsonld-event",
        raw_snippet: "snippet",
        has_conflict: true,
      },
    });

    const { candidates } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates[0].has_conflict).toBe(true);
  });

  it("skips a URL already known from a previous run or the real hackathons table", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Known Hack", url: "https://known.example" },
      ],
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(["https://known.example"]),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(0);
    expect(stats.alreadyKnownSkipped).toBe(1);
    expect(classifyAndFetchPage).not.toHaveBeenCalled();
  });

  it("skips known URLs using the same normalized identity as the dedup layer", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        {
          title: "Known Luma Hack",
          url: "https://www.lu.ma/event/?utm_source=search",
        },
      ],
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(["https://luma.com/event"]),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(0);
    expect(stats.alreadyKnownSkipped).toBe(1);
    expect(classifyAndFetchPage).not.toHaveBeenCalled();
  });

  it("drops a result whose evidence names an explicit non-European country", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Mumbai Hack", url: "https://mumbaihack.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "ok",
      evidence: {
        name: "Mumbai Hack 2026",
        city: "Mumbai",
        country_code: "India",
        extraction_method: "og-meta",
        raw_snippet: "snippet",
        has_conflict: false,
      },
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(0);
    expect(stats.nonEuropeanDropped).toBe(1);
  });

  it("counts a result with no extractable evidence without adding a candidate", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "No Evidence Page", url: "https://noev.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "ok",
      evidence: null,
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(0);
    expect(stats.evidenceNotFound).toBe(1);
  });

  it("counts a robots.txt-blocked result without fetching evidence for it", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Blocked Page", url: "https://blocked.example/private" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "blocked-by-robots",
      evidence: null,
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(0);
    expect(stats.blockedByRobots).toBe(1);
  });

  it("counts an http-error outcome distinctly from a timeout", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Broken Page", url: "https://broken.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "http-error",
      evidence: null,
    });

    const { stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(stats.httpErrors).toBe(1);
    expect(stats.timeouts).toBe(0);
  });

  it("counts a timeout outcome distinctly from an http-error", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Slow Page", url: "https://slow.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "timeout",
      evidence: null,
    });

    const { stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(stats.timeouts).toBe(1);
    expect(stats.httpErrors).toBe(0);
  });

  it("counts a requires-js outcome without producing a candidate", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "SPA Page", url: "https://spa.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "requires-js",
      evidence: null,
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(0);
    expect(stats.requiresJs).toBe(1);
  });

  it("counts an unsafe URL outcome without attempting to create a candidate", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Private Page", url: "http://127.0.0.1/admin" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "invalid-url",
      evidence: null,
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(0);
    expect(stats.invalidUrls).toBe(1);
  });

  it("isolates a per-result extraction failure and continues the run", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Broken Page", url: "https://broken.example" },
        { title: "Good Page", url: "https://good.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage)
      .mockRejectedValueOnce(new Error("malformed page"))
      .mockResolvedValueOnce({
        outcome: "ok",
        evidence: {
          name: "Good Hack 2026",
          country_code: "Germany",
          extraction_method: "og-meta",
          raw_snippet: "snippet",
          has_conflict: false,
        },
      });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 2,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].name).toBe("Good Hack 2026");
    expect(stats.fetchErrors).toBe(1);
  });

  it("keeps an unrecognized country value and falls back to the query country", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Berlin Hack", url: "https://berlinhack.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "ok",
      evidence: {
        name: "Berlin Hack 2026",
        country_code: "Some Garbled Text",
        extraction_method: "og-meta",
        raw_snippet: "snippet",
        has_conflict: false,
      },
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 1,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].country_code).toBe("DE");
    expect(stats.nonEuropeanDropped).toBe(0);
  });

  it("records a query error without stopping the remaining queries", async () => {
    const provider: SearchProvider = {
      name: "stub",
      search: vi.fn(async (query: string) => {
        if (query === "hackathon Germany 2026") {
          throw new Error("rate limited");
        }
        return [{ title: "France Hack", url: "https://francehack.example" }];
      }),
    };

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "ok",
      evidence: {
        name: "France Hack 2026",
        country_code: "France",
        extraction_method: "og-meta",
        raw_snippet: "snippet",
        has_conflict: false,
      },
    });

    const { candidates, stats } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 4,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany", "France"],
    });

    expect(stats.queryErrors).toHaveLength(1);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("stops issuing new queries once an injected budget reports zero remaining (issue #18)", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Berlin Hack", url: "https://berlinhack.example" },
      ],
      "student hackathon Germany 2026": [
        { title: "Munich Hack", url: "https://munichhack.example" },
      ],
    });

    const budget = createInMemoryQueryBudget(0);

    const { candidates, stats, queries } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 2,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
      budget,
    });

    expect(queries.length).toBeGreaterThan(0);
    expect(stats.queriesRun).toBe(0);
    expect(stats.queriesSkippedForBudget).toBe(queries.length);
    expect(candidates).toHaveLength(0);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it("runs exactly as many queries as an injected budget allows, then stops (issue #18)", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Berlin Hack", url: "https://berlinhack.example" },
      ],
      "student hackathon Germany 2026": [
        { title: "Munich Hack", url: "https://munichhack.example" },
      ],
    });

    vi.mocked(classifyAndFetchPage).mockResolvedValue({
      outcome: "ok",
      evidence: {
        name: "Berlin Hack 2026",
        country_code: "Germany",
        extraction_method: "jsonld-event",
        raw_snippet: "snippet",
        has_conflict: false,
      },
    });

    const budget = createInMemoryQueryBudget(1);

    const { stats, queries } = await discoverWebCandidates({
      providers: [provider],
      maxQueries: 2,
      resultsPerQuery: 1,
      knownUrls: new Set(),
      countries: ["Germany"],
      budget,
    });

    expect(queries).toHaveLength(2);
    expect(stats.queriesRun).toBe(1);
    expect(stats.queriesSkippedForBudget).toBe(1);
    expect(provider.search).toHaveBeenCalledTimes(1);
  });
});
