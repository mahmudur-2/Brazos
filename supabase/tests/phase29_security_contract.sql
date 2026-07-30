-- Read-only contract checks for phase29.
--
-- Run only after applying phase29 to a disposable/staging project. The block
-- raises on the first failed security invariant and does not mutate data.
do $$
begin
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'DELETE') then
    raise exception 'authenticated still has a protected profiles table write';
  end if;

  if has_column_privilege('authenticated', 'public.profiles', 'phone', 'SELECT')
     or has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'SELECT')
     or has_column_privilege('authenticated', 'public.profiles', 'banned', 'SELECT') then
    raise exception 'authenticated can still select a private profile column';
  end if;

  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'SELECT')
     or not has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'SELECT') then
    raise exception 'public marketplace profile columns are not readable';
  end if;

  if has_table_privilege('authenticated', 'public.jobs', 'INSERT')
     or has_table_privilege('authenticated', 'public.jobs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.bids', 'INSERT')
     or has_table_privilege('authenticated', 'public.bids', 'UPDATE')
     or has_table_privilege('authenticated', 'public.reviews', 'INSERT')
     or has_table_privilege('authenticated', 'public.job_locations', 'INSERT')
     or has_table_privilege('authenticated', 'public.job_locations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.job_locations', 'DELETE') then
    raise exception 'authenticated still has a protected marketplace table write';
  end if;

  if not has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.update_my_profile(jsonb)', 'EXECUTE')
     or not has_function_privilege(
       'authenticated',
       'public.create_job(text,text,job_category,text,integer,jsonb,double precision,double precision)',
       'EXECUTE'
     )
     or not has_function_privilege('authenticated', 'public.create_bid(uuid,integer,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.accept_bid(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege(
       'authenticated',
       'public.transition_job_status(uuid,text,jsonb)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.create_review(uuid,uuid,integer,text)',
       'EXECUTE'
     ) then
    raise exception 'one or more hardened RPC grants are missing';
  end if;

  if exists (
    select 1
    from storage.buckets
    where id in ('chat-photos', 'chat-audio')
      and public
  ) then
    raise exception 'a chat-media bucket is still public';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'chat_photos_read_party'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'chat_audio_read_party'
  ) then
    raise exception 'private chat-media read policies are missing';
  end if;
end
$$;
