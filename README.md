# FindHackEU

FindHackEU is an independent, open-source directory of hackathons across Europe, maintained by Gabriele Viganò. It brings public event listings into one dependable place: a scheduled pipeline collects events from Luma, Devfolio, MLH, ETHGlobal, Eventbrite, and Devpost; normalizes them; removes duplicates; enriches location data; and publishes the approved results.

The project grew from a pipeline that surfaced only two hackathons at a time to one that now finds more than 100 events across Europe. That increase comes from broader provider coverage, pagination and geographic filtering, multilingual classification, source-aware deduplication, geocoding, and a moderated discovery queue—not from lowering the publication bar.

## What you can use

- The public website: search by text, date, topic, city/country, and radius; view results on a clustered map; and save browser-local bookmarks.
- The public read API: `GET /api/hackathons` exposes approved, non-archived events as JSON.
- Community discovery: submit a missing event; it enters a review queue and is never published automatically.

Notification bots remain in the codebase but are currently unconfigured and inactive.

## Run locally

Prerequisites: a current Node.js installation and [Docker](https://www.docker.com/) for local Supabase.

```bash
git clone https://github.com/viganogabriele/FindHackEU.git
cd FindHackEU
npm install
cp .env.example .env.local
npx supabase start
```

Copy the API URL, anon key, and service-role key printed by Supabase to `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Set `CRON_SECRET` to any local value, then start the app:

```bash
npm run dev
```

Supabase applies the repository migrations and seed data automatically. The local `/admin` dashboard needs no Google OAuth by default: leave `GOOGLE_CLIENT_ID` and `ADMIN_ALLOWED_EMAIL` unset. This bypass is disabled in production.

## Project map

- `app/` — App Router pages and API routes.
- `lib/parsers/` — provider-specific event discovery.
- `lib/dedup/` — URL normalization and fuzzy duplicate matching.
- `lib/discovery/` and `lib/search/` — moderated web-search discovery.
- `lib/services/` — ingestion, geocoding, persistence, and moderation.
- `supabase/migrations/` — database schema.

The ingestion stages report independently: a source failure does not prevent the remaining sources from completing. Search-derived records remain separate from the published dataset until a maintainer approves them.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run the Vitest suite. |
| `npx tsc --noEmit` | Type-check the project. |
| `npm run build` | Build for production. |
| `npm run trigger-update` | Run the ingestion pipeline locally. |

For architecture and environment details, see [CLAUDE.md](./CLAUDE.md), [AGENTS.md](./AGENTS.md), and [.env.example](./.env.example). The public product and API documentation lives at `/docs`.

## Origin and stewardship

FindHackEU acknowledges **HackTrack EU**, created by Lorenzo Palaia, as its starting inspiration. FindHackEU is now independently developed and operated, with its own architecture, infrastructure, roadmap, and maintainership. The work has focused on making European hackathon discovery substantially broader and more reliable.

Released under the [MIT License](./LICENSE). For bugs and proposals, use the [GitHub issue tracker](https://github.com/viganogabriele/FindHackEU/issues). For other enquiries, contact Gabriele at [info@viganogabriele.com](mailto:info@viganogabriele.com).
