import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  updateSupabaseSession: vi.fn(),
}));

vi.mock("@/lib/services/supabase-auth-middleware", () => ({
  updateSupabaseSession: mocks.updateSupabaseSession,
}));

import { proxy } from "../../proxy";

describe("proxy", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the Supabase session for published hackathons", async () => {
    const request = new NextRequest("https://app.example.com/admin/hackathons");
    const refreshedResponse = NextResponse.next({ request });
    mocks.updateSupabaseSession.mockResolvedValueOnce(refreshedResponse);

    await proxy(request);

    expect(mocks.updateSupabaseSession).toHaveBeenCalledWith(request);
  });

  it("does not add a Cookie cache variation to public pages", async () => {
    const request = new NextRequest("https://app.example.com/");

    const response = await proxy(request);

    expect(mocks.updateSupabaseSession).not.toHaveBeenCalled();
    expect(response.headers.get("vary")).toBeNull();
  });
});
