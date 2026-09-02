-- Multi-admin support (issue #18). Replaces the single `ADMIN_ALLOWED_EMAIL`
-- env var allowlist with a small table the maintainer can manage from inside
-- the /admin dashboard itself, without editing env vars or redeploying.
--
-- `email` is the primary identifier (always stored lowercase - see
-- lib/services/admin-users.ts, which normalizes before every read/write) so
-- "Admin@Example.com" and "admin@example.com" can't both be inserted as
-- distinct rows. `added_by` is free text (the adding admin's own email, or
-- "system"/similar for anything seeded outside the UI) rather than a foreign
-- key - there is no other users table in this schema to reference, and this
-- is purely an audit/display field, never used for access-control logic.
create table if not exists public.admin_users (
  email text primary key,
  added_at timestamptz not null default now(),
  added_by text
);

alter table public.admin_users enable row level security;

-- No public read/write policy, deliberately - same pattern as
-- `update_runs`/`hackathon_candidates` above: this is security-sensitive
-- operational data, read and written exclusively through the server-side
-- `supabaseAdmin` (service-role) client in
-- lib/services/require-admin-auth.ts and lib/services/admin-users.ts, never
-- through the anon key. The service-role key bypasses RLS entirely, so no
-- policy is needed (or wanted) for it to work; RLS stays enabled so an anon
-- or authenticated Supabase Auth session can never read or write this table
-- directly, even if a client-side call somehow tried to.
