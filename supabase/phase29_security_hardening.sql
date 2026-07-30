-- ============================================================================
-- Brazos · Phase 29 security hardening
--
-- Apply to a disposable/staging Supabase project before deploying the matching
-- client. This migration is additive/restrictive: it does not delete user rows
-- or storage objects, but it intentionally revokes unsafe direct writes and
-- makes chat media buckets private.
--
-- Fixes:
--   * protected profile fields could be changed through a normal table update
--   * every authenticated user could select every profile column, including phone
--   * jobs/bids could be inserted or updated with protected state fields
--   * bid acceptance was split across two client requests
--   * review inserts trusted caller-supplied identity fields
--   * exact job locations could be changed outside the validated edit flow
--   * avatar/job/chat upload policies did not bind object paths to the caller
--   * chat photos and voice notes were publicly readable
-- ============================================================================

begin;

-- A missing profile must not be treated as an active account.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and not coalesce(p.banned, false)
  );
$$;

revoke all on function public.is_active_user() from public;
grant execute on function public.is_active_user() to authenticated;

-- Policy helpers keep private moderation columns out of caller-executed
-- subqueries after column SELECT privileges are narrowed below.
create or replace function public.is_profile_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and not coalesce(p.banned, false)
  );
$$;

revoke all on function public.is_profile_active(uuid) from public;
grant execute on function public.is_profile_active(uuid) to authenticated;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and coalesce(p.is_admin, false)
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles: public marketplace columns are selectable; phone and moderation
-- fields are returned only by a self-scoped SECURITY DEFINER function.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;

revoke select, insert, update, delete on public.profiles from anon;
revoke select, insert, update, delete on public.profiles from authenticated;
revoke select, insert, update, delete on public.profiles from public;

grant select (
  id,
  full_name,
  avatar_url,
  role,
  verification_status,
  rating_avg,
  rating_count,
  bio,
  language,
  categories,
  completion_rate,
  on_time_pct,
  response_time
) on public.profiles to authenticated;

create or replace function public.get_my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.*
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function public.get_my_profile() from public;
grant execute on function public.get_my_profile() to authenticated;

create or replace function public.current_user_is_banned()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.banned from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.current_user_is_banned() from public;
grant execute on function public.current_user_is_banned() to authenticated;

create or replace function public.update_my_profile(p_patch jsonb)
returns setof public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_categories text[];
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_user() then
    raise exception 'Suspended accounts cannot update profiles';
  end if;
  if jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object' then
    raise exception 'Profile update must be an object';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_patch, '{}'::jsonb)) as k(key)
    where k.key not in (
      'full_name', 'phone', 'avatar_url', 'bio', 'language', 'categories'
    )
  ) then
    raise exception 'Profile update contains a protected or unknown field';
  end if;

  if p_patch ? 'full_name'
     and (length(btrim(coalesce(p_patch->>'full_name', ''))) < 1
          or length(btrim(p_patch->>'full_name')) > 100) then
    raise exception 'Full name must be between 1 and 100 characters';
  end if;
  if p_patch ? 'phone'
     and (length(btrim(coalesce(p_patch->>'phone', ''))) < 7
          or length(btrim(p_patch->>'phone')) > 30) then
    raise exception 'Phone number is invalid';
  end if;
  if p_patch ? 'avatar_url'
     and p_patch->>'avatar_url' is not null
     and length(p_patch->>'avatar_url') > 2048 then
    raise exception 'Avatar URL is too long';
  end if;
  if p_patch ? 'bio'
     and length(coalesce(p_patch->>'bio', '')) > 200 then
    raise exception 'Bio is too long';
  end if;
  if p_patch ? 'language'
     and p_patch->>'language' not in ('en', 'es') then
    raise exception 'Unsupported language';
  end if;
  if p_patch ? 'categories' then
    if jsonb_typeof(p_patch->'categories') <> 'array'
       or jsonb_array_length(p_patch->'categories') > 20 then
      raise exception 'Categories must be an array with at most 20 entries';
    end if;
    select coalesce(array_agg(c.value), '{}'::text[])
      into v_categories
      from jsonb_array_elements_text(p_patch->'categories') as c(value);
  end if;

  update public.profiles p
  set
    full_name = case
      when p_patch ? 'full_name' then btrim(p_patch->>'full_name')
      else p.full_name
    end,
    phone = case
      when p_patch ? 'phone' then btrim(p_patch->>'phone')
      else p.phone
    end,
    avatar_url = case
      when p_patch ? 'avatar_url' then nullif(p_patch->>'avatar_url', '')
      else p.avatar_url
    end,
    bio = case
      when p_patch ? 'bio' then nullif(btrim(p_patch->>'bio'), '')
      else p.bio
    end,
    language = case
      when p_patch ? 'language' then p_patch->>'language'
      else p.language
    end,
    categories = case
      when p_patch ? 'categories' then v_categories
      else p.categories
    end
  where p.id = v_user;

  if not found then
    raise exception 'Profile not found';
  end if;

  return query select p.* from public.profiles p where p.id = v_user;
end;
$$;

revoke all on function public.update_my_profile(jsonb) from public;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- Rebuild policies that previously selected private profile moderation columns
-- as the caller. The SECURITY DEFINER predicates expose only a boolean.
drop policy if exists "reports_select_admin" on public.reports;
create policy "reports_select_admin"
  on public.reports for select
  to authenticated
  using (public.current_user_is_admin());

drop policy if exists "reports_update_admin" on public.reports;
create policy "reports_update_admin"
  on public.reports for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "jobs_select_open" on public.jobs;
create policy "jobs_select_open"
  on public.jobs for select
  to authenticated
  using (
    status = 'open'
    and public.is_profile_active(client_id)
  );

drop policy if exists "bids_select_job_owner" on public.bids;
create policy "bids_select_job_owner"
  on public.bids for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = bids.job_id
        and j.client_id = auth.uid()
    )
    and public.is_profile_active(worker_id)
  );

-- ---------------------------------------------------------------------------
-- Marketplace writes: callers may read rows allowed by RLS, but protected
-- state changes must go through the validated functions below.
-- ---------------------------------------------------------------------------

drop policy if exists "jobs_insert_own" on public.jobs;
drop policy if exists "jobs_update_own" on public.jobs;
drop policy if exists "jobs_update_assigned_worker" on public.jobs;
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_delete_own"
  on public.jobs for delete
  to authenticated
  using (
    client_id = auth.uid()
    and status = 'open'
    and public.is_active_user()
    and not exists (
      select 1 from public.bids b where b.job_id = jobs.id
    )
  );
revoke insert, update on public.jobs from authenticated;
revoke insert, update on public.jobs from anon;
revoke insert, update on public.jobs from public;

drop policy if exists "bids_insert_own" on public.bids;
drop policy if exists "bids_update_own" on public.bids;
drop policy if exists "bids_update_job_owner" on public.bids;
revoke insert, update on public.bids from authenticated;
revoke insert, update on public.bids from anon;
revoke insert, update on public.bids from public;

drop policy if exists "reviews_insert_party" on public.reviews;
revoke insert, update, delete on public.reviews from authenticated;
revoke insert, update, delete on public.reviews from anon;
revoke insert, update, delete on public.reviews from public;

drop policy if exists "job_locations_insert_owner" on public.job_locations;
drop policy if exists "job_locations_update_owner" on public.job_locations;
drop policy if exists "job_locations_delete_owner" on public.job_locations;
revoke insert, update, delete on public.job_locations from authenticated;
revoke insert, update, delete on public.job_locations from anon;
revoke insert, update, delete on public.job_locations from public;

create or replace function public.create_job(
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Title must be between 1 and 80 characters';
  end if;
  if length(btrim(coalesce(p_description, ''))) not between 1 and 500 then
    raise exception 'Description must be between 1 and 500 characters';
  end if;
  if length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Location is required';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
    raise exception 'Photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;

  insert into public.jobs (
    client_id, title, description, category, location,
    budget_cents, photos, status
  )
  values (
    v_user, btrim(p_title), btrim(p_description), p_category, btrim(p_location),
    p_budget_cents, coalesce(p_photos, '[]'::jsonb), 'open'
  )
  returning * into v_job;

  if p_lat is not null then
    insert into public.job_locations (job_id, lat, lng)
    values (v_job.id, p_lat, p_lng);
  end if;

  return v_job;
end;
$$;

revoke all on function public.create_job(
  text, text, public.job_category, text, integer, jsonb, double precision, double precision
) from public;
grant execute on function public.create_job(
  text, text, public.job_category, text, integer, jsonb, double precision, double precision
) to authenticated;

create or replace function public.update_job_details(
  p_job_id uuid,
  p_title text,
  p_description text,
  p_category public.job_category,
  p_location text,
  p_budget_cents integer default null,
  p_photos jsonb default '[]'::jsonb,
  p_lat double precision default null,
  p_lng double precision default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_user then
    raise exception 'Job not found or not owned by caller';
  end if;
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if v_job.status <> 'open'
     or exists (select 1 from public.bids b where b.job_id = p_job_id) then
    raise exception 'Jobs can only be edited while open and before the first bid';
  end if;
  if length(btrim(coalesce(p_title, ''))) not between 1 and 80
     or length(btrim(coalesce(p_description, ''))) not between 1 and 500
     or length(btrim(coalesce(p_location, ''))) not between 1 and 200 then
    raise exception 'Job details are invalid';
  end if;
  if p_budget_cents is not null and p_budget_cents <= 0 then
    raise exception 'Budget must be positive';
  end if;
  if jsonb_typeof(coalesce(p_photos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_photos, '[]'::jsonb)) > 5 then
    raise exception 'Photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_photos, '[]'::jsonb)) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each photo must be a valid URL or storage reference';
  end if;
  if (p_lat is null) <> (p_lng is null)
     or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'Coordinates are invalid';
  end if;

  update public.jobs
  set
    title = btrim(p_title),
    description = btrim(p_description),
    category = p_category,
    location = btrim(p_location),
    budget_cents = p_budget_cents,
    photos = coalesce(p_photos, '[]'::jsonb)
  where id = p_job_id
  returning * into v_job;

  if p_lat is null then
    delete from public.job_locations where job_id = p_job_id;
  else
    insert into public.job_locations (job_id, lat, lng)
    values (p_job_id, p_lat, p_lng)
    on conflict (job_id) do update set lat = excluded.lat, lng = excluded.lng;
  end if;

  return v_job;
end;
$$;

revoke all on function public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision
) from public;
grant execute on function public.update_job_details(
  uuid, text, text, public.job_category, text, integer, jsonb, double precision, double precision
) to authenticated;

create or replace function public.create_bid(
  p_job_id uuid,
  p_amount_cents integer,
  p_message text default ''
)
returns public.bids
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_bid public.bids;
begin
  select * into v_job from public.jobs where id = p_job_id for share;
  if not found or v_job.status <> 'open' then
    raise exception 'Job is not open';
  end if;
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if v_job.client_id = v_user then
    raise exception 'A client cannot bid on their own job';
  end if;
  if public.is_blocked_between(v_user, v_job.client_id) then
    raise exception 'Bid is not allowed';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'Bid amount must be positive';
  end if;
  if length(coalesce(p_message, '')) > 500 then
    raise exception 'Bid message is too long';
  end if;

  insert into public.bids (job_id, worker_id, amount_cents, message, status)
  values (p_job_id, v_user, p_amount_cents, nullif(btrim(p_message), ''), 'pending')
  returning * into v_bid;

  return v_bid;
end;
$$;

revoke all on function public.create_bid(uuid, integer, text) from public;
grant execute on function public.create_bid(uuid, integer, text) to authenticated;

create or replace function public.accept_bid(p_job_id uuid, p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_bid public.bids;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.client_id <> v_user then
    raise exception 'Job not found or not owned by caller';
  end if;
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if v_job.status <> 'open' or v_job.accepted_bid_id is not null then
    raise exception 'Job no longer accepts bids';
  end if;

  select * into v_bid
  from public.bids
  where id = p_bid_id and job_id = p_job_id
  for update;

  if not found or v_bid.status <> 'pending' then
    raise exception 'Bid is not pending for this job';
  end if;
  if not public.is_profile_active(v_bid.worker_id)
     or public.is_blocked_between(v_user, v_bid.worker_id) then
    raise exception 'Worker is not available';
  end if;

  update public.jobs
  set
    status = 'assigned',
    assigned_worker_id = v_bid.worker_id,
    accepted_bid_id = v_bid.id,
    final_amount_cents = v_bid.amount_cents
  where id = p_job_id;

  update public.bids
  set status = case when id = p_bid_id then 'accepted'::bid_status else 'rejected'::bid_status end
  where job_id = p_job_id and status = 'pending';
end;
$$;

revoke all on function public.accept_bid(uuid, uuid) from public;
grant execute on function public.accept_bid(uuid, uuid) to authenticated;

create or replace function public.transition_job_status(
  p_job_id uuid,
  p_status text,
  p_completion_photos jsonb default null
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_photos jsonb := coalesce(p_completion_photos, '[]'::jsonb);
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found or v_job.assigned_worker_id <> v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if not (
    (v_job.status = 'assigned' and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  if jsonb_typeof(v_photos) <> 'array' or jsonb_array_length(v_photos) > 5 then
    raise exception 'Completion photos must be an array with at most 5 entries';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_photos) as photo(value)
    where jsonb_typeof(photo.value) <> 'string'
       or length(photo.value #>> '{}') > 2048
  ) then
    raise exception 'Each completion photo must be a valid URL or storage reference';
  end if;

  update public.jobs
  set
    status = p_status::job_status,
    completion_photos = case
      when p_status = 'completed' and p_completion_photos is not null then v_photos
      else completion_photos
    end,
    completion_photo_url = case
      when p_status = 'completed' and jsonb_array_length(v_photos) > 0
        then v_photos->>0
      else completion_photo_url
    end
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.transition_job_status(uuid, text, jsonb) from public;
grant execute on function public.transition_job_status(uuid, text, jsonb) to authenticated;

create or replace function public.create_review(
  p_job_id uuid,
  p_reviewee_id uuid,
  p_rating integer,
  p_comment text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_job public.jobs;
  v_review public.reviews;
begin
  select * into v_job from public.jobs where id = p_job_id;
  if not found or v_job.status <> 'completed' then
    raise exception 'Completed job not found';
  end if;
  if v_user is null or not public.is_active_user() then
    raise exception 'Active authentication required';
  end if;
  if not (
    (v_job.client_id = v_user and p_reviewee_id = v_job.assigned_worker_id)
    or (v_job.assigned_worker_id = v_user and p_reviewee_id = v_job.client_id)
  ) then
    raise exception 'Review parties are invalid';
  end if;
  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;
  if length(coalesce(p_comment, '')) > 1000 then
    raise exception 'Review comment is too long';
  end if;

  insert into public.reviews (
    job_id, reviewer_id, reviewee_id, rating, comment
  )
  values (
    p_job_id, v_user, p_reviewee_id, p_rating, nullif(btrim(p_comment), '')
  )
  returning * into v_review;

  return v_review;
end;
$$;

revoke all on function public.create_review(uuid, uuid, integer, text) from public;
grant execute on function public.create_review(uuid, uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public job/avatar media keeps its existing read behavior, but writes
-- are path-owned. Chat media becomes private and requires job membership.
-- New chat uploads use {jobId}/{userId}/{unique}; existing {jobId}/{unique}
-- objects remain readable to the job parties after the bucket becomes private.
-- ---------------------------------------------------------------------------

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_active_user()
  );

drop policy if exists "job_photos_insert" on storage.objects;
create policy "job_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'job-photos'
    and public.is_active_user()
    and (
      (
        (storage.foldername(name))[1] = 'postings'
        and (storage.foldername(name))[2] = auth.uid()::text
      )
      or (
        (storage.foldername(name))[1] <> 'postings'
        and exists (
          select 1
          from public.jobs j
          where j.id::text = (storage.foldername(name))[1]
            and j.assigned_worker_id = auth.uid()
        )
      )
    )
  );

update storage.buckets
set public = false
where id in ('chat-photos', 'chat-audio');

drop policy if exists "chat_photos_read" on storage.objects;
drop policy if exists "chat_photos_insert" on storage.objects;
drop policy if exists "chat_audio_read" on storage.objects;
drop policy if exists "chat_audio_insert" on storage.objects;

create policy "chat_photos_read_party"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-photos'
    and exists (
      select 1
      from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
  );

create policy "chat_photos_insert_party"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-photos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_active_user()
    and exists (
      select 1
      from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
        and not public.is_blocked_between(
          j.client_id,
          coalesce(j.assigned_worker_id, j.client_id)
        )
    )
  );

create policy "chat_audio_read_party"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-audio'
    and exists (
      select 1
      from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
  );

create policy "chat_audio_insert_party"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-audio'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_active_user()
    and exists (
      select 1
      from public.jobs j
      where j.id::text = (storage.foldername(name))[1]
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
        and not public.is_blocked_between(
          j.client_id,
          coalesce(j.assigned_worker_id, j.client_id)
        )
    )
  );

commit;
