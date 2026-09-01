-- Candidate events discovered via generic web search (issue #13/#14/#17,
-- #12's "candidates table with review status"), never inserted directly
-- into `hackathons`. Web search results are unverified by nature (see
-- docs/discovery-research.md's "safe way to add the web" section) - this
-- table exists so a human reviews each one via /admin/candidates before it
-- becomes a real, published hackathon row.

create table if not exists public.hackathon_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  country_code text,
  -- Nullable, unlike hackathons.date_start: a search result's date is
  -- often only recoverable as free text (e.g. an og:description sentence),
  -- not a reliable structured value. A candidate with no parsed date can
  -- still be reviewed and, if approved, promoted with status 'estimated'.
  date_start timestamptz,
  date_end timestamptz,
  url text not null,
  -- The search query that surfaced this candidate, kept for auditability
  -- and so query quality can be evaluated later (which queries produce
  -- real hackathons vs. noise).
  query text not null,
  search_provider text not null,
  -- How the evidence below was obtained, in the preference order from
  -- docs/discovery-research.md: structured Event data found first, a
  -- generic Open Graph/title fallback next, with "text" or no confident
  -- match at all as a distinct known-weakest tier - a reviewer should be
  -- able to tell these apart at a glance rather than trusting every
  -- candidate equally.
  extraction_method text not null
    check (extraction_method in ('jsonld-event', 'og-meta', 'text-fallback')),
  -- The raw extracted evidence (JSON-LD blob, or og:title/og:description
  -- text) a human reviewer can check against the live page before
  -- approving - this table's entire reason to exist is "don't trust the
  -- machine's parse", so the evidence must be inspectable, not just the
  -- parsed fields above.
  raw_snippet text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewer_note text,
  -- Set when an 'approved' candidate has actually been copied into
  -- `hackathons` (see lib/services/promote-candidate.ts) - distinct from
  -- `status = 'approved'` so a re-approval (e.g. a previously rejected
  -- false negative) can be promoted exactly once even if the admin page
  -- is used more than once against the same row.
  promoted_at timestamptz,
  promoted_hackathon_id uuid references public.hackathons(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hackathon_candidates_url_query_key unique (url, query)
);

create index if not exists hackathon_candidates_status_idx
  on public.hackathon_candidates (status);

alter table public.hackathon_candidates enable row level security;

-- No public read/write policy: this table is never queried with the anon
-- key. All access (the /admin/candidates page and the discovery script)
-- goes through `supabaseAdmin` (the service role key), which bypasses RLS
-- entirely - same pattern as `hackathons` writes in app/api/update/route.ts.
