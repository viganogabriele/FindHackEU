# Production deployment guide

This is a step-by-step guide for taking FindHackEU from "working locally
against `npx supabase start`" to "live on the internet", targeting the free
tiers of **Vercel** (hosting) and **Supabase** (database + auth). It is
written for the maintainer to execute manually — nothing in this repository
can create or configure a real Vercel/Supabase/Google Cloud account on your
behalf, and this doc does not attempt to.

It assumes you've already run the project locally per the root
[`README.md`](../README.md) and are familiar with the pipeline described in
[`CLAUDE.md`](../CLAUDE.md). For the Google OAuth specifics of admin sign-in,
this doc defers entirely to [`docs/admin-auth-setup.md`](./admin-auth-setup.md)
(see step 1.3 below) rather than duplicating it.

## Contents

1. [Create a production Supabase project](#1-create-a-production-supabase-project)
2. [Create a Vercel project](#2-create-a-vercel-project)
3. [Environment variables](#3-environment-variables)
4. [Wire up scheduled jobs (GitHub Actions)](#4-wire-up-scheduled-jobs-github-actions)
5. [Custom domain (optional)](#5-custom-domain-optional)
6. [Go-live checklist](#6-go-live-checklist)

---

## 1. Create a production Supabase project

1. **Create the project.** Sign in at [supabase.com](https://supabase.com),
   create a new project on the free tier, pick a region close to your
   expected users (e.g. an EU region, since this is a European hackathon
   site), and note the generated database password somewhere safe (a
   password manager, not this repo).

2. **Apply the schema.** This repo's schema lives entirely in
   `supabase/migrations/*.sql` (19 migration files as of this writing) —
   there is no separate "production schema" to hand-author. From your local
   machine, with the [Supabase CLI](https://supabase.com/docs/guides/cli)
   installed and logged in (`npx supabase login`):

   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   `db push` applies every migration under `supabase/migrations/` in order
   against the linked hosted project. Verify afterwards in the Supabase
   Studio **Table Editor** that `hackathons`, `hackathon_candidates`,
   `update_runs`, `geocode_cache`, and `admin_users` all exist. `seed.sql` is
   intentionally empty (see `CLAUDE.md`) — don't run it against production;
   real data comes from running the pipeline (step 6 below), not seed data.

3. **Set up Google OAuth for admin sign-in.** Follow
   [`docs/admin-auth-setup.md`](./admin-auth-setup.md) sections 1 and 4
   specifically for this: create the Google Cloud OAuth client (section 1),
   then, for the _hosted_ project you just created (section 4), configure
   Google as an auth provider in the Supabase Dashboard under
   **Authentication → Providers**, add

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   to the Google Cloud OAuth client's Authorized redirect URIs, and set the
   Supabase project's **Authentication → URL Configuration** Site URL plus
   an allowed redirect URL of

   ```
   https://<your-deployed-app-domain>/auth/callback
   ```

   (using whatever domain Vercel gives you in step 2, or your custom domain
   from step 5). Don't add a wildcard — this is the boundary Supabase itself
   enforces on where a completed sign-in may land.

   **Note:** the admin dashboard (`/admin`) **is reachable on your
   production deployment.** It used to also be gated by
   `NODE_ENV !== "production"`, which made it unreachable on Vercel; commit
   `6f06300` removed that so the dashboard can be used from the hosted
   deployment. The Google sign-in check in
   `lib/services/require-admin-auth.ts` is therefore the only thing
   protecting it, which makes this OAuth setup **required**, not optional,
   for a real deploy: without `ADMIN_ALLOWED_EMAIL` set (and no rows in
   `admin_users`) every admin page denies everyone, so you are locked out of
   your own moderation queue.

4. **Grab your keys.** From the Supabase Dashboard's **Settings → API**
   page, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (keep this one
     server-only — never expose it via `NEXT_PUBLIC_*` or client code)

## 2. Create a Vercel project

1. Sign in at [vercel.com](https://vercel.com) and import the GitHub
   repository (`viganogabriele/FindHackEU` or your fork) as a new project.
   The default Next.js build detection should pick up
   `npm run build`/`next build --turbopack` with no extra configuration.

2. **Review `vercel.json`'s function settings before your first deploy.**
   The repo currently configures:

   | Route                         | `maxDuration` | `memory` |
   | ----------------------------- | ------------- | -------- |
   | `app/api/update/route.ts`     | 300s          | 1024 MB  |
   | `app/api/hackathons/route.ts` | 30s           | 512 MB   |
   | `app/api/preview/route.ts`    | 15s           | 512 MB   |

   **This is a real, flagged concern, not a formality:** as of writing, the
   Vercel **Hobby** (free) plan's serverless function maximum execution
   duration is well under the `app/api/update` route's configured 300
   seconds — historically Hobby has capped function duration far lower than
   Pro's 300s ceiling. **Verify the exact current Hobby-tier maximum against
   Vercel's own published limits** (Vercel Dashboard → your project →
   Settings → Functions, and Vercel's pricing/limits documentation) before
   relying on the number in this doc, since these limits are a business
   decision Vercel changes over time and this document's knowledge of them
   is not guaranteed current. If Hobby's actual cap is below 300s, you have
   three options, roughly in order of preference:
   - Upgrade to the Vercel **Pro** plan (not free, but removes this
     constraint and is the straightforward fix if the project ever needs
     it).
   - Reduce `app/api/update`'s actual runtime so it fits under Hobby's real
     cap (e.g. reduce `LUMA_MAX_PAGES_PER_SLUG`, or otherwise trim the
     pipeline's work per invocation) and lower `maxDuration` in
     `vercel.json` to match — this is an application-code change, out of
     scope for this doc, and should be tracked as its own issue if needed.
   - Accept that a single `/api/update` invocation may be killed mid-run on
     Hobby; the route is written so a killed run just means the next cron
     tick retries (there's no partial-write corruption risk described in
     `CLAUDE.md`'s pipeline description — each stage is independently
     wrapped — but a killed run also never reaches the `update_runs`
     bookkeeping write or the notification/README-commit stages, so you'd
     silently get partial/no data that run). This is the "silently glossing
     over it" outcome the issue asked to avoid — don't pick this option
     without deliberately deciding to.

   Deploying with `vercel.json` as-is may simply fail at deploy time or at
   invocation time if the configured duration exceeds what your plan
   allows — check the Vercel deployment logs for a duration-related
   rejection if `/api/update` doesn't behave as expected after your first
   deploy.

3. **Set the environment variables** (full list and required/optional
   status in the next section) in the Vercel project's **Settings →
   Environment Variables**, scoped to "Production" (and "Preview"/
   "Development" too, if you want preview deployments to also talk to a
   real — ideally a _separate_ — Supabase project; using the same
   production Supabase project for Preview builds means preview traffic can
   write real data, which is usually not what you want).

4. Trigger the first deploy (push to the connected branch, or click "Deploy"
   in the Vercel dashboard).

## 3. Environment variables

Cross-checked against `.env.example` and `CLAUDE.md`'s "Environment
variables" section — this is the authoritative list as of this repo's
current state, not a reconstruction from memory.

### Required for a minimal production deploy

| Variable                        | Where to get it           | Notes                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Settings → API | Public, safe to expose to the browser.                                                                                                                                                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Public, safe to expose to the browser.                                                                                                                                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Supabase → Settings → API | **Server-only secret.** Used by API routes/scripts (`supabaseAdmin` client).                                                                                                                                               |
| `CRON_SECRET`                   | You choose this value     | Shared secret the `/api/update` route requires via `Authorization: Bearer`. Auth is fail-closed if unset — the route returns 500 rather than allowing an implicit bypass. Also needed as a GitHub Actions secret (step 4). |

The app will build and serve the public listing/API with just these four
set. Everything below is optional and degrades gracefully when absent —
each is independently gated in the code, not an all-or-nothing bundle.

### Optional — geocoding

| Variable                | Where to get it                                                            | Notes                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAPI_GEOCODING_KEY` | Your geocoding provider (see `lib/services/geocode.ts`/`geocode-cache.ts`) | Powers both pipeline-time coordinate enhancement and the public `/api/geocode` radius-filter proxy. Without it, new rows won't get geocoded (falls back to Nominatim per `CLAUDE.md`, but with reduced reliability/rate limits) and the radius filter has less to work with. Never expose via `NEXT_PUBLIC_*`. |

### Optional — discovery pipeline tuning

| Variable                      | Default if unset                                                      | Notes                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_FUTURE_DAYS`             | `180` (per `.env.example` comment / `lib/config/discovery-config.ts`) | How far into the future a discovered event may start before being excluded.                                                                 |
| `LUMA_MAX_PAGES_PER_SLUG`     | 5                                                                     | Luma pagination depth per category slug. Relevant to the Hobby-tier duration concern above — lowering this reduces `/api/update`'s runtime. |
| `MIN_UPDATE_INTERVAL_MINUTES` | 5                                                                     | Minimum cooldown between `/api/update` runs; `0` disables it. The daily cron fires hours apart and is unaffected in normal operation.       |

### Optional — web-search discovery (`scripts/discover-web-candidates.ts` only, not the main cron pipeline)

| Variable          | Where to get it                              | Notes                              |
| ----------------- | -------------------------------------------- | ---------------------------------- |
| `TAVILY_API_KEY`  | [tavily.com](https://tavily.com) free tier   | Tried first in the fallback chain. |
| `SERPAPI_API_KEY` | [serpapi.com](https://serpapi.com) free tier | Tried second.                      |
| `SERPER_API_KEY`  | [serper.dev](https://serper.dev) free tier   | Tried third.                       |

At least one of the three is needed only if you intend to run the
web-search candidate discovery script; none are required for the core
scraping pipeline or the public site.

| Variable                       | Default if unset                                                           | Notes                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCOVERY_DAILY_QUERY_BUDGET` | 30                                                                         | Daily cap on search queries `discover-web-candidates.ts` issues, tracked in a local `.discovery-budget.json` file (not Supabase) — irrelevant unless you run that script. |
| `GEMINI_API_KEY`               | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) free tier | Optional LLM-assisted suggestion badge on the admin Pending tab. Never auto-approves/rejects anything.                                                                    |

### Admin auth (`/admin` — reachable in production, see step 1.3)

| Variable               | Where to get it                                        | Notes                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Google Cloud OAuth client (`docs/admin-auth-setup.md`) | Required for a real deploy: `/admin` is reachable in production and sign-in is the only thing gating it.                                                                                                   |
| `GOOGLE_CLIENT_SECRET` | Same as above                                          | Same.                                                                                                                                                                                                      |
| `ADMIN_ALLOWED_EMAIL`  | Your own Google account email                          | Guaranteed-fallback admin; day-to-day admin list lives in the `admin_users` table instead once at least one admin can sign in. If unset and `admin_users` is empty/unreachable, admin pages deny everyone. |
| `ADMIN_LOCAL_NO_AUTH`  | You choose (`true`/unset)                              | Only ever honored when `NODE_ENV !== "production"` — `lib/services/require-admin-auth.ts` re-checks that inline, so it cannot affect the real Vercel deployment. Leave it unset there regardless.          |

### Optional — notification bots

| Variable                                                                                          | Where to get it                                  | Notes                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_WEBHOOK_URL`                                                                             | A Discord server's channel webhook settings      | Per `README.md`, bots are "currently unconfigured and inactive" for this project — only set these up if you want to (re-)enable notifications. |
| `TELEGRAM_BOT_TOKEN`                                                                              | [@BotFather](https://t.me/BotFather) on Telegram |                                                                                                                                                |
| `TELEGRAM_CHANNEL_ID`                                                                             | Your Telegram channel                            |                                                                                                                                                |
| `TWITTER_API_KEY` / `TWITTER_API_SECRET` / `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_TOKEN_SECRET` | Twitter/X Developer Portal                       | All four are needed together for the Twitter bot to function.                                                                                  |

Each bot fails independently (`Promise.allSettled`) — missing credentials
for one platform never block the others or the pipeline run.

### Optional — GitHub README auto-commit

| Variable       | Where to get it                                                                                                       | Notes                                                                                                                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GITHUB_TOKEN` | A GitHub [fine-grained personal access token](https://github.com/settings/tokens) with `contents: write` on this repo | Used by `ReadmeUpdater` to commit `README.md` changes straight to GitHub via the Octokit REST API when the pipeline changes data. Without it, that stage will fail (non-fatally — see the pipeline's per-stage error wrapping) and `README.md` simply won't auto-update. |

### Optional — error tracking

| Variable                 | Where to get it                                           | Notes                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SENTRY_DSN`             | [sentry.io](https://sentry.io) free tier, server/edge DSN | Sentry is fully disabled (no-op) when absent. Error capture only — no session replay, analytics, performance tracing, or default PII, per `CLAUDE.md`. |
| `NEXT_PUBLIC_SENTRY_DSN` | Same Sentry project, browser DSN                          | Public by design (client-side error capture).                                                                                                          |

---

## 4. Wire up scheduled jobs (GitHub Actions)

Two workflows in `.github/workflows/` are meant to run against your live
deployment, not localhost:

1. **`update.yml`** — triggers the daily ingestion pipeline
   (`POST /api/update`). It needs a repository **secret** named
   `CRON_SECRET` (Settings → Secrets and variables → Actions → New
   repository secret) matching the value you set in Vercel.

   **Flag before you rely on this:** as checked in this repo's current
   state, `update.yml` calls a **hardcoded URL**
   (`https://hacktrack-eu.vercel.app/api/update`), not the `APP_URL`
   repository variable that `CLAUDE.md` describes it as using and that
   `uptime.yml` (below) actually does use. If you're deploying to a
   _different_ Vercel domain (a fork, a renamed project, or before a custom
   domain is attached), **you must edit the hardcoded URL in
   `.github/workflows/update.yml` to your real deployment URL** — the
   workflow will otherwise silently keep hitting the old project's domain
   and never trigger your pipeline. Consider switching it to read
   `${{ vars.APP_URL }}` (like `uptime.yml` does) as part of your setup, so
   both workflows share one source of truth — that's an application/infra
   change you'd be making yourself, not something this doc changes for you.

2. **`uptime.yml`** — pings `/api/health` every 15 minutes. It reads the
   **repository variable** `APP_URL` (Settings → Secrets and variables →
   Actions → Variables tab, not Secrets — it's not sensitive). Set it to
   your deployment's base URL, e.g. `https://your-app.vercel.app` (no
   trailing slash needed — the workflow strips one if present).

Both workflows also support manual triggering (`workflow_dispatch`) from the
GitHub Actions tab, which is the fastest way to test each one once secrets/
variables are set, without waiting for the schedule.

## 5. Custom domain (optional)

If you want a custom domain instead of the default `*.vercel.app` URL:

1. Add the domain under the Vercel project's **Settings → Domains** and
   follow Vercel's DNS instructions (either delegate the domain's
   nameservers to Vercel, or add the specific A/CNAME records it shows you).
2. Once the domain is live, update the `APP_URL` GitHub Actions repository
   variable (step 4) to point at the new domain. The workflows read that
   variable and have no hardcoded URL of their own.
3. Update the Supabase **Authentication → URL Configuration** allowed
   redirect URL (step 1.3) to the new domain's `/auth/callback` path -
   admin sign-in on the deployment breaks until you do.

This is entirely optional and can be done at any point after the initial
deploy — treat it as a follow-up, not a blocker to going live.

## 6. Go-live checklist

After your first production deploy, verify each of these before considering
the deployment done:

- [ ] **Site loads.** Visit the deployed URL; the public listing renders
      with data (or an empty state, if `/api/update` hasn't run yet).
- [ ] **`/api/health` responds.** `curl https://<your-domain>/api/health`
      returns `{"status":"ok"}` with a 200. This is the same check
      `uptime.yml` runs every 15 minutes.
- [ ] **`/api/hackathons` responds.**
      `curl https://<your-domain>/api/hackathons?status=upcoming` returns a
      JSON array (possibly empty pre-first-run).
- [ ] **Manually trigger `/api/update` once** to populate real data and
      confirm the pipeline works end-to-end against the hosted Supabase
      project:
      `bash
  curl -X POST https://<your-domain>/api/update \
    -H "Authorization: Bearer $CRON_SECRET"
  `
      Check the JSON response body for per-source `status`, `insertedCount`,
      any `updateErrors`, and the top-level `degraded` flag — per
      `CLAUDE.md`, the route always returns a detailed diagnostic body
      rather than throwing, so a 200 alone doesn't mean every source
      succeeded.
- [ ] **Confirm this didn't exceed your Vercel plan's function duration.**
      Check the Vercel dashboard's function logs for this invocation — this
      is the practical test for the Hobby-tier `maxDuration` concern flagged
      in step 2.
- [ ] **The `update_runs` table has a row** for the run above, with
      `status: 'success'` (Supabase Studio → Table Editor, or SQL).
- [ ] **Cron actually fires.** After `update.yml` is wired up (step 4),
      either wait for its next scheduled run or trigger it manually via
      `workflow_dispatch` from the Actions tab, and confirm it hits your
      real deployment (check the workflow's logs for the URL it called and
      the HTTP status it got back) rather than the old hardcoded domain.
- [ ] **Uptime check passes.** After `uptime.yml`'s `APP_URL` variable is
      set, trigger it manually once and confirm it succeeds against your
      domain.
- [ ] **Admin sign-in works.** `/admin` is reachable on the deployment
      (step 1.3), so this is a go-live blocker, not an optional extra:
      visit `https://<your-domain>/admin`, confirm you get the sign-in gate
      rather than the dashboard while signed out, then sign in with your
      `ADMIN_ALLOWED_EMAIL` account and confirm you land on the dashboard.
      Also confirm a _different_ Google account is refused. It genuinely
      needs a real human with real Google credentials to confirm once.
- [ ] **README auto-commit works, if `GITHUB_TOKEN` is set.** After a run
      that changes data, confirm a commit landed on the repo from the
      configured token's identity.
- [ ] **Notification bots, if configured.** After a run that inserts new
      hackathons, confirm the configured Discord/Telegram/Twitter channels
      received a notification.
- [ ] **Sentry, if configured.** Trigger a deliberate error (or wait for a
      real one) and confirm it shows up in the Sentry project dashboard.
