import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverWebCandidates,
  generateQueries,
} from "@/lib/discovery/web-search-candidates";
import type { SearchProvider } from "@/lib/search/search-provider";

vi.mock("@/lib/search/extract-event-evidence", () => ({
  extractEventEvidence: vi.fn(),
}));

import { extractEventEvidence } from "@/lib/search/extract-event-evidence";

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

  it("produces two template variants per country before moving to the next", () => {
    const queries = generateQueries(4, ["Germany", "France"], new Date("2026-01-01"));
    expect(queries).toEqual([
      "hackathon Germany 2026",
      "student hackathon Germany 2026",
      "hackathon France 2026",
      "student hackathon France 2026",
    ]);
  });
});

describe("discoverWebCandidates", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(extractEventEvidence).mockReset();
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

    vi.mocked(extractEventEvidence).mockResolvedValue({
      name: "Berlin Hack 2026",
      date_start: new Date("2026-11-01T00:00:00Z"),
      city: "Berlin",
      country_code: "Germany",
      extraction_method: "jsonld-event",
      raw_snippet: "snippet",
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
    });
    expect(stats.candidatesFound).toBe(1);
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
    expect(extractEventEvidence).not.toHaveBeenCalled();
  });

  it("drops a result whose evidence names an explicit non-European country", async () => {
    const provider = stubProvider({
      "hackathon Germany 2026": [
        { title: "Mumbai Hack", url: "https://mumbaihack.example" },
      ],
    });

    vi.mocked(extractEventEvidence).mockResolvedValue({
      name: "Mumbai Hack 2026",
      city: "Mumbai",
      country_code: "India",
      extraction_method: "og-meta",
      raw_snippet: "snippet",
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

    vi.mocked(extractEventEvidence).mockResolvedValue(null);

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

    vi.mocked(extractEventEvidence).mockResolvedValue({
      name: "France Hack 2026",
      country_code: "France",
      extraction_method: "og-meta",
      raw_snippet: "snippet",
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
});
