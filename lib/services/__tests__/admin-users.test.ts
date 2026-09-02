import { describe, expect, it, vi } from "vitest";
import {
  addAdminUser,
  removeAdminUser,
  isAdminUserInTable,
} from "@/lib/services/admin-users";

/**
 * CRUD + authorization-lookup tests for the admin_users table (issue #18).
 * A fake chainable Supabase client (same mock-based pattern as
 * lib/services/__tests__/hackathon-moderation.test.ts) exercises the real
 * branching logic without a live database.
 */

function createFakeSupabase(options: {
  existing: { email: string } | null;
  selectError?: { message: string } | null;
  insertError?: { message: string } | null;
  deleteError?: { message: string } | null;
  deletedRows?: Array<{ email: string }>;
}) {
  const insertCalls: unknown[] = [];
  const deleteEqCalls: unknown[] = [];

  const client = {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: options.selectError ? null : options.existing,
            error: options.selectError ?? null,
          }),
        }),
      }),
      insert: vi.fn().mockImplementation((patch: unknown) => {
        insertCalls.push(patch);
        return Promise.resolve({ error: options.insertError ?? null });
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockImplementation((...args: unknown[]) => {
          deleteEqCalls.push(args);
          return {
            select: vi.fn().mockResolvedValue({
              data: options.deleteError
                ? null
                : (options.deletedRows ?? [{ email: "removed@example.com" }]),
              error: options.deleteError ?? null,
            }),
          };
        }),
      }),
    }),
  };

  return { client, insertCalls, deleteEqCalls };
}

describe("addAdminUser", () => {
  it("adds a new admin, normalizing the email to lowercase", async () => {
    const { client, insertCalls } = createFakeSupabase({ existing: null });

    const result = await addAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "Teammate@Example.com",
      "maintainer@example.com",
    );

    expect(result).toEqual({ outcome: "added" });
    expect(insertCalls).toEqual([
      { email: "teammate@example.com", added_by: "maintainer@example.com" },
    ]);
  });

  it("rejects an implausible email without querying the table", async () => {
    const { client, insertCalls } = createFakeSupabase({ existing: null });

    const result = await addAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "not-an-email",
      null,
    );

    expect(result.outcome).toBe("invalid");
    expect(insertCalls).toEqual([]);
  });

  it("is idempotent against re-adding an already-present email", async () => {
    const { client, insertCalls } = createFakeSupabase({
      existing: { email: "teammate@example.com" },
    });

    const result = await addAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "teammate@example.com",
      null,
    );

    expect(result).toEqual({ outcome: "already_exists" });
    expect(insertCalls).toEqual([]);
  });

  it("surfaces an insert error rather than pretending success", async () => {
    const { client } = createFakeSupabase({
      existing: null,
      insertError: { message: "constraint violation" },
    });

    const result = await addAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "teammate@example.com",
      null,
    );

    expect(result).toEqual({
      outcome: "error",
      message: "constraint violation",
    });
  });
});

describe("removeAdminUser", () => {
  it("removes an admin by email", async () => {
    const { client, deleteEqCalls } = createFakeSupabase({
      existing: null,
      deletedRows: [{ email: "teammate@example.com" }],
    });

    const result = await removeAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "Teammate@Example.com",
      "maintainer@example.com",
    );

    expect(result).toEqual({ outcome: "removed" });
    expect(deleteEqCalls).toEqual([["email", "teammate@example.com"]]);
  });

  it("blocks self-removal without touching the database", async () => {
    const { client, deleteEqCalls } = createFakeSupabase({ existing: null });

    const result = await removeAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "me@example.com",
      "Me@Example.com",
    );

    expect(result.outcome).toBe("self_removal_blocked");
    expect(deleteEqCalls).toEqual([]);
  });

  it("reports not_found when the email isn't in the table", async () => {
    const { client } = createFakeSupabase({ existing: null, deletedRows: [] });

    const result = await removeAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "ghost@example.com",
      "maintainer@example.com",
    );

    expect(result).toEqual({ outcome: "not_found" });
  });

  it("surfaces a delete error rather than pretending success", async () => {
    const { client } = createFakeSupabase({
      existing: null,
      deleteError: { message: "connection reset" },
    });

    const result = await removeAdminUser(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      "teammate@example.com",
      "maintainer@example.com",
    );

    expect(result).toEqual({ outcome: "error", message: "connection reset" });
  });
});

describe("isAdminUserInTable", () => {
  it("returns true when the email is present", async () => {
    const { client } = createFakeSupabase({
      existing: { email: "teammate@example.com" },
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isAdminUserInTable(client as any, "Teammate@Example.com"),
    ).resolves.toBe(true);
  });

  it("returns false when the email is absent", async () => {
    const { client } = createFakeSupabase({ existing: null });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isAdminUserInTable(client as any, "stranger@example.com"),
    ).resolves.toBe(false);
  });

  it("fails closed (returns false) when the query errors", async () => {
    const { client } = createFakeSupabase({
      existing: null,
      selectError: { message: "connection reset" },
    });

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isAdminUserInTable(client as any, "teammate@example.com"),
    ).resolves.toBe(false);
  });
});
