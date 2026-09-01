import { describe, expect, it, vi } from "vitest";
import { createRateLimiter, getClientKey } from "@/lib/http/rate-limit";

describe("getClientKey", () => {
  it("uses the last forwarded address from the proxy chain", () => {
    const request = new Request("https://example.test", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.2" },
    });

    expect(getClientKey(request)).toBe("203.0.113.2");
  });
});

describe("createRateLimiter", () => {
  it("allows max requests and rejects the next one until the window resets", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

    expect(limiter.check("client")).toMatchObject({ allowed: true });
    expect(limiter.check("client")).toMatchObject({ allowed: true });
    expect(limiter.check("client")).toMatchObject({ allowed: false });

    vi.advanceTimersByTime(60_000);
    expect(limiter.check("client")).toMatchObject({ allowed: true });
    vi.useRealTimers();
  });
});
