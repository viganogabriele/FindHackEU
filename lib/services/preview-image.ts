import { assertPublicHttpUrl } from "@/lib/http/fetch-public-url";
import { isAllowedPreviewImageHost } from "@/lib/constants/preview-image-hosts";

/**
 * Validate a source-provided image URL without fetching it.
 *
 * Two independent conditions, both required: the URL must be a public
 * HTTP(S) destination (no loopback/private/metadata address - see
 * `assertPublicHttpUrl`), and its host must be one `next/image` is
 * configured to fetch (see lib/constants/preview-image-hosts.ts). The
 * second check keeps a URL the image optimizer would reject with a 400 out
 * of the database entirely, so the card renders with no image rather than
 * a broken one.
 */
export function validatePreviewImageUrl(
  rawUrl: string | undefined | null,
): string | undefined {
  if (!rawUrl?.trim()) return undefined;

  const candidate = rawUrl.trim().startsWith("//")
    ? `https:${rawUrl.trim()}`
    : rawUrl.trim();

  try {
    const url = assertPublicHttpUrl(candidate);
    return isAllowedPreviewImageHost(url.hostname) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Keep a known-good stored image when a later source payload has none. */
export function preservePreviewImageUrl(
  incoming: string | undefined,
  existing: string | null,
): string | null {
  return incoming ?? existing;
}
