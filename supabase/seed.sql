-- Local development seed data (issue #4).
--
-- Real production data comes from the discovery pipeline (POST /api/update
-- against live provider APIs, see CLAUDE.md), never from fixture rows - so
-- this file is intentionally small and clearly fake (fictional orgs/URLs
-- under example.com), just enough to make the public site and the admin
-- dashboard (/admin, /admin/candidates) show something useful immediately
-- after `npx supabase start` / `npx supabase db reset`, with zero API keys
-- configured. Dates are computed relative to `now()` so the mix of
-- upcoming/past/estimated rows stays realistic no matter when this file is
-- applied, rather than drifting stale like hardcoded literal dates would.
--
-- Column set matches supabase/migrations/20260101000000_init.sql plus every
-- additive migration through 20260901170000_preview_image_url.sql, and
-- types/database.ts's hand-maintained Row/Insert types - cross-checked by
-- hand since the sandbox this was written in cannot run
-- `npx supabase db reset` against a live local Supabase instance to verify
-- automatically (see PR description).

-- ---------------------------------------------------------------------
-- hackathons: a mix of statuses, moderation states, and location types.
-- ---------------------------------------------------------------------

insert into public.hackathons
  (id, name, city, country_code, latitude, longitude, location_type, venue,
   date_start, date_end, topics, notes, preview_image_url, url, source,
   status, notified, is_new, archived_at, archived_reason, moderation_state,
   manually_edited_at)
values
  -- Upcoming, approved, physical - the common case.
  (
    '00000000-0000-0000-0000-000000000001',
    'Berlin AI Builders Weekend',
    'Berlin', 'DE', 52.5200, 13.4050, 'physical', 'Factory Berlin Mitte',
    now() + interval '30 days', now() + interval '32 days',
    array['AI', 'IoT']::text[],
    'A weekend hackathon for AI/ML builders, seeded local sample data.',
    null,
    'https://example.com/hackathons/berlin-ai-builders-weekend',
    'luma', 'upcoming', false, true, null, null, 'approved', null
  ),
  -- Upcoming, approved, hybrid, with a preview image.
  (
    '00000000-0000-0000-0000-000000000002',
    'Paris Fintech Sprint',
    'Paris', 'FR', 48.8566, 2.3522, 'hybrid', 'Station F',
    now() + interval '45 days', now() + interval '47 days',
    array['Fintech', 'Web3']::text[],
    'Seeded local sample data.',
    'https://picsum.photos/seed/paris-fintech-sprint/800/400',
    'https://example.com/hackathons/paris-fintech-sprint',
    'devfolio', 'upcoming', true, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, fully online.
  (
    '00000000-0000-0000-0000-000000000003',
    'European Student Web3 Online Hack',
    null, null, null, null, 'online', null,
    now() + interval '14 days', now() + interval '16 days',
    array['Web3', 'Crypto']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/eu-student-web3-online',
    'ethglobal', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, no confirmed venue yet.
  (
    '00000000-0000-0000-0000-000000000004',
    'Milano Health Tech Jam',
    'Milan', 'IT', 45.4642, 9.1900, 'tbd', null,
    now() + interval '60 days', now() + interval '61 days',
    array['Healthcare']::text[],
    'Venue to be announced. Seeded local sample data.',
    null,
    'https://example.com/hackathons/milano-health-tech-jam',
    'mlh', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Past, approved.
  (
    '00000000-0000-0000-0000-000000000005',
    'Amsterdam Sustainability Hackathon',
    'Amsterdam', 'NL', 52.3676, 4.9041, 'physical', 'A''DAM Tower',
    now() - interval '40 days', now() - interval '38 days',
    array['Sustainability']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/amsterdam-sustainability-hackathon',
    'eventbrite', 'past', true, false, null, null, 'approved', null
  ),
  -- Past, approved, archived over a year ago (retention sweep example).
  (
    '00000000-0000-0000-0000-000000000006',
    'Warsaw Gaming Hack 2024',
    'Warsaw', 'PL', 52.2297, 21.0122, 'physical', 'Google for Startups Campus',
    now() - interval '400 days', now() - interval '398 days',
    array['Gaming']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/warsaw-gaming-hack-2024',
    'devpost', 'past', true, false,
    now() - interval '30 days', 'Older than 1 year past its end date',
    'approved', null
  ),
  -- Estimated status: promoted from a candidate with no resolvable date.
  (
    '00000000-0000-0000-0000-000000000007',
    'Lisbon Web3 Founders Hack (date TBA)',
    'Lisbon', 'PT', 38.7223, -9.1393, 'tbd', null,
    now() + interval '90 days', null,
    array['Web3', 'Fintech']::text[],
    'Estimated date - promoted from a web-search candidate with no structured date. Seeded local sample data.',
    null,
    'https://example.com/hackathons/lisbon-web3-founders-hack',
    'websearch', 'estimated', false, false, null, null, 'approved', null
  ),
  -- Published row moved back to pending re-review (issue #102).
  (
    '00000000-0000-0000-0000-000000000008',
    'Vienna Defense Tech Challenge',
    'Vienna', 'AT', 48.2082, 16.3738, 'physical', 'TU Wien',
    now() + interval '20 days', now() + interval '21 days',
    array['Defense']::text[],
    'Flagged for re-review after a reported inaccuracy. Seeded local sample data.',
    null,
    'https://example.com/hackathons/vienna-defense-tech-challenge',
    'luma', 'upcoming', false, false, null, null, 'pending', null
  ),
  -- Published row rejected editorially (still in the table, just hidden).
  (
    '00000000-0000-0000-0000-000000000009',
    'Not-Actually-A-Hackathon Meetup',
    'Madrid', 'ES', 40.4168, -3.7038, 'physical', null,
    now() + interval '10 days', null,
    array['Education']::text[],
    'Editorially rejected: a networking meetup misclassified as a hackathon. Seeded local sample data.',
    null,
    'https://example.com/hackathons/not-actually-a-hackathon-meetup',
    'eventbrite', 'upcoming', false, false, null, null, 'rejected', null
  ),
  -- Manually edited row (issue #103) - manually_edited_at set.
  (
    '00000000-0000-0000-0000-000000000010',
    'Munich IoT & Robotics Hackathon',
    'Munich', 'DE', 48.1351, 11.5820, 'physical', 'TUM Garching Campus',
    now() + interval '25 days', now() + interval '27 days',
    array['IoT']::text[],
    'Date corrected by an admin after the organizer moved the event. Seeded local sample data.',
    null,
    'https://example.com/hackathons/munich-iot-robotics-hackathon',
    'devfolio', 'upcoming', false, false, null, null, 'approved',
    now() - interval '2 days'
  )
on conflict (url) do nothing;

-- ---------------------------------------------------------------------
-- hackathon_candidates: pending/rejected/approved review-queue examples.
-- ---------------------------------------------------------------------

insert into public.hackathon_candidates
  (id, name, city, country_code, date_start, date_end, url, query,
   search_provider, extraction_method, raw_snippet, status, reviewed_at,
   reviewer_note, promoted_at, promoted_hackathon_id, has_conflict, source,
   topics)
values
  -- Pending, high-confidence JSON-LD extraction, auto-publish eligible.
  (
    '00000000-0000-0000-0000-000000000101',
    'Brussels Climate Hack',
    'Brussels', 'BE', now() + interval '35 days', now() + interval '36 days',
    'https://example.com/candidates/brussels-climate-hack',
    'hackathon Belgium 2026', 'tavily', 'jsonld-event',
    '{"@type":"Event","name":"Brussels Climate Hack","startDate":"2026-10-10"}',
    'pending', null, null, null, null, false, 'web-search',
    array['Sustainability']::text[]
  ),
  -- Pending, weaker og-meta extraction with a title/description conflict.
  (
    '00000000-0000-0000-0000-000000000102',
    'Zurich Fintech Hack (unverified)',
    'Zurich', 'CH', null, null,
    'https://example.com/candidates/zurich-fintech-hack',
    'hackathon Schweiz 2026', 'serper', 'og-meta',
    'og:title="Zurich Fintech Hack" og:description="Annual community meetup, not a hackathon"',
    'pending', null, null, null, null, true, 'web-search', null
  ),
  -- Pending, manually submitted by an admin (no automated fetch involved).
  (
    '00000000-0000-0000-0000-000000000103',
    'Dublin Student Hack Night',
    'Dublin', 'IE', now() + interval '18 days', null,
    'https://example.com/candidates/dublin-student-hack-night',
    'manual submission', 'manual', 'text-fallback',
    'Submitted manually via /admin/candidates - announced only on LinkedIn.',
    'pending', null, null, null, null, false, 'manual',
    array['Education']::text[]
  ),
  -- Rejected: false positive (a workshop, not a hackathon).
  (
    '00000000-0000-0000-0000-000000000104',
    'Build Your First AI SaaS - Workshop',
    'Berlin', 'DE', now() + interval '5 days', null,
    'https://example.com/candidates/build-your-first-ai-saas-workshop',
    'hackathon Deutschland 2026', 'tavily', 'text-fallback',
    'A paid marketing workshop, not a hackathon - rejected on review.',
    'rejected', now() - interval '3 days',
    'Not a hackathon: a paid workshop/masterclass.', null, null, false,
    'web-search', null
  ),
  -- Approved and already promoted into hackathons (id 7 above).
  (
    '00000000-0000-0000-0000-000000000105',
    'Lisbon Web3 Founders Hack (date TBA)',
    'Lisbon', 'PT', null, null,
    'https://example.com/hackathons/lisbon-web3-founders-hack',
    'hackathon Portugal 2026', 'serpapi', 'jsonld-event',
    '{"@type":"Event","name":"Lisbon Web3 Founders Hack"}',
    'approved', now() - interval '5 days', 'Looks legitimate, approved.',
    now() - interval '5 days',
    '00000000-0000-0000-0000-000000000007', false, 'web-search',
    array['Web3', 'Fintech']::text[]
  )
on conflict (url, query) do nothing;
