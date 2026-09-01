-- issue #13's acceptance criteria literally expects a `source` column on
-- hackathon_candidates with value "web-search" for a discovered candidate
-- (distinct from `search_provider`, which names which of Tavily/SerpAPI/
-- Serper actually returned the result, or "manual" for a hand-submitted
-- URL - see lib/services/submit-manual-candidate.ts). Adding a `source`
-- column mirrors the `hackathons` table's own `source` column
-- (luma/devfolio/mlh/ethglobal/websearch) instead of overloading
-- `search_provider` to mean two different things.
alter table public.hackathon_candidates
  add column if not exists source text not null default 'web-search';
