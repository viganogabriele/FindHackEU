import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  redirect: mocks.redirect,
}));

import AdminDashboardPage from "../page";

describe("AdminDashboardPage", () => {
  it("redirects directly to the candidates dashboard", async () => {
    await AdminDashboardPage({ searchParams: Promise.resolve({}) });

    expect(mocks.redirect).toHaveBeenCalledWith("/admin/candidates");
  });

  it("preserves an OAuth callback error for the existing sign-in gate", async () => {
    await AdminDashboardPage({
      searchParams: Promise.resolve({ error: "oauth_callback_failed" }),
    });

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/admin/candidates?error=oauth_callback_failed",
    );
  });
});
