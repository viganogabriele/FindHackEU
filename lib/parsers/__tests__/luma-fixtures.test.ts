/**
 * Demonstrates the file-based fixture-pair pattern introduced by issue #38
 * (see lib/parsers/__fixtures__/README.md): a realistic raw provider
 * response saved as a standalone JSON file, paired with the exact expected
 * normalized output, both checked into the repo as living documentation.
 *
 * This complements -- and does not replace -- the inline-mocked edge case
 * suite in lib/parsers/__tests__/luma-parser.test.ts. That file's job is
 * broad behavioral coverage with small, purpose-built responses defined
 * inline; this file's job is to prove the fixture-pair convention works
 * end-to-end for a single, realistic, fully-documented example that future
 * providers can copy.
 *
 * Note: luma-expected-output.json's topics were pinned to `[]` for both
 * events by an earlier revision of this fixture, documenting a
 * topic-extractor regex bug (issue #8). That bug is now fixed, and the
 * fixture has been updated to the real ['AI'] / ['Crypto', 'Web3'] output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LumaParser } from "@/lib/parsers/luma-parser";
import rawResponseFixture from "@/lib/parsers/__fixtures__/luma-response-example.json";
import expectedOutputFixture from "@/lib/parsers/__fixtures__/luma-expected-output.json";

// Matches the "now" the expected-output fixture's _comment documents: every
// event in luma-response-example.json is in the future relative to this
// clock, and the excluded "winners celebration" entry is unaffected by it.
const NOW = new Date("2026-01-01T00:00:00.000Z");

// The raw fixture is a single realistic Luma API page. LumaParser queries
// three slugs ("tech", "ai", "crypto") and merges/deduplicates the results,
// so serving the same fixture for every request exercises that
// deduplication too (see the expected-output fixture's _comment).
function mockFetchWithFixture() {
  const fetchMock = vi.fn(async () => {
    return {
      ok: true,
      status: 200,
      json: async () => rawResponseFixture,
      text: async () => "",
    } as Response;
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The expected-output fixture stores dates as ISO strings (JSON has no
// native Date type); convert both sides to comparable shapes before
// asserting.
function toComparable(
  hackathons: Awaited<ReturnType<LumaParser["parse"]>>["hackathons"],
) {
  return hackathons.map((hackathon) => ({
    ...hackathon,
    date_start: hackathon.date_start.toISOString(),
    date_end: hackathon.date_end ? hackathon.date_end.toISOString() : undefined,
  }));
}

describe("LumaParser fixture pair (issue #38)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("normalizes luma-response-example.json into exactly luma-expected-output.json", async () => {
    mockFetchWithFixture();

    const result = await new LumaParser().parse();

    expect(toComparable(result.hackathons)).toEqual(
      expectedOutputFixture.hackathons,
    );
  });
});
