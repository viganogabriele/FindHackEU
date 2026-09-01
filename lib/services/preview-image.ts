import { assertPublicHttpUrl } from "@/lib/http/fetch-public-url";

/** Validate a source-provided image URL without fetching it. */
export function validatePreviewImageUrl(
  rawUrl: string | undefined | null,
): string | undefined {
  if (!rawUrl?.trim()) return undefined;

  const candidate = rawUrl.trim().startsWith("//")
    ? `https:${rawUrl.trim()}`
    : rawUrl.trim();

  try {
    return assertPublicHttpUrl(candidate).toString();
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
