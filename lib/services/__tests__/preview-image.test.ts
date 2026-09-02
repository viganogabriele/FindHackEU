import { describe, expect, it } from "vitest";
import {
  preservePreviewImageUrl,
  validatePreviewImageUrl,
} from "@/lib/services/preview-image";
import { PREVIEW_IMAGE_HOSTS } from "@/lib/constants/preview-image-hosts";

// Devpost's thumbnail CDN - the only host that currently supplies a
// preview image, and the one `next/image` is configured to fetch.
const ALLOWED = `https://${PREVIEW_IMAGE_HOSTS[0]}/photos/production/x.jpg`;

describe("preview image persistence", () => {
  it("maps a valid source URL to the database field", () => {
    expect(validatePreviewImageUrl(ALLOWED)).toBe(ALLOWED);
  });

  it("normalizes protocol-relative source URLs without corrupting absolute URLs", () => {
    expect(
      validatePreviewImageUrl(`//${PREVIEW_IMAGE_HOSTS[0]}/photos/x.jpg`),
    ).toBe(`https://${PREVIEW_IMAGE_HOSTS[0]}/photos/x.jpg`);
    expect(validatePreviewImageUrl(ALLOWED)).toBe(ALLOWED);
  });

  it("rejects non-http image values", () => {
    expect(validatePreviewImageUrl("javascript:alert(1)")).toBeUndefined();
  });

  // A URL `next/image` would refuse with a 400 must never reach the
  // database: the card then renders with no image instead of a broken one.
  it("rejects a host next/image is not configured to fetch", () => {
    expect(
      validatePreviewImageUrl("https://cdn.example.com/image.jpg"),
    ).toBeUndefined();
  });

  it("rejects a lookalike host that merely ends with an allowed one", () => {
    expect(
      validatePreviewImageUrl(
        `https://evil-${PREVIEW_IMAGE_HOSTS[0]}/image.jpg`,
      ),
    ).toBeUndefined();
    expect(
      validatePreviewImageUrl(
        `https://${PREVIEW_IMAGE_HOSTS[0]}.attacker.example/image.jpg`,
      ),
    ).toBeUndefined();
  });

  it("does not overwrite an existing image when the new parse has none", () => {
    expect(preservePreviewImageUrl(undefined, ALLOWED)).toBe(ALLOWED);
  });
});
