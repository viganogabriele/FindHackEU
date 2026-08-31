import { describe, expect, it } from "vitest";
import { isSameNormalizedUrl, normalizeUrl } from "@/lib/dedup/url-normalizer";

describe("normalizeUrl", () => {
  it("unifies lu.ma and luma.com and strips a utm_ tracking param (issue #22 acceptance criterion)", () => {
    const a = "https://lu.ma/xyz?utm_source=twitter";
    const b = "https://luma.com/xyz";

    expect(normalizeUrl(a)).toBe(normalizeUrl(b));
    expect(isSameNormalizedUrl(a, b)).toBe(true);
  });

  it("strips a leading www.", () => {
    expect(normalizeUrl("https://www.example.com/event")).toBe(
      normalizeUrl("https://example.com/event"),
    );
  });

  it("strips multiple tracking parameters regardless of order", () => {
    const a = "https://luma.com/event?utm_source=x&utm_medium=y&fbclid=abc";
    const b = "https://luma.com/event";

    expect(normalizeUrl(a)).toBe(normalizeUrl(b));
  });

  it("keeps non-tracking query parameters as part of the identity", () => {
    const a = "https://example.com/event?ticket=vip";
    const b = "https://example.com/event?ticket=standard";

    expect(normalizeUrl(a)).not.toBe(normalizeUrl(b));
  });

  it("ignores query parameter order", () => {
    const a = "https://example.com/event?b=2&a=1";
    const b = "https://example.com/event?a=1&b=2";

    expect(normalizeUrl(a)).toBe(normalizeUrl(b));
  });

  it("strips a single trailing slash", () => {
    expect(normalizeUrl("https://example.com/event/")).toBe(
      normalizeUrl("https://example.com/event"),
    );
  });

  it("treats genuinely different paths as different events", () => {
    expect(
      isSameNormalizedUrl(
        "https://luma.com/berlin-ai-hackathon",
        "https://luma.com/munich-ai-hackathon",
      ),
    ).toBe(false);
  });

  it("falls back to a light-touch normalization instead of throwing on a non-absolute-URL string", () => {
    expect(() => normalizeUrl("not-a-url")).not.toThrow();
    expect(normalizeUrl("Not-A-URL/")).toBe(normalizeUrl("not-a-url"));
  });
});
