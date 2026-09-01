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

/** Get the address supplied by the closest trusted proxy, when available. */
export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",").pop()?.trim()
    : request.headers.get("x-real-ip");
  return ip || "unknown";
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions): {
  check: (key: string) => RateLimitResult;
} {
  const entries = new Map<string, RateLimitEntry>();

  return {
    check(key) {
      const now = Date.now();
      const current = entries.get(key);

      if (!current || current.resetAt <= now) {
        const resetAt = now + windowMs;
        entries.set(key, { count: 1, resetAt });
        return { allowed: true, resetAt };
      }

      if (current.count >= max) {
        return { allowed: false, resetAt: current.resetAt };
      }

      current.count++;
      return { allowed: true, resetAt: current.resetAt };
    },
  };
}
