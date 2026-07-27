-- ============================================================================
-- Brazos · Terms of Service / Privacy Policy acceptance
-- Paste into Supabase → SQL Editor and run. Safe to re-run (idempotent).
--
-- Contents
--   1. legal_acceptances table + RLS
--   2. accept_legal_documents() — records acceptance on the server's clock
--   3. Marker function for scripts/verify-schema.mjs
--
-- ---------------------------------------------------------------------------
-- WHY A TABLE RATHER THAN COLUMNS ON profiles
-- ---------------------------------------------------------------------------
-- What matters legally is "who agreed to WHICH TEXT, WHEN". A pair of columns
-- on `profiles` could only ever hold the latest answer, so re-issuing the
-- Terms would overwrite the evidence that the user ever accepted the previous
-- version — exactly the record you would need if an old agreement were ever
-- disputed. One append-only row per (user, document, version) keeps the whole
-- history.
--
-- It also keeps the acceptance record off `profiles`, whose SELECT policy is
-- `using (true)` — every authenticated user can read every profile row. When
-- someone agreed to the Terms is nobody else's business.
--
-- ---------------------------------------------------------------------------
-- WHY NO UPDATE OR DELETE POLICY
-- ---------------------------------------------------------------------------
-- An acceptance record that the user can edit or erase is not evidence of
-- anything. Rows are insert-only from the client's side: the only policies
-- granted are SELECT (your own) and INSERT (your own, via the function).
-- ============================================================================

-- 1. The record ------------------------------------------------------------
create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Which document. Kept as text rather than an enum so adding a third
  -- document later doesn't need an enum migration.
  document text not null,
  -- The exact version string that was on screen. Matches TERMS_VERSION /
  -- PRIVACY_VERSION in lib/legal/index.ts.
  version text not null,
  accepted_at timestamptz not null default now(),
  constraint legal_acceptances_document_valid
    check (document in ('terms', 'privacy')),
  -- Accepting the same version twice is a no-op rather than a second row.
  unique (user_id, document, version)
);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances (user_id);

alter table public.legal_acceptances enable row level security;

-- A user may read their own acceptance history and nothing else.
drop policy if exists "legal_acceptances_select_own" on public.legal_acceptances;
create policy "legal_acceptances_select_own"
  on public.legal_acceptances for select
  to authenticated
  using (user_id = auth.uid());

-- Insert is allowed only for yourself. Deliberately no UPDATE or DELETE
-- policy: these rows are append-only evidence.
drop policy if exists "legal_acceptances_insert_own" on public.legal_acceptances;
create policy "legal_acceptances_insert_own"
  on public.legal_acceptances for insert
  to authenticated
  with check (user_id = auth.uid());

-- 2. Recording acceptance ---------------------------------------------------
-- Takes the whole set at once so accepting the Terms and the Privacy Policy
-- from a single checkbox is one atomic write — there is no state where a user
-- is recorded as having accepted one but not the other.
--
-- accepted_at is NOT accepted from the client. It comes from now() inside the
-- database, so the timestamp can't be back- or forward-dated by a device with
-- a wrong (or deliberately altered) clock.
create or replace function public.accept_legal_documents(p_documents jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
  v_doc jsonb;
  v_key text;
  v_version text;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' then
    raise exception 'Expected an array of documents';
  end if;

  for v_doc in select * from jsonb_array_elements(p_documents)
  loop
    v_key := v_doc->>'document';
    v_version := v_doc->>'version';

    if v_key is null or btrim(v_key) = '' then
      raise exception 'Document key missing';
    end if;
    if v_version is null or btrim(v_version) = '' then
      raise exception 'Document version missing';
    end if;

    insert into public.legal_acceptances (user_id, document, version)
    values (v_user, v_key, v_version)
    on conflict (user_id, document, version) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.accept_legal_documents(jsonb) from public;
grant execute on function public.accept_legal_documents(jsonb) to authenticated;

comment on function public.accept_legal_documents(jsonb) is
  'Records acceptance of one or more legal documents for the calling user, timestamped by the server clock.';

-- 3. Marker so scripts/verify-schema.mjs can confirm this migration ran.
create or replace function public.legal_acceptance_enabled()
returns boolean
language sql
immutable
as $$
  select true;
$$;

revoke all on function public.legal_acceptance_enabled() from public;
grant execute on function public.legal_acceptance_enabled() to authenticated;
