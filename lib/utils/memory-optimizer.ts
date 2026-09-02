/**
 * Memory diagnostics for the discovery pipeline (app/api/update/route.ts),
 * which logs heap usage between stages and reports it in the run's JSON
 * response.
 *
 * This used to also carry `processInChunks`, `processSequentially` and
 * `optimizeJSONStringify`. Nothing ever called them - knip can't see it,
 * because they were static members of an otherwise-used class - so they
 * were removed rather than left as three untested code paths implying the
 * pipeline batches its work when it doesn't.
 */

export class MemoryOptimizer {
  /**
   * Permette al garbage collector di lavorare
   */
  static async allowGarbageCollection(): Promise<void> {
    return new Promise((resolve) => {
      setImmediate(() => {
        // Force garbage collection if available (Node.js with --expose-gc flag)
        if (global.gc) {
          global.gc();
        }
        resolve();
      });
    });
  }

  /**
   * Monitora l'uso della memoria
   * @returns Informazioni sull'uso della memoria
   */
  static getMemoryUsage(): {
    used: string;
    total: string;
    percentage: number;
  } {
    if (typeof process !== "undefined" && process.memoryUsage) {
      const usage = process.memoryUsage();
      const used = Math.round(usage.heapUsed / 1024 / 1024);
      const total = Math.round(usage.heapTotal / 1024 / 1024);
      const percentage = Math.round((usage.heapUsed / usage.heapTotal) * 100);

      return {
        used: `${used} MB`,
        total: `${total} MB`,
        percentage,
      };
    }

    return {
      used: "Unknown",
      total: "Unknown",
      percentage: 0,
    };
  }

  /**
   * Log dell'uso della memoria
   * @param label Etichetta per il log
   */
  static logMemoryUsage(label: string = "Memory Usage"): void {
    const usage = this.getMemoryUsage();
    console.log(
      `${label}: ${usage.used}/${usage.total} (${usage.percentage}%)`,
    );
  }
}
