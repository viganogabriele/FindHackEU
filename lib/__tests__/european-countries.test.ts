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

/**
 * classifyCountryCode() distinguishes "a real, well-formed country code
 * that just isn't European" from "genuinely unrecognized text" -
 * normalizeCountry() alone collapses both into `undefined`, which
 * previously made non-European hackathons with explicit source geography
 * (e.g. a US or Japan-tagged Luma event) look like "country undetermined"
 * instead of being recognized and dropped (found in code review, see
 * lib/parsers/luma-parser.ts and lib/services/geocoding-service.ts).
 */
describe("europeanCountries.classifyCountryCode", () => {
  it("classifies a known European code/alias as european", () => {
    expect(europeanCountries.classifyCountryCode("DE")).toBe("european");
    expect(europeanCountries.classifyCountryCode("fr")).toBe("european");
  });

  it("classifies a well-formed but non-European code as non_european", () => {
    expect(europeanCountries.classifyCountryCode("US")).toBe("non_european");
    expect(europeanCountries.classifyCountryCode("JP")).toBe("non_european");
  });

  it("classifies free text that isn't a 2-letter code as unrecognized", () => {
    expect(europeanCountries.classifyCountryCode("Some Garbled Text")).toBe(
      "unrecognized",
    );
    expect(europeanCountries.classifyCountryCode(undefined)).toBe(
      "unrecognized",
    );
  });
});
