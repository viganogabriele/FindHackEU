import { describe, expect, it } from "vitest";
import type { Hackathon } from "@/types/hackathon";
import { filterAndSortHackathons } from "@/lib/filter-hackathons";

const baseHackathon = {
  id: "1",
  name: "Berlin AI Hackathon",
  city: "Berlin",
  country_code: "DE",
  latitude: 52.52,
  longitude: 13.405,
  date_start: "2026-10-10T09:00:00Z",
  date_end: "2026-10-11T17:00:00Z",
  topics: ["AI"],
} as Hackathon;

describe("filterAndSortHackathons", () => {
  it("returns the same filtered and sorted collection a map should render", () => {
    const filters = {
      search: "berlin",
      locations: [],
      radius: null,
      topics: [],
      eventType: "all" as const,
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
      includeOnline: true,
      showBookmarked: false,
    };

    expect(filterAndSortHackathons([baseHackathon], filters, "en")).toEqual([
      baseHackathon,
    ]);
  });

  it("keeps events without coordinates in the filtered result for the list", () => {
    const withoutCoordinates = {
      ...baseHackathon,
      id: "2",
      name: "Online Hackathon",
      latitude: null,
      longitude: null,
    };

    const filters = {
      search: "",
      locations: [],
      radius: null,
      topics: [],
      eventType: "all" as const,
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
      includeOnline: true,
      showBookmarked: false,
    };

    expect(
      filterAndSortHackathons([withoutCoordinates], filters, "en"),
    ).toEqual([withoutCoordinates]);
  });

  it("filters the shared result to bookmarked events when requested", () => {
    const otherHackathon = {
      ...baseHackathon,
      id: "2",
      name: "Paris Web Hackathon",
      city: "Paris",
      country_code: "FR",
      date_start: "2026-09-10T09:00:00Z",
    };
    const filters = {
      search: "",
      locations: [],
      radius: null,
      topics: [],
      eventType: "all" as const,
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
      includeOnline: true,
      showBookmarked: true,
    };

    expect(
      filterAndSortHackathons([baseHackathon, otherHackathon], filters, "en", [
        baseHackathon.id,
      ]),
    ).toEqual([baseHackathon]);
  });

  it("includes online events by default", () => {
    const onlineHackathon = {
      ...baseHackathon,
      id: "2",
      name: "Remote Web Hackathon",
      location_type: "online" as const,
    };
    const filters = {
      search: "",
      locations: [],
      radius: null,
      topics: [],
      eventType: "all" as const,
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
      includeOnline: true,
      showBookmarked: false,
    };

    expect(
      filterAndSortHackathons([baseHackathon, onlineHackathon], filters, "en"),
    ).toEqual([baseHackathon, onlineHackathon]);
  });

  it("hides online events when includeOnline is false", () => {
    const onlineHackathon = {
      ...baseHackathon,
      id: "2",
      name: "Remote Web Hackathon",
      location_type: "online" as const,
    };
    const filters = {
      search: "",
      locations: [],
      radius: null,
      topics: [],
      eventType: "all" as const,
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
      includeOnline: false,
      showBookmarked: false,
    };

    expect(
      filterAndSortHackathons([baseHackathon, onlineHackathon], filters, "en"),
    ).toEqual([baseHackathon]);
  });

  it("filters challenge events independently from hackathons", () => {
    const challenge = {
      ...baseHackathon,
      id: "challenge",
      name: "Open Data Challenge",
    };
    const filters = {
      search: "",
      locations: [],
      radius: null,
      topics: [],
      eventType: "challenge" as const,
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: true,
      includeOnline: true,
      showBookmarked: false,
    };

    expect(
      filterAndSortHackathons([baseHackathon, challenge], filters, "en"),
    ).toEqual([challenge]);
  });
  // react-day-picker hands back both ends of a picked range at local
  // midnight. Comparing `date_start` against `to` directly dropped every
  // event on the last day the visitor picked: "1 Oct - 10 Oct" excluded a
  // hackathon starting 10 Oct at 09:00, which reads as the filter simply
  // losing events.
  describe("date range", () => {
    const rangeFilters = (from: Date | undefined, to: Date | undefined) => ({
      search: "",
      locations: [],
      radius: null,
      topics: [],
      eventType: "all" as const,
      dateRange: { from, to },
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
      includeOnline: true,
      showBookmarked: false,
    });

    // baseHackathon starts 2026-10-10T09:00:00Z.
    const lastDay = new Date(2026, 9, 10);
    const firstDay = new Date(2026, 9, 1);

    it("includes an event starting on the last day of the range", () => {
      expect(
        filterAndSortHackathons(
          [baseHackathon],
          rangeFilters(firstDay, lastDay),
          "en",
        ),
      ).toEqual([baseHackathon]);
    });

    it("includes an event on a single-day range covering only that day", () => {
      expect(
        filterAndSortHackathons(
          [baseHackathon],
          rangeFilters(lastDay, lastDay),
          "en",
        ),
      ).toEqual([baseHackathon]);
    });

    it("still excludes an event starting after the range ends", () => {
      expect(
        filterAndSortHackathons(
          [baseHackathon],
          rangeFilters(firstDay, new Date(2026, 9, 9)),
          "en",
        ),
      ).toEqual([]);
    });

    it("still excludes an event starting before the range begins", () => {
      expect(
        filterAndSortHackathons(
          [baseHackathon],
          rangeFilters(new Date(2026, 9, 11), undefined),
          "en",
        ),
      ).toEqual([]);
    });
  });
});
