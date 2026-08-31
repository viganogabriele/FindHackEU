import { describe, expect, it } from "vitest";
import {
  DEFAULT_TITLE_SIMILARITY_THRESHOLD,
  areTitlesSimilar,
  titleSimilarity,
} from "@/lib/dedup/fuzzy-matcher";

describe("titleSimilarity / areTitlesSimilar", () => {
  it("scores identical titles as 1", () => {
    expect(titleSimilarity("Berlin AI Hackathon", "Berlin AI Hackathon")).toBe(
      1,
    );
  });

  it("is case- and whitespace-insensitive", () => {
    expect(
      titleSimilarity("  Berlin AI Hackathon ", "berlin ai hackathon"),
    ).toBe(1);
  });

  it("scores minor near-duplicate title variations across providers above the default threshold", () => {
    // e.g. a one-character typo/formatting slip between how two providers
    // transcribed the same event's title.
    const similarity = titleSimilarity(
      "Berlin AI Hackathon",
      "Berlin AI Hackaton",
    );

    expect(similarity).toBeGreaterThanOrEqual(
      DEFAULT_TITLE_SIMILARITY_THRESHOLD,
    );
    expect(areTitlesSimilar("Berlin AI Hackathon", "Berlin AI Hackaton")).toBe(
      true,
    );
  });

  it("scores genuinely different titles well below the default threshold", () => {
    const similarity = titleSimilarity(
      "Berlin AI Hackathon",
      "Munich Web3 Builders Weekend",
    );

    expect(similarity).toBeLessThan(DEFAULT_TITLE_SIMILARITY_THRESHOLD);
    expect(
      areTitlesSimilar("Berlin AI Hackathon", "Munich Web3 Builders Weekend"),
    ).toBe(false);
  });

  it("respects a custom threshold", () => {
    expect(areTitlesSimilar("Hackathon A", "Hackathon B", 0.99)).toBe(false);
    expect(areTitlesSimilar("Hackathon A", "Hackathon B", 0.5)).toBe(true);
  });
});
