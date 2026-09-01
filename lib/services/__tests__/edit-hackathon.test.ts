import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { editHackathon } from "@/lib/services/edit-hackathon";

function mockUpdate(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabaseAdmin.from).mockReturnValue({ update } as never);
  return { update, eq };
}

describe("editHackathon", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a missing name", async () => {
    const result = await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "   ",
      dateStart: "2026-11-15",
    });

    expect(result).toEqual({
      outcome: "invalid",
      message: "Name is required.",
    });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it.each(["", "not-a-url", "javascript:alert(1)", "http://127.0.0.1/private"])(
    "rejects an unsafe URL: %s",
    async (url) => {
      const result = await editHackathon({
        hackathonId: "abc",
        url,
        name: "Some Hackathon",
        dateStart: "2026-11-15",
      });

      expect(result).toEqual({
        outcome: "invalid",
        message: "A public HTTP(S) URL is required.",
      });
      expect(supabaseAdmin.from).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-European country name", async () => {
    const result = await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "Some Hackathon",
      countryCode: "India",
      dateStart: "2026-11-15",
    });

    expect(result).toMatchObject({ outcome: "invalid" });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("rejects a missing date because published hackathons require date_start", async () => {
    const result = await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "Some Hackathon",
    });

    expect(result).toEqual({
      outcome: "invalid",
      message: "Start date is required.",
    });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("rejects an unparseable date", async () => {
    const result = await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "Some Hackathon",
      dateStart: "not-a-date",
    });

    expect(result).toEqual({ outcome: "invalid", message: "Invalid date." });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("updates the row with normalized country, trimmed fields, and an editable URL", async () => {
    const { update, eq } = mockUpdate({ error: null });

    const result = await editHackathon({
      hackathonId: "abc-123",
      url: " https://example.org/hack-the-peak ",
      name: " Hack The Peak ",
      city: " Bolzano ",
      countryCode: "Italy",
      dateStart: "2026-11-15",
      topics: ["AI", "Web3", "AI"],
    });

    expect(result).toEqual({ outcome: "updated" });
    expect(update).toHaveBeenCalledWith({
      name: "Hack The Peak",
      url: "https://example.org/hack-the-peak",
      city: "Bolzano",
      country_code: "IT",
      date_start: "2026-11-15T00:00:00.000Z",
      topics: ["AI", "Web3"],
    });
    expect(eq).toHaveBeenCalledWith("id", "abc-123");
  });

  it("allows clearing the optional city and country fields", async () => {
    const { update } = mockUpdate({ error: null });

    const result = await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "Some Hackathon",
      city: "   ",
      countryCode: "",
      dateStart: "2026-11-15",
    });

    expect(result).toEqual({ outcome: "updated" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ city: null, country_code: null }),
    );
  });

  it("silently drops invalid topic values while preserving valid selections", async () => {
    const { update } = mockUpdate({ error: null });

    await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "Some Hackathon",
      dateStart: "2026-11-15",
      topics: ["AI", "NotARealTopic"],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ["AI"] }),
    );
  });

  it("stores null topics when none are selected", async () => {
    const { update } = mockUpdate({ error: null });

    await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "Some Hackathon",
      dateStart: "2026-11-15",
      topics: [],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ topics: null }),
    );
  });

  it("surfaces a database error", async () => {
    mockUpdate({ error: { message: "db down" } });

    const result = await editHackathon({
      hackathonId: "abc",
      url: "https://example.org/event",
      name: "Some Hackathon",
      dateStart: "2026-11-15",
    });

    expect(result).toEqual({ outcome: "error", message: "db down" });
  });
});
