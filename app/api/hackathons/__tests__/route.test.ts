import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { GET } from "@/app/api/hackathons/route";
import { supabase } from "@/lib/supabase";

function requestFor(query: string, ip: string): Request {
  return new Request(`https://example.org/api/hackathons${query}`, {
    headers: { "x-forwarded-for": ip },
  });
}

function queryBuilder(data: unknown[], error: unknown = null) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    or: vi.fn(),
    limit: vi.fn(),
    range: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.or.mockReturnValue(builder);
  builder.limit.mockResolvedValue({ data, error });
  builder.range.mockResolvedValue({ data, error });

  return builder;
}

describe("GET /api/hackathons", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a client error before querying for an invalid cursor", async () => {
    const response = await GET(
      requestFor(
        "?limit=25&cursor=MjAyNi0wMS0wMVQwMDowMDowMC4wMDBafDEyM2U0NTY3",
        "route-contract-invalid-cursor",
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid 'cursor' query parameter",
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("uses a bounded keyset page and returns the opaque next cursor", async () => {
    const rows = [
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        date_start: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "123e4567-e89b-12d3-a456-426614174001",
        date_start: "2026-01-02T00:00:00.000Z",
      },
    ];
    const builder = queryBuilder(rows);
    vi.mocked(supabase.from).mockReturnValue(builder as never);

    const response = await GET(
      requestFor("?status=upcoming&limit=1", "route-contract-pagination"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([rows[0]]);
    expect(body.nextCursor).toBe(
      Buffer.from(`${rows[0].date_start}|${rows[0].id}`, "utf8").toString(
        "base64url",
      ),
    );
    expect(builder.limit).toHaveBeenCalledWith(2);
  });
});
