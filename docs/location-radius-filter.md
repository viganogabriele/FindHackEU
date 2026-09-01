# Radius location filter

Issue #109 adds an additive “within N km of X” filter to the public listing.
The existing city and country filters continue to work independently and can
be combined with the radius filter.

## Coordinates and rollout

`hackathons.latitude` and `hackathons.longitude` are nullable database columns.
The update pipeline asks the existing Openapi geocoder for coordinates when it
discovers a new city-based event. Events without a city, online events, and
rows where geocoding is unavailable remain valid but cannot match an active
radius.

Rows that existed before the migration need a one-time backfill:

```bash
npx tsx scripts/backfill-coordinates.ts             # dry run
npx tsx scripts/backfill-coordinates.ts --limit=100 --write
```

Use `--limit` to control cost and quota usage. The script is sequential and
defaults to dry-run mode.

## Geocoding provider

`OPENAPI_GEOCODING_KEY` is an Openapi (Openapi.it) API key, not a generic
free geocoder key. Its Geocoding and Reverse Geocoding service documents 1,000
free requests per month and €0.001 + VAT per request after that allowance. It
returns latitude, longitude, and country metadata from `POST
https://geocoding.openapi.it/geocode`.

The browser never receives the key. The public `/api/geocode` route only runs
after an explicit location search, caches successful lookups in-process for an
hour, and limits each client IP to 10 searches per hour. This keeps accidental
autocomplete traffic and a single noisy client from consuming the shared
quota, but the deployment owner must still monitor the provider quota before
enabling the feature publicly at scale.

Nominatim was not selected for the public lookup. Its public policy caps use at
one request per second, requires identifying request headers and attribution,
and explicitly prohibits client-side autocomplete. A deliberately submitted
lookup could be compatible with that policy, but it would not remove the
shared-service capacity and operational concerns for this site.
