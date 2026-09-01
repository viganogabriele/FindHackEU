-- Persistent geocoding results shared by the public geocode endpoint and the
-- ingestion pipeline. Coordinates are stable enough that this table has no
-- TTL; rows can be corrected manually if a provider returns a bad result.
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
