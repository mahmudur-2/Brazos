# Code-side security facts (step E1b)

- Date: 2026-11-08. Branch lean-v1. HEAD at start 30dbf15; at the end b37f6e2 (D9 landed). Read-only pass; nothing in the repo was changed except this file.
- Marks: VERIFIED = I read the line. INFERRED = follows from lines read, not measured. UNKNOWN = not determined.
- Companion: docs/lean/security-facts.md (E1a). E1a was measured at HEAD 72b6a30, BEFORE migration 20261108000000_lean_v1.sql: its tables and function lists still contain the objects lean_v1 drops (VERIFIED: E1a section 1 lists live_location_shares, job_requests, saved_workers, properties and others that lean_v1 drops at lines 15, 126, 37, 133).
- Migration file short names used below: B = 20260901000000_baseline.sql, SF = 20260905000000_stripe_foundation.sql, CO = 20260915000000_connect_onboarding.sql, JC = 20260925000000_job_completions.sql, R8 = 20260925000100_r8a_reputation.sql, RB = 20260930000200_reputation_batch_summary.sql, JPM = 20260930000400_job_pricing_mode.sql, RC = 20260930000500_radius_cap_3000.sql, NT = 20260930000600_needed_today.sql, RL = 20260930000700_running_late.sql, JS = 20260930001000_job_series.sql, DF = 20261003001000_deletion_fee_owed.sql, LV = 20261108000000_lean_v1.sql.

## 1. Edge functions (supabase/functions/<name>/index.ts, 9 folders; VERIFIED all rows)

verify_jwt per supabase/config.toml: stripe-webhook false (config.toml:411-421), create-payment true (423-428), connect-onboarding true (430-434), connect-status true (436-439), payment-methods true (441-446), connect-return false (448-459). No block for send-push, send-receipts, process-settlements (config.toml:402-409 comments say pg_cron wakes them with the service-role key); platform default for those is INFERRED true. Staging dashboard toggles: UNKNOWN.

| function | caller authentication (file:line) | secret compare | on failure | env names read | input validation |
|---|---|---|---|---|---|
| stripe-webhook | Stripe signature only: header read index.ts:140, verifyStripeSignature call index.ts:143-148; no JWT (verify_jwt false) | HMAC-SHA256 hex compared constant-time, hand-rolled XOR loop, length check first (verify.mjs:119-130); not `===` | 400 `invalid signature` (index.ts:153); 500 if env missing (123-126) | STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (index.ts:79-81) | no schema: `JSON.parse(rawBody)` cast to a type (156); event type allow-list (61-69, 163); event id required (167-168) |
| create-payment | platform verify_jwt true + `Authorization` must start with `Bearer ` (index.ts:181-184); no `auth.getUser`; the caller token is forwarded to RPC begin_job_payment / begin_tip_payment with the anon key (234-244), which checks the caller in SQL (SF:553 is_active_user, SF:562 client_id <> v_actor) | none | 401 (183); RPC refusal passed through as its 4xx else 500 (246-254); 400 on bad body (211, 216, 218-223); 402/409/502 on card paths | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (106-109) | manual: `jobId` truthy string (218, no UUID shape check); tip must be integer > 0 (209-213); `paymentMethodId` regex `^pm_[A-Za-z0-9_]+$` (222); no zod |
| connect-onboarding | platform verify_jwt true + Bearer prefix (index.ts:186-189); resolveCaller (146-175) calls RPC my_payouts_status as the caller through PostgREST (147-151); user id taken from the JWT payload `sub` by local base64 decode, signature not checked locally (jwtClaims 128-142, 164-168) | none | 401 (154, 167, 188); 500 (157, 277); 405 if not POST (182-184); 502 provider (227, 269) | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (62-65) | request body is never read; method check only |
| connect-status | same shape: Bearer prefix (index.ts:162-165), resolveCaller 128-151 (RPC my_payouts_status 129-133), jwtClaims 111-125, `sub` at 146-150 | none | 401 (136, 148, 164); 500 (139, 209); 405 (158-160); 502 (190) | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (45-48) | body never read |
| payment-methods | platform verify_jwt true + Bearer prefix (index.ts:112-113); callerId (69-74) GETs `${SUPABASE_URL}/auth/v1/user` with the caller token and reads `id` | none | 401 (113, 129); 400 (122, 125, 137); 404 card not on caller's customer (140); 502 (144, 151, 161); 500 (170) | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (30-33) | manual: action allow-list list/setup/remove (125); `paymentMethodId` regex (137); no method check; no zod |
| connect-return | none (verify_jwt false); see below | none | 405 JSON if not GET (index.ts:37-42) | none | one query value read, `refresh` (index.ts:44), compared `=== '1'` (page.mjs:105) |
| send-push | service-role compare `auth !== \`Bearer ${SERVICE_KEY}\`` (index.ts:221-222) | JavaScript string `!==` on the full header, NOT constant-time | 403 `forbidden` (223-226); 500 if env missing (211-216) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (56-57) | request not read; no method check |
| send-receipts | same compare (index.ts:223-224) | string `!==`, not constant-time | 403 (225-228); 500 env missing (215-220, checks only the two SUPABASE names) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, RECEIPT_FROM, RECEIPT_REPLY_TO, RECEIPT_TEST_TO, STRIPE_SECRET_KEY (57-64) | request not read |
| process-settlements | same compare (index.ts:441-442) | string `!==`, not constant-time | 403 (443); 500 env missing (433-436) | SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY (77-79) | request not read |

Notes (VERIFIED):
- Edge functions use plain `fetch` to PostgREST; no supabase-js. Every function that writes money state calls a service_role-only RPC (create-payment: get_payment_customer 271, set_payment_customer 293, attach_provider_ref 339, enqueue_payment_declined 414).
- STRIPE_API is `https://api.stripe.com` in 6 functions (e.g. create-payment index.ts:91).

### stripe-webhook details (VERIFIED)
- Signature: `Stripe-Signature` header (index.ts:140); raw body read once (133); verify runs before JSON.parse and before any write (143-153). verify.mjs accepts only `v1` candidates (87-90), requires `t` and at least one v1 (94-95), rejects when `now - t > 300 s` (96, TOLERANCE_SECONDS 50); a future timestamp is not rejected (verify.mjs:38-41 comment, no code line for it).
- Idempotency: the event id is stored as the primary key of payment_events by a POST (index.ts:175-186); HTTP 409 is tolerated and falls through to apply (187). apply_payment_event(p_event_id) is idempotent per id: returns `ok:true, already:true` if `processed_at` is set (CO:126-128), `ok:false 'unknown event'` if the row is missing (CO:124-125). Retry bound: MAX_APPLY_ATTEMPTS = 5 (index.ts:77); at or above it the function answers 200 `retrying:false` (225-228), otherwise 500 (230).
- Event types handled (index.ts:61-69): payment_intent.succeeded, payment_intent.canceled, charge.refunded, charge.dispute.created, charge.dispute.closed, transfer.created, transfer.reversed.
- Unknown type: answered 200 `{ok:true, ignored:type}` and NOT stored (index.ts:163-165).
- Database side: apply_payment_event is granted to service_role only (CO:244-245, same in SF:747-748). It resolves the payment row by `metadata.payment_id` from the event payload first (CO:~140-146).

### create-payment details (VERIFIED)
- Amount, job payment: not client-supplied. The function reads `payment.charge_amount_cents` from the row begin_job_payment returns (index.ts:256-259), refuses non-integer or <= 0 (265-268), and sends `amount: String(amount)` to Stripe (324). In SQL the base is `coalesce(final_amount_cents, budget_cents)` (SF:570), fees from job_terms (SF:572), job must be `assigned` with a worker (SF:566-568).
- Amount, tip: client-supplied integer `tipAmountCents` (index.ts:208-213, sent as p_amount_cents at 238). begin_tip_payment requires `p_amount_cents > 0` (SF:943), job `completed` and job payment released first (SF:945-950); the ceiling is the trigger enforce_tip_ceiling (SF:898-921, limit `least(tip_max_cents, round(base * tip_max_bps / 10000))` at SF:916).
- Customer ownership: userId = `payment.payer_id` from the RPC row (index.ts:258); the RPC inserts payer_id = the caller (SF:611-615) after `v_job.client_id <> v_actor` (SF:562). Stripe customer is read/created by service RPC keyed by that userId (271-301). Saved card: `card.body.customer !== customerId` or type not card returns 409 `no_saved_card` (365-367).
- Idempotency keys: `brazos-customer-${userId}` (284), `brazos-intent-${paymentId}` (329), `brazos-offsession-...` (398).

### connect-return details (VERIFIED)
- Auth-less, constant HTML: both pages are built only from literals plus the scheme constant `'brazos'` (index.ts:34, page.mjs:43-74); `payoutsHref` validates the scheme by regex (page.mjs:26, 37-40).
- Query reflection: none. `refresh` is compared with `=== '1'` to pick one of two constant pages (page.mjs:104-106); its value is never written into the HTML. The only interpolations are `title`, `body`, and `href`, all constants (page.mjs:52, 65-67, 69).
- Response headers `text/html; charset=utf-8`, `Cache-Control: no-store` (page.mjs:30-33), set via `new Headers(...)` (index.ts:48). The page contains `<script>location.href = "brazos://payouts?from=..."</script>` (page.mjs:69).

## 2. SECURITY DEFINER functions with authorization in the body

Scope: the 88 SECURITY DEFINER functions E1a section 4c lists as executable by authenticated, minus the 30 dropped by lean_v1 (VERIFIED: 83 `drop function` lines in LV; the 30 are accept_bid, create_bid, create_job_request, job_bid_count, job_bid_counts, my_pending_job_requests, respond_job_request (LV:87-93), set_job_property (LV:130), my_payouts_enabled (LV:137), account_deletion_enabled (LV:1073), live_card_state, register_live_activity (LV:77-78), match_workers_semantic (LV:50), phase68/69/70/71/72_*_enabled (LV:1090-1094), phase76_rls_posture (LV:1098), sandbox_authorize/hold/release/tip_worker/cash_out (LV:152-156), set_block, set_conversation_state, set_direct_thread_read_at (LV:21-23), start/update/stop_live_location (LV:11-13)). 58 remain. Definition = newest `create (or replace) function` found by grep across all 36 migration files. lean_v1 re-creates these of the 58: ban_user, job_payment_state, release_job_payment, cancel_job, delete_my_account, should_notify, unsend_message (read from LV).

"Caller check" = first line in the body that tests the caller. NONE = no auth.uid(), is_active_user(), admin or ownership test in the body that involves the caller. ACLs were not re-read from migrations; E1a section 4c is the ACL source. Write columns: only payments, jobs.status, jobs.assigned_worker_id, money columns noted; other tables named briefly.

| function | definition | first caller check | writes money / status |
|---|---|---|---|
| accept_legal_documents | B:209 | B:214 auth.uid(); null raise ~B:221 | legal_acceptances only |
| accept_offer | B:258 | B:267 `v_actor is null or not is_active_user()`; party B:283; turn B:298 | jobs.status='assigned', assigned_worker_id, accepted_offer_id, final_amount_cents (B:340-344); job_offers |
| account_deletion_blockers | DF:26 | DF:30 `select auth.uid() as uid` (no parameters) | none (read) |
| admin_open_reports | B:481 | B:494-496 `where exists (profiles p where p.id = auth.uid() and p.is_admin)`; sql function, non-admin gets zero rows, no raise | none |
| ban_user | LV:166 | LV:177-181 `if not exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin) then raise exception 'Only admins may ban users'` | profiles.banned; banned_phones; jobs.status='cancelled' (LV:203-206); payments refund_cents/transfer_cents set (LV:219-229), status 'voided' (LV:234-238); messages insert; reports.status |
| begin_job_payment | SF:543 | SF:553 is_active_user; client SF:562 | payments insert/update (SF:585, 597, 604, 611) |
| begin_tip_payment | SF:931 | SF:942 is_active_user; client SF:949 | payments insert/update (SF:968, 975, 980) |
| can_delete_own_job | B:796 | B:817 `v_client_id is distinct from auth.uid()`; B:820 is_active_user | none |
| cancel_job | LV:377 | LV:394 `v_actor is null or not is_active_user()`; role-to-reason match LV:406-411 | payments refund_cents/transfer_cents/status 'voided' (LV:451-496); job_disputes insert (LV:503); jobs.status='cancelled' (LV:510-515) |
| client_job_stats | R8:304 | NONE (arbitrary p_client_id; R8:329-341) | none |
| counter_offer | B:992 | B:1008 is_active_user | job_offers (B:1057, 1067); jobs.budget_cents (B:1079) |
| create_job | NT:57 | NT:84 is_active_user (auth.uid NT:80) | inserts jobs, status 'open' (NT:162-180) |
| create_offer | B:1387 | B:1404 is_active_user | inserts jobs (B:1524) and job_offers (B:1561) |
| create_review | R8:91 | R8:117 is_active_user; party R8:121-122 | reviews |
| current_fee | SF:133 | NONE (read of fee_schedule); also service_role | none |
| current_user_is_admin | B:1672 | evaluator, not a gate: `select exists (select 1 from profiles p where p.id = auth.uid() and coalesce(p.is_admin,false))` B:1676-1681; returns boolean, raises nothing; used by policies reports_select_admin B:7527 and reports_update_admin B:7531 | none |
| current_user_is_banned | B:1688 | evaluator: `select coalesce((select p.banned from profiles p where p.id = auth.uid()), false)` B:1692-1695 | none |
| decline_offer | B:1713 | B:1722 not-signed-in raise; party B:1726; turn B:1740 | job_offers.status (B:1744) |
| delete_my_account | LV:681 | LV:694 `v_user is null` only (no is_active_user); gate via account_deletion_blockers LV:709 | jobs.status='cancelled' for caller's own open jobs (LV:726-729); deletes auth.users row (LV:842); profiles scrub (LV:782-795); NO payments write |
| drop_series_worker | JS:868 | JS:879 is_active_user; worker match JS:883 | job_series only |
| get_my_active_mode | B:2205 | B:2210 auth.uid() in select | none |
| get_my_profile | B:2262 | B:2268 `where p.id = auth.uid()` | none |
| is_active_user | B:2317 | B:2321 `is_profile_active(auth.uid())`; also service_role | none |
| is_blocked_between | B:2332 | NONE (arbitrary a, b; B:2336-2339) | none |
| is_profile_active | B:2352 | NONE (arbitrary p_user; tests banned and deleted_at B:2356-2361) | none |
| job_hotspots | B:2409 | NONE (no auth/admin/ownership token in B:2409-2441; filters `status = 'open'` and `visibility = 'open_market'` B:2427-2428) | none |
| job_offer_count | B:2451 | NONE (arbitrary p_job_id; B:2455-2459) | none |
| job_offer_counts | B:2470 | B:2476 `where auth.uid() is not null` (signed in only) | none |
| job_payment_state | LV:270 | LV:277 `v_actor is null or not is_active_user()`; party LV:282-283 | none (row lock only, LV:291) |
| job_request_parties_ok | B:2636 | NONE for caller: B:2644 tests is_profile_active(p_a) and (p_b); function not dropped by lean_v1, its table job_requests is (LV:126); also service_role | none |
| jobs_in_cell | B:2655 | NONE (B:2655-2675); joins jobs to job_locations, selects no lat/lng column (B:2661-2662) | none |
| jobs_within_radius | RC:16 | NONE (no auth token in RC:16-45) | none |
| mark_direct_thread_read | B:2734 | B:2741 `v_user is null`; party filter B:2749 | direct_threads read_at only |
| mark_worker_arrival | B:2757 | B:2765 is_active_user; B:2773 `assigned_worker_id is distinct from v_user` | jobs.en_route_at, arrived_at (B:2780-2786); not status |
| messaging_unlocked | B:3027 | auth.uid() in filter B:3039, B:3050 (no raise) | none |
| my_payouts_status | CO:351 | CO:353 `where user_id = auth.uid()` | none |
| my_pending_offers | B:3099 | B:3116 `where o.awaiting_id = auth.uid()` | none |
| open_job_dispute | B:3705 | B:3715 is_active_user; client B:3727; job must be completed B:3730 | job_disputes insert (B:3752); no payments/jobs write |
| profile_review_summaries | RB:39 | signed-in guard described in comment RB:106 (guard line not read) | none |
| profile_review_summary | R8:231 | R8:281 `auth.uid() is not null` | none |
| profile_reviews | R8:167 | R8:205 `auth.uid() is not null` | none |
| quote_job_price | SF:160 | NONE (pure arithmetic over current_fee, SF:161-175); also service_role | none |
| register_push_token | B:4194 | B:4199 auth.uid() | push_tokens |
| release_job_payment | LV:334 | LV:341 is_active_user; client LV:343 | payments release_requested_at, release_reason, transfer_cents (LV:364-369) |
| report_running_late | RL:53 | RL:62 is_active_user; worker RL:70 | jobs.late_minutes, late_reported_at (RL:86-88); not status |
| review_is_revealed | R8:40 | NONE; E1a: also executable by anon | none |
| set_active_mode | B:4600 | B:4605 auth.uid(); null raise B:4607 | profiles (active_mode) |
| should_notify | LV:864 | NONE for caller: LV:878 tests is_profile_active(p_recipient), LV:887 (p_actor) | none |
| start_job_series | JS:165 | JS:176 is_active_user; client JS:184 | jobs.series_id (JS:215); job_series |
| stop_job_series | JS:801 | JS:812 is_active_user; client JS:816 | job_series.status='stopped' (JS:834) |
| transition_job_status | JC:113 | JC:130 `assigned_worker_id is distinct from v_user`; JC:133 is_profile_active(v_user) | jobs.status (JC:190); allowed: assigned->in_progress, in_progress->completed (JC:145-146); in_progress needs payment status 'held' (JC:155-158) |
| unban_user | B:5095 | B:5100-5104 `if not exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin) then raise exception 'Only admins may unban users'` | profiles.banned=false; banned_phones delete (B:5106-5107) |
| unsend_message | LV:1027 | LV:1035 auth null; LV:1040 is_active_user; sender LV:1052 | messages content/image_url/unsent_at |
| update_job_details | JPM:227 | JPM:254 is_active_user; client JPM:266; status must be 'open' JPM:269-270 | jobs budget_cents/budget_min/max, title etc. (JPM:349-362); not status |
| update_my_profile | B:5333 | B:5344 is_active_user (v_user B:5338); key allow-list B:5352-5355 (full_name, phone, avatar_url, bio, language, categories, accepting_work, availability_note) | profiles |
| withdraw_job_dispute | B:5461 | B:5469 is_active_user; `opened_by <> v_actor` B:5477 | job_disputes.status='withdrawn' (B:5488) |
| withdraw_offer | B:5505 | B:5513 not-signed-in raise; party B:5518; author B:5531 | job_offers.status (B:5535) |
| worker_job_stats | B:5553 | NONE (arbitrary p_worker; B:5559) | none |

Counts (VERIFIED): 58 rows. Caller check NONE: 13 (client_job_stats, current_fee, is_blocked_between, is_profile_active, job_hotspots, job_offer_count, job_request_parties_ok, jobs_in_cell, jobs_within_radius, quote_job_price, review_is_revealed, should_notify, worker_job_stats). Signed-in-only (`auth.uid() is not null`, no identity match): 4 (job_offer_counts, profile_review_summaries, profile_review_summary, profile_reviews). Rows writing payments: 5 (ban_user, begin_job_payment, begin_tip_payment, cancel_job, release_job_payment; delete_my_account writes none). Rows writing jobs.status: 5 (accept_offer, ban_user, cancel_job, delete_my_account, transition_job_status).

Rows in the brief's list that are not authenticated-executable per E1a (VERIFIED where read):

| function | definition | caller check | writes money / status |
|---|---|---|---|
| apply_payment_event | CO:114 | none in body; grant service_role only (CO:244-245) | payments update (CO:150-), payment_events processed_at (CO:231) |
| resolve_job_dispute | LV:576 | none in body (first test LV:589 is on the argument); `revoke ... from public, anon, authenticated` LV:675, `grant execute ... to service_role` LV:676 | payments refund_cents/transfer_cents/release (LV:628-666); job_disputes.status (LV:611) |
| refund_on_no_show_withdrawn | LV:552 (trigger function) | none; `revoke all ... from public, anon, authenticated` LV:574 | payments refund_cents = charge_amount_cents, reason 'no_show_withdrawn' (LV:568-571) |
| handle_new_user | B:2275 (trigger function, not recreated by lean_v1) | none; trigger `on_auth_user_created` after insert on auth.users created at LV:1198-1201 | profiles insert/upsert (B:2288-2298); reads phone from `raw_user_meta_data->>'phone'` (B:2280), client-supplied at sign-up; raises if phone in banned_phones (B:2282-2286) |
| report_user / report_job | not found: no function by these names in any migration (grep) | reports are written by direct table insert, lib/moderation.ts:171, policy reports_insert_own B:7523 | n/a |

### delete_my_account, partial-refund path (VERIFIED)
- Who can trigger: any signed-in caller whose `auth.uid()` is not null (LV:694). No is_active_user test in the body. Grant: `revoke all ... from public` and `grant all ... to authenticated` (LV:861-862).
- What it refunds: nothing. The lean_v1 body contains no payments write (LV:681-860). It is gated by account_deletion_blockers() (LV:709-713, error text `ACCOUNT_DELETION_BLOCKED`); a non-empty blocker list stops it.
- The partial refund lives in cancel_job, customer path, late cancellation: `transfer_cents = v_fee, refund_cents = v_charge - v_fee, release_reason 'cancellation_fee', refund_reason 'customer_cancelled_late'` (LV:482-489); free-cancel is a full refund (LV:477-481); worker cancel is a full refund (LV:492-496). Fee amount from cancellation_fee_cents(...) (LV:483). Same partial split in resolve_job_dispute when the worker wins a no-show (LV:645-650). partially_refunded as a deletion-gate state: DF:75, 86-92.

## 3. Phone auth (VERIFIED)

| item | fact (file:line) |
|---|---|
| Mode selection | `resolvePhoneAuthMode({configured: process.env.EXPO_PUBLIC_PHONE_AUTH_MODE, dev: __DEV__})` (lib/phoneAuth/index.ts:21-24); resolver lib/phoneAuth/mode.ts:35-73; provider switch index.ts:64-86 |
| Unset | dev build: `mock`; non-dev: `disabled` (mode.ts:40-42) |
| `mock` in a non-dev build | resolves to `disabled` with a config error message (mode.ts:44-52); guard is `__DEV__` only. INFERRED: preview and production EAS profiles are non-dev-client builds (eas.json:16-34 has no `developmentClient`; only `development` has it, eas.json:8), so `__DEV__` is false there |
| `supabase` | only an explicit value enables it (mode.ts:59-61) |
| Mode in EAS profiles | EXPO_PUBLIC_PHONE_AUTH_MODE is not set in eas.json (grep none); EAS dashboard environment values: UNKNOWN |
| Entry routes | only mode `supabase` shows the phone screens; otherwise email screens (mode.ts:85-91) |
| Mock provider | verify success returns `{status:'verified-mock', sessionAvailable:false}` (mock.ts:173), no Supabase session is created; mock code is random 6 digits (mock.ts:65) and exposed as `devCode` (mock.ts:101, 185) |
| Supabase calls | `auth.signInWithOtp({phone, options:{shouldCreateUser: intent==='sign-up', data:{full_name, phone} (sign-up only)}})` (supabase.ts:84-106); `auth.verifyOtp({phone, token, type:'sms'})` (supabase.ts:167-171). Email path: signUp (AuthContext.tsx:173), signInWithPassword (:189), resetPasswordForEmail (passwordReset.ts:27), updateUser (passwordReset.ts:44) |
| Verify requires a session | a 200 without `data.session` and `data.user` returns error (supabase.ts:177-179) |
| Attempt limit, value | `MAX_VERIFY_ATTEMPTS = 5` (types.ts:150) |
| Attempt limit, where enforced | mock mode only: counted at mock.ts:160-165. Supabase mode: no client count; `attemptsRemaining: null` (supabase.ts:216-218) and the comment says GoTrue enforces its own limit. Server values seen: E1a section 8 `[auth.rate_limit] token_verifications=30, sms_sent=30`, `[auth.sms] max_frequency=5s` (local config only; hosted values UNKNOWN) |
| Client 429 mapping | status 429, code `over_*`, or `too_many_requests` become `rate-limited` (errors.ts:77-78) |
| Resend cooldown, value | `RESEND_COOLDOWN_MS = 60_000` (types.ts:144) |
| Resend cooldown, where | client, in memory (`let pending`, supabase.ts:78): same-number request inside the window refused (supabase.ts:137-139), resend refused (supabase.ts:156-158); mock at mock.ts:131-132. Server side: E1a `[auth.sms] max_frequency=5s` local |
| Code length | `OTP_LENGTH = 6` (types.ts:141); digits-only check types.ts:165 |
| Profile backfill | after verify, `updateProfile(userId, {phone, full_name})` (index.ts:73-79); updateProfile calls RPC update_my_profile and falls back to a direct `profiles.update(patch)` when the RPC is missing (lib/profiles.ts:70-84) |

## 4. Client secrets and env (VERIFIED)

config/env.ts reads 7 names, all with the EXPO_PUBLIC_ prefix (config/env.ts:57-92 schema, 95-103 reads):

| env name | where used (file:line) |
|---|---|
| EXPO_PUBLIC_APP_VARIANT | lib/observability/sentry.ts:176, 204 |
| EXPO_PUBLIC_SUPABASE_URL | lib/supabase.ts:17 |
| EXPO_PUBLIC_SUPABASE_KEY | lib/supabase.ts:17 (only use) |
| EXPO_PUBLIC_PAYMENTS_MODE | lib/adapters/payments.ts:88 |
| EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (must start `pk_`, config/env.ts:80) | lib/payments/stripe.ts:129 (read through env), lib/adapters/payments.ts:88 via stripePublishableKey() |
| EXPO_PUBLIC_SENTRY_DSN | lib/observability/sentry.ts:171 |
| EXPO_PUBLIC_PHONE_AUTH_MODE | lib/phoneAuth/index.ts:22 (read from process.env directly, mode.ts comment lines 6-10 gives the reason); schema config/env.ts:92 |

Other env reads in the app tree: `process.env.APP_VARIANT` (app.config.ts:30, not EXPO_PUBLIC). eas.json sets only APP_VARIANT and EXPO_PUBLIC_APP_VARIANT per profile (eas.json:11-13, 21-23, 30-32, 42-44). Where EXPO_PUBLIC_SUPABASE_URL/KEY come from at build time: UNKNOWN (not in eas.json; EAS environments not readable).

`EXPO_PUBLIC_SUPABASE_KEY` is passed exactly once: `createClient<Database>(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_KEY, {...})` at lib/supabase.ts:17. A grep for `apikey|SUPABASE_KEY|supabaseKey|anonKey` over App.tsx, components, screens, lib, hooks, modes, navigation, config, ui, app.config.ts returned only lib/supabase.ts:17 and config/env.ts:68, 98. By use it is the client-library key (createClient); its value was not read. `.env` was not opened (`.env` is in .gitignore:59; `.env.example` exists, not read).

Secret-pattern grep over App.tsx, components, screens, lib, hooks, ui, modes, navigation, config, app.config.ts, eas.json (`_archive/` excluded):

| pattern | matches |
|---|---|
| sk_live, sk_test, rk_live, rk_test, pk_live, pk_test | none |
| eyJ | none |
| whsec_ | none |
| SG\.[A-Za-z0-9_-]{10,} | none |
| AC[0-9a-f]{32} | none |
| supabase\.co | none |
| SUPABASE_SERVICE | none |
| service_role | 1 match, a comment string: screens/ApproveOrDisputeScreen.tsx:312 (`resolve_job_dispute(), service_role only, run by the operator from`) |

Total secret-looking matches: 0 (one comment mention of the word service_role). app.config.ts:166-170 comment says the Sentry auth token is not in the file (SENTRY_AUTH_TOKEN lives in EAS); Sentry organization 'brazos-32' and project 'react-native' are in app.config.ts:182-186 (identifiers, not secrets). Expo/EAS project id in app.config.ts:189-191.

App calls to edge functions (client): create-payment (lib/payments/stripe.ts:198, 319), connect-onboarding (257), connect-status (281), payment-methods (lib/paymentMethods.ts:74); all via `supabase.functions.invoke`, which sends the user session token.

## 5. Sentry (VERIFIED)

| item | fact (file:line) |
|---|---|
| Init location | `initSentry()` at App.tsx:53; definition lib/observability/sentry.ts:168-217; `Sentry.init` at sentry.ts:174-206 |
| dsn source | `env.EXPO_PUBLIC_SENTRY_DSN` (sentry.ts:171); absent DSN returns without init (172) |
| sendDefaultPii | `false` (sentry.ts:180) |
| beforeSend | `scrubEvent(event)` (sentry.ts:205); scrubs message (137), breadcrumb message and data (139-145, deep, depth cap 6 at 104), exception values (147-152), `extra` (154); deletes `request.data` (156). Regex for email and long digit runs: sentry.ts:92 |
| beforeBreadcrumb | not set (NONE) |
| beforeSendTransaction | not set (NONE); scrubEvent is wired to beforeSend only |
| tracesSampleRate | `env.EXPO_PUBLIC_APP_VARIANT === 'production' ? 0.1 : 1` (sentry.ts:204) |
| enableAutoSessionTracking | true (sentry.ts:181) |
| enabled-in-dev flag | no `enabled` option in the init call (NONE); with a DSN set, init runs in every variant including development |
| environment | `env.EXPO_PUBLIC_APP_VARIANT` (sentry.ts:176) |
| release / dist | not set in `Sentry.init` (NONE). Tags set after init: updateId, channel, runtimeVersion (sentry.ts:214-216). Source-map upload plugin: app.config.ts:180-187 |
| setUser | only `setSentryUser(id)` sending `{ id }` (sentry.ts:225-227), called at lib/AuthContext.tsx:111; no email or phone set on the scope (grep over app dirs: no other setUser) |
| captureException call sites | 25 files carry `Sentry?.captureException(..., { extra: {site: ...} })` (e.g. components/AppErrorBoundary.tsx:65 sends `componentStack`); `extra` passes through the scrubber |
| Vendor load | Sentry is loaded in a guarded way and may be null (sentry.ts:85 `Sentry: SentryLike | null`) |

## 6. Storage (VERIFIED for app side; bucket flags from E1a section 7a, local only)

App references to buckets (all in lib/storage.ts; no other `.storage` use in App.tsx, components, screens, lib, hooks, modes, navigation, ui):

| call site | bucket | operation | URL type |
|---|---|---|---|
| storage.ts:4, uploadAsset 167-169, 176-177 | job-photos | upload (upsert true) for job photos (199), posting attachments `postings/<uid>/...` (246), review photos `reviews/<uid>/...` (260), completion video (339-360), posting video (370-) | `getPublicUrl(path)` (176-177), the returned public URL string is what gets stored |
| storage.ts:5, 188 | avatars | upload `<uid>/avatar.<ext>` upsert true | `getPublicUrl` (176-177) |
| storage.ts:6, 228-233 | chat-photos | upload `<jobId>/<uid>/<ts>.<ext>` | returns `storage://chat-photos/<path>` reference, not a public URL (storage.ts:172-174) |
| storage.ts:88-90, 123-125 | chat-photos | read | `createSignedUrl` / `createSignedUrls`, TTL 6 h (storage.ts:8) |
| storage.ts:213 | job-photos | `remove([path])`, path parsed from a `/object/public/job-photos/` URL (18-23, 211) | n/a |
| chat-audio, chat-documents | not referenced anywhere in the app tree (grep none) | n/a | n/a |

Per bucket, public flag from E1a section 7a + app read path:

| bucket | public flag (E1a, local DB) | how the app reads it |
|---|---|---|
| avatars | false | stored `getPublicUrl` string (storage.ts:176); no signed-URL call for avatars |
| job-photos | false | stored `getPublicUrl` string; no signed-URL call for job-photos |
| chat-photos | false | signed URLs, 6 h (storage.ts:88-90, 123-125); legacy http(s) value returned as-is if signing fails (storage.ts:68-70, 97, 138) |
| chat-audio | false | not used by the app |
| chat-documents | false | not used by the app |

Facts for the judge (VERIFIED): the public-URL path `/object/public/<bucket>/...` only serves bucket objects when the bucket is public; E1a shows public=false for avatars and job-photos locally. The staging bucket flags: UNKNOWN. lib/legal/privacyPolicy.ts:95-96 states "Job media files are currently stored in a public storage bucket, so someone with an exact file link could access them". lib/storage.ts:64-66 and 73-75 comments refer to a "phase29" private-bucket change. lean_v1 drops the chat-audio and chat-documents storage policies (LV:1189-1192); E1a section 7b lists them (pre-lean_v1).

## 7. Client-side money and direct writes (VERIFIED)

Money formatting and arithmetic outside formatBudget() / quote_job_price (grep of `* 100`, `/ 100`, `toFixed(2)`; comment lines excluded). `toFixed(2)`: no matches.

| file:line | what |
|---|---|
| lib/jobs.ts:803 | `Math.round(dollars * 100)` inside `dollarsToCents()` (form string to cents; defined at lib/jobs.ts:798) |
| lib/jobs.ts:807-818 | `formatBudget()`: `cents / 100`, `cents % 100`, toLocaleString |
| components/AmountPrompt.tsx:56 | `String(initialCents / 100)` (cents to form text) |
| components/PriceDropdown.tsx:185, 213, 220, 227 | `Math.round(validCents / 100)`, `typed / 100`, `validCents / 100`, `dollars * 100` into formatBudget |
| screens/PostJobScreen.tsx:353, 800, 805, 807, 859, 862, 864 | `x_cents / 100` into form fields |
| lib/jobFilters.ts:113-116 | `d * 100` price-filter option list |
| lib/payments.ts:115 | `workerTakeCents = amount_cents - platform_fee_cents` (both read from the payments row) |
| lib/payments.ts:143 | `brazosFeeCents = platform_fee_cents + (customer_fee_cents ?? 0)` |
| lib/earningsMath.ts:71 | `cents += job.budget_cents ?? 0` (sum of job budgets) |
| lib/compareBids.ts:90, 133 | amount_cents subtraction for sorting |
| lib/payments.ts:195 | the one `supabase.rpc('quote_job_price', {p_amount_cents})` call |

Not money: screens/ProfileReviewsScreen.tsx:306, lib/compareBids.ts:174, lib/profiles.ts:233, lib/workerSearch.ts:360 (percentages), screens/WorkerJobScreen.tsx:139, lib/storage.ts:306, ui/primitives/MediaUploader.tsx:46 (milliseconds).

Direct client writes (App.tsx, components, screens, lib, hooks, modes, navigation, ui):
- `.from('jobs')`: 12 call sites, all `.select(...)` (lib/jobs.ts:386, 408, 426, 657, 674, 703, 715, 741, 750, 911, 916, 923); plus lib/conversations.ts:176, 197 and lib/earnings.ts:53 (selects, not opened). One write: `supabase.from('jobs').delete().eq('id', jobId)` at lib/jobs.ts:624 (delete policy jobs_delete_own uses can_delete_own_job, B:7289). No `.from('jobs').update` or `.insert` anywhere.
- jobs.status and assigned_worker_id: no client assignment. `assigned_worker_id` appears only in reads and comparisons (e.g. lib/conversations.ts:22, 108, 111, 127; screens/CheckoutScreen.tsx:210; screens/WorkerJobScreen.tsx:193).
- `.from('job_offers')`: none. Offer reads go through embeds `job_offers!job_offers_job_id_fkey(count)` (lib/jobs.ts:703, 715, 750) and RPCs.
- Other direct table writes found: reports insert (lib/moderation.ts:171) and reports update `status: 'dismissed'` (lib/moderation.ts:224; policy reports_update_admin uses current_user_is_admin, B:7531); blocks insert/delete (lib/moderation.ts:64, 72); message_reads upsert (lib/conversations.ts:275); messages insert (lib/messages.ts:274); notification_prefs insert/update (lib/notificationPrefs.ts:95, 126); notification_outbox read_at update (lib/notifications.ts:52, 60); push_tokens update active=false (lib/pushNotifications.ts:303); worker_services insert/update/delete (lib/services.ts:63, 92, 101); profiles direct update fallback (lib/profiles.ts:80; used only when RPC update_my_profile is missing, profiles.ts:75-77). Blocks table: lean_v1 keeps `blocks` (not in its drop list); `set_block` is dropped (LV:22).
- Client-called RPC names (single-line `.rpc('name'` grep; multi-line calls such as cancel_job not captured, so this list is partial): worker_job_stats, job_offer_count, create_offer, withdraw_offer, withdraw_job_dispute, update_my_profile, update_job_details, unsend_message, unban_user, transition_job_status, stop_job_series, start_job_series, set_active_mode, report_running_late, release_job_payment, register_push_token, quote_job_price, profile_reviews, profile_review_summary, profile_review_summaries, open_job_dispute, my_pending_offers, my_payouts_status, messaging_unlocked, mark_worker_arrival, mark_direct_thread_read, jobs_within_radius, jobs_in_cell, job_payment_state, job_offer_counts, job_hotspots, is_profile_active, get_my_profile, get_my_active_mode, drop_series_worker, delete_my_account, decline_offer, current_user_is_banned, create_review, create_job, counter_offer, client_job_stats, ban_user, admin_open_reports, account_deletion_blockers, accept_offer, accept_legal_documents.

## 8. Dependabot

Command run as given. Output (VERIFIED, error):

```
{"message":"Dependabot alerts are disabled for this repository.","documentation_url":"https://docs.github.com/rest/dependabot/alerts#list-dependabot-alerts-for-a-repository","status":"403"}gh: Dependabot alerts are disabled for this repository. (HTTP 403)
gh: This API operation needs the "admin:repo_hook" scope. To request it, run:  gh auth refresh -h github.com -s admin:repo_hook
```

Alerts by severity: not available (alerts disabled for mahmudur-2/Brazos). npm audit was not run, as instructed.

## 9. Remaining UNKNOWNs

1. Local DB state after lean_v1: E1a was measured before lean_v1 (HEAD 72b6a30). Grants, RLS policy counts, function counts and storage policies need a re-measure on a stack with lean_v1 applied. Determine by running the E1a SQL again after `db:reset`.
2. Staging and hosted values: bucket public flags, GoTrue phone OTP attempt and rate limits, `enable_confirmations`, Sentry server-side scrubbing, cron rows. Determine by the operator reading the staging dashboard.
3. Edge function JWT toggles on staging (stripe-webhook and connect-return must be off; create-payment, connect-* and payment-methods on; the three service-key functions default). Determine by the operator reading the dashboard toggles.
4. EAS environment values (EXPO_PUBLIC_PHONE_AUTH_MODE, EXPO_PUBLIC_SUPABASE_URL/KEY, EXPO_PUBLIC_PAYMENTS_MODE) per profile; eas.json holds none of them. Determine by `eas env:list` run by the operator.
5. Whether a preview or production build ever has `__DEV__` true: INFERRED false from eas.json (only `development` has `developmentClient`); confirm by checking the built artifact.
6. apply_payment_event: only CO:114-150 and 124-128 were read; the handling of each of the 7 event types after line 150 was not read.
7. Not read in full: profile_review_summaries guard line (RB:106 is a comment), accept_legal_documents null raise line, set_active_mode write columns, job_hotspots/jobs_within_radius bodies (checked by grep for auth tokens only).
8. Client RPC call-site list is partial (single-line `.rpc('name'` grep only). cancel_job and others called on multiple lines are not in the section 7 list. Determine by a multiline search of `.rpc(`.
9. Policy WITH CHECK text for reports_insert_own (B:7523) and the current policy set after lean_v1 `alter policy` statements (LV:103) were not read in full.
10. `_archive/` folders were excluded from every grep.
11. Hidden other places `EXPO_PUBLIC_SUPABASE_KEY` could be passed (scripts, tests, workflows) were outside the brief's directory list.
