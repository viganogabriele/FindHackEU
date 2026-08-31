/**
 * fetchAllRows() exists to fix a real bug found in code review: every
 * unpaginated `.select(...)` query in this codebase silently truncated
 * once a table exceeded PostgREST's `max_rows` cap (1000 locally, see
 * supabase/config.toml), instead of erroring - risking duplicate inserts
 * (existing rows becoming invisible) and a public API that quietly drops
 * hackathons from its response. These tests exercise the pagination logic
 * itself against a mocked paged data source, without needing a real
 * database of >1000 rows.
 */
import { describe, expect, it } from "vitest";
import { fetchAllRows } from "@/lib/services/fetch-all-rows";

describe("fetchAllRows", () => {
  it("returns everything in a single page when the table is smaller than pageSize", async () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const fetchPage = async () => ({ data: rows, error: null });

    const result = await fetchAllRows(fetchPage, 1000);

    expect(result).toEqual(rows);
  });

  it("pages through multiple full pages until a short page signals the end", async () => {
    const totalRows = 25;
    const pageSize = 10;
    const allRows = Array.from({ length: totalRows }, (_, i) => ({ id: i }));

    const fetchPage = async (from: number, to: number) => ({
      data: allRows.slice(from, to + 1),
      error: null,
    });

    const result = await fetchAllRows(fetchPage, pageSize);

    expect(result).toHaveLength(totalRows);
    expect(result).toEqual(allRows);
  });

  it("stops immediately on an empty table instead of looping", async () => {
    const fetchPage = async () => ({ data: [], error: null });

    const result = await fetchAllRows(fetchPage, 10);

    expect(result).toEqual([]);
  });

  it("throws if any page returns an error, instead of silently returning a partial result", async () => {
    const fetchPage = async () => ({
      data: null,
      error: new Error("boom"),
    });

    await expect(fetchAllRows(fetchPage, 10)).rejects.toThrow("boom");
  });

  it("exercises exactly the number of pages a table of a given size would need", async () => {
    const pageSize = 1000;
    const totalRows = 2500; // 3 pages: 1000 + 1000 + 500
    const allRows = Array.from({ length: totalRows }, (_, i) => ({ id: i }));
    let callCount = 0;

    const fetchPage = async (from: number, to: number) => {
      callCount++;
      return { data: allRows.slice(from, to + 1), error: null };
    };

    const result = await fetchAllRows(fetchPage, pageSize);

    expect(result).toHaveLength(totalRows);
    expect(callCount).toBe(3);
  });
});
