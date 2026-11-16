-- 20261116000000_access_allow_list.sql — production-36h S1, M1 (access): the block check answers only
-- the caller's own pairs, and signed-in users lose the table rights no app call and no robot uses.
--
-- 1. is_blocked_between becomes SECURITY INVOKER (B4). Its body is unchanged; ALTER FUNCTION keeps the
--    body, the search_path and the ACL. As the caller it reads public.blocks under blocks_select_involved
--    (blocker or blocked), so the blocker and the blocked person still get true, and anyone else gets
--    false: the function no longer tells a stranger who blocked whom. Its two policy callers
--    (messages_insert_party, chat_photos_insert_party) only ever ask about a pair the caller belongs to.
--    Its definer callers (create_offer, job_request_parties_ok, should_notify) run as postgres, the
--    owner of public.blocks, which has no FORCE ROW LEVEL SECURITY, so they still see every block.
--    authenticated keeps EXECUTE (the policies are evaluated as the caller) and SELECT on blocks.
--
-- 2. Table rights authenticated held but nothing uses (the evidence table is in the M1 report; each
--    right below has zero hits in lib/, hooks/, screens/, components/, modes/, navigation/, ui/,
--    App.tsx, supabase/functions/ and the robots). Every write the app makes still has its grant:
--    messages INSERT, message_reads upsert, notification_prefs INSERT/UPDATE, push_tokens UPDATE
--    (deactivate on sign-out), reports INSERT (the seven columns createReport sends) and UPDATE (the
--    admin's dismiss), blocks INSERT/DELETE, jobs DELETE, worker_services.
--    - reports: INSERT narrows to the seven columns lib/moderation.ts createReport sends, so a reporter
--      can no longer write status or created_at (B11). The admin's UPDATE stays.
--    - push_tokens: INSERT and DELETE go; register_push_token() is the only insert path.
--    - legal_acceptances: INSERT, UPDATE and DELETE go; accept_legal_documents() is the write path.
--    - banned_phones: SELECT goes (no policy ever let a row through).
--
-- Additive under scripts/staging-scan.sh: no object is removed or renamed. Proof:
-- supabase/tests/470_access_allow_list.sql, 310_grants.sql, 040_authz.sql.

begin;

-- 1. The block check, as the caller.
alter function public.is_blocked_between(uuid, uuid) security invoker;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
comment on function public.is_blocked_between(uuid, uuid) is
  'True when either user has an ACTIVE block on the other (symmetric in effect). phase77: a block whose expires_at has passed behaves exactly as no block; NULL expires_at is permanent. B4 (20261116000000): SECURITY INVOKER, so a signed-in caller learns only about blocks they are part of (blocks_select_involved); a stranger always gets false. Definer callers run as the table owner and still see every block.';

-- 2. Table rights no call uses.
revoke delete on public.bids from authenticated;
revoke insert, update, delete on public.conversations from authenticated;
revoke insert, update, delete on public.legal_acceptances from authenticated;
revoke delete on public.message_reads from authenticated;
revoke update, delete on public.messages from authenticated;
revoke delete on public.notification_prefs from authenticated;
revoke insert, delete on public.push_tokens from authenticated;
revoke select on public.banned_phones from authenticated;

revoke insert, delete on public.reports from authenticated;
grant insert (reporter_id, reported_id, job_id, reason, description, subject_kind, subject_id)
  on public.reports to authenticated;

commit;
