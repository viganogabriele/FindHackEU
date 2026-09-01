-- Issue #102: a true unified moderation model for `hackathons`, orthogonal
-- to issue #72's `archived_at`/`archived_reason` (which is purely about
-- date-based retention, not editorial "should this be public" judgment).
--
-- Every `hackathons` row - regardless of whether it came from the main
-- scraping pipeline (the overwhelming majority, which never had a
-- `hackathon_candidates` row at all), from `promote-candidate.ts`, or from
-- a manual submission - can now be moved between 'pending'/'approved'/
-- 'rejected' from the admin UI in either direction, mirroring what
-- `hackathon_candidates.status` already offered for not-yet-published
-- candidates, but without merging the two tables (deliberately rejected as
-- much larger/riskier than necessary - see issue #102's "Proposed approach").
--
-- Default 'approved' matches current behavior exactly: every existing
-- published row is implicitly "approved" today (nothing gates it from the
-- public API besides `archived_at`), so backfilling this column changes no
-- visible behavior for any existing row.

alter table public.hackathons
  add column if not exists moderation_state text not null default 'approved'
    check (moderation_state in ('approved', 'pending', 'rejected'));

-- Every union-query tab on /admin/candidates (issue #102) and the public
-- API's exclusion filter (`moderation_state = 'approved'`) filter on this
-- column on every request/page load.
create index if not exists hackathons_moderation_state_idx
  on public.hackathons (moderation_state);
