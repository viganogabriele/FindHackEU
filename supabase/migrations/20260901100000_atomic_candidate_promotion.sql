-- Make candidate approval a single database transaction (issue #66 review).
-- The previous application-side sequence (find candidate -> find duplicate ->
-- insert hackathon -> update candidate) allowed two concurrent approvals to
-- observe the same pending row and both insert it. The normalized identity is
-- stored so aliases such as lu.ma/luma.com and tracking URLs are checked in
-- the same place as the insert/update.

create or replace function public.normalize_hackathon_url(input_url text)
returns text
language plpgsql
immutable
strict
as $$
declare
  value text;
  host text;
  path text;
  query_part text;
  normalized_query text;
  parameter text;
  parameter_name text;
  kept_parameters text[] := array[]::text[];
  slash_position integer;
  query_position integer;
begin
  -- Preserve path/query value casing: URL paths can be case-sensitive. Only
  -- the scheme and host participate in the case-insensitive URL rules here.
  value := split_part(trim(input_url), '#', 1);
  value := regexp_replace(value, '^https?://', '', 1, 0, 'i');

  host := lower(split_part(split_part(value, '/', 1), '?', 1));
  host := regexp_replace(host, '^www\.', '');
  if host = 'lu.ma' then
    host := 'luma.com';
  end if;

  slash_position := position('/' in value);
  if slash_position > 0 then
    path := split_part(substring(value from slash_position), '?', 1);
  else
    path := '/';
  end if;

  if path = '' then
    path := '/';
  elsif right(path, 1) = '/' and length(path) > 1 then
    path := left(path, length(path) - 1);
  end if;

  query_position := position('?' in value);
  if query_position > 0 then
    query_part := substring(value from query_position + 1);
  else
    query_part := '';
  end if;

  if query_part <> '' then
    foreach parameter in array string_to_array(query_part, '&') loop
      if parameter = '' then
        continue;
      end if;

      parameter_name := split_part(parameter, '=', 1);
      if parameter_name ~* '^utm_' or lower(parameter_name) in
        ('gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'ref', 'referrer') then
        continue;
      end if;

      kept_parameters := array_append(kept_parameters, parameter);
    end loop;
  end if;

  select string_agg(item, '&' order by lower(split_part(item, '=', 1)), item)
    into normalized_query
    from unnest(kept_parameters) as item;

  return host || path || coalesce('?' || normalized_query, '');
end;
$$;

alter table public.hackathons
  add column if not exists normalized_url text;

update public.hackathons
set normalized_url = public.normalize_hackathon_url(url)
where normalized_url is distinct from public.normalize_hackathon_url(url);

alter table public.hackathons
  alter column normalized_url set not null;

create index if not exists hackathons_normalized_url_idx
  on public.hackathons (normalized_url);

-- Enforce normalized URL identity for all future direct writes too. Existing
-- rows are not deleted or rewritten beyond the new derived column, so a
-- pre-existing duplicate alias cannot make this additive migration fail.
create or replace function public.set_hackathon_normalized_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.normalized_url := public.normalize_hackathon_url(new.url);
  perform pg_advisory_xact_lock(hashtextextended(new.normalized_url, 0));

  if exists (
    select 1
    from public.hackathons h
    where h.normalized_url = new.normalized_url
      and h.id <> new.id
  ) then
    raise unique_violation using
      message = format('hackathon URL already exists: %s', new.normalized_url);
  end if;

  return new;
end;
$$;

drop trigger if exists hackathons_set_normalized_url
  on public.hackathons;
create trigger hackathons_set_normalized_url
  before insert or update of url on public.hackathons
  for each row
  execute function public.set_hackathon_normalized_url();

create or replace function public.promote_hackathon_candidate(
  p_candidate_id uuid,
  p_topics text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  existing_hackathon_id uuid;
  inserted_hackathon_id uuid;
  candidate_normalized_url text;
  now_at timestamptz := clock_timestamp();
  candidate_date_start timestamptz;
  candidate_status text;
begin
  select *
    into candidate
    from public.hackathon_candidates
   where id = p_candidate_id
   for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if candidate.promoted_at is not null
     and candidate.promoted_hackathon_id is not null then
    return jsonb_build_object(
      'outcome', 'already_promoted',
      'hackathon_id', candidate.promoted_hackathon_id
    );
  end if;

  candidate_normalized_url := public.normalize_hackathon_url(candidate.url);
  perform pg_advisory_xact_lock(hashtextextended(candidate_normalized_url, 0));

  select id
    into existing_hackathon_id
    from public.hackathons
   where normalized_url = candidate_normalized_url
   order by created_at, id
   limit 1
   for update;

  if existing_hackathon_id is not null then
    update public.hackathon_candidates
       set status = 'approved',
           reviewed_at = now_at,
           promoted_at = now_at,
           promoted_hackathon_id = existing_hackathon_id
     where id = p_candidate_id;

    return jsonb_build_object(
      'outcome', 'duplicate_url',
      'existing_hackathon_id', existing_hackathon_id
    );
  end if;

  candidate_date_start := coalesce(candidate.date_start, now_at);
  candidate_status := case
    when candidate.date_start is null then 'estimated'
    when candidate.date_start < now_at then 'past'
    else 'upcoming'
  end;

  insert into public.hackathons (
    name,
    city,
    country_code,
    location_type,
    date_start,
    date_end,
    topics,
    url,
    source,
    status,
    is_new
  ) values (
    candidate.name,
    candidate.city,
    candidate.country_code,
    'tbd',
    candidate_date_start,
    candidate.date_end,
    p_topics,
    candidate.url,
    'websearch',
    candidate_status,
    true
  )
  returning id into inserted_hackathon_id;

  update public.hackathon_candidates
     set status = 'approved',
         reviewed_at = now_at,
         promoted_at = now_at,
         promoted_hackathon_id = inserted_hackathon_id
   where id = p_candidate_id;

  return jsonb_build_object(
    'outcome', 'promoted',
    'hackathon_id', inserted_hackathon_id
  );
end;
$$;

revoke all on function public.promote_hackathon_candidate(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.promote_hackathon_candidate(uuid, text[])
  to service_role;
