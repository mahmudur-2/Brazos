-- 20261003000700_ugc_moderation.sql — FIX-RUN B3 (2026-10-03): Apple guideline 1.2, the
-- server half. User-generated content can be reported where it is shown, reported as
-- inappropriate, and a short word list is refused at write time on every surface that
-- publishes a person's own words.
--
-- 1. reports.reason gains 'inappropriate' (the allow-list re-stated whole), and a report can
--    name the thing it is about: subject_kind + subject_id, both null (a report about a person,
--    as chat and the inbox file today) or both set to one of five kinds. Policies unchanged —
--    reports_insert_own already scopes the reporter. admin_open_reports() keeps its return
--    shape: changing it needs a drop and a re-grant, and no admin surface reads the subject yet.
--
-- 2. public.blocked_terms — the list. RLS on, no policy, and no grant to anon or authenticated:
--    nobody reads it but the trigger function. Each term is lower-case letters and single
--    spaces only, so a term can never carry a regex metacharacter into the match below.
--    Deliberately short and unambiguous (slurs and explicit terms); words with an everyday
--    meaning on a home-services marketplace ("spic and span", "a chink in the frame", a
--    cigarette) are left out on purpose. Changing the list is an insert or a delete by the
--    operator — no migration needed.
--
-- 3. public.reject_blocked_terms() — a BEFORE INSERT OR UPDATE trigger function, SECURITY
--    DEFINER (the caller cannot read blocked_terms), search_path pinned. Its arguments name the
--    columns to check. A term matches on word boundaries only (\m … \M, case-insensitive), so
--    a longer word that merely contains one passes. On UPDATE a column whose value did not
--    change is skipped, so a legacy row never blocks an unrelated edit (a status move, a photo,
--    a price). The refusal is a plain sentence — userMessage() shows it as written — with
--    hint 'blocked_content' for anything that wants to tell it apart.
--
-- 4. The triggers: jobs (title, description), profiles (bio), reviews (comment), messages
--    (content), job_offers (message), portfolio_items (caption). System messages carry fixed
--    text or '' (ban_user, the offer events), so no server flow writes a user's words twice.
--
-- NOT DESTRUCTIVE under scripts/staging-scan.sh: `drop constraint` is the repository's ordinary
-- CHECK-widening idiom, and nothing else here drops, renames, truncates or deletes. Reversible:
-- one corrective migration drops the six triggers, the function and the table, and re-states
-- the old reason list.

-- ---------------------------------------------------------------------------
-- 1. reports
-- ---------------------------------------------------------------------------
alter table public.reports drop constraint if exists reports_reason_valid;
alter table public.reports add constraint reports_reason_valid
  check (reason = any (array['no_show', 'unsafe', 'harassment', 'scam', 'inappropriate', 'other']));

alter table public.reports add column if not exists subject_kind text;
alter table public.reports add column if not exists subject_id uuid;
alter table public.reports drop constraint if exists reports_subject_valid;
alter table public.reports add constraint reports_subject_valid check (
  (subject_kind is null and subject_id is null)
  or (subject_kind = any (array['job', 'profile', 'review', 'portfolio_item', 'message']) and subject_id is not null)
);

comment on column public.reports.subject_kind is
  'FIX-RUN B3: what the report is about — job, profile, review, portfolio_item or message; null for a report about the person alone.';
comment on column public.reports.subject_id is
  'FIX-RUN B3: the id of the reported job, profile, review, portfolio item or message; null exactly when subject_kind is.';

-- ---------------------------------------------------------------------------
-- 2. blocked_terms
-- ---------------------------------------------------------------------------
create table if not exists public.blocked_terms (
  term text primary key,
  constraint blocked_terms_shape check (term ~ '^[a-z]+( [a-z]+)*$' and length(term) between 2 and 40)
);
alter table public.blocked_terms enable row level security;
revoke all on table public.blocked_terms from public, anon, authenticated;

comment on table public.blocked_terms is
  'FIX-RUN B3: words refused at write time by reject_blocked_terms(). Lower-case letters and single spaces only. Read by nobody but that function.';

insert into public.blocked_terms (term) values
  ('nigger'), ('niggers'), ('nigga'), ('niggas'),
  ('faggot'), ('faggots'),
  ('kike'), ('kikes'),
  ('wetback'), ('wetbacks'),
  ('tranny'), ('trannies'),
  ('retard'), ('retards'),
  ('fuck'), ('fucks'), ('fucked'), ('fucker'), ('fuckers'), ('fucking'),
  ('motherfucker'), ('motherfuckers'),
  ('cunt'), ('cunts'),
  ('cocksucker'), ('cocksuckers'),
  ('whore'), ('whores'),
  ('slut'), ('sluts'),
  ('blowjob'), ('handjob'),
  ('porn'), ('porno')
on conflict (term) do nothing;

-- ---------------------------------------------------------------------------
-- 3. reject_blocked_terms()
-- ---------------------------------------------------------------------------
create or replace function public.reject_blocked_terms() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_col text;
  v_text text;
begin
  foreach v_col in array tg_argv loop
    v_text := v_new ->> v_col;
    if v_text is null or btrim(v_text) = '' then
      continue;
    end if;
    -- An unchanged column is never re-judged: a legacy row keeps working.
    if v_old is not null and (v_old ->> v_col) is not distinct from v_text then
      continue;
    end if;
    if exists (select 1 from public.blocked_terms b where v_text ~* ('\m' || b.term || '\M')) then
      raise exception 'That includes words Brazos doesn''t allow. Edit it and try again.'
        using errcode = 'P0001', hint = 'blocked_content';
    end if;
  end loop;
  return new;
end;
$$;

-- A trigger function is never called by a role, and the CREATE-time default grants EXECUTE to
-- PUBLIC: revoke it from everyone the app signs in as (CLAUDE.md §Supabase, phase69).
revoke all on function public.reject_blocked_terms() from public, anon, authenticated;

comment on function public.reject_blocked_terms() is
  'FIX-RUN B3: refuses a write whose named text columns contain a blocked_terms word (word boundaries, case-insensitive); unchanged columns on UPDATE are skipped.';

-- ---------------------------------------------------------------------------
-- 4. The six surfaces
-- ---------------------------------------------------------------------------
create or replace trigger jobs_reject_blocked_terms
  before insert or update of title, description on public.jobs
  for each row execute function public.reject_blocked_terms('title', 'description');

create or replace trigger profiles_reject_blocked_terms
  before insert or update of bio on public.profiles
  for each row execute function public.reject_blocked_terms('bio');

create or replace trigger reviews_reject_blocked_terms
  before insert or update of comment on public.reviews
  for each row execute function public.reject_blocked_terms('comment');

create or replace trigger messages_reject_blocked_terms
  before insert or update of content on public.messages
  for each row execute function public.reject_blocked_terms('content');

create or replace trigger job_offers_reject_blocked_terms
  before insert or update of message on public.job_offers
  for each row execute function public.reject_blocked_terms('message');

create or replace trigger portfolio_items_reject_blocked_terms
  before insert or update of caption on public.portfolio_items
  for each row execute function public.reject_blocked_terms('caption');
