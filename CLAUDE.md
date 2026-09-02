# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

FindHackEU is a Next.js 16 (App Router) site that aggregates hackathons happening across Europe. Data is scraped from external sources, deduplicated, geocoded, stored in Supabase, and exposed through a public REST API and a filterable web UI (map, bookmarks, radius search). Discord/Telegram/Twitter notification bots exist but are currently inactive/unconfigured. A moderated web-search discovery queue supplements the automated scrapers.

FindHackEU is an independent project, MIT-licensed (see `LICENSE`), originally inspired by and forked from HackTrack EU by Lorenzo Palaia. It now has its own architecture, infrastructure, issue tracker, and development direction. Maintained by Gabriele Viganò (info@viganogabriele.com).

The README is a normal, hand-maintained project document — the pipeline no longer auto-regenerates it.

## Commands

```bash
npm run dev              # start dev server (next dev --turbopack)
npm run build             # prebuild runs `format` + `knip`, then `next build --turbopack`
npm run start              # run production build
npm run lint                # eslint . (flat config, not `next lint`)
npm run format              # prettier --write .
npm run test                 # vitest run
npm run knip                  # find unused files/exports/deps
npm run sitemap                # regenerate sitemap (also runs postbuild)
npm run update-themes            # regenerate constants/additional-themes.js, then format
npm run backfill-topics            # tsx scripts/backfill-topics.ts — re-run topic extractor over existing rows
npx tsx scripts/backfill-coordinates.ts # dry-run coordinate backfill; add --write and optionally --limit=N to persist
npm run trigger-update              # manually POST /api/update against .env.local's CRON_SECRET
npm run update                       # bump deps with npm-check-updates, reinstall, update-themes
npm run reinstall                     # wipe node_modules/lockfile/.next and reinstall
```

Vitest (`npm run test`) covers `lib/**/__tests__/*.test.ts` and select `app/**/__tests__/*` (parsers, classifier, dedup, geo, admin auth, query builders, UI components). Route handlers have no direct unit tests by convention — verify those live. `tsc`/`next build`, `eslint`, and `knip` are the other required checks before considering a change done.

When running lint/knip/vitest from the repo root, scope them to real source directories if stray untracked dirs exist locally (e.g. `.worktrees/*`, `redesign/`) — e.g. `npx eslint app components contexts lib types scripts`. `knip.json` and `vitest.config.mts` both exclude `.claude`/`redesign`/`.worktrees`; keep that in sync if either config changes.

### Local Supabase

The project owns its infrastructure and doesn't depend on any earlier project's production resources. The repo ships its own schema, so local dev is fully self-contained:

```bash
git clone https://github.com/viganogabriele/FindHackEU.git && cd FindHackEU
npm install
cp .env.example .env.local
npx supabase start        # boots local Postgres/Studio via Docker; prints anon/service-role keys — paste into .env.local
npm run dev
```

- `npx supabase start` (first run) or `npx supabase db reset` applies every migration and loads `supabase/seed.sql` — ~36 realistic, clearly-fake sample `hackathons` rows (mixed status/moderation_state/location_type) and ~14 `hackathon_candidates` rows, so the public site and `/admin` have something to look at with zero API keys configured.
- **The admin dashboard (`/admin`) works locally with zero Google OAuth setup by default.** `lib/services/require-admin-auth.ts` grants access automatically in development when `GOOGLE_CLIENT_ID`/`ADMIN_ALLOWED_EMAIL` are both left unset, or explicitly via `ADMIN_LOCAL_NO_AUTH=true` (useful if you also have real OAuth configured and want to bypass it temporarily). This bypass is hardcoded to never trigger when `NODE_ENV === "production"` — every code path that could grant it re-checks that inline, not by trusting an outer gate. See `docs/admin-auth-setup.md` for real Google OAuth setup (needed for production-like testing or a real deploy).
- The local anon/service-role JWTs Supabase CLI prints are the same fixed dev keys for every local Supabase project — not secrets, safe to keep in `.env.local`.
- `supabase` is a devDependency (CLI only, not imported in code — it's in `knip.json`'s `ignoreDependencies`).

### Manually triggering the pipeline

Nothing runs automatically outside a real deployment + cron.

- `npm run trigger-update` — CLI wrapper (`scripts/trigger-update.mjs`) around `POST /api/update`, reads `CRON_SECRET` from `.env.local`. Defaults to test mode (no bot notifications); pass `--live` for a real run, `--url=` to target a non-localhost deployment.
- The `/admin` dashboard has a dev-only manual trigger button (`app/admin/trigger-update-button.tsx`) that calls `app/api/dev/trigger-update/route.ts` — 404s outside development, always forces `x-test-mode: true` so a stray click never sends real notifications.
- Or directly: `curl -X POST http://localhost:3000/api/update -H "Authorization: Bearer $CRON_SECRET" -H "x-test-mode: true"`.

The production cron (`.github/workflows/update.yml`) runs once a day via the deployment's `APP_URL` repository variable.

## Discovery coverage & data quality roadmap

Discovery coverage work — pagination, date windows, geographic filtering, multilingual classification, topic extraction, honest per-source status, deduplication, six provider parsers, web-search discovery with moderation, coordinates/geocoding — is largely implemented. Tracking issue: [#2 (EPIC)](https://github.com/viganogabriele/FindHackEU/issues/2). Before picking up any issue, read it in full and check the issue history for prior work — don't re-derive from scratch or duplicate a merged PR.

LabLab is disabled (its site moved to Next.js App Router, removing the JSON endpoint the parser relied on — not a Cloudflare block). The active provider set is Luma, Devfolio, MLH, ETHGlobal, Eventbrite, and Devpost.

**Known structural limit on Luma coverage:** Luma events can be set to `visibility: "private"` by their organizer, making them structurally invisible to the discovery API — no pagination or geography fix surfaces those. Verify a suspected coverage gap against the event's own Luma page before assuming it's a parser bug.

## Architecture

### Data pipeline (`app/api/update/route.ts`)

Triggered by an external cron job. A linear pipeline where each stage is wrapped so one stage's failure doesn't abort the rest:

1. Reset `is_new` flags on all rows.
2. Run each enabled `Provider` parser (`lib/parsers/*`, extending `BaseParser`, implementing `discover()` per `lib/providers/provider.interface.ts`) to fetch `ParsedHackathon[]`. Each source reports an honest `status: "ok" | "partial" | "failed"` and per-stage drop counts (`dropped: { byClassifier?, byDateWindow?, byCountry? }`).
   - **Luma** (`lib/parsers/luma-parser.ts`, the reference implementation): cursor-paginated against `api.luma.com/discover/get-paginated-events`, an unauthenticated internal endpoint (not Luma's official paid API) — a consciously accepted ToS risk since it's the source with the best European coverage; treat any block/contact from Luma as the trigger to reassess. Its non-European drop check (`europeanCountries.classifyCountryCode`) must run first, against only `geo.country_code`, before any regional/city fallback — reordering it produces false-positive drops.
   - **Devfolio, MLH, ETHGlobal, Eventbrite, Devpost** use different public listing surfaces; coverage from some is inherently small (regional skew), not a parser bug — see each parser's own doc comment. Eventbrite and Luma need the shared `classifyHackathon` classifier since their listing surfaces aren't exclusively hackathons; Devfolio/MLH/ETHGlobal/Devpost don't.
   - Eventbrite, Meetup, Unstop, and 10times were evaluated for the general web-search pipeline; only Eventbrite made it in as a `Provider` (see issue #10's history for the full reasoning on the others).
3. Deduplicate via `lib/dedup/{url-normalizer,fuzzy-matcher,dedupe-hackathons}.ts` — URL normalization plus fuzzy title+date matching, not just an exact composite key.
4. Enhance locations via `LocationEnhancementService` (geocoding), reusing already-known normalized URLs to skip redundant lookups. A `"not_found"` outcome leaves the event unresolved rather than dropping it; only an explicitly non-European `country_code` drops a row.
5. Diff against existing Supabase rows (matched by normalized URL, falling back to fuzzy same-day matching); insert new rows, update changed fields on existing ones. Date/location changes are tracked as `notableUpdates` but not wired into notification bots.
6. Call the `update_hackathon_statuses` Postgres RPC to recompute upcoming/past status.
7. If new hackathons were inserted (and not in test mode), fan out notifications to Discord/Telegram/Twitter bots via `Promise.allSettled`.

The route always returns 200/500 with a detailed JSON diagnostic body rather than throwing — treat every stage's error field as independent, non-fatal state. Auth is fail-closed: a missing `CRON_SECRET` returns 500. `lib/services/update-cooldown.ts` rejects a request inside `MIN_UPDATE_INTERVAL_MINUTES` (default 5, `0` disables) with a `429` before even creating an `update_runs` row — protects rate-limited providers like Eventbrite from back-to-back manual triggers. Every run past auth+cooldown is persisted to `public.update_runs` for history/debugging.

### Web-search discovery and candidate review

Generic web search can't feed the `Provider` pipeline directly — results are unverified by nature. Instead:

- `lib/search/search-provider.ts` — `SearchProvider` interface with three free-tier implementations (Tavily, SerpAPI, Serper) tried in fallback order (`TAVILY_API_KEY`/`SERPAPI_API_KEY`/`SERPER_API_KEY`, all optional individually).
- `lib/search/extract-event-evidence.ts` — extracts evidence per URL in preference order: JSON-LD `Event` structured data, then Open Graph title/description, then the bare `<title>`. Returns `null` (not an error) for a non-event page. HTML entities in extracted titles are decoded (`decodeEntities`, via the `he` package). A JSON-LD/OG title mismatch sets `has_conflict: true` (surfaced as a warning badge in `/admin`, never changes which tier's data wins).
- `lib/discovery/robots-checker.ts` + `lib/discovery/fetch-classifier.ts` — every candidate URL is robots.txt-checked before fetching; outcomes are classified as `"ok" | "blocked-by-robots" | "http-error" | "timeout" | "requires-js"`.
- `lib/discovery/web-search-candidates.ts` orchestrates queries (curated European countries × query templates, including native-language and `site:`-scoped variants) and writes only to `hackathon_candidates` — **never** `hackathons` directly. `lib/discovery/__tests__/candidate-isolation.test.ts` statically enforces this (fails if search/discovery code references the `"hackathons"` table or imports `lib/parsers/base-parser`).
- `lib/discovery/query-budget.ts` — a persistent daily query cap (`FileBudgetTracker`, gitignored `.discovery-budget.json`, default 30/day via `DISCOVERY_DAILY_QUERY_BUDGET`).
- `scripts/discover-web-candidates.ts` is the manually-triggered entry point (`npx tsx scripts/discover-web-candidates.ts`) — not part of the daily cron.

**`/admin`** is the single, unified, development-only admin dashboard (`notFound()` outside development). It has five status tabs (Pending/Approved/Past/Rejected/Archived — Pending and Rejected are each a union of `hackathon_candidates` rows and already-published `hackathons` rows the maintainer moved back for re-review, via `hackathons.moderation_state`), a "Manage hackathons" area, and a manual-URL-submission dialog. "Approve" calls `lib/services/promote-candidate.ts`'s `promoteCandidate()` — the _only_ path that copies a candidate into `hackathons`, deduped by normalized URL, inserted with `status: "estimated"` when no structured date was recoverable. Query-building functions live in `app/admin/queries.ts`, dependency-injected on the Supabase client for unit testing without a live database.

**Admin auth**: `lib/services/require-admin-auth.ts`'s `requireAdminAuth()`/`getAdminAuthStatus()` are the real security boundary, called at the top of every admin server action (not just used to hide UI — a server action is its own callable endpoint). They check a Supabase Auth session against `ADMIN_ALLOWED_EMAIL` (fails closed if unset), unless the local dev bypass (above) applies. `app/auth/callback/route.ts` only allows `/admin` as the post-login destination (`lib/services/admin-auth-redirect.ts`'s allowlist); `proxy.ts` refreshes the Supabase session cookie for `/admin` and `/auth/callback` only.

Optional LLM pre-screening (`lib/services/llm-prescreen.ts`, `GEMINI_API_KEY`) shows a suggestion-only badge next to pending candidates — never auto-acts, degrades to nothing when unconfigured or on any failure.

See `docs/discovery-research.md` for the fuller research behind the "moderation queue, not auto-publish" design decision.

### Data model

- `types/database.ts` — hand-maintained Supabase table types; every migration in `supabase/migrations/*.sql` needs a matching manual update here.
- `types/hackathon.ts` — `Hackathon = Database["public"]["Tables"]["hackathons"]["Row"]`.
- `lib/supabase.ts` exports `supabase` (anon key, client-safe reads) and `supabaseAdmin` (service role key, server-only).
- Any query that could return more than 1000 rows must go through `lib/services/fetch-all-rows.ts`'s `fetchAllRows<T>()` (PostgREST truncates at 1000 rows via `.range()` paging otherwise).
- `location_type` (`"physical" | "online" | "hybrid" | "tbd"`) and `venue` avoid an online/hybrid/unannounced event rendering as blank city/country. Each parser sets it only from its own source's explicit signal, never guessed from resolved city/country. A human-approved candidate promotion always sets `tbd` (no reliable signal).
- `latitude`/`longitude` (nullable) are populated by `LocationEnhancementService` at ingestion time and by `scripts/backfill-coordinates.ts` (dry-run by default, `--write` to persist) for older rows. `OPENAPI_GEOCODING_KEY` powers both ingestion-time enhancement and the public radius filter (via the rate-limited, cached `/api/geocode` proxy — the key is never sent to the browser). `lib/services/geocode-cache.ts` caches normalized queries for 180 days before hitting the provider.
- `preview_image_url` (optional) — parsers can supply a validated preview image URL; `components/hackathon-card.tsx` renders it when present.
- `hackathon_candidates` is the moderated queue for web-search and public submissions. `POST /api/submit-hackathon` / `components/public-submit-form.tsx` let anyone suggest an event (rate-limited, 10/hour/client via `lib/http/rate-limit.ts`); it never inserts directly into `hackathons`.

### Parsers

New sources implement `BaseParser` (`lib/parsers/base-parser.ts`), returning `ParsedHackathon[]` from `discover()`. The base class provides `formatDate` (tolerant of `"N/A"`/`Z`-suffixed strings, throws on genuinely invalid dates) and `extractTopics` (delegates to `defaultTopicExtractor`, standardizing against `HackathonTopic` from `lib/constants/topics.ts`). Wire a new parser into `sourceResults` and the parse block in `app/api/update/route.ts`.

### Classification

`lib/classification/{keywords,hackathon-classifier}.ts` scores candidates against multilingual (en/it/de/fr+) keyword lists (`AUTO_PUBLISH_THRESHOLD=50`, `BORDERLINE_THRESHOLD=20`). `countMatches` counts **distinct matched substrings** (`matchAll` + `Set`), not pattern-match count — counting patterns double-counts overlapping cross-language matches and over-publishes events with no real signal beyond a shared cognate word.

`lib/detect-non-english.ts`'s `looksLikeForeignLanguage(text, allowedLocale)` is a display-only heuristic: leaves English/ambiguous titles visible, hides a title only when exactly one non-English language signal is detected and it differs from the current site locale. Locale-aware, not English-only; the "include non-English hackathons" filter toggle can disable it.

### Frontend

- App Router pages under `app/` (`app/docs`, `app/privacy`, `app/terms`, root listing page).
- `app/api/hackathons/route.ts` is the public read API (`GET /api/hackathons?status=upcoming|past`). Exposes a `source` field, uses `fetchAllRows` + a `date_start`/`id` tie-breaker for stable full-list responses; passing `limit` opts into keyset-paginated responses (`{ data, nextCursor }`, an opaque base64 token) instead — chosen over offset pagination because it stays correct under concurrent inserts. Rate-limited (100/hour, 10/minute per IP) **in production only** — the limiter is a no-op outside `NODE_ENV === "production"` so local dev/testing never trips it (it has no relationship to upstream providers like Luma, which are only ever called server-side by the daily pipeline).
- `contexts/filter-context.tsx` holds filter state (status/location/topics/dates/online-inclusion/non-English-inclusion); `contexts/translation-context.tsx` drives i18n; `lib/theme-store.ts` drives the multi-preset theme system (`constants/additional-themes.js`, regenerated via `npm run update-themes`).
- `components/site-header.tsx`/`site-footer.tsx`/`filters-panel.tsx` — public chrome. `components/hackathon-card.tsx` is shared by the public listing and admin moderation views (`compact`/`meta`/`titleLink`/`adminTheme` props for the admin context).
- `lib/bookmarks-store.ts` — public bookmarks via a Zustand store persisted in `localStorage`; hydration deferred until mount; storage failures degrade to a no-op adapter.
- `components/hackathon-map.tsx` — Leaflet/OpenStreetMap map with marker clustering. Uses the same OSM tiles in both light and dark mode (a CSS filter recolors them for dark, rather than a separate less-detailed dark basemap, so precision/detail stays identical between themes). `lib/city-centroids.ts` / `lib/country-centroids.ts` supply an approximate marker (flagged `approximate: true`, shown in the UI) when precise coordinates are absent, trying city-level before falling back to country-level. **Never pass an explicit `icon={undefined}` to a react-leaflet `<Marker>`** — it shadows Leaflet's own default-icon fallback with an own-property `undefined` and crashes `_initIcon()`; omit the prop entirely (e.g. via a conditional spread) instead. Map popups reuse the real `HackathonCard` and must have their theme tokens (not Leaflet's hardcoded white background) applied via scoped CSS in `app/globals.css`. The map's wrapper div needs an explicit `z-0` so Leaflet's internally high z-indexed elements (e.g. `.leaflet-top` at `z-index: 1000`) stay contained within their own stacking context instead of leaking above a `Dialog`'s overlay.
- `lib/location-filter.ts` supports exact city selections and country-wide `country:<ISO>` markers in one flat location array; also owns the radius filter (geocodes via `/api/geocode`, applied client-side alongside other filters).
- `i18n/*.json` — one JSON file per locale (en, it, de, es, fr, nl, pl, pt, ro, sv). Keep keys in sync across all files when adding new UI strings.
- UI components in `components/ui` follow shadcn/ui conventions (Radix primitives + `class-variance-authority` + `tailwind-merge`). Public-site styling uses theme-token-driven badges/pills (not hardcoded per-category colors) — see `components/hackathon-card.tsx`'s topic/location-type badge treatment for the established pattern before adding new categorical UI.
- Locale/theme hydration: Zustand stores backing anything SSR-visible (locale, theme) must never read `localStorage` synchronously during initial-state computation — start at a fixed default, use `persist({ skipHydration: true })`, and rehydrate inside a post-mount `useEffect`/`useSyncExternalStore`. A prior version of the locale store read `localStorage` synchronously and caused a real SSR/client hydration mismatch; don't reintroduce that pattern.

### Notifications

`lib/bots/{discord,telegram,twitter}-bot.ts` each expose `notifyNewHackathons(hackathons)`, invoked together via `Promise.allSettled`. Currently unconfigured/inactive — no links shown on the public site — but the pipeline wiring stays in place so they can be turned back on by setting the relevant env vars.

### Environment variables

Required at runtime (see `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`. Optional: `OPENAPI_GEOCODING_KEY` (geocoding), `DISCORD_WEBHOOK_URL`/`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHANNEL_ID`/`TWITTER_API_*` (currently-inactive notification bots), `LUMA_MAX_PAGES_PER_SLUG`, `MIN_UPDATE_INTERVAL_MINUTES`, `TAVILY_API_KEY`/`SERPAPI_API_KEY`/`SERPER_API_KEY` (web-search discovery), `GEMINI_API_KEY` (LLM pre-screening suggestions), `ADMIN_LOCAL_NO_AUTH`/`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`ADMIN_ALLOWED_EMAIL` (admin auth), `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` (error tracking only — no session replay, analytics, or default PII).

### Monitoring

`GET /api/health` is a cache-free, side-effect-free reachability check; `.github/workflows/uptime.yml` calls it every 15 minutes via the `APP_URL` repository variable. Sentry (`@sentry/nextjs`) captures errors only when a DSN is configured.

### Path aliases

`@/*` maps to the repo root (see `tsconfig.json`), e.g. `@/lib/supabase`, `@/types/hackathon`.

### Dependency version constraints

`eslint-config-next` must track `next`'s exact minor; `eslint` is pinned `^9.39.5` (not `^10.x`) and `typescript` is pinned `^5.9.3` (not `^6.x`) because `typescript-eslint@8.55.0`'s peer range doesn't support those newer majors yet — verify with `npm ls` (zero "invalid" warnings) before bumping any of these three together.

## Working conventions

- Verify subagent and external-review findings against real code and, where possible, real running behavior (local Supabase, a live provider fetch, an actual browser check for UI/hydration/z-index issues) before accepting a fix as correct — several real bugs in this repo's history were only caught this way, including ones that looked plausible on paper (a Strict-Mode theory for a map crash that turned out to have a different root cause once tested live).
- Prefer opening focused PRs per issue over one giant change.
