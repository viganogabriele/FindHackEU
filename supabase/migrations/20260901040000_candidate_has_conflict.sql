-- Adds a source-of-truth-conflict signal to hackathon_candidates (issue
-- #15): extractEventEvidence() (lib/search/extract-event-evidence.ts)
-- still resolves to a single winning tier (JSON-LD > Open Graph > bare
-- title) exactly as before, but now also checks whether a lower-confidence
-- tier disagrees with the winner, so a reviewer at /admin/candidates knows
-- to double-check the page before approving instead of trusting the
-- winning tier blindly.

alter table public.hackathon_candidates
  add column if not exists has_conflict boolean not null default false;
