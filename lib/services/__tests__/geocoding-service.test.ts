import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeocodingService } from "@/lib/services/geocoding-service";

const originalApiKey = process.env.OPENAPI_GEOCODING_KEY;
const GEOCODING_TIMEOUT_MS = 5_000;
const GEOCODING_BACKOFF_MS = 250;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function geocodingPayload(countryCode: unknown) {
  return {
    success: true,
    message: "OK",
    error: null,
    elements: {
      element: { countryCode },
    },
  };
}

describe("GeocodingService.getCountryCodeFromCity", () => {
  beforeEach(() => {
    process.env.OPENAPI_GEOCODING_KEY = "test-api-key";
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAPI_GEOCODING_KEY;
    } else {
      process.env.OPENAPI_GEOCODING_KEY = originalApiKey;
    }

    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns unavailable without calling the API when the API key is missing", async () => {
    delete process.env.OPENAPI_GEOCODING_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      GeocodingService.getCountryCodeFromCity("Rome"),
    ).resolves.toEqual({ status: "unavailable" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns found with the normalized European country code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(geocodingPayload("it"))),
    );

    await expect(
      GeocodingService.getCountryCodeFromCity(" Rome "),
    ).resolves.toEqual({ status: "found", countryCode: "IT" });
  });

  it("returns unavailable when the response omits the nested element", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          message: "OK",
          error: null,
          elements: {},
        }),
      ),
    );

    await expect(
      GeocodingService.getCountryCodeFromCity("Rome"),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("returns not_found when the provider returns elements.element without a country code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(geocodingPayload(undefined))),
    );

    await expect(
      GeocodingService.getCountryCodeFromCity("An Unknown City"),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("returns non_european for a valid non-European country code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(geocodingPayload(" us "))),
    );

    await expect(
      GeocodingService.getCountryCodeFromCity("New York"),
    ).resolves.toEqual({ status: "non_european", countryCode: "US" });
  });

  it("returns unavailable when the JSON shape contains an invalid country code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(geocodingPayload(42))),
    );

    await expect(
      GeocodingService.getCountryCodeFromCity("Rome"),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("returns unavailable when the provider returns invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));

    await expect(
      GeocodingService.getCountryCodeFromCity("Rome"),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("returns unavailable for HTTP errors and reports the status instead of assuming authentication failed", async () => {
    const errorSpy = vi.mocked(console.error);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      GeocodingService.getCountryCodeFromCity("Rome"),
    ).resolves.toEqual({ status: "unavailable" });

    expect(errorSpy).toHaveBeenCalledWith(
      "Geocoding API returned HTTP 401 for city: Rome",
    );
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Authentication failed"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries after a timeout and returns the successful transient retry", async () => {
    const fetchMock = vi
      .fn<
        (input: string | URL | Request, init?: RequestInit) => Promise<Response>
      >()
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            const abort = () =>
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              );

            if (!init?.signal) {
              reject(new Error("Expected fetch to receive an abort signal"));
              return;
            }

            init.signal.addEventListener("abort", abort, { once: true });
          }),
      )
      .mockResolvedValueOnce(jsonResponse(geocodingPayload("de")));
    vi.stubGlobal("fetch", fetchMock);

    const pending = GeocodingService.getCountryCodeFromCity("Berlin");

    await vi.advanceTimersByTimeAsync(GEOCODING_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(GEOCODING_BACKOFF_MS);

    await expect(pending).resolves.toEqual({
      status: "found",
      countryCode: "DE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
