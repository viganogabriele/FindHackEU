import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/submit-manual-candidate", () => ({
  submitManualCandidate: vi.fn(),
}));

import { submitManualCandidate } from "@/lib/services/submit-manual-candidate";
import { POST } from "@/app/api/submit-hackathon/route";

const mockedSubmit = vi.mocked(submitManualCandidate);

function request(ip: string, fields: Record<string, string | string[]> = {}) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value])
      body.append(key, item);
  }
  return new Request("https://example.test/api/submit-hackathon", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body,
  });
}

describe("POST /api/submit-hackathon", () => {
  beforeEach(() => mockedSubmit.mockReset());

  it("submits the form to the moderated candidate queue", async () => {
    mockedSubmit.mockResolvedValue({ outcome: "created" });

    const response = await POST(
      request("198.51.100.10", {
        url: "https://example.org/hack",
        name: "Example Hack",
        city: "Rome",
        countryCode: "IT",
        dateStart: "2026-11-15",
        topics: ["AI", "Web3"],
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ outcome: "created" });
    expect(mockedSubmit).toHaveBeenCalledWith({
      url: "https://example.org/hack",
      name: "Example Hack",
      city: "Rome",
      countryCode: "IT",
      dateStart: "2026-11-15",
      topics: ["AI", "Web3"],
    });
  });

  it("returns validation failures without writing an error", async () => {
    mockedSubmit.mockResolvedValue({
      outcome: "invalid",
      message: "Name is required.",
    });

    const response = await POST(request("198.51.100.11"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      outcome: "invalid",
      message: "Name is required.",
    });
  });

  it("hides database error details from public callers", async () => {
    mockedSubmit.mockResolvedValue({
      outcome: "error",
      message: "new row violates constraint hackathon_candidates_url_key",
    });

    const response = await POST(request("198.51.100.13"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      outcome: "error",
      message: "Unable to save the suggestion. Please try again later.",
    });
  });

  it("limits a single IP to ten submissions per hour", async () => {
    mockedSubmit.mockResolvedValue({ outcome: "created" });
    const ip = "198.51.100.12";

    for (let i = 0; i < 10; i++) {
      expect((await POST(request(ip))).status).toBe(201);
    }

    const response = await POST(request(ip));
    expect(response.status).toBe(429);
    expect(mockedSubmit).toHaveBeenCalledTimes(10);
  });
});
