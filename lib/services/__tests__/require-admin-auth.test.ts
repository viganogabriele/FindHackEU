import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  getUser: vi.fn(),
  // A minimal per-test-configurable stand-in for the admin_users table
  // lookup - `maybeSingle` is what `isAdminUserInTable` awaits.
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/services/supabase-auth-server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: mocks.maybeSingle,
        }),
      }),
    }),
  },
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
    // Default: the signed-in email is not in admin_users and the table
    // itself is reachable (no error) - most tests below are about the
    // env-var fallback path and don't care about the table.
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("denies access when there is no session", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "admin@example.com");

    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("denies a signed-in user whose email is not allowlisted and not in admin_users", async () => {
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
    // The env-var fallback short-circuits before the admin_users table is
    // ever queried.
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });
});

describe("admin_users table-based authorization (issue #18)", () => {
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

  it("authorizes a signed-in email that is present in admin_users, with no ADMIN_ALLOWED_EMAIL set", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", undefined);
    // Neither GOOGLE_CLIENT_ID nor ADMIN_ALLOWED_EMAIL alone would trip the
    // local no-auth bypass in production, but this suite pins NODE_ENV to
    // keep the bypass out of the picture entirely (bypass has its own
    // describe block above/below).
    vi.stubEnv("NODE_ENV", "production");
    // Not `.mockResolvedValueOnce` - both getAdminAuthStatus() and
    // requireAdminAuth() below independently re-run the full check (by
    // design, see requireAdminAuth's doc comment), so these mocks must
    // answer both calls the same way.
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "teammate@example.com" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { email: "teammate@example.com" },
      error: null,
    });

    const status = await getAdminAuthStatus();

    expect(status).toEqual({
      authorized: true,
      email: "teammate@example.com",
    });
    await expect(requireAdminAuth()).resolves.toBeUndefined();
  });

  it("denies a signed-in email that is absent from admin_users and does not match the env fallback", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "maintainer@example.com");
    vi.stubEnv("NODE_ENV", "production");
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "stranger@example.com" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("still authorizes via the env fallback even when that email is absent from admin_users", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", "maintainer@example.com");
    vi.stubEnv("NODE_ENV", "production");
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "maintainer@example.com" } },
      error: null,
    });

    await expect(requireAdminAuth()).resolves.toBeUndefined();
    // The fallback grants access without ever consulting the table.
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
  });

  it("fails closed (denies) when the admin_users query errors, even though the email might really be in the table", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "teammate@example.com" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "connection reset" },
    });

    const status = await getAdminAuthStatus();

    expect(status).toEqual({
      authorized: false,
      email: "teammate@example.com",
    });
    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("fails closed (denies) when admin_users is empty and there is no env fallback configured", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "nobody@example.com" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(requireAdminAuth()).rejects.toThrow("Not authorized");
  });

  it("matches an admin_users email case-insensitively", async () => {
    vi.stubEnv("ADMIN_ALLOWED_EMAIL", undefined);
    vi.stubEnv("NODE_ENV", "production");
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { email: "Teammate@Example.com" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValueOnce({
      data: { email: "teammate@example.com" },
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
