import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { updateSupabaseSession } from "@/lib/services/supabase-auth-middleware";

describe("updateSupabaseSession", () => {
  beforeEach(() => {
    mocks.createServerClient.mockImplementation((_url, _key, options) => {
      mocks.getUser.mockImplementation(async () => {
        options.cookies.setAll(
          [
            {
              name: "sb-local-auth-token",
              value: "refreshed-session",
              options: { path: "/" },
            },
          ],
          {
            "Cache-Control":
              "private, no-cache, no-store, must-revalidate, max-age=0",
            Expires: "0",
            Pragma: "no-cache",
          },
        );

        return { data: { user: null }, error: null };
      });

      return { auth: { getUser: mocks.getUser } };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes refreshed cookies and all session cache headers to the response", async () => {
    const request = new NextRequest("https://app.example.com/admin/candidates");

    const response = await updateSupabaseSession(request);

    expect(response.cookies.get("sb-local-auth-token")?.value).toBe(
      "refreshed-session",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });
});
