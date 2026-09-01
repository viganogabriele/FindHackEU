import { describe, expect, it, vi } from "vitest";
import { moveCandidateToPending } from "@/lib/services/candidate-moderation";

function createFakeSupabase(options: {
  existing: { id: string; status: string } | null;
  fetchError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const updateCalls: unknown[] = [];
  const client = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: options.fetchError ? null : options.existing,
            error: options.fetchError ?? null,
          }),
        }),
      }),
      update: vi.fn().mockImplementation((patch: unknown) => {
        updateCalls.push(patch);
        return {
          eq: vi.fn().mockResolvedValue({ error: options.updateError ?? null }),
        };
      }),
    }),
  };

  return { client, updateCalls };
}

describe("moveCandidateToPending", () => {
  it("resets a rejected candidate to the pending review state", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "candidate-1", status: "rejected" },
    });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "candidate-1",
    );

    expect(result).toEqual({ outcome: "updated" });
    expect(updateCalls).toEqual([
      { status: "pending", reviewed_at: null, reviewer_note: null },
    ]);
  });

  it("reports not_found without issuing an update", async () => {
    const { client, updateCalls } = createFakeSupabase({ existing: null });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "missing",
    );

    expect(result).toEqual({ outcome: "not_found" });
    expect(updateCalls).toEqual([]);
  });

  it("reports unchanged without issuing an update when the candidate is no longer rejected", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "candidate-1", status: "pending" },
    });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "candidate-1",
    );

    expect(result).toEqual({ outcome: "unchanged" });
    expect(updateCalls).toEqual([]);
  });

  it("surfaces an update error", async () => {
    const { client } = createFakeSupabase({
      existing: { id: "candidate-1", status: "rejected" },
      updateError: { message: "update failed" },
    });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "candidate-1",
    );

    expect(result).toEqual({ outcome: "error", message: "update failed" });
  });
});
