-- 20261112050000_access_start_state.sql — lean ACL: a database built from these migrations ends with
-- the rights the tests prove, whether it started as the local stack or as a new cloud project.
--
-- WHAT A NEW CLOUD PROJECT STARTS WITH. Role postgres holds default privileges in schema public
-- that give anon, authenticated and service_role EXECUTE on every new function; with the dashboard
-- box "Automatically expose new tables" on, also SELECT, INSERT, UPDATE and DELETE on every new
-- table and USAGE and SELECT on every new sequence. The local stack starts without them
-- (supabase/config.toml, auto_expose_new_tables = false). The baseline is a dump: it re-issues the
-- GRANTs staging held but never takes back what a default gave, and its tail restores postgres's
-- table and sequence defaults but gives functions to postgres only. So on a cloud start every
-- function the chain creates keeps the default grants, and the function default stays open.
--
-- WHAT WAS MEASURED. A lab stack (never a remote project) replayed every migration from zero under
-- three start states: A the local stack, B a cloud project with the box on, C one with the box off.
-- Compared with A, B and C each held EXECUTE on 90 functions that A does not grant (16 to
-- authenticated, 88 to service_role, none to anon or PUBLIC) and a function default open to anon,
-- authenticated and service_role; B also held 33 table-level rights for authenticated on 12
-- tables. Among them: any signed-in user could turn any offer to expired (expire_offer_if_stale
-- takes the offer row from the caller), post offer events as the other party (offer_post_event)
-- and, with the box on, read every user's phone (table-level SELECT on profiles, whose read
-- policy is true; the tested stack grants 15 columns).
--
-- WHAT CHANGES. The statements below are generated from that catalog difference: every right B or
-- C held that A does not is revoked, each column grant a table-level REVOKE removes is restated,
-- and the function default becomes postgres only. Afterwards A, B and C end identical, object
-- rights and default privileges both (schema fingerprint and raw catalog, compared in the lab).
--
-- On a database that started in the tested state every statement here changes nothing (measured:
-- the local stack has identical rights with and without this file). Only REVOKE, GRANT and ALTER
-- DEFAULT PRIVILEGES: no destructive shape under scripts/staging-scan.sh.

begin;

-- 1. The default privileges postgres gives a new function in public: postgres only, as on the tested stack.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;

-- 2. Functions: the EXECUTE rights a cloud start state added at creation and no later file took back.
revoke execute on function
  public.create_default_notification_prefs(),
  public.deactivate_push_token(text),
  public.ensure_direct_thread(uuid,uuid),
  public.ensure_thread_for_offer(),
  public.expire_offer_if_stale(public.job_offers),
  public.mirror_offer_chain_to_bids(),
  public.notify_display_name(uuid),
  public.notify_on_dispute(),
  public.notify_on_job_location(),
  public.notify_on_job_status(),
  public.notify_on_review(),
  public.offer_post_event(uuid,uuid,uuid,text,integer),
  public.project_offer_chain_to_bids(uuid),
  public.recompute_profile_rating(),
  public.resolve_notification(uuid,text,text),
  public.settle_offers_on_cancelled_job()
from authenticated;
revoke execute on function
  public.accept_legal_documents(jsonb),
  public.account_deletion_blockers(),
  public.admin_open_reports(),
  public.ban_user(uuid,uuid),
  public.begin_job_payment(uuid),
  public.begin_tip_payment(uuid,integer),
  public.can_delete_own_job(uuid),
  public.cancel_job(uuid,text),
  public.cancellation_fee_cents(uuid,integer),
  public.client_job_stats(uuid),
  public.create_default_notification_prefs(),
  public.create_job(text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text,boolean),
  public.create_review(uuid,uuid,integer,text,jsonb,boolean),
  public.current_user_is_admin(),
  public.current_user_is_banned(),
  public.decline_offer(uuid),
  public.delete_my_account(),
  public.drop_series_worker(uuid),
  public.enforce_tip_ceiling(),
  public.enqueue_notification(uuid,uuid,text,text,text,text,jsonb,text),
  public.enqueue_receipts(),
  public.enqueue_tomorrow_reminders(date),
  public.ensure_direct_thread(uuid,uuid),
  public.ensure_thread_for_offer(),
  public.expire_offer_if_stale(public.job_offers),
  public.get_my_active_mode(),
  public.get_my_profile(),
  public.handle_new_user(),
  public.is_blocked_between(uuid,uuid),
  public.is_profile_active(uuid),
  public.job_agreements_immutable(),
  public.job_hotspots(),
  public.job_payment_state(uuid),
  public.job_terms(uuid,integer),
  public.job_window_end(date,smallint),
  public.jobs_in_cell(bigint,bigint),
  public.mark_direct_thread_read(uuid),
  public.mark_worker_arrival(uuid,text),
  public.messaging_unlocked(uuid,uuid),
  public.mirror_offer_chain_to_bids(),
  public.money_label(integer),
  public.my_payouts_status(),
  public.my_pending_offers(),
  public.notify_display_name(uuid),
  public.notify_on_bid(),
  public.notify_on_dispute(),
  public.notify_on_job_location(),
  public.notify_on_job_status(),
  public.notify_on_message(),
  public.notify_on_offer_counter(),
  public.notify_on_payment_release(),
  public.notify_on_review(),
  public.offer_post_event(uuid,uuid,uuid,text,integer),
  public.open_job_dispute(uuid,text,text),
  public.payment_refund_held_by_dispute(uuid),
  public.profile_review_summaries(uuid[],text),
  public.profile_review_summary(uuid,text),
  public.profile_reviews(uuid,integer,integer,text),
  public.project_offer_chain_to_bids(uuid),
  public.queue_free_cancel_refund(uuid),
  public.quiet_hours_until(uuid),
  public.recompute_profile_rating(),
  public.refund_on_no_show_withdrawn(),
  public.register_push_token(text,text),
  public.reject_blocked_terms(),
  public.release_job_payment(uuid),
  public.report_running_late(uuid,integer),
  public.review_is_revealed(uuid,uuid,uuid,timestamp with time zone),
  public.series_close_offers(uuid,uuid),
  public.series_offer_visit(public.job_series,date),
  public.series_on_visit_change(),
  public.series_open_visit(public.job_series,date,uuid),
  public.series_visit_date(date,text,integer),
  public.set_active_mode(text),
  public.settle_offers_on_cancelled_job(),
  public.should_notify(uuid,uuid,text),
  public.snapshot_job_agreement(),
  public.start_job_series(uuid,text),
  public.stop_job_series(uuid),
  public.transition_job_status(uuid,text,jsonb,jsonb),
  public.unban_user(uuid),
  public.unsend_message(uuid),
  public.update_job_details(uuid,text,text,public.job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smallint,smallint,text,text),
  public.update_my_profile(jsonb),
  public.withdraw_job_dispute(uuid),
  public.withdraw_offer(uuid),
  public.worker_job_stats(uuid),
  public.worker_missed_window(public.jobs,timestamp with time zone)
from service_role;

-- 3. Tables: the table-level rights a cloud start state added. A table-level REVOKE also removes that
--    role's column grants of the same privilege, so each one the tested stack holds is restated after it.
revoke insert, update, delete on table public.banned_phones from authenticated;
revoke insert, update on table public.bids from authenticated;
revoke update on table public.blocks from authenticated;
revoke insert, update, delete on table public.direct_threads from authenticated;
revoke insert, update, delete on table public.job_disputes from authenticated;
revoke insert, update, delete on table public.job_locations from authenticated;
revoke insert, update, delete on table public.job_offers from authenticated;
revoke insert, update on table public.jobs from authenticated;
revoke insert, update, delete on table public.notification_outbox from authenticated;
grant update (read_at) on table public.notification_outbox to authenticated;
revoke insert, update, delete on table public.payments from authenticated;
revoke select, insert, update, delete on table public.profiles from authenticated;
grant select (accepting_work, availability_note, avatar_url, bio, categories, completion_rate, full_name, id, language, on_time_pct, rating_avg, rating_count, response_time, role, verification_status) on table public.profiles to authenticated;
revoke insert, update, delete on table public.reviews from authenticated;

commit;
