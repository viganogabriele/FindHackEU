/**
 * Normalizes hackathon source URLs into a stable comparison key so the same
 * event listed under cosmetically different URLs (bare domain vs. `www.`,
 * known domain aliases, tracking query parameters, trailing slashes) is
 * recognized as identical.
 *
 * This is a comparison key only — it is never used for navigation/display,
 * so it deliberately drops the protocol and re-orders query parameters.
 *
 * See issue #22 ("weak dedup points don't normalize URLs").
 */

/**
 * Known aliases for the same underlying domain. Luma's events resolve under
 * both `lu.ma` (short link) and `luma.com` (canonical); this table gives
 * both a single canonical host for comparison purposes.
 */
const DOMAIN_ALIASES: Record<string, string> = {
  "lu.ma": "luma.com",
};

/**
 * Query parameter name patterns that carry no identity information about
 * the event itself (analytics/attribution tracking) and must be stripped
 * before comparing two URLs.
 */
const TRACKING_PARAM_PATTERNS: RegExp[] = [
  /^utm_/i,
  /^(gclid|fbclid|msclkid|mc_cid|mc_eid|ref|referrer)$/i,
];

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Produces a normalized string key for a hackathon source URL:
 * - lowercases the host
 * - strips a leading `www.`
 * - unifies known domain aliases (see DOMAIN_ALIASES)
 * - strips tracking query parameters (utm_*, gclid, fbclid, ...)
 * - sorts remaining query parameters for order-independent comparison
 * - strips a single trailing slash from the path
 *
 * Two URLs that normalize to the same key should be treated as referring to
 * the same underlying event page.
 *
 * Falls back to a light-touch string normalization (lowercase, trim,
 * trailing-slash strip) for input that isn't a parseable absolute URL,
 * so callers always get a stable, non-throwing comparison key.
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    let host = url.hostname.toLowerCase();

    if (host.startsWith("www.")) {
      host = host.slice(4);
    }

    host = DOMAIN_ALIASES[host] ?? host;

    const params = new URLSearchParams(url.search);

    for (const key of Array.from(params.keys())) {
      if (isTrackingParam(key)) {
        params.delete(key);
      }
    }

    params.sort();

    let pathname = url.pathname;

    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }

    const query = params.toString();

    return `${host}${pathname}${query ? `?${query}` : ""}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Convenience predicate: do two URLs refer to the same normalized event
 * page?
 */
export function isSameNormalizedUrl(a: string, b: string): boolean {
  return normalizeUrl(a) === normalizeUrl(b);
}
