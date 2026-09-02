import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static guard, in the same style as
 * lib/discovery/__tests__/candidate-isolation.test.ts.
 *
 * Two libraries dominated the initial JS payload and neither was needed for
 * first paint. Both were pulled in by a plain top-level `import`, which is
 * all it takes: one static import from a Client Component reachable from the
 * root layout puts the whole library in the bundle every visitor downloads,
 * and no amount of guarding at runtime undoes that.
 *
 * Measured on a production build: removing these two static imports took the
 * home page from 546 KB to 391 KB gzipped.
 *
 * Neither is banned - they are both still used. They just have to be reached
 * for with a dynamic `import()`, at the point they are actually needed.
 */
const ROOTS = ["app", "components", "contexts", "lib"];
const THIS_FILE = join(
  "components",
  "__tests__",
  "client-bundle-guard.test.ts",
);

const DEFERRED = [
  {
    module: "@sentry/nextjs",
    // Server code has no bundle-size problem, and Sentry is legitimately
    // imported statically there.
    allow: [join("app", "api", "update", "route.ts")],
    why: "~130 KB gzipped, and inert unless NEXT_PUBLIC_SENTRY_DSN is set",
  },
  {
    module: "add-to-calendar-button-react",
    allow: [] as string[],
    why: "only needed once a visitor picks a calendar, from a dropdown that renders in every card",
  },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("client bundle guard", () => {
  it.each(DEFERRED)(
    "keeps $module out of the initial bundle ($why)",
    ({ module, allow }) => {
      // A static import - `import … from "x"` - but not `await import("x")`
      // or a `typeof import("x")` type reference.
      const staticImport = new RegExp(
        `(^|\\n)\\s*import\\s[^;]*?from\\s+["']${module.replace("/", "\\/")}["']`,
      );

      const offenders = ROOTS.flatMap(sourceFiles).filter(
        (path) =>
          path !== THIS_FILE &&
          !allow.includes(path) &&
          staticImport.test(readFileSync(path, "utf8")),
      );

      expect(offenders).toEqual([]);
    },
  );
});
