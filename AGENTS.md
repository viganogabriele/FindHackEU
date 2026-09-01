# AGENTS.md

Instructions for AI coding agents working in this repository. See `CLAUDE.md` for Claude Code-specific guidance (they should stay consistent).

## Project overview

HackTrack EU is a Next.js 16 (App Router, TypeScript) app that aggregates European hackathons. Data flows: external sources → parsers → Supabase (Postgres) → public API / web UI, with a README table and Discord/Telegram/Twitter notifications regenerated on every update run. This is Gabriele Viganò's fork of Lorenzo Palaia's original project (MIT-licensed, see `LICENSE`), developed independently rather than aimed at an upstream merge.

## Discovery coverage & data quality roadmap

Phase 1 (make every hackathon already discoverable via Luma actually surface) and most of Phase 2 (additional free sources, web-search discovery) are **done** as of 2026-09-01 — 20+ issues closed in one large session, all verified live (not just unit-tested) before closing. Current state, not history:

- **Four active `Provider` parsers**: Luma (reference implementation, accepted ToS risk — see issue #65), Devfolio, MLH, ETHGlobal. LabLab is disabled (its site's JSON endpoint no longer exists after a framework migration — not Cloudflare, see issue #11). Eventbrite directory-page scraping exists on a separate branch (`feat/eventbrite-provider`, issue #68) not yet merged into the main discovery branch.
- **Web-search discovery** (`lib/search/*`, `lib/discovery/*`) is a _second, distinct_ pipeline — never feeds `hackathons` directly. It writes to a moderated `hackathon_candidates` review queue (`/admin/candidates`, now gated behind real Google sign-in — issue #67) instead. See `CLAUDE.md`'s "Web-search discovery and candidate review" section for the full mechanics (search-provider fallback chain, JSON-LD/OG extraction with conflict detection, robots.txt-gated fetch classification, multilingual/site-scoped query generation, a persistent daily query budget).
- Tracking issue: [#2 (EPIC) Improve hackathon discovery coverage and data quality](https://github.com/viganogabriele/HackTrack-EU/issues/2) — kept open as an index, not itself actionable.
- Genuinely still open, real work: #29 (split the update route into independent phases — a large architecture change, needs the maintainer's explicit go-ahead before starting, don't just do it), #72 (archive/un-publish a wrong or stale hackathon), #73 (filter by country, not just city), #74 (Meetup — investigated and found low-value today, informational only).
- Deliberately deferred (their own issue text says so, don't second-guess it): #19 (headless-browser rendering), #33 (re-evaluate update frequency — needs `update_runs` history to accumulate real data first).

Before picking up any issue, read it in full and check it isn't already covered by a merged PR — this repo's issue history has closed 40+ issues, re-deriving from scratch wastes effort.

### Known structural limits on Luma coverage

Not every "missing" hackathon is a bug: Luma events can be set to `visibility: "private"` by their organizer, making them structurally invisible to the public discovery API — no pagination or geography fix will surface those. Before filing a coverage-gap issue, check the event directly (`https://api.luma.com/url?url=<slug>`); issue #53 in this fork's history was opened and then closed for exactly this reason.

### Fork ownership note (important for local testing)

This is a fork; the original repo owner's Supabase project, Vercel deployment, and API keys are **not accessible from here** and are out of scope — this is a hard, permanent constraint, not a temporary gap. The repo now ships its own Supabase schema (`supabase/migrations/20260101000000_init.sql`) so local development is fully self-contained: run `npx supabase start` (Docker-based CLI, devDependency) to get a local Postgres/Studio instance with that schema applied, then point `.env.local` at it. Any issue that needs an external API key assumes **your own** free-tier personal key for local development; production secrets (if this fork is ever deployed) are a separate concern configured by whoever owns that deployment.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase, geocoding, bot, and GITHUB_TOKEN/CRON_SECRET values
npx supabase start           # optional but recommended: local Postgres/Studio via Docker, migrations auto-applied
npm run dev
```

For local Supabase, `.env.local` only strictly needs the three Supabase keys `npx supabase start` prints plus `CRON_SECRET` (any string) to exercise the pipeline end-to-end.

## Dev environment

- Package manager: npm (see `package-lock.json`; do not switch to yarn/pnpm).
- Node/Next: Next.js 16 with Turbopack, React 19, TypeScript in strict mode (pinned `^5.9.3` — see "Dependency version constraints" below, don't bump to 6.x without checking `typescript-eslint`'s support first).
- Styling: Tailwind CSS v4 + shadcn/ui (Radix primitives, `class-variance-authority`, `tailwind-merge`).
- State: Zustand + React context (`contexts/filter-context.tsx`, `contexts/translation-context.tsx`). Any persisted Zustand store must avoid synchronous `localStorage` reads in initial state — use `persist({ skipHydration: true })` plus a post-mount `rehydrate()` call, per `lib/locale-store.ts`, to avoid SSR/client hydration mismatches.
- Database: Supabase (Postgres). `lib/supabase.ts` exports `supabase` (anon key) and `supabaseAdmin` (service role key, server-only). A direct `.select()` result currently resolves to TypeScript `never` in this project's client setup (a known, pre-existing rough edge, not something to "fix" globally) — cast to the relevant `Database[...]["Row"]` type instead; see `lib/services/promote-candidate.ts`'s doc comment for the full explanation.
- Testing: Vitest (`npm run test`), 150+ tests under `lib/**/__tests__/*.test.ts` (parsers, classifier, dedup, geo, search/discovery pipeline). Route handlers (`app/api/update/route.ts`, `app/api/hackathons/route.ts`) have no direct unit tests by convention — verify those live instead (see "Testing / verification instructions" below).
- Path alias: `@/*` → repo root.

## Commands

| Purpose                                     | Command                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev server                                  | `npm run dev`                                                                                                                                     |
| Production build (also runs format + knip)  | `npm run build`                                                                                                                                   |
| Start production server                     | `npm run start`                                                                                                                                   |
| Lint                                        | `npm run lint` (flat-config `eslint .`, not `next lint`)                                                                                          |
| Format                                      | `npm run format`                                                                                                                                  |
| Test suite                                  | `npm run test` (Vitest)                                                                                                                           |
| Dead code / unused deps                     | `npm run knip`                                                                                                                                    |
| Regenerate sitemap                          | `npm run sitemap`                                                                                                                                 |
| Regenerate theme constants                  | `npm run update-themes`                                                                                                                           |
| Re-run topic extractor over existing rows   | `npm run backfill-topics`                                                                                                                         |
| Manually trigger the update pipeline        | `npm run trigger-update` (add `-- --live` for a real run with notifications/README commit)                                                        |
| Manually run web-search candidate discovery | `npx tsx scripts/discover-web-candidates.ts` (`--max-queries=N`, `--results-per-query=N`; consumes real search-API quota, keep N low for testing) |
| Bump dependencies                           | `npm run update`                                                                                                                                  |
| Clean reinstall                             | `npm run reinstall`                                                                                                                               |

`npm run test` exists now — use it, don't assume there's no test suite. When running lint/knip/vitest from the repo root, scope to real source dirs if stray untracked directories exist locally (e.g. `.claude/worktrees/*`, `redesign/`) — e.g. `npx eslint app components contexts lib types scripts` — otherwise stale copies produce spurious failures; `knip.json` already excludes `.claude`/`redesign`.

## Code style

- TypeScript strict mode; avoid `any` and avoid loosening types to work around a type error — prefer a scoped `@ts-expect-error` with a comment when the Supabase-generated types genuinely don't match (this pattern already exists in `app/api/update/route.ts` for `update`/`insert` calls).
- Run `npm run format` (Prettier, with `prettier-plugin-tailwindcss` for class sorting) before finishing a change — don't hand-format.
- Keep new UI-facing strings synced across every file in `i18n/` (en, it, de, es, fr, nl, pl, pt, ro, sv) — don't add a key to only one locale.
- New scraping sources should extend `BaseParser` (`lib/parsers/base-parser.ts`), implement `discover()` per the `Provider`/`ProviderResult`/`ParseStatus` contract in `lib/providers/provider.interface.ts`, and return `ParsedHackathon[]`; wire them into `sourceResults` and the parse stage in `app/api/update/route.ts`. Report an honest `status` (`"ok"|"partial"|"failed"`) rather than masking partial failures as success.
- Add or update a Vitest test under the relevant `__tests__/` directory for any bugfix in `lib/classification`, `lib/dedup`, `lib/parsers`, `lib/european-countries.ts`, or `lib/services/fetch-all-rows.ts` — this fork has caught several real regressions this way (e.g. a classifier double-counting bug found via live Luma data, now a regression test).

### Dependency version constraints

`eslint-config-next` must track `next`'s minor exactly (currently `^16.3.3`); `eslint` is pinned `^9.39.5` and `typescript` is pinned `^5.9.3` — not the newer majors `npm outdated`/`update` may suggest — because `typescript-eslint@8.55.0`'s peer range doesn't support those yet. Verify `npm ls` shows zero "invalid" peer-dep warnings before bumping any of these three together.

## Architecture notes

- `app/api/update/route.ts` is the cron-triggered ingestion pipeline (reset flags → parse sources with per-source `status` → dedupe via URL normalization + fuzzy matching → geocode/enhance locations, keeping `"not_found"` results rather than dropping them → insert new rows and `update` changed existing rows → recompute statuses via the `update_hackathon_statuses` RPC → notify bots → regenerate and commit `README.md` via the GitHub API). Each stage catches its own errors and reports them independently in the JSON response (plus a top-level `degraded` flag) instead of throwing — preserve that pattern when touching this file. Auth is fail-closed: a missing `CRON_SECRET` returns 500, never a silent bypass.
- `app/api/hackathons/route.ts` is the public read-only API (`GET /api/hackathons?status=upcoming|past`) — keep it separate from the write-only `/api/update` endpoint (needs `Authorization: Bearer $CRON_SECRET`) and the dev-only `app/api/dev/trigger-update` endpoint (404s outside `NODE_ENV=development`, always forces test mode).
- Any query that might exceed 1000 rows must use `lib/services/fetch-all-rows.ts`'s `fetchAllRows<T>()` — PostgREST silently truncates past its default `max_rows`; several past bugs here came from a raw unpaginated `.select()`.
- Notification bots (`lib/bots/discord-bot.ts`, `telegram-bot.ts`, `twitter-bot.ts`) are invoked together via `Promise.allSettled` so one platform's failure doesn't block the others — keep new bots consistent with that contract (`notifyNewHackathons(hackathons)`).
- `lib/parsers/luma-parser.ts` is the reference parser: cursor pagination against `api.luma.com/discover/get-paginated-events`, an explicit non-European drop check via `classifyCountryCode()` in `lib/european-countries.ts` that must run first against only `geo.country_code` (before any regional/city fallback — reordering it after fallbacks reintroduces false-positive drops on things like US state abbreviations). Note `classifyCountryCode()` is designed for exactly-2-letter codes vs. free text — a source giving a full country name instead (e.g. Devfolio's `country: "Germany"`) needs its own explicit-name-drop handling, not this function directly (see `devfolio-parser.ts`'s doc comment for why).
- `types/database.ts` is hand-maintained (not Supabase-generated in this fork) — every schema migration in `supabase/migrations/*.sql` needs a matching manual update here.
- `/admin/candidates` is a real review queue backed by its own `hackathon_candidates` table (never auto-published into `hackathons`) — see `CLAUDE.md`'s "Web-search discovery and candidate review" section before touching anything under `app/admin/`, `lib/search/`, `lib/discovery/`, or `lib/services/{promote-candidate,submit-manual-candidate,require-admin-auth}.ts`.
- This repo currently has several small, focused feature branches all based on `feat/devfolio-provider` (not `main`) with open PRs against it — check `git log --oneline` / `gh pr list` before assuming `main` or any one branch has everything. If a branch is explicitly noted as frozen for external review, do not commit to it; branch off it instead (matches the pattern already used for `feat/eventbrite-provider`, `fix/parser-request-delays`, `fix/estimated-status-not-displayed`, `feat/admin-auth-and-ui`).

## Testing / verification instructions

Before considering a change complete:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run test` (Vitest)
4. `npm run build` (also runs `format` + `knip` via `prebuild`)
5. If you touched the update pipeline, exercise it locally rather than trusting a hosted cron run — use `npm run trigger-update`, the dev-only sidebar button, or:

```bash
curl -X POST http://localhost:3000/api/update \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "x-test-mode: true"
```

Test mode skips bot notifications and the README/GitHub commit, so it's safe to run repeatedly. On this fork, point it at your **own** Supabase project or local instance (see the "Fork ownership note" above) — not at the original repo owner's, which you don't have access to.

When verifying a fix — your own, a subagent's, or an external review tool's suggestion — prefer checking it against real code and, where feasible, a real local run (local Supabase + a live Luma fetch, or a real headless-browser check for UI/hydration issues) over accepting it on trust. This fork's history has several bugs that only surfaced this way (see `CLAUDE.md`'s "Working conventions" section for specifics).

## PR / commit guidance

- Do not commit `.env*` files or any Supabase/bot credentials.
- The README's hackathon tables (between the `<!-- UPCOMING_TABLE_START/END -->` and `<!-- PAST_TABLE_START/END -->` markers) are machine-generated by `ReadmeUpdater` — don't hand-edit that content; edit `lib/services/readme-updater.ts` if the format needs to change.
- Keep commit messages focused on a single logical change; this repo's automated commits use a `🔄 ... [Automated]` convention — human commits don't need to follow that pattern.
- `.github/workflows/update.yml` should run once a day (not 3-5x/day) against an `APP_URL` repository variable rather than a hardcoded URL. If it still shows the old schedule/hardcoded URL, note that pushing workflow-file changes needs `gh`/git auth with `workflow` OAuth scope, which may not be available — that edit may need to go through GitHub's web UI directly instead of a PR.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
