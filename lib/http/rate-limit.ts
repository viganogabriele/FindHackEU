export interface RateLimitResult {
  allowed: boolean;
  resetAt?: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

/**
 * Get the address supplied by the closest trusted proxy, when available.
 *
 * Safe to trust on this deployment: Vercel overwrites `x-forwarded-for` and
 * does not forward externally-supplied values, precisely so a client cannot
 * spoof its own address (https://vercel.com/docs/headers/request-headers).
 * Anywhere without that guarantee, this header is client-controlled and
 * these limiters are advisory only.
 */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",").pop()?.trim()
    : request.headers.get("x-real-ip");
  return ip || "unknown";
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions): {
  check: (key: string) => RateLimitResult;
  /** Number of keys currently retained - exposed so the eviction behavior is testable. */
  readonly size: number;
} {
  const entries = new Map<string, RateLimitEntry>();
  let nextSweepAt = Number.POSITIVE_INFINITY;

  /**
   * An expired entry used to be replaced only if that exact key came back,
   * so every key seen once stayed in the map forever. On a warm serverless
   * instance serving a public endpoint that is one permanent entry per
   * distinct client address, per limiter, for the life of the instance -
   * unbounded growth with no upper bound and nothing to release it.
   *
   * Sweeping at most once per window keeps the work amortized (a key is
   * touched at most once per sweep) while bounding the map to roughly the
   * number of distinct keys seen in a single window, which is what the
   * limiter actually needs to remember.
   */
  function sweepExpired(now: number) {
    for (const [key, entry] of entries) {
      if (entry.resetAt <= now) {
        entries.delete(key);
      }
    }
    nextSweepAt = now + windowMs;
  }

  return {
    check(key) {
      const now = Date.now();

      if (now >= nextSweepAt) {
        sweepExpired(now);
      }

      const current = entries.get(key);

      if (!current || current.resetAt <= now) {
        const resetAt = now + windowMs;
        entries.set(key, { count: 1, resetAt });
        if (nextSweepAt === Number.POSITIVE_INFINITY) {
          nextSweepAt = resetAt;
        }
        return { allowed: true, resetAt };
      }

      if (current.count >= max) {
        return { allowed: false, resetAt: current.resetAt };
      }

      current.count++;
      return { allowed: true, resetAt: current.resetAt };
    },
    /** Test-only view of retained state; not part of the limiter's contract. */
    get size() {
      return entries.size;
    },
  };
}
