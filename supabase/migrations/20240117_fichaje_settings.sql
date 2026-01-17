-- Update function to return details of closed sessions
create or replace function public.auto_close_stale_sessions()
returns table(id bigint, user_id uuid, start_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  _enabled boolean;
  _hours int;
  _minutes int;
  _max_interval interval;
begin
  -- 1. Get settings
  select auto_close_enabled, max_hours_duration, max_minutes_duration
  into _enabled, _hours, _minutes
  from public.fichaje_settings
  where id = 1;

  if not _enabled then
    return; -- returns empty set
  end if;

  -- 2. Calculate interval
  _max_interval := make_interval(hours := _hours, mins := _minutes);

  -- 3. Update and return
  return query
  with closed_rows as (
    update public.time_entries
    set
      end_at = start_at + _max_interval,
      note = coalesce(note, '') || ' [AUTO-CIERRE]'
    where end_at is null
      and (now() - start_at) > _max_interval
    returning time_entries.id, time_entries.user_id, time_entries.start_at
  )
  select * from closed_rows;
end;
$$;
