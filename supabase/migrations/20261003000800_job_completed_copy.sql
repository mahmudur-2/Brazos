-- C6 (FIX-RUN 2026-10-03) — the "job finished" push and feed row read as a person wrote them.
--
-- Before: title "Job marked complete", body "Sam Okafor finished Mount a 65-inch TV above the
-- fireplace." — the job's title glued into a sentence, which reads as broken English for most
-- titles. After: title "Sam finished the job" (the first name, as the lock-screen card says it),
-- body "“Mount a 65-inch TV above the fireplace” is done. Check the work and approve."
--
-- notify_on_job_status() — the 20260930000100 body verbatim, except branch (5)'s title and
-- body. Type, category ('jobs', always on), recipient, actor, data and dedupe key are unchanged:
-- the feed, lib/notificationRoutes.ts and auto_release_due_payments()'s told-gate key on type and
-- data, never on the words. CREATE OR REPLACE keeps the function's ACL; the revoke is restated
-- exactly as 20260930000100 restated it. Additive: nothing is dropped or renamed.

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
REVOKE ALL ON FUNCTION "public"."notify_on_job_status"() FROM PUBLIC;
