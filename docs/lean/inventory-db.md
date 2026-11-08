# BRAZOS database and server inventory (Phase B step B3)

Written 2026-11-07 by a read-only helper. Branch lean-v1. Source of truth: the 35 files in `supabase/migrations/`, parsed by a script (statement splitter that respects dollar-quotes), then every name searched across app code, edge functions, tests and scripts. No database was contacted: every grant below is **derived from migration text (INFERRED)**, not read from a live catalog. The newest definition wins.

How to read this file:
- Migration files are named by their 14-digit prefix, e.g. `20260930001000` = `20260930001000_job_series.sql`; `20260901000000` = the baseline dump. `file:line` means that file at that line. Legend at the end of Part 1.
- **Labels**: V1, CUT, MAYBE, DEAD, TOOLING as in the brief. DEAD = no live caller in app code, edge functions, triggers, cron or other SQL; a DEAD object may still be referenced by other DEAD/CUT objects (noted). TOOLING = marker functions and views that only `scripts/verify-schema.mjs` or tests probe.
- **Proposal**: keep / drop / judge. "drop" means safe to put in the one cleanup migration once the listed dependents are edited. "judge" needs a human decision.
- **Grants** are shown as the effective result of REVOKE/GRANT statements in order. For functions: `a/u/s` = anon / authenticated / service_role can EXECUTE (Y/N). No function ends with PUBLIC execute (every function has an explicit REVOKE ... FROM PUBLIC). For tables: privilege lists per role; S=SELECT I=INSERT U=UPDATE D=DELETE TRUNC=TRUNCATE REF=REFERENCES TRIG=TRIGGER MAINT=MAINTAIN.
- Reference columns: `app` = App.tsx, lib/, screens/, components/, hooks/, modes/, navigation/, ui/, config/ (comment lines ignored); `edge` = supabase/functions; `sql` = other final function/policy/view/trigger/cron/table bodies; `dbt` = supabase/tests file prefixes (H = _helpers, p29 = phase29_security_contract); `jest` = tests/*.test.mjs file count; `types/database.ts` is generated and ignored. For tables, dbt/scripts/seed matches need a SQL-shaped use (from/join/into/update/public.name/quoted name), so generic words do not inflate them; app and jest matches are literal.

## Part 0. Findings the judge should read first

1. **Table privileges look wider than "RPC-write-only".** The baseline dump grants TRUNCATE, TRIGGER and MAINTAIN to `authenticated` on 11 public tables, and ALL to `authenticated` on 12 more tables (plus the `conversations` view: ALL to anon and authenticated; full list with file:line in the Summary). TRUNCATE ignores RLS. No pgTAP test asserts the absence of TRUNCATE/TRIGGER/MAINTAIN (grep of supabase/tests found none). The default-privilege lines (baseline:8664-8666, 8681-8683) also give anon/authenticated ALL on any table later created by postgres, so every later migration revokes by hand (all 11 later tables and the 4 later queue views do). NEEDS-JUDGE: confirm against the live catalog (`has_table_privilege`) before the security audit; I could not.
2. **`handle_new_user()` has no trigger in any migration.** The trigger on `auth.users` that creates a profile is not in the 35 files (seed.sql:133 and tests/_helpers.sql:21 say staging has it, a fresh local stack does not). NEEDS-JUDGE.
3. **Cron job `brazos-drain-push` is not in any migration.** The push drain (`drain_notification_outbox()` -> `send-push`) is scheduled only by `supabase/archive/phases/phase74_push_scheduler.sql:96`. Eight other cron jobs are created by migrations through `install_*()` functions. The cleanup migration must not unschedule it, and `archive/` cannot simply be deleted if staging relies on it. NEEDS-JUDGE.
4. **Sandbox money is woven into V1 functions.** Seven V1 function bodies contain sandbox branches (ban_user, job_payment_state, notify_on_payment_release, release_job_payment, cancel_job, refund_on_no_show_withdrawn, resolve_job_dispute) and `payments.provider` defaults to `sandbox` (baseline `payments` table; CHECK `payments_provider_known` at 20260905000000:188). Dropping the 5 sandbox RPCs means re-CREATing those 7 functions and changing the column default. Several pgTAP files (010, 020, 080 and others) call `sandbox_*` as fixtures to create paid jobs.
5. **The legacy `bids` table is still live plumbing**, not dead: trigger `job_offers_mirror_bids` fills it and trigger `bids_notify` -> `notify_on_bid()` sends the new-bid push (hire-from-push). Labelled MAYBE. `jobs.accepted_bid_id` has an FK to it (baseline:6940).
6. **`delete_my_account()` touches many CUT/DEAD tables** (mutes, message_reactions, message_reads, job_requests, saved_workers, portfolio_items, worker_services, worker_semantic_docs, job_checklist_items, ...). It must be re-CREATEd in the same migration that drops any of them.
7. **Weak or odd caller auth in edge functions** (Table 2): `connect-return` (none, by design), `stripe-webhook` (Stripe signature, verify_jwt off), `translate` (checks only that a Bearer header exists; relies on the platform JWT check; never deployed), and four cron-woken functions compare the whole `Authorization` header to the service-role key with `!==` (not constant-time).
8. **Inert policies**: policies for commands that no grant allows (e.g. "clients insert own jobs" while authenticated has no INSERT on jobs). Listed in Part 1 policies as `DEAD (inert)`; harmless but noise.
9. **28 jest files read `supabase/archive/phases/*.sql`** as fixtures (29 distinct phase files). Archiving or deleting that folder breaks them (Table 4).

## Part 1. SQL objects

### 1a. Tables and views (41 tables, 6 views)

| kind | name | defined in | security (RLS, grants as found) | referenced by | label | proposal | note |
|---|---|---|---|---|---|---|---|
| table | bids | 20260901000000:1108 | RLS on (20260901000000:7169); anon S/MAINT; auth S/REF/D/TRIG/TRUNC/MAINT; svc ALL | app (quoted name): lib/jobFilters.ts, lib/jobLifecycle.ts +7; sql: can_delete_own_job, create_bid, notify_on_bid, project_offer_chain_to_bids +10; dbt: 040,p29; jest: 5; scripts: lifecycle-proof.mjs,phase5-proof.sql; seed.sql | MAYBE | judge | legacy projection of job_offers (trigger job_offers_mirror_bids). Still drives the new-bid push (notify_on_bid is a trigger on bids). App reads only an embedded-count fallback (lib/jobs.ts:233). jobs.accepted_bid_id FK (baseline:6940). Quoted bids hits in app code are UI strings and sort keys, not table reads. Re-home notify_on_bid onto job_offers before dropping. |
| table | jobs | 20260901000000:1177 | RLS on (20260901000000:7286); anon S/MAINT; auth S/REF/D/TRIG/TRUNC/MAINT; svc ALL | app .from: hooks/useLiveJobCard.ts, lib/conversations.ts +3; sql: accept_offer, account_deletion_blockers, admin_open_reports, ban_user +101; dbt: 000,010,020,030,040,050,060,080,090,110,120,130,140,150,160,180,190,200,210,220,230,240,270,280,290,p29; jest: 13; scripts: lifecycle-proof.mjs,phase5-proof.sql; seed.sql | V1 | keep | core job row. Column-level cuts later: messages is separate. Has FKs to bids (accepted_bid_id, baseline:6940), properties (property_id, :6965), areas (area_code, :6950). |
| table | reviews | 20260901000000:1594 | RLS on (20260901000000:7535); anon S/MAINT; auth S/REF/TRIG/TRUNC/MAINT; svc ALL | app .from: lib/reviews.ts; sql: client_job_stats, recompute_profile_rating, review_is_revealed, create_review +8; dbt: 040,090,120,280,p29; jest: 5; scripts: lifecycle-proof.mjs,phase10-proof.sql; seed.sql | V1 | keep | reputation. |
| table | job_offers | 20260901000000:2111 | RLS on (20260901000000:7272); anon -; auth S; svc ALL | app .from: lib/offers.ts; sql: accept_bid, accept_offer, can_delete_own_job, counter_offer +28; dbt: 010,030,040,130,180; jest: 3; scripts: lifecycle-proof.mjs,phase5-proof.sql; seed.sql | V1 | keep | offers/bids/counters (unified model). |
| table | profiles | 20260901000000:2219 | RLS on (20260901000000:7471); anon MAINT; auth REF/TRIG/TRUNC/MAINT; svc ALL | app .from: lib/profiles.ts, lib/workerSearch.ts; sql: admin_open_reports, ban_user, build_worker_semantic_source, create_offer +32; dbt: 020,040,080,100,120,160,190,230,270,290,H,p29; jest: 5; scripts: lifecycle-proof.mjs,phase10-proof.sql; seed.sql | V1 | keep | column-level SELECT grants (baseline:7929-7985); no table-level SELECT for authenticated. |
| table | payments | 20260901000000:2519 | RLS on (20260901000000:7447); anon -; auth S/MAINT; svc ALL | app .from: lib/earnings.ts, lib/payments.ts; sql: account_deletion_blockers, ban_user, job_payment_state, open_job_dispute +30; dbt: 010,020,030,040,050,060,070,080,110,170,180,190,200,220,230,240,270,290; jest: 3; scripts: lifecycle-proof.mjs,phase10-proof.sql; seed.sql | V1 | keep | provider column DEFAULT sandbox, CHECK payments_provider_known allows sandbox+stripe (20260905000000:188): change default when sandbox is cut. |
| table | job_disputes | 20260901000000:3687 | RLS on (20260901000000:7260); anon -; auth S/MAINT; svc ALL | app .from: lib/disputes.ts; sql: account_deletion_blockers, job_payment_state, open_job_dispute, sandbox_release_job_payment +9; dbt: 030,040,070,110; scripts: lifecycle-proof.mjs,phase12-proof.sql; seed.sql | V1 | keep |  |
| table | areas | 20260901000000:5651 | RLS on (20260901000000:7159); anon -; auth S/REF/TRIG/TRUNC/MAINT; svc ALL | app: none; sql: area_for_point, areas::areas_select_all, constraint; dbt: 040; scripts: build-areas-seed.mjs,verify-schema.mjs | DEAD | drop | phase78 areas lookup. Only area_for_point (uncalled) + scripts/build-areas-seed.mjs use it. FK targets: jobs.area_code, properties.area_code. Drop after properties and the jobs.area_code column. |
| table | banned_phones | 20260901000000:5675 | RLS on (20260901000000:7166); anon S/MAINT; auth S/REF/TRIG/TRUNC/MAINT; svc ALL | app: none; sql: ban_user, handle_new_user, unban_user; dbt: 040 | V1 | keep | ban list; used by ban_user, unban_user, handle_new_user. |
| table | blocks | 20260901000000:5685 | RLS on (20260901000000:7182); anon S/MAINT; auth S/I/REF/D/TRIG/TRUNC/MAINT; svc ALL | app .from: lib/moderation.ts; sql: is_blocked_between, set_block, blocks::blocks_delete_own, blocks::blocks_insert_own +2; dbt: 040,110,160; jest: 2; scripts: verify-schema.mjs | V1 | keep | report/block. Timed-block RPC set_block is CUT but the table stays. |
| table | conversation_states | 20260901000000:5702 | RLS on (20260901000000:7231); anon -; auth S; svc ALL | app .from: lib/conversationStates.ts; sql: set_conversation_state, conversation_states::conversation_states_select_own; dbt: 040; jest: 2; scripts: verify-schema.mjs | CUT | drop | hidden/archived/cleared/deleted/muted/mark-unread chat state. Only set_conversation_state writes it. |
| table | direct_threads | 20260901000000:5723 | RLS on (20260901000000:7238); anon S/MAINT; auth S/REF/TRIG/TRUNC/MAINT; svc ALL | app .from: lib/conversations.ts, lib/directThreads.ts; sql: conversation_parties, ensure_direct_thread, mark_direct_thread_read, messaging_unlocked +10; dbt: 020,040; jest: 2; scripts: lifecycle-proof.mjs,phase61-proof.sql | V1 | keep | chat thread rows (offer-scoped). |
| table | messages | 20260901000000:5737 | RLS on (20260901000000:7379); anon S/MAINT; auth ALL; svc ALL | app .from: lib/conversations.ts, lib/messages.ts; sql: ban_user, create_offer, my_pending_offers, offer_post_event +9; dbt: 020,040,160,230,280,290; jest: 7; scripts: lifecycle-proof.mjs,phase12-proof.sql; seed.sql | V1 | keep | chat. CUT columns: audio_url, audio_duration_ms (voice), document_url, document_name, document_size_bytes (documents), unsent_at/reply_to_id (MAYBE). job_request_id FK to job_requests (DEAD) is still selected by lib/messages.ts:122. |
| table | job_checklist_items | 20260901000000:5856 | RLS on (20260901000000:7257); anon -; auth ALL; svc ALL | app .from: lib/checklist.ts; sql: job_checklist_items::checklist_delete_worker, job_checklist_items::checklist_insert_worker, job_checklist_items::checklist_select_parties, job_checklist_items::checklist_update_worker; dbt: 020,040; scripts: lifecycle-proof.mjs,phase6-proof.sql; seed.sql | MAYBE | judge | worker checklist (screens/WorkChecklistScreen.tsx). Part of "worker starts and completes"? Not named in the loop. |
| table | job_locations | 20260901000000:5871 | RLS on (20260901000000:7263); anon S/MAINT; auth S/REF/TRIG/TRUNC/MAINT; svc ALL | app .from: lib/jobs.ts; sql: create_offer, job_hotspots, jobs_in_cell, jobs_within_radius +7; dbt: 010,040,140,180,p29; scripts: lifecycle-proof.mjs,phase5-proof.sql; seed.sql | V1 | keep | exact address, owner + hired worker by RLS. |
| table | job_requests | 20260901000000:5900 | RLS on (20260901000000:7279); anon S/MAINT; auth S/REF/TRIG/TRUNC/MAINT; svc ALL | app: none; sql: close_requests_on_block, job_requests::job_requests_select_party, job_requests::job_requests_notify, constraint; dbt: 040; jest: 1; scripts: verify-schema.mjs | DEAD | drop | legacy hire requests (pre-offers). No function writes it (create_job_request goes through create_offer). Still referenced by: messages.job_request_id FK (baseline:7030) and column (lib/messages.ts:122), delete_my_account, close_requests_on_block, my_pending_job_requests, notify_on_job_request. |
| table | legal_acceptances | 20260901000000:5938 | RLS on (20260901000000:7311); anon S/MAINT; auth ALL; svc ALL | app .from: lib/legal/index.ts; sql: accept_legal_documents, legal_acceptances::legal_acceptances_insert_own, legal_acceptances::legal_acceptances_select_own; dbt: 040; jest: 2; scripts: verify-schema.mjs | V1 | keep | terms/privacy acceptance (LegalGateScreen). Not named in the loop; kept as store requirement. Judge may confirm. |
| table | live_location_shares | 20260901000000:5951 | RLS on (20260901000000:7322); anon -; auth S; svc ALL | app .from: lib/liveLocation.ts; sql: start_live_location, stop_live_location, update_live_location, live_location_shares::live_location_shares_select_party; dbt: 040; jest: 2; scripts: verify-schema.mjs | CUT | drop | live location. |
| table | message_reactions | 20260901000000:5973 | RLS on (20260901000000:7333); anon S/MAINT; auth ALL; svc ALL | app .from: lib/reactions.ts; sql: delete_my_account, message_reactions::message_reactions_delete_own, message_reactions::message_reactions_insert_own, message_reactions::message_reactions_select_party +1; dbt: 040 | MAYBE | judge | chat reactions. Not in V1 list and not in the CUT list. |
| table | message_reads | 20260901000000:5986 | RLS on (20260901000000:7358); anon S/MAINT; auth ALL; svc ALL | app .from: lib/conversationStates.ts, lib/conversations.ts; sql: delete_my_account, message_reads::message_reads_insert_own, message_reads::message_reads_select_own, message_reads::message_reads_select_party +1; dbt: 040; jest: 1; scripts: lifecycle-proof.mjs,seed-phase-6.sql; seed.sql | MAYBE | judge | read state. CUT list has "read/delivered ticks" and "mark unread"; but lib/conversations.ts uses it for unread counts (:309,:334). |
| table | mutes | 20260901000000:5996 | RLS on (20260901000000:7402); anon S/MAINT; auth S/I/REF/D/TRIG/TRUNC/MAINT; svc ALL | app .from: lib/moderation.ts; sql: delete_my_account, should_notify, mutes::mutes_delete_own, mutes::mutes_insert_own +1; dbt: 040,110; jest: 3 | CUT | drop | mute. should_notify reads it (re-CREATE needed). |
| table | notification_outbox | 20260901000000:6008 | RLS on (20260901000000:7417); anon -; auth S/MAINT; svc ALL | app .from: lib/notifications.ts; sql: claim_notification_batch, delete_my_account, enqueue_notification, resolve_notification +3; dbt: 020,030,040,050,070,080,090,110,140,150,160,170,180,200,250; jest: 2; scripts: lifecycle-proof.mjs,phase12-proof.sql | V1 | keep | push queue; drained by send-push. |
| table | notification_prefs | 20260901000000:6034 | RLS on (20260901000000:7420); anon S/MAINT; auth ALL; svc ALL | app .from: lib/notificationPrefs.ts; sql: create_default_notification_prefs, delete_my_account, notify_nearby_for_job, should_notify +4; dbt: 040,100,110,140,160,200; jest: 1; scripts: verify-schema.mjs | V1 | keep | prefs + quiet hours. |
| table | portfolio_items | 20260901000000:6052 | RLS on (20260901000000:7460); anon S/MAINT; auth ALL; svc ALL | app .from: lib/portfolio.ts; sql: build_worker_semantic_source, delete_my_account, enforce_portfolio_cap, portfolio_items::portfolio_delete_own +6; dbt: 040,280; jest: 1; scripts: phase9-proof.sql,verify-schema.mjs | MAYBE | judge | worker portfolio (PastWork). Not in the loop. |
| table | properties | 20260901000000:6074 | RLS on (20260901000000:7482); anon -; auth ALL; svc ALL | app: none; sql: set_job_property, properties::properties_delete_own, properties::properties_insert_own, properties::properties_select_own +2; dbt: 040; scripts: verify-schema.mjs | DEAD | drop | phase78 saved properties. Only set_job_property (uncalled) uses it. jobs.property_id FK (baseline:6965). |
| table | push_tokens | 20260901000000:6108 | RLS on (20260901000000:7501); anon S/MAINT; auth ALL; svc ALL | app .from: lib/pushNotifications.ts; sql: claim_notification_batch, deactivate_push_token, delete_my_account, register_push_token +4; dbt: 040; jest: 1; scripts: verify-schema.mjs | V1 | keep |  |
| table | reports | 20260901000000:6123 | RLS on (20260901000000:7520); anon S/MAINT; auth ALL; svc ALL | app .from: lib/moderation.ts; sql: admin_open_reports, ban_user, reports::reports_insert_own, reports::reports_select_admin +1; dbt: 040,280 | V1 | keep | report/block moderation. |
| table | saved_workers | 20260901000000:6141 | RLS on (20260901000000:7564); anon -; auth ALL; svc ALL | app .from: lib/savedWorkers.ts; sql: delete_my_account, saved_workers::saved_delete_own, saved_workers::saved_insert_own, saved_workers::saved_select_own; dbt: 040; scripts: phase9-proof.sql,seed-phase-9.sql | MAYBE | judge | favourite workers (SavedWorkersScreen, rebook). Not in the loop. |
| table | worker_semantic_docs | 20260901000000:6240 | RLS on (20260901000000:7591); anon -; auth -; svc ALL | app: none; sql: apply_worker_embeddings, delete_my_account, match_workers_semantic, refresh_worker_semantic_doc +2; dbt: 040; scripts: verify-schema.mjs | MAYBE | judge | embeddings for worker-search (semantic matching). Not in the loop. |
| table | worker_services | 20260901000000:6261 | RLS on (20260901000000:7594); anon -; auth ALL; svc ALL | app .from: lib/services.ts; sql: delete_my_account, worker_services::services_delete_own, worker_services::services_insert_own, worker_services::services_select_visible +2; dbt: 040,280; jest: 1; scripts: lifecycle-proof.mjs,phase9-proof.sql | MAYBE | judge | worker service list/prices (ServicesPricingScreen). Not named in the loop. |
| table | fee_schedule | 20260905000000:95 | RLS on (20260905000000:112); anon -; auth -; svc ALL | app: none; sql: current_fee, job_terms, job_agreements; dbt: 030 | V1 | keep | service fee. |
| table | app_config | 20260905000000:293 | RLS on (20260905000000:298); anon S; auth S; svc ALL | app .from: lib/remoteConfig.ts; sql: begin_job_payment, begin_tip_payment, app_config::app_config is world-readable; dbt: 030 | V1 | keep | world-readable remote config (anon + authenticated SELECT). |
| table | payment_events | 20260905000000:318 | RLS on (20260905000000:329); anon -; auth -; svc ALL | app: none; sql: apply_payment_event, prune_payment_event_payloads; dbt: 030,060,070,080,110,260 | V1 | keep | Stripe event log (service_role only). |
| table | payment_accounts | 20260905000000:339 | RLS on (20260905000000:348); anon -; auth -; svc ALL | app: none; sql: my_payouts_enabled, set_payouts_enabled, get_payment_customer, set_payment_customer +5; dbt: 030,050,060,220 | V1 | keep | Stripe customer/connect ids (service_role only). |
| table | job_agreements | 20260905000000:400 | RLS on (20260905000000:422); anon -; auth S; svc S | app: none; sql: snapshot_job_agreement, job_terms, receipt_details, job_agreements::job_agreements_select_parties +1; dbt: 030 | V1 | keep | immutable price snapshot at accept. |
| table | job_completions | 20260925000000:72 | RLS on (20260925000000:84); anon -; auth S; svc ALL | app: none; sql: transition_job_status, job_completions::job_completions_parties_select; dbt: 080 | V1 | keep |  |
| table | job_series | 20260930001000:89 | RLS on (20260930001000:112); anon -; auth -; svc S | app .from: lib/jobSeries.ts; sql: start_job_series, series_offer_visit, series_open_visit, advance_job_series +4; dbt: 180 | V1 | keep | repeat jobs. Column-level SELECT for authenticated (20260930001000:118). |
| table | receipt_outbox | 20260930001100:71 | RLS on (20260930001100:89); anon -; auth -; svc S | app: none; sql: enqueue_receipts, claim_receipt_batch, resolve_receipt, drain_receipts; dbt: 190 | V1 | keep | email receipts queue. |
| table | live_activity_tokens | 20260930001300:133 | RLS on (20260930001300:144); anon -; auth -; svc S | app: none; sql: register_live_activity, live_card_enqueue, claim_live_card_batch; dbt: 210; jest: 1 | MAYBE | judge | live card (lock screen). expo-live-activity is not in package.json. |
| table | live_card_outbox | 20260930001300:180 | RLS on (20260930001300:190); anon -; auth -; svc S | app: none; sql: live_card_enqueue, claim_live_card_batch, resolve_live_card, drain_live_cards; dbt: 210; jest: 1 | MAYBE | judge | live card queue; send-live-cards. |
| table | blocked_terms | 20261003000700:60 | RLS on (20261003000700:64); anon -; auth -; svc ALL | app: none; sql: reject_blocked_terms; dbt: 280 | V1 | keep | content filter list. |
| view | conversations | 20260901000000:5772 | view security_invoker; no RLS (views); anon ALL; auth ALL; svc ALL | app .from: lib/conversations.ts; dbt: 040; jest: 1; scripts: phase61-proof.sql,phase7-proof.sql | V1 | keep | view for the chat list; baseline grants ALL to anon and authenticated (baseline:8509-8510). security_invoker. |
| view | v_bids_projection_drift | 20260901000000:6152 | view security_invoker; no RLS (views); anon -; auth -; svc ALL | app: none; dbt: 040; scripts: verify-schema.mjs | TOOLING | drop | drift check for the bids projection; only scripts/verify-schema.mjs reads it. |
| view | transfers_due | 20260905000000:860 | view; no RLS (views); anon -; auth -; svc ALL | app: none; edge: process-settlements; sql: transfers_ready; dbt: 030,070,110,220,240; jest: 1 | V1 | keep | settlement queue view. |
| view | refunds_due | 20260920000000:116 | view; no RLS (views); anon -; auth -; svc ALL | app: none; edge: process-settlements; sql: refunds_ready; dbt: 030,060,070,220,230,270,290; jest: 1 | V1 | keep | settlement queue view. Replaced 1x. |
| view | transfers_ready | 20261003001100:24 | view; no RLS (views); anon -; auth -; svc ALL | app: none; edge: process-settlements; dbt: 220; jest: 1 | V1 | keep | settlement queue view (read by process-settlements). Replaced 1x. |
| view | refunds_ready | 20261003000000:39 | view; no RLS (views); anon -; auth -; svc ALL | app: none; edge: process-settlements; dbt: 220,230,290; jest: 1 | V1 | keep | settlement queue view (read by process-settlements). |

### 1b. Functions (208 live; 6 dropped, listed in 1g)

All SECURITY DEFINER functions carry `SET search_path` (checked on the final definition). Column "security": DEFINER or invoker; EXECUTE for anon/authenticated/service_role (a/u/s).

| kind | name(args) | defined in (newest first, older in brackets) | security | referenced by | label | proposal | note |
|---|---|---|---|---|---|---|---|
| function | accept_bid(uuid, uuid) | 20260901000000:186 | DEFINER, search_path set; a/u/s N/Y/Y | NO live caller; dbt: 040,p29; jest: 1; scripts: verify-schema.mjs | DEAD | drop | legacy RPC; app uses accept_offer. Only a code comment in screens/JobDetailScreen.tsx mentions it. dbtests 040/phase29 assert its grants. |
| function | accept_legal_documents(jsonb) | 20260901000000:209 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/legal/index.ts; dbt: 040; jest: 1; scripts: verify-schema.mjs | V1 | keep |  |
| function | accept_offer(uuid) | 20260901000000:258 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/offers.ts; sql: accept_bid, respond_job_request, advance_job_series +1; dbt: 010,020,030,040,060,070,080,090,110,120,130,150,170,180,200,210,230,290; jest: 8; scripts: lifecycle-proof.mjs,phase5-proof.sql; seed.sql | V1 | keep | only assignment path (CLAUDE.md invariant). |
| function | account_deletion_blockers() | 20261003001000:26 [replaces 20261003000300:19, 20260901000000:359] | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/accountDeletion.ts; sql: delete_my_account; dbt: 040,240,270,290; jest: 2; scripts: verify-schema.mjs | V1 | keep |  |
| function | account_deletion_enabled() | 20260901000000:456 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 040. |
| function | active_work_lifecycle_enabled() | 20260901000000:471 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | admin_open_reports() | 20260901000000:481 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/moderation.ts; dbt: 040 | V1 | keep |  |
| function | apply_worker_embeddings(jsonb, text) | 20260901000000:506 | DEFINER, search_path set; a/u/s N/N/Y | edge: worker-search; jest: 1; scripts: verify-schema.mjs | MAYBE | judge |  |
| function | area_for_point(double precision, double precision) | 20260901000000:549 | invoker; a/u/s N/Y/N | NO live caller; scripts: build-areas-seed.mjs,verify-schema.mjs | DEAD | drop | phase78 areas; no app call; scripts/build-areas-seed.mjs mentions it. |
| function | ban_user(uuid, uuid) | 20261003001200:31 [replaces 20261003000600:24, 20261003000100:33, 20260901000000:608] | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/moderation.ts; dbt: 030,040,230,270,290; jest: 3 | V1 | keep | Body has 1 "sandbox" mention(s): re-CREATE when sandbox is cut. |
| function | bids_projection_enabled() | 20260901000000:670 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | bids_projection_v2_enabled() | 20260901000000:683 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | build_worker_semantic_source(uuid) | 20260901000000:696 | DEFINER, search_path set; a/u/s N/N/N | sql: refresh_worker_semantic_doc; jest: 1; scripts: verify-schema.mjs | MAYBE | judge |  |
| function | can_delete_own_job(uuid) | 20260901000000:796 | DEFINER, search_path set; a/u/s N/Y/N | sql: jobs::jobs_delete_own; dbt: 040; scripts: phase60-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | claim_notification_batch(integer) | 20260930000800:135 [replaces 20260901000000:849] | DEFINER, search_path set; a/u/s N/N/Y | edge: send-push; dbt: 040,160; jest: 2; scripts: verify-schema.mjs | V1 | keep | service_role; called by send-push. |
| function | client_job_stats(uuid) | 20260925000100:304 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/clientStats.ts; sql: profile_review_summaries; dbt: 040,090,120; scripts: phase8-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | close_requests_on_block() | 20260901000000:913 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: blocks_close_job_requests on blocks | DEAD | drop | trigger fn on blocks that closes job_requests rows (DEAD table); trigger itself fires on every block. |
| function | conversation_parties(uuid, uuid, uuid, uuid) | 20260901000000:934 | DEFINER, search_path set; a/u/s N/N/N | sql: set_conversation_state, start_live_location, update_live_location; jest: 1 | CUT | drop |  |
| function | counter_notification_copy_enabled() | 20260901000000:972 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | counter_notification_enabled() | 20260901000000:982 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | counter_offer(uuid, integer) | 20260901000000:992 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/offers.ts; sql: respond_job_request; dbt: 010,040,250; jest: 5; scripts: phase5-proof.sql,phase61-proof.sql | V1 | keep |  |
| function | counteroffer_cap_enabled() | 20260901000000:1094 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | create_bid(uuid, integer, text) | 20260901000000:1122 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040,p29; jest: 1; scripts: verify-schema.mjs | DEAD | drop | legacy RPC; app uses create_offer. Only a code comment mentions it. dbtests 040/phase29 assert its grants. |
| function | create_default_notification_prefs() | 20260901000000:1161 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: profiles_default_notification_prefs on profiles; dbt: 100,110 | V1 | keep |  |
| function | create_job_request(11 args) | 20260901000000:1358 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; jest: 1; scripts: verify-schema.mjs | DEAD | drop | legacy; no app call. tests/hardening.test.mjs greps it. |
| function | create_offer(13 args) | 20260901000000:1387 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/offers.ts; sql: create_bid, create_job_request, project_offer_chain_to_bids +1; dbt: 010,020,030,040,060,070,080,090,110,120,130,150,170,180,200,210,250,280; jest: 9; scripts: lifecycle-proof.mjs,phase5-proof.sql | V1 | keep |  |
| function | current_user_is_admin() | 20260901000000:1672 | DEFINER, search_path set; a/u/s N/Y/N | sql: reports::reports_select_admin, reports::reports_update_admin; dbt: 040; scripts: verify-schema.mjs | V1 | keep |  |
| function | current_user_is_banned() | 20260901000000:1688 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/profiles.ts; dbt: 040; scripts: verify-schema.mjs | V1 | keep |  |
| function | deactivate_push_token(text) | 20260901000000:1702 | DEFINER, search_path set; a/u/s N/N/Y | edge: send-push; scripts: verify-schema.mjs | V1 | keep |  |
| function | decline_offer(uuid) | 20260901000000:1713 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/offers.ts; sql: respond_job_request, series_close_offers; dbt: 010,040,180; jest: 3; scripts: phase5-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | delete_my_account() | 20260901000000:1758 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/accountDeletion.ts; dbt: 030,040; jest: 3; scripts: verify-schema.mjs | V1 | keep | body deletes rows of many tables (see touch list); must be re-CREATEd in the drop migration. Body touches CUT/DEAD table(s): job_requests, mutes. Also MAYBE tables: job_checklist_items, message_reactions, message_reads, portfolio_items, saved_workers, worker_semantic_docs, worker_services. |
| function | direct_thread_notifications_enabled() | 20260901000000:1965 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | drain_notification_outbox() | 20260901000000:1975 | DEFINER, search_path set; a/u/s N/N/N | NO live caller; dbt: 040,050; scripts: verify-schema.mjs | V1 | keep | called by cron job brazos-drain-push, which exists only in supabase/archive/phases/phase74_push_scheduler.sql:96, not in any migration. NEEDS-JUDGE. |
| function | enforce_portfolio_cap() | 20260901000000:2012 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: portfolio_items_cap on portfolio_items | MAYBE | judge |  |
| function | enqueue_notification(uuid, uuid, text, text, text, text, jsonb, text) | 20260930000800:99 [replaces 20260901000000:2030] | DEFINER, search_path set; a/u/s N/N/N | sql: notify_nearby_for_job, notify_on_bid, notify_on_dispute +16; dbt: 040,160; jest: 3; scripts: rls-probe-offers.mjs,seed-review.mjs | V1 | keep |  |
| function | ensure_direct_thread(uuid, uuid) | 20260901000000:2054 | DEFINER, search_path set; a/u/s N/N/N | sql: create_offer, ensure_thread_for_offer; dbt: 040; jest: 4 | V1 | keep |  |
| function | ensure_thread_for_offer() | 20260901000000:2086 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: job_offers_thread_autocreate on job_offers; jest: 1 | V1 | keep |  |
| function | expire_offer_if_stale(job_offers) | 20260901000000:2180 | DEFINER, search_path set; a/u/s N/N/N | sql: accept_offer, counter_offer, create_offer +4; jest: 1 | V1 | keep | takes a job_offers row type; called by offer RPCs. |
| function | get_my_active_mode() | 20260901000000:2205 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/profiles.ts; dbt: 040; jest: 2; scripts: verify-schema.mjs | V1 | keep |  |
| function | get_my_profile() | 20260901000000:2262 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/profiles.ts; dbt: 040,p29; jest: 1; scripts: shots.mjs,verify-schema.mjs | V1 | keep |  |
| function | handle_new_user() | 20260901000000:2275 | DEFINER, search_path set; a/u/s N/N/N | NO live caller; dbt: H; jest: 1; scripts: seed-phase-6.sql; seed.sql | V1 | keep | trigger fn for auth.users. NO CREATE TRIGGER on auth.users in any migration (supabase/seed.sql:133 and tests/_helpers.sql:21 say staging has it, local does not). NEEDS-JUDGE. |
| function | hardening_fixes_enabled() | 20260901000000:2307 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | is_active_user() | 20260901000000:2317 | DEFINER, search_path set; a/u/s N/Y/Y | sql: accept_offer, can_delete_own_job, counter_offer +38; dbt: 040,H; jest: 2; scripts: verify-schema.mjs | V1 | keep | granted to authenticated and service_role; used in 41 function bodies. |
| function | is_blocked_between(uuid, uuid) | 20260901000000:2332 | DEFINER, search_path set; a/u/s N/Y/N | sql: create_offer, job_request_parties_ok, should_notify +6; dbt: 040,110; jest: 3; scripts: verify-schema.mjs | V1 | keep |  |
| function | is_profile_active(uuid) | 20260901000000:2352 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/profiles.ts; sql: accept_offer, is_active_user, job_request_parties_ok +7; dbt: 040,H; jest: 1; scripts: phase5-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | job_bid_count(uuid) | 20260901000000:2373 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | DEAD | drop | superseded by job_offer_count (app uses that). |
| function | job_bid_counts(uuid[]) | 20260901000000:2386 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | DEAD | drop | superseded by job_offer_counts (app uses that). |
| function | job_categories_expanded() | 20260901000000:2399 | invoker; a/u/s Y/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | granted to anon on purpose (marker for scripts/verify-schema.mjs). |
| function | job_hotspots() | 20260901000000:2409 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/hotspots.ts; dbt: 040; jest: 1; scripts: phase8-proof.sql | MAYBE | judge |  |
| function | job_offer_count(uuid) | 20260901000000:2451 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: hooks/useJobOwnerActions.ts, lib/offers.ts; sql: job_bid_count; dbt: 040; scripts: verify-schema.mjs | V1 | keep |  |
| function | job_offer_counts(uuid[]) | 20260901000000:2470 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/offers.ts; sql: job_bid_counts; dbt: 040; jest: 1; scripts: shots.mjs,verify-schema.mjs | V1 | keep |  |
| function | job_offer_rpcs_enabled() | 20260901000000:2493 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | job_offers_enabled() | 20260901000000:2506 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | job_payment_state(uuid) | 20260905000000:1107 [replaces 20260901000000:2579] | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/payments.ts; dbt: 020,030,040; jest: 3; scripts: phase6-proof.sql,verify-schema.mjs | V1 | keep | Body has 2 "sandbox" mention(s): re-CREATE when sandbox is cut. |
| function | job_request_parties_ok(uuid, uuid) | 20260901000000:2636 | DEFINER, search_path set; a/u/s N/Y/Y | sql: accept_offer, counter_offer, create_offer +1; dbt: 040; jest: 1; scripts: phase5-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | jobs_in_cell(bigint, bigint) | 20260901000000:2655 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/hotspots.ts; dbt: 040; jest: 2 | MAYBE | judge |  |
| function | jobs_within_radius(double precision, double precision, double precision) | 20260930000500:16 [replaces 20260901000000:2685] | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/hotspots.ts; dbt: 040; jest: 4; scripts: phase8-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | legal_acceptance_enabled() | 20260901000000:2724 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | mark_direct_thread_read(uuid) | 20260901000000:2734 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/conversations.ts; dbt: 040; jest: 1; scripts: phase7-proof.sql,verify-schema.mjs | MAYBE | judge |  |
| function | mark_worker_arrival(uuid, text) | 20260901000000:2757 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobs.ts; dbt: 020,030,040,150,210; jest: 1; scripts: lifecycle-proof.mjs,phase6-proof.sql | V1 | keep |  |
| function | mark_worker_semantic_stale() | 20260901000000:2801 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: jobs_worker_semantic_stale on jobs, portfolio_items_worker_semantic_stale on portfolio_items, profiles_worker_semantic_stale on profiles; jest: 1 | MAYBE | judge |  |
| function | marketplace_thread_identity_enabled() | 20260901000000:2845 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | match_workers_semantic(double precision[], text[], integer, double precision) | 20260901000000:2855 | DEFINER, search_path set; a/u/s N/Y/Y | edge: worker-search; dbt: 040; jest: 1; scripts: verify-schema.mjs | MAYBE | judge |  |
| function | messaging_lock_enabled() | 20260901000000:3017 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | messaging_unlocked(uuid, uuid) | 20260901000000:3027 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/messages.ts; sql: messages::messages_insert_party; dbt: 040; jest: 1; scripts: phase66-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | mirror_offer_chain_to_bids() | 20260901000000:3065 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: job_offers_mirror_bids on job_offers | MAYBE | judge |  |
| function | my_pending_job_requests() | 20260901000000:3081 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | DEAD | drop | legacy; no app call. |
| function | my_pending_offers() | 20260901000000:3099 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/offers.ts; sql: my_pending_job_requests; dbt: 010,040; jest: 2; scripts: phase5-proof.sql,phase61-proof.sql | V1 | keep |  |
| function | notification_feed_enabled() | 20260901000000:3126 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | notify_display_name(uuid) | 20260901000000:3136 | DEFINER, search_path set; a/u/s N/N/N | sql: notify_on_bid, notify_on_job_request, notify_on_job_status +12; jest: 1 | V1 | keep |  |
| function | notify_nearby_for_job(uuid) | 20260930000600:204 [replaces 20260901000000:3148] | DEFINER, search_path set; a/u/s N/N/N | sql: notify_on_job_location; dbt: 140; jest: 1; scripts: verify-schema.mjs | V1 | keep |  |
| function | notify_on_bid() | 20260930001200:39 [replaces 20260901000000:3207] | DEFINER, search_path set; a/u/s N/N/N | trigger fn: bids_notify on bids; dbt: 200; jest: 3 | V1 | keep | trigger fn on legacy bids table; sends new-bid and competing-bid pushes (hire-from-push, 20260930001200). |
| function | notify_on_dispute() | 20260905000000:1346 [replaces 20260901000000:3265] | DEFINER, search_path set; a/u/s N/N/N | sql: cancel_job; trigger fn: job_disputes_notify on job_disputes | V1 | keep |  |
| function | notify_on_job_location() | 20260901000000:3293 | DEFINER, search_path set; a/u/s N/N/N | sql: create_job; trigger fn: job_locations_notify_nearby on job_locations | V1 | keep |  |
| function | notify_on_job_request() | 20260901000000:3307 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: job_requests_notify on job_requests; jest: 1 | DEAD | drop | trigger fn of job_requests_notify (DEAD table). |
| function | notify_on_job_status() | 20261003000800:14 [replaces 20260930000100:112, 20260901000000:3382] | DEFINER, search_path set; a/u/s N/N/N | trigger fn: jobs_notify_status on jobs; dbt: 110 | V1 | keep |  |
| function | notify_on_message() | 20260930001000:938 [replaces 20260901000000:3427] | DEFINER, search_path set; a/u/s N/N/N | sql: series_offer_visit; trigger fn: messages_notify on messages; jest: 2; scripts: verify-schema.mjs | V1 | keep | body has voice/audio copy (CUT). |
| function | notify_on_offer_counter() | 20261003000400:19 [replaces 20260901000000:3520] | DEFINER, search_path set; a/u/s N/N/N | trigger fn: job_offers_notify_counter on job_offers; dbt: 250; jest: 3 | V1 | keep |  |
| function | notify_on_payment_release() | 20260910000000:251 [replaces 20260901000000:3589] | DEFINER, search_path set; a/u/s N/N/N | trigger fn: payments_notify_release on payments; dbt: 030,050; jest: 1 | V1 | keep | Body has 2 "sandbox" mention(s): re-CREATE when sandbox is cut. |
| function | notify_on_review() | 20260925000200:21 [replaces 20260901000000:3620] | DEFINER, search_path set; a/u/s N/N/N | trigger fn: reviews_notify on reviews; dbt: 090; jest: 1 | V1 | keep |  |
| function | offer_post_event(uuid, uuid, uuid, text, integer) | 20260901000000:3644 | DEFINER, search_path set; a/u/s N/N/N | sql: accept_offer, counter_offer, decline_offer +3; jest: 1; scripts: phase61-proof.sql,phase66-proof.sql | V1 | keep |  |
| function | offer_scoped_chat_enabled() | 20260901000000:3677 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | open_job_dispute(uuid, text, text) | 20260901000000:3705 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/disputes.ts; dbt: 020,030,040,110; jest: 1; scripts: phase12-proof.sql,phase6-proof.sql | V1 | keep |  |
| function | phase68_deleted_at_authorization_enabled() | 20260901000000:3774 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 040. |
| function | phase69_execute_lockdown_enabled() | 20260901000000:3789 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 040. |
| function | phase70_unsend_message_authz_enabled() | 20260901000000:3804 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 040. |
| function | phase71_reviews_read_lockdown_enabled() | 20260901000000:3819 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 040. |
| function | phase72_storage_read_lockdown_enabled() | 20260901000000:3834 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 040. |
| function | phase73_null_safe_guards_enabled() | 20260901000000:3849 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | phase75_security_hardening_enabled() | 20260901000000:3860 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | phase76_corrections_enabled() | 20260901000000:3869 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | phase76_rls_posture() | 20260901000000:3882 | DEFINER, search_path set; a/u/s Y/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | TOOLING | judge | granted to anon on purpose; returns RLS on/off for 8 tables to anyone. Marker for scripts/verify-schema.mjs. |
| function | phase77_conversation_features_enabled() | 20260901000000:3916 | invoker; a/u/s N/Y/N | NO live caller; jest: 2; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | phase78_properties_enabled() | 20260901000000:3929 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | portfolio_category_freeform_enabled() | 20260901000000:3942 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | post_wizard_fields_enabled() | 20260901000000:3952 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | project_offer_chain_to_bids(uuid) | 20260901000000:4014 | DEFINER, search_path set; a/u/s N/N/N | sql: mirror_offer_chain_to_bids, notify_on_bid; jest: 1 | MAYBE | judge |  |
| function | push_notifications_enabled() | 20260901000000:4107 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | push_scheduler_enabled() | 20260901000000:4117 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | recompute_profile_rating() | 20260901000000:4126 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: trg_reviews_rating on reviews; jest: 1 | V1 | keep |  |
| function | refresh_worker_semantic_doc(uuid) | 20260901000000:4149 | DEFINER, search_path set; a/u/s N/N/N | sql: mark_worker_semantic_stale, worker_semantic_refresh_queue; jest: 1; scripts: verify-schema.mjs | MAYBE | judge |  |
| function | register_push_token(text, text) | 20260901000000:4194 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/pushNotifications.ts; dbt: 040; scripts: verify-schema.mjs | V1 | keep |  |
| function | resolve_notification(uuid, text, text) | 20260901000000:4222 | DEFINER, search_path set; a/u/s N/N/Y | edge: send-push; dbt: 040,110; scripts: verify-schema.mjs | V1 | keep |  |
| function | respond_job_request(uuid, text, integer) | 20260901000000:4239 | DEFINER, search_path set; a/u/s N/Y/N | sql: notify_on_job_request; dbt: 040; jest: 2; scripts: verify-schema.mjs | DEAD | drop | legacy; no caller (only notify_on_job_request, a DEAD trigger fn, mentions it). |
| function | review_integrity_enabled() | 20260901000000:4265 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | sandbox_authorize_job_payment(uuid) | 20260901000000:4275 | DEFINER, search_path set; a/u/s N/Y/N | app (not rpc): lib/adapters/payments.ts; dbt: 010,020,030,040,080,090,120; jest: 2; scripts: lifecycle-proof.mjs,phase5-proof.sql | CUT | drop | CUT sandbox money. App: lib/adapters/payments.ts. dbtests use it as fixture (010, 020, 080, ...). |
| function | sandbox_cash_out() | 20260901000000:4348 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/adapters/payments.ts; dbt: 010,020,040; jest: 3; scripts: lifecycle-proof.mjs,phase11-proof.sql | CUT | drop | CUT sandbox money. App: lib/adapters/payments.ts. |
| function | sandbox_cash_out_enabled() | 20260901000000:4378 | invoker; a/u/s N/Y/N | NO live caller; dbt: 010; scripts: phase5-proof.sql,verify-schema.mjs | CUT | drop | CUT marker for sandbox money. |
| function | sandbox_hold_job_payment(uuid) | 20260901000000:4388 | DEFINER, search_path set; a/u/s N/Y/N | app (not rpc): lib/adapters/payments.ts; dbt: 010,020,030,040,080,090,120; jest: 2; scripts: lifecycle-proof.mjs,phase5-proof.sql | CUT | drop | CUT sandbox money. App: lib/adapters/payments.ts. dbtests use it as fixture. |
| function | sandbox_payments_enabled() | 20260901000000:4433 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | CUT | drop | CUT marker for sandbox money. |
| function | sandbox_release_job_payment(uuid) | 20260901000000:4446 | DEFINER, search_path set; a/u/s N/Y/N | app (not rpc): lib/adapters/payments.ts; dbt: 010,020,030,040; jest: 2; scripts: lifecycle-proof.mjs,phase11-proof.sql | CUT | drop | CUT sandbox money. App: lib/adapters/payments.ts, screens/ApproveOrDisputeScreen.tsx. dbtests use it as fixture. |
| function | sandbox_tip_worker(uuid, integer) | 20260901000000:4516 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/adapters/payments.ts; dbt: 020,030,040; jest: 3; scripts: lifecycle-proof.mjs,phase6-proof.sql | CUT | drop | CUT sandbox money. App: lib/adapters/payments.ts. |
| function | security_definer_search_path_enabled() | 20260901000000:4590 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | set_active_mode(text) | 20260901000000:4600 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/profiles.ts; dbt: 040; jest: 1; scripts: verify-schema.mjs | V1 | keep |  |
| function | set_block(uuid, timestamp with time zone) | 20260901000000:4630 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/conversationStates.ts; dbt: 040,110; jest: 2; scripts: verify-schema.mjs | CUT | drop |  |
| function | set_conversation_state(uuid, uuid, boolean, boolean, boolean, boolean) | 20260901000000:4668 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/conversationStates.ts; dbt: 040; jest: 2; scripts: verify-schema.mjs | CUT | drop |  |
| function | set_direct_thread_read_at(uuid, timestamp with time zone) | 20260901000000:4733 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/conversationStates.ts; dbt: 040; jest: 3; scripts: verify-schema.mjs | MAYBE | judge |  |
| function | set_job_property(uuid, uuid) | 20260901000000:4764 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 040; scripts: verify-schema.mjs | DEAD | drop | phase78 properties; no app call. |
| function | settle_offers_on_cancelled_job() | 20260901000000:4810 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: jobs_settle_offers_on_cancel on jobs | V1 | keep |  |
| function | should_notify(uuid, uuid, text) | 20260930000100:159 [replaces 20260901000000:4850] | DEFINER, search_path set; a/u/s N/Y/N | sql: claim_notification_batch, enqueue_notification; dbt: 040,110; jest: 2; scripts: verify-schema.mjs | V1 | keep | reads mutes (CUT). Body touches CUT/DEAD table(s): mutes. |
| function | start_live_location(5 args) | 20260901000000:4910 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/liveLocation.ts; dbt: 040; jest: 2; scripts: verify-schema.mjs | CUT | drop |  |
| function | stop_live_location(uuid, uuid) | 20260901000000:4970 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/liveLocation.ts; dbt: 040; jest: 2; scripts: verify-schema.mjs | CUT | drop |  |
| function | transition_job_status(uuid, text, jsonb, jsonb) | 20260925000000:113 [replaces 20260905000000:1001, 20260901000000:5003] | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobs.ts; sql: delete_my_account; dbt: 020,030,040,080,090,110,120,290,p29; jest: 6; scripts: robot.mjs,lifecycle-proof.mjs | V1 | keep | only status mover (CLAUDE.md invariant). 3 definitions; newest 20260925000000. |
| function | unban_user(uuid) | 20260901000000:5095 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/moderation.ts; dbt: 040 | V1 | keep |  |
| function | unsend_message(uuid) | 20260901000000:5115 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/messages.ts; dbt: 040; jest: 1; scripts: verify-schema.mjs | MAYBE | judge | body has audio handling. |
| function | update_live_location(double precision, double precision, uuid, uuid) | 20260901000000:5291 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/liveLocation.ts; dbt: 040; jest: 2; scripts: verify-schema.mjs | CUT | drop |  |
| function | update_my_profile(jsonb) | 20260901000000:5333 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/profiles.ts; dbt: 040,280,p29; jest: 2; scripts: phase9-proof.sql,shots.mjs | V1 | keep |  |
| function | view_security_invoker_enabled() | 20260901000000:5451 | invoker; a/u/s N/Y/N | NO live caller; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | withdraw_job_dispute(uuid) | 20260901000000:5461 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/disputes.ts; dbt: 020,030,040,110; jest: 1; scripts: phase12-proof.sql,phase6-proof.sql | V1 | keep |  |
| function | withdraw_offer(uuid) | 20260901000000:5505 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/offers.ts; sql: delete_my_account, series_close_offers; dbt: 010,040,180; jest: 2; scripts: phase5-proof.sql,verify-schema.mjs | V1 | keep |  |
| function | worker_job_stats(uuid) | 20260901000000:5553 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/portfolio.ts, lib/workerSearch.ts; sql: profile_review_summaries; dbt: 040,120; jest: 3; scripts: verify-schema.mjs | MAYBE | judge | used for worker cards (portfolio.ts, workerSearch.ts). |
| function | worker_self_service_enabled() | 20260901000000:5573 | invoker; a/u/s N/Y/N | NO live caller; jest: 1; scripts: verify-schema.mjs | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and jest. |
| function | worker_semantic_coverage() | 20260901000000:5583 | DEFINER, search_path set; a/u/s N/N/Y | edge: worker-search; jest: 1; scripts: verify-schema.mjs | MAYBE | judge |  |
| function | worker_semantic_refresh_queue(integer) | 20260901000000:5602 | DEFINER, search_path set; a/u/s N/N/Y | edge: worker-search; jest: 1; scripts: verify-schema.mjs | MAYBE | judge |  |
| function | current_fee(timestamptz) | 20260905000000:133 | DEFINER, search_path set; a/u/s N/Y/Y | sql: quote_job_price, snapshot_job_agreement, job_terms +2; dbt: 030,040 | V1 | keep |  |
| function | quote_job_price(integer, timestamptz) | 20260905000000:160 | DEFINER, search_path set; a/u/s N/Y/Y | app rpc: lib/payments.ts; sql: notify_on_bid, snapshot_job_agreement, job_terms +1; dbt: 030,040,180,200; jest: 5; scripts: shots.mjs | V1 | keep |  |
| function | my_payouts_enabled() | 20260905000000:355 | DEFINER, search_path set; a/u/s N/Y/N | NO live caller; dbt: 010,030,040,060 | DEAD | drop | superseded by my_payouts_status (20260915000000); 4 dbtests (060 etc.) still assert it. |
| function | set_payouts_enabled(text, boolean) | 20260905000000:365 | DEFINER, search_path set; a/u/s N/N/Y | sql: apply_payment_event; dbt: 010,030,040,060 | V1 | keep |  |
| function | job_agreements_immutable() | 20260905000000:434 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: job_agreements_immutable on job_agreements; dbt: 030 | V1 | keep |  |
| function | snapshot_job_agreement() | 20260905000000:449 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: jobs_snapshot_agreement on jobs | V1 | keep |  |
| function | job_terms(uuid, integer) | 20260905000000:493 | DEFINER, search_path set; a/u/s N/N/N | sql: cancellation_fee_cents, begin_job_payment, cancel_job; dbt: 030 | V1 | keep |  |
| function | cancellation_fee_cents(uuid, integer) | 20260905000000:527 | DEFINER, search_path set; a/u/s N/N/N | sql: cancel_job, resolve_job_dispute; dbt: 030 | V1 | keep |  |
| function | begin_job_payment(uuid) | 20260905000000:543 | DEFINER, search_path set; a/u/s N/Y/N | edge: create-payment; dbt: 030,040,060,070,080,110; jest: 4 | V1 | keep |  |
| function | attach_provider_ref(uuid, text) | 20260905000000:628 | DEFINER, search_path set; a/u/s N/N/Y | edge: create-payment; dbt: 030,040,060,070,080,110; jest: 2 | V1 | keep |  |
| function | apply_payment_event(text) | 20260915000000:114 [replaces 20260905000000:641] | DEFINER, search_path set; a/u/s N/N/Y | edge: stripe-webhook; dbt: 030,040,060,070,080,110 | V1 | keep | service_role; called by stripe-webhook; money ledger mover. |
| function | release_job_payment(uuid) | 20260905000000:755 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/adapters/payments.ts; dbt: 010,030,040,080; jest: 3 | V1 | keep | Body has 2 "sandbox" mention(s): re-CREATE when sandbox is cut. |
| function | auto_release_due_payments() | 20260930000100:63 [replaces 20260905000000:811] | DEFINER, search_path set; a/u/s N/N/Y | sql: install_settlement_schedules; cron: auto-release-due-payments; dbt: 010,030,040,050,110; jest: 1 | V1 | keep |  |
| function | expire_unfunded_payments() | 20260905000000:846 | DEFINER, search_path set; a/u/s N/N/Y | sql: install_settlement_schedules; cron: expire-unfunded-payments; dbt: 030,040,050,060 | V1 | keep |  |
| function | enforce_tip_ceiling() | 20260905000000:898 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: payments_tip_ceiling on payments | V1 | keep |  |
| function | begin_tip_payment(uuid, integer) | 20260905000000:931 | DEFINER, search_path set; a/u/s N/Y/N | edge: create-payment; dbt: 030,040; jest: 2 | V1 | keep |  |
| function | cancel_job(uuid, text) | 20260905000000:1162 | DEFINER, search_path set; a/u/s N/Y/N | sql: ban_user; dbt: 030,040,240,270; jest: 3 | V1 | keep | Body has 6 "sandbox" mention(s): re-CREATE when sandbox is cut. |
| function | refund_on_no_show_withdrawn() | 20260905000000:1381 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: job_disputes_refund_on_withdrawn on job_disputes; dbt: 110 | V1 | keep | Body has 1 "sandbox" mention(s): re-CREATE when sandbox is cut. |
| function | resolve_job_dispute(uuid, text, text) | 20260905000000:1415 | DEFINER, search_path set; a/u/s N/N/Y | app (not rpc): screens/ApproveOrDisputeScreen.tsx; sql: ban_user, apply_payment_event, cancel_job; dbt: 030,040,110,290; jest: 1 | V1 | keep | Body has 7 "sandbox" mention(s): re-CREATE when sandbox is cut. |
| function | stripe_foundation_enabled() | 20260905000000:1556 | invoker; a/u/s N/Y/Y | NO live caller; dbt: 030,070,080 | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 030,070,080. |
| function | pg_function_present(text, text) | 20260910000000:61 | invoker; a/u/s N/N/Y | sql: install_settlement_schedules, install_reminder_schedule, install_series_schedule +3; dbt: 050; jest: 3 | V1 | keep | helper used by the install_* cron installers. |
| function | drain_settlements() | 20260910000000:92 | DEFINER, search_path set; a/u/s N/N/Y | sql: install_settlement_schedules; cron: brazos-process-settlements; dbt: 050 | V1 | keep |  |
| function | install_settlement_schedules() | 20260910000000:141 | DEFINER, search_path set; a/u/s N/N/Y | NO live caller; dbt: 050 | V1 | keep | called once at the end of its own migration (20260910000000:178). Creates 3 cron jobs. |
| function | get_payment_customer(uuid) | 20260910000000:196 | DEFINER, search_path set; a/u/s N/N/Y | edge: create-payment,payment-methods; dbt: 050; jest: 1 | V1 | keep |  |
| function | set_payment_customer(uuid, text) | 20260910000000:205 | DEFINER, search_path set; a/u/s N/N/Y | edge: create-payment,payment-methods; dbt: 050; jest: 1 | V1 | keep |  |
| function | settlement_schedules_enabled() | 20260910000000:287 | invoker; a/u/s N/Y/Y | NO live caller | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs. |
| function | get_payment_account(uuid) | 20260915000000:289 | DEFINER, search_path set; a/u/s N/N/Y | edge: connect-onboarding,connect-status; dbt: 060 | V1 | keep |  |
| function | set_payment_account(uuid, text) | 20260915000000:298 | DEFINER, search_path set; a/u/s N/N/Y | edge: connect-onboarding; dbt: 060 | V1 | keep |  |
| function | set_payouts_status(uuid, text) | 20260915000000:329 | DEFINER, search_path set; a/u/s N/N/Y | edge: connect-onboarding,connect-status; dbt: 010,060,070; jest: 1 | V1 | keep |  |
| function | my_payouts_status() | 20260915000000:351 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/payments/stripe.ts; edge: connect-onboarding,connect-status; dbt: 010,040,060; jest: 1 | V1 | keep |  |
| function | connect_onboarding_enabled() | 20260915000000:364 | invoker; a/u/s N/Y/Y | NO live caller; dbt: 060,070 | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 060,070. |
| function | record_settlement_attempt(uuid, text, boolean, text) | 20260920000000:147 | DEFINER, search_path set; a/u/s N/N/Y | edge: process-settlements; dbt: 070; jest: 1 | V1 | keep |  |
| function | settlement_retry_enabled() | 20260920000000:192 | invoker; a/u/s N/Y/Y | NO live caller; dbt: 070,080 | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 070,080. |
| function | job_completions_enabled() | 20260925000000:231 | invoker; a/u/s N/Y/Y | NO live caller; dbt: 080; jest: 1 | TOOLING | judge | marker returning true; probed only by scripts/verify-schema.mjs and dbtests 080 and jest. |
| function | review_is_revealed(uuid, uuid, uuid, timestamptz) | 20260925000100:40 | DEFINER, search_path set; a/u/s Y/Y/N | sql: client_job_stats, notify_on_review, profile_reviews +3; dbt: 040,090 | V1 | keep |  |
| function | create_review(uuid, uuid, integer, text, jsonb, boolean) | 20260925000100:91 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/reviews.ts; dbt: 020,040,090,120,p29; jest: 2; scripts: lifecycle-proof.mjs,phase10-proof.sql | V1 | keep | dropped (5-arg) and recreated with 6 args in 20260925000100. |
| function | profile_reviews(uuid, integer, integer, text) | 20260925000100:167 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/reviews.ts; dbt: 040,090; jest: 1; scripts: verify-schema.mjs | V1 | keep |  |
| function | profile_review_summary(uuid, text) | 20260925000100:231 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/reviews.ts; sql: profile_review_summaries; dbt: 040,090,120; jest: 2; scripts: verify-schema.mjs | V1 | keep |  |
| function | profile_review_summaries(uuid[], text) | 20260930000200:39 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/reviews.ts; dbt: 040,120; jest: 2 | V1 | keep |  |
| function | update_job_details(17 args) | 20260930000400:227 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobs.ts; dbt: 040,130; jest: 4; scripts: verify-schema.mjs | V1 | keep |  |
| function | create_job(17 args) | 20260930000600:57 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobs.ts; sql: series_open_visit; dbt: 010,020,030,040,060,070,080,090,110,120,130,140,150,160,170,180,200,210,250,280,p29; jest: 6; scripts: lifecycle-proof.mjs,phase5-proof.sql | V1 | keep | dropped and recreated twice (20260930000400 and 20260930000600) as its signature grew; the newest definition has 17 args. |
| function | report_running_late(uuid, integer) | 20260930000700:53 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobs.ts; sql: live_card_state; dbt: 040,150,210; jest: 1 | V1 | keep |  |
| function | quiet_hours_until(uuid) | 20260930000800:66 | DEFINER, search_path set; a/u/s N/N/N | sql: enqueue_notification; dbt: 160; jest: 1 | V1 | keep |  |
| function | enqueue_tomorrow_reminders(date) | 20261003000200:21 [replaces 20260930000900:44] | DEFINER, search_path set; a/u/s N/N/N | sql: install_reminder_schedule; cron: brazos-tomorrow-reminders; dbt: 170; jest: 2 | V1 | keep |  |
| function | install_reminder_schedule() | 20260930000900:108 | DEFINER, search_path set; a/u/s N/N/Y | NO live caller; dbt: 170; jest: 1 | V1 | keep | called once at the end of its own migration. |
| function | series_visit_date(date, text, integer) | 20260930001000:135 | invoker; a/u/s N/N/N | sql: start_job_series, advance_job_series, series_on_visit_change; dbt: 180; jest: 1 | V1 | keep |  |
| function | money_label(integer) | 20260930001000:149 | invoker; a/u/s N/N/N | sql: notify_on_bid, notify_on_offer_counter, series_offer_visit +1; dbt: 180,250; jest: 3 | V1 | keep |  |
| function | start_job_series(uuid, text) | 20260930001000:165 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobSeries.ts; dbt: 040,180; jest: 1 | V1 | keep |  |
| function | series_offer_visit(job_series, date) | 20260930001000:228 | DEFINER, search_path set; a/u/s N/N/N | sql: notify_on_message, advance_job_series; dbt: 180; jest: 1 | V1 | keep |  |
| function | series_open_visit(job_series, date, uuid) | 20260930001000:335 | DEFINER, search_path set; a/u/s N/N/N | sql: advance_job_series; dbt: 180; jest: 1 | V1 | keep |  |
| function | series_close_offers(uuid, uuid) | 20260930001000:403 | DEFINER, search_path set; a/u/s N/N/N | sql: stop_job_series, drop_series_worker; dbt: 180; jest: 1 | V1 | keep |  |
| function | advance_job_series(timestamptz) | 20260930001000:433 | DEFINER, search_path set; a/u/s N/N/Y | sql: install_series_schedule; cron: brazos-job-series; dbt: 180; jest: 1 | V1 | keep |  |
| function | install_series_schedule() | 20260930001000:672 | DEFINER, search_path set; a/u/s N/N/Y | NO live caller; dbt: 180; jest: 1 | V1 | keep | called once at the end of its own migration. |
| function | series_on_visit_change() | 20260930001200:142 [replaces 20260930001000:704] | DEFINER, search_path set; a/u/s N/N/N | sql: start_job_series; trigger fn: jobs_series_visit on jobs; dbt: 200; jest: 1 | V1 | keep |  |
| function | stop_job_series(uuid) | 20260930001000:801 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobSeries.ts; dbt: 040,180; jest: 1 | V1 | keep |  |
| function | drop_series_worker(uuid) | 20260930001000:868 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: lib/jobSeries.ts; dbt: 040,180; jest: 1 | V1 | keep |  |
| function | enqueue_receipts() | 20260930001100:99 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: payments_enqueue_receipts on payments; dbt: 190 | V1 | keep |  |
| function | claim_receipt_batch(integer) | 20260930001100:123 | DEFINER, search_path set; a/u/s N/N/Y | edge: send-receipts; dbt: 190 | V1 | keep |  |
| function | resolve_receipt(uuid, text, text, text) | 20260930001100:152 | DEFINER, search_path set; a/u/s N/N/Y | edge: send-receipts; dbt: 190 | V1 | keep |  |
| function | receipt_details(uuid) | 20260930001100:178 | DEFINER, search_path set; a/u/s N/N/Y | edge: send-receipts; dbt: 190 | V1 | keep |  |
| function | drain_receipts() | 20260930001100:228 | DEFINER, search_path set; a/u/s N/N/Y | sql: install_receipt_schedule; cron: brazos-send-receipts; dbt: 190 | V1 | keep |  |
| function | install_receipt_schedule() | 20260930001100:280 | DEFINER, search_path set; a/u/s N/N/Y | NO live caller; dbt: 190 | V1 | keep | called once at the end of its own migration. |
| function | enqueue_payment_declined(uuid) | 20260930001200:108 | DEFINER, search_path set; a/u/s N/N/Y | edge: create-payment; dbt: 200; jest: 1 | V1 | keep |  |
| function | clock_label(integer) | 20260930001300:45 | invoker; a/u/s N/N/N | sql: live_card_state; dbt: 210 | MAYBE | judge |  |
| function | live_card_state(uuid) | 20260930001300:57 | DEFINER, search_path set; a/u/s N/Y/Y | app rpc: hooks/useLiveJobCard.ts; sql: claim_live_card_batch; dbt: 040,210; jest: 1 | MAYBE | judge |  |
| function | register_live_activity(uuid, text, text) | 20260930001300:148 | DEFINER, search_path set; a/u/s N/Y/N | app rpc: hooks/useLiveJobCard.ts; dbt: 040,210; jest: 1 | MAYBE | judge |  |
| function | live_card_enqueue() | 20260930001300:195 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: jobs_live_card on jobs | MAYBE | judge |  |
| function | claim_live_card_batch(integer) | 20260930001300:221 | DEFINER, search_path set; a/u/s N/N/Y | edge: send-live-cards; dbt: 210; jest: 1 | MAYBE | judge |  |
| function | resolve_live_card(uuid, text, text) | 20260930001300:258 | DEFINER, search_path set; a/u/s N/N/Y | edge: send-live-cards; dbt: 210; jest: 1 | MAYBE | judge |  |
| function | drain_live_cards() | 20260930001300:280 | DEFINER, search_path set; a/u/s N/N/Y | sql: install_live_card_schedule; cron: brazos-live-cards; dbt: 210; jest: 1 | MAYBE | judge |  |
| function | install_live_card_schedule() | 20260930001300:316 | DEFINER, search_path set; a/u/s N/N/Y | NO live caller; jest: 1 | MAYBE | judge | called once at the end of its own migration (20260930001300:338). |
| function | prune_payment_event_payloads(interval) | 20261003000500:20 | DEFINER, search_path set; a/u/s N/N/Y | sql: install_payment_events_prune; cron: brazos-prune-payment-events; dbt: 260; jest: 1 | V1 | keep |  |
| function | install_payment_events_prune() | 20261003000500:44 | DEFINER, search_path set; a/u/s N/N/Y | NO live caller; dbt: 260 | V1 | keep | called once at the end of its own migration. |
| function | reject_blocked_terms() | 20261003000700:90 | DEFINER, search_path set; a/u/s N/N/N | trigger fn: jobs_reject_blocked_terms on jobs, profiles_reject_blocked_terms on profiles, reviews_reject_blocked_terms on reviews +4; dbt: 280; jest: 1 | V1 | keep |  |

### 1c. RLS policies (96)

"inert" = the policy is for a command that no GRANT lets the role run (so the policy never decides anything). Tables with column-level grants (profiles SELECT, notification_outbox UPDATE, job_series SELECT) are not flagged.

| kind | name (table :: policy) | defined in | security | referenced by | label | proposal | note |
|---|---|---|---|---|---|---|---|
| policy | areas :: areas_select_all | 20260901000000:7162 | FOR SELECT TO authenticated |  | DEAD | drop |  |
| policy | bids :: bids_select_job_owner | 20260901000000:7172 | FOR SELECT TO authenticated | uses fn: is_profile_active | MAYBE | judge |  |
| policy | bids :: bids_select_own | 20260901000000:7178 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | blocks :: blocks_delete_own | 20260901000000:7185 | FOR DELETE TO authenticated |  | V1 | keep |  |
| policy | blocks :: blocks_insert_own | 20260901000000:7189 | FOR INSERT TO authenticated |  | V1 | keep |  |
| policy | blocks :: blocks_select_involved | 20260901000000:7193 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | job_checklist_items :: checklist_delete_worker | 20260901000000:7197 | FOR DELETE TO authenticated |  | MAYBE | judge |  |
| policy | job_checklist_items :: checklist_insert_worker | 20260901000000:7203 | FOR INSERT TO authenticated |  | MAYBE | judge |  |
| policy | job_checklist_items :: checklist_select_parties | 20260901000000:7209 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | job_checklist_items :: checklist_update_worker | 20260901000000:7215 | FOR UPDATE TO authenticated |  | MAYBE | judge |  |
| policy | jobs :: clients insert own jobs | 20260901000000:7223 | FOR INSERT TO PUBLIC |  | DEAD (inert) | judge | inert: no INSERT grant for PUBLIC. |
| policy | jobs :: clients update own jobs | 20260901000000:7227 | FOR UPDATE TO PUBLIC |  | DEAD (inert) | judge | inert: no UPDATE grant for PUBLIC. |
| policy | conversation_states :: conversation_states_select_own | 20260901000000:7234 | FOR SELECT TO authenticated |  | CUT | drop |  |
| policy | direct_threads :: direct_threads_select_party | 20260901000000:7241 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | job_disputes :: disputes_select_parties | 20260901000000:7245 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | bids :: job owner views bids on their job | 20260901000000:7251 | FOR SELECT TO PUBLIC |  | MAYBE | judge |  |
| policy | job_locations :: job_locations_select_party | 20260901000000:7266 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | job_offers :: job_offers_select_party | 20260901000000:7275 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | job_requests :: job_requests_select_party | 20260901000000:7282 | FOR SELECT TO authenticated |  | DEAD | drop |  |
| policy | jobs :: jobs_delete_own | 20260901000000:7289 | FOR DELETE TO authenticated | uses fn: can_delete_own_job | V1 | keep |  |
| policy | jobs :: jobs_select_assigned_worker | 20260901000000:7293 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | jobs :: jobs_select_offer_party | 20260901000000:7297 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | jobs :: jobs_select_open | 20260901000000:7303 | FOR SELECT TO authenticated | uses fn: is_profile_active | V1 | keep |  |
| policy | jobs :: jobs_select_own | 20260901000000:7307 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | legal_acceptances :: legal_acceptances_insert_own | 20260901000000:7314 | FOR INSERT TO authenticated |  | V1 | keep |  |
| policy | legal_acceptances :: legal_acceptances_select_own | 20260901000000:7318 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | live_location_shares :: live_location_shares_select_party | 20260901000000:7325 | FOR SELECT TO authenticated |  | CUT | drop |  |
| policy | message_reactions :: message_reactions_delete_own | 20260901000000:7336 | FOR DELETE TO authenticated |  | MAYBE | judge |  |
| policy | message_reactions :: message_reactions_insert_own | 20260901000000:7340 | FOR INSERT TO authenticated |  | MAYBE | judge |  |
| policy | message_reactions :: message_reactions_select_party | 20260901000000:7348 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | message_reactions :: message_reactions_update_own | 20260901000000:7354 | FOR UPDATE TO authenticated |  | MAYBE | judge |  |
| policy | message_reads :: message_reads_insert_own | 20260901000000:7361 | FOR INSERT TO authenticated |  | MAYBE | judge |  |
| policy | message_reads :: message_reads_select_own | 20260901000000:7365 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | message_reads :: message_reads_select_party | 20260901000000:7369 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | message_reads :: message_reads_update_own | 20260901000000:7375 | FOR UPDATE TO authenticated |  | MAYBE | judge |  |
| policy | messages :: messages_insert_party | 20260901000000:7382 | FOR INSERT TO authenticated | uses fn: is_active_user, is_blocked_between, messaging_unlocked | V1 | keep |  |
| policy | messages :: messages_select_party | 20260901000000:7394 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | mutes :: mutes_delete_own | 20260901000000:7405 | FOR DELETE TO authenticated |  | CUT | drop |  |
| policy | mutes :: mutes_insert_own | 20260901000000:7409 | FOR INSERT TO authenticated |  | CUT | drop |  |
| policy | mutes :: mutes_select_own | 20260901000000:7413 | FOR SELECT TO authenticated |  | CUT | drop |  |
| policy | notification_prefs :: notification_prefs_insert_own | 20260901000000:7423 | FOR INSERT TO authenticated |  | V1 | keep |  |
| policy | notification_prefs :: notification_prefs_select_own | 20260901000000:7427 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | notification_prefs :: notification_prefs_update_own | 20260901000000:7431 | FOR UPDATE TO authenticated |  | V1 | keep |  |
| policy | notification_outbox :: outbox_select_recipient | 20260901000000:7435 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | notification_outbox :: outbox_update_recipient | 20260901000000:7439 | FOR UPDATE TO authenticated |  | V1 | keep |  |
| policy | payments :: parties view own payments | 20260901000000:7443 | FOR SELECT TO PUBLIC |  | V1 | keep |  |
| policy | portfolio_items :: portfolio_delete_own | 20260901000000:7450 | FOR DELETE TO authenticated |  | MAYBE | judge |  |
| policy | portfolio_items :: portfolio_insert_own | 20260901000000:7454 | FOR INSERT TO authenticated |  | MAYBE | judge |  |
| policy | portfolio_items :: portfolio_select_visible | 20260901000000:7463 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | portfolio_items :: portfolio_update_own | 20260901000000:7467 | FOR UPDATE TO authenticated |  | MAYBE | judge |  |
| policy | profiles :: profiles are viewable by authenticated users | 20260901000000:7474 | FOR SELECT TO PUBLIC |  | V1 | keep |  |
| policy | profiles :: profiles_select_authenticated | 20260901000000:7478 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | properties :: properties_delete_own | 20260901000000:7485 | FOR DELETE TO authenticated |  | DEAD | drop |  |
| policy | properties :: properties_insert_own | 20260901000000:7489 | FOR INSERT TO authenticated |  | DEAD | drop |  |
| policy | properties :: properties_select_own | 20260901000000:7493 | FOR SELECT TO authenticated |  | DEAD | drop |  |
| policy | properties :: properties_update_own | 20260901000000:7497 | FOR UPDATE TO authenticated |  | DEAD | drop |  |
| policy | push_tokens :: push_tokens_delete_own | 20260901000000:7504 | FOR DELETE TO authenticated |  | V1 | keep |  |
| policy | push_tokens :: push_tokens_insert_own | 20260901000000:7508 | FOR INSERT TO authenticated |  | V1 | keep |  |
| policy | push_tokens :: push_tokens_select_own | 20260901000000:7512 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | push_tokens :: push_tokens_update_own | 20260901000000:7516 | FOR UPDATE TO authenticated |  | V1 | keep |  |
| policy | reports :: reports_insert_own | 20260901000000:7523 | FOR INSERT TO authenticated | uses fn: is_active_user | V1 | keep |  |
| policy | reports :: reports_select_admin | 20260901000000:7527 | FOR SELECT TO authenticated | uses fn: current_user_is_admin | V1 | keep |  |
| policy | reports :: reports_update_admin | 20260901000000:7531 | FOR UPDATE TO authenticated | uses fn: current_user_is_admin | V1 | keep |  |
| policy | reviews :: reviews_insert_completed_party | 20260901000000:7538 | FOR INSERT TO authenticated | uses fn: is_active_user | DEAD (inert) | judge | inert: no INSERT grant for authenticated. |
| policy | reviews :: reviews_select_party | 20260925000100:71 | FOR SELECT TO authenticated | uses fn: review_is_revealed | V1 | keep |  |
| policy | saved_workers :: saved_delete_own | 20260901000000:7552 | FOR DELETE TO authenticated |  | MAYBE | judge |  |
| policy | saved_workers :: saved_insert_own | 20260901000000:7556 | FOR INSERT TO authenticated | uses fn: is_active_user | MAYBE | judge |  |
| policy | saved_workers :: saved_select_own | 20260901000000:7560 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | worker_services :: services_delete_own | 20260901000000:7567 | FOR DELETE TO authenticated |  | MAYBE | judge |  |
| policy | worker_services :: services_insert_own | 20260901000000:7571 | FOR INSERT TO authenticated | uses fn: is_active_user | MAYBE | judge |  |
| policy | worker_services :: services_select_visible | 20260901000000:7575 | FOR SELECT TO authenticated |  | MAYBE | judge |  |
| policy | worker_services :: services_update_own | 20260901000000:7579 | FOR UPDATE TO authenticated | uses fn: is_active_user | MAYBE | judge |  |
| policy | profiles :: users insert own profile | 20260901000000:7583 | FOR INSERT TO PUBLIC |  | DEAD (inert) | judge | inert: no INSERT grant for PUBLIC. |
| policy | profiles :: users update own profile | 20260901000000:7587 | FOR UPDATE TO PUBLIC |  | DEAD (inert) | judge | inert: no UPDATE grant for PUBLIC. |
| policy | bids :: workers insert own bids | 20260901000000:7597 | FOR INSERT TO PUBLIC |  | DEAD (inert) | judge | inert: no INSERT grant for PUBLIC. |
| policy | bids :: workers update own bids | 20260901000000:7601 | FOR UPDATE TO PUBLIC |  | DEAD (inert) | judge | inert: no UPDATE grant for PUBLIC. |
| policy | bids :: workers view own bids | 20260901000000:7605 | FOR SELECT TO PUBLIC |  | MAYBE | judge |  |
| policy | storage.objects :: avatars_insert | 20260901000000:7609 | FOR INSERT TO authenticated | uses fn: is_active_user | V1 | keep |  |
| policy | storage.objects :: avatars_read | 20260901000000:7613 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | storage.objects :: avatars_update | 20260901000000:7617 | FOR UPDATE TO authenticated | uses fn: is_active_user | V1 | keep |  |
| policy | storage.objects :: chat_audio_insert_party | 20260901000000:7621 | FOR INSERT TO authenticated | uses fn: is_active_user, is_blocked_between | CUT | drop | voice messages bucket. |
| policy | storage.objects :: chat_audio_read_party | 20260901000000:7627 | FOR SELECT TO authenticated |  | CUT | drop | voice messages bucket. |
| policy | storage.objects :: chat_documents_insert_party | 20260901000000:7633 | FOR INSERT TO authenticated | uses fn: is_active_user, is_blocked_between | CUT | drop | documents bucket. |
| policy | storage.objects :: chat_documents_read_party | 20260901000000:7641 | FOR SELECT TO authenticated |  | CUT | drop | documents bucket. |
| policy | storage.objects :: chat_photos_insert_party | 20260901000000:7649 | FOR INSERT TO authenticated | uses fn: is_active_user, is_blocked_between | V1 | keep |  |
| policy | storage.objects :: chat_photos_read_party | 20260901000000:7655 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | storage.objects :: job_photos_delete_own_completion | 20260901000000:7661 | FOR DELETE TO authenticated |  | V1 | keep |  |
| policy | storage.objects :: job_photos_delete_own_posting | 20260901000000:7667 | FOR DELETE TO authenticated |  | V1 | keep |  |
| policy | storage.objects :: job_photos_delete_own_review | 20260901000000:7671 | FOR DELETE TO authenticated |  | V1 | keep |  |
| policy | storage.objects :: job_photos_insert | 20260901000000:7675 | FOR INSERT TO authenticated | uses fn: is_active_user | V1 | keep |  |
| policy | storage.objects :: job_photos_insert_review | 20260901000000:7681 | FOR INSERT TO authenticated | uses fn: is_active_user | V1 | keep |  |
| policy | storage.objects :: job_photos_read | 20260901000000:7685 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | app_config :: app_config is world-readable | 20260905000000:303 | FOR SELECT TO anon, authenticated |  | V1 | keep |  |
| policy | job_agreements :: job_agreements_select_parties | 20260905000000:429 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | job_completions :: job_completions_parties_select | 20260925000000:91 | FOR SELECT TO authenticated |  | V1 | keep |  |
| policy | job_series :: job_series_select_parties | 20260930001000:122 | FOR SELECT TO authenticated |  | V1 | keep |  |

### 1d. Triggers (33)

| kind | name (table :: trigger) | defined in | security | referenced by | label | proposal | note |
|---|---|---|---|---|---|---|---|
| trigger | bids :: bids_notify | 20260901000000:6710 | fn is DEFINER; AFTER INSERT | executes notify_on_bid | MAYBE | judge | trigger on legacy bids; sends new-bid push. |
| trigger | blocks :: blocks_close_job_requests | 20260901000000:6714 | fn is DEFINER; AFTER INSERT | executes close_requests_on_block | DEAD | drop | closes DEAD job_requests rows; fires on every block insert. |
| trigger | job_disputes :: job_disputes_notify | 20260901000000:6718 | fn is DEFINER; AFTER INSERT | executes notify_on_dispute | V1 | keep |  |
| trigger | job_locations :: job_locations_notify_nearby | 20260901000000:6722 | fn is DEFINER; AFTER INSERT | executes notify_on_job_location | V1 | keep |  |
| trigger | job_offers :: job_offers_mirror_bids | 20260901000000:6726 | fn is DEFINER; AFTER INSERT OR UPDATE | executes mirror_offer_chain_to_bids | MAYBE | judge | legacy bids projection. |
| trigger | job_offers :: job_offers_notify_counter | 20260901000000:6730 | fn is DEFINER; AFTER INSERT | executes notify_on_offer_counter | V1 | keep |  |
| trigger | job_offers :: job_offers_thread_autocreate | 20260901000000:6734 | fn is DEFINER; AFTER INSERT | executes ensure_thread_for_offer | V1 | keep |  |
| trigger | job_requests :: job_requests_notify | 20260901000000:6738 | fn is DEFINER; AFTER INSERT OR UPDATE | executes notify_on_job_request | DEAD | drop | trigger on DEAD job_requests; sends legacy hire-request notices. |
| trigger | jobs :: jobs_notify_status | 20260901000000:6742 | fn is DEFINER; AFTER UPDATE | executes notify_on_job_status | V1 | keep |  |
| trigger | jobs :: jobs_settle_offers_on_cancel | 20260901000000:6746 | fn is DEFINER; AFTER UPDATE OF "status" | executes settle_offers_on_cancelled_job | V1 | keep |  |
| trigger | jobs :: jobs_worker_semantic_stale | 20260901000000:6750 | fn is DEFINER; AFTER INSERT OR UPDATE OF "status", "assigned_worker_id", "title", "category" | executes mark_worker_semantic_stale | MAYBE | judge | semantic worker search. |
| trigger | messages :: messages_notify | 20260901000000:6754 | fn is DEFINER; AFTER INSERT | executes notify_on_message | V1 | keep |  |
| trigger | payments :: payments_notify_release | 20260901000000:6758 | fn is DEFINER; AFTER UPDATE | executes notify_on_payment_release | V1 | keep |  |
| trigger | portfolio_items :: portfolio_items_cap | 20260901000000:6762 | fn is DEFINER; BEFORE INSERT | executes enforce_portfolio_cap | MAYBE | judge | portfolio. |
| trigger | portfolio_items :: portfolio_items_worker_semantic_stale | 20260901000000:6766 | fn is DEFINER; AFTER INSERT OR DELETE OR UPDATE | executes mark_worker_semantic_stale | MAYBE | judge | semantic worker search. |
| trigger | profiles :: profiles_default_notification_prefs | 20260901000000:6770 | fn is DEFINER; AFTER INSERT | executes create_default_notification_prefs | V1 | keep |  |
| trigger | profiles :: profiles_worker_semantic_stale | 20260901000000:6774 | fn is DEFINER; AFTER INSERT OR UPDATE OF "bio", "categories" | executes mark_worker_semantic_stale | MAYBE | judge | semantic worker search. |
| trigger | reviews :: reviews_notify | 20260901000000:6778 | fn is DEFINER; AFTER INSERT | executes notify_on_review | V1 | keep |  |
| trigger | reviews :: trg_reviews_rating | 20260901000000:6782 | fn is DEFINER; AFTER INSERT OR DELETE OR UPDATE | executes recompute_profile_rating | V1 | keep |  |
| trigger | job_agreements :: job_agreements_immutable | 20260905000000:441 | fn is DEFINER; before update | executes job_agreements_immutable | V1 | keep |  |
| trigger | jobs :: jobs_snapshot_agreement | 20260905000000:483 | fn is DEFINER; after update of accepted_offer_id | executes snapshot_job_agreement | V1 | keep |  |
| trigger | payments :: payments_tip_ceiling | 20260905000000:924 | fn is DEFINER; before insert | executes enforce_tip_ceiling | V1 | keep |  |
| trigger | job_disputes :: job_disputes_refund_on_withdrawn | 20260905000000:1406 | fn is DEFINER; after update of status | executes refund_on_no_show_withdrawn | V1 | keep |  |
| trigger | jobs :: jobs_series_visit | 20260930001200:234 | fn is DEFINER; after update of assigned_worker_id, status, scheduled_date | executes series_on_visit_change | V1 | keep |  |
| trigger | payments :: payments_enqueue_receipts | 20260930001100:114 | fn is DEFINER; after update of status | executes enqueue_receipts | V1 | keep |  |
| trigger | jobs :: jobs_live_card | 20260930001300:213 | fn is DEFINER; after update of en_route_at, arrived_at, status, late_minutes | executes live_card_enqueue | MAYBE | judge | live card. |
| trigger | jobs :: jobs_reject_blocked_terms | 20261003000700:129 | fn is DEFINER; before insert or update of title, description | executes reject_blocked_terms | V1 | keep |  |
| trigger | profiles :: profiles_reject_blocked_terms | 20261003000700:133 | fn is DEFINER; before insert or update of bio | executes reject_blocked_terms | V1 | keep |  |
| trigger | reviews :: reviews_reject_blocked_terms | 20261003000700:137 | fn is DEFINER; before insert or update of comment | executes reject_blocked_terms | V1 | keep |  |
| trigger | messages :: messages_reject_blocked_terms | 20261003000700:141 | fn is DEFINER; before insert or update of content | executes reject_blocked_terms | V1 | keep |  |
| trigger | job_offers :: job_offers_reject_blocked_terms | 20261003000700:145 | fn is DEFINER; before insert or update of message | executes reject_blocked_terms | V1 | keep |  |
| trigger | portfolio_items :: portfolio_items_reject_blocked_terms | 20261003000700:149 | fn is DEFINER; before insert or update of caption | executes reject_blocked_terms | V1 | keep |  |
| trigger | worker_services :: worker_services_reject_blocked_terms | 20261003000900:14 | fn is DEFINER; before insert or update of title, description | executes reject_blocked_terms | V1 | keep |  |

### 1e. Cron jobs (9: 8 from migrations, 1 only in archive)

| kind | name | defined in | security | referenced by | label | proposal | note |
|---|---|---|---|---|---|---|---|
| cron | auto-release-due-payments | 20260910000000:141 (inside install_settlement_schedules) | pg_cron job `*/10 * * * *`; runs select public.auto_release_due_payments(); | SQL only | V1 | keep | installed by select public.install_settlement_schedules() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | expire-unfunded-payments | 20260910000000:141 (inside install_settlement_schedules) | pg_cron job `*/15 * * * *`; runs select public.expire_unfunded_payments(); | SQL only | V1 | keep | installed by select public.install_settlement_schedules() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | brazos-process-settlements | 20260910000000:141 (inside install_settlement_schedules) | pg_cron job `*/5 * * * *`; runs select public.drain_settlements(); | process-settlements (via drain_settlements, pg_net + Vault) | V1 | keep | installed by select public.install_settlement_schedules() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | brazos-tomorrow-reminders | 20260930000900:108 (inside install_reminder_schedule) | pg_cron job `0 22 * * *`; runs select public.enqueue_tomorrow_reminders(); | SQL only | V1 | keep | installed by select public.install_reminder_schedule() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | brazos-job-series | 20260930001000:672 (inside install_series_schedule) | pg_cron job `17 * * * *`; runs select public.advance_job_series(); | SQL only | V1 | keep | installed by select public.install_series_schedule() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | brazos-send-receipts | 20260930001100:280 (inside install_receipt_schedule) | pg_cron job `*/5 * * * *`; runs select public.drain_receipts(); | send-receipts (via drain_receipts) | V1 | keep | installed by select public.install_receipt_schedule() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | brazos-live-cards | 20260930001300:316 (inside install_live_card_schedule) | pg_cron job `* * * * *`; runs select public.drain_live_cards(); | send-live-cards (via drain_live_cards) | MAYBE | judge | installed by select public.install_live_card_schedule() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | brazos-prune-payment-events | 20261003000500:44 (inside install_payment_events_prune) | pg_cron job `30 3 * * *`; runs select public.prune_payment_event_payloads(); | SQL only | V1 | keep | installed by select public.install_payment_events_prune() at the end of its migration; idempotent (unschedules by jobid first). |
| cron | brazos-drain-push | NOT in migrations: supabase/archive/phases/phase74_push_scheduler.sql:96 | pg_cron job (schedule in that file, every minute per its header); runs select public.drain_notification_outbox() | send-push (via drain_notification_outbox, pg_net + Vault) | V1 | keep | NEEDS-JUDGE: exists on staging only if phase74 was applied by hand. 20260910000000_settlement_schedules.sql says it "never touches brazos-drain-push". |

### 1f. Indexes (64 live, one line per table), types, extension

| table | indexes (names) |
|---|---|
| areas | areas_bbox_idx |
| blocks | blocks_blocked_id_idx |
| conversation_states | conversation_states_user_direct_key (unique), conversation_states_user_job_key (unique) |
| bids | idx_bids_job, idx_bids_worker |
| jobs | idx_jobs_category, idx_jobs_client, idx_jobs_status, jobs_area_idx, jobs_property_idx, jobs_series_idx, jobs_job_number_key (unique) |
| reviews | idx_reviews_reviewee, reviews_job_reviewer_uniq (unique) |
| job_checklist_items | job_checklist_items_job_idx |
| job_disputes | job_disputes_job_idx, job_disputes_one_open_per_job (unique) |
| job_offers | job_offers_awaiting_idx, job_offers_customer_status_idx, job_offers_job_created_idx, job_offers_one_live_bid_per_worker (unique), job_offers_one_live_direct_per_job (unique), job_offers_one_live_direct_per_pair (unique), job_offers_parent_idx, job_offers_pending_expiry_idx, job_offers_root_idx, job_offers_source_row_key (unique), job_offers_worker_status_idx |
| job_requests | job_requests_awaiting_idx, job_requests_direct_thread_idx, job_requests_one_open_per_pair (unique), job_requests_thread_idx |
| legal_acceptances | legal_acceptances_user_idx |
| live_location_shares | live_location_shares_sharer_direct_key (unique), live_location_shares_sharer_job_key (unique) |
| message_reactions | message_reactions_job_id_idx |
| messages | messages_direct_thread_created_at_idx, messages_job_id_created_at_idx, messages_job_offer_idx, messages_job_request_idx |
| notification_outbox | notification_outbox_pending_idx |
| payments | payments_job_idx, payments_one_active_per_job_kind (unique), payments_payee_idx, payments_payer_idx, payments_release_queue_idx, payments_funding_window_idx, payments_provider_ref_uniq (unique), payments_payee_status_idx |
| portfolio_items | portfolio_items_worker_idx |
| profiles | profiles_deleted_at_idx |
| properties | properties_area_idx, properties_owner_address_uniq (unique), properties_owner_idx |
| push_tokens | push_tokens_user_active_idx |
| reports | reports_status_created_idx |
| worker_semantic_docs | worker_semantic_docs_embedding_idx, worker_semantic_docs_stale_idx |
| worker_services | worker_services_worker_idx |
| payment_events | payment_events_unprocessed_idx |
| job_series | job_series_active_idx |
| receipt_outbox | receipt_outbox_pending_idx |
| live_card_outbox | live_card_outbox_pending_idx |

Types (enums, all in baseline): bid_status (20260901000000:29), dispute_reason (20260901000000:40), dispute_status (20260901000000:52), job_category (20260901000000:62), job_status (20260901000000:80), job_visibility (20260901000000:93), offer_status (20260901000000:102), offer_type (20260901000000:119), payment_kind (20260901000000:132), payment_status (20260901000000:145), user_role (20260901000000:166), verification_status (20260901000000:176). Extension: `vector` (baseline:16, used by worker_semantic_docs, MAYBE). Enum ALTERs: 12 ALTER TYPE statements in baseline only.

### 1g. Dropped and replaced objects (history)

**Dropped for good or dropped then recreated with a new signature:**

| where | what | note |
|---|---|---|
| 20260905000000:277 | DROP INDEX payments_release_queue_idx |  |
| 20260925000100:89 | DROP FUNCTION create_review(uuid,uuid,integer,text,jsonb) | recreated later under the same name (new signature or same) |
| 20260925000100:165 | DROP FUNCTION profile_reviews(uuid,integer,integer) | recreated later under the same name (new signature or same) |
| 20260925000100:229 | DROP FUNCTION profile_review_summary(uuid) | recreated later under the same name (new signature or same) |
| 20260925000100:302 | DROP FUNCTION client_job_stats(uuid) | recreated later under the same name (new signature or same) |
| 20260930000400:80 | DROP FUNCTION create_job(text,text,job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smalli | recreated later under the same name (new signature or same) |
| 20260930000400:225 | DROP FUNCTION update_job_details(uuid,text,text,job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,intege | recreated later under the same name (new signature or same) |
| 20260930000600:55 | DROP FUNCTION create_job(text,text,job_category,text,integer,jsonb,double precision,double precision,jsonb,integer,integer,date,smalli | recreated later under the same name (new signature or same) |

**Drop-if-exists before create (idempotent re-create of a policy or trigger; nothing was removed for good):**

- 20260905000000:302 DROP POLICY app_config::app_config is world-readable
- 20260905000000:428 DROP POLICY job_agreements::job_agreements_select_parties
- 20260905000000:440 DROP TRIGGER job_agreements::job_agreements_immutable
- 20260905000000:482 DROP TRIGGER jobs::jobs_snapshot_agreement
- 20260905000000:923 DROP TRIGGER payments::payments_tip_ceiling
- 20260905000000:1405 DROP TRIGGER job_disputes::job_disputes_refund_on_withdrawn
- 20260925000100:69 DROP POLICY reviews::reviews_select_party
- 20260930001000:121 DROP POLICY job_series::job_series_select_parties
- 20260930001000:793 DROP TRIGGER jobs::jobs_series_visit
- 20260930001100:113 DROP TRIGGER payments::payments_enqueue_receipts
- 20260930001200:233 DROP TRIGGER jobs::jobs_series_visit
- 20260930001300:212 DROP TRIGGER jobs::jobs_live_card

**Functions replaced (CREATE OR REPLACE in a later file), newest last:**

- account_deletion_blockers: 20260901000000:359 -> 20261003000300:19 -> 20261003001000:26
- ban_user: 20260901000000:608 -> 20261003000100:33 -> 20261003000600:24 -> 20261003001200:31
- claim_notification_batch: 20260901000000:849 -> 20260930000800:135
- enqueue_notification: 20260901000000:2030 -> 20260930000800:99
- job_payment_state: 20260901000000:2579 -> 20260905000000:1107
- jobs_within_radius: 20260901000000:2685 -> 20260930000500:16
- notify_nearby_for_job: 20260901000000:3148 -> 20260930000600:204
- notify_on_bid: 20260901000000:3207 -> 20260930001200:39
- notify_on_dispute: 20260901000000:3265 -> 20260905000000:1346
- notify_on_job_status: 20260901000000:3382 -> 20260930000100:112 -> 20261003000800:14
- notify_on_message: 20260901000000:3427 -> 20260930001000:938
- notify_on_offer_counter: 20260901000000:3520 -> 20261003000400:19
- notify_on_payment_release: 20260901000000:3589 -> 20260910000000:251
- notify_on_review: 20260901000000:3620 -> 20260925000200:21
- should_notify: 20260901000000:4850 -> 20260930000100:159
- transition_job_status: 20260901000000:5003 -> 20260905000000:1001 -> 20260925000000:113
- apply_payment_event: 20260905000000:641 -> 20260915000000:114
- auto_release_due_payments: 20260905000000:811 -> 20260930000100:63
- enqueue_tomorrow_reminders: 20260930000900:44 -> 20261003000200:21
- series_on_visit_change: 20260930001000:704 -> 20260930001200:142

**Views:** 6 views; CREATE OR REPLACE VIEW statements: conversations@20260901000000:5772, v_bids_projection_drift@20260901000000:6152, transfers_due@20260905000000:860, refunds_due@20260905000000:879, refunds_due@20260920000000:116, transfers_ready@20261003000000:23, refunds_ready@20261003000000:39, transfers_ready@20261003001100:24.

**Policies replaced:** reviews_select_party (baseline:7535 area -> 20260925000100:71, via drop at :69). Policy re-creates in stripe_foundation: app_config world-readable (:303), job_agreements_select_parties (:429).

**Columns added/dropped after the baseline (ALTER TABLE ... ADD/DROP COLUMN):**

- payments: +customer_fee_bps@0905000000, +customer_fee_cents@0905000000, +worker_fee_bps@0905000000, +tax_cents@0905000000, +transfer_ref@0905000000, +refund_ref@0905000000, +release_requested_at@0905000000, +funding_due_at@0905000000, +chargeback_ref@0905000000, +chargeback_at@0905000000, +last_error@0905000000, +transfer_cents@0905000000, +refund_cents@0905000000, +refund_reason@0905000000, +transfer_reversed_at@0905000000, +transfer_attempts@0905000000, +charge_amount_cents@0905000000, +refund_attempts@0920000000
- jobs: +cancelled_at@0905000000, +cancelled_by@0905000000, +cancel_reason@0905000000, +pricing_mode@0930000400, +needed_today@0930000600, +late_minutes@0930000700, +late_reported_at@0930000700, +series_id@0930001000, +job_number@0930001100
- payment_accounts: +payouts_status@0915000000
- reviews: +would_again@0925000100
- notification_prefs: +quiet_hours@0930000800, +quiet_tz@0930000800
- notification_outbox: +send_after@0930000800
- reports: +subject_kind@1003000700, +subject_id@1003000700

**Constraints dropped (19, mostly re-added with new definitions):** payments.payments_provider_known@0905000000:187, payments.payments_release_reason_known@0905000000:191, payments.payments_customer_fee_not_negative@0905000000:222, payments.payments_tax_not_negative@0905000000:224, payments.payments_transfer_cents_not_negative@0905000000:226, payments.payments_refund_cents_bounded@0905000000:228, payments.payments_transfer_attempts_not_negative@0905000000:231, payments.payments_refund_reason_known@0905000000:234, jobs.jobs_cancel_reason_known@0905000000:389, payments.payments_refund_reason_known@0915000000:254, payment_accounts.payment_accounts_payouts_status_known@0915000000:277, payments.payments_refund_attempts_not_negative@0920000000:96, jobs.jobs_pricing_mode_known@0930000400:68, jobs.jobs_posted_price_has_price@0930000400:70, jobs.jobs_late_minutes_known@0930000700:45, notification_prefs.notification_prefs_quiet_tz_shape@0930000800:51, payments.payments_refund_reason_known@1003000100:27, reports.reports_reason_valid@1003000700:40, reports.reports_subject_valid@1003000700:46.

### 1h. Migration legend

| prefix | file | lines |
|---|---|---|
| 20260901000000 | 20260901000000_baseline.sql | 8712 |
| 20260901000001 | 20260901000001_roles.sql | 14 |
| 20260905000000 | 20260905000000_stripe_foundation.sql | 1564 |
| 20260910000000 | 20260910000000_settlement_schedules.sql | 295 |
| 20260915000000 | 20260915000000_connect_onboarding.sql | 372 |
| 20260920000000 | 20260920000000_settlement_retry.sql | 200 |
| 20260925000000 | 20260925000000_job_completions.sql | 239 |
| 20260925000100 | 20260925000100_r8a_reputation.sql | 349 |
| 20260925000200 | 20260925000200_r8bs_review_notification.sql | 63 |
| 20260930000100 | 20260930000100_auto_release_told_gate.sql | 214 |
| 20260930000200 | 20260930000200_reputation_batch_summary.sql | 129 |
| 20260930000300 | 20260930000300_nearby_alerts_default.sql | 41 |
| 20260930000400 | 20260930000400_job_pricing_mode.sql | 389 |
| 20260930000500 | 20260930000500_radius_cap_3000.sql | 51 |
| 20260930000600 | 20260930000600_needed_today.sql | 263 |
| 20260930000700 | 20260930000700_running_late.sql | 125 |
| 20260930000800 | 20260930000800_quiet_hours.sql | 200 |
| 20260930000900 | 20260930000900_tomorrow_reminders.sql | 142 |
| 20260930001000 | 20260930001000_job_series.sql | 1060 |
| 20260930001100 | 20260930001100_receipts.sql | 312 |
| 20260930001200 | 20260930001200_hire_from_push.sql | 239 |
| 20260930001300 | 20260930001300_live_card.sql | 341 |
| 20261003000000 | 20261003000000_settlement_queue_ready.sql | 48 |
| 20261003000100 | 20261003000100_ban_refund.sql | 111 |
| 20261003000200 | 20261003000200_reminders_payment_gate.sql | 104 |
| 20261003000300 | 20261003000300_deletion_partial_refund.sql | 112 |
| 20261003000400 | 20261003000400_money_label_counter.sql | 88 |
| 20261003000500 | 20261003000500_payment_events_prune.sql | 73 |
| 20261003000600 | 20261003000600_ban_void_unfunded.sql | 111 |
| 20261003000700 | 20261003000700_ugc_moderation.sql | 152 |
| 20261003000800 | 20261003000800_job_completed_copy.sql | 55 |
| 20261003000900 | 20261003000900_service_listing_filter.sql | 17 |
| 20261003001000 | 20261003001000_deletion_fee_owed.sql | 131 |
| 20261003001100 | 20261003001100_transfers_ready_fresh_first.sql | 39 |
| 20261003001200 | 20261003001200_ban_lock_customer_in_progress.sql | 135 |

## Part 2. Edge functions (12 folders in supabase/functions/)

Platform default: `verify_jwt` is ON for every function; config.toml (supabase/config.toml:415-468) sets it OFF only for stripe-webhook and connect-return, and `enabled = false` for translate. "Lines" = index.ts (+ helper .mjs files in the folder).

| name | lines | what it does (<=15 words) | how it authenticates callers | called by | secrets it reads (env var names) | label | proposal | note |
|---|---|---|---|---|---|---|---|---|
| connect-onboarding | 279 | Creates the worker payout account and a one-use onboarding link. | user JWT: platform verify_jwt true, then forwards the caller token to my_payouts_status (index.ts:147-167) | app: lib/payments/stripe.ts:283 | STRIPE_SECRET_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | V1 | keep | RPCs: get/set_payment_account, set_payouts_status (service role). |
| connect-return | 50 + page.mjs 106 | Constant HTML bounce from Stripe onboarding back to the app deep link. | NONE by design (verify_jwt false, config.toml:463); nothing from the request is echoed | Stripe hosted onboarding return_url / refresh_url (app deep link handled in App.tsx, lib/navigation.ts) | none read | V1 | keep | Weak auth is intended; security audit should confirm it stays constant. |
| connect-status | 211 + classify.mjs 66 | Reads the caller's Stripe account state and records it. | user JWT: verify_jwt true, forwards caller token to my_payouts_status (index.ts:131-148) | app: lib/payments/stripe.ts:314 | STRIPE_SECRET_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | V1 | keep |  |
| create-payment | 434 | Starts the Stripe charge for a job payment or tip, incl. one-tap saved card. | user JWT: verify_jwt true; begin_job_payment/begin_tip_payment run AS the caller (index.ts:235-242) | app: lib/payments/stripe.ts:203, :385 | STRIPE_SECRET_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | V1 | keep | Money path: critical folder. |
| payment-methods | 172 | Lists, adds and removes the caller's saved cards at Stripe. | user JWT: verify_jwt true, then asks /auth/v1/user who the token is (index.ts:70) | app: lib/paymentMethods.ts:74 | STRIPE_SECRET_KEY, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | V1 | keep | saved cards. |
| process-settlements | 476 + classify.mjs 132 | Pays workers and refunds customers from the transfers_ready / refunds_ready queues. | service-role secret: header must equal "Bearer <service key>" with !== (index.ts:442, not constant-time); platform JWT check also on (no config entry) | pg_cron brazos-process-settlements every 5 min via drain_settlements() (pg_net, Vault secrets) | STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | V1 | keep | Money path: critical folder. |
| send-live-cards | 169 | Sends Apple live-activity (lock screen card) pushes. | service-role secret: header !== "Bearer <service key>" -> 403 (index.ts:82, not constant-time) | pg_cron brazos-live-cards every minute via drain_live_cards() | APNS_HOST, APNS_KEY_ID, APNS_KEY_P8, APNS_TEAM_ID, APNS_TOPIC, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | MAYBE | judge | Live card needs expo-live-activity, which is not in package.json. Cut together with the 8 live-card SQL functions, 2 tables, 1 trigger, 1 cron. |
| send-push | 250 | Drains notification_outbox and sends Expo push messages. | service-role secret: header !== "Bearer <service key>" -> 403 (index.ts:222, not constant-time) | pg_cron brazos-drain-push via drain_notification_outbox() (cron not in migrations) | SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL (calls exp.host push API, no key) | V1 | keep |  |
| send-receipts | 257 + receipt.mjs 351 | Emails a receipt to customer and worker after a payment is released. | service-role secret: header !== "Bearer <service key>" -> 403 (index.ts:224, not constant-time) | pg_cron brazos-send-receipts every 5 min via drain_receipts() | RECEIPT_FROM, RECEIPT_REPLY_TO, RECEIPT_TEST_TO, RESEND_API_KEY, STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | V1 | keep | Resend key not yet placed per its header; receipts skip until it exists. |
| stripe-webhook | 235 + verify.mjs 131 | Verifies the Stripe signature, logs the event, applies it via apply_payment_event. | Stripe signature (verify.mjs); verify_jwt false (config.toml:425) | Stripe (webhook delivery) | STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL | V1 | keep | Money path: critical folder. |
| translate | 233 | Draft proxy to Azure Translator for chat translation. Never deployed. | only checks a Bearer header exists (index.ts:142); relies on platform verify_jwt; enabled=false in config.toml:468 | app: lib/translate.ts:63 (ChatScreen etc.); function is not deployed | AZURE_TRANSLATOR_KEY, AZURE_TRANSLATOR_REGION | CUT | drop | Translation is CUT. Remove folder, config.toml [functions.translate] block, lib/translate*.ts callers. |
| worker-search | 597 | Semantic worker search: embeds worker profiles and ranks them for a query. | user JWT: own /auth/v1/user check; rejects service and anon keys (index.ts:185-215); platform verify_jwt default on | app: lib/workerSearch.ts:662 (also lib/rebook.ts) | SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL (embeds with built-in Supabase.ai gte model, no key) | MAYBE | judge | Uses 6 SQL functions, worker_semantic_docs, vector extension. In staging.yml redeploy list. Critical folder. |

## Part 3. Database tests (32 files in supabase/tests/)

Run by `npm run db:test` (supabase test db) and .github/workflows/pgtap.yml. "TOUCHES" lists CUT / DEAD / MAYBE objects the file mentions (count in brackets): these are what breaks or needs editing when those objects are dropped.

| file | plan | what it fences | objects it covers | label |
|---|---|---|---|---|
| 000_smoke.sql | 2 | pgTAP harness works; baseline schema exists | jobs(2). | TOOLING |
| 010_offers.sql | 52 | offer model: create, counter, accept, decline, withdraw, RLS | job_offers(18), jobs(9), create_offer(6), accept_offer(5), payments(5), job_locations(4). TOUCHES: sandbox_authorize_job_payment CUT(3), bids MAYBE(2), sandbox_hold_job_payment CUT(2), my_payouts_enabled DEAD(2), sandbox_cash_out CUT(1), sandbox_cash_out_enabled CUT(1), sandbox_release_job_payment CUT(1). | V1 |
| 020_lifecycle.sql | 75 | active work: arrive, checklist, complete, tip, release | payments(10), jobs(9), job_checklist_items(9), transition_job_status(8), notification_outbox(8), mark_worker_arrival(7). TOUCHES: job_checklist_items MAYBE(9), sandbox_tip_worker CUT(6), sandbox_release_job_payment CUT(5), sandbox_authorize_job_payment CUT(3), sandbox_hold_job_payment CUT(3), sandbox_cash_out CUT(2), bids MAYBE(1). | V1 |
| 030_payments.sql | 299 | Stripe money core: fees, agreements, payments, cancel, disputes, queues | payments(48), job_agreements(44), transfers_due(36), refunds_due(29), payment_events(28), cancel_job(27). TOUCHES: sandbox_tip_worker CUT(4), bids MAYBE(3), my_payouts_enabled DEAD(3), sandbox_authorize_job_payment CUT(2), sandbox_hold_job_payment CUT(2), sandbox_release_job_payment CUT(1). | V1 |
| 040_authz.sql | 540 | authorization matrix: no cross-user leak, no impersonation | bids(64), jobs(39), profiles(39), job_offers(35), payments(32), messages(30). TOUCHES: bids MAYBE(64), live_location_shares CUT(14), worker_services MAYBE(14), portfolio_items MAYBE(13), conversation_states CUT(11), set_conversation_state CUT(11), job_checklist_items MAYBE(10) +35 more. | V1 |
| 050_settlements.sql | 71 | settlement cron installers and drain_settlements | drain_settlements(21), payment_accounts(20), payments(15), set_payment_customer(14), install_settlement_schedules(12), get_payment_customer(12). | V1 |
| 060_connect.sql | 136 | Connect payout account RPCs and states | payments(54), payment_accounts(45), set_payouts_status(22), set_payment_account(17), get_payment_account(16), my_payouts_status(15). TOUCHES: my_payouts_enabled DEAD(8). | V1 |
| 070_settlement_retry.sql | 97 | transfer/refund retry bookkeeping | payments(74), refunds_due(32), record_settlement_attempt(26), transfers_due(8), create_offer(3), begin_job_payment(3). | V1 |
| 080_job_completions.sql | 69 | job_completions rows and the completion path | job_completions(52), transition_job_status(20), job_completions_enabled(6), jobs(5), release_job_payment(4), create_offer(3). TOUCHES: sandbox_authorize_job_payment CUT(3), sandbox_hold_job_payment CUT(3), bids MAYBE(1). | V1 |
| 090_reputation.sql | 61 | reviews, reveal rule, summaries, client stats | reviews(26), profile_review_summary(19), create_review(17), client_job_stats(13), notification_outbox(12), profile_reviews(10). TOUCHES: sandbox_authorize_job_payment CUT(1), sandbox_hold_job_payment CUT(1). | V1 |
| 100_nearby_alerts_default.sql | 3 | nearby-job alerts default on | notification_prefs(3), profiles(2), create_default_notification_prefs(1). | V1 |
| 110_auto_release_gate.sql | 45 | auto-release waits for the told notification | auto_release_due_payments(20), jobs(18), notification_outbox(13), should_notify(9), payments(9), create_offer(5). TOUCHES: mutes CUT(3), set_block CUT(1). | V1 |
| 120_reputation_batch.sql | 83 | batch review summaries | profile_review_summaries(81), reviews(25), profile_review_summary(15), create_review(9), worker_job_stats(5), jobs(4). TOUCHES: worker_job_stats MAYBE(5), sandbox_authorize_job_payment CUT(1), sandbox_hold_job_payment CUT(1). | V1 |
| 130_job_pricing_mode.sql | 30 | pricing mode on create_job / update_job_details | jobs(21), create_job(18), update_job_details(13), bids(4), accept_offer(3), job_offers(2). TOUCHES: bids MAYBE(4). | V1 |
| 140_needed_today.sql | 13 | need-it-today nearby alerts | create_job(15), jobs(9), notification_outbox(4), notify_nearby_for_job(3), notification_prefs(3), job_locations(2). | V1 |
| 150_running_late.sql | 17 | running-late report | report_running_late(13), jobs(7), notification_outbox(5), accept_offer(3), create_offer(3), create_job(3). TOUCHES: bids MAYBE(1). | V1 |
| 160_quiet_hours.sql | 18 | quiet-hours push deferral | quiet_hours_until(10), notification_outbox(9), notification_prefs(9), claim_notification_batch(7), jobs(5), enqueue_notification(4). | V1 |
| 170_tomorrow_reminders.sql | 19 | tomorrow reminder queue | notification_outbox(16), enqueue_tomorrow_reminders(6), create_job(4), accept_offer(3), create_offer(3), install_reminder_schedule(3). | V1 |
| 180_job_series.sql | 58 | repeat jobs (job series) and money rules | job_series(36), jobs(29), job_offers(11), notification_outbox(11), start_job_series(10), advance_job_series(9). TOUCHES: bids MAYBE(7). | V1 |
| 190_receipts.sql | 23 | receipt outbox and its RPCs | receipt_outbox(17), resolve_receipt(8), payments(8), receipt_details(7), jobs(6), claim_receipt_batch(4). | V1 |
| 200_hire_from_push.sql | 9 | payment-declined push (hire-from-push) | notification_outbox(5), enqueue_payment_declined(4), jobs(3), create_offer(2), notify_on_bid(2), bids(2). TOUCHES: bids MAYBE(2). | V1 |
| 210_live_card.sql | 17 | live card state, outbox, tokens | live_card_state(8), claim_live_card_batch(5), jobs(5), live_card_outbox(5), clock_label(4), register_live_activity(3). TOUCHES: live_card_state MAYBE(8), live_card_outbox MAYBE(5), claim_live_card_batch MAYBE(5), clock_label MAYBE(4), register_live_activity MAYBE(3), drain_live_cards MAYBE(3), live_activity_tokens MAYBE(2) +1 more. | V1 |
| 220_settlement_ready.sql | 20 | transfers_ready/refunds_ready queue views | transfers_ready(22), payments(12), transfers_due(10), refunds_ready(9), payment_accounts(7), jobs(4). | V1 |
| 230_ban_refund.sql | 17 | ban refunds the customer | payments(12), jobs(7), ban_user(6), refunds_due(4), profiles(3), refunds_ready(2). | V1 |
| 240_deletion_partial_refund.sql | 16 | account deletion partial refund, fee owed | account_deletion_blockers(14), payments(9), blocks(6), transfers_due(5), cancel_job(1), jobs(1). | V1 |
| 250_money_label_counter.sql | 6 | money label in counter-offer push | notification_outbox(5), money_label(4), counter_offer(3), notify_on_offer_counter(3), create_offer(2), create_job(2). TOUCHES: bids MAYBE(1). | V1 |
| 260_payment_events_prune.sql | 11 | payment_events payload prune | payment_events(8), prune_payment_event_payloads(7), install_payment_events_prune(3). | V1 |
| 270_ban_void_unfunded.sql | 10 | ban voids unfunded payments | jobs(7), payments(7), account_deletion_blockers(3), cancel_job(3), ban_user(2), profiles(2). | V1 |
| 280_content_filter.sql | 23 | blocked-terms content filter triggers | jobs(9), create_offer(4), update_my_profile(4), create_job(4), reject_blocked_terms(4), reviews(3). TOUCHES: worker_services MAYBE(3), portfolio_items MAYBE(1). | V1 |
| 290_ban_customer_in_progress.sql | 19 | ban locks customer with job in progress | jobs(11), payments(11), ban_user(8), resolve_job_dispute(6), profiles(2), refunds_due(2). | V1 |
| _helpers.sql | 8 | fixture helpers (users, jobs) included by every file | profiles(5), handle_new_user(3), is_active_user(2), is_profile_active(2), banned_phones(1). | TOOLING |
| phase29_security_contract.sql | 26 | grant contract: RPC execute rights, profile column grants | profiles(18), job_locations(6), create_job(4), bids(4), jobs(4), accept_bid(3). TOUCHES: bids MAYBE(4), accept_bid DEAD(3), create_bid DEAD(3). | V1 |

Plan counts add to 1893: each of the 32 files has exactly one plan() line (_helpers.sql:133 carries its own plan(8), a self-check of the fixture helpers).

## Part 4. Other SQL and scripts

| path | what it is | still needed by anything? (grep) | proposal |
|---|---|---|---|
| supabase/archive/phases/ (83 files) | Old applied-by-hand phase SQL: phase1..phase78 (phase5-phase78 contiguous, with phase68-72 rollbacks, 5 seed files: phase11 hotspots, phase22, phase23, phase27, phase28, phase78_areas_seed). Superseded by the baseline. | 28 jest files in tests/ read these as fixtures (29 distinct phase files, e.g. phase61 x8, phase77 x5, phase56 x5, phase63 x4); scripts/build-areas-seed.mjs; HANDOFF.md, PROD_APPLY.md. phase74_push_scheduler.sql:96 is the ONLY definition of cron job brazos-drain-push. No migration, edge function or CI step reads them. | archive, but only after those 28 jest files are cut or repointed, and after brazos-drain-push is moved into a migration |
| supabase/snippets/ | Empty directory (not tracked by git). | no | archive (delete empty dir) |
| supabase/seed.sql | Local-stack seed: three known identities and fixtures (adapted from scripts/seed-phase-6.sql). 366 lines. Never read any row. | yes: pgtap.yml runs it after db:reset; supabase/config.toml seed path; tests/_helpers.sql and 040_authz.sql depend on its identities; scripts/demo-link/robot.mjs; lib/jobs.ts mentions it; scripts/rls-probe-offers.mjs | keep (edit if sandbox/CUT fixtures appear) |
| supabase/add_location_column.sql | One-off: add jobs.location column (10 lines). Baseline already has it. | only scripts/verify-schema.mjs mentions it | archive |
| supabase/config.toml | Local Supabase CLI config, 497 lines; function settings at :415-468. | yes: CLI, pgtap.yml, staging.yml, edge functions comments | keep (remove [functions.translate] if translate is cut) |
| scripts/phase5-proof.sql | Staging two-account proof, offers (555 lines); converted into supabase/tests/010_offers.sql. | mentioned by 010_offers.sql, _helpers.sql, rls-probe-offers.mjs (comments), PROD_APPLY.md | archive |
| scripts/phase6-proof.sql | Staging proof, lifecycle (593 lines); converted into 010/020. | mentioned by 010, 020, _helpers.sql (comments) | archive |
| scripts/phase7-proof.sql | Staging proof, phase 7 (264 lines). | no references | archive |
| scripts/phase8-proof.sql | Staging proof, radius correctness (161 lines). | scripts/seed-phase-8.sql only | archive |
| scripts/phase9-proof.sql | Staging proof, phase 9 (196 lines). | no references | archive |
| scripts/phase10-proof.sql | Staging proof, review integrity (160 lines). | PROD_APPLY_READY.sql mentions it | archive |
| scripts/phase11-proof.sql | Staging proof, earnings (133 lines). | no references | archive |
| scripts/phase12-proof.sql | Staging proof, notification feed (116 lines). | PROD_APPLY.md only | archive |
| scripts/phase60-proof.sql | Staging adversarial test for jobs_delete_own / can_delete_own_job (252 lines). | no references | archive |
| scripts/phase61-proof.sql | Staging proof, marketplace thread identity (227 lines). | no references | archive |
| scripts/phase62-proof.sql | Staging proof, counter-offer notification copy (140 lines). | no references | archive |
| scripts/phase63-proof.sql | Staging proof, counter-offer cap 10 per side (216 lines). | no references | archive |
| scripts/phase66-proof.sql | Staging proof, messaging locked until confirmed (176 lines). | no references | archive |
| scripts/seed-phase-6.sql | Staging seed (327 lines); parent of supabase/seed.sql. | seed.sql header, phase6/10/11/12/7 proofs, rls-probe-offers.mjs, REVIEW_GUIDE.md, PROD_APPLY.md | archive (seed.sql is the live seed) |
| scripts/seed-phase-7.sql | Staging seed, phase 7 (60 lines). | PROD_APPLY.md only | archive |
| scripts/seed-phase-8.sql | Staging seed, phase 8 (84 lines). | phase8-proof.sql, PROD_APPLY.md | archive |
| scripts/seed-phase-9.sql | Staging seed, phase 9 (57 lines). | PROD_APPLY.md only | archive |
| scripts/lifecycle-proof.mjs | Drives two real staging sessions through the lifecycle over PostgREST (399 lines); converted into 020_lifecycle.sql. Uses sandbox_* RPCs. | scripts/seed-review.mjs, DECISIONS.md, PROD_APPLY.md, 020_lifecycle.sql comments | archive (calls CUT sandbox functions) |
| scripts/seed-review.mjs | Staging review seed (201 lines). | DECISIONS.md, PROD_APPLY.md, REVIEW_GUIDE.md | archive |
| scripts/rls-probe-offers.mjs | RLS probe for job_offers_select_party against staging (282 lines). | DECISIONS.md; mentions seed-phase-6.sql and seed.sql | archive (040_authz.sql covers it) |
| scripts/verify-schema.mjs | Asks the LIVE database what exists, using marker functions, views and probes (1,869 lines). Probes the marker functions that are TOOLING in Part 1. | README.md, .claude/rules/supabase.md, PROD_VERIFY.sql, PROD_APPLY_READY.sql, scripts/supabase-ref.mjs, send-push comments; not in package.json scripts or CI | judge: keep if the audit wants a live-schema probe, but then edit it with the drop migration (it will fail on dropped markers) |
| scripts/staging-acl-bootstrap.sql | STAGING ONLY ACL bootstrap (41 lines). | DECISIONS.md, PROD_APPLY.md | archive |
| scripts/staging-scan.sh | Destructive-migration tripwire for the staging pipeline (360 lines). | yes: .github/workflows/staging.yml:198,217; .claude/rules/supabase.md; named in 8 migration comments | keep. The drop migration will trip it by design (plan decision D4: you apply that one by hand). |

Not asked but seen: repo-root `PROD_APPLY.md`, `PROD_APPLY_READY.sql`, `PROD_VERIFY.sql` are production apply/verify notes that point at scripts above (history, not code).

## Summary

**Counts (live objects, from migrations):** tables 41, views 6, functions 208 (+6 dropped), policies 96, triggers 33, cron jobs 9 (8 in migrations + brazos-drain-push in archive), indexes 64, enum types 12, extensions 1. Edge functions 12. DB test files 32 (plan total 1893).

| kind | V1 | CUT | MAYBE | DEAD | TOOLING | total |
|---|---|---|---|---|---|---|
| table | 25 | 3 | 10 | 3 | 0 | 41 |
| view | 5 | 0 | 0 | 0 | 1 | 6 |
| function | 118 | 13 | 24 | 12 | 41 | 208 |
| policy | 47 | 9 | 27 | 13 | 0 | 96 |
| trigger | 24 | 0 | 7 | 2 | 0 | 33 |
| cron | 8 | 0 | 1 | 0 | 0 | 9 |
| **all** | 227 | 25 | 69 | 30 | 42 | 393 |

"DEAD" policies = 7 inert policies (no grant allows their command) plus policies on DEAD tables. Edge functions: V1 9, MAYBE 2 (send-live-cards, worker-search), CUT 1 (translate).

**SECURITY DEFINER functions that `authenticated` can execute (88, names only):** accept_bid, accept_legal_documents, accept_offer, account_deletion_blockers, account_deletion_enabled, admin_open_reports, ban_user, can_delete_own_job, client_job_stats, counter_offer, create_bid, create_job_request, create_offer, current_user_is_admin, current_user_is_banned, decline_offer, delete_my_account, get_my_active_mode, get_my_profile, is_active_user, is_blocked_between, is_profile_active, job_bid_count, job_bid_counts, job_hotspots, job_offer_count, job_offer_counts, job_payment_state, job_request_parties_ok, jobs_in_cell, jobs_within_radius, mark_direct_thread_read, mark_worker_arrival, match_workers_semantic, messaging_unlocked, my_pending_job_requests, my_pending_offers, open_job_dispute, phase68_deleted_at_authorization_enabled, phase69_execute_lockdown_enabled, phase70_unsend_message_authz_enabled, phase71_reviews_read_lockdown_enabled, phase72_storage_read_lockdown_enabled, phase76_rls_posture, register_push_token, respond_job_request, sandbox_authorize_job_payment, sandbox_cash_out, sandbox_hold_job_payment, sandbox_release_job_payment, sandbox_tip_worker, set_active_mode, set_block, set_conversation_state, set_direct_thread_read_at, set_job_property, should_notify, start_live_location, stop_live_location, transition_job_status, unban_user, unsend_message, update_live_location, update_my_profile, withdraw_job_dispute, withdraw_offer, worker_job_stats, current_fee, quote_job_price, my_payouts_enabled, begin_job_payment, release_job_payment, begin_tip_payment, cancel_job, my_payouts_status, review_is_revealed, create_review, profile_reviews, profile_review_summary, profile_review_summaries, update_job_details, create_job, report_running_late, start_job_series, stop_job_series, drop_series_worker, live_card_state, register_live_activity.

**Functions anon can execute (3):** job_categories_expanded, phase76_rls_posture, review_is_revealed (job_categories_expanded and phase76_rls_posture are anon on purpose, for scripts/verify-schema.mjs; review_is_revealed is anon+authenticated because the reviews SELECT policy and review RPCs call it, 20260925000100:62). No function has PUBLIC execute. service_role-only SECURITY DEFINER functions are not listed.

**SECURITY DEFINER functions without SET search_path:** none.

**GRANTs of TRUNCATE, TRIGGER or ALL on a public table to anon or authenticated (file:line, as written in the migration):**

| file:line | table | privileges | role |
|---|---|---|---|
| 20260901000000_baseline.sql:7813 | bids | SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:7828 | jobs | SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:7849 | reviews | SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:7924 | profiles | REFERENCES,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8475 | areas | SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8481 | banned_phones | SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8487 | blocks | SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8498 | direct_threads | SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8504 | messages | ALL | authenticated |
| 20260901000000_baseline.sql:8509 | conversations (view) | ALL | anon |
| 20260901000000_baseline.sql:8510 | conversations (view) | ALL | authenticated |
| 20260901000000_baseline.sql:8515 | job_checklist_items | ALL | authenticated |
| 20260901000000_baseline.sql:8521 | job_locations | SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8527 | job_requests | SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8533 | legal_acceptances | ALL | authenticated |
| 20260901000000_baseline.sql:8544 | message_reactions | ALL | authenticated |
| 20260901000000_baseline.sql:8550 | message_reads | ALL | authenticated |
| 20260901000000_baseline.sql:8556 | mutes | SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN | authenticated |
| 20260901000000_baseline.sql:8571 | notification_prefs | ALL | authenticated |
| 20260901000000_baseline.sql:8577 | portfolio_items | ALL | authenticated |
| 20260901000000_baseline.sql:8582 | properties | ALL | authenticated |
| 20260901000000_baseline.sql:8588 | push_tokens | ALL | authenticated |
| 20260901000000_baseline.sql:8594 | reports | ALL | authenticated |
| 20260901000000_baseline.sql:8599 | saved_workers | ALL | authenticated |
| 20260901000000_baseline.sql:8612 | worker_services | ALL | authenticated |

Also: `ALTER DEFAULT PRIVILEGES ... IN SCHEMA public GRANT ALL ON TABLES TO anon / authenticated` at 20260901000000_baseline.sql:8681-8682 (and SEQUENCES :8664-8665): any table later created by `postgres` starts with ALL for both roles unless the migration revokes. All 11 later tables and the 4 later queue views do revoke (see 1a security column: anon and auth show "-" or S only). Baseline also grants `MAINTAIN` (VACUUM, ANALYZE, LOCK TABLE ...) to anon on many tables, e.g. `GRANT SELECT,MAINTAIN ON TABLE "public"."reports" TO "anon"` (:8590); not in the brief but the same family.

**Tables in public without RLS enabled:** none (all 41 tables have ENABLE ROW LEVEL SECURITY; file:line of each is in the 1a security column). The 6 views have no RLS by nature; `conversations` is security_invoker and `v_bids_projection_drift` is security_invoker.
Tables with RLS on and zero policies (service_role or definer-function access only): banned_phones, worker_semantic_docs, fee_schedule, payment_events, payment_accounts, receipt_outbox, live_activity_tokens, live_card_outbox, blocked_terms.

**Inert policies (policy exists, no grant for its command):** public.jobs::clients insert own jobs; public.jobs::clients update own jobs; public.reviews::reviews_insert_completed_party; public.profiles::users insert own profile; public.profiles::users update own profile; public.bids::workers insert own bids; public.bids::workers update own bids.

**NEEDS-JUDGE (all):**
1. Table privileges: baseline grants TRUNCATE/TRIGGER/MAINTAIN (and ALL) to authenticated, MAINTAIN to anon, on public tables (list above). Confirm on the live catalog; add a pgTAP assertion either way.
2. handle_new_user(): no trigger on auth.users in any migration (profiles for new sign-ups depend on a hand-made trigger on staging).
3. brazos-drain-push cron and drain_notification_outbox(): defined only in supabase/archive/phases/phase74_push_scheduler.sql; a fresh stack has no push drain.
4. Legacy bids projection: MAYBE, not DEAD, because notify_on_bid() on bids is the new-bid push. Re-home before dropping bids, v_bids_projection_drift, mirror/project functions, jobs.accepted_bid_id.
5. Sandbox cut: 7 V1 function bodies hold sandbox branches and payments.provider defaults to sandbox; 7 pgTAP files mention sandbox_* (010,020,030,040,080,090,120).
6. delete_my_account(), should_notify(), notify_on_message(), unsend_message() mention CUT objects and must be re-created in the drop migration.
7. MAYBE groups needing a human call: chat reactions; message_reads / mark_direct_thread_read / set_direct_thread_read_at (unread count vs read ticks); unsend_message; portfolio_items + enforce_portfolio_cap; worker_services; saved_workers; job_checklist_items; worker-search + worker_semantic_* + vector extension; hotspots map (job_hotspots, jobs_in_cell); worker_job_stats; live card set; legal_acceptances kept as V1 on my reading.
8. translate: the app still calls it (lib/translate.ts:63) although the function is disabled in config.toml; CUT removes both.
9. Edge auth: 4 functions use non-constant-time `!==` on the service-role header; translate checks header presence only (undeployed); connect-return has no auth by design.
10. Marker functions (41 *_enabled / probe functions incl. phase76_rls_posture, job_categories_expanded): TOOLING, probed by scripts/verify-schema.mjs and some pgTAP files (040, phase29, 030, 060 ...). Drop them only together with those probes.
11. archive/phases is read by 28 jest files; do not move it before they are cut.
12. Grants here are INFERRED from migration text (including column-level grants on profiles, notification_outbox, job_series, which I did not model per column). Nothing was verified against a running database.

