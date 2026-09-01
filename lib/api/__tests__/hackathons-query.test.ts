import { describe, expect, it } from "vitest";
import {
  MAX_HACKATHON_PAGE_SIZE,
  parseHackathonsQuery,
} from "@/lib/api/hackathons-query";

function requestFor(query: string): Request {
  return new Request(`https://example.org/api/hackathons${query}`);
}

function cursorFor(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

describe("parseHackathonsQuery", () => {
  it("defaults to upcoming without bounded pagination", () => {
    expect(parseHackathonsQuery(requestFor(""))).toEqual({
      ok: true,
      value: {
        status: "upcoming",
        ascending: true,
        limit: null,
        cursor: null,
      },
    });
  });

  it("accepts every public database status", () => {
    expect(parseHackathonsQuery(requestFor("?status=past"))).toMatchObject({
      ok: true,
      value: { status: "past", ascending: false },
    });
    expect(parseHackathonsQuery(requestFor("?status=estimated"))).toMatchObject(
      {
        ok: true,
        value: { status: "estimated", ascending: false },
      },
    );
  });

  it("rejects an unknown status instead of returning an empty success", () => {
    expect(parseHackathonsQuery(requestFor("?status=not-a-status"))).toEqual({
      ok: false,
      message: "Invalid 'status' query parameter",
    });
  });

  it("accepts a strict bounded page size up to the configured maximum", () => {
    expect(
      parseHackathonsQuery(
        requestFor(`?status=upcoming&limit=${MAX_HACKATHON_PAGE_SIZE}`),
      ),
    ).toMatchObject({ ok: true, value: { limit: MAX_HACKATHON_PAGE_SIZE } });
  });

  it.each(["", "25foo", "0", "-1", "1.5", " 25"])(
    "rejects malformed limit %j",
    (limit) => {
      expect(parseHackathonsQuery(requestFor(`?limit=${limit}`))).toEqual({
        ok: false,
        message: "Invalid 'limit' query parameter",
      });
    },
  );

  it("rejects a limit above the public page-size cap", () => {
    expect(
      parseHackathonsQuery(requestFor(`?limit=${MAX_HACKATHON_PAGE_SIZE + 1}`)),
    ).toEqual({
      ok: false,
      message: "Invalid 'limit' query parameter",
    });
  });

  it("accepts an exact two-field RFC3339 cursor", () => {
    const cursor = cursorFor(
      "2026-01-01T00:00:00.000Z|123e4567-e89b-12d3-a456-426614174000",
    );

    expect(
      parseHackathonsQuery(requestFor(`?limit=25&cursor=${cursor}`)),
    ).toEqual({
      ok: true,
      value: {
        status: "upcoming",
        ascending: true,
        limit: 25,
        cursor: {
          dateStart: "2026-01-01T00:00:00.000Z",
          id: "123e4567-e89b-12d3-a456-426614174000",
        },
      },
    });
  });

  it.each([
    "Jan 1, 2026|123e4567-e89b-12d3-a456-426614174000",
    "2026-01-01T00:00:00.000Z|123e4567-e89b-12d3-a456-426614174000|extra",
    "2026-01-01T00:00:00.000Z|123e4567-e89b-12d3-a456-42661417400),or(status.eq.past)",
    "2026-01-01|123e4567-e89b-12d3-a456-426614174000",
  ])("rejects unsafe cursor payload %j", (payload) => {
    const cursor = cursorFor(payload);

    expect(
      parseHackathonsQuery(requestFor(`?limit=25&cursor=${cursor}`)),
    ).toEqual({ ok: false, message: "Invalid 'cursor' query parameter" });
  });
});
