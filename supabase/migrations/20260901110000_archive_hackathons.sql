-- Issue #72: archive (soft-delete) instead of hard-delete for published
-- hackathons. Two producers of this state, both landing here:
--
--   1. A manual "Archive" action on a published hackathon from
--      /admin/candidates's Approved tab (e.g. a real-but-unwanted event, the
--      "Social Hackathon Umbria" case described in the issue).
--   2. An automatic retention sweep (app/api/archive-old-hackathons/route.ts)
--      that archives any `status = 'past'` hackathon more than a year past
--      its date_end (or date_start if no end date).
--
-- Both are soft-deletes - the row stays in `hackathons`, just excluded from
-- the public API and flagged reversible via `archived_at`/`archived_reason`
-- - not a hard `DELETE`, per the maintainer's explicit decision in the
-- issue #72 follow-up comment (2026-09-01). `deleteHackathonAction` (hard
-- delete) stays available separately for genuine junk/mistakes.

alter table public.hackathons
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

-- Used by the public API's exclusion filter (`archived_at is null`) on
-- every request, and by the admin Archived tab's `archived_at is not null`
-- listing - both benefit from an index, and a partial index on just the
-- archived rows keeps it small since most rows are expected to stay
-- unarchived.
create index if not exists hackathons_archived_at_idx
  on public.hackathons (archived_at)
  where archived_at is not null;
