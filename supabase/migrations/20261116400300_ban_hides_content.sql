-- ban_hides_content — production-36h S1, M2 (R2-e, S4-02, S4-03, A8-05). A banned person's profile,
-- the services they list, the reviews they wrote and the offers they left open disappear for other
-- people, except that the other side of a job with a hire still reads the profile and the services
-- (A8-05 (b), by design: that job's record needs the historical identity); an unban brings them back,
-- because nothing is deleted. The helpers the policies use answer an inactive caller with false and
-- never raise.
--
-- 1. NEW caller_is_trusted_active(): no client may call it. True when the caller is an active
--    account; true for the server's own work (no user id and no client role: the service role, a
--    sweep, a trigger in a migration); true inside delete_my_account() for its own caller (the
--    brazos.inactive_ok mark, active_account_rule); false for a banned or deleted account, for an
--    account with no profile row and for a client without a user id.
-- 2. is_profile_active(p_user) (S4-02): about the caller's own account it answers as before; about
--    anyone else it answers only a trusted caller (1), and false otherwise. A banned caller can no
--    longer ask who is banned or deleted.
-- 3. messaging_unlocked(): false for a caller that is not trusted (1).
-- 4. NEW profile_visible(p_id): true when a trusted caller and p_id are the two sides of one job that
--    had a worker hired (any status). A definer policy helper: it reads jobs past the caller's own
--    RLS, answers a boolean about a pair the caller belongs to, and never raises.
-- 5. NEW restrictive policy profiles_hide_suspended (SELECT): a profile row is readable only when it
--    is the caller's own, or its account is active, or it is a tombstone (deleted_at set, so the old
--    app still shows "Deleted user"), or the caller hired or worked for that person
--    (profile_visible). It narrows the two permissive policies that stay as they are. Definer
--    functions run as the table owner and are not affected.
-- 6. review_is_revealed() (S4-02) answers true only for a REAL review (the four arguments name a row
--    of reviews), only to a trusted caller (1), and only while the REVIEWER is not banned. It is the
--    one gate every reader of other people's reviews already goes through — reviews_select_party
--    (for the reviewee; the reviewer's own rows pass by reviewer_id = auth.uid()), profile_reviews,
--    profile_review_summary, profile_review_summaries, client_job_stats and notify_on_review — so one
--    change hides a banned reviewer's reviews from all of them, totals and the platform prior
--    included, with no signature change. A DELETED reviewer's reviews stay: delete_my_account keeps
--    them on purpose under the "Deleted user" tombstone. worker_job_stats reads no review.
-- 7. NEW restrictive policies job_offers_hide_inactive_author and bids_hide_inactive_worker (SELECT;
--    S4-03): a PENDING offer or bid whose author is no longer active is not shown to the other person
--    (its author still sees it; a settled one shows as before). accept_offer(), counter_offer() and
--    create_offer() already refuse an inactive party (job_request_parties_ok).
-- 8. NEW restrictive policy worker_services_hide_suspended (SELECT; A8-05 (a)): a service row follows
--    its worker's profile rule (5): readable only when it is the caller's own, or the worker's account
--    is active, or the caller hired or worked for that worker (profile_visible). A deleted account has
--    no service rows (delete_my_account deletes them), so the profile rule's tombstone branch has no
--    counterpart here. It narrows services_select_visible, which stays as it is.
-- 0. The order rule: as in ban_switch, the file first checks that each function it restates is still
--    the one it was written from (function_fingerprint() of the live definition, ban_switch 0b: body,
--    settings and shape; A8-06) and that none of its new names exists, and stops otherwise, so an
--    older body is never copied over a newer one; the message names each such function with the
--    fingerprint it found.

begin;

do $order_rule$
declare
  v_bad text;
begin
  select string_agg(w.sig || ' found=' || coalesce(public.function_fingerprint(p.oid::pg_catalog.regprocedure), 'none'),
                    ', ' order by w.sig) into v_bad
  from (values
    -- each restated on purpose; sections 2, 3 and 6 say what changes
    ('public.is_profile_active(uuid)',            '38d5d02102078532ee5ae04cecb83346'),
    ('public.messaging_unlocked(uuid,uuid)',      '9a34ecbdc0d59a0e00469351d735128f'),
    ('public.review_is_revealed(uuid,uuid,uuid,timestamp with time zone)', '77287a308386e58519f114dc74fcdc14')
  ) as w(sig, md5)
  left join pg_catalog.pg_proc p on p.oid = to_regprocedure(w.sig)
  where p.oid is null or public.function_fingerprint(p.oid::pg_catalog.regprocedure) is distinct from w.md5;
  if v_bad is not null then
    raise exception 'ban_hides_content: written from a definition that is no longer live (re-derive from the live definition): %', v_bad;
  end if;

  select string_agg(n.sig, ', ' order by n.sig) into v_bad
  from (values ('public.caller_is_trusted_active()'), ('public.profile_visible(uuid)')) as n(sig)
  where to_regprocedure(n.sig) is not null;
  if v_bad is not null then
    raise exception 'ban_hides_content: a function this file makes new already exists (re-derive from it): %', v_bad;
  end if;
end
$order_rule$;

-- 1. Who may learn about other people's accounts.
create or replace function public.caller_is_trusted_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when auth.uid() is null then coalesce(auth.role(), '') not in ('authenticated', 'anon')
    when coalesce(current_setting('brazos.inactive_ok', true), '') = auth.uid()::text then true
    else exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and not coalesce(p.banned, false)
        and p.deleted_at is null
    )
  end;
$function$;

revoke all on function public.caller_is_trusted_active() from public, anon, authenticated, service_role;

comment on function public.caller_is_trusted_active() is
  'S4-02 (ban_hides_content): may this caller learn about OTHER people''s accounts? True for an active account, for the server''s own work (no user id and no client role) and for delete_my_account()''s own caller (the brazos.inactive_ok mark); false for a banned or deleted account, an account with no profile row, and a client without a user id. Called only from the definer policy helpers; no client may call it.';

-- 2. The account-lifecycle predicate.
create or replace function public.is_profile_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select case
    when not exists (
      select 1
      from public.profiles p
      where p.id = p_user
        and not coalesce(p.banned, false)
        and p.deleted_at is null
    ) then false
    when p_user = auth.uid() then true
    else public.caller_is_trusted_active()
  end;
$function$;

revoke all on function public.is_profile_active(uuid) from public, anon, service_role;
grant execute on function public.is_profile_active(uuid) to authenticated;

comment on function public.is_profile_active(uuid) is
  'THE account-lifecycle predicate (CLAUDE.md P3-31): true when the profile exists, is not banned, and has not been deleted. Every other gate calls this rather than re-deriving it. S4-02 (ban_hides_content): about anyone but the caller it answers only a trusted caller (caller_is_trusted_active), and false otherwise; it never raises.';

-- 3. The messaging gate.
create or replace function public.messaging_unlocked(p_job_id uuid default null::uuid, p_direct_thread_id uuid default null::uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.caller_is_trusted_active() and case
    -- A job's own thread: the pair is the client and the worker they hired.
    when p_job_id is not null then exists (
      select 1
      from public.jobs j
      where j.id = p_job_id
        and j.assigned_worker_id is not null
        and j.status in ('assigned', 'in_progress', 'completed')
        and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())
    )
    -- The pair's own thread: open once ANY job between these two people has
    -- reached assignment. A cancelled job does not unlock anything.
    when p_direct_thread_id is not null then exists (
      select 1
      from public.direct_threads t
      join public.jobs j
        on (j.client_id = t.user_a and j.assigned_worker_id = t.user_b)
        or (j.client_id = t.user_b and j.assigned_worker_id = t.user_a)
      where t.id = p_direct_thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
        and j.status in ('assigned', 'in_progress', 'completed')
    )
    else false
  end;
$function$;

revoke all on function public.messaging_unlocked(uuid, uuid) from public, anon, service_role;
grant execute on function public.messaging_unlocked(uuid, uuid) to authenticated;

comment on function public.messaging_unlocked(uuid, uuid) is
  'THE pre-confirmation messaging gate (phase66). True once the caller and their counterparty share a job that reached assignment and was not cancelled — the state accept_offer() produces. Answers only about the caller''s own conversations. Used by both messages_insert_party and the chat screen, so the enforcement and the UI cannot drift. S4-02 (ban_hides_content): false for a caller that is not trusted (caller_is_trusted_active).';

-- 4. The counterpart rule.
create or replace function public.profile_visible(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.caller_is_trusted_active() and exists (
    select 1
    from public.jobs j
    where j.assigned_worker_id is not null
      and (
        (j.client_id = auth.uid() and j.assigned_worker_id = p_id)
        or (j.assigned_worker_id = auth.uid() and j.client_id = p_id)
      )
  );
$function$;

revoke all on function public.profile_visible(uuid) from public, anon, authenticated, service_role;
grant execute on function public.profile_visible(uuid) to authenticated;

comment on function public.profile_visible(uuid) is
  'R2-e (ban_hides_content): true when a trusted caller (caller_is_trusted_active) and p_id are the customer and the hired worker of one job (any status). A policy helper for profiles_hide_suspended: SECURITY DEFINER so it can read the job rows, a boolean about a pair the caller belongs to (a stranger learns nothing), never an error.';

-- 5. The profile rows.
drop policy if exists profiles_hide_suspended on public.profiles;
create policy profiles_hide_suspended on public.profiles
  as restrictive
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.is_profile_active(id)
    or deleted_at is not null
    or public.profile_visible(id)
  );

-- 6. The reviews.
create or replace function public.review_is_revealed(p_job_id uuid, p_reviewer_id uuid, p_reviewee_id uuid, p_created_at timestamp with time zone)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.caller_is_trusted_active()
     and exists (
           select 1
           from public.reviews r
           where r.job_id = p_job_id
             and r.reviewer_id = p_reviewer_id
             and r.reviewee_id = p_reviewee_id
             and r.created_at = p_created_at
         )
     and not exists (
           select 1
           from public.profiles b
           where b.id = p_reviewer_id
             and coalesce(b.banned, false)
         )
     and (
       exists (
         select 1
         from public.reviews c
         where c.job_id = p_job_id
           and c.reviewer_id = p_reviewee_id
           and c.reviewee_id = p_reviewer_id
       ) or p_created_at <= now() - interval '7 days'
     );
$function$;

revoke all on function public.review_is_revealed(uuid, uuid, uuid, timestamp with time zone) from public, anon, service_role;
grant execute on function public.review_is_revealed(uuid, uuid, uuid, timestamp with time zone) to authenticated;

comment on function public.review_is_revealed(uuid, uuid, uuid, timestamp with time zone) is
  'D1 (R8a): true once the counterpart review exists (same job, parties swapped) or 7 days after the review was written, whichever comes first. Called from reviews_select_party and from every revealed-only reader. R2-e (ban_hides_content): and only while the reviewer is not banned, so a banned reviewer''s reviews leave every reader and every total, and come back on unban. A deleted reviewer''s reviews stay (the "Deleted user" tombstone). S4-02: only for a real review (the four arguments name a row of reviews) and only to a trusted caller (caller_is_trusted_active); false otherwise, never an error.';

-- 7. A pending offer or bid from an account that is no longer active.
drop policy if exists job_offers_hide_inactive_author on public.job_offers;
create policy job_offers_hide_inactive_author on public.job_offers
  as restrictive
  for select
  to authenticated
  using (
    status <> 'pending'
    or author_id = (select auth.uid())
    or public.is_profile_active(author_id)
  );

drop policy if exists bids_hide_inactive_worker on public.bids;
create policy bids_hide_inactive_worker on public.bids
  as restrictive
  for select
  to authenticated
  using (
    status <> 'pending'
    or worker_id = (select auth.uid())
    or public.is_profile_active(worker_id)
  );

-- 8. A banned worker's services (A8-05 (a)): the profile rule of 5.
create policy worker_services_hide_suspended on public.worker_services
  as restrictive
  for select
  to authenticated
  using (
    worker_id = (select auth.uid())
    or public.is_profile_active(worker_id)
    or public.profile_visible(worker_id)
  );

commit;
