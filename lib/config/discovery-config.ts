/**
 * Shared configuration for hackathon discovery/parsing behavior.
 *
 * This is intentionally provider-agnostic: any parser (Luma, and future
 * sources) should import from here rather than hard-coding its own future
 * search horizon, so the "how far ahead do we search" behavior is a single,
 * documented, explicit value instead of an accidental side effect of a
 * source's internal sort/pagination order.
 *
 * See GitHub issue #4 for the discussion that led to this file.
 */

/**
 * How many days into the future (from "now") a discovered event is allowed
 * to start before it's discarded as out of the discovery window.
 *
 * Default: 180 days (~6 months). This is a pragmatic default, not a proven
 * optimum — adjust here if coverage data (see issue #31) suggests a
 * different horizon is warranted. Configurable via the `MAX_FUTURE_DAYS`
 * environment variable for local experimentation without a code change.
 */
const DEFAULT_MAX_FUTURE_DAYS = 180;

function resolveMaxFutureDays(): number {
  const raw = process.env.MAX_FUTURE_DAYS;

  if (!raw) {
    return DEFAULT_MAX_FUTURE_DAYS;
  }

  const parsed = Number.parseInt(raw, 10);

  // An invalid value (e.g. a typo like "abc") must not silently produce
  // an Invalid Date cutoff downstream - every comparison against an
  // Invalid Date is always `false`, which would make the future-window
  // filter a silent no-op instead of erroring loudly (found in code
  // review). Fall back to the documented default and say so.
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `Invalid MAX_FUTURE_DAYS env var "${raw}" - falling back to default (${DEFAULT_MAX_FUTURE_DAYS}).`,
    );
    return DEFAULT_MAX_FUTURE_DAYS;
  }

  return parsed;
}

export const MAX_FUTURE_DAYS = resolveMaxFutureDays();

/**
 * Computes the UTC cutoff `Date` beyond which an event's start date should
 * be considered outside the discovery window.
 *
 * All date-window math for discovery is done in UTC. This is a deliberate
 * choice, not an oversight: event data coming from parsers is not always
 * timezone-annotated consistently (see issue #20), so anchoring "now" and
 * the cutoff to UTC keeps the window computation deterministic and avoids
 * subtly shifting results based on the server's local timezone.
 *
 * @param now Reference point for "now" (defaults to the current time).
 *   Accepting it as a parameter keeps this function easy to exercise with a
 *   fixed clock without needing a mocking framework.
 */
export function getMaxFutureCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );

  cutoff.setUTCDate(cutoff.getUTCDate() + MAX_FUTURE_DAYS);

  return cutoff;
}
