import { describe, expect, it } from "vitest";
import { getSourceUpdateFields } from "@/lib/services/hackathon-source-sync";

describe("getSourceUpdateFields", () => {
  it("does not return scraper fields for a manually edited row", () => {
    expect(
      getSourceUpdateFields(
        "2026-09-01T12:00:00.000Z",
        { name: "Source name", date_start: "2026-11-15T00:00:00.000Z" },
        "2026-09-01T13:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("returns source fields for a row that has not been manually edited", () => {
    expect(
      getSourceUpdateFields(
        null,
        { name: "Source name" },
        "2026-09-01T13:00:00.000Z",
      ),
    ).toEqual({
      name: "Source name",
      updated_at: "2026-09-01T13:00:00.000Z",
    });
  });
});
