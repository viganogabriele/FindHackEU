import { describe, expect, it, vi } from "vitest";
import {
  RETENTION_ARCHIVE_REASON,
  RETENTION_DAYS,
  isEligibleForRetentionArchive,
  sweepOldPastHackathons,
} from "@/lib/services/retention-sweep";

const NOW = new Date("2026-09-01T00:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("isEligibleForRetentionArchive - date-cutoff math", () => {
  it("is not eligible when status isn't past", () => {
    expect(
      isEligibleForRetentionArchive(
        {
          status: "upcoming",
          date_start: daysAgo(RETENTION_DAYS + 10),
          date_end: null,
          archived_at: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("is not eligible when already archived", () => {
    expect(
      isEligibleForRetentionArchive(
        {
          status: "past",
          date_start: daysAgo(RETENTION_DAYS + 10),
          date_end: null,
          archived_at: daysAgo(1),
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("uses date_end when set, ignoring date_start", () => {
    // date_start is 500 days ago (well past cutoff), but date_end is only
    // 10 days ago - the event just recently ended, so it should NOT be
    // eligible yet. This is the core "date_end wins over date_start when
    // both are present" rule from the issue.
    expect(
      isEligibleForRetentionArchive(
        {
          status: "past",
          date_start: daysAgo(500),
          date_end: daysAgo(10),
          archived_at: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("falls back to date_start when date_end is null", () => {
    expect(
      isEligibleForRetentionArchive(
        {
          status: "past",
          date_start: daysAgo(RETENTION_DAYS + 1),
          date_end: null,
          archived_at: null,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("is not eligible exactly at or under the 365-day cutoff", () => {
    expect(
      isEligibleForRetentionArchive(
        {
          status: "past",
          date_start: daysAgo(RETENTION_DAYS),
          date_end: null,
          archived_at: null,
        },
        NOW,
      ),
    ).toBe(false);

    expect(
      isEligibleForRetentionArchive(
        {
          status: "past",
          date_start: daysAgo(RETENTION_DAYS - 1),
          date_end: null,
          archived_at: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("is eligible just over the 365-day cutoff", () => {
    expect(
      isEligibleForRetentionArchive(
        {
          status: "past",
          date_start: daysAgo(RETENTION_DAYS + 1),
          date_end: null,
          archived_at: null,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("is not eligible for an unparseable date rather than throwing", () => {
    expect(
      isEligibleForRetentionArchive(
        {
          status: "past",
          date_start: "not-a-date",
          date_end: null,
          archived_at: null,
        },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("sweepOldPastHackathons", () => {
  /**
   * A single `from("hackathons")` mock that serves two distinct call
   * shapes reached through this sweep, told apart by the columns each
   * requests (matching what archive-hackathon.ts and retention-sweep.ts
   * actually select):
   *
   *   - The sweep's own list query: `.select("id, status, date_start,
   *     date_end, archived_at").eq("status", "past").is("archived_at",
   *     null).range(from, to)`.
   *   - `archiveHackathon`'s existence check for one row:
   *     `.select("id, archived_at").eq("id", id).maybeSingle()`, followed
   *     by `.update(patch).eq("id", id).is("archived_at", null)`.
   */
  function createFakeSupabase(rows: Array<Record<string, unknown>>) {
    const archivedIds: Array<{ id: string; reason: string | null }> = [];
    const rowsById = new Map(rows.map((row) => [row.id as string, row]));

    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table !== "hackathons") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: vi.fn().mockImplementation((columns: string) => {
            if (columns.includes("status")) {
              // The sweep's list query.
              return {
                eq: vi.fn().mockReturnValue({
                  is: vi.fn().mockReturnValue({
                    range: vi
                      .fn()
                      .mockImplementation((from: number, to: number) =>
                        Promise.resolve({
                          data: rows.slice(from, to + 1),
                          error: null,
                        }),
                      ),
                  }),
                }),
              };
            }

            // archiveHackathon's existence check.
            return {
              eq: vi.fn().mockImplementation((_col: string, id: string) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: rowsById.has(id) ? { id, archived_at: null } : null,
                  error: null,
                }),
              })),
            };
          }),
          update: vi.fn().mockImplementation((patch: unknown) => ({
            eq: vi.fn().mockImplementation((_col: string, id: string) => ({
              is: vi.fn().mockImplementation(() => {
                archivedIds.push({
                  id,
                  reason: (patch as { archived_reason: string | null })
                    .archived_reason,
                });
                return Promise.resolve({ error: null });
              }),
            })),
          })),
        };
      }),
    };

    return { client, archivedIds };
  }

  it("archives only rows past the retention cutoff, using the shared reason", async () => {
    const eligible = {
      id: "old-1",
      status: "past",
      date_start: daysAgo(RETENTION_DAYS + 30),
      date_end: null,
      archived_at: null,
    };
    const notYetEligible = {
      id: "recent-1",
      status: "past",
      date_start: daysAgo(10),
      date_end: null,
      archived_at: null,
    };

    const { client, archivedIds } = createFakeSupabase([
      eligible,
      notYetEligible,
    ]);

    const result = await sweepOldPastHackathons(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { now: NOW },
    );

    expect(result.checked).toBe(2);
    expect(result.archived).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(archivedIds).toEqual([
      { id: "old-1", reason: RETENTION_ARCHIVE_REASON },
    ]);
  });

  it("returns an empty result with no candidates", async () => {
    const { client } = createFakeSupabase([]);

    const result = await sweepOldPastHackathons(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      { now: NOW },
    );

    expect(result).toEqual({
      checked: 0,
      archived: 0,
      skipped: 0,
      errors: [],
    });
  });
});
