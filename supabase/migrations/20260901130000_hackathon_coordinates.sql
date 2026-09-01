-- Issue #109: coordinates for the public radius filter.
-- Existing rows remain nullable until scripts/backfill-coordinates.ts is run.

alter table public.hackathons
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.hackathons
  add constraint hackathons_latitude_range
    check (latitude is null or latitude between -90 and 90),
  add constraint hackathons_longitude_range
    check (longitude is null or longitude between -180 and 180);
