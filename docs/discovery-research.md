# Hackathon discovery research

**Status:** research baseline for this fork  
**Checked:** 2026-09-01  
**Scope:** public GitHub implementations, first-party provider documentation, provider terms/robots files, and live read-only probes.

## Executive decision

The premise that Luma is the only source that can be searched without paying for an API is only partly true.

There is a useful, mostly or entirely free path for HackTrack EU, but it is not a universal “search the whole web” scraper. The practical design is a layered provider pipeline:

1. Use public, structured feeds where they exist: MLH, Devfolio, Unstop, HackerEarth, ETHGlobal, and selected public aggregators.
2. Keep each source behind its own adapter, date/location validation, pagination cap, deduplication, and honest `ok`/`partial`/`failed` status.
3. Add web discovery only for an allowlist of organizer/index domains, using public pages, sitemaps, and JSON-LD `Event` data.
4. Add a moderated “submit an event URL” path for events that are not listed in any directory.
5. Keep Luma as a high-value best-effort source, but distinguish its current internal Discover endpoint from Luma’s official paid API.

This can avoid paid aggregator APIs and paid search APIs. It cannot guarantee complete coverage, permission to copy every site, or zero maintenance cost.

## What this fork currently does

The current provider contract is already a good foundation: [`ProviderResult`](../lib/providers/provider.interface.ts) records normalized events, count, errors, and an explicit `ParseStatus`. The update route runs providers independently and exposes per-source health in [`app/api/update/route.ts`](../app/api/update/route.ts).

The enabled Luma parser is in [`lib/parsers/luma-parser.ts`](../lib/parsers/luma-parser.ts). It currently uses the unauthenticated internal endpoint `api.luma.com/discover/get-paginated-events`, searches the `tech`, `ai`, and `crypto` categories, paginates with a bounded cursor loop, filters Europe, and deduplicates results. LabLab is currently disabled in the provider list.

Important distinction:

- Luma’s official API is `public-api.luma.com`, requires an `x-luma-api-key`, and requires Luma Plus.
- The endpoint used by this fork is an internal web/Discover endpoint. It is technically reachable without a key today, but it is not the documented public API. Luma’s terms require use of publicly supported interfaces.

Therefore the current Luma route should be treated as a monitored, best-effort dependency—not as a guaranteed free API or a permission to bypass controls. Luma also says that private and online events do not appear in Search/Discover, so some coverage gaps are structural rather than parser bugs.

## Patterns found in other GitHub repositories

These projects show what people are actually doing in public implementations. They are useful design evidence, not guarantees that every endpoint is officially supported.

| Repository                                                                                    | Observed approach                                                                                                                                                                | Useful lesson for HackTrack EU                                                                                  | Main caveat                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`omkhalane/eventio`](https://github.com/omkhalane/eventio)                                   | TypeScript monorepo with separate scraper modules, Playwright for rendered pages, public JSON where available, normalization/deduplication, workers, Redis, and Postgres/Drizzle | A source adapter boundary plus a worker/orchestrator scales better than one large scraper                       | More infrastructure than this fork needs; Redis/Postgres/Playwright add operational cost                                                    |
| [`ahemsaxena07/Hackmap`](https://github.com/ahemsaxena07/Hackmap)                             | Devpost RSS, AllHackathons HTML, and `dev.events` JSON-LD; a free external cron calls a refresh endpoint; KV or memory fallback                                                  | Public feeds, JSON-LD, and a simple scheduled refresh can produce a useful directory without a paid aggregator  | Seed data and unverified estimates require a stricter quality gate than this project currently wants                                        |
| [`Adwaitbytes/hackathon-launchboard`](https://github.com/Adwaitbytes/hackathon-launchboard)   | Direct Devpost JSON, Devfolio JSON, and MLH season-page embedded JSON; adapters run in parallel and return source statuses; hourly ISR cache                                     | This is the closest small implementation pattern for adding MLH and Devfolio as independent providers           | Devpost’s technical accessibility conflicts with its current terms for automated scraping                                                   |
| [`fexx301/hacklist`](https://github.com/fexx301/hacklist)                                     | Adapters for Devpost, Devfolio, MLH, Unstop, HackerEarth, DoraHacks, Kaggle, and optional X; concurrent fetches, SQLite upsert, stale pruning, and per-source logs               | Source health, concurrency limits, and optional credential-gated providers should be first-class                | Some sources are noisy or fragile; Kaggle and X need credentials; LabLab is omitted because of source reliability concerns                  |
| [`JaiAnshSB26/hackathon_Scraper`](https://github.com/JaiAnshSB26/hackathon_Scraper)           | Selenium/BeautifulSoup fetches several sites, writes JSON, then a daily GitHub Actions job builds and deploys a static GitHub Pages site                                         | GitHub Actions → generated JSON/Markdown → GitHub Pages is a genuinely free publication model                   | Browser selectors, string deduplication, and older scraping code are brittle; use the deployment pattern, not the parser quality            |
| [`AhmedNassar7/tracker`](https://github.com/AhmedNassar7/tracker)                             | No server or database: hourly GitHub Actions fetch public APIs/repos, normalizes data, writes JSON/Markdown, opens and auto-merges a PR, and publishes the repository itself     | A public repo can be both the scheduled job and the product; this is the clearest zero-server pattern           | Hourly execution and auto-merging need rate-limit, change-volume, and failure controls; a database-backed UI still needs a separate runtime |
| [`ChaitanyaGidwani/opportunity-radar`](https://github.com/ChaitanyaGidwani/opportunity-radar) | Many source adapters with a source table, cache, deduplication, `Promise.allSettled`, and explicit “free/public”, “keyed”, and “amber” source categories                         | Record source confidence and health instead of presenting every source as equally authoritative                 | Its broader discovery set mixes curated/seeded data and optional paid sources; it should not be copied wholesale                            |
| [`0xarchit/hackathon-api`](https://github.com/0xarchit/hackathon-api)                         | Go fetchers use public Devpost, Devfolio, Unstop, MLH, HackerEarth, and other endpoints with concurrency and an in-memory cache                                                  | Several additional platforms expose useful public surfaces without a commercial aggregator                      | Title-only deduplication, stale dates, and India-centric assumptions are unsafe for this fork                                               |
| [`crafter-station/hack0`](https://github.com/crafter-station/hack0)                           | Luma calendar sync through the official paid API, Devpost import with manual curation, optional Firecrawl/Exa/Perplexity discovery, and a community-oriented approval workflow   | Manual review and organizer/community submissions are a realistic way to cover events that no directory exposes | Its richer discovery stack is not a free baseline; use the approval/provenance idea without inheriting paid dependencies                    |
| [`Jay0xx/hack-finder`](https://github.com/Jay0xx/hack-finder)                                 | Searches X through a local authenticated session/cookie and optionally uses an LLM to structure results                                                                          | Social announcements can be a manual research input                                                             | Not suitable for unattended server ingestion: account cookies, breakage, rate limits, and platform-policy risk                              |

The common pattern is not a magic source. It is disciplined composition: many imperfect sources, a common schema, source-level failures, validation, deduplication, and a publication step that can continue when one source breaks.

## Source feasibility for this fork

“Public” below means that a read-only request worked or the page is openly available. It does not, by itself, grant permission to automate collection or republish content. `robots.txt` is an operational signal, not a license.

| Source                         | Public surface observed                                                                                                                                                | Cost/authentication                                                                                                                                    | EU coverage and quality                                                                                                           | Decision                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Luma                           | Current fork uses the internal cursor endpoint; official API is documented separately                                                                                  | Current endpoint is keyless; official API requires Luma Plus and a calendar API key                                                                    | Strong for public, discoverable tech/AI/crypto events; private and online events are structurally missing from Discover           | Keep as best effort; low rate, health monitoring, no anti-bot bypass, and consider requesting an approved read-only arrangement    |
| MLH                            | Public season pages such as `https://mlh.io/seasons/2026/events` redirect to the public MLH site and contain structured embedded event data                            | No key observed for the season page; it is the official member-event directory                                                                         | High signal for official MLH member events; not every independent European event is an MLH event                                  | **Implement first** with current and next season, date validation, and a bounded page/season set                                   |
| Devfolio                       | `https://api.devfolio.co/api/hackathons` returned JSON without a key in a live probe; the public listing is documented as the hackathon directory                      | No key observed, but the JSON endpoint is not documented as a public developer API                                                                     | Excellent Web3/student signal; likely India-heavy and endpoint shape may change                                                   | **Implement early** as an explicitly “undocumented public endpoint” provider with caps and health status                           |
| Unstop                         | `https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons...` returned paginated JSON; Unstop’s robots file allows `/api/public/*`               | No key observed                                                                                                                                        | Broad but India-heavy; dates/statuses need independent validation                                                                 | **Implement after geo policy is explicit**; keep only credible European/online rows and mark source quality                        |
| HackerEarth                    | `https://www.hackerearth.com/api/community/challenges/compete/` returned JSON without a key                                                                            | No key observed                                                                                                                                        | Potentially useful, but a live `status=UPCOMING` response included an old 2019 event, so the status field cannot be trusted alone | Optional adapter behind strict date/type validation and partial/failure reporting                                                  |
| ETHGlobal                      | Public events page `https://ethglobal.com/events` returned server-rendered event content and data suitable for HTML/JSON-LD extraction                                 | No key observed; no public listing API was found                                                                                                       | High hackathon relevance, especially Web3; global rather than EU-only                                                             | **Implement early** with a small HTML/JSON-LD adapter and Europe/date filters                                                      |
| AllHackathons and `dev.events` | Public HTML/JSON-LD pages; both are used by existing aggregators                                                                                                       | No key observed                                                                                                                                        | Useful breadth, but they are secondary aggregators and may duplicate or stale-link primary listings                               | Optional discovery layer; preserve canonical/source URLs and never treat them as authoritative by default                          |
| Kaggle                         | Official competitions API and competition documentation                                                                                                                | Free account/API token; not a paid aggregator API                                                                                                      | Useful for ML competitions and some hackathons, not general event discovery                                                       | Optional, credential-gated provider; do not make a token a baseline requirement                                                    |
| Devpost                        | Public JSON endpoint technically returned data with browser-like headers; several repositories use it                                                                  | No key observed, but Devpost’s current terms explicitly prohibit automated software/scripts/robots from scraping, crawling, or spidering the site/data | Very broad hackathon coverage                                                                                                     | **Do not automate in this fork without written permission or an approved feed**. Technical reachability is not authorization       |
| X/Twitter                      | Search can be driven through a logged-in local session in some projects                                                                                                | No paid API required for that approach, but it needs a user account/cookies                                                                            | Fast announcements, high noise, difficult verification                                                                            | Manual research only unless policy and account ownership are deliberately accepted                                                 |
| Google web search              | Google Custom Search JSON API exists as documentation, but is closed to new customers; the old allowance is limited and paid beyond it                                 | Not a new free full-web API                                                                                                                            | Broadest theoretical coverage, but search results are unstable and extraction is noisy                                            | Do not make it the pipeline core; use manual search or a domain allowlist instead                                                  |
| Eventbrite                     | Official Event Search API is deprecated; public country directory pages expose rendered cards plus a `window.__SERVER_DATA__` payload with pagination and event fields | No key observed; the directory surface is undocumented and distinct from the retired Search API                                                        | Useful breadth but the `hackathon` category is noisy; dates/timezones and tracking URLs need normalization                        | **Implement as bounded best effort** with local-time conversion, URL cleanup, and `partial` status on truncated or malformed pages |
| Ticketmaster                   | Official Discovery API                                                                                                                                                 | Requires an API key; free quota is limited and events are not hackathon-focused                                                                        | Useful only as a broad event fallback                                                                                             | Low priority; not a replacement for hackathon directories                                                                          |

### Live probe notes

The following read-only checks were made on 2026-09-01. They are snapshots, not contracts:

- Devpost’s JSON listing returned HTTP 200 and structured event records when requested with the same class of headers used by its public web client; its terms still block automated collection.
- Devfolio returned structured JSON for `application_open`, `upcoming`, `live`, and `all` filters.
- MLH’s 2026 season page returned HTML with an embedded application-data script containing event records.
- Unstop’s public endpoint returned pagination metadata and event fields such as title, URL, dates, region, and location.
- HackerEarth returned data, but its “upcoming” response contained a clearly historical event; every result needs its own date check.
- ETHGlobal’s public events page returned event content without an API key.
- Eventbrite’s public country directory returned server-rendered cards and a `window.__SERVER_DATA__` payload; the payload exposed distinct page-1/page-2 IDs, `start_date`/`start_time`/`timezone`/`end_date`, venue data, and `is_online_event`. The provider therefore uses a bounded page crawl (`EVENTBRITE_MAX_PAGES_PER_COUNTRY`, capped at 10), strips `aff` tracking parameters, and reports `partial` when the bound truncates a known result set.

## The fully free architecture

For a public fork, the lowest-cost architecture is:

```text
Public provider pages/APIs
        ↓
Provider adapters (parallel, bounded, low-rate)
        ↓
Normalize → validate dates/type/Europe → classify → canonicalize → dedupe
        ↓
Per-source status + provenance + diagnostics
        ↓
Supabase/API/UI/README/bots
```

Two publication variants are viable:

1. **Keep the current app architecture.** Run the existing update endpoint from a once-daily scheduler, use local Supabase or a free service owned by this fork, and keep the API/UI/README/bot pipeline. Vercel’s Hobby cron supports daily jobs, subject to its timing and plan limits.
2. **Add a static snapshot publication.** Run parsers in GitHub Actions, commit generated JSON/Markdown, and serve it from the repository or GitHub Pages. GitHub documents standard GitHub-hosted runner usage as free for public repositories, and GitHub Pages is available for public repositories on GitHub Free. This is the strongest fallback if hosted runtime/database costs become a problem, but it would be a separate deployment shape from the current Supabase-backed app.

The first option is the least disruptive. The second is useful for a public read-only mirror or emergency snapshot; it should not be mixed into the production database pipeline without deciding which output is canonical.

## A safe way to add “the web”

Do not start with an unrestricted search-engine scraper. Use a controlled discovery layer:

### 1. Allowlist domains

Maintain a small configuration of trusted event directories, hackathon organizers, universities, developer communities, and conference sites. A provider is added deliberately, with a documented URL pattern and contact/terms note.

### 2. Fetch only public, allowed pages

For each domain:

- fetch and cache `robots.txt` and the relevant sitemap;
- crawl only allowlisted paths and a small request budget;
- use a clear user agent and a delay;
- stop on rate-limit, bot challenge, or access-denied responses;
- never bypass login, CAPTCHA, WAF, paywalls, or private APIs.

### 3. Extract evidence, not just text

Prefer, in order:

- JSON-LD `Event` objects;
- official structured JSON embedded in the page;
- canonical URL, Open Graph title/description, and `<time datetime>`;
- visible text only as a low-confidence fallback.

Require a title, a future or recently ended date, a canonical event URL, and enough location/online evidence for the existing European classifier. Preserve the page URL and extraction method so a human can verify a result.

### 4. Add community intake

An event URL submission form or GitHub issue template is the most effective free coverage multiplier. It can accept Luma, Devfolio, university, organizer, and registration URLs, then put them in a pending-review queue. A moderator confirms the event before publication.

This needs a deliberate provenance/moderation data-model decision; it should not be hidden in the current single `source` field. It also avoids pretending that an automated crawler can discover private, newly announced, or poorly indexed events.

### 5. Optional human-assisted search

Use ordinary web search manually with queries such as `site:example.org hackathon Europe 2026`, inspect the official event page, and submit the URL. GitHub issues/discussions and public organizer calendars can serve the same role. The machine should ingest verified URLs, not scrape search-result pages as if they were an authoritative event database.

## Recommended implementation order

This order stays within the existing provider contract and keeps each addition independently reversible:

1. **MLH parser:** season-page HTML and embedded JSON, current/next season, date and location normalization, fixtures, and source-level status.
2. **Devfolio parser:** public JSON filters, bounded pagination, Europe/online policy, URL normalization, and a warning that the endpoint is undocumented.
3. **ETHGlobal parser:** public event page, JSON-LD/embedded-data extraction, hackathon relevance filter, and date/location validation.
4. **Unstop parser:** only after deciding whether India-heavy events are useful to the EU catalog; use the explicitly public API path, not generic private endpoints.
5. **HackerEarth parser:** optional, with an aggressive stale-date/type filter and tests for the misleading status response.
6. **Allowlisted web/JSON-LD adapter:** start with a few organizers or directories, not arbitrary web search.
7. **Moderated URL intake:** add provenance and review state as a separate schema/product decision.
8. **Re-evaluate Luma:** keep the current route observable, ask Luma about an approved/free read-only path, and replace the internal endpoint if an official route becomes available.

Every new provider should include:

- a `BaseParser` implementation and registration in the provider array;
- bounded pagination/concurrency and retries;
- honest `ok`/`partial`/`failed` status;
- date, event-type, location, and URL validation;
- canonical URL plus source provenance;
- parser tests and a live smoke check;
- a note about terms, robots, authentication, and expected coverage.

## Sources and policy references

### First-party provider and platform documentation

- [Luma API getting started](https://docs.luma.com/reference/getting-started-with-your-api) and [Luma API help](https://help.luma.com/p/luma-api)
- [Luma Search/Discover behavior](https://help.luma.com/p/searching-for-events)
- [Luma terms](https://luma.com/terms)
- [MLH official event program](https://www.mlh.com/become-an-official-event) and [MLH member-event guidelines](https://github.com/MLH/mlh-policies/blob/main/member-event-guidelines.md)
- [Devfolio hackathon setup guide](https://guide.devfolio.co/docs/guide/set-up-your-first-hackathon-on-devfolio) and [Devfolio hackathon directory guide](https://guide.devfolio.co/docs/guide/introduction)
- [Kaggle API documentation](https://www.kaggle.com/docs/api) and [Kaggle competitions](https://www.kaggle.com/docs/competitions)
- [Ticketmaster Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
- [Eventbrite API status](https://www.eventbrite.com/platform/new/api)
- [Google Custom Search JSON API status](https://developers.google.com/custom-search/v1/overview)

### Free scheduling and publication

- [GitHub Actions product billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages)
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)

### Public source surfaces checked

- [Devpost hackathons](https://devpost.com/hackathons) and [Devpost terms](https://info.devpost.com/legal/terms-of-service)
- [Devfolio hackathons](https://devfolio.co/hackathons) and [Devfolio JSON surface](https://api.devfolio.co/api/hackathons)
- [MLH season events](https://www.mlh.com/seasons/2026/events)
- [Unstop public hackathon API surface](https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons)
- [HackerEarth challenge API surface](https://www.hackerearth.com/api/community/challenges/compete/)
- [ETHGlobal events](https://ethglobal.com/events)
- [AllHackathons](https://allhackathons.com/) and [dev.events hackathons](https://dev.events/hackathons)
- [Kaggle competitions API surface](https://www.kaggle.com/api/v1/competitions/list)

The availability and terms of undocumented endpoints can change. Re-run the smoke checks before enabling a provider in production.
