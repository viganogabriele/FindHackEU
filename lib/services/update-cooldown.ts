import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimum cooldown between separate `/api/update` pipeline runs (issue #77).
 *
 * Triggering `/api/update` twice in quick succession (e.g. `npm run
 * trigger-update -- --live` fired twice, or the dev "Aggiorna ora" button
 * clicked repeatedly) re-scrapes the same external hosts from scratch each
 * time. `lib/parsers/eventbrite-parser.ts` already delays *between*
 * successive country requests within a single run, and
 * `lib/http/fetch-with-retry.ts` retries individual 429s - but nothing
 * previously stopped two separate runs from starting close together, which
 * is exactly what got Eventbrite's directory pages rate-limited (429) on a
 * real run started ~2 minutes after the previous one (2026-09-01).
 *
 * This is deliberately a route-level guard, not a change to that
 * per-country delay - it only decides whether a *new* run is allowed to
 * start at all.
 */

/** Default cooldown when `MIN_UPDATE_INTERVAL_MINUTES` is unset. */
export const DEFAULT_MIN_UPDATE_INTERVAL_MINUTES = 5;

/**
 * Reads the configured minimum interval (minutes) between runs.
 *
 * `0` (or an unset/invalid value falling back to `0`) disables the guard
 * entirely - kept as an explicit escape hatch rather than requiring a
 * redeploy to lift the cooldown if it ever needs to be turned off quickly.
 */
export function getMinUpdateIntervalMinutes(): number {
  const raw = process.env.MIN_UPDATE_INTERVAL_MINUTES;

  if (!raw) {
    return DEFAULT_MIN_UPDATE_INTERVAL_MINUTES;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_MIN_UPDATE_INTERVAL_MINUTES;
}

export interface UpdateCooldownStatus {
  blocked: boolean;
  minIntervalMinutes: number;
  /** `finished_at` of the most recent run, if any and if it has finished. */
  lastRunFinishedAt: string | null;
  /** Only set when `blocked` is true. */
  retryAfterSeconds?: number;
}

interface LastRunRow {
  finished_at: string | null;
  started_at: string | null;
}

/**
 * Checks whether a new `/api/update` run is allowed to start right now.
 *
 * Looks at the single most recent `update_runs` row (by `started_at`) and
 * compares its `finished_at` (falling back to `started_at` if the run
 * hasn't finished yet - e.g. still `'running'`, or the process crashed
 * before it could close the row out - so an in-flight run is also guarded
 * against, not just a completed one) against `now`. Any lookup failure
 * (including "no prior run exists yet") is treated as "not blocked" - this
 * is a best-effort throttle, not a correctness guarantee, and must never
 * itself be the reason a legitimate run can't start (same "log, don't
 * throw" pattern as the rest of app/api/update/route.ts).
 */
export async function checkUpdateCooldown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  options: { minIntervalMinutes?: number; now?: Date } = {},
): Promise<UpdateCooldownStatus> {
  const minIntervalMinutes =
    options.minIntervalMinutes ?? getMinUpdateIntervalMinutes();
  const now = options.now ?? new Date();

  if (minIntervalMinutes <= 0) {
    return { blocked: false, minIntervalMinutes, lastRunFinishedAt: null };
  }

  let lastRun: LastRunRow | null = null;

  try {
    const { data, error } = await supabaseAdmin
      .from("update_runs")
      .select("finished_at, started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error checking update cooldown:", error);
    } else {
      lastRun = data as LastRunRow | null;
    }
  } catch (error) {
    console.error("Error checking update cooldown:", error);
  }

  const referenceTimestamp = lastRun?.finished_at ?? lastRun?.started_at;

  if (!referenceTimestamp) {
    return { blocked: false, minIntervalMinutes, lastRunFinishedAt: null };
  }

  const elapsedMs = now.getTime() - new Date(referenceTimestamp).getTime();
  const minIntervalMs = minIntervalMinutes * 60_000;

  if (elapsedMs >= minIntervalMs) {
    return {
      blocked: false,
      minIntervalMinutes,
      lastRunFinishedAt: lastRun?.finished_at ?? null,
    };
  }

  return {
    blocked: true,
    minIntervalMinutes,
    lastRunFinishedAt: lastRun?.finished_at ?? null,
    retryAfterSeconds: Math.ceil((minIntervalMs - elapsedMs) / 1000),
  };
}
