-- Task-18: exact raw deletion timestamp for group-local next-day 01:00.
-- Called explicitly by clips-finalize; not a trigger/default so application flow owns the decision.

create or replace function compute_raw_delete_at(group_id_arg uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (((now() at time zone g.timezone)::date + interval '1 day' + interval '1 hour') at time zone g.timezone)
  from groups g
  where g.id = group_id_arg;
$$;
