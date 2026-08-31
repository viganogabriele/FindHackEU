# AGENTS.md

Instructions for AI coding agents working in this repository. See `CLAUDE.md` for Claude Code-specific guidance (they should stay consistent).

## Project overview

HackTrack EU is a Next.js 16 (App Router, TypeScript) app that aggregates European hackathons. Data flows: external sources → parsers → Supabase (Postgres) → public API / web UI, with a README table and Discord/Telegram/Twitter notifications regenerated on every update run. This is Gabriele Viganò's fork of Lorenzo Palaia's original project (MIT-licensed, see `LICENSE`), developed independently rather than aimed at an upstream merge.

## Discovery coverage & data quality roadmap

Phase 1 (make every hackathon already discoverable via Luma actually surface — pagination, time window, geographic coverage, classifier accuracy, topic extraction, honest per-source status, dedup) is **largely done**: PRs #39–#61 and #63–#64 are merged to `main`, covering pagination depth, configurable future-date window, explicit parser success/partial/failed status, geo/classifier fixes, URL-normalization + fuzzy-title dedup, a Vitest test suite, an update-existing-rows feature, two rounds of external code review (all findings verified against real code/live behavior before fixing), and a locale-hydration bugfix.

- Tracking issue: [#2 (EPIC) Improve hackathon discovery coverage and data quality](https://github.com/viganogabriele/HackTrack-EU/issues/2)
- Individual issues #3–#38, each labeled `P0`/`P1`/`P2`/`P3` (priority) and `good first issue`/`medium`/`hard` (difficulty), with explicit `Depends on` / `Blocks` links to each other.
- Remaining Phase 1/tooling follow-ups: issue #62 (public API cursor/limit pagination, filed as non-blocking), issue #27 (marked accessory/low-priority by the maintainer — don't pick this up unless asked).
- **Phase 2** (new free providers/web discovery) and DB-schema-dependent issues (#10–#12, #20, #21, #24, #32, #37) are still open and blocked on maintainer decisions about data sources, LabLab's fate, or schema changes — check with the maintainer before starting one of these.

Before picking up one of these issues, read it in full — it already contains the file/line context, proposed approach, cost tier (free / free-tier-with-limit / paid-requires-owner-decision), and acceptance criteria. Don't re-derive this from scratch, and check it isn't already covered by one of the merged PRs above.

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
- Database: Supabase (Postgres). `lib/supabase.ts` exports `supabase` (anon key) and `supabaseAdmin` (service role key, server-only).
- Testing: Vitest (`npm run test`), ~53 tests under `lib/**/__tests__/*.test.ts`.
- Path alias: `@/*` → repo root.

## Commands

| Purpose                                    | Command                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Dev server                                 | `npm run dev`                                                                              |
| Production build (also runs format + knip) | `npm run build`                                                                            |
| Start production server                    | `npm run start`                                                                            |
| Lint                                       | `npm run lint` (flat-config `eslint .`, not `next lint`)                                   |
| Format                                     | `npm run format`                                                                           |
| Test suite                                 | `npm run test` (Vitest)                                                                    |
| Dead code / unused deps                    | `npm run knip`                                                                             |
| Regenerate sitemap                         | `npm run sitemap`                                                                          |
| Regenerate theme constants                 | `npm run update-themes`                                                                    |
| Re-run topic extractor over existing rows  | `npm run backfill-topics`                                                                  |
| Manually trigger the update pipeline       | `npm run trigger-update` (add `-- --live` for a real run with notifications/README commit) |
| Bump dependencies                          | `npm run update`                                                                           |
| Clean reinstall                            | `npm run reinstall`                                                                        |

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
- `lib/parsers/luma-parser.ts` is the reference parser: cursor pagination against `api.luma.com/discover/get-paginated-events`, an explicit non-European drop check via `classifyCountryCode()` in `lib/european-countries.ts` that must run first against only `geo.country_code` (before any regional/city fallback — reordering it after fallbacks reintroduces false-positive drops on things like US state abbreviations).
- `types/database.ts` is Supabase-generated — do not hand-edit; regenerate it from the Supabase schema instead.

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
