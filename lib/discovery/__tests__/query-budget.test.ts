import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createInMemoryQueryBudget,
  FileBudgetTracker,
} from "@/lib/discovery/query-budget";

describe("createInMemoryQueryBudget", () => {
  it("reports the full limit as remaining before anything is used", () => {
    const budget = createInMemoryQueryBudget(5);
    expect(budget.remaining()).toBe(5);
  });

  it("decrements remaining as usage is recorded, floored at zero", () => {
    const budget = createInMemoryQueryBudget(2);
    budget.recordUsed(1);
    expect(budget.remaining()).toBe(1);
    budget.recordUsed(5);
    expect(budget.remaining()).toBe(0);
  });
});

describe("FileBudgetTracker", () => {
  let dir: string;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeTracker(overrides?: { dailyLimit?: number; now?: () => Date }) {
    dir = mkdtempSync(join(tmpdir(), "discovery-budget-test-"));
    const filePath = join(dir, ".discovery-budget.json");
    const tracker = new FileBudgetTracker({
      filePath,
      dailyLimit: overrides?.dailyLimit ?? 3,
      now: overrides?.now,
    });
    return { tracker, filePath };
  }

  it("starts with the full daily limit remaining when no file exists yet", () => {
    const { tracker } = makeTracker({ dailyLimit: 3 });
    expect(tracker.remaining()).toBe(3);
  });

  it("persists usage to disk and reflects it in remaining()", () => {
    const { tracker, filePath } = makeTracker({ dailyLimit: 3 });

    tracker.recordUsed(2);
    expect(tracker.remaining()).toBe(1);

    const onDisk = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(onDisk.count).toBe(2);
    expect(onDisk.cumulativeCount).toBe(2);
  });

  it("shares cumulative usage across two separate tracker instances pointed at the same file", () => {
    const dirPath = mkdtempSync(join(tmpdir(), "discovery-budget-test-"));
    dir = dirPath;
    const filePath = join(dirPath, ".discovery-budget.json");

    const first = new FileBudgetTracker({ filePath, dailyLimit: 5 });
    first.recordUsed(2);

    const second = new FileBudgetTracker({ filePath, dailyLimit: 5 });
    expect(second.remaining()).toBe(3);
    second.recordUsed(3);
    expect(second.remaining()).toBe(0);

    const onDisk = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(onDisk.count).toBe(5);
    expect(onDisk.cumulativeCount).toBe(5);
  });

  it("never goes negative once usage exceeds the daily limit", () => {
    const { tracker } = makeTracker({ dailyLimit: 2 });
    tracker.recordUsed(10);
    expect(tracker.remaining()).toBe(0);
  });

  it("resets the daily count (but keeps cumulativeCount) when the UTC date rolls over", () => {
    let current = new Date("2026-09-01T12:00:00Z");
    const { tracker, filePath } = makeTracker({
      dailyLimit: 3,
      now: () => current,
    });

    tracker.recordUsed(3);
    expect(tracker.remaining()).toBe(0);

    current = new Date("2026-09-02T00:00:01Z");
    expect(tracker.remaining()).toBe(3);

    tracker.recordUsed(1);
    const onDisk = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(onDisk.date).toBe("2026-09-02");
    expect(onDisk.count).toBe(1);
    // Cumulative keeps accumulating across the day boundary.
    expect(onDisk.cumulativeCount).toBe(4);
  });
});
