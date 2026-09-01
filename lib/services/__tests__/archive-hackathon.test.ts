import { describe, expect, it, vi } from "vitest";
import {
  archiveHackathon,
  unarchiveHackathon,
} from "@/lib/services/archive-hackathon";

/**
 * The shared archive/unarchive mechanism (issue #72) both the manual
 * "Archive" button (app/admin/hackathons/actions.ts) and the automatic
 * retention sweep (lib/services/retention-sweep.ts) go through. A fake
 * Supabase client (mock-based per the repo's local-Supabase-only
 * constraint) exercises the real branching logic: not-found, already
 * archived/not archived, and the actual update call's shape.
 */

function createFakeSupabase(options: {
  existing: { id: string; archived_at: string | null } | null;
  updateError?: { message: string } | null;
}) {
  const updateCalls: unknown[] = [];

  const client = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: options.existing,
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockImplementation((patch: unknown) => {
        updateCalls.push(patch);
        return {
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue({
              error: options.updateError ?? null,
            }),
          }),
        };
      }),
    }),
  };

  return { client, updateCalls };
}

describe("archiveHackathon", () => {
  it("archives a not-yet-archived hackathon with the given reason", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "h1", archived_at: null },
    });

    const result = await archiveHackathon(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
      "no longer wanted",
    );

    expect(result.outcome).toBe("archived");
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0] as {
      archived_at: string;
      archived_reason: string;
    };
    expect(patch.archived_reason).toBe("no longer wanted");
    expect(typeof patch.archived_at).toBe("string");
    expect(Number.isNaN(Date.parse(patch.archived_at))).toBe(false);
  });

  it("is idempotent - reports already_archived without overwriting the reason", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "h1", archived_at: "2026-01-01T00:00:00.000Z" },
    });

    const result = await archiveHackathon(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
      "retention: past for over a year",
    );

    expect(result.outcome).toBe("already_archived");
    expect(updateCalls).toHaveLength(0);
  });

  it("reports not_found for a nonexistent id", async () => {
    const { client } = createFakeSupabase({ existing: null });

    const result = await archiveHackathon(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "missing",
      null,
    );

    expect(result.outcome).toBe("not_found");
  });

  it("surfaces a database error from the update call", async () => {
    const { client } = createFakeSupabase({
      existing: { id: "h1", archived_at: null },
      updateError: { message: "boom" },
    });

    const result = await archiveHackathon(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
      null,
    );

    expect(result).toEqual({ outcome: "error", message: "boom" });
  });
});

describe("unarchiveHackathon", () => {
  it("clears archived_at/archived_reason for an archived hackathon", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "h1", archived_at: "2026-01-01T00:00:00.000Z" },
    });

    const result = await unarchiveHackathon(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
    );

    expect(result.outcome).toBe("unarchived");
    expect(updateCalls).toEqual([{ archived_at: null, archived_reason: null }]);
  });

  it("reports not_archived for a hackathon that isn't archived", async () => {
    const { client, updateCalls } = createFakeSupabase({
      existing: { id: "h1", archived_at: null },
    });

    const result = await unarchiveHackathon(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "h1",
    );

    expect(result.outcome).toBe("not_archived");
    expect(updateCalls).toHaveLength(0);
  });

  it("reports not_found for a nonexistent id", async () => {
    const { client } = createFakeSupabase({ existing: null });

    const result = await unarchiveHackathon(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "missing",
    );

    expect(result.outcome).toBe("not_found");
  });
});
