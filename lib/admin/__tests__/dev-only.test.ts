import { describe, expect, it } from "vitest";
import { isDevOnlyEnabled } from "@/lib/admin/dev-only";

describe("isDevOnlyEnabled", () => {
  it("allows only the explicit development environment", () => {
    expect(isDevOnlyEnabled("development")).toBe(true);
    expect(isDevOnlyEnabled("test")).toBe(false);
    expect(isDevOnlyEnabled("preview")).toBe(false);
    expect(isDevOnlyEnabled("production")).toBe(false);
    expect(isDevOnlyEnabled(undefined)).toBe(false);
  });
});
