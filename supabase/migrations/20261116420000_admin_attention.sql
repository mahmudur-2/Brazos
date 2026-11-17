-- admin_attention — production-36h S1, O1 file 1. The owner's list reaches the admin in the app: he
-- reads it (S1), decides an issue between two people there (S2, through the existing resolve path),
-- and is told when a line needs him (S4). No money rule changes: every decision is
-- resolve_job_dispute's own (transfer_in_flight.sql), with its own locks, checks and errors.
--
-- 1. NEW table admin_decisions: one row per decision made in the app (admin, job, payment, side,
--    time). Insert only (a trigger refuses update, delete and truncate); row security on, no policy,
--    the service role reads. A cancelled job with a held payment has no issue row to hold a note, so
--    the record lives here. No existing insert-only table fits (job_disputes.resolution_note needs an
--    open issue; messages, notification_outbox and payment_events are other records).
-- 2. NEW table admin_attention_seen: the notice timer's memory of each line (key, first and last run
--    that saw it, when it left, its episode, the last episode told). No contact, name or amount.
-- 3. NEW admin_attention_lines(): the one derivation of the list: payment_attention and
--    account_cleanup_attention in one shape, one row per key (the earliest since). The key is
--    code:payment id:md5(ref) (cleanup_customer_open:<row id> for the cleanup line): stable while the
--    line stays, and never a Stripe id, because the key also goes into a notice. Owner only.
-- 4. NEW admin_issue_options(job, admin): the sides resolve_job_dispute accepts now on that job (its
--    own branches, read without a lock: the transfer whose result is not recorded, the issue, the
--    reversal park, the cancelled undirected payment, the card dispute, and the refund it may not
--    change; a card dispute also drops the worker on a no-show claim, which resolve itself does not
--    check), customer first, and one plain sentence when a side is not offered. The admin's own job
--    (customer or hired worker) offers nothing. A cancelled job outside the no-show and fee-park
--    branches offers the customer only: 'The app cannot pay the worker of a cancelled job. If the
--    worker must be paid, ask your developer.' When the payee's account is deleted, no branch offers
--    the worker: 'The worker's account was deleted, so the worker cannot be paid in the app.' Owner only.
-- 5. NEW admin_attention() for the app: the guard first, then active admins only. 27 columns (the
--    frozen contract): the line; decisions (the sides the server accepts now, on issue_open,
--    issue_no_show, transfer_issue_open and job_closed_money_held lines only); the job's title on
--    every line with a job; the names, the open issue's words, the sign-in phone and email
--    (auth.users; none for a deleted account) and the job's times (arrived, work started from
--    job_work_starts, completed, cancelled) only when decisions is not empty; decision_note.
--    Contacts go nowhere else: no notice, no seen row, no log.
-- 6. NEW admin_decide_issue(job, side) for the app: the guard first; active admins only; the job, the
--    payment and the open issue locked in resolve's own order BEFORE the options are read, so the
--    sides come from rows that cannot change under the decision; never on the admin's own job; only a
--    side that a decision line of that job offers now; then resolve_job_dispute with a note that names no
--    one ("Decided in the app by a Brazos admin.", readable by the two parties), and one
--    admin_decisions row. Returns nothing; every error of resolve passes through unchanged. No notice
--    per decision (the coordinator's O1 change 4).
-- 7. NEW notify_attention_admins() and its timer brazos-admin-attention, every 10 minutes: every line
--    whose finish is app, stripe or developer (the cleanup line is stripe) is told to every active
--    admin once per episode (a line that is new, or back after it left the list), never twice within
--    24 hours for the same line; the 5 oldest owed lines get their own notice (title "Brazos needs
--    you", body the line's plain sentence, data {screen ProfileMain, key}), and the rest one summary
--    ("<n> more items on your list need you."). Bank, worker and wait lines are never pushed. A run
--    while no active admin exists tells nothing and marks no line as told (O1-06). Each
--    run ends with report_timer_run('brazos-admin-attention', 40 minutes); its expected row makes a
--    timer that never ran a timer_late line.
-- 8. expected_schedules() is restated: the eleven timers of schedules_loud, word for word, plus
--    brazos-admin-attention; the file ends with select public.install_schedules().
-- 9. This file SUPERSEDES the written limit of 20261116410000_account_deletion_process.sql (its header,
--    section 5: "no admin in the app ... nothing pushes it"): from here, an active admin reads the
--    cleanup line in the app (admin_attention) and the notice timer pushes it (finish stripe). The view
--    itself is unchanged and stays service-role only; it is still not part of payment_attention.
-- 10. payment_attention_codes() is restated word for word from 20261116300400_ready_wait.sql, with two
--    lines changed. job_closed_money_held's sentence: 'This job was cancelled while its payment was
--    still held. You can refund the customer here. To pay the worker, ask your developer.' The owner
--    decided refund only: no decision in the app pays the worker of a cancelled job outside resolve's
--    own no-show fee and fee-park branches. transfer_reversed (G-01): 'The worker's payout was taken
--    back in Stripe. To settle this money, ask your developer.', finish developer: no decision line
--    offers it (a reversed tip has the same code, and the app has no tip decision); a reversal on a
--    job with an open issue is decided on that issue's line.
-- 0. The order rule: none of the new names exists, and expected_schedules(), install_schedules(),
--    payment_attention_codes() and resolve_job_dispute (whose branches admin_issue_options reads) are
--    the bodies this file was written from (function_fingerprint, ban_switch 0b).

begin;

do $order_rule$
declare
  v_bad text;
begin
  select string_agg(n.sig, ', ' order by n.sig) into v_bad
  from (values ('public.admin_attention_lines()'), ('public.admin_issue_options(uuid,uuid)'),
               ('public.admin_attention()'), ('public.admin_decide_issue(uuid,text)'),
               ('public.notify_attention_admins()'), ('public.install_admin_attention_schedule()'),
               ('public.refuse_admin_decision_change()')) as n(sig)
  where to_regprocedure(n.sig) is not null;
  if v_bad is null then
    select string_agg(t.rel, ', ' order by t.rel) into v_bad
    from (values ('public.admin_decisions'), ('public.admin_attention_seen')) as t(rel)
    where to_regclass(t.rel) is not null;
  end if;
  if v_bad is not null then
    raise exception 'admin_attention: a name this file makes new already exists (re-derive from it): %', v_bad;
  end if;
  if public.function_fingerprint('public.expected_schedules()'::regprocedure) is distinct from 'ce0480037f3890ef53bb61230d1bf0a2'
     or public.function_fingerprint('public.install_schedules()'::regprocedure) is distinct from '06de0ffe0be900c498e725bb4bf3f49d'
     or public.function_fingerprint('public.payment_attention_codes()'::regprocedure) is distinct from 'eb32c0d01b218064d97c17a6d05c0a6b'
     or public.function_fingerprint('public.resolve_job_dispute(uuid,text,text)'::regprocedure) is distinct from 'fa68ddfc3a7d7d3020cb2c843cffed63' then
    raise exception 'admin_attention: expected_schedules(), install_schedules(), payment_attention_codes() or resolve_job_dispute changed after this file was written (re-derive from it)';
  end if;
end
$order_rule$;

-- ---------------------------------------------------------------------------
-- 1. admin_decisions: the record of each decision made in the app. Insert only.
-- ---------------------------------------------------------------------------
create table public.admin_decisions (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.profiles(id),
  job_id     uuid not null references public.jobs(id),
  payment_id uuid references public.payments(id),
  side       text not null check (side in ('customer', 'worker')),
  decided_at timestamptz not null default now()
);
create index admin_decisions_job_idx on public.admin_decisions (job_id);
alter table public.admin_decisions enable row level security;
revoke all on table public.admin_decisions from public, anon, authenticated, service_role;
grant select on table public.admin_decisions to service_role;
comment on table public.admin_decisions is
  'O1: one row per decision an admin made in the app (admin_decide_issue): who, which job and payment, which side, when. Insert only: refuse_admin_decision_change() refuses update, delete and truncate. RLS on, no policy; the service role reads it, no client right.';

create or replace function public.refuse_admin_decision_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  raise exception 'admin_decisions is a record: a row is never changed or removed';
end;
$function$;
revoke all on function public.refuse_admin_decision_change() from public, anon, authenticated, service_role;
comment on function public.refuse_admin_decision_change() is
  'O1: BEFORE UPDATE OR DELETE (each row) and BEFORE TRUNCATE on admin_decisions: refuses, so the record of a decision is never changed or removed. No client may call it.';

create trigger admin_decisions_insert_only
  before update or delete on public.admin_decisions
  for each row execute function public.refuse_admin_decision_change();
create trigger admin_decisions_no_truncate
  before truncate on public.admin_decisions
  for each statement execute function public.refuse_admin_decision_change();

-- ---------------------------------------------------------------------------
-- 2. admin_attention_seen: the notice timer's memory. No contact, no name, no amount.
-- ---------------------------------------------------------------------------
create table public.admin_attention_seen (
  key              text primary key,
  first_seen       timestamptz not null,
  last_seen        timestamptz not null,
  gone_at          timestamptz,
  episode          integer not null default 1,
  episode_at       timestamptz not null,
  notified_episode integer,
  notified_at      timestamptz
);
alter table public.admin_attention_seen enable row level security;
revoke all on table public.admin_attention_seen from public, anon, authenticated, service_role;
grant select on table public.admin_attention_seen to service_role;
comment on table public.admin_attention_seen is
  'O1: one row per line key the notice timer (notify_attention_admins) has seen: first_seen and last_seen (runs), gone_at (the run that found it gone; null while it stays), episode (1, plus one each time it comes back) from episode_at, and the last episode told (notified_episode, notified_at). Holds no contact, name or amount. RLS on, no policy; the service role reads it, only the timer writes it.';

-- ---------------------------------------------------------------------------
-- 3. admin_attention_lines(): the one derivation of the list.
-- ---------------------------------------------------------------------------
create or replace function public.admin_attention_lines()
returns table (key text, what text, reason text, since timestamptz, overdue boolean, cents integer,
               detail text, code text, finish text, payment_id uuid, job_id uuid)
language sql
stable
set search_path = public, pg_temp
as $function$
  select distinct on (l.key)
         l.key, l.what, l.reason, l.since, l.overdue, l.cents, l.detail, l.code, l.finish, l.payment_id, l.job_id
  from (
    select a.code || ':' || coalesce(a.payment_id::text, '-') || ':' || md5(coalesce(a.ref, '-')) as key,
           a.what, a.reason, a.since, a.overdue, a.cents, a.detail, a.code, a.finish, a.payment_id, a.job_id
      from public.payment_attention a
    union all
    select c.code || ':' || c.id::text, 'account'::text, c.reason, c.since, true, null::integer, c.detail,
           c.code, c.finish, null::uuid, null::uuid
      from public.account_cleanup_attention c
  ) l
  order by l.key, l.since nulls last
$function$;
revoke all on function public.admin_attention_lines() from public, anon, authenticated, service_role;
comment on function public.admin_attention_lines() is
  'O1: the owner''s list in one shape: every payment_attention line and every account_cleanup_attention line, one row per key with its earliest since. key = code:payment id (or -):md5(ref) (cleanup_customer_open:<row id> for the cleanup line, what ''account''): stable while the line stays, never a Stripe id. Read by admin_attention, admin_decide_issue and notify_attention_admins. Owner only.';

-- ---------------------------------------------------------------------------
-- 4. admin_issue_options(job, admin): the sides resolve_job_dispute accepts now, and why one is not.
-- ---------------------------------------------------------------------------
create or replace function public.admin_issue_options(p_job_id uuid, p_admin uuid,
                                                      out own boolean, out sides text[], out note text)
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  v_job        public.jobs;
  v_payment    public.payments;
  v_dispute    public.job_disputes;
  v_park       boolean;
  v_undirected boolean;
  v_charge     integer;
  v_customer   boolean := false;
  v_worker     boolean := false;
  v_card       boolean := false;
  v_refund     boolean := false;
  v_cancelled  boolean := false;
  v_gone       boolean;
begin
  own := false;
  sides := '{}'::text[];
  note := null;

  select * into v_job from public.jobs where id = p_job_id;
  if not found then
    return;
  end if;
  if coalesce(p_admin in (v_job.client_id, v_job.assigned_worker_id), false) then
    own := true;
    note := 'You cannot decide an issue on your own job. Ask another admin or your developer.';
    return;
  end if;

  -- resolve_job_dispute's own reads, in its order, without its locks.
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided');
  select * into v_dispute from public.job_disputes
   where job_id = p_job_id and status = 'open';
  if public.payment_transfer_unconfirmed(v_payment) then
    note := 'A payment to the worker was sent and its result is not recorded yet, so nothing can be decided now. Ask your developer.';
    return;
  end if;
  v_park := v_payment.id is not null and v_payment.transfer_reversed_at is not null;
  v_undirected := v_payment.id is not null and v_payment.status = 'held'
                  and coalesce(v_payment.refund_cents, 0) = 0 and coalesce(v_payment.transfer_cents, 0) = 0
                  and v_payment.release_requested_at is null;
  if v_dispute.id is null and not v_park and not (v_job.status = 'cancelled' and v_undirected) then
    return;   -- resolve: 'This job has nothing to resolve'
  end if;
  if v_payment.id is null then
    sides := array['customer', 'worker'];   -- resolve closes the issue; no money moves
    return;
  end if;
  v_charge := v_payment.charge_amount_cents;
  -- G-04: the payee's account is deleted: no branch offers the worker.
  v_gone := not exists (select 1 from public.profiles pr where pr.id = v_payment.payee_id and pr.deleted_at is null);

  if v_job.status = 'completed' then
    v_customer := not public.payment_refund_change_refused(v_payment, v_charge);
    v_refund := not v_customer;
    if v_payment.chargeback_at is not null then
      v_card := true;
    elsif not v_gone then
      v_worker := not public.payment_refund_change_refused(v_payment, 0);
      v_refund := v_refund or not v_worker;
    end if;
  elsif v_job.status = 'cancelled' then
    v_customer := not public.payment_refund_change_refused(v_payment, v_charge);
    v_refund := not v_customer;
    if v_dispute.id is not null and v_job.cancel_reason = 'customer_no_show' then
      -- G-02: as the other worker branches, no worker side while a card dispute is open.
      if v_payment.chargeback_at is not null then
        v_card := true;
      elsif not v_gone then
        v_worker := not public.payment_refund_change_refused(
                      v_payment, v_charge - public.cancellation_fee_cents(p_job_id, v_payment.amount_cents));
        v_refund := v_refund or not v_worker;
      end if;
    elsif v_park and v_payment.release_reason = 'cancellation_fee' and coalesce(v_payment.transfer_cents, 0) > 0 then
      if v_payment.chargeback_at is not null then
        v_card := true;
      elsif not v_gone then
        v_worker := not public.payment_refund_change_refused(v_payment, v_payment.refund_cents);
        v_refund := v_refund or not v_worker;
      end if;
    else
      v_cancelled := true;   -- resolve: the customer's favour only
    end if;
  else
    note := 'This job is not finished or cancelled yet, so nothing can be decided now.';
    return;
  end if;

  sides := case when v_customer then array['customer'] else '{}'::text[] end
           || case when v_worker then array['worker'] else '{}'::text[] end;
  note := case
            when v_card then 'The worker cannot be paid while the customer''s bank reviews a card dispute on this payment.'
            when v_refund then 'A refund to the customer was sent or may have been sent, so a decision cannot change it now. Ask your developer.'
            when v_cancelled then 'The app cannot pay the worker of a cancelled job. If the worker must be paid, ask your developer.'
            when v_gone then 'The worker''s account was deleted, so the worker cannot be paid in the app.'
          end;
end;
$function$;
revoke all on function public.admin_issue_options(uuid, uuid) from public, anon, authenticated, service_role;
comment on function public.admin_issue_options(uuid, uuid) is
  'O1: the decision open on a job for one admin. own: the admin is the job''s customer or hired worker (nothing offered). sides: the sides resolve_job_dispute accepts now, customer first, from its own branches read without a lock (a transfer whose result is not recorded, no issue and no park and no cancelled undirected payment, an unfinished job: none; a card dispute: no worker, also on a no-show claim; a refund it may not change: not that side; a cancelled job outside the no-show and fee-park branches: the customer only; a payee whose account is deleted: no worker, in every branch). note: null, or one plain sentence why a side is not offered. Owner only.';

-- ---------------------------------------------------------------------------
-- 5. admin_attention(): the list in the app.
-- ---------------------------------------------------------------------------
create or replace function public.admin_attention()
returns table (key text, what text, reason text, since timestamptz, overdue boolean, cents integer,
               detail text, code text, finish text, payment_id uuid, job_id uuid, decisions text[],
               job_title text, customer_first_name text, worker_first_name text,
               report_reason text, report_details text, report_at timestamptz,
               customer_phone text, customer_email text, worker_phone text, worker_email text,
               arrived_at timestamptz, work_started_at timestamptz, completed_at timestamptz,
               cancelled_at timestamptz, decision_note text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  perform public.require_active_caller();
  if not public.current_user_is_admin() then
    raise exception 'Only admins may see this list';
  end if;

  return query
  select l.key, l.what, l.reason, l.since, l.overdue, l.cents, l.detail, l.code, l.finish, l.payment_id, l.job_id,
         coalesce(o.sides, '{}'::text[]),
         j.title,
         case when s.show then case when cp.deleted_at is not null then 'Deleted user'
                                    else nullif(split_part(btrim(cp.full_name), ' ', 1), '') end end,
         case when s.show then case when wp.deleted_at is not null then 'Deleted user'
                                    else nullif(split_part(btrim(wp.full_name), ' ', 1), '') end end,
         case when s.show then r.reason::text end,
         case when s.show then r.details end,
         case when s.show then r.created_at end,
         case when s.show and cp.deleted_at is null then nullif(cu.phone::text, '') end,
         case when s.show and cp.deleted_at is null then nullif(cu.email::text, '') end,
         case when s.show and wp.deleted_at is null then nullif(wu.phone::text, '') end,
         case when s.show and wp.deleted_at is null then nullif(wu.email::text, '') end,
         case when s.show then j.arrived_at end,
         case when s.show then ws.started_at end,
         case when s.show then j.completed_at end,
         case when s.show then j.cancelled_at end,
         o.note
    from public.admin_attention_lines() l
    left join public.jobs j on j.id = l.job_id
    left join lateral (
      select x.sides, x.note
        from public.admin_issue_options(j.id, v_uid) x
       where l.code in ('issue_open', 'issue_no_show', 'transfer_issue_open', 'job_closed_money_held')
         and j.id is not null
    ) o on true
    cross join lateral (select cardinality(coalesce(o.sides, '{}'::text[])) > 0 as show) s
    left join public.profiles cp on cp.id = j.client_id
    left join public.profiles wp on wp.id = j.assigned_worker_id
    left join auth.users cu on cu.id = j.client_id
    left join auth.users wu on wu.id = j.assigned_worker_id
    left join public.job_work_starts ws on ws.job_id = j.id
    left join lateral (
      select d.reason, d.details, d.created_at
        from public.job_disputes d
       where d.job_id = j.id and d.status = 'open'
       order by d.created_at
       limit 1
    ) r on true
   order by l.since, l.key;
end;
$function$;
revoke all on function public.admin_attention() from public, anon, authenticated, service_role;
grant execute on function public.admin_attention() to authenticated;
comment on function public.admin_attention() is
  'O1: the owner''s list for an active admin in the app (require_active_caller first, then ''Only admins may see this list''). One row per line (admin_attention_lines), ordered by since then key. decisions: the sides admin_decide_issue accepts now (admin_issue_options), on issue_open, issue_no_show, transfer_issue_open and job_closed_money_held lines only, never on the admin''s own job; job_title on every line with a job; names (''Deleted user'' for a deleted account), the open issue''s reason, details and time, the sign-in phone and email from auth.users (none for a deleted account) and the job''s arrived, work started (job_work_starts), completed and cancelled times only when decisions is not empty; decision_note: null or one sentence why a side is not offered. Contacts go into no notice, seen row or log.';

-- ---------------------------------------------------------------------------
-- 6. admin_decide_issue(job, side): the decision in the app, through resolve_job_dispute.
-- ---------------------------------------------------------------------------
create or replace function public.admin_decide_issue(p_job_id uuid, p_in_favour_of text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid     uuid := auth.uid();
  v_job     public.jobs;
  v_payment public.payments;
  v_dispute public.job_disputes;
  v_options record;
begin
  perform public.require_active_caller();
  if not public.current_user_is_admin() then
    raise exception 'Only admins may decide issues';
  end if;
  if p_in_favour_of is null or p_in_favour_of not in ('customer', 'worker') then
    raise exception 'Resolve in favour of the worker or the customer';
  end if;
  -- resolve_job_dispute's own lock order (the job, the payment, the open issue), taken before the
  -- options are read: two admins deciding one job take turns, and the sides come from locked rows.
  select * into v_job from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found';
  end if;
  select * into v_payment from public.payments
   where job_id = p_job_id and kind = 'job_payment' and status not in ('failed', 'voided') for update;
  select * into v_dispute from public.job_disputes
   where job_id = p_job_id and status = 'open' for update;
  select * into v_options from public.admin_issue_options(p_job_id, v_uid);
  if v_options.own then
    raise exception '%', v_options.note;
  end if;
  if not (p_in_favour_of = any (v_options.sides))
     or not exists (select 1 from public.admin_attention_lines() l
                     where l.job_id = p_job_id
                       and l.code in ('issue_open', 'issue_no_show', 'transfer_issue_open', 'job_closed_money_held')) then
    raise exception 'This decision is not open for this job now. Reload the list.';
  end if;

  perform public.resolve_job_dispute(p_job_id, p_in_favour_of, 'Decided in the app by a Brazos admin.');
  insert into public.admin_decisions (admin_id, job_id, payment_id, side)
  values (v_uid, p_job_id, v_payment.id, p_in_favour_of);
end;
$function$;
revoke all on function public.admin_decide_issue(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.admin_decide_issue(uuid, text) to authenticated;
comment on function public.admin_decide_issue(uuid, text) is
  'O1: an active admin decides an issue in the app (require_active_caller first; ''Only admins may decide issues''; ''Resolve in favour of the worker or the customer''; the job, payment and open issue locks in resolve''s own order, before the options are read; ''Job not found''; the admin''s own job is refused; a side no decision line of the job offers now: ''This decision is not open for this job now. Reload the list.''). Then resolve_job_dispute(job, side, ''Decided in the app by a Brazos admin.''), whose errors pass through unchanged, and one admin_decisions row. Returns nothing; sends no notice.';

-- ---------------------------------------------------------------------------
-- 7. notify_attention_admins(): the notice timer.
-- ---------------------------------------------------------------------------
create or replace function public.notify_attention_admins()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_now     timestamptz := now();
  v_keys    text[];
  v_reasons text[];
  v_seen    public.admin_attention_seen;
  v_told    integer := 0;
  v_more    integer := 0;
  v_summed  text[] := '{}';
  v_admins  boolean;
  i         integer;
begin
  -- One run at a time.
  perform pg_advisory_xact_lock(hashtext('brazos-admin-attention'));

  -- The lines that are told: finish app, stripe or developer (the cleanup line is stripe), oldest first.
  select coalesce(array_agg(l.key order by l.since, l.key), '{}'::text[]),
         coalesce(array_agg(l.reason order by l.since, l.key), '{}'::text[])
    into v_keys, v_reasons
    from public.admin_attention_lines() l
   where l.finish in ('app', 'stripe', 'developer');

  -- A line that is no longer on the list: its episode ends.
  update public.admin_attention_seen s
     set gone_at = v_now
   where s.gone_at is null and s.key <> all (v_keys);

  -- A line on the list: new (episode 1), back after it left (the next episode), or still there.
  insert into public.admin_attention_seen as s (key, first_seen, last_seen, episode, episode_at)
  select k.key, v_now, v_now, 1, v_now from unnest(v_keys) as k(key)
  on conflict (key) do update
     set last_seen  = v_now,
         episode    = s.episode + case when s.gone_at is not null then 1 else 0 end,
         episode_at = case when s.gone_at is not null then v_now else s.episode_at end,
         gone_at    = null;

  -- One notice per episode, never a second within 24 hours for the same line; the 5 oldest owed
  -- lines each get their own, the rest are counted into one summary. O1-06: with no active admin
  -- (notify_admins' recipients) nothing is told, so no line is marked told; it stays owed.
  v_admins := exists (select 1 from public.profiles p
                       where coalesce(p.is_admin, false) and not coalesce(p.banned, false) and p.deleted_at is null);
  for i in 1 .. coalesce(array_length(v_keys, 1), 0) loop
    exit when not v_admins;
    select * into v_seen from public.admin_attention_seen s where s.key = v_keys[i];
    if v_seen.notified_episode is distinct from v_seen.episode
       and (v_seen.notified_at is null or v_seen.notified_at <= v_now - interval '24 hours') then
      if v_told < 5 then
        perform public.notify_admins('admin_attention', 'Brazos needs you', v_reasons[i],
                                     jsonb_build_object('screen', 'ProfileMain', 'key', v_keys[i]),
                                     'attention:' || v_keys[i] || ':' || v_seen.episode::text);
        v_told := v_told + 1;
      else
        v_more := v_more + 1;
        v_summed := v_summed || (v_keys[i] || ':' || v_seen.episode::text);
      end if;
      update public.admin_attention_seen
         set notified_episode = v_seen.episode, notified_at = v_now
       where key = v_keys[i];
    end if;
  end loop;
  if v_more > 0 then
    perform public.notify_admins('admin_attention', 'Brazos needs you',
                                 case when v_more = 1 then '1 more item on your list needs you.'
                                      else v_more::text || ' more items on your list need you.' end,
                                 jsonb_build_object('screen', 'ProfileMain'),
                                 'attention_summary:' || md5(array_to_string(v_summed, ',')));
  end if;

  perform public.report_timer_run('brazos-admin-attention', interval '40 minutes');
  return v_told + v_more;
end;
$function$;
revoke all on function public.notify_attention_admins() from public, anon, authenticated;
comment on function public.notify_attention_admins() is
  'O1: the notice timer (cron brazos-admin-attention, every 10 minutes). Lines with finish app, stripe or developer (the cleanup line is stripe) are told to every active admin (notify_admins, type admin_attention, category jobs, no actor) once per episode (admin_attention_seen: new, or back after it left), never twice within 24 hours for the same line. The 5 oldest owed lines each get a notice (title ''Brazos needs you'', body the line''s plain sentence, data {screen ProfileMain, key}, dedupe attention:<key>:<episode>); the rest one summary (''<n> more items on your list need you.'', or ''1 more item on your list needs you.''; data {screen ProfileMain}; dedupe attention_summary:md5 of the summed keys and episodes). A run while no active admin exists tells nothing and marks no line as told (O1-06). Never a contact, name, amount or Stripe id. Returns the lines told; ends with report_timer_run(''brazos-admin-attention'', 40 minutes). No client may call it.';

-- The timer is expected from now: a timer that never reports becomes a timer_late line after 40 minutes.
insert into public.timer_runs as t (name, expected_from, stale_after)
values ('brazos-admin-attention', now(), interval '40 minutes')
on conflict (name) do update
   set expected_from = coalesce(t.expected_from, least(t.ok_at, t.failing_since, excluded.expected_from)),
       stale_after   = excluded.stale_after;

-- ---------------------------------------------------------------------------
-- 10. payment_attention_codes(): word for word, with job_closed_money_held's new sentence, and
-- tip_payee_gone, refund_failed and refund_failed_several sent to the developer (O1-G: their
-- functions are service_role only, so no line in the app can end them).
-- ---------------------------------------------------------------------------
create or replace function public.payment_attention_codes()
returns table (code text, reason text, finish text)
language sql immutable
set search_path = public, pg_temp
as $fn$
  values
    ('transfer_reversed',          'The worker''s payout was taken back in Stripe. To settle this money, ask your developer.', 'developer'),
    -- M1b (A4-07): under an open card dispute the worker's side is refused (resolve_job_dispute,
    -- resolve_tip) and no refund is sent (refunds_due needs no card dispute), so the bank decides first.
    ('transfer_reversed_disputed', 'The worker''s payout was taken back in Stripe, and the customer also disputed the card charge with their bank. Paying the worker again is refused while the dispute is open, and no refund is sent either. Answer the dispute in Stripe and wait for the bank to decide.', 'bank'),
    ('transfer_stopped',          'Sending the worker''s payout stopped after Stripe said no.', 'developer'),
    ('transfer_no_answer',         'Stripe has not confirmed the worker''s payout for a day.', 'developer'),
    ('transfer_card_dispute',      'The customer disputed the card charge. The payout waits for the bank.', 'bank'),
    ('transfer_issue_open',        'An issue report is open. The payout waits for your decision.', 'app'),
    ('transfer_already_recorded',  'A payout is already recorded for this payment. Ask your developer.', 'developer'),
    -- M1b (A4-07): the predicate proves only that the app will not send it; any refund failure ever
    -- recorded reserves the whole charge, so "what is left" is not known.
    ('transfer_more_than_left',    'The app will not send this payout by itself, because refunds on this payment, or a refund that failed, may leave less than the payout. The app cannot tell the exact amount left. Ask your developer.', 'developer'),
    ('transfer_payee_gone',        'The worker''s account was suspended or deleted, so this payout cannot be sent. Ask your developer.', 'developer'),
    -- M1b (A4 tip history): resolve_tip(id, 'refund') works for a held tip that was never sent.
    -- O1-G: resolve_tip is service_role only, so the refund is the developer's step.
    ('tip_payee_gone',             'The worker''s account was suspended or deleted, so this tip cannot be sent. To refund the tip to the customer, ask your developer.', 'developer'),
    ('transfer_payout_review',     'Stripe has not cleared the worker''s payout account yet, so the payout waits. Stripe can also refuse an account; your developer can check which.', 'developer'),
    ('transfer_no_payout_account', 'The worker has not finished setting up payouts. The money waits for them.', 'worker'),
    -- M2-3 (R-E): a refusal that repeats for 3 days now stops the payout (then transfer_stopped).
    ('transfer_balance_low',       'Stripe last refused this worker''s payout because your Stripe balance was too low. The app keeps trying, and stops if Stripe still says no after 3 days. Add money to your Stripe balance.', 'stripe'),
    -- M1b (A4-07): a timeout is not a refusal; the line covers both and reads only a transfer error.
    -- M1c (A5-06): a timeout can follow a send Stripe accepted, so the line never says it did not go through.
    ('transfer_retrying',          'The app has no answer from Stripe that the worker''s payout went through. Stripe refused the last try, or the app got no answer it could read, so the money may or may not have moved. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    -- A5-04 (iv): ready for 1 hour and never started; the drain may be stuck on other rows or not running.
    ('transfer_not_started',       'The worker''s payout was first seen ready to send more than an hour ago, and its next try has not started. Ask your developer.', 'developer'),
    -- A12-03 part 1: a try began and no answer was recorded (the send is in flight, or its
    -- write-back was lost); the same key is sent again each run until the 23-hour stop.
    ('transfer_no_answer_yet',     'The worker''s payout was first seen ready to send more than an hour ago. A try has started, and the app has not recorded an answer for it yet. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('transfer_partly_reversed',   'Part of the worker''s payout was taken back. Ask your developer.', 'developer'),
    ('refund_stopped',             'Sending the customer''s refund stopped after Stripe said no.', 'developer'),
    ('refund_no_answer',           'Stripe has not confirmed the customer''s refund for a day.', 'developer'),
    ('refund_card_dispute',        'The customer disputed the card charge. The refund waits for the bank.', 'bank'),
    ('refund_partly_landed',       'Part of this charge was already refunded in Stripe. Finish the refund in Stripe.', 'stripe'),
    ('refund_more_than_left',      'The refund is bigger than what is left after the payout. Ask your developer.', 'developer'),
    -- M1c (A5-06, A4-05): the amount shown is the refund asked, not what is still owed after a
    -- failed refund that was arranged another way.
    ('refund_failed_before',       'A refund on this charge failed before, so the app does not send this refund by itself. The amount shown is the refund asked, not always what the customer is still owed. Check in Stripe, and in how the failed refund was arranged, what is still owed, and refund only that by hand in Stripe.', 'stripe'),
    ('refund_no_intent',           'There is no Stripe payment to refund. Ask your developer.', 'developer'),
    ('refund_retrying',            'The app has no answer from Stripe that the customer''s refund went through. Stripe refused the last try, or the app got no answer it could read, so the money may or may not have moved. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('refund_not_started',         'The customer''s refund was first seen ready to send more than an hour ago, and its next try has not started. Ask your developer.', 'developer'),
    ('refund_no_answer_yet',       'The customer''s refund was first seen ready to send more than an hour ago. A try has started, and the app has not recorded an answer for it yet. The app keeps trying by itself. Ask your developer if this stays.', 'developer'),
    ('refund_unconfirmed',         'A refund was sent. Stripe has not confirmed it yet. If this stays for a day, ask your developer.', 'developer'),
    -- M1b (A4-03): a failed amount is never shown as a debt. Marking it done is
    -- resolve_refund_failure(payment, note): it records how it was settled and moves no money, so it
    -- also records a refund that was already settled another way. O1-G: resolve_refund_failure is
    -- service_role only, so marking it done is the developer's step (for refund_failed_several too).
    ('refund_failed',              'Stripe could not return money to the customer''s card. The amount shown is what that refund tried to return, not always what the customer is still owed. Before you pay anything, check in Stripe for a later refund of this payment that went through, a card dispute, or a payment you already made to the customer. Pay only what is still owed, another way. Then ask your developer to mark it done, also when nothing more was owed.', 'developer'),
    -- A2-04: two or more failures on one payment. A later refund can be a new try for the same
    -- money (the app's refund failed, then one by hand), so the sum is not always what is owed.
    -- M1b (A4-03): the amount shown is the sum capped at the charge, and the sentence says so.
    ('refund_failed_several',      'Stripe could not return money to the customer''s card, more than once. The amount shown adds up the failed refunds, but never more than the charge, and a later failure can be a new try for the same money, so it is not what the customer is still owed. Before you pay anything, check in Stripe for a refund of this payment that went through, a card dispute, or a payment you already made to the customer. Pay only what is still owed, another way. Then ask your developer to mark it done, also when nothing more was owed.', 'developer'),
    -- M1b: the bank may return the money to the customer, so nothing is paid before it decides.
    -- M1c (A5-06): only while a card dispute is open.
    ('refund_failed_disputed',    'Stripe could not return money to the customer''s card, and the customer also disputed the charge with their bank. Do not pay the customer another way while the dispute is open: the bank may return the money to them. Answer the dispute in Stripe first.', 'bank'),
    -- M1c (A5-06): the card dispute is closed and lost: the bank already returned the disputed amount.
    ('refund_failed_dispute_lost', 'Stripe could not return money to the customer''s card, and the customer won a card dispute with their bank, so the bank already gave the customer the disputed amount from your Stripe balance. The failed refund is not a debt for the money the bank returned, so do not pay that again. Ask your developer what, if anything, is still owed.', 'developer'),
    -- M1c (A5-06): the card dispute is closed, neither won nor lost: the app cannot tell the outcome.
    ('refund_failed_dispute_unclear', 'Stripe could not return money to the customer''s card, and the customer''s card dispute with their bank is closed, but the app cannot tell who kept the money. Do not pay the customer another way before your developer checks it. Ask your developer.', 'developer'),
    -- A12-01: the amount shown is the refund asked less what Stripe recorded as refunded and the
    -- disputed amount; the owner checks in Stripe first.
    ('refund_after_dispute_lost',  'The customer won a card dispute with their bank for part of this charge, and the refund the app asked for had not fully gone through. The app no longer sends that refund. Check in Stripe what the customer got back, and refund only the rest by hand there.', 'stripe'),
    -- A13-01: the same, while another dispute of the charge has no known result: nothing by hand yet.
    ('refund_after_dispute_pending', 'The customer won a card dispute with their bank for part of this charge, and the refund the app asked for had not fully gone through. The app no longer sends that refund. The bank has not decided another dispute for this charge, or the app cannot tell its result. Do not refund by hand yet. Answer the open dispute in Stripe and wait for the bank. If Stripe shows no open dispute, ask your developer.', 'bank'),
    ('amount_differs',             'Stripe charged a different amount than the app expected. Ask your developer.', 'developer'),
    ('status_unusual',             'This payment is in an unusual state. Ask your developer.', 'developer'),
    -- M1b (A4-05): after a failed refund the refunded total never goes down, so this can be a
    -- counting error and not a loss (finding 2, M3).
    ('money_short',                'The app counts more money out of Stripe than this job brought in. It can be a real loss, for example a card dispute lost after the worker was paid, or a counting error after a refund failed. Ask your developer before you try to get money back.', 'developer'),
    ('card_dispute_open',          'The customer disputed the card charge with their bank. Answer it in Stripe.', 'bank'),
    ('card_dispute_unclear',       'The bank closed the customer''s card dispute, but the app cannot tell who kept the money. Ask your developer.', 'developer'),
    -- M1b (A4-07): a lost dispute is a known outcome; the payout asked for is not sent (the payment
    -- is refunded) and no decision in the app pays the worker under a card dispute.
    ('card_dispute_lost',          'The customer won a card dispute with their bank, so the bank took the charge back from your Stripe balance. The worker''s payout is not sent by itself. Whether the worker is still paid is your decision. Ask your developer.', 'developer'),
    -- A12-04: what each way gives is cancel_job's (20261115000500_money_notices.sql:54-63, :100-132:
    -- a started job, or a dated one the worker arrived at, keeps a fee) and ban_user's
    -- (20261108000000_lean_v1.sql:196-230); refunds_due waits while a card dispute holds the money.
    ('job_stuck',                  'This job is paid but still not finished 7 days after its date, or 7 days after the hire if it has no date, so its payment stays held. The customer can cancel the job. The cancellation rules of the job then decide the refund: the full amount, or the amount less a cancellation fee that the worker keeps. The refund is asked for at once, but it can wait, for example while a bank reviews a card dispute. Suspending the worker''s account also cancels this job and asks for a full refund to the customer, but it cancels every unfinished job of that account, also the jobs it posted as a customer. Ask your developer if neither fits.', 'developer'),
    ('job_closed_money_held',      'This job was cancelled while its payment was still held. You can refund the customer here. To pay the worker, ask your developer.', 'app'),
    -- A5 point 12: the automatic approval pays at the latest 168 hours after completion; nothing in
    -- the app pays a completed job without an issue report but the customer's approval and that clock.
    ('money_not_moving',           'This job was completed more than 7 days ago and its payment is still held. The automatic approval should have asked for the worker''s payout by then. Ask your developer.', 'developer'),
    -- A9 PART 2 b (2): the one cause today is a recorded refund failure (release_clock.sql:149).
    ('payout_not_automatic',       'This job was completed more than 7 days ago and its payment is still held. A refund on this payment failed before, so the app does not pay the worker by itself. Ask your developer.', 'developer'),
    -- M1b (A4-07): a failed part refund leaves the refunded total as it was, so the rest shown can be wrong.
    ('refund_outside_app',         'Part of this payment was refunded in Stripe, outside the app, and the app has not decided what happens to the rest. The amount shown may be wrong if a refund failed. Ask your developer.', 'developer'),
    -- M1b (A4-07): no money recorded is not proof that none was taken.
    ('cancel_unconfirmed',         'The app closed this payment because it had no record of money for it, but Stripe has not confirmed that the payment is closed. Money may still have been taken from the card. Ask your developer to check it in Stripe.', 'developer'),
    ('issue_open',                 'A customer reported an issue. Decide who gets the money.', 'app'),
    ('issue_no_show',              'A worker reported that the customer was not there. Decide who gets the money.', 'app'),
    ('event_failed',               'A message from Stripe was received, but the app could not use it. Ask your developer.', 'developer'),
    -- A9-02: from when to when is in the detail.
    ('event_scan_gap',             'Some messages from Stripe about payments in one period may not have reached the app, so a payment change from that time, such as a failed refund, may be missing from the app. The period is in the detail. Your developer compares Stripe''s events of that period with the app, then clears this line. Ask your developer.', 'developer'),
    ('timer_missing',              'An automatic task is not set up. Ask your developer.', 'developer'),
    ('timer_failed',               'An automatic task failed on its last run. Ask your developer.', 'developer'),
    ('timer_late',                 'An automatic task has not finished on time. Ask your developer.', 'developer'),
    ('vault_missing',              'A setting the automatic tasks need is missing. Ask your developer.', 'developer'),
    ('push_stuck',                 'Notifications are not going out. Ask your developer.', 'developer')
$fn$;
revoke all on function public.payment_attention_codes() from public, anon, authenticated;
grant execute on function public.payment_attention_codes() to service_role;
comment on function public.payment_attention_codes() is
  'M1: every payment_attention code with its plain sentence (reason, what the owner reads) and its finish: app (a decision the app makes), stripe (done in the Stripe dashboard), bank (the card network decides; answer the dispute in Stripe), worker (the worker must act), wait (the app ends it by itself), developer (nobody else can end it safely). service_role only. M2-3 (refusal_limit): the transfer_balance_low sentence says the app stops after 3 days of refusals. A5 point 12 (money_not_moving): one code added. A5-04 (iv): transfer_not_started and refund_not_started added. A12-01: refund_after_dispute_lost added; A13-01: refund_after_dispute_pending added. A12-03 part 1: transfer_no_answer_yet and refund_no_answer_yet added. O1 (admin_attention): the job_closed_money_held sentence says the admin can refund the customer in the app, and that paying the worker is the developer''s; transfer_reversed is the developer''s (no decision in the app; tips share the code). O1-G: tip_payee_gone, refund_failed and refund_failed_several are the developer''s (resolve_tip and resolve_refund_failure are service_role only, so no line in the app can end them), and their sentences say so.';

-- ---------------------------------------------------------------------------
-- 8. The timer: its installer, the list restated, and the install.
-- ---------------------------------------------------------------------------
create or replace function public.install_admin_attention_schedule()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_stale bigint;
begin
  if not public.pg_function_present('cron', 'schedule') then
    raise notice 'admin attention: pg_cron absent (local stack) — schedule skipped';
    return 'skipped: pg_cron absent';
  end if;

  -- By jobid: cron.unschedule has a (bigint) and a (name) overload.
  for v_stale in select j.jobid from cron.job j where j.jobname = 'brazos-admin-attention'
  loop
    perform cron.unschedule(v_stale);
  end loop;

  perform cron.schedule('brazos-admin-attention', '*/10 * * * *',
                        $cron$select public.notify_attention_admins();$cron$);

  return 'scheduled: brazos-admin-attention';
end
$function$;
revoke all on function public.install_admin_attention_schedule() from public, anon, authenticated;
grant execute on function public.install_admin_attention_schedule() to service_role;
comment on function public.install_admin_attention_schedule() is
  'O1: puts brazos-admin-attention (every 10 minutes: select public.notify_attention_admins();) on pg_cron, replacing its own name by jobid. service_role only.';

create or replace function public.expected_schedules()
returns table (installer text, jobname text, schedule text, command text)
language sql immutable
set search_path = public, pg_temp
as $fn$
  values
    ('install_settlement_schedules', 'auto-release-due-payments',   '*/10 * * * *', 'select public.auto_release_due_payments();'),
    ('install_settlement_schedules', 'expire-unfunded-payments',    '*/15 * * * *', 'select public.expire_unfunded_payments();'),
    ('install_settlement_schedules', 'brazos-process-settlements',  '*/5 * * * *',  'select public.drain_settlements();'),
    ('install_reminder_schedule',    'brazos-tomorrow-reminders',   '0 22 * * *',   'select public.enqueue_tomorrow_reminders();'),
    ('install_series_schedule',      'brazos-job-series',           '17 * * * *',   'select public.advance_job_series();'),
    ('install_receipt_schedule',     'brazos-send-receipts',        '*/5 * * * *',  'select public.drain_receipts();'),
    ('install_payment_events_prune', 'brazos-prune-payment-events', '30 3 * * *',   'select public.prune_payment_event_payloads();'),
    ('install_push_schedule',        'brazos-drain-push',           '* * * * *',    'select public.drain_notification_outbox();'),
    ('install_lifecycle_schedules',  'close-unpaid-hires',          '*/15 * * * *', 'select public.close_unpaid_hires();'),
    ('install_lifecycle_schedules',  'expire-open-jobs',            '7 * * * *',    'select public.expire_open_jobs();'),
    ('install_lifecycle_schedules',  'close-no-show-hires',         '7 * * * *',    'select public.close_no_show_hires();'),
    ('install_admin_attention_schedule', 'brazos-admin-attention',  '*/10 * * * *', 'select public.notify_attention_admins();')
$fn$;
revoke all on function public.expected_schedules() from public, anon, authenticated;
grant execute on function public.expected_schedules() to service_role;
comment on function public.expected_schedules() is
  'B7: every pg_cron timer the migrations install — installer, name, schedule, command. A migration that adds a timer replaces this list (newest rows plus its own) and ends with select public.install_schedules(). 331_schedules_loud.sql fails when an install_* function is not listed or cron.job differs. O1 (admin_attention) added brazos-admin-attention. service_role only.';

select public.install_schedules();

commit;
