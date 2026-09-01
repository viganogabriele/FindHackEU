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
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
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
      dateRange: undefined,
      status: "upcoming" as const,
      sort: "asc" as const,
      includeNonEnglish: false,
    };

    expect(
      filterAndSortHackathons([withoutCoordinates], filters, "en"),
    ).toEqual([withoutCoordinates]);
  });
});
