/**
 * Case 7 of issue #35 (repo-wide half): "cross-provider duplicates".
 *
 * app/api/update/route.ts is not unit-testable in isolation today — it's a
 * single POST handler that, on import, constructs a live Supabase client
 * (lib/supabase.ts calls createClient() at module scope using
 * process.env.NEXT_PUBLIC_SUPABASE_URL, which throws if unset) and pulls in
 * the Discord/Telegram/Twitter bots and Octokit. Making it testable is
 * exactly the kind of thing the #9 (P0-07) architectural refactor this issue
 * blocks is meant to fix — see CLAUDE.md's roadmap section and issue #35's
 * "Blocks" field.
 *
 * As of issue #22, the cross-provider dedup step in route.ts is no longer a
 * private inline reduce() — it's the shared, directly-testable
 * `mergeHackathonDuplicates` from lib/dedup/dedupe-hackathons.ts (also used
 * by LumaParser's own dedup). This file now imports and exercises that real
 * function instead of maintaining a hand-copied algorithm in sync with
 * route.ts; lib/dedup/__tests__/dedupe-hackathons.test.ts covers the
 * normalized-URL / fuzzy-title / provenance behavior in more depth.
 */
import { describe, expect, it } from "vitest";
import type { ParsedHackathon } from "@/lib/parsers/base-parser";
import { mergeHackathonDuplicates } from "@/lib/dedup/dedupe-hackathons";

function makeHackathon(overrides: Partial<ParsedHackathon>): ParsedHackathon {
  return {
    name: "Some Hackathon",
    date_start: new Date("2025-09-01T09:00:00.000Z"),
    url: "https://example.com/some-hackathon",
    source: "luma",
    ...overrides,
  };
}

describe("app/api/update/route.ts dedup logic", () => {
  it("collapses same-name/same-day events reported by two different providers", () => {
    const lumaEvent = makeHackathon({
      name: "Berlin AI Hackathon",
      date_start: new Date("2025-09-01T09:00:00.000Z"),
      url: "https://luma.com/berlin-ai-hackathon",
      source: "luma",
    });
    const lablabEvent = makeHackathon({
      name: "Berlin AI Hackathon",
      // Same calendar day, different time-of-day — still deduped, because
      // the same-day check truncates to the date, not the instant.
      date_start: new Date("2025-09-01T18:30:00.000Z"),
      url: "https://lablab.ai/event/berlin-ai-hackathon",
      source: "lablab",
    });

    const result = mergeHackathonDuplicates([lumaEvent, lablabEvent]);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("luma"); // first one wins
    // The second provider's URL is retained as provenance rather than
    // discarded (in-memory only — see issue #22's scope note).
    expect(result[0].alternateUrls).toEqual([
      "https://lablab.ai/event/berlin-ai-hackathon",
    ]);
  });

  it("treats differently-cased names on the same day as duplicates (case-insensitive title match)", () => {
    const eventA = makeHackathon({ name: "Paris Web3 Hackathon" });
    const eventB = makeHackathon({ name: "PARIS WEB3 HACKATHON  " });

    const result = mergeHackathonDuplicates([eventA, eventB]);

    expect(result).toHaveLength(1);
  });

  it("keeps events with the same name on different days distinct", () => {
    const eventA = makeHackathon({
      name: "Recurring Hackathon",
      date_start: new Date("2025-09-01T09:00:00.000Z"),
    });
    const eventB = makeHackathon({
      name: "Recurring Hackathon",
      date_start: new Date("2025-10-01T09:00:00.000Z"),
    });

    const result = mergeHackathonDuplicates([eventA, eventB]);

    expect(result).toHaveLength(2);
  });

  it("[guard rail, issue #22] keeps two same-day, similarly-named events in different known cities distinct", () => {
    // Previously (lowercased-name + date-only key), these would have been
    // wrongly collapsed into one. The shared matcher now vetoes a fuzzy
    // title match when city/country actively conflict.
    const berlinEvent = makeHackathon({
      name: "AI Hackathon",
      url: "https://luma.com/ai-hackathon-berlin",
      city: "Berlin",
      country_code: "DE",
    });
    const munichEvent = makeHackathon({
      name: "AI Hackathon",
      url: "https://luma.com/ai-hackathon-munich",
      city: "Munich",
      country_code: "DE",
    });

    const result = mergeHackathonDuplicates([berlinEvent, munichEvent]);

    expect(result).toHaveLength(2);
  });
});
