import fs from "node:fs";
import path from "node:path";

const DEFAULT_DAILY_QUERY_BUDGET = 30;
const DEFAULT_BUDGET_FILE_PATH = path.join(
  process.cwd(),
  ".discovery-budget.json",
);

/**
 * Small injectable interface (issue #18) so `discoverWebCandidates` doesn't
 * need to know whether it's backed by a real file or a test fake.
 */
export interface QueryBudget {
  /** Queries still allowed for the current period (0 once exhausted). */
  remaining(): number;
  /** Record that `n` queries were actually issued. */
  recordUsed(n: number): void;
}

interface BudgetFileShape {
  /** UTC calendar day (YYYY-MM-DD) the `count` below applies to. */
  date: string;
  /** Queries used so far on `date`. Reset to 0 when the date rolls over. */
  count: number;
  /** All-time queries recorded, kept only for operator visibility. */
  cumulativeCount: number;
}

function todayUTC(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function readBudgetFile(filePath: string): BudgetFileShape | undefined {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BudgetFileShape>;
    if (typeof parsed.date !== "string" || typeof parsed.count !== "number") {
      return undefined;
    }
    return {
      date: parsed.date,
      count: parsed.count,
      cumulativeCount:
        typeof parsed.cumulativeCount === "number"
          ? parsed.cumulativeCount
          : parsed.count,
    };
  } catch {
    // Missing file, unreadable, or malformed JSON - treat as "no state yet"
    // rather than throwing; a budget tracker failing open on read is safer
    // than crashing the whole discovery run.
    return undefined;
  }
}

function writeBudgetFile(filePath: string, data: BudgetFileShape): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function resolveDailyLimit(explicit: number | undefined): number {
  if (
    typeof explicit === "number" &&
    Number.isFinite(explicit) &&
    explicit > 0
  ) {
    return explicit;
  }
  const fromEnv = Number.parseInt(
    process.env.DISCOVERY_DAILY_QUERY_BUDGET ?? "",
    10,
  );
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : DEFAULT_DAILY_QUERY_BUDGET;
}

/**
 * File-backed, persistent daily query-budget tracker (issue #18).
 *
 * This is deliberately a plain local JSON file, not a Supabase table -
 * it's local operational state about API usage (how many search-engine
 * queries this machine has burned today), not application data, and a new
 * table would be overkill for a single-writer counter. The file is
 * gitignored (see `.gitignore`).
 *
 * The in-memory `knownUrls` skip-list already prevents re-fetching the
 * same URL within or across runs, but has zero awareness of *cumulative
 * query volume* - running `discover-web-candidates.ts` twice in one day
 * had no shared awareness of how many queries had already been spent
 * against a free-tier provider's daily/monthly cap. This closes that gap.
 */
export class FileBudgetTracker implements QueryBudget {
  private readonly filePath: string;
  private readonly dailyLimit: number;
  private readonly now: () => Date;

  constructor(options?: {
    filePath?: string;
    dailyLimit?: number;
    now?: () => Date;
  }) {
    this.filePath = options?.filePath ?? DEFAULT_BUDGET_FILE_PATH;
    this.dailyLimit = resolveDailyLimit(options?.dailyLimit);
    this.now = options?.now ?? (() => new Date());
  }

  /** Reads the on-disk state, resetting the daily counter if the UTC date has rolled over. */
  private readState(): BudgetFileShape {
    const today = todayUTC(this.now());
    const existing = readBudgetFile(this.filePath);

    if (!existing || existing.date !== today) {
      return {
        date: today,
        count: 0,
        cumulativeCount: existing?.cumulativeCount ?? 0,
      };
    }

    return existing;
  }

  remaining(): number {
    const state = this.readState();
    return Math.max(0, this.dailyLimit - state.count);
  }

  recordUsed(n: number): void {
    if (n <= 0) {
      return;
    }
    const state = this.readState();
    state.count += n;
    state.cumulativeCount += n;
    writeBudgetFile(this.filePath, state);
  }
}

/**
 * In-memory fake for tests - never touches the filesystem. Also handy for
 * callers (e.g. a dry-run mode) that want a bounded budget without
 * persisting anything across process runs.
 */
export function createInMemoryQueryBudget(limit: number): QueryBudget {
  let used = 0;
  return {
    remaining: () => Math.max(0, limit - used),
    recordUsed: (n: number) => {
      if (n > 0) {
        used += n;
      }
    },
  };
}
