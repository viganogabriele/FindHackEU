import { describe, expect, it } from "vitest";
import { looksLikeForeignLanguage } from "@/lib/detect-non-english";

describe("looksLikeForeignLanguage", () => {
  it("does not filter Italian text when Italian is allowed", () => {
    expect(looksLikeForeignLanguage("Hackathon per studenti", "it")).toBe(
      false,
    );
  });

  it("filters German text when Italian is allowed", () => {
    expect(looksLikeForeignLanguage("Hackathon für Entwickler", "it")).toBe(
      true,
    );
  });

  it("never filters English text regardless of the allowed locale", () => {
    expect(
      looksLikeForeignLanguage("European AI Hackathon for Builders", "it"),
    ).toBe(false);
    expect(
      looksLikeForeignLanguage("European AI Hackathon for Builders", "sv"),
    ).toBe(false);
  });

  it("filters Italian text when Swedish is allowed", () => {
    expect(looksLikeForeignLanguage("Hackathon per studenti", "sv")).toBe(true);
  });
});
