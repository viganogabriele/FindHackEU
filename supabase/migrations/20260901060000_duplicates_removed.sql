-- Adds a `duplicates_removed` counter to `update_runs` (issue #31: pipeline
-- observability). Cross-source dedup (`mergeHackathonDuplicates` in
-- app/api/update/route.ts) runs once, after every provider's output has
-- already been combined, so - unlike the classifier/date/country drop
-- counts, which are attributable to a single source and live inside the
-- existing `sources` jsonb blob (see 20260901030000_update_runs.sql) - this
-- is a single run-level aggregate, which is why it gets its own column
-- rather than being folded into `sources`.

alter table public.update_runs
  add column if not exists duplicates_removed integer;
