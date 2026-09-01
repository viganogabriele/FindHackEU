#!/usr/bin/env tsx
/**
 * Decision-support script for issue #33: "re-evaluate the pipeline's cron
 * frequency based on measured coverage data" rather than habit/guessing.
 *
 * This does NOT decide the frequency itself, and does NOT touch
 * `.github/workflows/update.yml`. It reads `public.update_runs` (issue #32)
 * - the maintainer's own local/production Supabase, never something an
 * agent working in this repo has access to - and prints the specific
 * metrics the issue's acceptance criterion asks for ("the chosen frequency
 * is documented with an explicit rationale tied to measured coverage
 * data"), plus a plain-language read of what each metric implies. The
 * maintainer (who has DB access this environment doesn't) runs this against
 * real accumulated history and makes the actual call.
 *
 * What it measures, and why each one is relevant to a frequency decision:
 *
 *   - Empty-run rate: the fraction of finished runs that inserted zero new
 *     hackathons. If most runs find nothing, running more often mostly adds
 *     load (on us and on scraped sites) without finding events sooner -
 *     evidence FOR reducing frequency. A low empty-run rate is evidence
 *     the current cadence is roughly matched to how often sources actually
 *     publish new events.
 *   - Per-weekday-slot yield: mean `inserted_count` broken out by which of
 *     the 5 weekly cron slots produced it (see .github/workflows/update.yml
 *     - 3 weekday runs, 2 weekend runs, fixed UTC hours). If one slot
 *     (e.g. the 19:00 CET weekday run) consistently contributes ~0 net-new
 *     hackathons versus the other slots, that specific slot - not the
 *     whole schedule - is the one worth cutting.
 *   - Source degradation rate: how often each source's `status` in the
 *     persisted `sources` JSON blob is `"partial"`/`"failed"` rather than
 *     `"ok"`. A source that degrades often (e.g. rate-limited) is evidence
 *     FOR running that specific source less often - independent of whether
 *     the overall schedule changes - since #33 explicitly asks whether
 *     "heavier steps ... should run less often than lighter ones".
 *   - Median gap between runs that found something: how much real time
 *     typically elapses between two runs that each inserted at least one
 *     new hackathon. If that gap is already much longer than the cron
 *     interval, running more often isn't buying earlier discovery.
 *
 * Usage:
 *   npx tsx scripts/analyze-update-frequency.ts                 # last 30 days
 *   npx tsx scripts/analyze-update-frequency.ts --days=90
 *   npx tsx scripts/analyze-update-frequency.ts --json           # machine-readable dump, no prose
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

interface SourceEntry {
  status?: "ok" | "partial" | "failed";
  [key: string]: unknown;
}

interface UpdateRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  test_mode: boolean;
  sources: Record<string, SourceEntry> | null;
  parsed_count: number | null;
  inserted_count: number | null;
  updated_count: number | null;
  degraded: boolean | null;
}

function parseIntArg(name: string, fallback: number): number {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return fallback;
  const value = Number.parseInt(arg.split("=")[1], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Mirrors the weekday/weekend UTC cron hours in .github/workflows/update.yml
// so a real run can be bucketed back into "which cron slot produced this",
// purely for reporting - this script never edits that file.
const CRON_SLOTS = [
  { label: "weekday 10:00 CET (08:00 UTC)", utcHour: 8, weekdaysOnly: true },
  { label: "weekday 15:00 CET (13:00 UTC)", utcHour: 13, weekdaysOnly: true },
  { label: "weekday 19:00 CET (17:00 UTC)", utcHour: 17, weekdaysOnly: true },
  { label: "weekend 12:00 CET (10:00 UTC)", utcHour: 10, weekdaysOnly: false },
  { label: "weekend 18:00 CET (16:00 UTC)", utcHour: 16, weekdaysOnly: false },
] as const;

function closestSlotLabel(startedAt: Date): string {
  const utcHour = startedAt.getUTCHours();
  const day = startedAt.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;

  let best: (typeof CRON_SLOTS)[number] | null = null;
  let bestDiff = Infinity;

  for (const slot of CRON_SLOTS) {
    if (slot.weekdaysOnly === isWeekend) continue; // wrong bucket entirely
    const diff = Math.abs(slot.utcHour - utcHour);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = slot;
    }
  }

  // workflow_dispatch (manual) runs, or anything far from every scheduled
  // hour (>= 2h off), don't cleanly match a cron slot - a manual trigger,
  // not part of the schedule being evaluated.
  if (!best || bestDiff >= 2) return "manual / off-schedule";
  return best.label;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "n/a";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

async function main() {
  const { supabaseAdmin } = await import("../lib/supabase");
  const { fetchAllRows } = await import("../lib/services/fetch-all-rows");

  const days = parseIntArg("days", 30);
  const jsonOutput = process.argv.includes("--json");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await fetchAllRows<UpdateRunRow>((from, to) =>
    supabaseAdmin
      .from("update_runs")
      .select(
        "id, started_at, finished_at, status, test_mode, sources, parsed_count, inserted_count, updated_count, degraded",
      )
      .gte("started_at", since.toISOString())
      .eq("test_mode", false)
      .order("started_at", { ascending: true })
      .range(from, to),
  );

  if (rows.length === 0) {
    console.log(
      `No non-test-mode update_runs rows found in the last ${days} day(s). ` +
        `Either the table is empty (issue #32 was only just implemented), or ` +
        `every run so far was triggered in test mode. Nothing to analyze yet - ` +
        `let real cron runs accumulate before re-running this.`,
    );
    return;
  }

  const finished = rows.filter((r) => r.status !== "running");
  const successful = finished.filter((r) => r.status === "success");

  // --- Empty-run rate --------------------------------------------------
  const emptyRuns = successful.filter((r) => (r.inserted_count ?? 0) === 0);

  // --- Per-slot yield ----------------------------------------------------
  const bySlot = new Map<string, number[]>();
  for (const r of successful) {
    const slot = closestSlotLabel(new Date(r.started_at));
    const list = bySlot.get(slot) ?? [];
    list.push(r.inserted_count ?? 0);
    bySlot.set(slot, list);
  }

  // --- Per-source degradation --------------------------------------------
  const sourceStats = new Map<
    string,
    { ok: number; partial: number; failed: number; total: number }
  >();
  for (const r of finished) {
    if (!r.sources) continue;
    for (const [name, entry] of Object.entries(r.sources)) {
      const stat = sourceStats.get(name) ?? {
        ok: 0,
        partial: 0,
        failed: 0,
        total: 0,
      };
      stat.total++;
      if (entry.status === "partial") stat.partial++;
      else if (entry.status === "failed") stat.failed++;
      else stat.ok++;
      sourceStats.set(name, stat);
    }
  }

  // --- Gap between runs that found something -----------------------------
  const findTimestamps = successful
    .filter((r) => (r.inserted_count ?? 0) > 0)
    .map((r) => new Date(r.started_at).getTime());
  const gapsHours: number[] = [];
  for (let i = 1; i < findTimestamps.length; i++) {
    gapsHours.push((findTimestamps[i] - findTimestamps[i - 1]) / 3_600_000);
  }

  const result = {
    windowDays: days,
    sinceIso: since.toISOString(),
    totalRuns: rows.length,
    finishedRuns: finished.length,
    successfulRuns: successful.length,
    failedRuns: finished.length - successful.length,
    degradedRuns: finished.filter((r) => r.degraded).length,
    emptyRunRate: {
      emptyRuns: emptyRuns.length,
      ofSuccessful: successful.length,
      percent: pct(emptyRuns.length, successful.length),
    },
    perSlotMeanInserted: Object.fromEntries(
      [...bySlot.entries()].map(([slot, counts]) => [
        slot,
        {
          runs: counts.length,
          meanInserted: Number(
            (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2),
          ),
        },
      ]),
    ),
    perSourceDegradation: Object.fromEntries(
      [...sourceStats.entries()].map(([name, s]) => [
        name,
        {
          ...s,
          degradedRate: pct(s.partial + s.failed, s.total),
        },
      ]),
    ),
    medianHoursBetweenFindingRuns: median(gapsHours),
  };

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    `\n=== Update-run coverage analysis (last ${days} day(s), since ${since.toISOString()}) ===\n`,
  );
  console.log(
    `Total runs: ${result.totalRuns} (${result.finishedRuns} finished, ` +
      `${result.totalRuns - result.finishedRuns} still "running" or crashed mid-run)`,
  );
  console.log(
    `Successful: ${result.successfulRuns}, failed: ${result.failedRuns}, ` +
      `degraded: ${result.degradedRuns} (${pct(result.degradedRuns, result.finishedRuns)})`,
  );

  console.log(
    `\nEmpty-run rate (successful runs that inserted 0 new hackathons): ` +
      `${result.emptyRunRate.emptyRuns}/${result.emptyRunRate.ofSuccessful} ` +
      `(${result.emptyRunRate.percent})`,
  );
  console.log(
    `  -> High (e.g. >80%) over a window covering both weekdays and weekends ` +
      `is evidence the current cadence outruns how often sources actually ` +
      `publish new events - a case for reducing frequency. Low (<30%) means ` +
      `most runs are finding something, i.e. the cadence is roughly matched ` +
      `to source publish rate.`,
  );

  console.log(`\nMean hackathons inserted, by nearest cron slot:`);
  for (const [slot, stat] of Object.entries(result.perSlotMeanInserted)) {
    console.log(
      `  ${slot.padEnd(32)} runs=${String(stat.runs).padEnd(4)} meanInserted=${stat.meanInserted}`,
    );
  }
  console.log(
    `  -> If one weekday slot's mean is consistently near 0 versus the others, ` +
      `that specific slot is the concrete candidate to cut - not a blanket ` +
      `"run once a day" guess.`,
  );

  console.log(`\nPer-source degradation rate (status != "ok"):`);
  for (const [name, stat] of Object.entries(result.perSourceDegradation)) {
    console.log(
      `  ${name.padEnd(16)} ok=${stat.ok} partial=${stat.partial} failed=${stat.failed} ` +
        `degradedRate=${stat.degradedRate}`,
    );
  }
  console.log(
    `  -> A source with a high degraded rate (e.g. >20-30%, especially if it ` +
      `correlates with rate-limit-shaped errors) is evidence FOR decoupling ` +
      `that source's own cadence and running it less often than the others - ` +
      `independent of whatever the overall schedule ends up being.`,
  );

  console.log(
    `\nMedian time between two runs that each found >=1 new hackathon: ` +
      `${result.medianHoursBetweenFindingRuns === null ? "n/a (fewer than 2 finding runs)" : `${result.medianHoursBetweenFindingRuns.toFixed(1)}h`}`,
  );
  console.log(
    `  -> If this is already much larger than the current cron interval, ` +
      `running more often isn't buying earlier discovery of new events.`,
  );

  console.log(
    `\nNote: with fewer than ~30-50 successful runs, or a window that doesn't ` +
      `span at least a couple of full weeks (weekday + weekend mix), these ` +
      `percentages are noisy - let more history accumulate before treating ` +
      `any of the above as a final answer. See issue #33.`,
  );
}

main().catch((error) => {
  console.error("Analysis failed:", error);
  process.exitCode = 1;
});
