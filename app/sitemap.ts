import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * Next's own sitemap route, replacing next-sitemap.
 *
 * next-sitemap derives its output from the build's *statically generated*
 * pages. Every route in this app is server-rendered on demand - the root
 * layout reads the `eu_theme` cookie to inject the selected theme before
 * first paint, which opts the whole tree into dynamic rendering - so
 * next-sitemap found nothing to list and wrote an empty `<sitemapindex>`:
 *
 *     $ npx next-sitemap
 *     │ indexSitemaps │ 1 │
 *     │ sitemaps      │ 0 │
 *
 * That empty file is what was committed and is what the live site serves.
 * This route enumerates the public pages directly, so it stays correct
 * regardless of how any of them are rendered.
 *
 * Deliberately only the four public pages: `/admin`, `/auth/callback` and
 * everything under `/api` must not be advertised to crawlers.
 */
const YEARLY_PAGES = ["/docs", "/privacy", "/terms"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...YEARLY_PAGES.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified,
      changeFrequency: "yearly" as const,
      priority: 0.8,
    })),
  ];
}
