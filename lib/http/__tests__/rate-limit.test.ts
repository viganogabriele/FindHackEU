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
  // An expired entry was only ever replaced if that exact key came back, so
  // every key seen once was retained for the life of the process. On a warm
  // serverless instance serving a public endpoint that is one permanent
  // entry per distinct client address, per limiter, growing without bound.
  it("releases entries whose window has passed instead of retaining every key seen", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });

    for (let index = 0; index < 500; index++) {
      limiter.check(`one-shot-client-${index}`);
    }
    expect(limiter.size).toBe(500);

    // Past every one of those windows, and a request to make the limiter
    // notice: a serverless instance stays warm across many windows.
    vi.advanceTimersByTime(60_001);
    limiter.check("someone-else");

    expect(limiter.size).toBe(1);
    vi.useRealTimers();
  });

  it("does not evict an entry whose window is still open", () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });

    limiter.check("early");
    vi.advanceTimersByTime(59_000);
    limiter.check("late");

    // Sweeps at most once per window, and only removes what has expired -
    // "late" is 59s newer than "early", so it must survive the sweep that
    // "early" triggers.
    vi.advanceTimersByTime(2_000);
    expect(limiter.check("late")).toMatchObject({ allowed: true });
    expect(limiter.check("late")).toMatchObject({ allowed: false });
    vi.useRealTimers();
  });
});
