import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/services/supabase-auth-server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import {
  getAdminAuthStatus,
  requireAdminAuth,
} from "@/lib/services/require-admin-auth";

describe("admin authorization boundary", () => {
  beforeEach(() => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("denies access when there is no session", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "admin@example.com");

    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("denies a signed-in user whose email is not allowlisted", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "admin@example.com");
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "other@example.com" } },
      error: null,
    });

    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("fails closed when ADMIN_ALLOWED_EMAIL is missing", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", undefined);
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "admin@example.com" } },
      error: null,
    });

    const status = await getAdminAuthStatus();

    expect(status).toEqual({ authorized: false, email: "admin@example.com" });
    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("matches the allowlisted email case-insensitively", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "Admin@Example.com");
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "admin@example.com" } },
      error: null,
    });

    await expect(requireAdminAuth()).resolves.toBeUndefined();
  });
});
