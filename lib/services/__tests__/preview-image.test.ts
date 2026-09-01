import { describe, expect, it } from "vitest";
import {
  preservePreviewImageUrl,
  validatePreviewImageUrl,
} from "@/lib/services/preview-image";

describe("preview image persistence", () => {
  it("maps a valid source URL to the database field", () => {
    expect(validatePreviewImageUrl("https://cdn.example.com/image.jpg")).toBe(
      "https://cdn.example.com/image.jpg",
    );
  });

  it("rejects non-http image values", () => {
    expect(validatePreviewImageUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("does not overwrite an existing image when the new parse has none", () => {
    expect(
      preservePreviewImageUrl(undefined, "https://cdn.example.com/old.jpg"),
    ).toBe("https://cdn.example.com/old.jpg");
  });
});
