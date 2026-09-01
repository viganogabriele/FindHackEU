import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DevpostParser } from "@/lib/parsers/devpost-parser";

interface MockHackathon {
  id: number;
  title: string;
  url: string;
  submission_period_dates: string;
  open_state: "open" | "upcoming";
  displayed_location: string | { icon?: string; location: string };
  themes: Array<string | { name: string }>;
}

function responseFor(
  hackathons: MockHackathon[],
  totalCount = hackathons.length,
) {
  return JSON.stringify({
    page: 1,
    hackathons,
    total_count: totalCount,
    results_returned: hackathons.length,
  });
}

function mockFetch(
  pages: Array<MockHackathon[]>,
  totalCount = pages.flat().length,
) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const page =
      Number(new URL(input.toString()).searchParams.get("page")) || 1;
    const body = responseFor(pages[page - 1] ?? [], totalCount);

    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(body),
      text: async () => body,
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NOW = new Date("2026-09-01T00:00:00.000Z");

describe("DevpostParser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps a European listing, including its themes and location", async () => {
    mockFetch([
      [
        {
          id: 123,
          title: "Berlin AI Hackathon",
          url: "https://berlin-ai.devpost.com/",
          submission_period_dates: "Oct 10 - Oct 12, 2026",
          open_state: "upcoming",
          displayed_location: {
            icon: "map-marker-alt",
            location: "Berlin, Germany",
          },
          themes: [{ name: "Machine Learning/AI" }, "Open Ended"],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const result = await pendingParse;

    expect(result.status).toBe("ok");
    expect(result.hackathons).toEqual([
      expect.objectContaining({
        name: "Berlin AI Hackathon",
        city: "Berlin",
        country_code: "DE",
        location_confidence: "high",
        location_type: "physical",
        date_start: new Date("2026-10-10T00:00:00.000Z"),
        date_end: new Date("2026-10-12T23:59:59.999Z"),
        url: "https://berlin-ai.devpost.com/",
        source: "devpost",
      }),
    ]);
    expect(result.hackathons[0].topics).toContain("AI");
  });

  it("keeps online worldwide listings without inventing a country", async () => {
    mockFetch([
      [
        {
          id: 124,
          title: "Global Open Hack",
          url: "https://global-open.devpost.com/",
          submission_period_dates: "Oct 01 - Oct 03, 2026",
          open_state: "open",
          displayed_location: "Online",
          themes: [],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const [hackathon] = (await pendingParse).hackathons;

    expect(hackathon.country_code).toBeUndefined();
    expect(hackathon.city).toBeUndefined();
    expect(hackathon.location_type).toBe("online");
    expect(hackathon.location_confidence).toBeUndefined();
  });

  it("keeps an open listing while its submission period is still active", async () => {
    mockFetch([
      [
        {
          id: 127,
          title: "Open Munich Hack",
          url: "https://open-munich.devpost.com/",
          submission_period_dates: "Aug 20 - Sep 10, 2026",
          open_state: "open",
          displayed_location: {
            icon: "map-marker-alt",
            location: "Munich, Germany",
          },
          themes: [],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    expect(result.dropped?.byDateWindow).toBe(0);
  });

  it("counts completely concluded listings as date-window drops", async () => {
    mockFetch([
      [
        {
          id: 128,
          title: "Finished Hack",
          url: "https://finished.devpost.com/",
          submission_period_dates: "Aug 01 - Aug 10, 2026",
          open_state: "open",
          displayed_location: "Online",
          themes: [],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(0);
    expect(result.dropped?.byDateWindow).toBe(1);
  });

  it("does not interpret a regional abbreviation as a country", async () => {
    mockFetch([
      [
        {
          id: 129,
          title: "Munich Regional Hack",
          url: "https://munich-regional.devpost.com/",
          submission_period_dates: "Oct 10 - Oct 12, 2026",
          open_state: "upcoming",
          displayed_location: "Munich, BY",
          themes: [],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const [hackathon] = (await pendingParse).hackathons;

    expect(hackathon.city).toBe("Munich");
    expect(hackathon.country_code).toBeUndefined();
    expect(hackathon.location_confidence).toBeUndefined();
  });

  it("drops a US city that shares a name with a European city, instead of admitting it as European", async () => {
    mockFetch([
      [
        {
          id: 130,
          title: "Paris Texas Hack",
          url: "https://paris-texas.devpost.com/",
          submission_period_dates: "Oct 10 - Oct 12, 2026",
          open_state: "upcoming",
          displayed_location: "Paris, TX",
          themes: [],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(0);
    expect(result.dropped?.byCountry).toBe(1);
  });

  it("uses tbd when Devpost provides no recognized location signal", async () => {
    mockFetch([
      [
        {
          id: 130,
          title: "Berlin Unknown Signal Hack",
          url: "https://berlin-unknown.devpost.com/",
          submission_period_dates: "Oct 10 - Oct 12, 2026",
          open_state: "upcoming",
          displayed_location: { location: "Berlin, Germany" },
          themes: [],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const [hackathon] = (await pendingParse).hackathons;

    expect(hackathon.location_type).toBe("tbd");
  });

  it("drops explicit non-European locations and deduplicates pages by id", async () => {
    const event = {
      id: 125,
      title: "Paris Web Hack",
      url: "https://paris-web.devpost.com/",
      submission_period_dates: "Sep 20 - Sep 22, 2026",
      open_state: "upcoming" as const,
      displayed_location: "Paris, France",
      themes: [],
    };
    const fetchMock = mockFetch(
      [
        [event],
        [
          { ...event },
          {
            ...event,
            id: 126,
            title: "New York Hack",
            displayed_location: "New York, US",
          },
        ],
      ],
      3,
    );

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    expect(result.hackathons[0].name).toBe("Paris Web Hack");
    expect(result.dropped?.byCountry).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a failed parse when Devpost returns an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 503,
            text: async () => "unavailable",
          }) as Response,
      ),
    );

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const result = await pendingParse;

    expect(result.status).toBe("failed");
    expect(result.success).toBe(false);
    expect(result.hackathons).toHaveLength(0);
    expect(result.errors[0]).toContain("status 503");
  });

  it("puts the start date in the previous year for a range crossing a calendar-year boundary", async () => {
    mockFetch([
      [
        {
          id: 125,
          title: "New Year Hack",
          url: "https://new-year-hack.devpost.com/",
          submission_period_dates: "Dec 30 - Jan 02, 2027",
          open_state: "upcoming",
          displayed_location: { location: "Paris, France" },
          themes: [],
        },
      ],
    ]);

    const pendingParse = new DevpostParser().parse();
    await vi.runAllTimersAsync();
    const result = await pendingParse;

    expect(result.hackathons).toEqual([
      expect.objectContaining({
        date_start: new Date("2026-12-30T00:00:00.000Z"),
        date_end: new Date("2027-01-02T23:59:59.999Z"),
      }),
    ]);
  });
});
