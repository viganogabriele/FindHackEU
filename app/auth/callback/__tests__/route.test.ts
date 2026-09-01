import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/services/supabase-auth-server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { GET } from "../route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the candidates page for an external next value", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/auth/callback?code=oauth-code&next=%40evil.example%2Fphish",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin/candidates",
    );
  });

  it.each([
    "//evil.example/phish",
    "https://evil.example/phish",
    "/admin/other",
  ])("rejects an unsafe next path: %s", async (next) => {
    const response = await GET(
      new Request(
        `https://app.example.com/auth/callback?code=oauth-code&next=${encodeURIComponent(next)}`,
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin/candidates",
    );
  });

  it("allows the /admin dashboard as a post-login destination (issue #81)", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/auth/callback?code=oauth-code&next=%2Fadmin",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin",
    );
  });

  it("allows the published-hackathons admin page as a post-login destination", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/auth/callback?code=oauth-code&next=%2Fadmin%2Fhackathons%3Fstatus%3Dpast",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin/hackathons?status=past",
    );
  });

  it("marks the callback response as private and uncached", async () => {
    const response = await GET(
      new Request("https://app.example.com/auth/callback?code=oauth-code"),
    );

    expect(response.headers.get("cache-control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("returns the safe default when the code exchange fails", async () => {
    mocks.exchangeCodeForSession.mockResolvedValueOnce({
      error: new Error("exchange failed"),
    });

    const response = await GET(
      new Request(
        "https://app.example.com/auth/callback?code=oauth-code&next=%2Fadmin%2Fhackathons",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin/candidates?error=oauth_callback_failed",
    );
  });

  it("returns the safe default when the code exchange throws", async () => {
    mocks.exchangeCodeForSession.mockRejectedValueOnce(
      new Error("network failure"),
    );

    const response = await GET(
      new Request(
        "https://app.example.com/auth/callback?code=oauth-code&next=%2Fadmin%2Fhackathons",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.example.com/admin/candidates?error=oauth_callback_failed",
    );
  });
});
