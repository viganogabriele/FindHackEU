import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

/**
 * Per-host robots.txt cache (issue #16): a plain `Map` is enough since a
 * discovery run always constructs one via `createRobotsCache()` and passes
 * it through the whole run's candidate loop - "per discovery run" caching,
 * not a global/module-level cache that would leak across runs or grow
 * unbounded in a long-lived process. `null` means "no rules apply" (either
 * no robots.txt was found, or it couldn't be fetched) - fail open, the
 * documented convention for a missing/unreachable robots.txt.
 */
export type RobotsCache = Map<string, RobotsRules | null>;

export function createRobotsCache(): RobotsCache {
  return new Map();
}

/**
 * Minimal robots.txt parser: only understands `User-agent: *` groups and
 * `Disallow`/`Allow` prefix directives, per issue #16's explicit scope
 * ("a simple, correct-enough robots.txt parser ... just Disallow/Allow
 * prefix matching for User-agent: *"). Does NOT implement: wildcard (`*`)
 * or end-anchor (`$`) matching within a path, `Crawl-delay`, or rules
 * scoped to any other named user-agent (a site can disallow a named bot
 * like "anthropic-ai" while leaving `User-agent: *` wide open - this
 * parser deliberately only ever evaluates the `*` group, since that's the
 * group this project's own generic crawler UA falls under).
 */
export function parseRobotsTxt(text: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [] };
  let inWildcardGroup = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      inWildcardGroup = value === "*";
      continue;
    }

    if (!inWildcardGroup) continue;

    if (key === "disallow" && value) {
      rules.disallow.push(value);
    } else if (key === "allow" && value) {
      rules.allow.push(value);
    }
  }

  return rules;
}

/**
 * Standard robots.txt precedence: the longest matching prefix wins,
 * whether it's an `Allow` or a `Disallow` rule (this is what makes e.g.
 * `Allow: /directory/sitemap/` carve an exception out of a broader
 * `Disallow: /directory/`). A tie between an `Allow` and a `Disallow` of
 * equal length resolves to `Allow` - not universally agreed in the
 * informal spec, but a defensible, documented default (prefer not to
 * block when a site's own rules are ambiguous).
 */
export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  let bestMatchLength = -1;
  let bestMatchIsAllow = true;

  for (const disallow of rules.disallow) {
    if (
      disallow !== "" &&
      path.startsWith(disallow) &&
      disallow.length > bestMatchLength
    ) {
      bestMatchLength = disallow.length;
      bestMatchIsAllow = false;
    }
  }

  for (const allow of rules.allow) {
    if (
      allow !== "" &&
      path.startsWith(allow) &&
      allow.length >= bestMatchLength
    ) {
      bestMatchLength = allow.length;
      bestMatchIsAllow = true;
    }
  }

  return bestMatchIsAllow;
}

/**
 * Fetches (and caches, per `cache`) the robots.txt for `url`'s host, then
 * checks whether `url`'s path is allowed for user-agent `*`. A robots.txt
 * that 404s, errors, or fails to fetch is treated as "no restrictions" -
 * the standard fail-open behavior when a robots.txt can't be retrieved at
 * all (distinct from an explicit `Disallow: /`, which does block).
 */
export async function isAllowedByRobots(
  url: string,
  cache: RobotsCache,
): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Unparseable URL - not this function's job to decide; let the actual
    // fetch attempt fail with a clearer error instead.
    return true;
  }

  const host = parsed.host;

  if (!cache.has(host)) {
    const robotsUrl = `${parsed.protocol}//${host}/robots.txt`;

    try {
      const response = await fetchWithRetry(
        robotsUrl,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; HackTrackBot/1.0)",
          },
        },
        { retries: 0, timeoutMs: 5000 },
      );

      if (!response.ok) {
        cache.set(host, null);
      } else {
        cache.set(host, parseRobotsTxt(await response.text()));
      }
    } catch {
      cache.set(host, null);
    }
  }

  const rules = cache.get(host);
  if (!rules) return true;

  return isPathAllowed(rules, parsed.pathname);
}
