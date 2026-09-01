import { describe, expect, it } from "vitest";
import { dedupeByNormalizedUrl } from "@/lib/dedup/url-normalizer";

describe("dedupeByNormalizedUrl", () => {
  it("keeps the first record when equivalent URLs occur across status buckets", () => {
    const upcoming = {
      id: "upcoming",
      url: "https://www.example.com/event/?utm_source=main",
      status: "upcoming",
    };
    const estimated = {
      id: "estimated",
      url: "https://example.com/event",
      status: "estimated",
    };
    const other = {
      id: "other",
      url: "https://example.com/other-event",
      status: "estimated",
    };

    expect(dedupeByNormalizedUrl([upcoming, estimated, other])).toEqual([
      upcoming,
      other,
    ]);
  });
});
