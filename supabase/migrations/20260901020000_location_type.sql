-- Extends the location model beyond city/country (issue #21): adds
-- `location_type` (physical | online | hybrid | tbd) and an optional
-- `venue` free-text field, so an online/hybrid event or one with
-- campus/building-level detail no longer has to render as blank
-- city/country with no explanation. Additive only - existing rows get the
-- 'tbd' default and every existing city/country-based filter keeps working
-- unchanged for physical events.

alter table public.hackathons
  add column if not exists location_type text not null default 'tbd'
    check (location_type in ('physical', 'online', 'hybrid', 'tbd')),
  add column if not exists venue text;
