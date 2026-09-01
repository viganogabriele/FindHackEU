/**
 * Country-wide location filtering (issue #73): a visitor can now select
 * "all of Italy" as a single filter entry alongside individual
 * "City, Country" combinations. These tests cover the pure matching/option
 * -building logic in lib/location-filter.ts directly, independent of the
 * React components that consume it.
 */
import { describe, expect, it } from "vitest";
import {
  buildLocationOptions,
  countryCodeFromLocationValue,
  formatCountryLocationLabel,
  formatLocationValueLabel,
  getCityLocationOptionsForCountry,
  calculateDistanceKm,
  hackathonMatchesLocationFilter,
  hackathonMatchesRadiusFilter,
  isCountryLocationValue,
  narrowCountryToCity,
  toCountryLocationValue,
} from "@/lib/location-filter";

describe("toCountryLocationValue / isCountryLocationValue / countryCodeFromLocationValue", () => {
  it("round-trips a country code through the marker value", () => {
    const value = toCountryLocationValue("IT");
    expect(value).toBe("country:IT");
    expect(isCountryLocationValue(value)).toBe(true);
    expect(countryCodeFromLocationValue(value)).toBe("IT");
  });

  it("does not treat a plain city/country string as a country-wide marker", () => {
    expect(isCountryLocationValue("Milan, Italy")).toBe(false);
    expect(countryCodeFromLocationValue("Milan, Italy")).toBeUndefined();
    // Nor a bare country name produced by formatLocation() with no city.
    expect(isCountryLocationValue("Italy")).toBe(false);
  });
});

describe("hackathonMatchesLocationFilter", () => {
  it("matches everything when no location filter is selected (existing behavior)", () => {
    expect(hackathonMatchesLocationFilter("Milan", "IT", [])).toBe(true);
    expect(hackathonMatchesLocationFilter(null, null, [])).toBe(true);
  });

  it("matches an exact city-level selection, unaffected by this feature", () => {
    expect(
      hackathonMatchesLocationFilter("Milan", "IT", ["Milan, Italy"]),
    ).toBe(true);
    expect(hackathonMatchesLocationFilter("Rome", "IT", ["Milan, Italy"])).toBe(
      false,
    );
  });

  it("still requires an exact city match when other cities of the same country are selected", () => {
    expect(
      hackathonMatchesLocationFilter("Turin", "IT", [
        "Milan, Italy",
        "Rome, Italy",
      ]),
    ).toBe(false);
  });

  it("matches any city when the country-wide marker for that country is selected", () => {
    const selected = [toCountryLocationValue("IT")];
    expect(hackathonMatchesLocationFilter("Milan", "IT", selected)).toBe(true);
    expect(hackathonMatchesLocationFilter("Rome", "IT", selected)).toBe(true);
    expect(hackathonMatchesLocationFilter("Turin", "IT", selected)).toBe(true);
  });

  it("does not match a different country's hackathon against a country-wide marker", () => {
    const selected = [toCountryLocationValue("IT")];
    expect(hackathonMatchesLocationFilter("Berlin", "DE", selected)).toBe(
      false,
    );
  });

  it("matches a hackathon with no city (country only) against its country-wide marker", () => {
    expect(
      hackathonMatchesLocationFilter(null, "IT", [
        toCountryLocationValue("IT"),
      ]),
    ).toBe(true);
  });

  it("combines a country-wide marker for one country with a specific city in another", () => {
    const selected = [toCountryLocationValue("IT"), "Berlin, Germany"];
    expect(hackathonMatchesLocationFilter("Turin", "IT", selected)).toBe(true);
    expect(hackathonMatchesLocationFilter("Berlin", "DE", selected)).toBe(true);
    expect(hackathonMatchesLocationFilter("Munich", "DE", selected)).toBe(
      false,
    );
  });

  it("does not match a hackathon with no resolvable country_code against a country-wide marker", () => {
    expect(
      hackathonMatchesLocationFilter("Somewhere", null, [
        toCountryLocationValue("IT"),
      ]),
    ).toBe(false);
  });
});

describe("radius location filtering", () => {
  it("calculates the great-circle distance in kilometers", () => {
    expect(calculateDistanceKm(0, 0, 0, 1)).toBeCloseTo(111.195, 2);
  });

  it("matches a hackathon at or inside the selected radius", () => {
    const radius = {
      query: "Rome",
      latitude: 41.9028,
      longitude: 12.4964,
      radiusKm: 25,
    };

    expect(hackathonMatchesRadiusFilter(41.9109, 12.4818, radius)).toBe(true);
    expect(hackathonMatchesRadiusFilter(45.4642, 9.19, radius)).toBe(false);
  });

  it("does not match a row without coordinates when a radius is active", () => {
    expect(
      hackathonMatchesRadiusFilter(null, null, {
        query: "Rome",
        latitude: 41.9028,
        longitude: 12.4964,
        radiusKm: 25,
      }),
    ).toBe(false);
  });

  it("matches every row when no radius is selected", () => {
    expect(hackathonMatchesRadiusFilter(null, null, null)).toBe(true);
  });
});

describe("formatCountryLocationLabel / formatLocationValueLabel", () => {
  const allOfLabel = (country: string) => `All of ${country}`;

  it("builds a human label for a country-wide marker, including the flag emoji", () => {
    const label = formatCountryLocationLabel("IT", allOfLabel);
    expect(label).toContain("All of Italy");
    expect(label).toContain("🇮🇹");
  });

  it("passes a plain city/country string through unchanged", () => {
    expect(formatLocationValueLabel("Milan, Italy", allOfLabel)).toBe(
      "Milan, Italy",
    );
  });

  it("formats a country-wide marker via formatLocationValueLabel the same way", () => {
    expect(
      formatLocationValueLabel(toCountryLocationValue("DE"), allOfLabel),
    ).toBe(formatCountryLocationLabel("DE", allOfLabel));
  });
});

describe("buildLocationOptions", () => {
  it("produces one country-wide entry per distinct country plus every distinct city combo", () => {
    const options = buildLocationOptions([
      { city: "Milan", country_code: "IT" },
      { city: "Rome", country_code: "IT" },
      { city: "Berlin", country_code: "DE" },
    ]);

    expect(options).toContain(toCountryLocationValue("IT"));
    expect(options).toContain(toCountryLocationValue("DE"));
    expect(options).toContain("Milan, Italy");
    expect(options).toContain("Rome, Italy");
    expect(options).toContain("Berlin, Germany");

    // Country-wide entries come first, sorted by country name.
    const countryEntries = options.filter((o) => o.startsWith("country:"));
    expect(countryEntries).toEqual([
      toCountryLocationValue("DE"),
      toCountryLocationValue("IT"),
    ]);
    expect(options.indexOf(toCountryLocationValue("DE"))).toBeLessThan(
      options.indexOf("Berlin, Germany"),
    );
  });

  it("does not duplicate a country-wide entry for repeated cities in the same country", () => {
    const options = buildLocationOptions([
      { city: "Milan", country_code: "IT" },
      { city: "Milan", country_code: "IT" },
      { city: "Rome", country_code: "IT" },
    ]);
    expect(
      options.filter((o) => o === toCountryLocationValue("IT")),
    ).toHaveLength(1);
  });

  it("adds no country-wide marker (but still a city entry) when country_code is missing", () => {
    const options = buildLocationOptions([
      { city: "Somewhere", country_code: null },
    ]);
    expect(options.filter((o) => o.startsWith("country:"))).toHaveLength(0);
    expect(options).toEqual(["Somewhere"]);
  });

  it("returns an empty list for an empty input", () => {
    expect(buildLocationOptions([])).toEqual([]);
  });
});

describe("getCityLocationOptionsForCountry", () => {
  it("returns only city entries belonging to the selected country", () => {
    const options = [
      toCountryLocationValue("DE"),
      toCountryLocationValue("IT"),
      "Berlin, Germany",
      "Milan, Italy",
      "Rome, Italy",
      "Italy",
    ];

    expect(getCityLocationOptionsForCountry(options, "IT")).toEqual([
      "Milan, Italy",
      "Rome, Italy",
    ]);
  });

  it("returns no options for an unknown country or a country without cities", () => {
    const options = [toCountryLocationValue("IT"), "Milan, Italy"];

    expect(getCityLocationOptionsForCountry(options, "DE")).toEqual([]);
    expect(getCityLocationOptionsForCountry(options, "ZZ")).toEqual([]);
  });
});

describe("narrowCountryToCity", () => {
  it("replaces a selected country with the selected city", () => {
    expect(
      narrowCountryToCity(
        [toCountryLocationValue("IT"), "Berlin, Germany"],
        toCountryLocationValue("IT"),
        "Milan, Italy",
      ),
    ).toEqual(["Berlin, Germany", "Milan, Italy"]);
  });

  it("removes the city when it is already selected while narrowing", () => {
    expect(
      narrowCountryToCity(
        [toCountryLocationValue("IT"), "Milan, Italy"],
        toCountryLocationValue("IT"),
        "Milan, Italy",
      ),
    ).toEqual([]);
  });
});
