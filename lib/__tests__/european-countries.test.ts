/**
 * Companion to lib/parsers/__tests__/luma-parser.test.ts's "known city, no
 * country" test (case 5 of issue #35): this confirms the known-city map in
 * lib/european-countries.ts itself resolves correctly. The Luma test
 * separately documents that luma-parser.ts never actually calls this
 * function today (unlike lib/parsers/lablab-parser.ts, which does).
 */
import { describe, expect, it } from "vitest";
import { europeanCountries } from "@/lib/european-countries";

describe("europeanCountries.inferCountryFromCity", () => {
  it("resolves a known city with no explicit country to its country code", () => {
    expect(europeanCountries.inferCountryFromCity("Berlin")).toBe("DE");
    expect(europeanCountries.inferCountryFromCity("zurich")).toBe("CH");
  });

  it("returns undefined for an unknown city", () => {
    expect(
      europeanCountries.inferCountryFromCity("Not A Real City"),
    ).toBeUndefined();
  });
});
