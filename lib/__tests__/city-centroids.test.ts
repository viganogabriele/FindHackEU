import { describe, expect, it } from "vitest";
import { getCityCentroid, normalizeCityKey } from "@/lib/city-centroids";
import { resolveMapCoordinates } from "@/lib/country-centroids";

describe("city centroids lookup", () => {
  it("resolves a few known cities to finite coordinates", () => {
    for (const city of ["Berlin", "Paris", "Rome", "Amsterdam", "Warsaw"]) {
      const centroid = getCityCentroid(city);

      expect(centroid, city).toBeDefined();
      expect(Number.isFinite(centroid?.latitude)).toBe(true);
      expect(Number.isFinite(centroid?.longitude)).toBe(true);
    }
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(getCityCentroid("  BERLIN  ")).toEqual(getCityCentroid("berlin"));
    expect(getCityCentroid("Milan")).toEqual(getCityCentroid("MILAN"));
  });

  it("normalizes diacritics so locale spelling variants match", () => {
    expect(normalizeCityKey("München")).toBe(normalizeCityKey("Munchen"));
    expect(getCityCentroid("München")).toEqual(getCityCentroid("Munich"));
  });

  it("returns undefined for an unknown or missing city", () => {
    expect(getCityCentroid("Nowheresville")).toBeUndefined();
    expect(getCityCentroid(null)).toBeUndefined();
    expect(getCityCentroid(undefined)).toBeUndefined();
    expect(getCityCentroid("")).toBeUndefined();
    expect(getCityCentroid("   ")).toBeUndefined();
  });
});

describe("resolveMapCoordinates city fallback", () => {
  it("prefers precise coordinates over both city and country fallbacks", () => {
    expect(
      resolveMapCoordinates({
        latitude: 1,
        longitude: 2,
        countryCode: "IT",
        city: "Rome",
      }),
    ).toEqual({ latitude: 1, longitude: 2, approximate: false });
  });

  it("uses the city centroid, flagged approximate, when coordinates are missing", () => {
    expect(
      resolveMapCoordinates({
        latitude: null,
        longitude: null,
        countryCode: "IT",
        city: "Turin",
      }),
    ).toEqual({
      latitude: 45.0703,
      longitude: 7.6869,
      approximate: true,
    });
  });

  it("distinguishes two cities in the same country instead of collapsing on the country centroid", () => {
    const rome = resolveMapCoordinates({
      latitude: null,
      longitude: null,
      countryCode: "IT",
      city: "Rome",
    });
    const turin = resolveMapCoordinates({
      latitude: null,
      longitude: null,
      countryCode: "IT",
      city: "Turin",
    });

    expect(rome).toBeDefined();
    expect(turin).toBeDefined();
    expect(rome).not.toEqual(turin);
  });

  it("falls back to the country centroid, still approximate, when the city isn't in the table", () => {
    expect(
      resolveMapCoordinates({
        latitude: null,
        longitude: null,
        countryCode: "IT",
        city: "SomeSmallTownNotListed",
      }),
    ).toEqual({
      latitude: 41.8719,
      longitude: 12.5674,
      approximate: true,
    });
  });

  it("falls back to the country centroid when city is missing or blank", () => {
    expect(
      resolveMapCoordinates({
        latitude: null,
        longitude: null,
        countryCode: "DE",
        city: null,
      }),
    ).toEqual({
      latitude: 51.1657,
      longitude: 10.4515,
      approximate: true,
    });

    expect(
      resolveMapCoordinates({
        latitude: null,
        longitude: null,
        countryCode: "DE",
        city: "   ",
      }),
    ).toEqual({
      latitude: 51.1657,
      longitude: 10.4515,
      approximate: true,
    });
  });
});
