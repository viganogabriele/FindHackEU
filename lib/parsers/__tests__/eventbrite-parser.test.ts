/**
 * Baseline regression suite for EventbriteParser
 * (lib/parsers/eventbrite-parser.ts). Never hits the network — global
 * `fetch` is stubbed with fixed HTML fragments shaped like the real
 * directory-page markup validated live against
 * https://www.eventbrite.com/d/germany/hackathon/ on 2026-09-01 (see the
 * parser's own doc comment for the full verification notes).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { EventbriteParser } from "@/lib/parsers/eventbrite-parser";

interface StructuredEvent {
  startDate: string;
  startTime: string;
  timezone: string;
  endDate?: string;
  endTime?: string;
  city?: string;
  region?: string;
  venueName?: string;
  isOnlineEvent?: boolean;
}

interface MockEvent {
  id: string;
  url: string;
  name: string;
  location: string;
  dateText: string;
  structured?: StructuredEvent;
}

/**
 * Builds a directory-page HTML fragment matching the real, live-validated
 * shape: each event card renders its `data-event-id`-bearing anchor twice
 * (a duplicate hidden mobile-card variant), so the parser must dedupe by id
 * — this fixture reproduces that duplication deliberately.
 */
function buildDirectoryHtml(events: MockEvent[]): string {
  const card = (e: MockEvent) =>
    `<a href="${e.url}" rel="noopener" target="_blank" class="event-card-link" ` +
    `data-event-id="${e.id}" data-event-location="${e.location}" ` +
    `data-event-category="science-and-tech"><h3 class="Typography_root">${e.name}</h3></a>` +
    `<p class="Typography_root">${e.dateText}</p>`;

  const cards = events.map((e) => card(e) + card(e)).join("");
  const structuredResults = events
    .filter((event) => event.structured)
    .map((event) => {
      const structured = event.structured;
      if (!structured) {
        throw new Error("Expected structured event data");
      }

      return {
        id: event.id,
        eventbrite_event_id: event.id,
        name: event.name,
        url: event.url,
        start_date: structured.startDate,
        start_time: structured.startTime,
        timezone: structured.timezone,
        end_date: structured.endDate,
        end_time: structured.endTime,
        is_online_event: structured.isOnlineEvent,
        primary_venue:
          structured.venueName || structured.city
            ? {
                name: structured.venueName,
                address: structured.city
                  ? {
                      city: structured.city,
                      region: structured.region,
                    }
                  : undefined,
              }
            : undefined,
      };
    });

  const structuredData = structuredResults.length
    ? `<script>window.__SERVER_DATA__ = ${JSON.stringify({
        search_data: {
          events: {
            pagination: {
              page_number: 1,
              page_count: 1,
              page_size: 20,
            },
            results: structuredResults,
          },
        },
      })};</script>`
    : "";

  return `<!DOCTYPE html><html><body>${cards}${structuredData}</body></html>`;
}

function readFixture(name: string): string {
  return readFileSync(
    new URL(`../__fixtures__/${name}`, import.meta.url),
    "utf8",
  );
}

/** Stubs global fetch so each country directory URL gets that country's page. */
function mockFetchPerCountry(eventsBySlug: Record<string, MockEvent[]>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = input.toString();
    const match = url.match(/\/d\/([^/]+)\/hackathon\//);
    const slug = match ? match[1] : "";
    const events = eventsBySlug[slug] ?? [];

    return {
      ok: true,
      status: 200,
      text: async () => buildDirectoryHtml(events),
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const NOW = new Date("2026-09-01T12:00:00.000Z");

describe("EventbriteParser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts a real hackathon-classified event with the right country/city, deduping the doubled card markup", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "1992649646734",
          url: "https://www.eventbrite.de/e/cumulocity-aiot-hackathon-tickets-1992649646734",
          name: "Cumulocity AIoT Hackathon",
          location: "Leipzig, SN",
          dateText: "Mon, Nov 9, 12:00 PM",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.status).toBe("ok");
    expect(result.hackathons).toHaveLength(1);
    const hackathon = result.hackathons[0];
    expect(hackathon.name).toBe("Cumulocity AIoT Hackathon");
    expect(hackathon.country_code).toBe("DE");
    expect(hackathon.city).toBe("Leipzig");
    expect(hackathon.location_type).toBe("physical");
    expect(hackathon.source).toBe("eventbrite");
  });

  it("rejects a workshop/webinar-shaped title via the shared classifier", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "1987728634855",
          url: "https://www.eventbrite.com/e/build-your-first-successful-ai-saas-startup-today-workshop-tickets-1987728634855",
          name: "Build Your First Successful AI SaaS Startup Today! - Workshop",
          location: "München, BY",
          dateText: "Today at 1:00 PM + 34 more",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(0);
    expect(result.dropped?.byClassifier).toBeGreaterThan(0);
  });

  it('parses a normal "Day, Mon DD, H:MM AM/PM" date still upcoming this year as this year', async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "1",
          url: "https://www.eventbrite.de/e/some-hackathon-tickets-1",
          name: "Robotics Hackathon Berlin",
          location: "Berlin, BE",
          dateText: "Sat, Nov 14, 9:00 AM",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    const start = result.hackathons[0].date_start;
    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(10); // November (0-indexed)
    expect(start.getUTCDate()).toBe(14);
    expect(start.getUTCHours()).toBe(8); // 09:00 Europe/Berlin (CET)
  });

  it("parses a normal date already passed this year as next year", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "2",
          url: "https://www.eventbrite.de/e/some-hackathon-tickets-2",
          name: "Winter Hackathon Munich",
          location: "Munich, BY",
          // NOW is 2026-09-01, so Jan 20 has already passed this year.
          dateText: "Wed, Jan 20, 8:00 AM",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    const start = result.hackathons[0].date_start;
    expect(start.getUTCFullYear()).toBe(2027);
    expect(start.getUTCMonth()).toBe(0); // January
    expect(start.getUTCDate()).toBe(20);
  });

  it('resolves "Today at ..." relative to the fixed system clock', async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "3",
          url: "https://www.eventbrite.de/e/today-hackathon-tickets-3",
          name: "Today Hackathon Sprint",
          location: "Berlin, BE",
          dateText: "Today at 3:00 PM + 5 more",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    const start = result.hackathons[0].date_start;
    // NOW is 2026-09-01T12:00:00Z.
    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(8); // September
    expect(start.getUTCDate()).toBe(1);
    expect(start.getUTCHours()).toBe(13); // 15:00 Europe/Berlin (CEST)
  });

  it("resolves a bare weekday name to the next occurrence of that weekday, not last week", async () => {
    // NOW (2026-09-01) is a Tuesday. "Thursday" should resolve to 2026-09-03.
    mockFetchPerCountry({
      germany: [
        {
          id: "4",
          url: "https://www.eventbrite.de/e/thursday-hackathon-tickets-4",
          name: "Thursday Build Hackathon",
          location: "Hamburg, HH",
          dateText: "Thursday at 1:00 PM + 34 more",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    const start = result.hackathons[0].date_start;
    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(8); // September
    expect(start.getUTCDate()).toBe(3);
    expect(start.getUTCHours()).toBe(11); // 13:00 Europe/Berlin (CEST)
  });

  it("drops an event whose date text cannot be parsed at all, without crashing", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "5",
          url: "https://www.eventbrite.de/e/garbled-hackathon-tickets-5",
          name: "Garbled Date Hackathon",
          location: "Berlin, BE",
          dateText: "Sometime next month, probably",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(0);
    expect(result.status).toBe("ok");
  });

  it("decodes numeric HTML entities in the title (real French event, verified live)", async () => {
    mockFetchPerCountry({
      france: [
        {
          id: "1994652674845",
          url: "https://www.eventbrite.fr/e/billets-hackathon-aim-2026-lia-au-service-de-legalite-1994652674845",
          name: "Hackathon AIM 2026 - L&#x27;IA au service de l&#x27;égalité",
          location: "Marseille, PACA",
          dateText: "Thu, Sep 24, 8:00 AM",
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    expect(result.hackathons[0].name).toBe(
      "Hackathon AIM 2026 - L'IA au service de l'égalité",
    );
    expect(result.hackathons[0].country_code).toBe("FR");
  });

  it("filters out a past-dated event", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "6",
          url: "https://www.eventbrite.de/e/past-hackathon-tickets-6",
          name: "Already Started Hackathon",
          location: "Berlin, BE",
          dateText: "Sun, Aug 30, 9:00 AM",
          structured: {
            startDate: "2026-08-30",
            startTime: "09:00",
            timezone: "Europe/Berlin",
          },
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(0);
  });

  it("follows a second directory page and keeps events with distinct IDs", async () => {
    const originalMaxPages = process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY;
    process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY = "2";

    try {
      const page1 = readFixture("eventbrite-directory-page-1.html");
      const page2 = readFixture("eventbrite-directory-page-2.html");
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const url = input.toString();
        if (!url.includes("/d/germany/hackathon/")) {
          return {
            ok: true,
            status: 200,
            text: async () => buildDirectoryHtml([]),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          text: async () => (url.includes("page=2") ? page2 : page1),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      const pendingParse = new EventbriteParser().parse();
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await pendingParse;

      expect(result.status).toBe("ok");
      expect(result.hackathons.map((event) => event.name)).toEqual([
        "Page One Robotics Hackathon",
        "Page Two AI Hackathon",
      ]);
      expect(result.hackathons.map((event) => event.url)).toEqual([
        "https://www.eventbrite.de/e/page-one-robotics-hackathon-tickets-1001",
        "https://www.eventbrite.com/e/page-two-ai-hackathon-tickets-1002",
      ]);
      expect(
        fetchMock.mock.calls.some(([input]) =>
          input.toString().includes("page=2"),
        ),
      ).toBe(true);
    } finally {
      if (originalMaxPages === undefined) {
        delete process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY;
      } else {
        process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY = originalMaxPages;
      }
    }
  });

  it("reports partial when the page bound stops before Eventbrite's next page", async () => {
    const originalMaxPages = process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY;
    process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY = "1";

    try {
      const page1 = readFixture("eventbrite-directory-page-1.html");
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        const url = input.toString();
        if (!url.includes("/d/germany/hackathon/")) {
          return {
            ok: true,
            status: 200,
            text: async () => buildDirectoryHtml([]),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          text: async () => page1,
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      const pendingParse = new EventbriteParser().parse();
      await vi.advanceTimersByTimeAsync(60_000);
      const result = await pendingParse;

      expect(result.status).toBe("partial");
      expect(result.success).toBe(true);
      expect(result.hackathons.map((event) => event.name)).toEqual([
        "Page One Robotics Hackathon",
      ]);
      expect(result.errors.some((error) => error.includes("page limit"))).toBe(
        true,
      );
    } finally {
      if (originalMaxPages === undefined) {
        delete process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY;
      } else {
        process.env.EVENTBRITE_MAX_PAGES_PER_COUNTRY = originalMaxPages;
      }
    }
  });

  it("converts structured European local time and preserves a multi-day end", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "10",
          url: "https://www.eventbrite.de/e/multi-day-hackathon-tickets-10?aff=ebdssbdestsearch",
          name: "Multi Day Robotics Hackathon",
          location: "Augsburg, BY",
          dateText: "Thu, Oct 22, 9:00 AM",
          structured: {
            startDate: "2026-10-22",
            startTime: "09:00",
            timezone: "Europe/Berlin",
            endDate: "2026-10-23",
            endTime: "13:00",
            city: "Augsburg",
            region: "BY",
            venueName: "Digitales Zentrum Schwaben",
          },
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toHaveLength(1);
    expect(result.hackathons[0].date_start.toISOString()).toBe(
      "2026-10-22T07:00:00.000Z",
    );
    expect(result.hackathons[0].date_end?.toISOString()).toBe(
      "2026-10-23T11:00:00.000Z",
    );
    expect(result.hackathons[0].url).not.toContain("aff=");
  });

  it("applies the Europe/Berlin DST offset from structured data", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "11",
          url: "https://www.eventbrite.de/e/summer-hackathon-tickets-11",
          name: "Summer AI Hackathon",
          location: "Berlin, BE",
          dateText: "Wed, Sep 30, 5:00 PM",
          structured: {
            startDate: "2026-09-30",
            startTime: "17:00",
            timezone: "Europe/Berlin",
            city: "Berlin",
          },
        },
        {
          id: "12",
          url: "https://www.eventbrite.de/e/winter-hackathon-tickets-12",
          name: "Winter AI Hackathon",
          location: "Berlin, BE",
          dateText: "Sun, Nov 15, 5:00 PM",
          structured: {
            startDate: "2026-11-15",
            startTime: "17:00",
            timezone: "Europe/Berlin",
            city: "Berlin",
          },
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(
      result.hackathons.map((event) => event.date_start.toISOString()),
    ).toEqual(["2026-09-30T15:00:00.000Z", "2026-11-15T16:00:00.000Z"]);
  });

  it("maps online and TBD listings without treating them as physical", async () => {
    mockFetchPerCountry({
      germany: [
        {
          id: "13",
          url: "https://www.eventbrite.de/e/online-hackathon-tickets-13",
          name: "Online AI Hackathon",
          location: "Online",
          dateText: "Sat, Oct 3, 9:00 AM",
          structured: {
            startDate: "2026-10-03",
            startTime: "09:00",
            timezone: "Europe/Berlin",
            isOnlineEvent: true,
          },
        },
        {
          id: "14",
          url: "https://www.eventbrite.de/e/tbd-hackathon-tickets-14",
          name: "TBD Robotics Hackathon",
          location: "TBD",
          dateText: "Sat, Oct 10, 9:00 AM",
          structured: {
            startDate: "2026-10-10",
            startTime: "09:00",
            timezone: "Europe/Berlin",
            city: "Munich",
            venueName: "TBD",
            isOnlineEvent: false,
          },
        },
      ],
    });

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(
      result.hackathons.find((event) => event.name === "Online AI Hackathon")
        ?.location_type,
    ).toBe("online");
    expect(
      result.hackathons.find((event) => event.name === "TBD Robotics Hackathon")
        ?.location_type,
    ).toBe("tbd");
  });

  it("survives reordered attributes, whitespace, and nested title markup", async () => {
    const driftedHtml = `<!DOCTYPE html>
      <html><body>
        <article class="event-card">
          <a
            data-event-location='Berlin, BE'
            data-event-id='15'
            aria-label='View Berlin Platform Hackathon'
            href='https://www.eventbrite.de/e/berlin-platform-hackathon-tickets-15?aff=ebdssbdestsearch'
            class='event-card-link'>
            <h3 class='title'><span>Berlin Platform Hackathon</span></h3>
          </a>
          <div class="event-card-details">
            <p class="date"> Sat, Nov 14, 9:00 AM </p>
          </div>
        </article>
      </body></html>`;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      return {
        ok: true,
        status: 200,
        text: async () =>
          url.includes("/d/germany/hackathon/")
            ? driftedHtml
            : buildDirectoryHtml([]),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.status).toBe("ok");
    expect(result.hackathons).toHaveLength(1);
    expect(result.hackathons[0].name).toBe("Berlin Platform Hackathon");
  });

  it("does not report ok when expected Eventbrite markup is present but malformed", async () => {
    const malformedHtml =
      '<html><body><a data-event-id="16" href="https://www.eventbrite.de/e/broken-tickets-16"><h3>Broken Hackathon';
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () => malformedHtml,
          }) as Response,
      ),
    );

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.status).not.toBe("ok");
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.errors.some((error) => error.includes("markup"))).toBe(true);
  });

  it("reports status 'partial' when some country slugs fail and others succeed", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      if (url.includes("/d/germany/hackathon/")) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            buildDirectoryHtml([
              {
                id: "7",
                url: "https://www.eventbrite.de/e/hackathon-tickets-7",
                name: "Working Country Hackathon",
                location: "Berlin, BE",
                dateText: "Sat, Nov 14, 9:00 AM",
              },
            ]),
        } as Response;
      }
      throw new Error("simulated network failure");
    });

    vi.stubGlobal("fetch", fetchMock);

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.status).toBe("partial");
    expect(result.success).toBe(true);
    expect(result.hackathons.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports status 'failed' when every country slug fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );

    const pendingParse = new EventbriteParser().parse();
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pendingParse;

    expect(result.hackathons).toEqual([]);
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
