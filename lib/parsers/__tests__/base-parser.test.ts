import { describe, expect, it } from "vitest";
import { BaseParser } from "@/lib/parsers/base-parser";

class ExposedBaseParser extends BaseParser {
  readonly name = "test";
  readonly enabled = true;

  protected async discover() {
    return { hackathons: [], errors: [], status: "ok" as const };
  }

  parseDates(start: string, end?: string) {
    return this.formatDate(start, end);
  }
}

describe("BaseParser.formatDate", () => {
  it("rejects timestamps without an explicit timezone", () => {
    expect(() =>
      new ExposedBaseParser().parseDates("2026-11-01T09:00:00"),
    ).toThrow(/explicit timezone/i);
  });

  it("preserves UTC and numeric timezone offsets", () => {
    const dates = new ExposedBaseParser().parseDates(
      "2026-11-01T09:00:00+02:00",
      "2026-11-01T18:00:00Z",
    );

    expect(dates.start.toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(dates.end?.toISOString()).toBe("2026-11-01T18:00:00.000Z");
  });
});
