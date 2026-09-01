import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkUpdateCooldown,
  getMinUpdateIntervalMinutes,
  DEFAULT_MIN_UPDATE_INTERVAL_MINUTES,
} from "@/lib/services/update-cooldown";

function mockSupabaseAdmin(result: {
  data: { finished_at: string | null; started_at: string | null } | null;
  error?: unknown;
}) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from } as any;
}

describe("getMinUpdateIntervalMinutes", () => {
  afterEach(() => {
    delete process.env.MIN_UPDATE_INTERVAL_MINUTES;
  });

  it("defaults to 5 minutes when unset", () => {
    expect(getMinUpdateIntervalMinutes()).toBe(
      DEFAULT_MIN_UPDATE_INTERVAL_MINUTES,
    );
  });

  it("reads a configured override", () => {
    process.env.MIN_UPDATE_INTERVAL_MINUTES = "10";
    expect(getMinUpdateIntervalMinutes()).toBe(10);
  });

  it("falls back to the default on an invalid value", () => {
    process.env.MIN_UPDATE_INTERVAL_MINUTES = "not-a-number";
    expect(getMinUpdateIntervalMinutes()).toBe(
      DEFAULT_MIN_UPDATE_INTERVAL_MINUTES,
    );
  });

  it("accepts 0 as an explicit disable value", () => {
    process.env.MIN_UPDATE_INTERVAL_MINUTES = "0";
    expect(getMinUpdateIntervalMinutes()).toBe(0);
  });
});

describe("checkUpdateCooldown", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");

  it("allows a run when no prior update_runs row exists", async () => {
    const supabaseAdmin = mockSupabaseAdmin({ data: null });

    const result = await checkUpdateCooldown(supabaseAdmin, {
      minIntervalMinutes: 5,
      now,
    });

    expect(result).toEqual({
      blocked: false,
      minIntervalMinutes: 5,
      lastRunFinishedAt: null,
    });
  });

  it("blocks a run started inside the cooldown window", async () => {
    const supabaseAdmin = mockSupabaseAdmin({
      data: {
        finished_at: "2026-09-01T11:58:00.000Z", // 2 minutes ago
        started_at: "2026-09-01T11:57:50.000Z",
      },
    });

    const result = await checkUpdateCooldown(supabaseAdmin, {
      minIntervalMinutes: 5,
      now,
    });

    expect(result.blocked).toBe(true);
    expect(result.minIntervalMinutes).toBe(5);
    expect(result.lastRunFinishedAt).toBe("2026-09-01T11:58:00.000Z");
    // 5 minutes - 2 minutes elapsed = 3 minutes (180s) remaining
    expect(result.retryAfterSeconds).toBe(180);
  });

  it("allows a run once the cooldown window has fully elapsed", async () => {
    const supabaseAdmin = mockSupabaseAdmin({
      data: {
        finished_at: "2026-09-01T11:54:00.000Z", // 6 minutes ago
        started_at: "2026-09-01T11:53:50.000Z",
      },
    });

    const result = await checkUpdateCooldown(supabaseAdmin, {
      minIntervalMinutes: 5,
      now,
    });

    expect(result).toEqual({
      blocked: false,
      minIntervalMinutes: 5,
      lastRunFinishedAt: "2026-09-01T11:54:00.000Z",
    });
  });

  it("falls back to started_at when the last run hasn't finished yet (still running or crashed)", async () => {
    const supabaseAdmin = mockSupabaseAdmin({
      data: {
        finished_at: null,
        started_at: "2026-09-01T11:59:00.000Z", // 1 minute ago
      },
    });

    const result = await checkUpdateCooldown(supabaseAdmin, {
      minIntervalMinutes: 5,
      now,
    });

    expect(result.blocked).toBe(true);
    expect(result.lastRunFinishedAt).toBeNull();
    expect(result.retryAfterSeconds).toBe(240);
  });

  it("never blocks when minIntervalMinutes is 0 (explicit disable)", async () => {
    const supabaseAdmin = mockSupabaseAdmin({
      data: {
        finished_at: "2026-09-01T11:59:59.000Z",
        started_at: "2026-09-01T11:59:50.000Z",
      },
    });

    const result = await checkUpdateCooldown(supabaseAdmin, {
      minIntervalMinutes: 0,
      now,
    });

    expect(result).toEqual({
      blocked: false,
      minIntervalMinutes: 0,
      lastRunFinishedAt: null,
    });
  });

  it("treats a Supabase lookup error as not blocked (log, don't throw)", async () => {
    const supabaseAdmin = mockSupabaseAdmin({
      data: null,
      error: { message: "db unavailable" },
    });

    const result = await checkUpdateCooldown(supabaseAdmin, {
      minIntervalMinutes: 5,
      now,
    });

    expect(result).toEqual({
      blocked: false,
      minIntervalMinutes: 5,
      lastRunFinishedAt: null,
    });
  });

  it("treats a thrown Supabase call as not blocked (log, don't throw)", async () => {
    const maybeSingle = vi.fn().mockRejectedValue(new Error("network down"));
    const limit = vi.fn().mockReturnValue({ maybeSingle });
    const order = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ order });
    const from = vi.fn().mockReturnValue({ select });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabaseAdmin = { from } as any;

    const result = await checkUpdateCooldown(supabaseAdmin, {
      minIntervalMinutes: 5,
      now,
    });

    expect(result).toEqual({
      blocked: false,
      minIntervalMinutes: 5,
      lastRunFinishedAt: null,
    });
  });

  it("uses the real env-configured default when no override is passed", async () => {
    const supabaseAdmin = mockSupabaseAdmin({ data: null });

    const result = await checkUpdateCooldown(supabaseAdmin, { now });

    expect(result.minIntervalMinutes).toBe(DEFAULT_MIN_UPDATE_INTERVAL_MINUTES);
  });
});
