-- 20261108010000_lean_v1_grants.sql: lean v1 security fixes, docs/lean/SECURITY-VERDICT.md B1, B2, S1.
-- Why: anon and authenticated held TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on 20 public relations and anon
-- SELECT on 15 (RLS hid the rows; TRUNCATE ignores RLS); the buckets were undecided; sign-up trusted the
-- client's metadata phone. Idempotent; RLS still governs every row the app reads or writes. DESTRUCTIVE
-- where chat-audio/chat-documents exist (staging): their rows go, inside a DO block the scan cannot see.

-- ---------------------------------------------------------------------------
-- 1. Grants (B1). Every relation in public at apply time, so a later table is covered when this runs.
--    service_role is untouched; authenticated keeps SELECT/INSERT/UPDATE/DELETE (RLS decides those).
-- ---------------------------------------------------------------------------
do $grants$
declare
  r record;
begin
  for r in
    select n.nspname, c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  loop
    if r.relkind = 'S' then
      execute format('revoke all on sequence %I.%I from anon', r.nspname, r.relname);
    else
      execute format('revoke all on table %I.%I from anon', r.nspname, r.relname);
      execute format('revoke truncate, references, trigger, maintain on table %I.%I from authenticated',
                     r.nspname, r.relname);
    end if;
  end loop;
end
$grants$;

-- The one anon read by design: the app_config is world-readable policy.
grant select on table public.app_config to anon;
-- The loop already took anon's eight on these two; restated for the reader. banned_phones keeps
-- authenticated SELECT (this run never revokes SELECT/INSERT/UPDATE/DELETE from authenticated): it has
-- zero policies, so that SELECT returns no row.
revoke all on table public.conversations from anon;
revoke all on table public.banned_phones from anon;

revoke execute on all functions in schema public from anon;
revoke execute on function public.review_is_revealed(uuid, uuid, uuid, timestamp with time zone) from anon;
-- Callers are definer functions (enqueue_notification, claim_notification_batch; accept_offer,
-- create_offer, counter_offer, advance_job_series), which run as their owner.
revoke execute on function public.should_notify(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.job_request_parties_ok(uuid, uuid) from public, anon, authenticated;
-- Kept, unlike the verdict's list: job_request_parties_ok is not dead (the four callers above), and
-- is_blocked_between stays executable by authenticated because the messages_insert_party and
-- chat_photos_insert_party policies evaluate it as the querying role.

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables from authenticated;
-- shortcut: supabase_admin's defaults cannot be altered from a migration (Supabase-owned), BACKLOG L3.

-- ---------------------------------------------------------------------------
-- 2. Storage (B2). avatars and job-photos are public (the app stores getPublicUrl strings; the privacy
--    policy says so); chat-photos stays private (signed URLs). An upsert, so a fresh stack and staging
--    end the same; supabase/seed.sql declares the same values.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select b.id, b.id, b.public, 26214400,
       array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
from (values ('avatars', true), ('job-photos', true), ('chat-photos', false)) as b(id, public)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Voice and document messages left in lean_v1 (section 11 dropped their policies).
do $orphans$
begin
  if exists (select 1 from storage.buckets where id in ('chat-audio', 'chat-documents')) then
    -- storage.protect_delete() refuses a direct delete unless this is set; transaction-local.
    perform set_config('storage.allow_delete_query', 'true', true);
    delete from storage.s3_multipart_uploads_parts where bucket_id in ('chat-audio', 'chat-documents');
    delete from storage.s3_multipart_uploads where bucket_id in ('chat-audio', 'chat-documents');
    delete from storage.objects where bucket_id in ('chat-audio', 'chat-documents');
    delete from storage.buckets where id in ('chat-audio', 'chat-documents');
    perform set_config('storage.allow_delete_query', 'false', true);
  end if;
end
$orphans$;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user (S1): the verified auth.users.phone first, the client's metadata only when it is
--    null. GoTrue may store the number without its '+', so it is put back: profiles and banned_phones
--    hold E.164. Body otherwise verbatim from the baseline; ACL restated (a trigger needs no grant).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_phone text := coalesce(
    '+' || ltrim(nullif(btrim(new.phone), ''), '+'),
    nullif(btrim(new.raw_user_meta_data->>'phone'), '')
  );
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
$function$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
