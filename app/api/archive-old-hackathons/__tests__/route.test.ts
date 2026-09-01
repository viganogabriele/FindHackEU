import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sweepOldPastHackathons: vi.fn(),
}));

vi.mock("@/lib/services/retention-sweep", () => ({
  sweepOldPastHackathons: mocks.sweepOldPastHackathons,
}));
vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {},
}));

import { POST } from "../route";

/**
 * Issue #72: this route is the daily-cron entry point for the automatic
 * retention sweep. Auth mirrors app/api/update/route.ts's CRON_SECRET
 * check exactly (see that route's own test coverage for the equivalent
 * cases) - this test focuses on what's specific to this route: it fails
 * closed with no CRON_SECRET configured, rejects a wrong/missing bearer
 * token, and otherwise delegates to `sweepOldPastHackathons` and returns
 * its result.
 */
describe("POST /api/archive-old-hackathons", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = originalCronSecret;
  });

  function requestWith(authHeader?: string): Request {
    return new Request("http://localhost/api/archive-old-hackathons", {
      method: "POST",
      headers: authHeader ? { authorization: authHeader } : {},
    });
  }

  it("fails closed with 500 when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await POST(requestWith("Bearer anything"));

    expect(response.status).toBe(500);
    expect(mocks.sweepOldPastHackathons).not.toHaveBeenCalled();
  });

  it("rejects a missing or wrong bearer token with 401", async () => {
    const missing = await POST(requestWith());
    expect(missing.status).toBe(401);

    const wrong = await POST(requestWith("Bearer wrong-secret"));
    expect(wrong.status).toBe(401);

    expect(mocks.sweepOldPastHackathons).not.toHaveBeenCalled();
  });

  it("runs the sweep and returns its result for a valid caller", async () => {
    mocks.sweepOldPastHackathons.mockResolvedValue({
      checked: 5,
      archived: 2,
      skipped: 3,
      errors: [],
    });

    const response = await POST(requestWith("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      checked: 5,
      archived: 2,
      skipped: 3,
      errors: [],
    });
    expect(mocks.sweepOldPastHackathons).toHaveBeenCalledTimes(1);
  });

  it("returns 500 with the error message when the sweep throws", async () => {
    mocks.sweepOldPastHackathons.mockRejectedValue(new Error("db down"));

    const response = await POST(requestWith("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ success: false, error: "db down" });
  });
});
