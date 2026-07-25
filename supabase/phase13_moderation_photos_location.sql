-- ============================================================================
-- Brazos · Blocks/mutes, reports + admin bans, job photos
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Contents
--   1. profiles: is_admin, banned  (+ banned_phones for re-registration blocks)
--   2. blocks / mutes tables + RLS
--   3. helper predicates: is_active_user(), is_blocked_between()
--   4. reports table + RLS (create own; only admins read)
--   5. jobs.photos jsonb  (attachments shown to workers when bidding)
--   6. hardened RLS: banned users can't post/bid/message; blocked pairs can't
--      message; banned users' jobs/bids are hidden from everyone else
--   7. ban_user() / unban_user() admin functions (cancel active jobs + notify)
--   8. handle_new_user(): reject signup on a banned phone number
--
-- Ordering note: is_blocked_between() is LANGUAGE SQL (not plpgsql) so it can
-- be inlined into the RLS policies that call it (cheaper than an opaque
-- function call evaluated per row). Unlike plpgsql, a SQL-language function
-- body is parsed against the catalog at CREATE FUNCTION time, not lazily on
-- first call — so `blocks` must already exist before this file defines it.
-- That's why blocks/mutes (section 2) come before the helper predicates
-- (section 3), even though "tables before the things that query them" reads
-- backwards from how the rest of this file is grouped.
-- ============================================================================

-- 1. Moderation columns ------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists banned boolean not null default false;

-- Bans follow the phone number, not just the account, so a ban survives a
-- fresh signup with the same number.
create table if not exists public.banned_phones (
  phone text primary key,
  banned_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.banned_phones enable row level security;
-- No policies: only SECURITY DEFINER functions (ban_user / handle_new_user)
-- touch this table. Nothing client-side should read or write it.

-- 2. Blocks & mutes ----------------------------------------------------------
-- Created before the helper predicates below — is_blocked_between() is a
-- LANGUAGE SQL function that references `blocks`, and SQL-language function
-- bodies are validated against the catalog at CREATE FUNCTION time (unlike
-- plpgsql), so the table has to exist first.
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- A user manages only their own blocks. They may also read rows where they are
-- the blocked party, so the app can show "this person blocked you" state.
drop policy if exists "blocks_select_involved" on public.blocks;
create policy "blocks_select_involved"
  on public.blocks for select
  to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
  on public.blocks for insert
  to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own"
  on public.blocks for delete
  to authenticated
  using (blocker_id = auth.uid());

create table if not exists public.mutes (
  id uuid primary key default gen_random_uuid(),
  muter_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (muter_id, muted_id),
  constraint mutes_no_self check (muter_id <> muted_id)
);

alter table public.mutes enable row level security;

-- Mutes are private to the muter — the muted party must not be able to tell.
drop policy if exists "mutes_select_own" on public.mutes;
create policy "mutes_select_own"
  on public.mutes for select
  to authenticated
  using (muter_id = auth.uid());

drop policy if exists "mutes_insert_own" on public.mutes;
create policy "mutes_insert_own"
  on public.mutes for insert
  to authenticated
  with check (muter_id = auth.uid());

drop policy if exists "mutes_delete_own" on public.mutes;
create policy "mutes_delete_own"
  on public.mutes for delete
  to authenticated
  using (muter_id = auth.uid());

-- 3. Helper predicates -------------------------------------------------------

-- SECURITY DEFINER so it can read profiles.banned regardless of the caller's
-- visibility, and STABLE so Postgres can cache it within a statement.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not coalesce(
    (select p.banned from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

comment on function public.is_active_user() is
  'True when the calling user exists and is not banned. Used in write policies.';

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks bl
    where (bl.blocker_id = a and bl.blocked_id = b)
       or (bl.blocker_id = b and bl.blocked_id = a)
  );
$$;

comment on function public.is_blocked_between(uuid, uuid) is
  'True when either user has blocked the other (block is symmetric in effect).';

-- 4. Reports -----------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  reason text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_id),
  constraint reports_reason_valid check (
    reason in ('no_show', 'unsafe', 'harassment', 'scam', 'other')
  ),
  constraint reports_status_valid check (
    status in ('open', 'actioned', 'dismissed')
  )
);

create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- Users create their own reports and can never read anyone's (not even their
-- own back) — only admins read. Kept deliberately write-only for reporters so
-- the moderation queue isn't inspectable.
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid() and public.is_active_user());

drop policy if exists "reports_select_admin" on public.reports;
create policy "reports_select_admin"
  on public.reports for select
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports for update
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- 5. Job photos --------------------------------------------------------------
-- Chose a jsonb array on `jobs` over a separate job_photos table: the set is
-- small and hard-capped at 5 in the UI, it's always read together with the
-- job (never queried independently), and `jobs` already carries a scalar
-- image column (completion_photo_url) so this matches existing shape. A join
-- table would add a query for no benefit here.
alter table public.jobs
  add column if not exists photos jsonb not null default '[]'::jsonb;

-- 6. Hardened write policies -------------------------------------------------

-- Jobs: only active (non-banned) users may post.
drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own"
  on public.jobs for insert
  to authenticated
  with check (client_id = auth.uid() and public.is_active_user());

-- Browsing open jobs hides jobs posted by banned users.
drop policy if exists "jobs_select_open" on public.jobs;
create policy "jobs_select_open"
  on public.jobs for select
  to authenticated
  using (
    status = 'open'
    and not exists (
      select 1 from public.profiles p
      where p.id = jobs.client_id and p.banned
    )
  );

-- Bids: only active users may bid, and not on a job whose owner they've
-- blocked (or who has blocked them).
drop policy if exists "bids_insert_own" on public.bids;
create policy "bids_insert_own"
  on public.bids for insert
  to authenticated
  with check (
    worker_id = auth.uid()
    and public.is_active_user()
    and not exists (
      select 1 from public.jobs j
      where j.id = bids.job_id
        and public.is_blocked_between(auth.uid(), j.client_id)
    )
  );

-- A job's owner shouldn't see bids from banned workers (can't hire them).
drop policy if exists "bids_select_job_owner" on public.bids;
create policy "bids_select_job_owner"
  on public.bids for select
  to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = bids.job_id and j.client_id = auth.uid()
    )
    and not exists (
      select 1 from public.profiles p
      where p.id = bids.worker_id and p.banned
    )
  );

-- Messages: the block enforcement the app relies on. A blocked pair genuinely
-- cannot insert a message — this is not merely hidden in the UI.
drop policy if exists "messages_insert_party" on public.messages;
create policy "messages_insert_party"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_active_user()
    and exists (
      select 1 from public.jobs j
      where j.id = messages.job_id
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
        -- Neither direction of the pair may be blocked.
        and not public.is_blocked_between(
          j.client_id,
          coalesce(j.assigned_worker_id, j.client_id)
        )
    )
  );

-- 7. Admin actions -----------------------------------------------------------

-- Bans a user: flags the profile, blacklists their phone, cancels their active
-- jobs, and drops a system message into each affected conversation so the
-- other party learns why the job stopped.
create or replace function public.ban_user(p_target uuid, p_report_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_job record;
  v_other uuid;
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Only admins may ban users';
  end if;

  update public.profiles set banned = true where id = p_target;

  select phone into v_phone from public.profiles where id = p_target;
  if v_phone is not null and length(btrim(v_phone)) > 0 then
    insert into public.banned_phones (phone, banned_profile_id)
    values (btrim(v_phone), p_target)
    on conflict (phone) do nothing;
  end if;

  -- Cancel anything still in flight, notifying the counterparty.
  for v_job in
    select id, client_id, assigned_worker_id
    from public.jobs
    where status in ('open', 'assigned', 'in_progress')
      and (client_id = p_target or assigned_worker_id = p_target)
  loop
    update public.jobs set status = 'cancelled' where id = v_job.id;

    v_other := case
      when v_job.client_id = p_target then v_job.assigned_worker_id
      else v_job.client_id
    end;

    -- Notify the counterparty in the job's thread. There's no system-sender
    -- concept in `messages`, so this is attributed to the banned user — that
    -- way it lands as an INBOUND message for the person being notified,
    -- rather than appearing as something they sent themselves.
    if v_other is not null then
      insert into public.messages (job_id, sender_id, content)
      values (
        v_job.id,
        p_target,
        'This job was cancelled automatically because this account was suspended by Brazos.'
      );
    end if;
  end loop;

  if p_report_id is not null then
    update public.reports set status = 'actioned' where id = p_report_id;
  end if;
end;
$$;

revoke all on function public.ban_user(uuid, uuid) from public;
grant execute on function public.ban_user(uuid, uuid) to authenticated;

create or replace function public.unban_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  ) then
    raise exception 'Only admins may unban users';
  end if;

  update public.profiles set banned = false where id = p_target;
  delete from public.banned_phones where banned_profile_id = p_target;
end;
$$;

revoke all on function public.unban_user(uuid) from public;
grant execute on function public.unban_user(uuid) to authenticated;

-- Admin queue reader: reports plus the display names the screen needs, in one
-- call. SECURITY DEFINER + an explicit admin check inside.
create or replace function public.admin_open_reports()
returns table (
  id uuid,
  reporter_id uuid,
  reported_id uuid,
  reporter_name text,
  reported_name text,
  reported_banned boolean,
  job_id uuid,
  job_title text,
  reason text,
  description text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id, r.reporter_id, r.reported_id,
    rp.full_name, rd.full_name, rd.banned,
    r.job_id, j.title,
    r.reason, r.description, r.status, r.created_at
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join public.profiles rd on rd.id = r.reported_id
  left join public.jobs j on j.id = r.job_id
  where exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  )
  order by
    case when r.status = 'open' then 0 else 1 end,
    r.created_at desc;
$$;

revoke all on function public.admin_open_reports() from public;
grant execute on function public.admin_open_reports() to authenticated;

-- 8. Block re-registration on a banned phone ---------------------------------
-- Recreated from phase7 with the banned-phone check added. Raising here aborts
-- the auth.users insert, so the signup itself fails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(btrim(new.raw_user_meta_data->>'phone'), '');
begin
  if v_phone is not null and exists (
    select 1 from public.banned_phones bp where bp.phone = v_phone
  ) then
    raise exception 'This phone number is not eligible to register.';
  end if;

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    v_phone,
    'both'
  )
  on conflict (id) do update set
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
    role = coalesce(public.profiles.role, 'both');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
