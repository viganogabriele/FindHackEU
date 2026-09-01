/**
 * Baseline regression suite for EthGlobalParser
 * (lib/parsers/ethglobal-parser.ts). Never hits the network — global
 * `fetch` is stubbed with fixed HTML mimicking ETHGlobal's RSC-embedded
 * event array (real backslash-escaped quotes, unescaped braces — the
 * exact shape verified live, see the parser's doc comment).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EthGlobalParser } from "@/lib/parsers/ethglobal-parser";

interface MockEthGlobalEvent {
  id: number;
  name: string;
  slug: string;
  type: string;
  medium?: string;
  startTime?: string;
  endTime?: string;
  city?: {
    id: number;
    name: string;
    country: { id: number; name: string };
    countryCode: string;
  } | null;
}

/**
 * Serializes events into the same doubly-escaped shape found live: real
 * JSON, then every `"` replaced with `\"`, embedded inside a
 * `self.__next_f.push([1,"..."])` script tag (the outer push-array quoting
 * is irrelevant to the parser, which only ever looks at the inner
 * backslash-escaped content).
 */
function buildRscHtml(events: MockEthGlobalEvent[]): string {
  const arrayJson = JSON.stringify(events);
  const escaped = arrayJson.replace(/"/g, '\\"');
  return `<html><body><script>self.__next_f.push([1,"12:${escaped}"])</script></body></html>`;
}

function mockFetchEvents(events: MockEthGlobalEvent[]) {
  const fetchMock = vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      text: async () => buildRscHtml(events),
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NOW = new Date("2026-09-01T00:00:00.000Z");
const FUTURE = "2026-11-06T00:00:00.000Z";
const PAST = "2026-01-01T00:00:00.000Z";

describe("EthGlobalParser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("extracts a future European event with its structured 2-letter country code", async () => {
    mockFetchEvents([
      {
        id: 1,
        name: "ETHGlobal Berlin 2026",
        slug: "berlin2026",
        type: "hackathon",
        medium: "physical",
        startTime: FUTURE,
        city: {
          id: 100,
          name: "Berlin",
          country: { id: 1, name: "Germany" },
          countryCode: "DE",
        },
      },
    ]);

    const results = (await new EthGlobalParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].country_code).toBe("DE");
    expect(results[0].city).toBe("Berlin");
    expect(results[0].url).toBe("https://ethglobal.com/events/berlin2026");
    expect(results[0].location_type).toBe("physical");
  });

  it("drops an event whose explicit city country code is not European", async () => {
    mockFetchEvents([
      {
        id: 2,
        name: "ETHGlobal Mumbai",
        slug: "mumbai",
        type: "hackathon",
        startTime: FUTURE,
        city: {
          id: 200,
          name: "Mumbai",
          country: { id: 2, name: "India" },
          countryCode: "IN",
        },
      },
    ]);

    const results = (await new EthGlobalParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });

  it("leaves location undetermined (not dropped) for a virtual event with no city", async () => {
    mockFetchEvents([
      {
        id: 3,
        name: "ETHOnline 2026",
        slug: "ethonline2026",
        type: "hackathon",
        medium: "virtual",
        startTime: FUTURE,
        city: null,
      },
    ]);

    const results = (await new EthGlobalParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].country_code).toBeUndefined();
    // medium "virtual" -> location_type "online" (issue #21).
    expect(results[0].location_type).toBe("online");
  });

  it("filters out an event whose start date is already in the past", async () => {
    mockFetchEvents([
      {
        id: 4,
        name: "ETHGlobal Lisbon 2026",
        slug: "lisbon2026",
        type: "hackathon",
        startTime: PAST,
        city: {
          id: 400,
          name: "Lisbon",
          country: { id: 4, name: "Portugal" },
          countryCode: "PT",
        },
      },
    ]);

    const results = (await new EthGlobalParser().parse()).hackathons;

    expect(results).toHaveLength(0);
  });

  it("ignores a non-hackathon-typed object even if it appears in the same payload", async () => {
    mockFetchEvents([
      {
        id: 5,
        name: "Some Conference",
        slug: "conf",
        type: "conference",
        startTime: FUTURE,
        city: {
          id: 5,
          name: "Paris",
          country: { id: 5, name: "France" },
          countryCode: "FR",
        },
      },
      {
        id: 6,
        name: "ETHGlobal Paris 2026",
        slug: "paris2026",
        type: "hackathon",
        startTime: FUTURE,
        city: {
          id: 6,
          name: "Paris",
          country: { id: 5, name: "France" },
          countryCode: "FR",
        },
      },
    ]);

    const results = (await new EthGlobalParser().parse()).hackathons;

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("ETHGlobal Paris 2026");
  });

  // Issue #31: structured per-stage drop counts (ETHGlobal has no
  // classifier stage - extractEvents() already filters to type "hackathon"
  // - so only date-window and country counts are wired up).
  it("reports structured dropped counts for date-window and country rejections", async () => {
    mockFetchEvents([
      {
        id: 10,
        name: "Far Future Hackathon",
        slug: "far-future",
        type: "hackathon",
        startTime: "2030-01-01T00:00:00.000Z",
        city: {
          id: 10,
          name: "Berlin",
          country: { id: 1, name: "Germany" },
          countryCode: "DE",
        },
      },
      {
        id: 11,
        name: "ETHGlobal Mumbai 2",
        slug: "mumbai-2",
        type: "hackathon",
        startTime: FUTURE,
        city: {
          id: 11,
          name: "Mumbai",
          country: { id: 2, name: "India" },
          countryCode: "IN",
        },
      },
      {
        id: 12,
        name: "ETHGlobal Berlin 2027",
        slug: "berlin2027",
        type: "hackathon",
        startTime: FUTURE,
        city: {
          id: 12,
          name: "Berlin",
          country: { id: 1, name: "Germany" },
          countryCode: "DE",
        },
      },
    ]);

    const result = await new EthGlobalParser().parse();

    expect(result.hackathons).toHaveLength(1);
    expect(result.dropped?.byDateWindow).toBe(1);
    expect(result.dropped?.byCountry).toBe(1);
  });

  it("reports status 'failed' when the fetch itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    const pendingParse = new EthGlobalParser().parse();
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pendingParse;

    expect(result.hackathons).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
  });

  it("reports status 'failed' when no embedded hackathon objects are found (page structure changed)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => "<html><body>no event data here</body></html>",
      })) as unknown as typeof fetch,
    );

    const result = await new EthGlobalParser().parse();

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toMatch(/page structure may have changed/);
  });
});
