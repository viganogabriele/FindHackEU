-- Issue #103: preserve administrator corrections to published hackathons from
-- being overwritten by the next provider-sync run. The timestamp is nullable
-- so existing rows and rows never manually edited retain normal source-sync
-- behavior.

alter table public.hackathons
  add column if not exists manually_edited_at timestamptz;
