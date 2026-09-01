-- issue: manual/web-search candidates had no way to record topics
-- (AI/Crypto/Web3/etc.) at submission time - lib/services/promote-candidate.ts
-- only ever auto-extracted them from the candidate's `name` at promotion
-- time, which is unreliable for a manually-submitted event whose title
-- doesn't happen to contain an obvious keyword (the submitter, a human who
-- already knows the event, is a much better source of truth than a regex
-- over a five-word title). Nullable/optional: web-search-discovered
-- candidates still get auto-extraction as a fallback when nothing was
-- explicitly set.
alter table public.hackathon_candidates
  add column if not exists topics text[];
