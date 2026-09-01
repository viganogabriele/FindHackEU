import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpUrl,
  fetchPublicUrl,
} from "@/lib/http/fetch-public-url";

describe("assertPublicHttpUrl", () => {
  it("accepts public HTTP and HTTPS URLs", () => {
    expect(assertPublicHttpUrl("https://example.org/event").protocol).toBe(
      "https:",
    );
    expect(assertPublicHttpUrl("http://example.org/event").hostname).toBe(
      "example.org",
    );
  });

  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "ftp://example.org/event",
    "http://localhost/event",
    "http://127.0.0.1/event",
    "http://10.0.0.8/event",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[::1]/event",
    "http://[fd00::1]/event",
    "http://[fe80::1]/event",
    "http://[::ffff:7f00:1]/event",
  ])("rejects unsafe URL %j", (url) => {
    expect(() => assertPublicHttpUrl(url)).toThrow(/unsafe URL/i);
  });
});

describe("fetchPublicUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("validates a redirect target before following it", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      return new Response(null, {
        status: url.endsWith("/event") ? 302 : 200,
        headers: url.endsWith("/event")
          ? { Location: "http://127.0.0.1/private" }
          : undefined,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchPublicUrl("https://example.org/event", {}, { retries: 0 }),
    ).rejects.toThrow(/unsafe URL/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect with the same retry/timeout policy", async () => {
    const fetchMock = vi
      .fn<(url: string, options?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { Location: "https://example.org/final" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await fetchPublicUrl(
      "https://example.org/start",
      {},
      { retries: 0 },
    );

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://example.org/start",
      "https://example.org/final",
    ]);
  });
});
