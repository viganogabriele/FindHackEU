import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAuth: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/services/require-admin-auth", () => ({
  requireAdminAuth: mocks.requireAdminAuth,
}));

import { POST } from "../route";

describe("POST /api/dev/trigger-update", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.CRON_SECRET = "test-secret";
    global.fetch = mocks.fetch as unknown as typeof global.fetch;
    mocks.fetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, parsed: 1, inserted: 1 }), {
        status: 200,
      }),
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
    process.env.CRON_SECRET = originalCronSecret;
    global.fetch = originalFetch;
  });

  // Issue #81: this route previously trusted NODE_ENV alone (the same
  // weaker gate the sidebar's now-removed DevTriggerUpdateButton had) - a
  // direct POST from anyone running the app locally, signed in or not,
  // would reach the real pipeline. It must now also re-check real admin
  // auth server-side, mirroring app/admin/candidates/actions.ts's
  // `assertAuthorized()` pattern, rejecting before ever touching
  // CRON_SECRET or forwarding to /api/update.
  it("rejects an unauthorized caller before forwarding to /api/update", async () => {
    mocks.requireAdminAuth.mockRejectedValue(new Error("Not authorized"));

    const response = await POST(
      new Request("http://localhost/api/dev/trigger-update", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("forwards to /api/update in test mode for an authorized caller", async () => {
    mocks.requireAdminAuth.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/dev/trigger-update", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [, init] = mocks.fetch.mock.calls[0];
    expect(init.headers["x-test-mode"]).toBe("true");
    expect(init.headers.Authorization).toBe("Bearer test-secret");
  });

  it("still 404s outside development regardless of auth", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.requireAdminAuth.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/dev/trigger-update", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.requireAdminAuth).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
