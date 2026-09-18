# BACKLOG — the only place unscheduled work lives

Append; never dispatch from chat memory. A dispatch that needs an item reads it from here.

## v1 bugs
- $92.50 worker take shown as $100 on job cards (wrong cents column)
- "APPROVED · PAYOUT ON ITS WAY" missing from ApproveOrDispute report-form copy
- Stripe sandbox account named "Brazos sandbox" — rename before launch
- Stripe publishable test key appeared in terminal output — roll at convenience
- ~~Customer Home: every Live Nearby card, the poster's own job included ("Your job" chip), runs browseOpenJobs() and offers the worker-mode switch instead of opening the client job detail — screens/HomeScreen.tsx OpenJobCard onPress. Found by the E2E run of 2026-09-02. Fix: isOwn → navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job }). App change, needs a rebuild. FIXED by n5 (lib/ownJobCard.ts, tests/ownJobCard.test.mjs).~~ CLOSED 2026-09-17 by run home-plus-and-your-jobs: n5 fixed the poster's own card; this closes the rest of the line, because the section is gone — Nearby left the customer Home and "Your jobs" took its slot, so no card on that screen offers the worker-mode switch any more (tests/ownJobCard.test.mjs asserts `browseOpenJobs` appears nowhere in the file). Nearby is untouched on Discover and in worker mode.
- ActionSheet's rows are one element on iOS: `components/ActionSheet.tsx` wraps the whole sheet in two Pressables — the full-screen backdrop (`onPress={onClose}`) and the card (`onPress={() => {}}`) — and Pressable is `accessible` by default (react-native 0.81.5, `Pressable.js:245`), so on iOS each is an accessibility element whose label folds every child's text (`RCTView.m`, `RCTRecursiveAccessibilityLabel`) and whose children are not exposed. VoiceOver reads the [ + ] creation sheet as a single element and cannot activate a row; XCUITest sees the same. The E2E walk of 2026-09-02 on build 9f3ecf3a matched `.*My jobs.*` to that whole-sheet element and tapped its centre — the scrim — which closed the sheet without navigating, dropped the customer onto Home and produced the mode-switch prompt the first line above records. Read from the source by E2E4, to be confirmed by its rerun's failing line. Fix: `accessible={false}` on the backdrop and card Pressables (the rows keep their own). App change, needs a rebuild; until it lands the walk stops at the sheet.
- Star rating has no VoiceOver label: `components/StarRating.tsx:36-44` — each star is a Pressable holding only an Ionicons glyph, carrying a `testID` (`review-star-N`) and no `accessibilityRole` or `accessibilityLabel`, so on iOS its folded label is the glyph character and VoiceOver cannot say which star it is. The E2E walk reaches the fifth star by its id, so E2E6 (2026-09-02) made no app change for it. Fix: `accessibilityRole="button"` and an `accessibilityLabel` of the form "N stars" on the star Pressable — accessibility props only. App change, needs a rebuild. FIXED by n5.
- Bare ScreenHeader back chevron has no VoiceOver name: `components/ScreenHeader.tsx` — with `backLabel` unset, the back control is a Pressable holding only an Ionicons chevron glyph and carrying no `accessibilityRole` or `accessibilityLabel` (both are set only on the labelled "Back to …" variant), so VoiceOver cannot name it and the Maestro walk taps it by position (E2E7, 2026-09-02: point 6%,11% on the pinned 393×852; the E2E6 run 01a06545 hierarchy showed it as an unlabeled element at [12,81][38,108]). Fix: `accessibilityRole="button"` and `accessibilityLabel="Back"` on the bare chevron Pressable in `components/ScreenHeader.tsx` — accessibility props only. App change, needs a rebuild; ride with the next app touch together with the Home own-job card and the star labels. FIXED by n5.
- process-settlements transfers to any payee with a `stripe_account_id`, never reading `payment_accounts.payouts_enabled`: `supabase/functions/process-settlements/index.ts`, `runTransfers()` (`:242`) looks the batch up as `payment_accounts?select=user_id,stripe_account_id` (`:255-259`) and leaves in the queue only a payee with no account at all (`:280`, "payee has no connected account yet"), while `connect-status`'s own header (`supabase/functions/connect-status/index.ts:16`) describes `payouts_enabled` as what process-settlements reads before it transfers — the gate the comments describe is not implemented. With a half-onboarded account (Connect account created, `stripe_transfers` not yet active) it fires a refused transfer every five-minute cron tick and rotates the idempotency key each time (`tr:${row.id}:${row.transfer_attempts}`, `:300`): `transfer_attempts` climbed 0→4 on job `E2E 1788411215398` on 2026-09-03 before the capability went active, and the fourth landed (E2E8, operator-read). Fix: filter the batch account lookup on `payouts_enabled = true` and count the rest as blocked, the way the no-account case already is. Money code — its own run and its own revert boundary; no flow or app change.
- Setup mode race: a user who finished Setup with "Find work" landed in the customer tree, because `hooks/useSetupStatus.ts` and `hooks/useLegalGate.ts` both flip to 'loading' inside a `useEffect` and so still answered from their signed-out branches ('complete' / 'accepted') for the one render in which the user first appears, which let `App.tsx`'s RootNavigator drop its loader and mount MainTabs for that commit. `navigation/ModeShell.tsx` armed the resolution and `modes/ModeProvider.tsx` resolved and stamped the user with no landing parked yet, so the 'work' landing `screens/SetupScreen.tsx` parked a moment later was never consumed and the server-side `active_mode` decided the tree. FIXED by m1 `bfb8e0c`. BEFORE walk: MAESTRO RED 01a07320-6419-7e1a-b440-8913e9184e5d, `Assertion is false: "Search for jobs or areas" is visible` — the bug reproducing on the unfixed build be257242-4fef-4e62-8cfe-0f3797c5d115. AFTER walk: money_walk GREEN, 21m56s, EAS run 01a07330-a127-7c91-9bc0-cb256c3355d1, build 1ffe5205-ced7-4e1f-a740-61d99f0e4324 (confirmed by the operator from eas workflow:runs, 2026-09-05).
- auto-release liveness gap — `auto_release_due_payments()` releases a stripe row only when a `notification_outbox` row of type job_completed has status 'sent' (`supabase/migrations/20260905000000_stripe_foundation.sql` lines 829-836); that row is enqueued under category 'job_updates' (baseline lines 3406-3416), `enqueue_notification()` inserts nothing when `should_notify()` is false (baseline lines 2035-2037), and `should_notify()` is false under a block, a mute, or job_updates off (baseline lines 4867-4894: the block at 4868, the mute at 4871-4876, the job_updates arm at 4889); a row that is inserted resolves 'skipped' with no push token (`supabase/functions/send-push/index.ts` line 117, `p_status: 'skipped'`) and otherwise 'sent' or 'pending' (lines 195-201: the comment at 197-198 names 'failed', but the code at 199 writes `delivered ? 'sent' : 'pending'`, and `claim_notification_batch` simply stops claiming a row at attempts >= 5, baseline line 859 — nothing at HEAD writes 'failed' to the outbox, so an undeliverable row stays 'pending' for ever). So a customer without push permission, with job updates off, or who muted or blocked the worker can hold a completed job's payment indefinitely. fix scheduled: n3. **FIXED by n3 — migration `20260930000100_auto_release_told_gate.sql`, pgTAP `supabase/tests/110_auto_release_gate.sql` (`1de76c5`, 2026-09-04): the 72-hour clock accepts any terminal outbox status, an unconditional fallback releases at 7 days, and job_completed rides the always-on `jobs` category, which a preference, a mute or a block never suppresses.**

## v1.2 (after ten real users)
- Instant payouts · Live Activities · Instant Book · automatic recurrence
- Per-screen UI Studio generalised from dev-tools/HomeDesignStudio
- Android as a shipping target — decide with real data after ten users.
- List surfaces still read the legacy mixed aggregate (`profiles.rating_avg` / `rating_count`), left alone by R8b-c on its D7 (a per-card RPC per row is not acceptable): WorkerSearchScreen result cards, SavedWorkersScreen rows, CompareBidsScreen and `components/OfferCard.tsx` via `lib/compareBids.ts` (`knownRating` and the §5.4 ranking), and `lib/workerSearch.ts` scoring; `lib/profiles.ts` keeps the columns in its select for them. Needs a batch per-role summary function — a schema run. The batch function LANDED by n6 - profile_review_summaries (migration 20260930000200_reputation_batch_summary.sql; pgTAP supabase/tests/120_reputation_batch.sql); the client repoint is n7. The client repoint LANDED by n7 (tests/legacyAggregateFence.test.mjs proves no app code reads the columns).
- Retire `recompute_profile_rating` / `profiles.rating_avg` / `profiles.rating_count` once the remaining readers above are gone — a schema run. The R8b-c pre-read confirmed the trigger counts UNREVEALED reviews of BOTH roles: its aggregation is `where r.reviewee_id = target` (both the `count(*)` and the `avg(r.rating)` subqueries in `recompute_profile_rating()`, baseline:4126), with no reveal predicate and no role split — which is why no displayed number may come from these columns. After n7 the readers are gone; what remains is the schema retirement itself. Parked (night1 planner, 2026-09-04): after n7. Ruled in 2026-09-05 as a5-rating-retire (AFTER-N8) and then SKIPPED by plan-a because readers remain after n7: match_workers_semantic() (supabase/migrations/20260901000000_baseline.sql lines 2855-2984 - its RETURNS TABLE carries rating_avg and rating_count, the body selects p.rating_avg / p.rating_count at 2916-2917 and weighs them into final_score at 2965-2966), the worker-search edge function that maps that result (supabase/functions/worker-search/index.ts lines 410-437), supabase/tests/020_lifecycle.sql line 241 (asserts rating_count moved) and scripts/lifecycle-proof.mjs lines 360-361. The retirement waits on a schema run that first moves match_workers_semantic's rating term onto profile_review_summaries and drops the two return columns (the edge function follows), then retires the trigger, the function and the columns - a destructive migration the staging pipeline stops for the operator.
- ProfileReviews page title renders the viewing user's first name instead of the profile owner's ("Mahmudur's reviews" shown on Mahmudur Worker's profile) — the wrong person's name on screen. Found on the R8b-c device walk, 2026-09-01.
- Profile header says "2 completed" while the reviews page says "2 reviews" — two different counts rendered as if the same fact (completed jobs vs revealed reviews). Pick one label per fact. Found on the R8b-c device walk, 2026-09-01.
- ReviewSection tail from R8b-d: the dead `prompt` prop still passed by ClientJobDetailScreen, ReviewAndTipScreen, WorkerJobScreen — remove from all four files; the submitted-card note and comment placeholder still print the full name; dedupe the "NO LONGER RENDERED" comment if it really is doubled. One small client run, next touch.
- Web app: the full BRAZOS experience in a browser, same Supabase backend so everything stays in sync (Uber Eats-style customer and worker web). Phone-in-a-browser first, desktop layout later. Needs a web checkout path (Stripe's native library is iOS/Android only), web branches for camera, push, maps and share, clean hosting config, a domain. After TestFlight and ten users; scope change on paper before any run.
- E2E staging rows cleanup (title prefix E2E) — every run of `.eas/workflows/e2e-ios.yml`, green or partial, leaves a job titled `E2E <timestamp>` with its bid, agreement, payment and review on staging, by decision (`docs/DECISIONS.md` 2026-09-02, D11: no cleanup). A purge by title prefix, once the rows get in the way.
- Parked (night1 planner, 2026-09-04): waiting-state facts and nudges — notified count, expected first-bid time, 1 h and 24 h nudges. Ruled 2026-09-05 (R5) as display-layer work and SKIPPED by plan-a: each part needs data the client does not have - the notified count is a count over other users' notification_outbox rows (recipient-scoped RLS; a new RPC), the expected first-bid time is an aggregate over completed jobs (a new RPC), and the 1 h / 24 h nudges are scheduled writes (a new outbox type and a cron). Not built, not approximated.
- Parked (night1 planner, 2026-09-04): posted-price choice at posting. Ruled in 2026-09-05 -> run a3-posted-price-schema, a4-posted-price-client (docs/DECISIONS.md 2026-09-05 entry (2)). Schema LANDED by a3 (migration 20260930000400_job_pricing_mode.sql, pgTAP supabase/tests/130_job_pricing_mode.sql); the client is a4. Client LANDED by a4 (lib/pricingMode.ts, components/EditBudgetDialog.tsx, screens/PostJobScreen.tsx; tests/pricingMode.test.mjs).
- Parked (night1 planner, 2026-09-04): the data layer and typed client (would reverse D-11).
- Parked (night1 planner, 2026-09-04): payout ETA copy on Earnings. Ruled in 2026-09-05 -> run a6-payout-copy (MONEY, its own revert boundary): the approved-payout state made reachable on Earnings (release_requested_at joins the earnings select) and the release clock stated on a held row; a bank-arrival ETA is SKIPPED - the client has no payout-schedule data (payment_accounts carries none; D-15 leaves payout.paid unhandled), so it would be invented. LANDED by a6 (lib/earningsCopy.ts, lib/earnings.ts, screens/EarningsScreen.tsx, tests/earnings.test.mjs); the bank-arrival ETA stays SKIPPED.
- Parked (night1 planner, 2026-09-04): bids-so-far and time-since-posted card facts. Ruled in 2026-09-05 -> run a2-home-attention for the one card missing a fact: Home's Nearby card (screens/HomeScreen.tsx OpenJobCard) carries the bid count and no posted-ago line. Census 2026-09-05 - already carrying both: components/HubCard.tsx (timeLabel plus the bid subtitle and next-action line), screens/ClientJobDetailScreen.tsx (lines 511 and 569), components/WorkerJobCard.tsx (lines 92 and 189; the compact variant omits posted-ago by master 43's drawing), components/BrowseJobCard.tsx (lines 129 and 134), screens/JobDetailScreen.tsx line 689 and components/MarketJobPreview.tsx line 77. LANDED by a2 (screens/HomeScreen.tsx OpenJobCard; lib/homeAttention.ts and tests/homeAttention.test.mjs carry the attention section).
- Parked (night1 planner, 2026-09-04): a support and contact channel (needs the domain, side backlog 7). Ruled in 2026-09-05 -> run a1-support-contact (brazosmvp@gmail.com as a mailto row on the profile's Settings list; the domain stays side backlog 7). LANDED by a1 (lib/appLinks.ts SUPPORT_EMAIL, screens/ProfileScreen.tsx, tests/supportContact.test.mjs).
- Parked (night1 planner, 2026-09-04): counter-offer cap review. Ruled 2026-09-05: the cap stays 10 (lib/offers.ts MAX_COUNTERS_PER_SIDE); closed, no run.
- Parked (night1 planner, 2026-09-04): an "Available this week" label in worker results. Ruled 2026-09-05 (R5) as display-layer work and SKIPPED by plan-a: worker results (screens/WorkerResultsScreen.tsx) list JOBS on components/WorkerJobCard.tsx, and the only availability facts the client holds are profiles.accepting_work (a present-tense "taking new work" flag, shown as AVAILABLE NOW on Worker Home) and availability_note (free text); "this week" needs an availability calendar (docs/BRAZOS_TARGET_ARCHITECTURE_v3.md section 4.2 item 2, v1.1). Not built, not approximated.
- Parked (night1 planner, 2026-09-04): an interactive launch-block bypass check.

## Side backlog (moved from Claude memory 2026-08-30)
1. `job-photos` and `avatars` buckets are public with permanent unauthenticated URLs — batch with MEDIA1; do not fix via the dashboard "Remove policy" button
2. MEDIA1: `useCaching: true`, one-year `cacheControl`, ≤1600px downscale, poster frames; needs `expo-image-manipulator` and `expo-video-thumbnails` (not installed)
3. Supabase Pro deferred to the launch gate
4. Production burned ~2 GB cached egress with no users — diagnose before launch (frozen web surface, old TestFlight build, or crawlers on public bucket URLs)
5. CI cannot run the 120-test guard suite on ubuntu-latest (G-002) — a green badge is not evidence the guards ran
6. Nominatim is called directly from phones — server-side proxy with caching before real user volume
7. Buy a domain — App Store privacy-policy URL and Stripe business-website field
8. Offline cache should be an allowlist — the job draft holds the private service address in plain device storage
9. Legal: confirm Stripe Connect terms explicitly shelter the held-in-protection mechanic
10. Post-launch engineering, none gating the first paid job: durable job queue, Stripe reconciliation runbook line, allowlist error logging, backup restore drill, operator audit log
11. 72h auto-release cannot prove the customer was notified — Expo push ticket ≠ delivery; receipts carry error codes that must be handled
12. UNVERIFIED (from a ChatGPT review): `send-push` receipt handling, `translate` rate limiting, inline embedding refresh in `worker-search` — verify before acting
13. `payouts_enabled` ≠ identity verification — no copy may claim "ID-verified workers" from that flag
14. Tax as a first-class price component, compatible with all-in display
15. .easignore — mirror .gitignore fully first (EAS ignores .gitignore when .easignore exists); saves ~25 s of upload per run.

## Verify landed — answered by R7 (2026-08-31) from the repository alone
Read as text: no SQL was executed and no database was contacted, local or remote. Verdicts are LANDED (the path and the function or table that proves it), PARTIAL (what holds and what does not, both cited) or NOT LANDED (the empty grep, or the code that shows the opposite). A PARTIAL is never rounded up. Each answer that is not LANDED names the KIND of work that would close it — nothing here schedules that work.

- Agreement snapshot row written at offer acceptance (both parties, scope text, price and every component incl. a zero tax line, policy version) — was it in R4's migration?
  - **LANDED.** `supabase/migrations/20260905000000_stripe_foundation.sql` §7: `create table public.job_agreements` (line 400), written by `public.snapshot_job_agreement()` (line 449) through the trigger `jobs_snapshot_agreement` (line 483) — `after update of accepted_offer_id on public.jobs ... when (old.accepted_offer_id is null and new.accepted_offer_id is not null)`, the edge `accept_offer()` produces, with `on conflict (job_id) do nothing`. Every component the question names is a NOT NULL column: both parties (`customer_id`, `worker_id`), scope text (`category`, `title`, `description`), price and its components (`agreed_price_cents`, `customer_fee_cents`, `worker_fee_cents`, `tax_cents`, `total_cents`), policy version (`fee_schedule_id` referencing `public.fee_schedule`). The zero tax line is written rather than omitted: `supabase/tests/030_payments.sql` §12 asserts `a.tax_cents = 0` and `a.fee_schedule_id = (select f.id from public.current_fee() f)` on the marketplace hire, and repeats price, both fee sides and tax on the direct-offer hire. `030_payments.sql:170` asserts zero jobs hired without a snapshot on the stack; §12 also proves immutability (`job_agreements_immutable`) and party-only reads.

- Transfer reversal clears `released_at` (status and timestamp agree) — fixed in R4/R5?
  - **LANDED.** The live definition of `apply_payment_event()` is the one in `supabase/migrations/20260915000000_connect_onboarding.sql` (line 114), which replaces the R4 body whole; both carry the same branch. On `transfer.reversed` the status goes `released` back to `held` (connect_onboarding line 165) and `released_at` is set to `null` (line 189) in the same UPDATE, so status and timestamp agree; `transfer_ref` is cleared with them (line 192). Proven by `supabase/tests/030_payments.sql` §6 — "the reversal: status held, released_at null, transfer_ref null, release_requested_at PRESERVED, transfer_reversed_at set".

- Transfer reversal does NOT re-open `release_requested_at` (double-pay path) — fixed in R4/R5?
  - **LANDED**, and closed at three independent points. (1) The reversal branch never assigns `release_requested_at` at all — it is absent from the UPDATE SET list, deliberately: "a reversal PARKS the row. release_requested_at is PRESERVED (the customer release button must not re-open — a second real transfer)" (`20260915000000_connect_onboarding.sql:194`, the same text at `20260905000000_stripe_foundation.sql:713`); `transfer_reversed_at` is stamped instead. (2) `release_job_payment()` returns the row unchanged whenever `release_requested_at is not null`, and raises on a parked row (`transfer_reversed_at is not null`) — `20260905000000_stripe_foundation.sql:771` and `:780`. (3) The parked row is out of the `transfers_due` view (`:866`) and out of `payments_release_queue_idx` (`:278`), so R5 cannot pick it up; `supabase/functions/process-settlements/index.ts:300` keys each transfer `tr:<id>:<transfer_attempts>`, and only `resolve_job_dispute()` clears the park, incrementing that counter (`:1471`). Proven by `supabase/tests/030_payments.sql` §6: "the parked row is ABSENT from transfers_due", "the customer second release call changes nothing on a parked row", and the resolve that clears the park and moves the key to `tr:<id>:1`.

- R4 reconciled with the `payments` table that already existed in staging rather than creating fresh?
  - **LANDED.** `public.payments` is created once, at `supabase/migrations/20260901000000_baseline.sql:2519`. R4 widens it and never replaces it: `20260905000000_stripe_foundation.sql` §2 is headed "Ledger widening — EXTEND public.payments, never replace it" (line 183) and is one `alter table public.payments add column if not exists ...` of sixteen columns (line 195) plus a generated `charge_amount_cents` (line 217). The reconciliation is explicit twice — it drops and recreates the constraint BY THE LIVE NAME rather than the planned one ("DIVERGENCE (D2): §5.2 drops payments_provider_check; the live constraint is payments_provider_known", line 185), and it leaves the existing unique index alone on purpose ("payments_one_active_per_job_kind ... is UNCHANGED, on purpose", line 265). No migration file holds a `create table` for `payments` other than the baseline.

- The three app.json fixes rode R1's app.config.ts rewrite: no `UIBackgroundModes: ["location"]`, no `NSLocationAlwaysAndWhenInUseUsageDescription`, `supportsTablet: false`, runtimeVersion policy = `appVersion`?
  - **LANDED**, all four clauses, and `app.json` no longer exists at all. `app.config.ts:75` is `runtimeVersion: { policy: 'appVersion' }`; `app.config.ts:85` is `supportsTablet: false`. Neither `UIBackgroundModes` nor `NSLocationAlwaysAndWhenInUseUsageDescription` is a key anywhere in the file — the only hit for either string is the comment at `app.config.ts:92` recording that they are "BOTH GONE, and they were removed together because they were one request", with live location shipping foreground-only by decision rather than by omission.

- Authorization proofs cover every client-writable table plus location, messages and money, as anon / owner / assigned worker / losing bidder / unrelated user (R3b) — any table missing?
  - **LANDED**, closed by R7b (2026-08-31); it was PARTIAL when R7 wrote it. The census: every table in `supabase/migrations/` (the seven files a `db reset` applies) that a client role can INSERT, UPDATE or DELETE — a write grant to `authenticated`, or an RLS policy `for insert` / `for update` / `for delete` reaching it — set against the subjects of `supabase/tests/040_authz.sql` (`plan(537)`, the cast declared at its lines 6-10). All nineteen are proven: seventeen were at R7, and R7b wrote the two that were not. Nothing is skipped — `040_authz.sql` contains no pgTAP SKIP.
  - **Client-writable, WITH authorization proofs in `040_authz.sql`** — table · client write privilege · section · the identities the proof runs as:
    - `messages` · ALL · §7 · owner, assigned worker, losing bidder, unrelated stranger, anon
    - `message_reads` · ALL · §7 · assigned worker, owner, losing bidder, unrelated stranger
    - `message_reactions` · ALL · §7 · assigned worker, owner, losing bidder, unrelated stranger
    - `job_checklist_items` · ALL · §9 · assigned worker, owner, losing bidder, unrelated stranger
    - `notification_prefs` · ALL · §13 · owner, worker (as the victim of the cross-user write), anon
    - `notification_outbox` · UPDATE of `read_at` only · §1 + §13 · owner, assigned worker, unrelated stranger, anon
    - `push_tokens` · ALL · §13 · assigned worker, unrelated stranger, anon
    - `legal_acceptances` · ALL · §13 · owner, unrelated stranger, anon
    - `saved_workers` · ALL · §13 · owner, unrelated stranger
    - `mutes` · INSERT + DELETE · §13 · unrelated stranger, the muted party, losing bidder
    - `blocks` · INSERT + DELETE · §13 · unrelated stranger, the blocked party, losing bidder, anon
    - `properties` · ALL · §13 · owner, unrelated stranger
    - `portfolio_items` · ALL · §13 · assigned worker, unrelated stranger, losing bidder
    - `worker_services` · ALL · §13 · assigned worker, unrelated stranger, anon
    - `reports` · ALL · §16 · owner, unrelated stranger, anon, admin
    - `jobs` · DELETE only, INSERT and UPDATE revoked · §1 + §15 · owner, assigned worker, unrelated stranger, anon
    - `conversations` · a `security_invoker` VIEW the dump grants ALL · §7 · owner, unrelated stranger, anon — reads only; it is derived, not a write surface
    - `bids` · DELETE only, INSERT and UPDATE revoked · §1 + §4a · the bidding worker, the job's client, the losing bidder, unrelated stranger, anon (R7b)
    - `storage.objects` · ALL, to `authenticated` AND to `anon` · §18 · owner, assigned worker, losing bidder, unrelated stranger, anon (R7b)
  - **The two R7 left open, and what R7b found** — the answer to "any table missing?" is now "none":
    - `bids` — `authenticated` holds **DELETE** (`20260901000000_baseline.sql:7813`) with RLS enabled and **no `for delete` policy**, so the command is default-denied. PROVEN in `040_authz.sql` §4a on one row — the worker's winning bid on `j_live` — as five identities: the bidding worker, the job's client, the losing bidder and an unrelated stranger each issue `delete from public.bids where id = <the bid>` and touch **zero rows**, and anon is refused outright at the grant (`42501`, `permission denied for table bids`). Each attempt is bracketed by a positive control: the row is read before it (by the two identities a SELECT policy admits) and re-read by the runner after it. Five identities, zero deletions. The catalog is recorded rather than inferred — `policies_are` lists the six policies and none is FOR DELETE, `table_privs_are` records the DELETE grant for `authenticated` and its absence for `anon`. `bids` is the LEGACY projection maintained from `job_offers` by phase47/48, not the live write surface; its three PUBLIC-role "workers insert/update own bids" policies are dead letters with no grant behind them, and it retires with the compatibility shims.
    - `storage.objects` — `grant all` to **both** `authenticated` and `anon` (`20260901000000_baseline.sql:8640-8641`), so RLS is the entire boundary. The policy count is **fifteen, of which ten are writes** — six INSERT, one UPDATE, three DELETE — not the twelve R7 recorded; the catalog is the authority and `040_authz.sql` §18 reads it. PROVEN in two halves. Catalog: `policies_are` names all fifteen, `policy_cmd_is` and `policy_roles_are` pin each of the ten write policies to its command and to `authenticated` alone, `table_privs_are` records that anon and authenticated both hold every privilege, and RLS is asserted enabled. Behaviour: across all five buckets the authorized identity writes and every other identity is refused (`42501`, `new row violates row-level security policy for table "objects"`) — the worker's own avatar folder, chat photos and voice notes inside `j_live`, a document in the owner-worker pair thread, and the three `job-photos` paths (`postings/<uid>/`, `<job>/` for the assigned worker, `reviews/<uid>/`). Two reads are recorded as deliberate rather than as findings: `avatars_read` and `job_photos_read` carry no ownership clause, so avatars and job photos are readable by every authenticated account by design. anon holds every grant and can write nothing and read nothing. One genuine surprise: **direct SQL DELETE is refused for every identity**, including the row's own owner, by storage's `protect_objects_delete` trigger (`storage.protect_delete`) — `42501`, `Direct deletion from storage tables is not allowed. Use the Storage API instead.` The three `job_photos_delete_*` policies are therefore unreachable from SQL and are exercised only through the Storage API; §18 asserts the refusal for owner, worker and stranger and names the trigger, so the fence speaks if that ever changes.
    - The bucket ROWS are storage data, not schema, so the schema-only baseline carries none and the behaviour half had nothing to sit on. `supabase/seed.sql` now creates the five the policies name, all private. That also closes the conditional skip in `supabase/tests/phase29_security_contract.sql:60` — its "neither chat-media bucket is public" assertion now runs instead of skipping. `npm run db:reset` must precede `npm run db:test`.
  - Location, messages and money are proven on the revoked side: `job_locations`, `job_offers`, `payments`, `profiles`, `reviews`, `job_disputes`, `direct_threads`, `conversation_states`, `live_location_shares`, `job_requests`, `banned_phones`, `areas` and `worker_semantic_docs` are each asserted unwritable by grant AND refused by a real statement in `040_authz.sql` §1, with a positive control beside each refusal. `job_agreements`, `fee_schedule`, `app_config`, `payment_events`, `payment_accounts` and `job_completions` are revoked from `authenticated` in their own migrations and sit outside the client-writable set.
  - The work that closed it was **a test file**, exactly as R7 predicted: pgTAP assertions added to `supabase/tests/040_authz.sql` (§4a and §18, `plan(460)` → `plan(537)`, 77 assertions) plus five bucket rows in `supabase/seed.sql`. No migration, no grant change, no policy change and no application change — R7b altered nothing about what the database permits, only what the suite proves about it.

## Parked tangents
- Naming / branding · voice modes · hardware monetisation · Codex switch · Idiolect

## Analytics — what is still not emitted, and the caveats on what is (R7D, 2026-08-31)

R7D closed the R7D backlog item this section used to be. Of the five events R7C left
unwired, **three no longer exist**: `worker_onboarded`, `job_viewed` and `bid_viewed` were
removed from `FunnelEvent` rather than wired, because the reasons they had no call site
were reasons they should not have been names. What remains is two events that are
deliberately server-side, one union arm nothing can call yet, and three caveats that make
a number mean less than it looks like it means.

### Still unwired, and not to be wired from the client

- **`payment_held`** — webhook-caused. Stripe lands the hold, and the phone can be
  backgrounded or killed when it does, so a client caller would under-count silently. NOT
  to be wired from the client: the union carries that note directly above the variant, so
  a later run reads it before touching it. If this number is wanted, it belongs to the
  webhook function, server-side.
- **`payment_released`** — webhook-caused, same reason, same note above the variant.

### Removed rather than wired

- **`worker_onboarded`** — removed. Its definition was an unmade product decision (profile
  complete, services listed, Stripe Connect finished are three different numbers), and the
  Connect reading is already measured under its own name by
  `connect_onboarding_completed`. A third overlapping name is what makes a funnel
  unreadable a year later. Profile completeness is a server column and can be counted
  there, without an event.
- **`job_viewed`** and **`bid_viewed`** — removed. Both are reads. A view belongs in an
  exposure ledger in the DATABASE, with a rank position, so that "seen" can be joined to
  "bid on" per position — which is the question an impression number is actually asked.
  A client event cannot carry rank and cannot be reconciled against anything. Whoever
  builds that ledger decides where a view begins (a card scrolling past, the detail screen
  mounting, a dwell threshold); nothing in the app should re-add these names first.

### Uncalled arm of IntentEvent

- **`permission_result` with `kind: 'photos'`** — no surface asks for it. Nothing in the
  app calls `requestMediaLibraryPermissionsAsync`; every library pick goes straight to
  `launchImageLibraryAsync`, so on iOS the system picker handles its own access and there
  is no answer for the app to read. The arm stays in the union because the day a surface
  does ask, the event should already have a name.

### Caveats — three numbers that mean less than they look like they mean

- **`connect_onboarding_completed` re-emits.** A worker who taps refresh twice on an
  already-enabled account emits it twice: it is read off the `connect-status` call, which
  is the only thing that moves the stored state, not off a stored flag. Deduplicating
  would mean inventing client-side state a fresh launch forgets anyway. **The count means
  "times a completed status was observed", not "workers onboarded"** — do not divide it by
  anything without dedupe on the analytics side.
- **Both abandonment events are FLOORS, not truths.** `job_post_abandoned` and
  `offer_compose_abandoned` fire from an unmount cleanup, so an app killed mid-form never
  reports one. Read them as "at least this many people opened it and left", never as an
  abandonment rate. On the posting screen this is the same kill that leaves the persisted
  draft in place, so the two facts have one cause.
- **`job_post_started` counts fresh posts only.** PostJobScreen is also the edit form and
  the Hire Again request form; neither is a post being started, and counting them would
  put rows already in the database at the top of the funnel.

### Not counted anywhere, on purpose

- **Tips.** Neither `checkout_started` nor `checkout_result` counts a tip sheet — a tip is
  not a step in post → bid → accept → fund. `lib/payments/stripe.ts` keeps a set of the
  payment ids that belong to a job checkout so the two events measure the same population;
  without it the second could report a success rate above 100%.
- **The frozen web surface.** `components/HotspotMap.web.tsx` raises the same location
  permission as its native sibling and emits nothing, because product work never modifies
  the web surface.
- **Speech recognition.** `lib/voiceSearch/provider.ts` asks for a microphone permission,
  which is not one of the four kinds `permission_result` names. Adding a fifth arm would
  widen a taxonomy that was just narrowed on purpose; if voice search matters enough to
  measure, that is a decision with a dated entry behind it.

## R8b — the blind window leaks everywhere except the table (found on device 2026-08-31)

One bug family, three surfaces. R8a made the reviews TABLE double-blind — the reveal is
computed at read time by `review_is_revealed()`, D1 of the 2026-08-31 R8a decisions in
`docs/DECISIONS.md` — and the table honours it. Every surface that reaches a review, or a
rating derived from one, by some other path still shows what the blind window is there to
hold back. All three were found on the operator's phone during the Gate 1 device walk of
2026-08-31. They are DEFECTS in the reputation surface, not out-of-scope features: none of
them goes under v1.2, and R8b — the client surfaces — is the run that repoints these
readers, as the R8a entry already said it would.

1. `notify_on_review` (baseline:3620) writes "… left you 5★." to the reviewee at INSERT time, so the notification carries the rating before the reveal condition is met. Seen on the phone, 2026-08-31.
2. ProfileScreen's reviews link is gated on `profiles.rating_count` — the legacy mixed aggregate R8a deliberately left alone — so the header shows a rating the page below cannot show. **DONE — R8b-c `00798d3` (2026-09-01):** the own-profile surfaces read the per-role revealed summaries; the link gate sums both roles' totals, so a customer-only account reaches its reviews; the star shows the worker role's `shown_average` or "New", never the aggregate.
3. ProfileReviewsScreen never passes `p_role`, so it always reads the WORKER reputation. A customer's own profile reads "No reviews yet" while a customer-role review exists. Confirmed on the phone, 2026-08-31. **DONE — R8b-c `35bc905` (2026-09-01):** every `ProfileReviews` param list requires a `role` (no default — a missed call site is a type error); the own-account entries pass `'both'`, which opens on worker unless only the hiring side has revealed reviews and adds the Work / Hiring toggle.
4. `would_again` is never asked. R8a's D5 captures it per review and `create_review` takes `p_would_again`, but `components/ReviewSection.tsx` — the only review form, hosted by `screens/ReviewAndTipScreen.tsx` and the job screen — holds rating, comment and photos only, and `createReview` in `lib/reviews.ts` sends five arguments with no `would_again` among them. Both rows from the 2026-08-31 walk are NULL by construction, not because the reviewer skipped. D5 is unimplemented on the client; `client_job_stats`' `would_again_yes` / `would_again_total` can only ever count zero until R8b-c adds the question. **DONE — R8b-c `a159312` + `35238fe` (2026-09-01):** `createReview` carries `wouldAgain` through to `p_would_again` and ReviewSection asks the question on all three hosts — a clearable Yes/No pair under the stars; skipping stays a legitimate NULL, no validation, no Skip control.

## Parked — operator decisions, not runs

Neither item is authorized by any prompt until it carries a dated `docs/DECISIONS.md` entry.

- A read-only staging Postgres role for runs. Connection string lives in `%LOCALAPPDATA%` only, never in the repository, never in `.env`, read-only forever. Needs its own dated DECISIONS.md entry BEFORE any run uses it.
- The reveal fires no notification. Once R8b-s lands, a reviewee whose review is still blind is told a review exists without its rating — correct — but when the counterpart review or the 7-day clock later reveals it, nothing tells them. The reveal is computed at read time with no cron and no reveal column (R8a D1), so there is no event to hang a notification on; a fix needs either a new notification type (which `screens/NotificationsScreen.tsx`'s icon map and its pinning test would have to learn) or a scheduled sweep. Out of scope for R8b-s by design.
