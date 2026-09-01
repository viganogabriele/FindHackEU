create or replace function public.move_candidate_to_pending(candidate_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  select status into current_status
  from public.hackathon_candidates AS c
  where c.id = move_candidate_to_pending.candidate_id;

  if not found then
    return 'not_found';
  end if;

  if current_status <> 'rejected' then
    return 'unchanged';
  end if;

  update public.hackathon_candidates
  set status = 'pending', reviewed_at = null, reviewer_note = null
  where id = move_candidate_to_pending.candidate_id and status = 'rejected';

  return 'updated';
end;
$$;

grant execute on function public.move_candidate_to_pending(uuid) to service_role;
