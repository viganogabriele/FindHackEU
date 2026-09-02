# AGENTS.md

Instructions for AI coding agents working in this repository. See `CLAUDE.md` for the fuller architecture reference — they should stay consistent; this file is the shorter, agent-facing summary.

## Project overview

FindHackEU is an independent Next.js 16 (App Router, TypeScript) app that aggregates European hackathons. It was originally inspired by HackTrack EU by Lorenzo Palaia, but is now developed independently, MIT-licensed. Maintained by Gabriele Viganò (info@viganogabriele.com). Data flows: external sources → parsers → dedup/geocoding → Supabase (Postgres) → public API / web UI. A moderated web-search discovery queue (`/admin`) supplements the automated scrapers. Discord/Telegram/Twitter notification bots exist in the codebase but are currently inactive/unconfigured.

## Discovery coverage & data quality roadmap

Coverage work — pagination, date windows, geographic filtering, multilingual classification, topic extraction, honest per-source status, deduplication, six provider parsers (Luma, Devfolio, MLH, ETHGlobal, Eventbrite, Devpost — LabLab is disabled, its old JSON endpoint no longer exists), and moderated web-search discovery — is largely implemented; verify current code and issue history before starting new coverage work.

- Tracking issue: [#2 (EPIC)](https://github.com/viganogabriele/FindHackEU/issues/2) — kept open as an index, not itself actionable.
- Before picking up any issue, read it in full and check it isn't already covered by a merged PR — this repo's issue history is long; re-deriving from scratch wastes effort.
- Not every "missing" hackathon is a bug: Luma events can be set `visibility: "private"` by their organizer, making them structurally invisible to the discovery API — check the event's own Luma page before filing a coverage-gap issue.

### Infrastructure ownership note (important for local testing)

FindHackEU owns its current Supabase/deployment configuration and does not depend on any earlier project's production infrastructure. The repo ships its own schema (`supabase/migrations/`), so local development is fully self-contained.

## Setup

```bash
git clone https://github.com/viganogabriele/FindHackEU.git && cd FindHackEU
npm install
cp .env.example .env.local   # fill in Supabase keys and CRON_SECRET at minimum
npx supabase start           # local Postgres/Studio via Docker; migrations + seed.sql auto-applied
npm run dev
```

`/admin` works locally with zero Google OAuth setup by default (see CLAUDE.md's "Admin auth" section for the exact bypass mechanics and its production-safety guarantee). For local Supabase, `.env.local` only strictly needs the three Supabase keys `npx supabase start` prints plus `CRON_SECRET` (any string) to exercise the pipeline end-to-end.

## Dev environment

- Package manager: npm (see `package-lock.json`; do not switch to yarn/pnpm).
- Node/Next: Next.js 16 with Turbopack, React 19, TypeScript in strict mode (pinned `^5.9.3` — see "Dependency version constraints" in CLAUDE.md, don't bump to 6.x without checking `typescript-eslint`'s support first).
- Styling: Tailwind CSS v4 + shadcn/ui (Radix primitives, `class-variance-authority`, `tailwind-merge`). Public-site badges/tags use theme-token-driven styling (`--chart-1..5`, etc.), not hardcoded per-category colors — follow the existing pattern in `components/hackathon-card.tsx` for any new categorical UI.
- State: Zustand + React context. Any persisted Zustand store backing SSR-visible state (locale, theme) must avoid synchronous `localStorage` reads in initial state — use `persist({ skipHydration: true })` plus a post-mount rehydrate call, per `lib/locale-store.ts`, to avoid SSR/client hydration mismatches.
- Database: Supabase (Postgres). `lib/supabase.ts` exports `supabase` (anon key) and `supabaseAdmin` (service role key, server-only). A direct `.select()` result currently resolves to TypeScript `never` in this project's client setup (a known, pre-existing rough edge) — cast to the relevant `Database[...]["Row"]` type instead.
- Testing: Vitest (`npm run test`), covering `lib/**/__tests__/*.test.ts` and select `app/**/__tests__/*`. Route handlers have no direct unit tests by convention — verify those live instead.
- Path alias: `@/*` → repo root.

## Commands

| Purpose                                    | Command                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| Dev server                                 | `npm run dev`                                            |
| Production build (also runs format + knip) | `npm run build`                                          |
| Start production server                    | `npm run start`                                          |
| Lint                                       | `npm run lint` (flat-config `eslint .`, not `next lint`) |
| Format                                     | `npm run format`                                         |
| Test suite                                 | `npm run test` (Vitest)                                  |
| Dead code / unused deps                    | `npm run knip`                                           |
| Regenerate sitemap                         | `npm run sitemap`                                        |

When running lint/knip/vitest from the repo root, scope them to real source directories if stray untracked dirs exist locally (e.g. `.worktrees/*`, `redesign/`) — otherwise stale copies produce spurious failures.

## Verification before considering a change done

`npx tsc --noEmit`, `npx eslint <touched dirs>`, `npx vitest run`, and `npm run build` should all be clean. For anything UI-facing (layout, hydration, z-index/stacking, dark mode), verify live in a real browser rather than reasoning from code alone — several real bugs in this repo's history looked plausible on paper but had a different actual root cause once tested (e.g. a map crash initially attributed to React Strict Mode turned out to be an unrelated `icon={undefined}` bug, only found by reproducing it live).

When verifying a fix — your own, a subagent's, or an external review tool's suggestion — prefer checking it against real code and, where feasible, a real local run (local Supabase + a live provider fetch, or a real browser check for UI/hydration issues) over accepting it on trust.

## PR / commit guidance

- Do not commit `.env*` files or any Supabase/bot credentials.
- `README.md` is a normal, hand-maintained project document — edit it directly like any other doc; the pipeline no longer auto-generates hackathon tables into it.
- Keep commit messages focused on a single logical change.
- `.github/workflows/update.yml` runs against the FindHackEU deployment's `APP_URL` repository variable rather than a hardcoded URL. Its current schedule is three runs on weekdays and two at weekends, not once a day — the unmerged `chore/cron-daily` branch is where reducing it to daily was started, if that is still wanted.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
