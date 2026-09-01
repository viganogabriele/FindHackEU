-- issue #27: app/api/update/route.ts only regenerated README.md when new
-- rows were inserted/updated, never when update_hackathon_statuses()
-- flipped an existing row's status (e.g. upcoming -> past) with no other
-- field changing - the README could silently drift from the real
-- database state (showing an already-past event as upcoming) until the
-- next run that happened to also insert/update something.
--
-- update_hackathon_statuses() previously returned void and unconditionally
-- rewrote every upcoming/past row's status on every call, whether or not
-- the value actually changed - there was no way for the caller to tell
-- "did anything really transition" from "did the RPC run". This makes it
-- return the count of rows whose status ACTUALLY changed (the WHERE
-- clause now excludes rows already holding their correct computed
-- status), which app/api/update/route.ts uses to fold real transitions
-- into its dataChanged check.
-- Postgres refuses CREATE OR REPLACE FUNCTION when the return type
-- changes (void -> integer here) - the old signature must be dropped
-- first.
drop function if exists public.update_hackathon_statuses();

create function public.update_hackathon_statuses()
returns integer
language plpgsql
as $$
declare
  changed_count integer;
begin
  update public.hackathons
  set status = case
    when coalesce(date_end, date_start) < now() then 'past'
    else 'upcoming'
  end
  where status in ('upcoming', 'past')
    and status != (case
      when coalesce(date_end, date_start) < now() then 'past'
      else 'upcoming'
    end);

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;
