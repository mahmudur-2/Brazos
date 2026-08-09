# DECISIONS — autonomous run (phases 6–12)

Append-only log required by AUTONOMOUS_RUN.md §7/§8/§11. Newest entries at the
bottom of each section.

## Run preflight — 2026-08-09

- **Branch / HEAD:** `autonomous-6-12` @ `31a28db05f544f3c4e3ae1c263cde2280bd41fef`.
  Recovery tag `phase-5-known-good` confirmed present (also `phase-5`).
- **Tree state interpretation (§0.3):** no modified tracked files; two
  untracked files present — `AUTONOMOUS_RUN.md` (this run's own governing
  brief) and `prod_schema.sql` (the §6 schema dump staging was built from).
  Both are deliberate run infrastructure that predates the session, so
  "clean" was read as "no modifications to tracked files" rather than
  stopping the run because its own brief is untracked. Neither file was
  committed.
- **`SUPABASE_DB_URL_STAGING`:** present in the environment (§0.6 ✓),
  references the staging project only — verified by boolean containment
  check, value never printed.
- **`.env` cutover (user-directed, pre-run):** production `SUPABASE_URL` /
  `SUPABASE_KEY` commented out in place (preserved for post-run restore);
  staging URL and staging anon key written as the active values. The staging
  key was taken from the environment (`SUPABASE_ANON_KEY`, JWT `ref` claim
  verified = staging, `role=anon`) and was never printed — the file was
  assembled inside PowerShell. `.env` is git-ignored; nothing committed.
- **Baseline tests (§0.7, partial):** `npm run lint` (tsc strict) exits 0,
  clean. `npm test` ran once to completion; the visible output tail showed
  exactly the two documented pre-existing failures and no others:
  1. `tests/pwa.test.mjs` → "web build is installable and receives hosted
     runtime configuration" — expects `config.js?v=20260731-1`, page ships
     `-2` (frozen web surface).
  2. `tests/setupOnboarding.test.mjs` → "navigation only ever follows a
     successful write" — CRLF mis-slice matches `setPendingLanding(landing);
     onFinished(landing);` inside the sliced region.
  Exact pass/fail counts could not be re-captured (see HALT below); the
  Phase-5 close-out records 230/232 with these same two failures.
- **verify-schema baseline: BLOCKED** — see HALT.

## NEEDS REVIEW

- **Staging has no application-role privileges (diagnosed, repair written,
  NOT applied).** `prod_schema.sql` contains zero GRANT statements
  (privilege-stripped dump), and this project generation's default ACL for
  the `postgres` role grants only `Dxtm` (TRUNCATE/REFERENCES/TRIGGER/
  MAINTAIN) — no SELECT/INSERT/UPDATE/DELETE — to `anon`/`authenticated`/
  `service_role`. Every table loaded from the dump therefore denies DML
  through PostgREST (`verify-schema.mjs` control check: 401/42501 on
  `jobs`), and all 84 functions sit at bare default `EXECUTE to PUBLIC`
  instead of the phase32 explicit-grant posture. RLS itself is intact
  (policies came over with the dump).
  **Planned repair (§6-authorized, not executed):**
  1. `scripts/staging-acl-bootstrap.sql` (written this session) — restores
     the pre-hardening Supabase baseline grants + production-parity default
     privileges for future objects. STAGING ONLY.
  2. Replay all numbered `supabase/phase*.sql` migrations in numeric order
     via psql (idempotent by charter) so every explicit narrowing
     (phase29 profiles grants, phase32 function EXECUTE revocation, phase42
     `active_mode` privacy, phase50 payments seal) and every
     `grant execute` lands exactly as production history applied them.
     Skip the six production-era seed/demo-data files
     (`phase11_hotspots_demo_seed`, `phase22`, `phase23`, `phase24`,
     `phase27`, `phase28`) — they are data operations against accounts that
     do not exist in staging; §11 seed scripts are the sanctioned test-data
     mechanism.
  3. `node scripts/verify-schema.mjs` must then run green before any phase
     work commits.

## RUN HALTED — 2026-08-09 (before Phase 6 work began)

**Reason (§7.5-equivalent: staging unreachable for writes; run cannot be
validated):** the Claude Code auto-mode permission classifier denied the
commands the run depends on:

1. `psql … < scripts/staging-acl-bootstrap.sql` — denied twice (both `-f`
   and stdin forms). This is the only path for applying the ACL repair,
   the migration replay, and every future phase's migrations/seeds.
2. Subsequently, ordinary validation commands (`npm test` piped to a
   filter; `npm test` redirected to a file) were also denied,
   intermittently — the same `npm test` invocation had succeeded minutes
   earlier. §12's gates (tests, verify-schema) cannot be satisfied under
   intermittent denial.

Per the harness's own instruction ("If you believe this capability is
essential… STOP and explain"), the run halted at preflight rather than
building unvalidated work on top. No phase work was started; no commits
were made; the tree is as found plus: rewritten git-ignored `.env`
(staging), new `scripts/staging-acl-bootstrap.sql`, and this file.

**To resume:** grant the harness permission to run the blocked commands
(e.g. allow rules for `psql`, `npm test`, `npm run`, `node scripts/*` in
`.claude/settings.local.json`), or apply `scripts/staging-acl-bootstrap.sql`
plus the migration replay by hand, then re-invoke the run brief. Preflight
artifacts above remain valid.

## RUN RESUMED — 2026-08-09 (user re-invoked; psql now permitted)

### Standing addendum from the user (governs Phases 6–12)

1. **§H.1 enum decision, pre-authorized: DEFER the status enum migration.**
   "confirmed" stays derived as *assigned + held*. Every Phase 6–12 status
   read/write goes through ONE derivation helper (single source of truth) so
   the later enum migration is a one-file change. Do not halt for this.
2. **§7 gray zone narrowed:** halt ONLY if a decision is (a) irreversible in
   staging, (b) touches locked screens 01–07/48, or (c) would require reaching
   production. Everything else — including payment state, lifecycle status,
   and identity forks — decide, implement the reversible option, log under
   NEEDS REVIEW.
3. **Missing credential/external key:** mark the step SKIPPED with a NEEDS
   REVIEW entry and continue. Never halt waiting for a secret.
4. **Long context:** write durable state to BRAZOS_BUILD_STATE.md and
   DECISIONS.md before compaction and continue. Never stop to ask.

### Staging bootstrap — completed 2026-08-09

- **Windows psql quirk (operational):** native psql does not permute argv —
  options placed *after* the connection string are silently ignored (first
  attempt at the ACL bootstrap connected and did nothing). All psql commands
  in this run use `psql [options] -f file "$SUPABASE_DB_URL_STAGING"` with
  options first.
- `scripts/staging-acl-bootstrap.sql` applied; verified via
  `has_table_privilege` (authenticated SELECT/INSERT on jobs = t, anon USAGE
  on public = t).
- **Migration replay:** all `supabase/phase*.sql` in numeric order via
  `psql -f`, skipping the six production-era seed/data files per plan
  (phase11_hotspots_demo_seed, 22, 23, 24, 27, 28). Three final-state
  collisions repaired by dropping the dump-loaded object and letting the
  in-order replay rebuild it (repair SQL files kept in session scratchpad,
  not the repo — one-time staging fixes, not migrations):
  1. `conversations` view — phase9's original is narrower than the final
     shape; phase16/25/36 rebuild it via drop+create. Dropped, replayed ✓.
  2. `my_pending_job_requests()` — phase18's OUT row type differs from the
     phase46 final; phase36 drops+recreates. Dropped, replayed ✓.
  3. `portfolio_items_category_not_blank` — phase19's `add constraint` is
     unguarded (idempotency gap in a deployed file; not edited per charter).
     Dropped the identical dump-loaded constraint, replayed ✓.
- **`phase11_map_hotspots.sql` SKIPPED (additional, reasoned):** it reads
  `jobs.lat`, which phase12 drops. Replay-over-final-state cannot run it.
  Safe because phase12 redefines both of its functions (`job_hotspots`,
  `jobs_in_cell`) with identical signatures AND re-applies the identical
  revoke/grant lines — no durable side effect is lost. phase12 applied ✓.
- **`node scripts/verify-schema.mjs` → GREEN** ("All REQUIRED objects exist
  in the live database") against staging `.env`.
- **`scripts/rls-probe-offers.mjs`:** anon cases 3/3 PASS (job_offers 42501,
  bids 0 rows, payments 42501). Authenticated cases SKIPPED — staging has no
  auth users yet; phase-6 seed identities will make them runnable. Not
  treated as green; will be re-run once seeds exist.
  → Re-run after seeding: **6/6, probe clean** (recorded under Phase 6).

## Phase 6 — decisions (2026-08-09)

Commits: `30a20e1` (db) + the phase-6 closure commit; tag `phase-6`.

**Decided autonomously (§8 / addendum §2):**

1. **en_route/arrived are TIMESTAMPS on jobs, not statuses.** The addendum
   defers the §H.1 enum; two monotonic nullable columns are additive (old
   installed builds never read or write them → no §7.2 risk), and
   `lib/jobLifecycle.ts` derives the display states. The enum migration later
   swaps that one file.
2. **Arrival marks are NOT gated on the payment being held.** Blocking "I'm
   on my way" because the customer hasn't finished checkout punishes the
   wrong party; customer surfaces keep showing the funding truth separately.
3. **`job_disputes` is a NEW table, not an extension of `reports`.** The
   audit (05_DATA_AND_STATE_MODEL_PLAN) said "flag to user, don't guess";
   under addendum §2 this became mine to decide. `reports` is admin-facing
   moderation (no-show/unsafe/harassment); a dispute is a two-party payment
   freeze with its own lifecycle (open/withdrawn/resolved enum), a partial
   unique on open-per-job, and RPC-only writes. Extending `reports` would
   have overloaded its semantics and its existing admin surface. See NEEDS
   REVIEW below.
4. **No `completion_records` table.** The master plan says "if missing" —
   evidence already lives on jobs.completion_photos/videos (phase17/35) and
   installed builds write it through transition_job_status. A parallel table
   would violate the one-source rule for zero gain.
5. **Tip design:** kind='tip' payments row, born `released` (a gratuity has
   no escrow step), release-first gate (§9 ordering), one per job via the
   existing (job_id, kind) partial unique, $0.01–$1,000 sanity cap, fee 0.
6. **Auto-release surface:** `job_payment_state(job)` RPC — party-only read
   that performs the 72h check on the way (the repo's on-read pattern; no
   cron). Lifecycle screens read through it; `fetchJobPayment` (plain read)
   stays for surfaces where running the clock would be surprising.
   `completed_at` is stamped only from phase51 forward — pre-phase51
   completed jobs deliberately have no clock.
7. **Dispute resolution (status 'resolved') has NO writer this phase** — a
   human/admin step for a later phase. Withdraw-by-opener is the only unlock.
8. **Deliberate test changes (the Phase 3B precedent), itemised:** two
   Phase-5 guards in `tests/sandboxCheckout.test.mjs` asserted release could
   not exist at any layer — that WAS the Phase 5 invariant, and Phase 6's
   §9-authorized work is exactly what widens it. Updated: (a) checkout-copy
   assertion now expects the honest release explainer (approve → release,
   72h auto, dispute freeze); (b) "nothing can label money released" became
   "released wording only behind isReleased() over the ledger, read through
   job_payment_state" — pre-release surfaces (Checkout/JobConfirmed) keep the
   full ban. All other guards untouched; the 2 baseline failures' signatures
   are byte-identical to §0.
9. **Screen count kept low (§4 consolidation):** 34/35/55/58 stay on the two
   existing job screens (crosswalk already marked them COMPLETE); only
   33/36/37/56/57 got routes (5 new, all in MyJobsStack).

**NEEDS REVIEW:**

- **`job_disputes` vs extending `reports`** (decision 3 above) — reversible:
  the table is new and empty in production until phase51 is applied; if you
  prefer a unified reports model, the revert is one migration before apply.
- **Tip cap $1,000 and tip-born-released** (decision 5) — product numbers I
  chose; trivially adjustable in `sandbox_tip_worker` before production apply.
- **Worker-side legacy ReviewSection** (worker reviews the client at
  completion, pre-V2 feature) was left in place on WorkerJobScreen — §9's
  ordering governs the CUSTOMER's review; Phase 10 owns review policy.

**Production apply queue after this phase (in order, human step):**
`supabase/phase51_active_work_lifecycle.sql` — then
`node scripts/verify-schema.mjs` against production must show the phase51
group green. (The staging ACL bootstrap and seed scripts are STAGING-ONLY —
never run them against production.)

## Phase 7 — decisions (2026-08-09)

Commit: the phase-7 closure commit; tag `phase-7`.

**Decided autonomously (§8 / addendum §2):**

1. **Pre-hire chat lives on the PAIR thread (direct_threads), never the job
   thread.** A job thread is one room; pre-hire there are many bidders who
   must never see each other's words. The job-thread policies are untouched
   and re-proven against a bidder in phase7-proof §D.
2. **Thread auto-create is a TRIGGER on job_offers, not an edit to
   create_offer().** Every insert path (create, counter, future ones) gets
   the guarantee; the phase50 negotiation RPC bodies stay byte-identical;
   the trigger swallows its own failure so thread plumbing can never lose an
   offer. Backfill covers pairs whose pending offers predate it.
3. **Empty threads stay OUT of the inbox.** The conversations view still
   requires a message; the silent thread is reached from the offer surfaces
   (BidDetail / own-bid card). Rationale: a customer with ten bids must not
   get ten empty conversations. Trade-off recorded: until someone speaks,
   the pair's chat is only reachable from those surfaces.
4. **Screens 40/41/61/62 kept on the existing inbox/chat implementations**
   (crosswalk: COMPLETE). No template rewrite — that churn belongs to the
   Phase 13 sweep if anywhere. Master plan's "InboxScreen + ChatScreen
   templates" satisfied by the existing screens' behavior, not by rebuilding
   them; flagged here rather than silently reinterpreted.
5. **Chat registered in WorkerHomeStack + MapStack** under the existing
   "registered alongside JobDetail in every stack that mounts it" rule
   (the SubmitBid/BidSent precedent) — the worker's own-bid chat entry can
   never hit an unregistered route.
6. **Quick replies:** two fixed sets (worker/customer) with one source
   (chatTemplatesForMode); QuickReplies reads useMode(). No per-job or
   payment-state templating — words, not status claims.

**NEEDS REVIEW:**

- **Decision 3's trade-off** — if product wants bid-pair conversations
  visible in the inbox BEFORE the first message ("Say hello" rows), that is
  a one-view change (conversations LEFT JOIN messages) plus inbox
  null-handling; deliberately not done to avoid inbox flooding.
- **CUSTOMER_CHAT_TEMPLATES wording** — four lines I wrote; trivially
  editable in lib/messages.ts.

**Production apply queue after this phase (in order, human step):**
phase51, then phase52, then verify-schema green against production.

## Phase 8 — decisions (2026-08-09)

Commits: the two phase-8 commits; tag `phase-8`.

**Decided autonomously (§8 / addendum §2):**

1. **The §10 leak is closed AT THE SCREEN, not at call sites.** JobDetail
   (registered in the shared Map/MyJobs stacks) checks ModeContext and
   delegates customers to MarketJobPreview; SubmitBid refuses customer mode
   itself. Rationale: a screen-level guard cannot be bypassed by any present
   or future navigation path, needs zero call-site edits, and matches the
   "perspective comes from ModeContext" rule. No identity/ModeContext/
   navigation architecture was changed — per §10 this is NOT a §7 fork.
2. **MarketJobPreview is a component JobDetail renders, not a new route.**
   Route consolidation (§4): same route, mode-guarded content; the preview
   cannot be deep-linked around because it IS the job route in customer mode.
3. **Filters are client-side over already-fetched feeds** (lib/jobFilters
   pure model). No new DB indexes: feeds are already bounded lists and the
   filter runs in-memory; DB-side filtering can ride a later phase if feed
   sizes demand it. The no-budget-survives-a-floor rule and the
   no-budget-never-best-paying sort rule are deliberate honesty choices.
4. **phase41 radius RPC kept, and proven rather than trusted** — the DoD's
   "radius correctness against seeded data" is phase8-proof against
   controlled 2/4/20-mile fixtures, including a catalog check that the RPC's
   row type exposes no raw coordinates.
5. **DEFERRED — map swipe-card rework (19/49):** the hotspot/cell flow is
   real, device-proven, and platform-split (HotspotMap.web.tsx is on the
   frozen web surface). A pannable-map + swipe-card rebuild is high-churn UI
   against absent mockups with a frozen-surface hazard. The leak half (map →
   job in customer mode) IS closed via MarketJobPreview; grid/radius
   agreement is proven in phase8-proof §C.
6. **DEFERRED — Rebook 08 as a screen:** its natural entry points (Customer
   Home 07) are LOCKED, and hire-again already exists on bid cards, chat and
   completed jobs. Folded into Phase 9's SavedWorkers 46 surface.
7. **DEFERRED — Explore services 17 as a distinct screen:** locked Home's
   category chips + WorkerSearch({category}) already cover the product
   surface; a separate grid screen would have no reachable entry point.

**NEEDS REVIEW:**

- Deferrals 5–7 above are product-scope judgment calls; each is reversible
  as an additive later slice.
- MIN_BUDGET_PRESETS ($25/$50/$100) and the JobFilterSheet control set are
  numbers/controls I chose; trivially adjustable.

**Production apply queue after this phase:** unchanged — phase51, phase52
(Phase 8 shipped no migration).
