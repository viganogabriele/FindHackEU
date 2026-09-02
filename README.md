# FindHackEU

FindHackEU is an independent, open-source directory of hackathons across Europe. It collects events from six live sources—[Luma](https://lu.ma), [Devfolio](https://devfolio.co), [MLH](https://mlh.io), [ETHGlobal](https://ethglobal.com), [Eventbrite](https://www.eventbrite.com), and [Devpost](https://devpost.com)—then normalizes, deduplicates, geocodes, and publishes the results.

The public site provides a filterable listing with map, bookmarks, location-radius search, and a small read-only API. A separate web-search workflow identifies additional possible events; those records enter a moderated review queue and are never published automatically.

## What it includes

- A Next.js web interface for browsing upcoming and past hackathons by text, date, topic, location, and radius.
- An interactive map with clustered markers and country-level fallbacks when precise coordinates are unavailable.
- Browser-local bookmarks, with no account required.
- `GET /api/hackathons`, a public read API for the published dataset.
- A scheduled ingestion pipeline that records per-source outcomes, removes URL and fuzzy duplicates, and enriches location data.
- A moderated candidate queue for web-search discoveries and public submissions.

## Local development

Prerequisites: a current Node.js installation and [Docker](https://www.docker.com/) for the local Supabase stack.

```bash
git clone https://github.com/viganogabriele/FindHackEU.git
cd FindHackEU
npm install
cp .env.example .env.local
npx supabase start
npm run dev
```

`npx supabase start` starts local Postgres and Supabase Studio, applies the repository migrations, and prints the API URL, anon key, and service-role key. Copy those values to `.env.local` as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; set `CRON_SECRET` to any local value. Those settings are sufficient to run the application locally. Other variables in `.env.example` are needed only for the integrations they enable, such as geocoding, provider search, notifications, or production-like authentication.

The development-only admin dashboard is available at `/admin`. No Google OAuth setup is required for a default local installation: leaving `GOOGLE_CLIENT_ID` and `ADMIN_ALLOWED_EMAIL` unset enables the local no-auth bypass. That bypass is hard-disabled in production.

## Project structure

- `app/` — App Router pages and API routes.
- `lib/parsers/` — source-specific discovery parsers.
- `lib/dedup/` — URL normalization and fuzzy duplicate matching.
- `lib/discovery/` and `lib/search/` — web-search candidate discovery and evidence extraction.
- `lib/services/` — ingestion, geocoding, moderation, and database services.
- `supabase/migrations/` — local and deployed database schema migrations.

The main update route keeps provider discovery, deduplication, location enrichment, persistence, and optional notifications as separately reported stages. Search-derived candidates remain isolated from the published `hackathons` dataset until an administrator approves them.

## Useful commands

| Command                  | Purpose                                               |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Start the local development server.                   |
| `npm run lint`           | Run ESLint.                                           |
| `npm run test`           | Run the Vitest suite.                                 |
| `npx tsc --noEmit`       | Type-check the project.                               |
| `npm run build`          | Create a production build.                            |
| `npm run trigger-update` | Run the ingestion pipeline using local configuration. |

For detailed development conventions, pipeline behavior, and environment configuration, see [CLAUDE.md](./CLAUDE.md), [AGENTS.md](./AGENTS.md), and [.env.example](./.env.example).

## History and license

FindHackEU was originally inspired by and forked from HackTrack EU by Lorenzo Palaia. It is now an independent project with its own architecture, infrastructure, and development direction.

FindHackEU is released under the [MIT License](./LICENSE).

## Maintainer

Gabriele Viganò — [info@viganogabriele.com](mailto:info@viganogabriele.com)

For bugs and proposed improvements, please use the [issue tracker](https://github.com/viganogabriele/FindHackEU/issues).
