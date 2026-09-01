import { describe, expect, it } from "vitest";
import { EUROPEAN_COUNTRIES } from "@/lib/european-countries";
import {
  getCountryCentroid,
  resolveMapCoordinates,
} from "@/lib/country-centroids";

describe("country map coordinates", () => {
  it("has a finite fallback coordinate for every supported European country", () => {
    for (const country of EUROPEAN_COUNTRIES) {
      const centroid = getCountryCentroid(country.code);

      expect(centroid, country.code).toBeDefined();
      expect(Number.isFinite(centroid?.latitude)).toBe(true);
      expect(Number.isFinite(centroid?.longitude)).toBe(true);
    }
  });

  it("prefers precise coordinates over the country fallback", () => {
    expect(
      resolveMapCoordinates({
        latitude: 41.9,
        longitude: 12.5,
        countryCode: "IT",
      }),
    ).toEqual({ latitude: 41.9, longitude: 12.5, approximate: false });
  });

  it("uses a case-insensitive country fallback when precise coordinates are missing", () => {
    expect(
      resolveMapCoordinates({
        latitude: null,
        longitude: null,
        countryCode: "de",
      }),
    ).toEqual({
      latitude: 51.1657,
      longitude: 10.4515,
      approximate: true,
    });
  });

  it("omits a hackathon when it has no precise coordinates or recognized country", () => {
    expect(
      resolveMapCoordinates({
        latitude: null,
        longitude: null,
        countryCode: "US",
      }),
    ).toBeUndefined();
  });
});
