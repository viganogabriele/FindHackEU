/**
 * Static, grep-based guardrail for issue #14: no code path under
 * lib/search/* or lib/discovery/* may write a web-search-derived event
 * directly into the public `hackathons` table, or feed into the
 * `Provider`/`BaseParser` contract that `app/api/update/route.ts` treats
 * as verified, auto-publishable data. The only sanctioned write target
 * for this code is `hackathon_candidates` (see the migration's own doc
 * comment and lib/services/promote-candidate.ts, which is the sole,
 * human-triggered path from a candidate into `hackathons`).
 *
 * This follows the same file-scanning pattern this repo already uses for
 * a different invariant - see lib/parsers/__tests__/luma-fixtures.test.ts's
 * fixture-pair convention, and the (now-retired) json-ld-gap.test.ts canary
 * referenced in lib/search/__tests__/extract-event-evidence.test.ts's doc
 * comment - rather than a type-system-level guard, because the thing being
 * proven ("this string never appears in this code") is inherently a
 * textual property, not something the type checker can express.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// lib/discovery (this directory's parent) and lib/search, scanned
// recursively - exactly the two directories issue #14 names.
const SCANNED_DIRS = [
  join(__dirname, ".."),
  join(__dirname, "..", "..", "search"),
];

/**
 * Scans production code only - `__tests__` directories and `.test.ts`
 * files are excluded, both because test doubles/mocks legitimately
 * reference table names in ways unrelated to a real write path, and
 * because this file's own prose (quoting "hackathons" as an English word)
 * would otherwise trip its own regex below.
 */
function listTsFilesRecursively(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listTsFilesRecursively(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".test.ts")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectScannedFiles(): string[] {
  const seen = new Set<string>();

  for (const dir of SCANNED_DIRS) {
    for (const file of listTsFilesRecursively(dir)) {
      seen.add(file);
    }
  }

  return [...seen];
}

describe("candidate isolation (issue #14)", () => {
  const files = collectScannedFiles();

  it("scans a non-trivial number of files under lib/search and lib/discovery", () => {
    // Guards against the scan silently finding nothing (e.g. a path typo)
    // and the test below passing for the wrong reason.
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it('never references the "hackathons" table by name (only "hackathon_candidates")', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");

      // Look for the literal table-name string as Supabase code uses it -
      // e.g. .from("hackathons") - while explicitly allowing
      // "hackathon_candidates", which legitimately contains "hackathons"
      // is NOT a substring of "hackathon_candidates" (no trailing "s"
      // before "_candidates"), so a plain substring search already tells
      // them apart; this regex just also tolerates single or double quotes.
      const matches = content.match(/["']hackathons["']/g);

      if (matches) {
        offenders.push(`${file}: ${matches.join(", ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('"hackathon_candidates" is still referenced somewhere in the scanned files (sanity check)', () => {
    const anyReferencesCandidatesTable = files.some((file) =>
      readFileSync(file, "utf-8").includes("hackathon_candidates"),
    );

    expect(anyReferencesCandidatesTable).toBe(true);
  });

  it("never imports BaseParser or the Provider contract used by app/api/update/route.ts's auto-publish path", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf-8");

      if (/from\s+["']@\/lib\/parsers\/base-parser["']/.test(content)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
