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

    const results = await new LumaParser().parse();

    expect(results).toHaveLength(1);
    expect(results[0].city).toBe("Zurich");
    expect(results[0].country_code).toBe("CH");
  });

  // Case 2: a genuinely non-English-titled hackathon.
  it("[documents known gap -> issue #7] does NOT classify a French-titled hackathon with no English keywords as a hackathon", async () => {
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

    const results = await new LumaParser().parse();

    // isHackathon()'s strongHackathonPatterns/competitionPatterns/
    // technicalPatterns in luma-parser.ts are English-only regexes. A real
    // hackathon whose title and description are written entirely in French
    // (or Italian/German) with no English loanwords is silently dropped.
    // This pins today's behavior; issue #7 (multilingual classifier) is
    // tracked to fix it, at which point this assertion should flip and the
    // test should be updated rather than left pinning a fixed bug forever.
    expect(results).toHaveLength(0);
  });

  // Case 3: pagination.
  it("[documents known gap -> issue #3] never requests a second Luma page even when the API reports one exists", async () => {
    const fetchMock = mockFetchPerSlug(
      {
        tech: [
          {
            name: "Page One Hackathon",
            start_at: FUTURE,
            url: "page-one-hackathon",
          },
        ],
      },
      { has_more: true, next_cursor: "cursor-page-2" },
    );

    await new LumaParser().parse();

    // One request per slug (tech, ai, crypto) = 3, and never a second page,
    // because `maxPagesPerSlug` is hard-coded to 1 in luma-parser.ts. An
    // event that only appears on Luma's second page for a slug is never
    // fetched at all. Tracked by issue #3.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const requestedCursors = fetchMock.mock.calls.map(([input]) =>
      new URL(input.toString()).searchParams.get("pagination_cursor"),
    );
    expect(requestedCursors.every((cursor) => cursor === null)).toBe(true);
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

    const results = await new LumaParser().parse();

    expect(results).toHaveLength(1);
    expect(results[0].date_start.toISOString()).toBe(FUTURE);
    expect(results[0].date_end?.toISOString()).toBe("2025-07-02T18:00:00.000Z");
  });

  // Case 5: known city, no country in the payload.
  it("[documents known gap] leaves country_code undefined for a known city when Luma sends no country data", async () => {
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

    const results = await new LumaParser().parse();

    expect(results).toHaveLength(1);
    expect(results[0].city).toBe("Berlin");
    // lib/european-countries.ts exposes `inferCountryFromCity`, and
    // lib/parsers/lablab-parser.ts already calls it to fill in exactly this
    // gap, but luma-parser.ts's mapEventToHackathon() never does — so for
    // the currently-active Luma source, a known city ("Berlin" -> DE) with
    // no country/region/city_state in the payload is left unresolved.
    expect(results[0].country_code).toBeUndefined();
  });

  // Case 7 (Luma-level half): duplicate events collapse to one.
  it("deduplicates an identical event returned for more than one slug", async () => {
    const event: MockLumaEvent = {
      name: "Cross-Slug Hackathon",
      start_at: FUTURE,
      url: "cross-slug-hackathon",
    };

    mockFetchPerSlug({ tech: [event], ai: [event] });

    const results = await new LumaParser().parse();

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

    const results = await new LumaParser().parse();

    expect(results).toHaveLength(0);
  });

  // Case 9: unreachable page / network errors must not crash the parser.
  //
  // Note: fetchEventsForSlug now routes through fetchWithRetry (issue #30),
  // which retries transient failures with backoff before giving up. This
  // suite runs under `vi.useFakeTimers()` (for the fixed NOW clock above),
  // so the backoff's `setTimeout` calls never fire on their own — we drive
  // them forward with `vi.advanceTimersByTimeAsync` instead of real waits.
  // The assertions themselves (empty result, no throw) are unchanged.
  it("returns an empty list instead of throwing when every request rejects (network error)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    const resultPromise = new LumaParser().parse();

    // 3 slugs x 2 retries each, backoff of 500ms/1000ms per slug.
    await vi.advanceTimersByTimeAsync(1500 * 3);

    await expect(resultPromise).resolves.toEqual([]);
  });

  it("returns an empty list instead of throwing when Luma responds with a non-OK HTTP status", async () => {
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

    const resultPromise = new LumaParser().parse();

    // 3 slugs x 2 retries each, backoff of 500ms/1000ms per slug.
    await vi.advanceTimersByTimeAsync(1500 * 3);

    await expect(resultPromise).resolves.toEqual([]);
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

    const results = await new LumaParser().parse();

    expect(results).toHaveLength(0);
  });
});
