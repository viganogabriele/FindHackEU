-- Persistent geocoding results shared by the public geocode endpoint and the
-- ingestion pipeline. Coordinates are stable, but the application applies a
-- best-effort 180-day TTL and 10,000-row cap because public queries are
-- unauthenticated and arbitrary.
create table if not exists public.geocode_cache (
  query text primary key,
  latitude double precision not null,
  longitude double precision not null,
  country_code text,
  created_at timestamptz not null default now(),
  constraint geocode_cache_latitude_range check (latitude between -90 and 90),
  constraint geocode_cache_longitude_range check (longitude between -180 and 180)
);

alter table public.geocode_cache enable row level security;
