-- The `hackathons` public read policy was `using (true)`: the anon key -
-- which is published to every visitor's browser as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY - could read every row straight from
-- PostgREST, including rows the maintainer had explicitly moved out of the
-- public site.
--
-- app/api/hackathons/route.ts already applies exactly these two filters, but
-- that route is not the boundary: anyone can skip it and query
-- /rest/v1/hackathons directly. Verified against a local Supabase with the
-- anon key alone:
--
--   /rest/v1/hackathons?select=name,moderation_state&moderation_state=neq.approved
--   -> [{"name":"Vienna Defense Tech Challenge","moderation_state":"pending"},
--       {"name":"Not-Actually-A-Hackathon Meetup","moderation_state":"rejected"}, ...]
--
-- So an editorial "this isn't the kind of event we list" decision, and every
-- archived row, stayed publicly readable - the moderation state is itself
-- information about events and about the maintainer's judgement of them.
--
-- This narrows the policy to exactly what the public API serves. Nothing in
-- the app loses access: the anon client is used only by that route (which
-- filters the same way already), and every write path plus the whole /admin
-- dashboard goes through the service-role client, which bypasses RLS.
--
-- `hackathon_candidates`, `update_runs`, `geocode_cache` and `admin_users`
-- already have RLS enabled with no policy at all, so anon reads of those
-- return empty - confirmed locally. This brings `hackathons` in line.

drop policy if exists "Public read access" on public.hackathons;

create policy "Public read access"
  on public.hackathons
  for select
  to anon, authenticated
  using (
    archived_at is null
    and moderation_state = 'approved'
  );
