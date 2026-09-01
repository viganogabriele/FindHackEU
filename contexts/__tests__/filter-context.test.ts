import { describe, expect, it } from "vitest";
import { retainAvailableLocations } from "@/contexts/filter-context";

describe("retainAvailableLocations", () => {
  it("keeps selected locations which exist for the newly selected status", () => {
    expect(
      retainAvailableLocations(
        ["Milan, Italy", "Berlin, Germany"],
        ["Berlin, Germany", "Paris, France"],
      ),
    ).toEqual(["Berlin, Germany"]);
  });

  it("returns an empty selection only when none of the locations remain available", () => {
    expect(
      retainAvailableLocations(["Milan, Italy"], ["Paris, France"]),
    ).toEqual([]);
  });
});
