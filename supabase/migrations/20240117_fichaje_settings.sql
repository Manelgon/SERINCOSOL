-- =========================================
-- FICHAJE SETTINGS & AUTO-CIERRE
-- =========================================

-- 1) Table: fichaje_settings
-- Only one row allowed usually (singleton), enforced by logic or check constraint
create table if not exists public.fichaje_settings (
  id int primary key default 1 check (id = 1), -- force singleton
  auto_close_enabled boolean not null default true,
  max_hours_duration int not null default 12,
  max_minutes_duration int not null default 0,
  updated_at timestamptz default now()
);

-- Insert default row
insert into public.fichaje_settings (id, auto_close_enabled, max_hours_duration, max_minutes_duration)
values (1, true, 12, 0)
on conflict (id) do nothing;

-- RLS
alter table public.fichaje_settings enable row level security;

-- Everyone can read stats (maybe restrict to admin?)
-- Let's restrict read/write to admin only for security
drop policy if exists "fichaje_settings: admin only" on public.fichaje_settings;
create policy "fichaje_settings: admin only"
on public.fichaje_settings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- 2) Function: admin_clock_out
-- Allows admin to close a specific user's session
create or replace function public.admin_clock_out(_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_id bigint;
begin
  -- Check admin permission
  if not public.is_admin() then
    raise exception 'Access denied: admins only';
  end if;

  update public.time_entries
  set
    end_at = now(),
    note = coalesce(note, '') || ' [Cerrado por Admin]'
  where user_id = _user_id
    and end_at is null
  returning id into updated_id;

  return updated_id; -- returns null if no open session found
end;
$$;

-- 3) Function: auto_close_stale_sessions
-- To be called by cron / scheduled task
create or replace function public.auto_close_stale_sessions()
returns table(closed_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  _enabled boolean;
  _hours int;
  _minutes int;
  _max_interval interval;
  _cnt int;
begin
  -- 1. Get settings
  select auto_close_enabled, max_hours_duration, max_minutes_duration
  into _enabled, _hours, _minutes
  from public.fichaje_settings
  where id = 1;

  if not _enabled then
    closed_count := 0;
    return next;
    return;
  end if;

  -- 2. Calculate interval
  _max_interval := make_interval(hours := _hours, mins := _minutes);

  -- 3. Update stale sessions
  -- Logic: set end_at = start_at + max_duration (so it doesn't count as infinite time)
  -- Or set end_at = now()? 
  -- Usually better to cap it at max duration so they don't get paid for 48 hours if cron fails.
  -- BUT if they just forgot to close it 5 mins ago, capping at 12h adds 11h 55m.
  -- Let's stick to "now()" but maybe capping is better for "forgotten" sessions.
  -- Let's do: end_at = start_at + _max_interval
  
  with closed_rows as (
    update public.time_entries
    set
      end_at = start_at + _max_interval,
      note = coalesce(note, '') || ' [AUTO-CIERRE]'
    where end_at is null
      and (now() - start_at) > _max_interval
    returning id
  )
  select count(*) into _cnt from closed_rows;

  closed_count := _cnt;
  return next;
end;
$$;
