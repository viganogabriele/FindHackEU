/**
 * Covers issue #22's acceptance criteria directly against the real,
 * shared dedup logic (lib/dedup/dedupe-hackathons.ts) now used by both
 * LumaParser's own dedup and app/api/update/route.ts's cross-provider
 * merge step.
 */
import { describe, expect, it } from "vitest";
import type { ParsedHackathon } from "@/lib/parsers/base-parser";
import {
  areSameHackathon,
  mergeHackathonDuplicates,
} from "@/lib/dedup/dedupe-hackathons";

function makeHackathon(overrides: Partial<ParsedHackathon>): ParsedHackathon {
  return {
    name: "Some Hackathon",
    date_start: new Date("2025-09-01T09:00:00.000Z"),
    url: "https://example.com/some-hackathon",
    source: "luma",
    ...overrides,
  };
}

describe("mergeHackathonDuplicates", () => {
  it("[acceptance criterion] recognizes https://lu.ma/xyz?utm_source=twitter and https://luma.com/xyz as the same event", () => {
    const a = makeHackathon({
      name: "Cross-Domain Hackathon",
      url: "https://lu.ma/xyz?utm_source=twitter",
      source: "luma-shortlink",
    });
    const b = makeHackathon({
      name: "Cross-Domain Hackathon",
      url: "https://luma.com/xyz",
      source: "luma",
    });

    expect(areSameHackathon(a, b)).toBe(true);

    const result = mergeHackathonDuplicates([a, b]);
    expect(result).toHaveLength(1);
  });

  it("[acceptance criterion] merges two events recognized via fuzzy title+date across providers and retains both original URLs as provenance", () => {
    const lumaEvent = makeHackathon({
      name: "Berlin AI Hackathon",
      date_start: new Date("2025-09-01T09:00:00.000Z"),
      url: "https://luma.com/berlin-ai-hackathon",
      source: "luma",
    });
    const otherProviderEvent = makeHackathon({
      // Same event, transcribed slightly differently by another provider.
      name: "Berlin AI Hackaton",
      date_start: new Date("2025-09-01T18:30:00.000Z"),
      url: "https://otherprovider.example/event/berlin-ai-hackathon",
      source: "otherprovider",
    });

    const result = mergeHackathonDuplicates([lumaEvent, otherProviderEvent]);

    expect(result).toHaveLength(1);
    // First-seen event wins as the canonical record...
    expect(result[0].source).toBe("luma");
    expect(result[0].url).toBe("https://luma.com/berlin-ai-hackathon");
    // ...but the other provider's URL is retained as provenance instead of
    // being silently discarded (in-memory only — see ParsedHackathon.alternateUrls
    // and the deferred-to-#24 note there).
    expect(result[0].alternateUrls).toEqual([
      "https://otherprovider.example/event/berlin-ai-hackathon",
    ]);
  });

  it("[acceptance criterion / guard rail] does NOT merge two genuinely different same-day, similarly-named events in different cities", () => {
    const berlinEvent = makeHackathon({
      name: "AI Hackathon",
      date_start: new Date("2025-09-01T09:00:00.000Z"),
      url: "https://luma.com/ai-hackathon-berlin",
      source: "luma",
      city: "Berlin",
      country_code: "DE",
    });
    const munichEvent = makeHackathon({
      name: "AI Hackathon",
      date_start: new Date("2025-09-01T09:00:00.000Z"),
      url: "https://luma.com/ai-hackathon-munich",
      source: "luma",
      city: "Munich",
      country_code: "DE",
    });

    expect(areSameHackathon(berlinEvent, munichEvent)).toBe(false);

    const result = mergeHackathonDuplicates([berlinEvent, munichEvent]);
    expect(result).toHaveLength(2);
  });

  it("does not merge events with similar titles on different days", () => {
    const a = makeHackathon({
      name: "Recurring Hackathon",
      date_start: new Date("2025-09-01T09:00:00.000Z"),
    });
    const b = makeHackathon({
      name: "Recurring Hackathon",
      date_start: new Date("2025-10-01T09:00:00.000Z"),
      url: "https://example.com/some-other-hackathon",
    });

    const result = mergeHackathonDuplicates([a, b]);
    expect(result).toHaveLength(2);
  });

  it("does not merge same-day events whose titles are simply unrelated", () => {
    const a = makeHackathon({
      name: "Berlin AI Hackathon",
      url: "https://luma.com/berlin-ai-hackathon",
    });
    const b = makeHackathon({
      name: "Munich Web3 Builders Weekend",
      date_start: a.date_start,
      url: "https://luma.com/munich-web3-builders-weekend",
    });

    const result = mergeHackathonDuplicates([a, b]);
    expect(result).toHaveLength(2);
  });

  it("accumulates alternateUrls across more than two duplicate candidates", () => {
    const first = makeHackathon({
      name: "Multi-Source Hackathon",
      url: "https://luma.com/multi-source-hackathon",
    });
    const second = makeHackathon({
      name: "Multi-Source Hackathon",
      url: "https://lu.ma/multi-source-hackathon?utm_source=newsletter",
    });
    const third = makeHackathon({
      name: "Multi Source Hackaton",
      url: "https://otherprovider.example/multi-source-hackathon",
    });

    const result = mergeHackathonDuplicates([first, second, third]);

    expect(result).toHaveLength(1);
    // `second` normalizes to the same URL as `first`, so it contributes no
    // alternate entry; `third` is a genuinely different URL.
    expect(result[0].alternateUrls).toEqual([
      "https://otherprovider.example/multi-source-hackathon",
    ]);
  });
});
