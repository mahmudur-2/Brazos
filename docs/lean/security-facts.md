# Security facts from the LOCAL database (step E1a)

- Date: 2026-11-07
- HEAD: 72b6a30 (branch lean-v1)
- Route used: docker exec -i supabase_db_BRAZOS psql -U postgres -d postgres -At -f - reading a read-only SQL file (SELECT only). The supabase test db route was not needed.
- Database: PostgreSQL 17.6, local Docker stack only. Every number below is VERIFIED (measured on this stack) unless marked UNKNOWN or INFERRED.
- Privilege checks use has_*_privilege (includes inherited and PUBLIC grants).
- These are LOCAL values. Staging settings, grants and cron rows may differ; not measured.

## 1. Table and view privileges (schema public)

Legend: S=SELECT I=INSERT U=UPDATE D=DELETE T=TRUNCATE R=REFERENCES G=TRIGGER M=MAINTAIN. Flags: A = anon has more than SELECT; TGM = authenticated has T, G or M; ALL = authenticated has all 8.

| name | kind | anon | authenticated | flag |
|---|---|---|---|---|
| app_config | r | S | S |  |
| areas | r | TRGM | STRGM | A TGM |
| banned_phones | r | STRGM | STRGM | A TGM |
| bids | r | STRGM | SDTRGM | A TGM |
| blocks | r | STRGM | SIDTRGM | A TGM |
| conversation_states | r | TRGM | STRGM | A TGM |
| direct_threads | r | STRGM | STRGM | A TGM |
| job_agreements | r | - | S |  |
| job_checklist_items | r | TRGM | SIUDTRGM | A TGM ALL |
| job_completions | r | - | S |  |
| job_disputes | r | TRGM | STRGM | A TGM |
| job_locations | r | STRGM | STRGM | A TGM |
| job_offers | r | TRGM | STRGM | A TGM |
| job_requests | r | STRGM | STRGM | A TGM |
| jobs | r | STRGM | SDTRGM | A TGM |
| legal_acceptances | r | STRGM | SIUDTRGM | A TGM ALL |
| live_location_shares | r | TRGM | STRGM | A TGM |
| message_reactions | r | STRGM | SIUDTRGM | A TGM ALL |
| message_reads | r | STRGM | SIUDTRGM | A TGM ALL |
| messages | r | STRGM | SIUDTRGM | A TGM ALL |
| mutes | r | STRGM | SIDTRGM | A TGM |
| notification_outbox | r | TRGM | STRGM | A TGM |
| notification_prefs | r | STRGM | SIUDTRGM | A TGM ALL |
| payments | r | TRGM | STRGM | A TGM |
| portfolio_items | r | STRGM | SIUDTRGM | A TGM ALL |
| profiles | r | TRGM | TRGM | A TGM |
| properties | r | TRGM | SIUDTRGM | A TGM ALL |
| push_tokens | r | STRGM | SIUDTRGM | A TGM ALL |
| reports | r | STRGM | SIUDTRGM | A TGM ALL |
| reviews | r | STRGM | STRGM | A TGM |
| saved_workers | r | TRGM | SIUDTRGM | A TGM ALL |
| worker_semantic_docs | r | TRGM | TRGM | A TGM |
| worker_services | r | TRGM | SIUDTRGM | A TGM ALL |
| conversations | v | SIUDTRGM | SIUDTRGM | A TGM ALL |
| v_bids_projection_drift | v | TRGM | TRGM | A TGM |

Relations with no anon and no authenticated privilege (12, VERIFIED, rows omitted from the table above): tables blocked_terms, fee_schedule, job_series, live_activity_tokens, live_card_outbox, payment_accounts, payment_events, receipt_outbox; views refunds_due, refunds_ready, transfers_due, transfers_ready.

Counts (VERIFIED):
- relations=47 (tables=41, views=6). anon: flagged (non-SELECT-only)=32, no privilege at all=14, SELECT only=1. authenticated: has T/G/M=32, has all 8=13, no privilege at all=12.


**Flag (1):** anon holds TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on 31 tables and 1 view; anon holds INSERT, UPDATE and DELETE only on the view conversations. 14 of the 31 anon-flagged tables give anon no SELECT (pattern TRGM). authenticated holds TRUNCATE, TRIGGER and MAINTAIN on 32 relations and all 8 privileges on 13 (12 tables plus the view conversations). TRUNCATE ignores RLS (PostgreSQL behaviour, INFERRED).

## 2. Column-level grants (profiles, notification_outbox, job_series)

Source: information_schema.column_privileges (expands table-level grants into columns). Roles anon and authenticated only; unlisted privilege types are not granted.

| table | role | privilege | columns granted / total | columns |
|---|---|---|---|---|
| job_series | authenticated | SELECT | 14/16 | anchor_date, cadence, client_id, created_at, id, next_visit_date, next_visit_no, origin_job_id, pending_job_id, price_cents, status, stopped_at, updated_at, worker_id |
| notification_outbox | anon | REFERENCES | 15/15 | ALL columns |
| notification_outbox | authenticated | REFERENCES | 15/15 | ALL columns |
| notification_outbox | authenticated | SELECT | 15/15 | ALL columns |
| notification_outbox | authenticated | UPDATE | 1/15 | read_at |
| profiles | anon | REFERENCES | 22/22 | ALL columns |
| profiles | authenticated | REFERENCES | 22/22 | ALL columns |
| profiles | authenticated | SELECT | 15/22 | accepting_work, availability_note, avatar_url, bio, categories, completion_rate, full_name, id, language, on_time_pct, rating_avg, rating_count, response_time, role, verification_status |

Table-level ACL (pg_class.relacl; a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER m=MAINTAIN):

- job_series: {postgres=arwdDxtm/postgres,service_role=r/postgres}
- notification_outbox: {postgres=arwdDxtm/postgres,anon=Dxtm/postgres,authenticated=rDxtm/postgres,service_role=arwdDxtm/postgres}
- profiles: {postgres=arwdDxtm/postgres,anon=Dxtm/postgres,authenticated=Dxtm/postgres,service_role=arwdDxtm/postgres}


**Flag (2):** anon has REFERENCES on all columns of profiles and notification_outbox, and authenticated has REFERENCES on all columns of both; column SELECT/UPDATE grants are narrow (15/22, 15/15 + UPDATE read_at, 14/16).

## 3. Default privileges (pg_default_acl)

Types: r=table S=sequence f=function.

| owner role | schema | type | default ACL |
|---|---|---|---|
| postgres | public | S | {postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres} |
| postgres | public | f | {postgres=X/postgres} |
| postgres | public | r | {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres} |
| supabase_admin | public | S | {postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin} |
| supabase_admin | public | f | {postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin} |
| supabase_admin | public | r | {postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin} |

Other schemas with default ACL rows: 21 rows (auth, extensions, graphql, graphql_public, realtime, storage, supabase_functions), not listed.

**Flag (3):** new tables (all 8 privileges) and sequences (rwU) created by postgres or supabase_admin in public go to anon, authenticated and service_role. New functions: postgres owner gets EXECUTE for postgres only; supabase_admin owner for anon, authenticated and service_role.

## 4. Functions in public

Summary (VERIFIED): functions=208, SECURITY DEFINER=167, invoker=41. EXECUTE: anon=3 (definer 2), authenticated=125 (definer 88), service_role=48. SECURITY DEFINER with search_path in proconfig=167 of 167. Invoker with search_path=22, invoker without proconfig=19. Trigger functions (return type trigger)=26. Extension-owned functions in public=0. Overloaded names=0. PUBLIC has EXECUTE on 0 functions (proacl null=0, proacl contains =X: 0).

### 4a. Groups (function names have no overloads, so argument types are omitted here; 4b has them)

| kind | proconfig | anon | auth | service_role | n | names |
|---|---|---|---|---|---|---|
| DEFINER | sp=public, pg_temp | Y | Y | - | 2 | (see 4c) |
| DEFINER | sp=public, pg_temp | - | Y | - | 79 | (see 4c) |
| DEFINER | sp=public, pg_temp | - | Y | Y | 6 | (see 4c) |
| DEFINER | sp=public, extensions, pg_temp | - | Y | Y | 1 | (see 4c) |
| DEFINER | sp=public, pg_temp | - | - | - | 41 | cancellation_fee_cents, close_requests_on_block, conversation_parties, create_default_notification_prefs, drain_notification_outbox, enforce_portfolio_cap, enforce_tip_ceiling, enqueue_notification, enqueue_receipts, enqueue_tomorrow_reminders, ensure_direct_thread, ensure_thread_for_offer, expire_offer_if_stale, handle_new_user, job_agreements_immutable, job_terms, live_card_enqueue, mirror_offer_chain_to_bids, notify_display_name, notify_nearby_for_job, notify_on_bid, notify_on_dispute, notify_on_job_location, notify_on_job_request, notify_on_job_status, notify_on_message, notify_on_offer_counter, notify_on_payment_release, notify_on_review, offer_post_event, project_offer_chain_to_bids, quiet_hours_until, recompute_profile_rating, refund_on_no_show_withdrawn, reject_blocked_terms, series_close_offers, series_offer_visit, series_on_visit_change, series_open_visit, settle_offers_on_cancelled_job, snapshot_job_agreement |
| DEFINER | sp=public, pg_temp | - | - | Y | 32 | advance_job_series, apply_payment_event, attach_provider_ref, auto_release_due_payments, claim_live_card_batch, claim_notification_batch, claim_receipt_batch, deactivate_push_token, drain_live_cards, drain_receipts, drain_settlements, enqueue_payment_declined, expire_unfunded_payments, get_payment_account, get_payment_customer, install_live_card_schedule, install_payment_events_prune, install_receipt_schedule, install_reminder_schedule, install_series_schedule, install_settlement_schedules, prune_payment_event_payloads, receipt_details, record_settlement_attempt, resolve_job_dispute, resolve_live_card, resolve_notification, resolve_receipt, set_payment_account, set_payment_customer, set_payouts_enabled, set_payouts_status |
| DEFINER | sp=public, extensions, pg_temp | - | - | Y | 3 | apply_worker_embeddings, worker_semantic_coverage, worker_semantic_refresh_queue |
| DEFINER | sp=public, extensions, pg_temp | - | - | - | 3 | build_worker_semantic_source, mark_worker_semantic_stale, refresh_worker_semantic_doc |
| invoker | none | Y | Y | - | 1 | job_categories_expanded |
| invoker | none | - | Y | - | 18 | active_work_lifecycle_enabled, counter_notification_copy_enabled, counter_notification_enabled, counteroffer_cap_enabled, direct_thread_notifications_enabled, hardening_fixes_enabled, legal_acceptance_enabled, marketplace_thread_identity_enabled, messaging_lock_enabled, notification_feed_enabled, offer_scoped_chat_enabled, portfolio_category_freeform_enabled, push_notifications_enabled, review_integrity_enabled, sandbox_cash_out_enabled, security_definer_search_path_enabled, view_security_invoker_enabled, worker_self_service_enabled |
| invoker | sp=public, pg_temp | - | Y | - | 13 | area_for_point, bids_projection_enabled, bids_projection_v2_enabled, job_offer_rpcs_enabled, job_offers_enabled, phase73_null_safe_guards_enabled, phase75_security_hardening_enabled, phase76_corrections_enabled, phase77_conversation_features_enabled, phase78_properties_enabled, post_wizard_fields_enabled, push_scheduler_enabled, sandbox_payments_enabled |
| invoker | sp=public, pg_temp | - | Y | Y | 5 | connect_onboarding_enabled, job_completions_enabled, settlement_retry_enabled, settlement_schedules_enabled, stripe_foundation_enabled |
| invoker | sp=public, pg_temp | - | - | - | 3 | clock_label, money_label, series_visit_date |
| invoker | sp=pg_catalog, pg_temp | - | - | Y | 1 | pg_function_present |

### 4b. Executable by anon (name(args) | kind | proconfig)

- job_categories_expanded() | invoker | none
- phase76_rls_posture() | DEFINER | {"search_path=public, pg_temp"}
- review_is_revealed(uuid, uuid, uuid, timestamp with time zone) | DEFINER | {"search_path=public, pg_temp"}

### 4c. SECURITY DEFINER functions executable by authenticated (name; +svc = service_role also has EXECUTE; +anon = anon also has EXECUTE). All have search_path=public, pg_temp except match_workers_semantic (public, extensions, pg_temp).

- accept_bid +svc
- accept_legal_documents
- accept_offer
- account_deletion_blockers
- account_deletion_enabled
- admin_open_reports
- ban_user
- begin_job_payment
- begin_tip_payment
- can_delete_own_job
- cancel_job
- client_job_stats
- counter_offer
- create_bid
- create_job
- create_job_request
- create_offer
- create_review
- current_fee +svc
- current_user_is_admin
- current_user_is_banned
- decline_offer
- delete_my_account
- drop_series_worker
- get_my_active_mode
- get_my_profile
- is_active_user +svc
- is_blocked_between
- is_profile_active
- job_bid_count
- job_bid_counts
- job_hotspots
- job_offer_count
- job_offer_counts
- job_payment_state
- job_request_parties_ok +svc
- jobs_in_cell
- jobs_within_radius
- live_card_state +svc
- mark_direct_thread_read
- mark_worker_arrival
- match_workers_semantic +svc
- messaging_unlocked
- my_payouts_enabled
- my_payouts_status
- my_pending_job_requests
- my_pending_offers
- open_job_dispute
- phase68_deleted_at_authorization_enabled
- phase69_execute_lockdown_enabled
- phase70_unsend_message_authz_enabled
- phase71_reviews_read_lockdown_enabled
- phase72_storage_read_lockdown_enabled
- phase76_rls_posture +anon
- profile_review_summaries
- profile_review_summary
- profile_reviews
- quote_job_price +svc
- register_live_activity
- register_push_token
- release_job_payment
- report_running_late
- respond_job_request
- review_is_revealed +anon
- sandbox_authorize_job_payment
- sandbox_cash_out
- sandbox_hold_job_payment
- sandbox_release_job_payment
- sandbox_tip_worker
- set_active_mode
- set_block
- set_conversation_state
- set_direct_thread_read_at
- set_job_property
- should_notify
- start_job_series
- start_live_location
- stop_job_series
- stop_live_location
- transition_job_status
- unban_user
- unsend_message
- update_job_details
- update_live_location
- update_my_profile
- withdraw_job_dispute
- withdraw_offer
- worker_job_stats

**Flag (4):** 88 SECURITY DEFINER functions are executable by authenticated and 2 DEFINER functions plus 1 invoker function by anon (matches inventory-db.md). accept_bid and respond_job_request are executable by authenticated although the repo CLAUDE.md calls them deprecated. ban_user, unban_user, admin_open_reports and current_user_is_admin are executable by authenticated; whether each checks admin in its body: UNKNOWN (not measured). 19 invoker functions have no search_path (18 *_enabled flags plus job_categories_expanded).

## 5. Row level security (public)

- tables=41, RLS on=41, RLS off=0, FORCE RLS on=0 (VERIFIED). Tables with RLS off: none.
- RLS on with zero policies (9; their anon and authenticated privileges are in section 1 and Flag 5):
  banned_phones, blocked_terms, fee_schedule, live_activity_tokens, live_card_outbox, payment_accounts, payment_events, receipt_outbox, worker_semantic_docs

- Policies in public: 81 total. By role list: 1 policies for {anon,authenticated}; 70 policies for {authenticated}; 10 policies for {public}.
- Policies whose role is not just authenticated (11):
  - app_config is world-readable on app_config, SELECT, roles {anon,authenticated}
  - job owner views bids on their job on bids, SELECT, roles {public}
  - workers insert own bids on bids, INSERT, roles {public}
  - workers update own bids on bids, UPDATE, roles {public}
  - workers view own bids on bids, SELECT, roles {public}
  - clients insert own jobs on jobs, INSERT, roles {public}
  - clients update own jobs on jobs, UPDATE, roles {public}
  - parties view own payments on payments, SELECT, roles {public}
  - profiles are viewable by authenticated users on profiles, SELECT, roles {public}
  - users insert own profile on profiles, INSERT, roles {public}
  - users update own profile on profiles, UPDATE, roles {public}


**Flag (5):** the 9 zero-policy tables expose no rows to anon or authenticated. banned_phones keeps SELECT, TRUNCATE, REFERENCES, TRIGGER and MAINTAIN for both roles; worker_semantic_docs keeps TRUNCATE, REFERENCES, TRIGGER and MAINTAIN for both; the other 7 have no anon or authenticated privilege. 10 policies use role public (not authenticated) and 1 uses anon plus authenticated (app_config); the other 70 use authenticated.

## 6. Sequences (public)

| name | anon USAGE/SELECT/UPDATE | authenticated USAGE/SELECT/UPDATE | ACL |
|---|---|---|---|
| fee_schedule_id_seq | f/f/f | f/f/f | {postgres=rwU/postgres,service_role=rwU/postgres} |
| job_number_seq | f/f/f | f/f/f | {postgres=rwU/postgres,service_role=rwU/postgres} |

**Flag (6):** none for the 2 existing sequences (anon and authenticated hold nothing). New ones inherit rwU (section 3).

## 7. Storage

### 7a. storage.buckets

| id | public | file_size_limit | allowed_mime_types |
|---|---|---|---|
| avatars | f | null | null |
| chat-audio | f | null | null |
| chat-documents | f | null | null |
| chat-photos | f | null | null |
| job-photos | f | null | null |

### 7b. storage.objects policies (pg_policies, schema storage; the ::text casts were removed from qual and with_check for size)

| name | cmd | roles | qual | with_check |
|---|---|---|---|---|
| avatars_insert | INSERT | {authenticated} | null | ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())) AND is_active_user()) |
| avatars_read | SELECT | {authenticated} | (bucket_id = 'avatars') | null |
| avatars_update | UPDATE | {authenticated} | ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid()))) | ((bucket_id = 'avatars') AND ((storage.foldername(name))[1] = (auth.uid())) AND is_active_user()) |
| chat_audio_insert_party | INSERT | {authenticated} | null | ((bucket_id = 'chat-audio') AND ((storage.foldername(name))[2] = (auth.uid())) AND is_active_user() AND (EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND ((j.client_id = auth.uid()) OR (j.assigned_worker_id = auth.uid())) AND (NOT is_blocked_between(j.client_id, COALESCE(j.assigned_worker_id, j.client_id))))))) |
| chat_audio_read_party | SELECT | {authenticated} | ((bucket_id = 'chat-audio') AND (EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND ((j.client_id = auth.uid()) OR (j.assigned_worker_id = auth.uid())))))) | null |
| chat_documents_insert_party | INSERT | {authenticated} | null | ((bucket_id = 'chat-documents') AND ((storage.foldername(name))[2] = (auth.uid())) AND is_active_user() AND ((EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND ((j.client_id = auth.uid()) OR (j.assigned_worker_id = auth.uid())) AND (NOT is_blocked_between(j.client_id, COALESCE(j.assigned_worker_id, j.client_id)))))) OR (EXISTS ( SELECT 1 FROM direct_threads t WHERE (((t.id) = (storage.foldername(objects.name))[1]) AND ((t.user_a = auth.uid()) OR (t.user_b = auth.uid())) AND (NOT is_blocked_between(t.user_a, t.user_b))))))) |
| chat_documents_read_party | SELECT | {authenticated} | ((bucket_id = 'chat-documents') AND ((EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND ((j.client_id = auth.uid()) OR (j.assigned_worker_id = auth.uid()))))) OR (EXISTS ( SELECT 1 FROM direct_threads t WHERE (((t.id) = (storage.foldername(objects.name))[1]) AND ((t.user_a = auth.uid()) OR (t.user_b = auth.uid()))))))) | null |
| chat_photos_insert_party | INSERT | {authenticated} | null | ((bucket_id = 'chat-photos') AND ((storage.foldername(name))[2] = (auth.uid())) AND is_active_user() AND (EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND ((j.client_id = auth.uid()) OR (j.assigned_worker_id = auth.uid())) AND (NOT is_blocked_between(j.client_id, COALESCE(j.assigned_worker_id, j.client_id))))))) |
| chat_photos_read_party | SELECT | {authenticated} | ((bucket_id = 'chat-photos') AND (EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND ((j.client_id = auth.uid()) OR (j.assigned_worker_id = auth.uid())))))) | null |
| job_photos_delete_own_completion | DELETE | {authenticated} | ((bucket_id = 'job-photos') AND ((storage.foldername(name))[1] <> 'postings') AND (EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND (j.assigned_worker_id = auth.uid()))))) | null |
| job_photos_delete_own_posting | DELETE | {authenticated} | ((bucket_id = 'job-photos') AND ((storage.foldername(name))[1] = 'postings') AND ((storage.foldername(name))[2] = (auth.uid()))) | null |
| job_photos_delete_own_review | DELETE | {authenticated} | ((bucket_id = 'job-photos') AND ((storage.foldername(name))[1] = 'reviews') AND ((storage.foldername(name))[2] = (auth.uid()))) | null |
| job_photos_insert | INSERT | {authenticated} | null | ((bucket_id = 'job-photos') AND is_active_user() AND ((((storage.foldername(name))[1] = 'postings') AND ((storage.foldername(name))[2] = (auth.uid()))) OR (((storage.foldername(name))[1] <> 'postings') AND (EXISTS ( SELECT 1 FROM jobs j WHERE (((j.id) = (storage.foldername(objects.name))[1]) AND (j.assigned_worker_id = auth.uid()))))))) |
| job_photos_insert_review | INSERT | {authenticated} | null | ((bucket_id = 'job-photos') AND is_active_user() AND ((storage.foldername(name))[1] = 'reviews') AND ((storage.foldername(name))[2] = (auth.uid()))) |
| job_photos_read | SELECT | {authenticated} | (bucket_id = 'job-photos') | null |

Storage policies: 15 rows, all on table(s) objects. RLS is on for every storage table (storage.objects rls=t).

**Flag (7):** all 5 buckets are private (public=false), with file_size_limit null and allowed_mime_types null in the local table (config.toml [storage] file_size_limit = 50MiB applies as the global cap). avatars_read and job_photos_read let any authenticated user read every object in that bucket (qual is only the bucket id). avatars has no DELETE policy; chat-audio, chat-documents and chat-photos have no UPDATE or DELETE policy.

## 8. supabase/config.toml (LOCAL settings; staging dashboard may differ, UNKNOWN)

- [api]: schemas public, graphql_public; max_rows=1000; auto_expose_new_tables=false.
- [auth]: enabled=true, site_url = http://127.0.0.1:3000, additional_redirect_urls = https://127.0.0.1:3000 and brazos://reset-password, jwt_expiry=3600, enable_refresh_token_rotation=true, refresh_token_reuse_interval=10, enable_signup=true, enable_anonymous_sign_ins=false, enable_manual_linking=false, minimum_password_length=6, password_requirements = empty string (none).
- [auth.email]: enable_signup=true, enable_confirmations=false, double_confirm_changes=true, secure_password_change=false, max_frequency=1s, otp_length=6, otp_expiry=3600.
- [auth.sms]: enable_signup=false, enable_confirmations=false, template = Your code is {{ .Code }}, max_frequency=5s. [auth.sms.twilio] enabled=false. otp_length and otp_expiry are not set under [auth.sms] (only under [auth.mfa.phone], otp_length=6, max_frequency=5s): value for phone OTP is UNKNOWN locally (not in file). [auth.sms.test_otp] is commented out: no test_otp configured.
- [auth.rate_limit]: email_sent=2, sms_sent=30, anonymous_users=30, token_refresh=150, sign_in_sign_ups=30, token_verifications=30, web3=30.
- [auth.mfa]: max_enrolled_factors=10; totp and phone enroll/verify all false. captcha, hooks: commented out (not configured). external apple, third-party providers, web3 solana, oauth_server: enabled=false.
- [storage]: file_size_limit=50MiB; s3_protocol enabled=true.
- [functions.*] blocks (12 function folders exist; 6 have a block):

| function | verify_jwt | enabled |
|---|---|---|
| stripe-webhook | false | (default) |
| create-payment | true | (default) |
| connect-onboarding | true | (default) |
| connect-status | true | (default) |
| payment-methods | true | (default) |
| connect-return | false | (default) |
| translate | (not set) | false |

- No block: process-settlements, send-live-cards, send-push, send-receipts, worker-search (default verify_jwt=true, INFERRED; config comments say the database wakes them with the service-role key).

**Flag (8):** enable_signup=true with email confirmations off (enable_confirmations=false) and minimum_password_length=6 with no password_requirements; email_sent rate limit is 2 locally. verify_jwt=false on stripe-webhook and connect-return.

## 9. Trigger on auth.users calling public.handle_new_user()

Answer: NO. Non-internal triggers on auth.users: 0. Non-internal triggers anywhere in schema auth: 0. Triggers anywhere calling public.handle_new_user: 0. The function public.handle_new_user() exists (secdef=t).

Repo files (not a DB measurement): supabase/seed.sql line 133 says the local stack has no such trigger; supabase/tests/_helpers.sql line 21 says staging has it. Staging itself: UNKNOWN.

**Flag (9):** on the local stack no trigger fires handle_new_user; profile rows are not created by sign-up locally.

## 10. Cron (cron.job)

Answer: schema cron exists=f, pg_cron installed=f, available=t. cron.job rows: UNKNOWN (table does not exist on the local stack). Installed extensions: pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1, vector 0.8.2. Schema net (pg_net) objects: 0.

The install_*_schedule functions exist in public (6): install_live_card_schedule, install_payment_events_prune, install_receipt_schedule, install_reminder_schedule, install_series_schedule, install_settlement_schedules. Staging cron rows: UNKNOWN.

**Flag (10):** none measurable: cron schedules cannot be read locally.
