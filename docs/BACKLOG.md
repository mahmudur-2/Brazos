# BACKLOG — the only place unscheduled work lives

Append; never dispatch from chat memory. A dispatch that needs an item reads it from here.

## v1 bugs
- $92.50 worker take shown as $100 on job cards (wrong cents column)
- "APPROVED · PAYOUT ON ITS WAY" missing from ApproveOrDispute report-form copy
- Stripe sandbox account named "Brazos sandbox" — rename before launch
- Stripe publishable test key appeared in terminal output — roll at convenience

## v1.2 (after ten real users)
- Instant payouts · Live Activities · Instant Book · automatic recurrence
- Per-screen UI Studio generalised from dev-tools/HomeDesignStudio
- Android as a shipping target — decide with real data after ten users.

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
