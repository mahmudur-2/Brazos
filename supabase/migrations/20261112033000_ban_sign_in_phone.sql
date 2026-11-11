-- B12 part 1 (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): a ban blocks
-- the phone the account signs in with.
--
-- ban_user() (20261108000000_lean_v1.sql:183-190) records profiles.phone in banned_phones, and
-- handle_new_user() (20261108010000_lean_v1_grants.sql:93-124) checks a new account's SIGN-IN phone
-- (auth.users.phone) against that list. The profile phone is editable (update_my_profile), so a
-- banned person could change it before the ban and sign up again with the number they really use.
-- Whenever an account becomes banned, its sign-in phone is now recorded too, in the form
-- handle_new_user() checks ('+' and the digits; GoTrue may store the number without its '+').
--
-- The record outlives the account: delete_my_account() tombstones the profile and never deletes it
-- (lean_v1.sql:779-795), only the auth.users row (:842), and no public foreign key points at
-- auth.users; banned_phones.banned_profile_id is ON DELETE SET NULL besides (baseline:6786-6787).
-- unban_user() removes rows by banned_profile_id (baseline:5107), so it lifts this one as well.
--
-- A trigger, so ban_user() and every other way the flag is set stay as they are. Additive.

begin;

create or replace function public.ban_record_sign_in_phone() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
begin
  select '+' || ltrim(nullif(btrim(u.phone), ''), '+') into v_phone
  from auth.users u
  where u.id = new.id;

  if v_phone is not null then
    insert into public.banned_phones (phone, banned_profile_id)
    values (v_phone, new.id)
    on conflict (phone) do nothing;
  end if;
  return null;
end;
$$;

-- A trigger function is never called by a role: revoke the CREATE-time PUBLIC grant.
revoke all on function public.ban_record_sign_in_phone() from public, anon, authenticated, service_role;
comment on function public.ban_record_sign_in_phone() is
  'B12 part 1: when an account becomes banned, its sign-in phone (auth.users.phone, normalized as handle_new_user() reads it) joins banned_phones next to the profile phone ban_user() records.';

create or replace trigger profiles_ban_record_sign_in_phone
  after update of banned on public.profiles
  for each row
  when (new.banned)
  execute function public.ban_record_sign_in_phone();

commit;
