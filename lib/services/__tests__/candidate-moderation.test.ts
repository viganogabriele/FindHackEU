import { describe, expect, it, vi } from "vitest";
import { moveCandidateToPending } from "@/lib/services/candidate-moderation";

function createFakeSupabase(updateError: { message: string } | null = null) {
  const updateCalls: unknown[] = [];
  const client = {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockImplementation((patch: unknown) => {
        updateCalls.push(patch);
        return {
          eq: vi.fn().mockResolvedValue({ error: updateError }),
        };
      }),
    }),
  };

  return { client, updateCalls };
}

describe("moveCandidateToPending", () => {
  it("resets a rejected candidate to the pending review state", async () => {
    const { client, updateCalls } = createFakeSupabase();

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

  it("surfaces an update error", async () => {
    const { client } = createFakeSupabase({ message: "update failed" });

    const result = await moveCandidateToPending(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "candidate-1",
    );

    expect(result).toEqual({ outcome: "error", message: "update failed" });
  });
});
