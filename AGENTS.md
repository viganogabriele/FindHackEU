# AGENTS.md

Instructions for AI coding agents working in this repository. See `CLAUDE.md` for Claude Code-specific guidance (they should stay consistent).

## Project overview

HackTrack EU is a Next.js 16 (App Router, TypeScript) app that aggregates European hackathons. Data flows: external sources → parsers → Supabase (Postgres) → public API / web UI, with a README table and Discord/Telegram/Twitter notifications regenerated on every update run.

## Discovery coverage & data quality roadmap

This fork's current priority is fixing hackathon discovery coverage before adding new features. The full breakdown lives in GitHub issues, not in a repo file:

- Tracking issue: [#2 (EPIC) Improve hackathon discovery coverage and data quality](https://github.com/viganogabriele/HackTrack-EU/issues/2)
- Individual issues #3–#38, each labeled `P0`/`P1`/`P2`/`P3` (priority) and `good first issue`/`medium`/`hard` (difficulty), with explicit `Depends on` / `Blocks` links to each other.
- Work order: **Phase 1** — make every hackathon already on Luma actually surface (pagination, time window, geographic coverage, classifier, topic extraction) — **before** **Phase 2** — add new free providers/web discovery. **Phase 3** (data quality, reliability, tooling) can run in parallel with either.

Before picking up one of these issues, read it in full — it already contains the file/line context, proposed approach, cost tier (free / free-tier-with-limit / paid-requires-owner-decision), and acceptance criteria. Don't re-derive this from scratch.

### Fork ownership note (important for local testing)

This is a fork; the original repo owner's Supabase project, Vercel deployment, and API keys are **not accessible from here** and are out of scope. Any issue that touches the database assumes a schema versioned in this fork's own migrations (see the P1-10/P2-09 issues), applied to **your own** Supabase project or local instance — never the original owner's. Any issue that needs an external API key assumes **your own** free-tier personal key for local development; production secrets (if this fork is ever deployed) are a separate concern configured by whoever owns that deployment.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase, geocoding, bot, and GITHUB_TOKEN/CRON_SECRET values
npm run dev
```

## Dev environment

- Package manager: npm (see `package-lock.json`; do not switch to yarn/pnpm).
- Node/Next: Next.js 16 with Turbopack, React 19, TypeScript 6 in strict mode.
- Styling: Tailwind CSS v4 + shadcn/ui (Radix primitives, `class-variance-authority`, `tailwind-merge`).
- State: Zustand + React context (`contexts/filter-context.tsx`, `contexts/translation-context.tsx`).
- Database: Supabase (Postgres). `lib/supabase.ts` exports `supabase` (anon key) and `supabaseAdmin` (service role key, server-only).
- Path alias: `@/*` → repo root.

## Commands

| Purpose | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build (also runs format + knip) | `npm run build` |
| Start production server | `npm run start` |
| Lint | `npm run lint` |
| Format | `npm run format` |
| Dead code / unused deps | `npm run knip` |
| Regenerate sitemap | `npm run sitemap` |
| Regenerate theme constants | `npm run update-themes` |
| Bump dependencies | `npm run update` |
| Clean reinstall | `npm run reinstall` |

**There is no test suite in this repo** (no Jest/Vitest/Playwright configured). Do not invent or run `npm test`. Validate changes with `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

## Code style

- TypeScript strict mode; avoid `any` and avoid loosening types to work around a type error — prefer a scoped `@ts-expect-error` with a comment when the Supabase-generated types genuinely don't match (this pattern already exists in `app/api/update/route.ts` for `update`/`insert` calls).
- Run `npm run format` (Prettier, with `prettier-plugin-tailwindcss` for class sorting) before finishing a change — don't hand-format.
- Keep new UI-facing strings synced across every file in `i18n/` (en, it, de, es, fr, nl, pl, pt, ro, sv) — don't add a key to only one locale.
- New scraping sources should extend `BaseParser` (`lib/parsers/base-parser.ts`) and return `ParsedHackathon[]`; wire them into `sourceResults` and the parse stage in `app/api/update/route.ts`.

## Architecture notes

- `app/api/update/route.ts` is the cron-triggered ingestion pipeline (reset flags → parse sources → dedupe → geocode/enhance locations → insert new rows → recompute statuses via the `update_hackathon_statuses` RPC → notify bots → regenerate and commit `README.md` via the GitHub API). Each stage catches its own errors and reports them independently in the JSON response instead of throwing — preserve that pattern when touching this file.
- `app/api/hackathons/route.ts` is the public read-only API (`GET /api/hackathons?status=upcoming|past`) — keep it separate from the write-only `/api/update` endpoint, which requires `Authorization: Bearer $CRON_SECRET`.
- Notification bots (`lib/bots/discord-bot.ts`, `telegram-bot.ts`, `twitter-bot.ts`) are invoked together via `Promise.allSettled` so one platform's failure doesn't block the others — keep new bots consistent with that contract (`notifyNewHackathons(hackathons)`).
- `types/database.ts` is Supabase-generated — do not hand-edit; regenerate it from the Supabase schema instead.

## Testing / verification instructions

Before considering a change complete:
1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm run build` (also runs `format` + `knip` via `prebuild`)
4. If you touched the update pipeline, exercise it locally with `x-test-mode: true` (see below) rather than trusting a hosted cron run.

```bash
curl -X POST http://localhost:3000/api/update \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "x-test-mode: true"
```

Test mode skips bot notifications and the README/GitHub commit, so it's safe to run repeatedly. On this fork, point it at your **own** Supabase project or local instance (see the "Fork ownership note" above) — not at the original repo owner's, which you don't have access to.

## PR / commit guidance

- Do not commit `.env*` files or any Supabase/bot credentials.
- The README's hackathon tables (between the `<!-- UPCOMING_TABLE_START/END -->` and `<!-- PAST_TABLE_START/END -->` markers) are machine-generated by `ReadmeUpdater` — don't hand-edit that content; edit `lib/services/readme-updater.ts` if the format needs to change.
- Keep commit messages focused on a single logical change; this repo's automated commits use a `🔄 ... [Automated]` convention — human commits don't need to follow that pattern.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
