/**
 * Baseline regression suite for LumaParser (lib/parsers/luma-parser.ts), the
 * only currently-enabled discovery source (see app/api/update/route.ts).
 *
 * These tests exercise ACTUAL behavior of the code as it stands on `main`
 * (see the tracking issue https://github.com/viganogabriele/HackTrack-EU/issues/2
 * and this test suite's own issue, #35). They never hit the network — the
 * global `fetch` is stubbed with fixed fixtures so results are deterministic.
 *
 * Some of these tests intentionally pin *known-broken* current behavior
 * (multilingual classification, pagination, city->country inference) rather
 * than the "correct" behavior a reader might expect. Each such test is
 * labelled "documents known gap" and points at the issue that owns the fix.
 * Per issue #35's constraints, this suite's job is coverage, not fixes — do
 * not "fix" production code to make these particular assertions flip green.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LumaParser } from "@/lib/parsers/luma-parser";

interface MockLumaEvent {
  name: string;
  start_at: string;
  end_at?: string;
  url: string;
  description?: string;
  geo_address_info?: {
    city?: string;
    country_code?: string;
    city_state?: string;
    region?: string;
  };
}

function buildLumaResponse(
  events: MockLumaEvent[],
  opts: { has_more?: boolean; next_cursor?: string } = {},
) {
  return {
    entries: events.map((event) => ({ event })),
    has_more: opts.has_more ?? false,
    next_cursor: opts.next_cursor,
  };
}

/**
 * Stubs global fetch so each Luma slug ("tech" | "ai" | "crypto") gets the
 * page of events named for it in `eventsBySlug` (an omitted slug gets an
 * empty page). Returns the underlying vi.fn so callers can assert on the
 * requested URLs (used by the pagination test).
 */
function mockFetchPerSlug(
  eventsBySlug: Record<string, MockLumaEvent[]>,
  opts: { has_more?: boolean; next_cursor?: string } = {},
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    const slug = url.searchParams.get("slug") ?? "";
    const events = eventsBySlug[slug] ?? [];

    return {
      ok: true,
      status: 200,
      json: async () => buildLumaResponse(events, opts),
      text: async () => "",
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// Fixed clock so "future"/"past" fixtures never rot as real time passes.
const NOW = new Date("2025-06-15T00:00:00.000Z");
const FUTURE = "2025-07-01T10:00:00.000Z";
const PAST = "2025-01-01T10:00:00.000Z";

describe("LumaParser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Case 1: a future Swiss event resolves country to CH.
  it("resolves a future Swiss event's geography to country CH", async () => {
    mockFetchPerSlug({
      tech: [
        {
          name: "Zurich Builders Hackathon",
          start_at: FUTURE,
          end_at: FUTURE,
          url: "zurich-builders-hackathon",
          geo_address_info: { city: "Zurich", country_code: "ch" },
        },
      ],
    });

    const results = (await new LumaParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].city).toBe("Zurich");
    expect(results[0].country_code).toBe("CH");
  });

  // Case 2: a genuinely non-English-titled hackathon.
  //
  // Updated after issue #7's fix landed: classification now goes through
  // the multilingual, score-based classifier in
  // lib/classification/hackathon-classifier.ts, which recognizes French
  // competition ("compétition"/"concours") and technical
  // ("développeurs"/"programmation") vocabulary. This title used to be
  // silently dropped by the old English-only regex chain; it is now
  // correctly accepted.
  it("classifies a French-titled hackathon with no English keywords as a hackathon", async () => {
    mockFetchPerSlug({
      tech: [
        {
          name: "Concours de programmation pour développeurs",
          start_at: FUTURE,
          url: "concours-dev-paris",
          description:
            "Une compétition de développement logiciel à Paris, ouverte à tous les développeurs.",
          geo_address_info: { city: "Paris", country_code: "fr" },
        },
      ],
    });

    const results = (await new LumaParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Concours de programmation pour développeurs");
  });

  // Case 3: pagination.
  //
  // Updated after issue #3's fix landed (maxPagesPerSlug is no longer
  // hard-coded to 1): the parser now follows Luma's has_more/next_cursor
  // pagination. Each slug's second page here reports has_more: false so
  // the loop terminates after exactly 2 pages, matching real behavior
  // without needing to advance the fake clock past LumaParser's
  // inter-page delay (see fetchEventsForSlug's `pageDelayMs`).
  it("follows Luma's pagination and fetches a second page when has_more is true", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      const slug = url.searchParams.get("slug") ?? "";
      const cursor = url.searchParams.get("pagination_cursor");

      if (slug !== "tech") {
        return {
          ok: true,
          status: 200,
          json: async () => buildLumaResponse([]),
          text: async () => "",
        } as Response;
      }

      if (!cursor) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            buildLumaResponse(
              [
                {
                  name: "Winter Robotics Hackathon",
                  start_at: FUTURE,
                  url: "winter-robotics-hackathon",
                },
              ],
              { has_more: true, next_cursor: "cursor-page-2" },
            ),
          text: async () => "",
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () =>
          buildLumaResponse([
            {
              name: "Autumn Sailing Buildathon",
              start_at: FUTURE,
              url: "autumn-sailing-buildathon",
            },
          ]),
        text: async () => "",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const pendingParse = new LumaParser().parse();
    // Let the inter-page delay (`pageDelayMs`) elapse under the fake clock
    // so the second-page request actually fires before we await the result.
    await vi.advanceTimersByTimeAsync(1000);
    const results = (await pendingParse).hackathons;

    const techCalls = fetchMock.mock.calls.filter(
      ([input]) =>
        new URL(input.toString()).searchParams.get("slug") === "tech",
    );
    expect(techCalls).toHaveLength(2);
    expect(
      new URL(techCalls[1][0].toString()).searchParams.get("pagination_cursor"),
    ).toBe("cursor-page-2");

    expect(results.map((h) => h.name).sort()).toEqual([
      "Autumn Sailing Buildathon",
      "Winter Robotics Hackathon",
    ]);
  });

  // Case 4: date + timezone handling.
  it("parses a Z-suffixed UTC start/end timestamp into equivalent Date objects", async () => {
    mockFetchPerSlug({
      tech: [
        {
          name: "Timezone Aware Hackathon",
          start_at: FUTURE,
          end_at: "2025-07-02T18:00:00.000Z",
          url: "timezone-aware-hackathon",
        },
      ],
    });

    const results = (await new LumaParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].date_start.toISOString()).toBe(FUTURE);
    expect(results[0].date_end?.toISOString()).toBe("2025-07-02T18:00:00.000Z");
  });

  // Case 5: known city, no country in the payload.
  //
  // Updated after issue #5's fix landed: mapEventToHackathon() now falls
  // back to `europeanCountries.inferCountryFromCity` (the same known-city
  // map lablab-parser.ts already used) before leaving country_code
  // undetermined, so a known city with no explicit country/region resolves
  // correctly with `location_confidence: "low"`.
  it("resolves a known city with no country data via the known-city fallback", async () => {
    mockFetchPerSlug({
      tech: [
        {
          name: "Berlin Builders Hackathon",
          start_at: FUTURE,
          url: "berlin-builders-hackathon",
          geo_address_info: { city: "Berlin" },
        },
      ],
    });

    const results = (await new LumaParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].city).toBe("Berlin");
    expect(results[0].country_code).toBe("DE");
    expect(results[0].location_confidence).toBe("low");
  });

  // Case 7 (Luma-level half): duplicate events collapse to one.
  it("deduplicates an identical event returned for more than one slug", async () => {
    const event: MockLumaEvent = {
      name: "Cross-Slug Hackathon",
      start_at: FUTURE,
      url: "cross-slug-hackathon",
    };

    mockFetchPerSlug({ tech: [event], ai: [event] });

    const results = (await new LumaParser().parse()).hackathons;

    expect(results).toHaveLength(1);
  });

  // Case 8: past events are filtered out.
  it("filters out an event whose start date is already in the past", async () => {
    mockFetchPerSlug({
      tech: [
        {
          name: "Already Started Hackathon",
          start_at: PAST,
          url: "already-started",
        },
      ],
    });

    const results = (await new LumaParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });

  // Case 9: unreachable page / network errors must not crash the parser.
  //
  // Updated after issue #6's fix landed: a total failure across every slug
  // is no longer indistinguishable from "zero real results" - it's now
  // reported as an empty hackathon list PLUS an explicit `status: "failed"`
  // and per-slug error messages, instead of silently resolving to `[]`.
  // Every fetch call now goes through fetchWithRetry (issue #30), which
  // retries a failing attempt with real setTimeout-based backoff before
  // giving up. Under the fake clock these tests use, that backoff never
  // elapses on its own, so we start the parse, advance the fake clock past
  // every retry/backoff window for all 3 slugs, then await the result -
  // same pattern as the pagination test above.
  it("reports status 'failed' (not a thrown error, not a silent empty success) when every request rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    const pendingParse = new LumaParser().parse();
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pendingParse;

    expect(result.hackathons).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports status 'failed' when Luma responds with a non-OK HTTP status on every slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 503,
            text: async () => "Service Unavailable",
            json: async () => ({}),
          }) as Response,
      ),
    );

    const pendingParse = new LumaParser().parse();
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pendingParse;

    expect(result.hackathons).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // Case 10: false positives (post-event announcements) are rejected.
  it("rejects an award-ceremony announcement even though its title contains 'hackathon'", async () => {
    mockFetchPerSlug({
      tech: [
        {
          name: "AI Hackathon Winners Celebration",
          start_at: FUTURE,
          url: "winners-celebration",
        },
      ],
    });

    const results = (await new LumaParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });
});
