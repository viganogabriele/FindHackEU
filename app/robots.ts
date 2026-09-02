import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

/**
 * Next's own robots route, replacing the `public/robots.txt` next-sitemap
 * used to write. Reads the same `SITE_URL` as everything else, so the
 * sitemap it points at can't drift onto a different origin.
 *
 * The disallows are new: the previous file was a bare `Allow: /`, which
 * invited crawlers into the admin dashboard, the OAuth callback and the
 * API. None of those belong in a search index (and `/api/update` is a POST
 * endpoint that answers a GET with a 405, which is just crawl budget spent
 * on nothing).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/auth/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
