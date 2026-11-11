-- B10, the caps (docs/lean/AUDIT-LEDGER.md; design docs/critical/privacy-and-limits.md): a chat
-- message and a report's description hold at most 2,000 characters.
--
-- Neither column had a server cap (messages.content, 20260901000000_baseline.sql:5741;
-- reports.description, :6129): the app's own limits (components/ChatComposer.tsx CHAT_MESSAGE_MAX,
-- components/ReportDialog.tsx) bound only the app. 2,000 is the chat composer's number, and the
-- issue report's (screens/ApproveOrDisputeScreen.tsx). The ban's own notice (83 characters) and the
-- empty offer cards pass. The pattern is reject_blocked_terms (20261003000700_ugc_moderation.sql):
-- the column, the cap and the sentence come in as trigger arguments; an UPDATE that leaves the
-- column as it was is not judged, so a legacy row keeps working.

begin;

create or replace function public.reject_overlong_text() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_text text := to_jsonb(new) ->> tg_argv[0];
begin
  if tg_op = 'UPDATE' and v_text is not distinct from (to_jsonb(old) ->> tg_argv[0]) then
    return new;
  end if;
  if char_length(v_text) > tg_argv[1]::integer then
    raise exception using errcode = 'P0001', message = tg_argv[2];
  end if;
  return new;
end;
$$;

-- A trigger function is never called by a role, and the CREATE-time default grants EXECUTE to
-- PUBLIC: revoke it from everyone the app signs in as (CLAUDE.md §Supabase).
revoke all on function public.reject_overlong_text() from public, anon, authenticated, service_role;

comment on function public.reject_overlong_text() is
  'B10: refuses a write whose named text column (argument 1) is longer than argument 2 characters, with the sentence in argument 3. An unchanged column on UPDATE is not judged.';

create or replace trigger messages_content_length
  before insert or update of content on public.messages
  for each row execute function public.reject_overlong_text(
    'content', '2000', 'That message is too long. Keep it under 2,000 characters.');

create or replace trigger reports_description_length
  before insert or update of description on public.reports
  for each row execute function public.reject_overlong_text(
    'description', '2000', 'That report is too long. Keep it under 2,000 characters.');

commit;
