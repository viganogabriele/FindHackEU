/**
 * Baseline regression suite for DevfolioParser (lib/parsers/devfolio-parser.ts).
 * Never hits the network — global `fetch` is stubbed with fixed fixtures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevfolioParser } from "@/lib/parsers/devfolio-parser";

interface MockDevfolioHackathon {
  uuid: string;
  name: string;
  slug: string;
  tagline?: string;
  desc?: string;
  starts_at: string;
  ends_at?: string;
  is_online?: boolean;
  city?: string | null;
  country?: string | null;
}

function buildResponse(items: MockDevfolioHackathon[], pages = 1) {
  return { result: items, count: items.length, pages };
}

/**
 * Stubs global fetch so each Devfolio filter ("upcoming" | "application_open"
 * | "live") gets the page of events named for it in `itemsByFilter` (an
 * omitted filter gets an empty page).
 */
function mockFetchPerFilter(
  itemsByFilter: Record<string, MockDevfolioHackathon[]>,
  options: { pagesByFilter?: Record<string, number> } = {},
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    const filter = url.searchParams.get("filter") ?? "";
    const items = itemsByFilter[filter] ?? [];

    return {
      ok: true,
      status: 200,
      json: async () =>
        buildResponse(items, options.pagesByFilter?.[filter] ?? 1),
      text: async () => "",
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NOW = new Date("2025-06-15T00:00:00.000Z");
const FUTURE = "2025-07-01T10:00:00.000Z";
const PAST = "2025-01-01T10:00:00.000Z";

describe("DevfolioParser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps a European hackathon with an explicit country name to its ISO code", async () => {
    mockFetchPerFilter({
      application_open: [
        {
          uuid: "1",
          name: "TUM Blockchain & AI Hackathon",
          slug: "tum",
          starts_at: FUTURE,
          city: "München",
          country: "Germany",
        },
      ],
    });

    const results = (await new DevfolioParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].country_code).toBe("DE");
    expect(results[0].location_confidence).toBe("high");
    expect(results[0].url).toBe("https://tum.devfolio.co/");
    expect(results[0].source).toBe("devfolio");
    // is_online defaults to falsy in the fixture -> physical (issue #21).
    expect(results[0].location_type).toBe("physical");
  });

  it("drops an event whose explicit full country name is not European", async () => {
    mockFetchPerFilter({
      upcoming: [
        {
          uuid: "2",
          name: "HackCelestial 3.0",
          slug: "hackcelestial",
          starts_at: FUTURE,
          city: "Navi Mumbai",
          country: "India",
        },
      ],
    });

    const results = (await new DevfolioParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });

  it("leaves location undetermined (not dropped) for an online event with no country", async () => {
    mockFetchPerFilter({
      live: [
        {
          uuid: "3",
          name: "Global Online Buildathon",
          slug: "global-online",
          starts_at: FUTURE,
          is_online: true,
          city: null,
          country: null,
        },
      ],
    });

    const results = (await new DevfolioParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].country_code).toBeUndefined();
    expect(results[0].location_confidence).toBeUndefined();
    // is_online: true -> location_type "online" (issue #21).
    expect(results[0].location_type).toBe("online");
  });

  it("deduplicates the same event returned by more than one filter", async () => {
    const event: MockDevfolioHackathon = {
      uuid: "same-uuid",
      name: "Cross-Filter Hackathon",
      slug: "cross-filter",
      starts_at: FUTURE,
      country: "France",
    };

    mockFetchPerFilter({ upcoming: [event], application_open: [event] });

    const results = (await new DevfolioParser().parse()).hackathons;

    expect(results).toHaveLength(1);
  });

  it("filters out an event whose start date is already in the past", async () => {
    mockFetchPerFilter({
      upcoming: [
        {
          uuid: "4",
          name: "Already Started Hackathon",
          slug: "already-started",
          starts_at: PAST,
          country: "Spain",
        },
      ],
    });

    const results = (await new DevfolioParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });

  it("resolves a known city with no country data via the known-city fallback", async () => {
    mockFetchPerFilter({
      upcoming: [
        {
          uuid: "5",
          name: "Berlin Builders Hackathon",
          slug: "berlin-builders",
          starts_at: FUTURE,
          city: "Berlin",
          country: null,
        },
      ],
    });

    const results = (await new DevfolioParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].city).toBe("Berlin");
    expect(results[0].country_code).toBe("DE");
    expect(results[0].location_confidence).toBe("low");
  });

  // Issue #31: structured per-stage drop counts (Devfolio has no classifier
  // stage - its API is already scoped to hackathons - so only date-window
  // and country counts are wired up).
  it("reports structured dropped counts for date-window and country rejections", async () => {
    mockFetchPerFilter({
      upcoming: [
        {
          uuid: "far-future",
          name: "Far Future Hackathon",
          slug: "far-future",
          starts_at: "2030-01-01T00:00:00.000Z",
          country: "Germany",
        },
        {
          uuid: "non-european",
          name: "HackCelestial 3.0",
          slug: "hackcelestial-2",
          starts_at: FUTURE,
          city: "Navi Mumbai",
          country: "India",
        },
        {
          uuid: "accepted",
          name: "TUM Blockchain & AI Hackathon",
          slug: "tum-2",
          starts_at: FUTURE,
          city: "München",
          country: "Germany",
        },
      ],
    });

    const result = await new DevfolioParser().parse();

    expect(result.hackathons).toHaveLength(1);
    expect(result.dropped?.byDateWindow).toBe(1);
    expect(result.dropped?.byCountry).toBe(1);
  });

  it("reports status 'failed' when every filter request rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    // fetchWithRetry's backoff uses real setTimeout, which needs the fake
    // clock advanced manually before the retried attempts resolve - same
    // pattern as luma-parser.test.ts's equivalent failure-case tests.
    const pendingParse = new DevfolioParser().parse();
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pendingParse;

    expect(result.hackathons).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("degrades status to 'partial' when only some filters fail", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      const filter = url.searchParams.get("filter") ?? "";

      if (filter === "upcoming") {
        throw new Error("network unreachable");
      }

      return {
        ok: true,
        status: 200,
        json: async () => buildResponse([]),
        text: async () => "",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const pendingParse = new DevfolioParser().parse();
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pendingParse;

    expect(result.status).toBe("partial");
    expect(result.success).toBe(true);
  });

  it("degrades status to 'partial' when the five-page safety cap truncates a filter", async () => {
    mockFetchPerFilter(
      {
        upcoming: [
          {
            uuid: "truncated",
            name: "Paginated Hackathon",
            slug: "paginated-hackathon",
            starts_at: FUTURE,
            country: "Germany",
          },
        ],
      },
      { pagesByFilter: { upcoming: 6 } },
    );

    const result = await new DevfolioParser().parse();

    expect(result.hackathons).toHaveLength(1);
    expect(result.status).toBe("partial");
    expect(result.success).toBe(true);
    expect(result.errors).toContainEqual(
      expect.stringContaining("[upcoming] stopped at the 5-page limit"),
    );
  });
});
