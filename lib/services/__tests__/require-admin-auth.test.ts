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

  it("fails closed when ADMIN_ALLOWED_EMAIL is missing in production", async () => {
    // NODE_ENV=production is what makes this a real fail-closed check
    // rather than the local no-auth bypass (issue #4, see the describe
    // block below) - both ADMIN_ALLOWED_EMAIL and the bypass agree "denied"
    // here, but for different reasons, so pin NODE_ENV explicitly.
    vi.stubEnv("NODE_ENV", "production");
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

describe("local no-auth admin bypass (issue #4)", () => {
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

  it("bypasses auth outside production when neither GOOGLE_CLIENT_ID nor ADMIN_ALLOWED_EMAIL is set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", undefined);
    vi.stubEnv("ADMIN_LOCAL_NO_AUTH", undefined);

    const status = await getAdminAuthStatus();

    expect(status.authorized).toBe(true);
    await expect(requireAdminAuth()).resolves.toBeUndefined();
    // The bypass never calls into Supabase Auth at all.
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("bypasses auth outside production when ADMIN_LOCAL_NO_AUTH=true, even with ADMIN_ALLOWED_EMAIL configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_LOCAL_NO_AUTH", "true");

    const status = await getAdminAuthStatus();

    expect(status.authorized).toBe(true);
    await expect(requireAdminAuth()).resolves.toBeUndefined();
  });

  it("never bypasses auth when NODE_ENV=production, no matter how the bypass env vars are set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", undefined);
    vi.stubEnv("ADMIN_LOCAL_NO_AUTH", "true");

    const status = await getAdminAuthStatus();

    expect(status.authorized).toBe(false);
    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("does not bypass auth outside production when ADMIN_ALLOWED_EMAIL alone is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "admin@example.com");
    vi.stubEnv("ADMIN_LOCAL_NO_AUTH", undefined);

    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });
});
