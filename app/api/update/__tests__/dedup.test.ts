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
 * In the meantime, this test characterizes the dedup algorithm by copying it
 * verbatim from app/api/update/route.ts (see the reduce() there, currently
 * around lines 154-171) and exercising it directly against fixtures shaped
 * like ParsedHackathon. If that algorithm changes, keep this copy in sync.
 */
import { describe, expect, it } from "vitest";
import type { ParsedHackathon } from "@/lib/parsers/base-parser";

/**
 * Verbatim copy of the dedup reduce() in app/api/update/route.ts.
 * Key = lowercase-trimmed name + calendar day (not full timestamp), and the
 * key does NOT include `source` — so two events with the same name and
 * start date from two different providers ARE treated as duplicates, which
 * is the intended cross-provider behavior.
 */
function deduplicateAcrossProviders(
  parsedHackathons: ParsedHackathon[],
): ParsedHackathon[] {
  return parsedHackathons.reduce(
    (acc, hackathon) => {
      const key = `${hackathon.name.toLowerCase().trim()}-${
        hackathon.date_start.toISOString().split("T")[0]
      }`;

      if (!acc.seen.has(key)) {
        acc.seen.add(key);
        acc.hackathons.push(hackathon);
      }

      return acc;
    },
    {
      seen: new Set<string>(),
      hackathons: [] as ParsedHackathon[],
    },
  ).hackathons;
}

function makeHackathon(overrides: Partial<ParsedHackathon>): ParsedHackathon {
  return {
    name: "Some Hackathon",
    date_start: new Date("2025-09-01T09:00:00.000Z"),
    url: "https://example.com/some-hackathon",
    source: "luma",
    ...overrides,
  };
}

describe("app/api/update/route.ts dedup logic (characterization)", () => {
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
      // the key truncates to the date (`.split("T")[0]`), not the instant.
      date_start: new Date("2025-09-01T18:30:00.000Z"),
      url: "https://lablab.ai/event/berlin-ai-hackathon",
      source: "lablab",
    });

    const result = deduplicateAcrossProviders([lumaEvent, lablabEvent]);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("luma"); // first one wins
  });

  it("treats differently-cased names on the same day as duplicates (case-insensitive key)", () => {
    const eventA = makeHackathon({ name: "Paris Web3 Hackathon" });
    const eventB = makeHackathon({ name: "PARIS WEB3 HACKATHON  " });

    const result = deduplicateAcrossProviders([eventA, eventB]);

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

    const result = deduplicateAcrossProviders([eventA, eventB]);

    expect(result).toHaveLength(2);
  });

  it("[documents a behavioral difference, not a bug] is case-insensitive and day-granular, unlike LumaParser's own internal dedup which is case-sensitive and full-timestamp-granular", () => {
    // LumaParser.deduplicateHackathons() (private, exercised indirectly via
    // parse() in lib/parsers/__tests__/luma-parser.test.ts) keys on
    // `${name}-${date_start.toISOString()}` with no case-folding. The
    // repo-wide dedup above is deliberately looser (case-insensitive, whole
    // day) because it also has to catch duplicates *across* providers whose
    // timestamps and capitalization may not match exactly. Both are
    // "correct" for their own layer; this test just pins the difference so
    // a future refactor (issue #9) doesn't accidentally unify them in a way
    // that silently changes what counts as a duplicate.
    const sameDayDifferentCase = [
      makeHackathon({ name: "edge case hackathon" }),
      makeHackathon({ name: "Edge Case Hackathon" }),
    ];

    expect(deduplicateAcrossProviders(sameDayDifferentCase)).toHaveLength(1);
  });
});
