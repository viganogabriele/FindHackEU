import { describe, expect, it } from "vitest";
import { cleanRawSnippet } from "@/lib/format-snippet";

describe("cleanRawSnippet", () => {
  it("strips countdown-timer noise", () => {
    const raw =
      "Home - Brainhack2026 — Brainhack 2027 in… 00Days 00Hours 00Minutes 00Seconds Brainhack Warsaw is an intensive, three-day event.";

    const cleaned = cleanRawSnippet(raw);

    expect(cleaned).not.toMatch(/\d+\s*Days/i);
    expect(cleaned).not.toMatch(/\d+\s*Hours/i);
    expect(cleaned).not.toMatch(/\d+\s*Minutes/i);
    expect(cleaned).not.toMatch(/\d+\s*Seconds/i);
    expect(cleaned).toContain(
      "Brainhack Warsaw is an intensive, three-day event.",
    );
  });

  it("truncates long text at a word boundary with a real ellipsis, never mid-word", () => {
    const raw =
      "As a satellite event of the Brainhack Global initiative (Craddock et al., 2016) and a collaborative partner of the XIV edition of Aspects of Neuroscience, this event brings together researchers from across the continent for three days of intensive collaboration.";

    const cleaned = cleanRawSnippet(raw, 100);

    expect(cleaned.length).toBeLessThanOrEqual(101); // 100 chars + ellipsis char
    expect(cleaned.endsWith("…")).toBe(true);
    // The word immediately before the ellipsis must be a whole word from the
    // source text, not a fragment cut mid-word.
    const words = raw.split(" ");
    const lastWord = cleaned.slice(0, -1).split(" ").pop();
    expect(words).toContain(lastWord);
  });

  it("leaves an already-short snippet unchanged (no-op, no truncation)", () => {
    const raw = "ETH Global Lisbon — a two-day hackathon for builders.";

    const cleaned = cleanRawSnippet(raw);

    expect(cleaned).toBe(raw);
    expect(cleaned.endsWith("…")).toBe(false);
  });

  it("returns an empty string for empty/null/undefined input", () => {
    expect(cleanRawSnippet("")).toBe("");
    expect(cleanRawSnippet(null)).toBe("");
    expect(cleanRawSnippet(undefined)).toBe("");
  });
});
