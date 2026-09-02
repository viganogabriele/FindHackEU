![Hackathon Logo](https://user-images.githubusercontent.com/36594527/117592199-10730800-b17b-11eb-84f8-4ffcae8116d4.png)

# FindHackEU

FindHackEU aggregates hackathons happening across Europe into one place. A daily pipeline scrapes six live sources — [Luma](https://luma.com), [Devfolio](https://devfolio.co), [MLH](https://mlh.io), [ETHGlobal](https://ethglobal.com), [Eventbrite](https://www.eventbrite.com), and [Devpost](https://devpost.com) — deduplicates and geocodes the results, and stores them in Supabase. A moderated web-search discovery queue supplements the automated scrapers by surfacing candidate events for a human to review and approve before they go public.

The data is exposed through:

- A filterable **web UI** with a map view, radius search, bookmarks, and multilingual (10-locale) support.
- A small **public read API** (`GET /api/hackathons`).
- **Discord/Telegram/X (Twitter)** bots that can announce newly discovered hackathons — not currently active/configured, but the notification pipeline is in place and can be turned back on.

## Running it locally

You'll need [Docker](https://www.docker.com/) (for the local Supabase stack) and Node.js.

```bash
git clone https://github.com/viganogabriele/FindHackEU.git
cd FindHackEU
npm install
cp .env.example .env.local
npx supabase start   # boots local Postgres/Studio via Docker; prints anon/service-role keys
```

Copy the printed `anon key` / `service_role key` (and API URL) into `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Set `CRON_SECRET` to any string of your choosing. That's enough to run the app:

```bash
npm run dev
```

`npx supabase start` automatically applies the schema migrations and seeds the local database with realistic sample data — a mix of upcoming/past hackathons and pending/rejected candidates — so the site and the admin dashboard have something to show immediately.

Speaking of which: **the admin dashboard (`/admin`, `/admin/candidates`) works locally with zero Google OAuth setup.** As long as `GOOGLE_CLIENT_ID`/`ADMIN_ALLOWED_EMAIL` are left unset in `.env.local`, a local no-auth bypass grants access automatically — no OAuth client to create just to poke around.

Everything else — real provider API keys for the scrapers, bot webhook tokens, a geocoding key, real Google OAuth for production-like admin auth testing, and so on — is optional for local exploration and documented in `.env.example`. For the full architecture, pipeline internals, and development conventions, see [`CLAUDE.md`](./CLAUDE.md) and [`AGENTS.md`](./AGENTS.md).

## History

FindHackEU was originally inspired by and born from **HackTrack EU** by Lorenzo Palaia. It has since become an independent project — its own architecture, infrastructure, issue tracker, and development direction — released under the [MIT License](./LICENSE).

The rewrite was driven largely by discovery coverage. The original project's scraping pipeline was finding only a couple of hackathons at a time, well short of what was actually happening across Europe. FindHackEU's current pipeline — six live sources (Luma, Devfolio, MLH, ETHGlobal, Eventbrite, Devpost), URL/fuzzy deduplication, and geocoding — surfaces around 90 hackathons at once, with 30+ more sitting in a moderated web-search discovery queue awaiting manual review before publication.

## Maintainer

Maintained by Gabriele Viganò ([info@viganogabriele.com](mailto:info@viganogabriele.com)). Issues and pull requests are welcome on [GitHub](https://github.com/viganogabriele/FindHackEU).
