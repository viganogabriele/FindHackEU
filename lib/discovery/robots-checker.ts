import {
  assertPublicHttpUrl,
  fetchPublicUrl,
} from "@/lib/http/fetch-public-url";

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

/**
 * Per-origin robots.txt cache (issue #16): a plain `Map` is enough since a
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
  let agents: string[] = [];
  let groupDisallow: string[] = [];
  let groupAllow: string[] = [];
  let hasDirective = false;

  const flushGroup = () => {
    if (agents.includes("*")) {
      rules.disallow.push(...groupDisallow);
      rules.allow.push(...groupAllow);
    }

    agents = [];
    groupDisallow = [];
    groupAllow = [];
    hasDirective = false;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmedRawLine = rawLine.trim();
    const line = rawLine.split("#")[0].trim();
    if (!line) {
      if (trimmedRawLine && !trimmedRawLine.startsWith("#")) {
        flushGroup();
      }
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      // Multiple User-agent lines before the first directive form one group.
      // A wildcard must not be lost merely because another agent is listed in
      // that same group.
      if (hasDirective) {
        flushGroup();
      }
      if (value) {
        agents.push(value.toLowerCase());
      }
      continue;
    }

    if (key !== "disallow" && key !== "allow") continue;

    hasDirective = true;

    if (key === "disallow" && value) {
      groupDisallow.push(value);
    } else if (key === "allow" && value) {
      groupAllow.push(value);
    }
  }

  flushGroup();

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
 * Fetches (and caches, per `cache`) the robots.txt for `url`'s origin, then
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
    parsed = assertPublicHttpUrl(url);
  } catch {
    // Invalid/private URLs must never reach either robots.txt or page fetch.
    return false;
  }

  const origin = parsed.origin;

  if (!cache.has(origin)) {
    const robotsUrl = `${origin}/robots.txt`;

    try {
      const response = await fetchPublicUrl(
        robotsUrl,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; HackTrackBot/1.0)",
          },
        },
        { retries: 0, timeoutMs: 5000 },
      );

      if (!response.ok) {
        cache.set(origin, null);
      } else {
        cache.set(origin, parseRobotsTxt(await response.text()));
      }
    } catch {
      cache.set(origin, null);
    }
  }

  const rules = cache.get(origin);
  if (!rules) return true;

  return isPathAllowed(rules, parsed.pathname);
}
