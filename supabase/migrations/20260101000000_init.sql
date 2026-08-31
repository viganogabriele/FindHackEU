-- Local-development schema for the `hackathons` table, reverse-engineered
-- from types/database.ts and how app/api/update/route.ts and
-- app/api/hackathons/route.ts actually read/write it. No schema for this
-- table exists anywhere else in the repo (see issue #24 "version the real
-- database schema in the repository") -- this migration is a best-effort
-- reconstruction for local testing, not a copy of the maintainer's real
-- production schema, which this fork has no access to.

create extension if not exists "pgcrypto";

create table if not exists public.hackathons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  country_code text,
  date_start timestamptz not null,
  date_end timestamptz,
  topics text[],
  notes text,
  url text not null,
  source text not null default 'luma',
  status text not null default 'upcoming'
    check (status in ('upcoming', 'past', 'estimated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified boolean not null default false,
  is_new boolean not null default false,
  constraint hackathons_url_key unique (url)
);

create index if not exists hackathons_status_idx on public.hackathons (status);
create index if not exists hackathons_date_start_idx on public.hackathons (date_start);

-- Keep `updated_at` current on every row update, mirroring what a
-- production Supabase project typically wires up via a trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists hackathons_set_updated_at on public.hackathons;
create trigger hackathons_set_updated_at
  before update on public.hackathons
  for each row
  execute function public.set_updated_at();

-- Recomputes each row's status from date_start/date_end vs. now(). Called by
-- app/api/update/route.ts after every insert batch. "estimated" is part of
-- the status enum (types/database.ts) but this reconstruction has no other
-- evidence of what should assign it, so it's left for a row to be set to
-- explicitly elsewhere and is never assigned automatically here.
create or replace function public.update_hackathon_statuses()
returns void
language plpgsql
as $$
begin
  update public.hackathons
  set status = case
    when coalesce(date_end, date_start) < now() then 'past'
    else 'upcoming'
  end
  where status in ('upcoming', 'past');
end;
$$;

alter table public.hackathons enable row level security;

-- Public read access (the anon key is used client-side for read-only
-- queries in app/api/hackathons/route.ts and lib/supabase.ts's `supabase`
-- client). All writes in this codebase go through `supabaseAdmin` (the
-- service role key), which bypasses RLS entirely, so no write policy is
-- needed for local testing.
drop policy if exists "Public read access" on public.hackathons;
create policy "Public read access"
  on public.hackathons
  for select
  to anon, authenticated
  using (true);
