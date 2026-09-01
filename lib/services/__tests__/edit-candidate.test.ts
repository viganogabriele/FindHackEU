import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from "@/lib/supabase";
import { editCandidate } from "@/lib/services/edit-candidate";

function mockUpdate(result: { error: unknown }) {
  const eq = vi.fn().mockResolvedValue(result);
  const update = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabaseAdmin.from).mockReturnValue({ update } as never);
  return { update, eq };
}

describe("editCandidate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a missing name", async () => {
    const result = await editCandidate({
      candidateId: "abc",
      name: "   ",
    });

    expect(result).toEqual({
      outcome: "invalid",
      message: "Name is required.",
    });
  });

  it("rejects a non-European country name", async () => {
    const result = await editCandidate({
      candidateId: "abc",
      name: "Some Hackathon",
      countryCode: "India",
    });

    expect(result).toMatchObject({ outcome: "invalid" });
  });

  it("rejects an unparseable date", async () => {
    const result = await editCandidate({
      candidateId: "abc",
      name: "Some Hackathon",
      dateStart: "not-a-date",
    });

    expect(result).toEqual({ outcome: "invalid", message: "Invalid date." });
  });

  it("updates the row with normalized country and full-name resolution", async () => {
    const { update, eq } = mockUpdate({ error: null });

    const result = await editCandidate({
      candidateId: "abc-123",
      name: "Hack The Peak",
      city: "Bolzano",
      countryCode: "Italy",
      dateStart: "2026-11-15",
    });

    expect(result).toEqual({ outcome: "updated" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Hack The Peak",
        city: "Bolzano",
        country_code: "IT",
      }),
    );
    expect(eq).toHaveBeenCalledWith("id", "abc-123");
  });

  it("allows clearing city/country/date entirely", async () => {
    const { update } = mockUpdate({ error: null });

    const result = await editCandidate({
      candidateId: "abc",
      name: "Some Hackathon",
    });

    expect(result).toEqual({ outcome: "updated" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        city: null,
        country_code: null,
        date_start: null,
      }),
    );
  });

  it("stores explicitly chosen topics, deduplicated", async () => {
    const { update } = mockUpdate({ error: null });

    await editCandidate({
      candidateId: "abc",
      name: "Some Hackathon",
      topics: ["AI", "Web3", "AI"],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ["AI", "Web3"] }),
    );
  });

  it("silently drops an invalid topic value rather than rejecting the edit", async () => {
    const { update } = mockUpdate({ error: null });

    await editCandidate({
      candidateId: "abc",
      name: "Some Hackathon",
      topics: ["AI", "NotARealTopic"],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ topics: ["AI"] }),
    );
  });

  it("stores null topics when none are selected", async () => {
    const { update } = mockUpdate({ error: null });

    await editCandidate({
      candidateId: "abc",
      name: "Some Hackathon",
      topics: [],
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ topics: null }),
    );
  });

  it("surfaces a database error", async () => {
    mockUpdate({ error: { message: "db down" } });

    const result = await editCandidate({
      candidateId: "abc",
      name: "Some Hackathon",
    });

    expect(result).toEqual({ outcome: "error", message: "db down" });
  });
});
