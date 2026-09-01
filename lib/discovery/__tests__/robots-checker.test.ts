import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRobotsCache,
  isAllowedByRobots,
  isPathAllowed,
  parseRobotsTxt,
} from "@/lib/discovery/robots-checker";

function mockRobotsResponse(body: string | null, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      text: async () => body ?? "",
    })),
  );
}

describe("parseRobotsTxt / isPathAllowed", () => {
  it("disallows a path matching a Disallow prefix under User-agent: *", () => {
    const rules = parseRobotsTxt("User-agent: *\nDisallow: /admin/\n");
    expect(isPathAllowed(rules, "/admin/settings")).toBe(false);
    expect(isPathAllowed(rules, "/public/page")).toBe(true);
  });

  it("ignores rules scoped to a different, named user-agent", () => {
    const rules = parseRobotsTxt(
      "User-agent: SomeOtherBot\nDisallow: /everything\n\nUser-agent: *\nDisallow:\n",
    );
    expect(isPathAllowed(rules, "/everything/page")).toBe(true);
  });

  it("prefers the longer, more specific Allow over a broader Disallow", () => {
    const rules = parseRobotsTxt(
      "User-agent: *\nDisallow: /directory/\nAllow: /directory/sitemap/\n",
    );
    expect(isPathAllowed(rules, "/directory/private")).toBe(false);
    expect(isPathAllowed(rules, "/directory/sitemap/foo")).toBe(true);
  });

  it("treats a page with no matching rule as allowed", () => {
    const rules = parseRobotsTxt("User-agent: *\nDisallow: /admin/\n");
    expect(isPathAllowed(rules, "/")).toBe(true);
  });

  it("ignores comment lines", () => {
    const rules = parseRobotsTxt(
      "# a comment\nUser-agent: *\n# another comment\nDisallow: /secret\n",
    );
    expect(isPathAllowed(rules, "/secret/page")).toBe(false);
  });
});

describe("isAllowedByRobots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches and caches robots.txt per host, only once", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => "User-agent: *\nDisallow: /blocked\n",
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const cache = createRobotsCache();

    await isAllowedByRobots("https://example.org/blocked/page", cache);
    await isAllowedByRobots("https://example.org/other/page", cache);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns false for a disallowed path, true for an allowed one", async () => {
    mockRobotsResponse("User-agent: *\nDisallow: /blocked\n");
    const cache = createRobotsCache();

    expect(
      await isAllowedByRobots("https://example.org/blocked/page", cache),
    ).toBe(false);
    expect(
      await isAllowedByRobots("https://example.org/allowed/page", cache),
    ).toBe(true);
  });

  it("fails open (allows) when robots.txt 404s", async () => {
    mockRobotsResponse(null, false, 404);
    const cache = createRobotsCache();

    expect(await isAllowedByRobots("https://example.org/anything", cache)).toBe(
      true,
    );
  });

  it("fails open (allows) when the robots.txt fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const cache = createRobotsCache();

    expect(await isAllowedByRobots("https://example.org/anything", cache)).toBe(
      true,
    );
  });
});
