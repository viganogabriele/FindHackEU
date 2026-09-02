/**
 * The single source of truth for this deployment's public origin.
 *
 * Every user-visible absolute URL the app emits - the canonical link, the
 * Open Graph/Twitter card URLs, the JSON-LD `WebSite`/`Organization` node,
 * and the attribution link attached to a shared hackathon - has to agree on
 * one origin. They had drifted onto `hacktrack-eu.vercel.app`, the domain of
 * the upstream project this one was forked from, while the site itself is
 * served from `findhackeu.vercel.app`.
 *
 * `NEXT_PUBLIC_SITE_URL` overrides the default (e.g. once a custom domain is
 * in front of the deployment). It is deliberately `NEXT_PUBLIC_`-prefixed
 * rather than reusing the workflows' `APP_URL`: this value is read from
 * client components too, and Next only inlines `NEXT_PUBLIC_*` into the
 * browser bundle. Unset, the default below is correct for the current
 * deployment, so nothing has to be configured for this to be right.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://findhackeu.vercel.app"
).replace(/\/+$/, "");
