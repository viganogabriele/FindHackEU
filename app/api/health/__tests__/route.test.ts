import { describe, expect, it } from "vitest";
import { GET } from "../route";

describe("GET /api/health", () => {
  it("returns a cache-free 200 response with a stable status", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
