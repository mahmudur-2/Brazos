-- hire_notice — production-36h S4, step B: when the worker says yes to the customer's offer, the
-- customer is told, always, and told to protect the payment.
--
-- WHAT WAS WRONG. A hire made by the worker accepting the customer's offer (a direct offer's draft,
-- 20261112040000_payouts_gate.sql:180-190 and 424-453, or the customer's counter on a bid) told
-- the customer only through the offer thread's generic "New message" push (notify_on_message,
-- category messages, 20261108000000_lean_v1.sql:916-1024), which the customer can switch off; a
-- bid's counter chain sends not even that. notify_on_job_request's 'hire_accepted' notice is gone
-- since lean v1. Yet from the hire the customer has 24 hours to protect the payment before
-- close_unpaid_hires() closes the job.
--
-- WHAT CHANGES. notify_on_job_status(): the 20261003000800_job_completed_copy.sql body verbatim,
-- plus branch (4b) inside branch (4). When the job becomes assigned through an offer the customer
-- wrote (author = the customer: the worker is the one who said yes), the customer gets one notice
-- under the always-on category 'jobs' (no preference, quiet hour or block holds it back):
--   type   hire_accepted (lib/notificationRoutes.ts already gives it an icon; it routes on screen)
--   title  "<worker's first name> accepted your offer" ("Your worker accepted your offer" when the
--          worker has no name)
--   body   "<job title, 60 characters at most>: open the job to protect the payment and see the
--          deadline."  It names no hours: unpaid_pause can move the closing time; the job screen
--          shows it.
--   data   screen ClientJobDetail, jobId; dedupe key hire_accepted:<job>:<worker>.
-- Not sent:
--   * when the customer accepted the worker's bid or counter (the customer did it);
--   * when the job is a repeat visit's draft whose series exists: series_on_visit_change() already
--     sends that customer 'series_confirm' ("<name> can come ... / Confirm $..."), so a second
--     notice would say the same thing twice (its exact condition, mirrored here).
-- Branch (4) and branch (5), their words, types, categories, keys and data are unchanged. The
-- revoke is restated as the live ACL holds it (20261112050000_access_start_state.sql took the
-- grants of authenticated and service_role too): a trigger function needs no caller grant.
--
-- Additive under scripts/staging-scan.sh. Proof: supabase/tests/492_hire_notice.sql.

begin;

CREATE OR REPLACE FUNCTION "public"."notify_on_job_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- (4) Assigned to a worker — covers both accepting a bid and a direct hire.
  if new.assigned_worker_id is not null
     and (old.assigned_worker_id is null or old.assigned_worker_id <> new.assigned_worker_id)
  then
    perform public.enqueue_notification(
      new.assigned_worker_id,
      new.client_id,
      'job_updates',
      'job_assigned',
      'You got the job',
      left(new.title, 80) || ' is yours. Tap for the details.',
      jsonb_build_object('screen', 'WorkerJob', 'jobId', new.id::text),
      'job_assigned:' || new.id::text || ':' || new.assigned_worker_id::text
    );

    -- (4b) hire_notice: the worker said yes to the customer's own offer. Tell the customer under
    -- the always-on category, unless the series' Confirm notice already does.
    if new.status = 'assigned'
       and exists (select 1 from public.job_offers o
                    where o.id = new.accepted_offer_id
                      and o.author_id = new.client_id)
       and not (new.series_id is not null
                and old.status = 'draft'
                and exists (select 1 from public.job_series s where s.id = new.series_id))
    then
      perform public.enqueue_notification(
        new.client_id,
        new.assigned_worker_id,
        'jobs',
        'hire_accepted',
        coalesce(nullif(split_part(btrim(coalesce(public.notify_display_name(new.assigned_worker_id), '')), ' ', 1), ''), 'Your worker')
          || ' accepted your offer',
        left(new.title, 60) || ': open the job to protect the payment and see the deadline.',
        jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.id::text),
        'hire_accepted:' || new.id::text || ':' || new.assigned_worker_id::text
      );
    end if;
  end if;

  -- (5) Worker marked it complete — tell the customer, and land them on the
  -- screen showing the completion photos.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.enqueue_notification(
      new.client_id,
      new.assigned_worker_id,
      'jobs',
      'job_completed',
      coalesce(nullif(split_part(btrim(coalesce(public.notify_display_name(new.assigned_worker_id), '')), ' ', 1), ''), 'Your worker')
        || ' finished the job',
      '“' || left(new.title, 60) || '” is done. Check the work and approve.',
      jsonb_build_object('screen', 'ClientJobDetail', 'jobId', new.id::text),
      'job_completed:' || new.id::text
    );
  end if;

  return new;
end;
$$;
revoke all on function public.notify_on_job_status() from public, anon, authenticated, service_role;

commit;
