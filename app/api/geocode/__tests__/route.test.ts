import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/geocode/route";
import { GeocodingService } from "@/lib/services/geocoding-service";
import {
  getCachedCoordinates,
  setCachedCoordinates,
} from "@/lib/services/geocode-cache";

vi.mock("@/lib/services/geocoding-service", () => ({
  GeocodingService: { getCoordinatesFromAddress: vi.fn() },
}));
vi.mock("@/lib/services/geocode-cache", () => ({
  getCachedCoordinates: vi.fn(),
  setCachedCoordinates: vi.fn(),
}));

describe("GET /api/geocode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached coordinates without calling an HTTP geocoder", async () => {
    vi.mocked(getCachedCoordinates).mockResolvedValue({
      latitude: 41.9028,
      longitude: 12.4964,
      countryCode: "IT",
    });

    const response = await GET(
      new Request("https://example.test/api/geocode?query=Rome"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { query: "Rome", latitude: 41.9028, longitude: 12.4964 },
    });
    expect(GeocodingService.getCoordinatesFromAddress).not.toHaveBeenCalled();
  });

  it("writes coordinates to the persistent cache after a miss", async () => {
    vi.mocked(getCachedCoordinates).mockResolvedValue(null);
    vi.mocked(GeocodingService.getCoordinatesFromAddress).mockResolvedValue({
      status: "found",
      countryCode: "IT",
      latitude: 41.9028,
      longitude: 12.4964,
    });

    const response = await GET(
      new Request("https://example.test/api/geocode?query=Rome"),
    );

    expect(response.status).toBe(200);
    expect(setCachedCoordinates).toHaveBeenCalledWith("Rome", {
      latitude: 41.9028,
      longitude: 12.4964,
      countryCode: "IT",
    });
  });
});
