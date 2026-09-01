import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { POST } from "@/app/api/update/route";
import { supabaseAdmin } from "@/lib/supabase";

function requestWithAuthorization(authorization?: string): Request {
  const headers = new Headers({ "x-test-mode": "true" });
  if (authorization) headers.set("authorization", authorization);
  return new Request("https://example.org/api/update", {
    method: "POST",
    headers,
  });
}

describe("POST /api/update authentication", () => {
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
    vi.clearAllMocks();
  });

  it("rejects all requests when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await POST(requestWithAuthorization("Bearer undefined"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Server misconfiguration",
    });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token before creating a run record", async () => {
    process.env.CRON_SECRET = "test-secret";

    const response = await POST(requestWithAuthorization("Bearer wrong"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
