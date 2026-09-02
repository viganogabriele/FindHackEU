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
-- No `preview_image_url` values are set (kept `null` throughout) - a
-- placeholder photo on one row made that card's grid row visibly taller
-- than the others (preview_image_url triggers an image block in
-- components/hackathon-card.tsx), so seed data intentionally ships with no
-- photos at all.
--
-- Column set matches supabase/migrations/20260101000000_init.sql plus every
-- additive migration through 20260901170000_preview_image_url.sql, and
-- types/database.ts's hand-maintained Row/Insert types - cross-checked by
-- hand since the sandbox this was written in cannot run
-- `npx supabase db reset` against a live local Supabase instance to verify
-- automatically (see PR description).

-- ---------------------------------------------------------------------
-- hackathons: a mix of statuses, moderation states, and location types,
-- spread across many European cities/countries for map/filter coverage.
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
  -- Upcoming, approved, hybrid.
  (
    '00000000-0000-0000-0000-000000000002',
    'Paris Fintech Sprint',
    'Paris', 'FR', 48.8566, 2.3522, 'hybrid', 'Station F',
    now() + interval '45 days', now() + interval '47 days',
    array['Fintech', 'Web3']::text[],
    'Seeded local sample data.',
    null,
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
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000011',
    'London Fintech Builders Hack',
    'London', 'GB', 51.5074, -0.1278, 'physical', 'Level39',
    now() + interval '22 days', now() + interval '23 days',
    array['Fintech']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/london-fintech-builders-hack',
    'luma', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, hybrid.
  (
    '00000000-0000-0000-0000-000000000012',
    'Barcelona Climate Hack',
    'Barcelona', 'ES', 41.3874, 2.1686, 'hybrid', 'Pier01',
    now() + interval '38 days', now() + interval '40 days',
    array['Sustainability', 'AI']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/barcelona-climate-hack',
    'devfolio', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, online.
  (
    '00000000-0000-0000-0000-000000000013',
    'Nordic Remote Gaming Jam',
    null, null, null, null, 'online', null,
    now() + interval '12 days', now() + interval '13 days',
    array['Gaming']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/nordic-remote-gaming-jam',
    'mlh', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, tbd venue.
  (
    '00000000-0000-0000-0000-000000000014',
    'Stockholm Robotics Challenge',
    'Stockholm', 'SE', 59.3293, 18.0686, 'tbd', null,
    now() + interval '55 days', now() + interval '56 days',
    array['Robotics', 'AI']::text[],
    'Venue to be announced. Seeded local sample data.',
    null,
    'https://example.com/hackathons/stockholm-robotics-challenge',
    'ethglobal', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000015',
    'Copenhagen GreenTech Hackathon',
    'Copenhagen', 'DK', 55.6761, 12.5683, 'physical', 'DTU Skylab',
    now() + interval '48 days', now() + interval '50 days',
    array['Sustainability']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/copenhagen-greentech-hackathon',
    'eventbrite', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000016',
    'Helsinki Edtech Sprint',
    'Helsinki', 'FI', 60.1699, 24.9384, 'physical', 'Aalto University',
    now() + interval '33 days', now() + interval '34 days',
    array['Education']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/helsinki-edtech-sprint',
    'devpost', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, hybrid.
  (
    '00000000-0000-0000-0000-000000000017',
    'Dublin Student Hack Fest',
    'Dublin', 'IE', 53.3498, -6.2603, 'hybrid', 'Trinity College Dublin',
    now() + interval '17 days', now() + interval '18 days',
    array['Education', 'AI']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/dublin-student-hack-fest',
    'luma', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000018',
    'Prague Cybersecurity Challenge',
    'Prague', 'CZ', 50.0755, 14.4378, 'physical', 'CTU FIT',
    now() + interval '70 days', now() + interval '71 days',
    array['Cybersecurity']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/prague-cybersecurity-challenge',
    'devfolio', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000019',
    'Budapest Blockchain Weekend',
    'Budapest', 'HU', 47.4979, 19.0402, 'physical', 'Budapest University of Technology',
    now() + interval '52 days', now() + interval '53 days',
    array['Web3', 'Crypto']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/budapest-blockchain-weekend',
    'mlh', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, tbd.
  (
    '00000000-0000-0000-0000-000000000020',
    'Athens Deep Tech Hack',
    'Athens', 'GR', 37.9838, 23.7275, 'tbd', null,
    now() + interval '65 days', now() + interval '66 days',
    array['AI']::text[],
    'Venue to be announced. Seeded local sample data.',
    null,
    'https://example.com/hackathons/athens-deep-tech-hack',
    'ethglobal', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000021',
    'Zurich FinTech & Web3 Hack',
    'Zurich', 'CH', 47.3769, 8.5417, 'physical', 'ETH Zurich',
    now() + interval '80 days', now() + interval '82 days',
    array['Fintech', 'Web3']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/zurich-fintech-web3-hack',
    'luma', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000022',
    'Brussels Public Sector Innovation Hack',
    'Brussels', 'BE', 50.8503, 4.3517, 'physical', 'Egmont Palace',
    now() + interval '28 days', now() + interval '29 days',
    array['GovTech']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/brussels-public-sector-innovation-hack',
    'eventbrite', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, hybrid.
  (
    '00000000-0000-0000-0000-000000000023',
    'Krakow Game Dev Jam',
    'Krakow', 'PL', 50.0647, 19.9450, 'hybrid', 'ICE Krakow',
    now() + interval '15 days', now() + interval '16 days',
    array['Gaming']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/krakow-game-dev-jam',
    'devpost', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000024',
    'Lyon Health Innovation Hackathon',
    'Lyon', 'FR', 45.7640, 4.8357, 'physical', 'Lyon Confluence',
    now() + interval '42 days', now() + interval '43 days',
    array['Healthcare']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/lyon-health-innovation-hackathon',
    'devfolio', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, online.
  (
    '00000000-0000-0000-0000-000000000025',
    'Baltic States Remote AI Hack',
    null, null, null, null, 'online', null,
    now() + interval '19 days', now() + interval '20 days',
    array['AI']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/baltic-states-remote-ai-hack',
    'mlh', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000026',
    'Turin Automotive Tech Hack',
    'Turin', 'IT', 45.0703, 7.6869, 'physical', 'Politecnico di Torino',
    now() + interval '58 days', now() + interval '59 days',
    array['IoT', 'Robotics']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/turin-automotive-tech-hack',
    'ethglobal', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000027',
    'Rotterdam Port Logistics Hackathon',
    'Rotterdam', 'NL', 51.9244, 4.4777, 'physical', 'Erasmus University',
    now() + interval '36 days', now() + interval '37 days',
    array['Sustainability', 'IoT']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/rotterdam-port-logistics-hackathon',
    'luma', 'upcoming', false, false, null, null, 'approved', null
  ),
  -- Past, approved.
  (
    '00000000-0000-0000-0000-000000000028',
    'Oslo Ocean Tech Hack',
    'Oslo', 'NO', 59.9139, 10.7522, 'physical', 'Oslo Science Park',
    now() - interval '20 days', now() - interval '18 days',
    array['Sustainability']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/oslo-ocean-tech-hack',
    'eventbrite', 'past', true, false, null, null, 'approved', null
  ),
  -- Past, approved.
  (
    '00000000-0000-0000-0000-000000000029',
    'Bucharest DevOps Marathon',
    'Bucharest', 'RO', 44.4268, 26.1025, 'physical', 'Politehnica University',
    now() - interval '55 days', now() - interval '53 days',
    array['DevTools']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/bucharest-devops-marathon',
    'devpost', 'past', true, false, null, null, 'approved', null
  ),
  -- Past, approved.
  (
    '00000000-0000-0000-0000-000000000030',
    'Sofia Student Coding Cup',
    'Sofia', 'BG', 42.6977, 23.3219, 'hybrid', 'Sofia Tech Park',
    now() - interval '70 days', now() - interval '68 days',
    array['Education']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/sofia-student-coding-cup',
    'mlh', 'past', false, false, null, null, 'approved', null
  ),
  -- Past, approved, archived (retention sweep example).
  (
    '00000000-0000-0000-0000-000000000031',
    'Ljubljana Smart City Hack 2024',
    'Ljubljana', 'SI', 46.0569, 14.5058, 'physical', 'University of Ljubljana',
    now() - interval '410 days', now() - interval '408 days',
    array['IoT']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/ljubljana-smart-city-hack-2024',
    'devfolio', 'past', true, false,
    now() - interval '45 days', 'Older than 1 year past its end date',
    'approved', null
  ),
  -- Estimated status: promoted from a candidate with no resolvable date.
  (
    '00000000-0000-0000-0000-000000000032',
    'Bratislava Founders Hack (date TBA)',
    'Bratislava', 'SK', 48.1486, 17.1077, 'tbd', null,
    now() + interval '95 days', null,
    array['Fintech']::text[],
    'Estimated date - promoted from a web-search candidate with no structured date. Seeded local sample data.',
    null,
    'https://example.com/hackathons/bratislava-founders-hack',
    'websearch', 'estimated', false, false, null, null, 'approved', null
  ),
  -- Published row moved back to pending re-review (issue #102).
  (
    '00000000-0000-0000-0000-000000000033',
    'Riga Data Science Hack',
    'Riga', 'LV', 56.9496, 24.1052, 'physical', 'Riga Technical University',
    now() + interval '24 days', now() + interval '25 days',
    array['AI']::text[],
    'Flagged for re-review after a reported inaccuracy. Seeded local sample data.',
    null,
    'https://example.com/hackathons/riga-data-science-hack',
    'luma', 'upcoming', false, false, null, null, 'pending', null
  ),
  -- Published row rejected editorially (still in the table, just hidden).
  (
    '00000000-0000-0000-0000-000000000034',
    'Vilnius Networking Mixer (not a hackathon)',
    'Vilnius', 'LT', 54.6872, 25.2797, 'physical', null,
    now() + interval '8 days', null,
    array['Education']::text[],
    'Editorially rejected: a networking meetup misclassified as a hackathon. Seeded local sample data.',
    null,
    'https://example.com/hackathons/vilnius-networking-mixer',
    'eventbrite', 'upcoming', false, false, null, null, 'rejected', null
  ),
  -- Manually edited row (issue #103) - manually_edited_at set.
  (
    '00000000-0000-0000-0000-000000000035',
    'Tallinn E-Governance Hackathon',
    'Tallinn', 'EE', 59.4370, 24.7536, 'physical', 'e-Estonia Briefing Centre',
    now() + interval '31 days', now() + interval '33 days',
    array['GovTech']::text[],
    'Location corrected by an admin after the venue changed. Seeded local sample data.',
    null,
    'https://example.com/hackathons/tallinn-e-governance-hackathon',
    'devfolio', 'upcoming', false, false, null, null, 'approved',
    now() - interval '1 days'
  ),
  -- Upcoming, approved, physical.
  (
    '00000000-0000-0000-0000-000000000036',
    'Luxembourg FinTech Hack',
    'Luxembourg', 'LU', 49.6116, 6.1319, 'physical', 'House of Startups',
    now() + interval '63 days', now() + interval '64 days',
    array['Fintech']::text[],
    'Seeded local sample data.',
    null,
    'https://example.com/hackathons/luxembourg-fintech-hack',
    'mlh', 'upcoming', false, false, null, null, 'approved', null
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
  ),
  -- Pending, high-confidence JSON-LD extraction, auto-publish eligible.
  (
    '00000000-0000-0000-0000-000000000106',
    'Stockholm Green Mobility Hack',
    'Stockholm', 'SE', now() + interval '41 days', now() + interval '42 days',
    'https://example.com/candidates/stockholm-green-mobility-hack',
    'hackathon Sweden 2026', 'tavily', 'jsonld-event',
    '{"@type":"Event","name":"Stockholm Green Mobility Hack","startDate":"2026-10-15"}',
    'pending', null, null, null, null, false, 'web-search',
    array['Sustainability', 'IoT']::text[]
  ),
  -- Pending, og-meta extraction, no conflict.
  (
    '00000000-0000-0000-0000-000000000107',
    'Prague Robotics Hack',
    'Prague', 'CZ', now() + interval '50 days', null,
    'https://example.com/candidates/prague-robotics-hack',
    'hackathon Czechia 2026', 'serpapi', 'og-meta',
    'og:title="Prague Robotics Hack" og:description="A weekend robotics hackathon at CTU."',
    'pending', null, null, null, null, false, 'web-search',
    array['Robotics']::text[]
  ),
  -- Pending, text-fallback extraction, weakest tier.
  (
    '00000000-0000-0000-0000-000000000108',
    'Athens Student Innovation Hack',
    'Athens', 'GR', null, null,
    'https://example.com/candidates/athens-student-innovation-hack',
    'hackathon Greece 2026', 'serper', 'text-fallback',
    'Page title only: "Athens Student Innovation Hack | University of Athens"',
    'pending', null, null, null, null, false, 'web-search', null
  ),
  -- Pending, manually submitted, no automated fetch involved.
  (
    '00000000-0000-0000-0000-000000000109',
    'Warsaw Fintech Builders Night',
    'Warsaw', 'PL', now() + interval '27 days', null,
    'https://example.com/candidates/warsaw-fintech-builders-night',
    'manual submission', 'manual', 'text-fallback',
    'Submitted manually via /admin/candidates - announced only on a Discord server.',
    'pending', null, null, null, null, false, 'manual',
    array['Fintech']::text[]
  ),
  -- Rejected: false positive (a conference, not a hackathon).
  (
    '00000000-0000-0000-0000-000000000110',
    'AI Founder Masterclass - Conference',
    'Munich', 'DE', now() + interval '9 days', null,
    'https://example.com/candidates/ai-founder-masterclass-conference',
    'hackathon Deutschland 2026', 'serper', 'text-fallback',
    'A paid speaker conference, not a hackathon - rejected on review.',
    'rejected', now() - interval '6 days',
    'Not a hackathon: a paid conference/masterclass.', null, null, false,
    'web-search', null
  ),
  -- Rejected: stale/expired listing.
  (
    '00000000-0000-0000-0000-000000000111',
    'Vienna Hackathon 2023 (expired listing)',
    'Vienna', 'AT', now() - interval '600 days', null,
    'https://example.com/candidates/vienna-hackathon-2023',
    'hackathon Austria 2026', 'tavily', 'jsonld-event',
    '{"@type":"Event","name":"Vienna Hackathon 2023","startDate":"2023-11-01"}',
    'rejected', now() - interval '10 days',
    'Stale listing from a past year, no longer relevant.', null, null,
    false, 'web-search', null
  ),
  -- Approved, not yet promoted (promoted_at/promoted_hackathon_id null).
  (
    '00000000-0000-0000-0000-000000000112',
    'Krakow Health Tech Hack',
    'Krakow', 'PL', now() + interval '44 days', now() + interval '45 days',
    'https://example.com/candidates/krakow-health-tech-hack',
    'hackathon Poland 2026', 'serpapi', 'jsonld-event',
    '{"@type":"Event","name":"Krakow Health Tech Hack","startDate":"2026-10-20"}',
    'approved', now() - interval '2 days', 'Looks legitimate, approved.',
    null, null, false, 'web-search',
    array['Healthcare']::text[]
  ),
  -- Pending, og-meta extraction with a title/description conflict.
  (
    '00000000-0000-0000-0000-000000000113',
    'Lisbon Ocean Tech Hack (unverified)',
    'Lisbon', 'PT', null, null,
    'https://example.com/candidates/lisbon-ocean-tech-hack',
    'hackathon Portugal 2026', 'tavily', 'og-meta',
    'og:title="Lisbon Ocean Tech Hack" og:description="Monthly sailing club social, not a hackathon"',
    'pending', null, null, null, null, true, 'web-search', null
  ),
  -- Pending, manually submitted, explicit topics chosen by the submitter.
  (
    '00000000-0000-0000-0000-000000000114',
    'Copenhagen Student AI Night',
    'Copenhagen', 'DK', now() + interval '21 days', null,
    'https://example.com/candidates/copenhagen-student-ai-night',
    'manual submission', 'manual', 'text-fallback',
    'Submitted manually via /admin/candidates - announced only on Instagram.',
    'pending', null, null, null, null, false, 'manual',
    array['AI', 'Education']::text[]
  )
on conflict (url, query) do nothing;
