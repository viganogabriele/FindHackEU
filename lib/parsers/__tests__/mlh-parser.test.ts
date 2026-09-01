/**
 * Baseline regression suite for MlhParser (lib/parsers/mlh-parser.ts).
 * Never hits the network — global `fetch` is stubbed with fixed HTML pages
 * mimicking MLH's Inertia.js embedded-JSON season pages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MlhParser } from "@/lib/parsers/mlh-parser";

interface MockMlhEvent {
  id: string;
  slug: string;
  name: string;
  startsAt: string;
  endsAt?: string;
  url: string;
  location?: string;
  formatType?: "physical" | "digital" | "hybrid_physical";
  websiteUrl?: string;
  venueAddress?: { city?: string; state?: string; country?: string } | null;
}

function buildSeasonHtml(events: MockMlhEvent[]): string {
  const data = { props: { upcomingEvents: events } };
  return `<!DOCTYPE html><html><body><script data-page="app" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

/**
 * Stubs global fetch so each MLH season URL (mlh.com/seasons/{year}/events)
 * gets the page of events named for its year in `eventsBySeason` (an
 * omitted season gets an empty page).
 */
function mockFetchPerSeason(eventsBySeason: Record<number, MockMlhEvent[]>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = input.toString();
    const match = url.match(/\/seasons\/(\d+)\/events/);
    const season = match ? Number.parseInt(match[1], 10) : -1;
    const events = eventsBySeason[season] ?? [];

    return {
      ok: true,
      status: 200,
      text: async () => buildSeasonHtml(events),
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NOW = new Date("2026-09-01T00:00:00.000Z");
const CURRENT_SEASON = 2026;
const NEXT_SEASON = 2027;
const FUTURE = "2026-11-14T14:30:00.000Z";
const PAST = "2026-01-01T10:00:00.000Z";

describe("MlhParser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps a physical European event via its structured 2-letter venue country code", async () => {
    mockFetchPerSeason({
      [NEXT_SEASON]: [
        {
          id: "durhack",
          slug: "durhack-53",
          name: "DurHack",
          startsAt: FUTURE,
          url: "/events/durhack-53/prizes",
          formatType: "physical",
          websiteUrl: "https://durhack.com",
          venueAddress: {
            city: "Durham",
            state: "County Durham",
            country: "GB",
          },
        },
      ],
    });

    const results = (await new MlhParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].country_code).toBe("GB");
    expect(results[0].city).toBe("Durham");
    expect(results[0].location_confidence).toBe("high");
    expect(results[0].url).toBe("https://durhack.com");
    expect(results[0].location_type).toBe("physical");
  });

  it("drops an event whose explicit venue country code is not European", async () => {
    mockFetchPerSeason({
      [NEXT_SEASON]: [
        {
          id: "hackrice",
          slug: "hackrice",
          name: "HackRice",
          startsAt: FUTURE,
          url: "/events/hackrice/prizes",
          formatType: "physical",
          venueAddress: { city: "Houston", state: "Texas", country: "US" },
        },
      ],
    });

    const results = (await new MlhParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });

  it("leaves location undetermined (not dropped) for a digital worldwide event", async () => {
    mockFetchPerSeason({
      [NEXT_SEASON]: [
        {
          id: "ghw-data",
          slug: "global-hack-week-data",
          name: "Global Hack Week: Data",
          startsAt: FUTURE,
          url: "/events/global-hack-week-data/prizes",
          formatType: "digital",
          venueAddress: null,
        },
      ],
    });

    const results = (await new MlhParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].country_code).toBeUndefined();
    expect(results[0].city).toBeUndefined();
    // formatType "digital" -> location_type "online" (issue #21).
    expect(results[0].location_type).toBe("online");
  });

  it("maps formatType 'hybrid_physical' to location_type 'hybrid'", async () => {
    mockFetchPerSeason({
      [NEXT_SEASON]: [
        {
          id: "hybrid-event",
          slug: "hybrid-event",
          name: "Hybrid Hack Week",
          startsAt: FUTURE,
          url: "/events/hybrid-event/prizes",
          formatType: "hybrid_physical",
          venueAddress: { city: "Berlin", country: "DE" },
        },
      ],
    });

    const results = (await new MlhParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].location_type).toBe("hybrid");
  });

  it("merges and deduplicates events across the current and next season by id", async () => {
    const event: MockMlhEvent = {
      id: "same-id",
      slug: "cross-season",
      name: "Cross Season Hackathon",
      startsAt: FUTURE,
      url: "/events/cross-season/prizes",
      venueAddress: { city: "Berlin", country: "DE" },
    };

    mockFetchPerSeason({
      [CURRENT_SEASON]: [event],
      [NEXT_SEASON]: [event],
    });

    const results = (await new MlhParser().parse()).hackathons;

    expect(results).toHaveLength(1);
  });

  it("filters out an event whose start date is already in the past", async () => {
    mockFetchPerSeason({
      [NEXT_SEASON]: [
        {
          id: "past-event",
          slug: "past-event",
          name: "Already Started Hackathon",
          startsAt: PAST,
          url: "/events/past-event/prizes",
          venueAddress: { city: "Paris", country: "FR" },
        },
      ],
    });

    const results = (await new MlhParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });

  // Issue #31: structured per-stage drop counts (MLH has no classifier
  // stage - its season pages are already scoped to hackathons - so only
  // date-window and country counts are wired up).
  it("reports structured dropped counts for date-window and country rejections", async () => {
    mockFetchPerSeason({
      [NEXT_SEASON]: [
        {
          id: "far-future",
          slug: "far-future",
          name: "Far Future Hackathon",
          startsAt: "2030-01-01T00:00:00.000Z",
          url: "/events/far-future/prizes",
          venueAddress: { city: "Berlin", country: "DE" },
        },
        {
          id: "hackrice-2",
          slug: "hackrice-2",
          name: "HackRice",
          startsAt: FUTURE,
          url: "/events/hackrice-2/prizes",
          formatType: "physical",
          venueAddress: { city: "Houston", state: "Texas", country: "US" },
        },
        {
          id: "durhack-2",
          slug: "durhack-2",
          name: "DurHack",
          startsAt: FUTURE,
          url: "/events/durhack-2/prizes",
          formatType: "physical",
          venueAddress: { city: "Durham", country: "GB" },
        },
      ],
    });

    const result = await new MlhParser().parse();

    expect(result.hackathons).toHaveLength(1);
    expect(result.dropped?.byDateWindow).toBe(1);
    expect(result.dropped?.byCountry).toBe(1);
  });

  it("reports status 'failed' when every season request rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    const pendingParse = new MlhParser().parse();
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pendingParse;

    expect(result.hackathons).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("throws a clear error when the embedded JSON script tag is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "<html><body>no data here</body></html>",
      })) as unknown as typeof fetch,
    );

    const pendingParse = new MlhParser().parse();
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pendingParse;

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toMatch(/embedded JSON/);
  });

  it("reports a malformed page without treating missing upcomingEvents as an empty success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const season = Number(
          new URL(input.toString()).pathname.match(/\d+/)?.[0],
        );

        return {
          ok: true,
          status: 200,
          text: async () =>
            season === CURRENT_SEASON
              ? '<script type="application/json">{"props":{}}</script>'
              : buildSeasonHtml([]),
        } as Response;
      }),
    );

    const result = await new MlhParser().parse();

    expect(result.hackathons).toEqual([]);
    expect(result.status).toBe("partial");
    expect(result.success).toBe(true);
    expect(result.errors[0]).toMatch(/upcomingEvents array/);
  });
});
