import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { submitManualCandidate } from "@/lib/services/submit-manual-candidate";

function mockUpsert(result: { error: unknown }) {
  const upsert = vi.fn().mockResolvedValue(result);
  vi.mocked(supabaseAdmin.from).mockReturnValue({ upsert } as never);
  return upsert;
}

describe("submitManualCandidate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing name", async () => {
    const result = await submitManualCandidate({
      url: "https://example.org/event",
      name: "  ",
    });

    expect(result).toEqual({
      outcome: "invalid",
      message: "Name is required.",
    });
  });

  it("rejects an invalid URL", async () => {
    const result = await submitManualCandidate({
      url: "not-a-url",
      name: "Some Hackathon",
    });

    expect(result.outcome).toBe("invalid");
  });

  it.each(["javascript:alert(1)", "ftp://example.org/event"])(
    "rejects a non-HTTP URL: %s",
    async (url) => {
      const result = await submitManualCandidate({
        url,
        name: "Some Hackathon",
      });

      expect(result).toEqual({
        outcome: "invalid",
        message: "A public HTTP(S) URL is required.",
      });
    },
  );

  it("rejects a non-European country name", async () => {
    const result = await submitManualCandidate({
      url: "https://example.org/event",
      name: "Some Hackathon",
      countryCode: "India",
    });

    expect(result).toMatchObject({ outcome: "invalid" });
  });

  it("inserts a pending candidate with normalized country and full-name resolution", async () => {
    const upsert = mockUpsert({ error: null });

    const result = await submitManualCandidate({
      url: "https://linkedin.com/posts/some-hackathon",
      name: "Hack The Peak",
      city: "Bolzano",
      countryCode: "Italy",
      dateStart: "2026-11-15",
    });

    expect(result).toEqual({ outcome: "created" });
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          name: "Hack The Peak",
          url: "https://linkedin.com/posts/some-hackathon",
          city: "Bolzano",
          country_code: "IT",
          search_provider: "manual",
          extraction_method: "text-fallback",
        }),
      ],
      { onConflict: "url,query", ignoreDuplicates: true },
    );
  });

  it("allows omitting city/country/date entirely", async () => {
    mockUpsert({ error: null });

    const result = await submitManualCandidate({
      url: "https://example.org/event",
      name: "Some Hackathon",
    });

    expect(result).toEqual({ outcome: "created" });
  });

  it("surfaces a database error", async () => {
    mockUpsert({ error: { message: "db down" } });

    const result = await submitManualCandidate({
      url: "https://example.org/event",
      name: "Some Hackathon",
    });

    expect(result).toEqual({ outcome: "error", message: "db down" });
  });
});
