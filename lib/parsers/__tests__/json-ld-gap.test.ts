/**
 * Case 6 of issue #35: "a page with JSON-LD".
 *
 * Nothing in this codebase currently parses JSON-LD (a
 * `<script type="application/ld+json">` block embedding schema.org Event
 * data, which some hackathon listing pages use). All existing parsers
 * (lib/parsers/*) consume either a JSON API (Luma) or Cloudflare-protected
 * HTML with bespoke scraping (LabLab, currently disabled) — none read
 * structured data islands.
 *
 * Per issue #35's constraints, this suite documents current behavior rather
 * than inventing a JSON-LD parser to satisfy a "should work" assertion. This
 * test asserts the gap explicitly (no source file references JSON-LD) so it
 * fails loudly — and needs a real test replacing it — the moment a future
 * issue adds JSON-LD support.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "__tests__" || entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}

describe("JSON-LD support (case 6: gap, not a feature)", () => {
  it("no parser or library file references JSON-LD / ld+json today", () => {
    const libDir = path.resolve(__dirname, "..", "..");
    const files = collectTsFiles(libDir);

    const jsonLdReferences = files.filter((file) => {
      const content = readFileSync(file, "utf-8");
      return /ld\+json|jsonld|json-ld/i.test(content);
    });

    expect(jsonLdReferences).toEqual([]);
  });
});
