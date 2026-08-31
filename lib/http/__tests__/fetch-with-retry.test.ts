/**
 * Unit tests for lib/http/fetch-with-retry.ts (issue #30).
 *
 * All timing is driven by Vitest fake timers — no real sleeps — so these
 * assertions exercise the timeout/backoff logic deterministically and fast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "@/lib/http/fetch-with-retry";

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a request that never resolves after timeoutMs", async () => {
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry(
      "https://example.com/slow",
      {},
      { timeoutMs: 1000, retries: 0, backoffMs: 100 },
    );

    // Prevent unhandled rejection warnings while we advance timers below.
    const assertion = expect(promise).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure (503 then network error) and eventually resolves", async () => {
    const fetchMock = vi
      .fn<(url: string, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry(
      "https://example.com/flaky",
      {},
      { timeoutMs: 1000, retries: 2, backoffMs: 100 },
    );

    // Let the backoff delays between the 3 attempts elapse.
    await vi.advanceTimersByTimeAsync(100); // after attempt 1 (503)
    await vi.advanceTimersByTimeAsync(200); // after attempt 2 (network error)

    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("exhausts all retries and rejects when every attempt fails, with backoff elapsing between attempts", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(503)));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWithRetry(
      "https://example.com/always-down",
      {},
      { timeoutMs: 1000, retries: 2, backoffMs: 100 },
    );

    const assertion = expect(promise).rejects.toThrow(/503/);

    // 3 total attempts (1 initial + 2 retries), backoff of 100*1 and 100*2
    // between them. Only 2 backoff waits happen (none after the last try).
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await assertion;
  });

  it("does not retry non-retryable 4xx client errors", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(404)));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchWithRetry(
      "https://example.com/missing",
      {},
      { timeoutMs: 1000, retries: 3, backoffMs: 100 },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
