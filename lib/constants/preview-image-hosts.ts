/**
 * Hosts allowed to serve a hackathon `preview_image_url`.
 *
 * This list is the single allowlist behind two things that must agree:
 *
 *   1. `next.config.ts`'s `images.remotePatterns`, which decides what
 *      `/_next/image` will fetch and re-serve. It previously read
 *      `hostname: "*"`, which Next treats as "any host" - verified live
 *      against a running server, `/_next/image?url=https://<any-host>/...`
 *      returned 200 with the proxied bytes. That turns the deployment into
 *      an open image proxy: anyone can launder arbitrary third-party images
 *      through this domain and burn its (metered, billable) image
 *      optimization quota.
 *   2. `lib/services/preview-image.ts`'s `validatePreviewImageUrl`, so a URL
 *      the optimizer would refuse never gets written to the database in the
 *      first place - the card then simply renders without an image instead
 *      of showing a broken one.
 *
 * Adding a source that supplies preview images means adding its image host
 * here, and nowhere else.
 *
 * `d112y698adiu2z.cloudfront.net` is Devpost's thumbnail CDN - the only
 * source that currently sets `preview_image_url` at all
 * (lib/parsers/devpost-parser.ts). Confirmed against the live Devpost
 * listing API, 2026-09-02.
 */
export const PREVIEW_IMAGE_HOSTS = ["d112y698adiu2z.cloudfront.net"] as const;

const ALLOWED_HOSTS = new Set<string>(PREVIEW_IMAGE_HOSTS);

/** Exact host match - no subdomain wildcarding, so a lookalike can't slip in. */
export function isAllowedPreviewImageHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname.toLowerCase());
}
