import { describe, expect, it, vi } from "vitest";

interface RecordedCall {
  method: string;
  args: unknown[];
}

function createQueryBuilderMock(rows: unknown[]) {
  const calls: RecordedCall[] = [];
  const builder: Record<string, unknown> = {};
  const chainable =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };

  for (const method of ["select", "eq", "is", "order", "or", "limit"]) {
    builder[method] = chainable(method);
  }
  builder.range = (...args: unknown[]) => {
    calls.push({ method: "range", args });
    return Promise.resolve({ data: rows, error: null });
  };

  return { builder, calls };
}

describe("GET /api/hackathons - preview image field", () => {
  it("includes preview_image_url in the public response", async () => {
    const row = {
      id: "hackathon-1",
      name: "Image Hack",
      date_start: "2026-10-10T00:00:00.000Z",
      preview_image_url: "https://cdn.example.com/preview.jpg",
    };
    const { builder, calls } = createQueryBuilderMock([row]);

    vi.doMock("@/lib/supabase", () => ({
      supabase: { from: vi.fn().mockReturnValue(builder) },
    }));

    const { GET } = await import("../route");
    const response = await GET(
      new Request("https://example.org/api/hackathons"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([row]);
    expect(calls.find((call) => call.method === "select")?.args[0]).toContain(
      "preview_image_url",
    );

    vi.doUnmock("@/lib/supabase");
    vi.resetModules();
  });
});
