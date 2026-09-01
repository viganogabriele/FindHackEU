-- Persistent history of `/api/update` pipeline runs (issue #32). Today the
-- only record of a past run is Vercel's own runtime logs, which live
-- outside the repo/database and aren't queryable as structured data - this
-- table lets "the last 30 runs, with per-source counts" be answered with a
-- plain SELECT instead of grepping logs.

create table if not exists public.update_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  -- Null while the run is still in progress, or if the process crashed
  -- (e.g. a serverless timeout) before the handler's own finally-style
  -- bookkeeping got a chance to write a final state.
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'success', 'failed')),
  test_mode boolean not null default false,
  -- Snapshot of the same `sourceResults` map app/api/update/route.ts
  -- already builds per provider (enabled/success/status/parsed/error) -
  -- stored as-is rather than normalized into columns/a child table, since
  -- the provider set changes over time and this is read-only operational
  -- data, not something queried by individual source in SQL yet.
  sources jsonb,
  parsed_count integer,
  inserted_count integer,
  updated_count integer,
  -- Mirrors the route's own top-level `degraded` flag (a source partially
  -- failed, or some existing-row updates failed, even though the run as a
  -- whole didn't hard-fail).
  degraded boolean,
  -- Top-level fatal error message, only set when the whole run threw
  -- (the outer catch in app/api/update/route.ts) rather than a specific
  -- stage reporting its own error into `sources`.
  error text
);

create index if not exists update_runs_started_at_idx
  on public.update_runs (started_at desc);

alter table public.update_runs enable row level security;

-- No public read/write policy: this is operational data read via the
-- service-role key (a future admin/debug view, if one is ever built), never
-- queried with the anon key - same reasoning as `hackathon_candidates`
-- above. All writes from app/api/update/route.ts go through
-- `supabaseAdmin`, which bypasses RLS entirely.
