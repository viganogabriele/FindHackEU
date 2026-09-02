import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_URL } from "@/lib/site-url";
import { FINDHACKEU_URL } from "@/components/share-hackathon-dropdown";

/**
 * The canonical tag, the Open Graph/Twitter URLs, the JSON-LD nodes and the
 * attribution link on a shared hackathon had each hardcoded
 * `hacktrack-eu.vercel.app` - the upstream project's domain, not this
 * deployment's. A wrong canonical is the worst of those: it points search
 * engines at a different site entirely.
 *
 * These files now all read `SITE_URL`. This test is the drift guard, in the
 * same static-enforcement style as
 * lib/discovery/__tests__/candidate-isolation.test.ts.
 */
const ROOTS = ["app", "components", "lib", "contexts"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const UPSTREAM_DOMAIN = "hacktrack-eu.vercel.app";
const THIS_FILE = join("lib", "__tests__", "site-url.test.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))
      ? [path]
      : [];
  });
}

describe("SITE_URL", () => {
  it("defaults to this deployment's own origin", () => {
    expect(SITE_URL).toBe("https://findhackeu.vercel.app");
  });

  it("has no trailing slash, so `${SITE_URL}/path` is always well-formed", () => {
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("is what a share link credits, so a share can never point elsewhere than the canonical tag", () => {
    expect(FINDHACKEU_URL).toBe(SITE_URL);
  });

  it("is the only place the site origin is written down", () => {
    // lib/site-url.ts names the old domain in its own doc comment; this
    // file names it as the string being searched for.
    const allowed = new Set([join("lib", "site-url.ts"), THIS_FILE]);

    const offenders = ROOTS.flatMap(sourceFiles).filter(
      (path) =>
        !allowed.has(path) &&
        readFileSync(path, "utf8").includes(UPSTREAM_DOMAIN),
    );

    expect(offenders).toEqual([]);
  });
});
