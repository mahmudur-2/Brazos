# BRAZOS_BUILD_STATE
Updated: 2026-08-09 (ULTRACODE pre-review hardening run complete on branch
`pre-review-hardening`; tags `pre-hardening` → `hardening-fixes` →
`hardening-polish`. NOT Phase 13 — Phase 13 remains human-led and untouched.
See DECISIONS.md "ULTRACODE pre-review hardening run", PROD_APPLY.md for the
production queue incl. phase57/58, and REVIEW_GUIDE.md for the device pass.
New standing proofs: scripts/lifecycle-proof.mjs (18/18 backend integration)
and scripts/seed-review.mjs (every lifecycle state seeded at once).
Phases 6–12 record below unchanged.)

## Current phase
Phase 12 — Notifications (screen 42). **BUILT AND PROOF PASSED (4
assertions).** Discovery: phase20 had already built the whole pipeline
(notification_outbox with dedupe + prefs-gated enqueue, triggers on
messages/status/negotiation/reviews/nearby, push_tokens, and a no-op
delivery — nothing sends, honestly). phase56 turns those SAME rows into the
recipient's in-app feed: read_at + recipient-only SELECT + UPDATE revoked
then read_at column-granted back (proven: delivery columns refuse);
should_notify recreated minus ONLY the push-token gate (every pref/mute/
block/ban gate byte-identical) so events land in the feed without a device;
two missing Phase-6 events wired (payment released → payee, dispute opened
→ worker, both deduped). NotificationsScreen (ProfileStack + Profile row):
feed, unread count, mark one/all read, tap-through into the SHARED
MyJobs/Messages tabs — identical in both modes, so no silent mode switch
exists or is needed (§F). The old phase20 verify checks flipped to
sealed-probes (the outbox is no longer anon-readable — deliberate).
Gate: tsc/lint clean, 269/271 (same 2 baseline failures, +5 guards),
verify-schema green, phase12-proof 4 PASS zero-residue. Physical: Profile→
Notification feed after any Phase 6/7 walk — rows appear, unread dot
clears, taps land.

Previous:
Phase 11 — Earnings & money surfaces (59+60 consolidated). **BUILT AND
PROOF PASSED (5 assertions).** phase55 on staging: payments.paid_out_at +
sandbox_cash_out() (payee-only sweep of released rows → paid_out; zero rows
= empty set, repeat = no-op by construction). lib/earningsMath.deriveEarnings
is the PURE wallet: pending=held, available=released, transferred=paid_out,
fees summed from the same rows (0, matching checkout) — §G's
no-hand-kept-balance rule, unit-executed in node. EarningsScreen (ProfileStack
+ Profile row): three buckets, the fee line, the per-job/tip ledger with
honest per-status wording, simulated cash-out behind the adapter with a
consequences dialog; "sandbox / simulated" stated wherever money could be
misread. Proof: wallet sums the payee's own rows only, outsider sees zero,
payer's sweep sweeps nothing, sweep keeps released_at + leaves held
untouched + repeats as no-op. Gate: tsc/lint clean, 264/266 (same 2 baseline
failures, +3 guards incl. the executed pure math), verify-schema green incl.
phase55. Physical: Profile→Earnings after the Phase 6 walk — buckets match
the walk's ledger; cash out flips Available→Transferred.

Previous:
Phase 10 — Reviews & reputation (SMALL). **BUILT AND PROOF PASSED (7
assertions).** The audit's real finding: the DoD ("one review per completed
job enforced in DB") was ALREADY true — phase29 revoked direct INSERT and
create_review() enforces party/completed/counterparty; the phase6 unique
constraint gives one-per-job; the recompute trigger keeps rating_avg/count
in sync (proven moving 0→1, avg 5.00). phase54 adds defense-in-depth: the
INSERT policy now states the full rule so the table stays honest even if a
future migration re-grants INSERT. New reliability signal: cancelled counts
in fetchClientJobStats, rendered on the poster card only when non-zero.
Review+tip flow and §9 ordering unchanged from Phase 6 (re-guarded). Gate:
tsc/lint clean, 261/263 (same 2 baseline failures, +3 guards),
verify-schema green incl. phase54 sentinel, phase10-proof 7 PASS
zero-residue (incl. direct-insert-stays-revoked). Physical check rides the
Phase 6 checklist's review/tip steps; no new taps needed.

Previous:
Phase 9 — Profiles, portfolio & worker self-service. **BUILT AND PROOF
PASSED (8 assertions); physical pass PENDING.** phase53 on staging:
worker_services (owner-managed, drafts owner-only, NULL price = "Ask for a
quote" never $0), saved_workers (private to the saver BOTH directions),
portfolio_items.published (drafts; default true so installed builds
unchanged), profiles.accepting_work/availability_note (column-granted,
written only through the widened update_my_profile allowlist). Screens:
ServicesPricing (64+66 consolidated: services manager + availability toggle
+ honest no-KYC verification), SavedWorkers (46 + Rebook 08 fold-in, in
ProfileStack with WorkerProfile/PostJob riding along), PaymentMethods (45,
honest sandbox — no fake cards), WorkerProfile gained availability/services/
save sections. Avatar failure-safety verified pre-existing. Deferred:
PortfolioProject 24 (single-photo items make a story screen empty — revisit
when multi-photo projects exist). Gate: tsc/lint clean, 258/260 tests (same
2 baseline failures, +6 guards), verify-schema green incl. phase53,
phase9-proof 8 PASS zero-residue. Physical checklist: seed phase-6 then
scripts/seed-phase-9.sql; walk Profile→Services & availability (add/draft/
publish/price), Casey views Wren's profile (sees published only, saves
Wren), Saved & past workers (rows, Hire→PostJob prefilled), toggle
"taking new work" off → Casey sees the truth line.

Previous phase:
Phase 8 — Discovery breadth. **BUILT AND PROOF PASSED; physical pass
PENDING** (2026-08-09, autonomous run). No schema change — the phase41
Haversine radius RPC was kept and PROVEN correct against controlled fixtures
(phase8-proof: 5mi/25mi boundaries, true distances ±0.25mi, no raw
coordinates in the RPC's declared row type, grid/radius agreement). Built:
**the §10 leak closure** — JobDetailScreen now delegates customer-mode
viewers to the new customer-safe MarketJobPreview (EST. PRICE, approximate
location, zero worker vocabulary — guarded by test) and SubmitBid refuses
customer mode at the screen, so no navigation path renders worker surfaces
to a customer; **worker job filters (screen 50)** — lib/jobFilters pure
model + JobFilterSheet over WorkerResultsScreen (categories, budget floor
with the no-budget-survives rule, newest/pay/distance sorts, badge, clear).
Deferred with reasons: map swipe-card rework, Rebook 08, Explore-services 17
as distinct screens (see DECISIONS). See "Phase 8 — what was built".

Phase 7 — Messaging: closed (tag `phase-7`), proof 10 PASS; physical pass
PENDING. phase52 offer-scoped pre-hire chat (trigger + backfill), chat
entries on both offer surfaces, mode-specific quick replies.

Phase 6 — Active-work lifecycle slice: closed (tag `phase-6`), automated
proof 28 PASS; physical pass PENDING. phase51 on staging. Built: arrival
tracking, checklist, disputes with release freeze, sandbox_release_job_payment,
72h on-read auto-release, tip, screens 33/36/37/56/57 over 34/35/55/58.
`lib/jobLifecycle.ts` is the ONE lifecycle derivation point (run addendum §1)
— the §H.1 enum stays deferred and "confirmed" stays derived as assigned +
held. See "Phase 6 — what was built".

Phase 5 remains AUTOMATED-PROOF PASSED / physical pass pending, unchanged —
its checklist below still stands for the user's device session. The Phase 6
checklist chains onto the same seeded accounts.

Previous phase context (Phase 5 session record) follows unchanged: phase50
applied and verified (sandbox payments ledger over the pre-repo scaffold
table, withdraw_offer, 7-day offer expiry, expiry gates in all four
negotiation RPC bodies). OfferComposer is the one offer-terms form (52
Submit Bid and 30 Counteroffer render it whole; the hire wizard — 26's
device-verified entry — shares its amount field and validation). New
screens: SubmitBid/BidSent (worker), CompareBids/BidDetail/Counteroffer/
Checkout/JobConfirmed (customer). Accept flows into a sandbox protected
checkout over a phoneAuth-pattern PaymentProvider adapter; the ledger
stops at `held` — no release path exists at any layer. Withdraw + expiry
are live on the worker bid card, the chat thread card, and server-side.

Proof lines, exactly as the brief requires:
- **AUTOMATED TWO-ACCOUNT PROOF: PASS** — scripts/phase5-proof.sql, 27
  PASS assertions A–G as three real identities through RLS, single
  transaction, ROLLBACK, zero-residue verified (see "Phase 5 — automated
  proof" below).
- **PHYSICAL TWO-DEVICE CONFIRMATION: NOT RUN** — no device this session.
  The tap-by-tap checklist is under "Phase 5 — physical two-device
  checklist".

Phase 4 — Post-a-job slice is **PASS / CLOSED** (2026-08-09): the user
physically verified the two-device post→discover→open pass and approved
closure at the start of this session.

Phase 3 — Data foundation remains **PASS / CLOSED** (2026-08-08), unchanged
this session:

- **Migrations phase43–48 all applied and verified.** `verify-schema.mjs`:
  **131 OK, 0 MISSING, 0 PENDING**, exit 0. Each phase's checks flipped from
  PENDING to OK on their own via its sentinel — the mechanism cannot report a
  missing object as passing.
- **RLS probe: 5 passed, 0 failed, 0 skipped**, "RLS probe clean."
- **Device regression Parts 1 and 2: PASS** on a real device.
- **Shim + projection harness: PASS**, six checks.

Next exact task once Phase 5's device verification is done: Phase 6 —
Active-work lifecycle slice. See "Exact next task".

## Phase log
- [x] 0 audit · commit `2aec323` · Repository audit executed per §B; two
  deliverable docs produced (`SCREEN_CROSSWALK.md`, `DESIGN_SYSTEM_STATUS.md`),
  executive summary rewritten with KEEP/FIX/CONSOLIDATE/REMOVE/ADD, all VERIFY
  tags resolved, `verify-schema.mjs` run clean, `f3e75d0` evaluated (needed,
  not obsolete, not cherry-picked — see Known issues). Zero application-code
  changes.
- [x] 1 design system · commits `13af291`, `8f0738c`, plus this closure commit ·
  `ui/tokens.ts` + 17 primitives + 4 templates + dev catalog. Locked screens
  byte-identical; shared brand values proven unchanged. **PASS** — manually
  verified on a real Expo iOS device by the user: typography/spacing/colors,
  buttons/inputs, chips/segmented tabs/status pills, ListRow/Avatar/
  RatingStars/Skeleton, StepHeader/MediaGrid/Sheet, EmptyState + all five
  template states, bottom scroll/nav clearance — no clipping, overflow,
  safe-area, font, or layout regressions observed.
- [x] 2 mode/nav · commits `e8cbb92`, `1696ec3`, plus this closure commit ·
  ModeProvider + switchMode(), typed Customer/Worker trees, ModeShell +
  ModeGuard, phase42 migration (applied + verify-schema green), BottomNav +
  JobCard primitives, six-screen safe-area fix. **PASS** — manually verified
  by the user: schema applied and confirmed via `verify-schema.mjs` (not a
  SQL Editor message), real Expo device mode-switch checklist all green (see
  Phase log entry below / "Manual verification" section for the checklist
  covered).
- [x] 3 data · commits `0e230bf` (3A), `93a457f` (3B), `9d70845`+`1ff341d`
  (phase47), `15555fe`+`391c6c9` (phase48), `51e5c38` (device-pass fix),
  `2069bcd` (RLS probe), plus this closure commit · `bids` + `job_requests`
  unified into `job_offers`; six migrations applied and verified; offer RPCs +
  RLS; app retargeted onto `lib/offers.ts`; `bids`/`job_requests` frozen, not
  dropped. **PASS** — verify-schema 131 OK / 0 PENDING, RLS probe 5/5, device
  regression Parts 1+2 on a real device, shim/projection harness 6/6. Decision
  doc: `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md`.
- [x] 4 post · commits `083b2d6`, `65d3a69`, `529fa0e` (tag
  `phase-4-post-slice`) · Two sessions: AsyncStorage draft + MediaUploader,
  then phase49 + wizard steps 2–4 + screens 16/51/39/38. **PASS — CLOSED
  2026-08-09**: the user ran the physical two-device post→discover→open
  pass and approved closure at the start of the Phase 5 session.
- [ ] 5 hire · **FULL SCOPE BUILT, AUTOMATED PROOF PASSED, not closed**
  (2026-08-09, one autonomous session) · phase50 applied+verified (sandbox
  payments over the pre-repo scaffold, withdraw, expiry), OfferComposer +
  screens 52/53/28/29/30/31/32, accept→checkout flow, adapter-gated sandbox
  money stopping at `held`. tsc/lint clean, **230/232 tests** (same 2
  pre-existing failures; +12 Phase-5 guards; deltas itemised below),
  verify-schema green incl. all 6 phase50 checks. **AUTOMATED TWO-ACCOUNT
  PROOF: PASS (27 assertions, rolled back, zero residue) · PHYSICAL
  TWO-DEVICE CONFIRMATION: NOT RUN** — closing needs the user's on-device
  pass. See "Phase 5" sections below.
- [x] 6 lifecycle · commits `30a20e1` (db) + the phase-6 closure commit, tag
  `phase-6` · phase51 on staging (arrival timestamps, checklist, disputes,
  release, auto-release, tip), lib/jobLifecycle derivation point, screens
  33/36/37/56/57, §9 review-behind-approve rewiring of ClientJobDetail.
  Gate: tsc/lint clean, 240/242 tests (same 2 baseline failures),
  verify-schema green, RLS probe 6/6, phase6-proof 28 PASS zero-residue.
  **PHYSICAL TWO-DEVICE PASS: PENDING** (autonomous run, §11).
- [x] 7 messaging · the phase-7 closure commit, tag `phase-7` · phase52
  offer-scoped pre-hire chat (trigger + backfill), mode-specific quick
  replies, chat entries on both offer surfaces, Chat registered by the
  JobDetail rule. Existing realtime/media/unsend/read-marker system KEPT.
  Gate: tsc/lint clean, 245/247 tests (same 2 baseline failures),
  verify-schema green, offers probe 6/6, phase7-proof 10 PASS zero-residue.
  **PHYSICAL TWO-DEVICE PASS: PENDING** (autonomous run, §11).
- [x] 8 discovery · the two phase-8 commits, tag `phase-8` · §10 leak closed
  (MarketJobPreview + SubmitBid guard, both at the screen), worker job
  filters (lib/jobFilters + JobFilterSheet on WorkerResults), radius RPC
  proven against controlled fixtures. No schema change. Map rework/Rebook/
  Explore-17 deferred with reasons. Gate: tsc/lint clean, 252/254 tests
  (same 2 baseline failures), verify-schema green, phase8-proof 3 PASS.
  **PHYSICAL PASS: PENDING** (autonomous run, §11).
- [x] 9 profiles · the phase-9 closure commit, tag `phase-9` · phase53
  (services/saved/drafts/availability), ServicesPricing + SavedWorkers +
  PaymentMethods screens, WorkerProfile trust sections. Gate: tsc/lint
  clean, 258/260, verify-schema green, phase9-proof 8 PASS. **PHYSICAL
  PASS: PENDING.**
- [x] 10 reviews · the phase-10 closure commit, tag `phase-10` · phase54
  defense-in-depth policy (create_review already enforced the DoD — proven),
  cancelled-count reliability signal. Gate: tsc/lint clean, 261/263,
  verify-schema green, phase10-proof 7 PASS.
- [x] 11 earnings · the phase-11 closure commit, tag `phase-11` · phase55
  cash-out, pure wallet math, EarningsScreen. Gate: tsc/lint clean, 264/266,
  verify-schema green, phase11-proof 5 PASS.
- [x] 12 notifications · the phase-12 closure commit, tag `phase-12` ·
  phase56 feed over the phase20 outbox, two Phase-6 events wired,
  NotificationsScreen. Gate: tsc/lint clean, 269/271, verify-schema green,
  phase12-proof 4 PASS. **RUN 6–12 COMPLETE.**
  [ ] 13 hardening (HUMAN-LED — not begun, per the run charter)
(mark with commit hash + one-line note when done)

## Locked
Screens 01–07, 48. Frozen PWA. emerald-v2 references. Confirmed this pass:
Customer Home (`screens/HomeScreen.tsx`) and Worker Home
(`screens/BrowseJobsScreen.tsx`) are both full Emerald redesigns (hero art,
serif display type, live data feeds, mode-switch pill — since Phase 2 wired to
`switchMode()` rather than driving the overlay directly), genuinely
locked-worthy — not placeholders.

## Resolved VERIFY items
- router: **react-navigation** (`@react-navigation/native` + `bottom-tabs` + `native-stack`)
- server-state layer: **none exists** — no TanStack Query or equivalent; per-hook fetch/refetch/realtime pattern throughout (`useJob`, `useJobDetail`, `useMyJobsHub`, `useConversations`, etc.)
- radius search: **real Haversine RPC** (`jobs_within_radius()`, `supabase/phase41_jobs_within_radius.sql`) against `job_locations` exact coords; older `job_hotspots()`/`jobs_in_cell()` grid-cell RPCs kept in parallel for map density, untouched
- media tables: **per-domain**, not polymorphic (`jobs.photos`/`videos`/`completion_photos`/`completion_videos` as jsonb columns; `reviews.photos`; `portfolio_items.photo_url`)
- scheduled-function pattern: **on-read-check only** — no edge-function/cron pattern exists anywhere in the repo; the master plan's 72h auto-approve will need to be built as an on-read check first
- nav-bar bug: **confirmed still live** in 6 of 7 originally-patched screens (`AdminReportsScreen`, `CellJobsScreen`, `PostJobScreen`, `ProfileReviewsScreen`, `WorkerProfileScreen`, `WorkerSearchScreen`); `BrowseJobsScreen` alone was already correct. **Fixed in Phase 2** (`e8cbb92`), by hand rather than by cherry-pick, and now guarded by `tests/layout.test.mjs`.
- auth implementation: email/password (`lib/AuthContext.tsx`) is the only real session-creating path; phone auth is a tested mock (`lib/phoneAuth/`, `EXPO_PUBLIC_PHONE_AUTH_MODE` env var), real Supabase phone provider coded but dormant/unprovisioned
- messaging/realtime: real, via Supabase Realtime `postgres_changes` on `messages`, per-conversation + inbox-level channels; chat media private, signed-URL-resolved (6h TTL)
- payment implementation: **does not exist at any layer** — no table, ledger, provider, or real UI; one unbacked "Protected payment" marketing badge on `WelcomeScreen` flagged as a product/copy gap
- generated DB types: **do not exist** — `jobs.status` etc. typed as plain `string`; raw string-literal status comparisons throughout `lib/`
- open-job bid counteroffer vs. job_requests mechanism: **RESOLVED in Phase 3A (2026-08-08) — unify into `job_offers`.** `job_requests` and `bids` are both retired in Phase 3B. Full reasoning, the `offer_type`/`parent_offer_id` shape, the uniqueness design and the one-bid-ever-vs-one-active-chain decision are in `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md`
- reports table vs. new dispute table: **still unresolved**, unchanged from 2026-08-04
- saved workers presence: **still UNKNOWN** — check before Phase 5/9

## Key decisions (dated one-liners)
- 2026-08-08: `v2` (not `mainexpo`) is the authoritative BRAZOS V2 development
  branch — created from `feature/emerald-v2-fidelity` HEAD, which contains
  the real Emerald redesign work; `mainexpo` is an older baseline missing it.
  User-authorized override of the prior `CLAUDE.md` mainexpo-only rule.
- 2026-08-08: `f3e75d0` (mainexpo's lone unique commit, a safe-area fix) is
  needed but was **not** cherry-picked — its underlying bug still exists in
  6 of 7 originally-patched files, but 2 of those (`PostJobScreen`,
  `WorkerSearchScreen`) have been rewritten enough that the patch itself
  won't cleanly apply. Re-apply the same one-line fix by hand in Phase 2.
- 2026-08-08: the existing customer/worker mode-switch UX
  (`ModeTransitionOverlay`, the Home/Worker Home switch pills) is real,
  polished, user-facing work to preserve and re-home under Phase 2/3's real
  dual-navigator architecture — not a shortcut that reduces Phase 2's scope.
  Phase 2 is still the full structural build (ModeProvider, switchMode(),
  typed param lists, `profiles.active_mode`).

### Phase 3A decisions (2026-08-08)

Full argument for each: `docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md`.

- **`bids` + `job_requests` → one `job_offers` table.** phase18's separation
  argument (only one side has counters) is obsolete now that §H.2 gives the
  public side counters too; phase33 is live proof that `job_requests`'
  duplicated job fields drift out of sync with `jobs` and break users.
- **No `kind = 'counter'`.** `offer_type` (`marketplace_bid` | `direct_offer`)
  is set once on the root; a counter is identified structurally by having a
  `parent_offer_id`. Inheritance of job/type/participants/root down a chain is
  enforced by a composite self-referencing FK, not by a trigger or by code —
  so "offer_type never changes within a chain" is a schema guarantee.
- **No separate negotiation-chain table.** The only thing it would hold is the
  tuple the composite FK already pins. Rejected for lack of evidence it was
  needed, as the brief required.
- **PRODUCT CHANGE, NEEDS SIGN-OFF: one ACTIVE chain per (job, worker), not
  one bid ever.** `bids`' unconditional `unique (job_id, worker_id)` cannot
  survive counter chains in any form, so the only question was how far to
  loosen. Under one-chain-ever, §H.2's new `withdrawn` and `expired` states
  would permanently bar a worker from a job they are still eligible for —
  Phase 5 is chartered to build both. Reversible in one line (append
  `and parent_offer_id is null` to `job_offers_one_live_bid_per_worker`).
- **phase18's per-pair direct-offer cap is preserved,** not repealed —
  otherwise phase45 would have silently dropped an existing anti-spam rule.
- **`job_private_details` = extend `job_locations`, not a new table.** phase12
  already implements §G's exact privacy shape and RLS; phase43 adds
  `address_line` + `access_notes` to it. Renaming it would break phase12/18/
  29/36/41 and three live RPCs.
- **`notification_prefs.bids` / `.hire_requests` are NOT merged** — routed by
  `offer_type`. `bids OR hire_requests` was rejected: it silently opts users
  into a category they never chose. Recorded only; Phase 12 implements.
- **`jobs.accepted_bid_id` NOT renamed** — the rename conflicts with the
  "don't touch lifecycle RPC bodies" guardrail (`accept_bid()` and
  `acceptBidCompatibility.ts` both write it). `accepted_offer_id` added
  alongside instead; Phase 3B flips writers and drops the old column.
- **`bids_job_id_fkey` NOT renamed** — `lib/bids.ts` and `lib/jobs.ts` name it
  in embed hints; renaming breaks them at runtime with no client change
  shipped this phase.
- **No hand-written DB types.** `supabase gen types` needs the CLI plus a local
  Postgres or a service-role connection — none present, and adding either is a
  flaggable new dependency. Nothing in 3A needs to compile against the new
  schema, so inventing unions now would create a second source of truth.
  Authoritative regeneration deferred to immediately after the Phase 3
  migrations are applied.

### Phase 1 design-system decisions (2026-08-08)

- **`ui/tokens.ts` is the one authoritative token system.** Rather than a
  third parallel palette, the seven shared Emerald hues (forest, emerald,
  gold, goldSoft, mint, mint2, ink) are now defined once in `ui/tokens.ts`'s
  `brand` and spread into both `lib/theme.ts` and `lib/authTheme.ts`. A
  scripted comparison against HEAD proved all 14 resolved values byte-identical,
  which is what makes this safe for the LOCKED screens — they import those
  files and cannot shift.
- **Legacy values deliberately NOT changed.** `lib/theme.ts`'s `background`
  (#F4F1E8), `textMuted` (#6B7566), `border` (#DDD6C4), `danger` (#A8432B) and
  its older radii/type scale differ from §I's targets (#F6F3EA / #6E7771 /
  #DDE2DD / #9C3F35 and the 10/13/14/17/20/22 radii). §I's exact values live in
  `ui/tokens.ts` for new screens; migrating existing screens onto them is a
  per-screen visual change and therefore belongs to whichever later phase
  touches that screen — not a blanket Phase 1 rewrite.
- **§I's control sizes are overridden by CLAUDE.md.** §I specifies "Buttons:
  height 38 (small 28)"; both are below CLAUDE.md's ≥44pt touch-target floor.
  Shipped heights are 48/44 with §I's reference numbers recorded in comments,
  matching the resolution `lib/authTheme.ts` already made for the auth surface.
- **No Inter font bundled.** §I names Inter for the type scale; no custom font
  is loaded anywhere in this app by deliberate prior decision (D5 — a
  font-loading flash on the screens that most need to paint instantly). Body
  copy uses the platform sans, display headlines the platform serif the locked
  screens already render with.
- **§I primitive cap justification (required by §I's own wording).** §I says
  "~25 — hard cap; adding a 26th requires a justification line in BUILD_STATE",
  and §I's own enumerated list is **26 items**. The justification: the list is
  the plan's, not an expansion of it — no 27th primitive was invented, and 9 of
  the 26 are deferred rather than built, so Phase 1 ships 17. If anything the
  effective count is under the cap.
- **StatusPill's unions are local types, temporarily.** §I wants it
  "enum-driven" and §L bans status string literals, but generated DB types do
  not exist until Phase 3. The unions are transcribed from §H's canonical state
  machines, so callers are already compile-checked against the plan's values;
  Phase 3 retargets them at the generated enums with identical string values.
- **MoneyText owns its own copy.** The §H payment captions are a fixed internal
  map with no prop to override them — a screen cannot label held funds "paid",
  because there is no API to do so.

## Phase 1 — primitives and templates

**Built new (8):** StatusPill, MoneyText, EmptyState, ListRow, SearchBar,
Sheet, StepHeader, MediaGrid.

**Consolidated by re-export, not duplicated (9):** Button, Card, Chip, Avatar,
Skeleton, SegmentedTabs (=SegmentedControl), TopBar (=ScreenHeader),
RatingStars (=StarRating), Input (=TextField, plus PhoneNumberInput). There is
still exactly one implementation of each — `ui/primitives` is a canonical
import path, not a second copy. Existing screens keep their old imports.

**Deferred (9), each blocked on a later phase — see the DEFERRED block at the
bottom of `ui/primitives/index.ts` for the per-item reasoning:** BottomNav
(Phase 2 — belongs to the navigator, and Phase 2 makes it mode-aware),
JobCard (Phase 2 — §I requires ModeContext, which does not exist yet),
MediaUploader (Phase 4 — listed explicitly there), WorkerCard + BidCard
(Phase 5 — `BidWorkerCard` serves both today), ChecklistCard + EvidenceGallery
(Phase 6 — no schema), ServiceCard (Phase 9 — no schema), LiveJobMap
(Phase 6/8 — map technology decision still open).

**Templates (4 of 6):** FormScreen (+wizard mode), ListScreen, DetailScreen,
SuccessScreen — each taking one `state` prop that renders all five non-ready
states from `ui/templates/ScreenStates.tsx` (loading skeleton/spinner, empty,
error+retry, offline, permission-denied). InboxScreen/ChatScreen are Phase 7
per the master plan and were not built.

**Dev catalog:** `dev-tools/ComponentCatalog.tsx`, registered in `App.tsx`
under `__DEV__` only (the route is not registered at all in production, rather
than merely hidden), reached from a `__DEV__`-gated row on the Profile tab.

## Migrations written but NOT applied
None. Every migration through phase50 is applied and verified.

## Migrations applied (verify-schema green)
phase50 (`phase50_sandbox_payments_and_offer_lifecycle.sql`): **applied by
the agent under the session's explicit autonomous-database authorization**
(psql script file over the authenticated direct connection), re-applied to
prove idempotency, then confirmed by a green `node scripts/verify-schema.mjs`
— all 6 phase50 checks (payments sealed from the publishable key ×2, the two
sandbox RPCs, withdraw_offer, and the `sandbox_payments_enabled()` sentinel)
flipped PENDING→OK on their own; exit 0 — 2026-08-09. Extends the pre-repo
`payments` scaffold (§H.3 enum values, ledger columns, one-active-payment
index, write revokes), adds the sandbox authorize/hold RPCs,
`withdraw_offer()`, `job_offers.expires_at`, and expiry gates in the four
negotiation RPC bodies (signatures unchanged). NOTE: its enum ADD VALUE
statements run as autocommit statements ahead of the main transaction —
first application must be psql, not a transaction-wrapping SQL editor.
Touches no policy except strictly-narrowing payments write revokes; no
lifecycle RPC; no trigger.

phase49 (`phase49_post_wizard_fields.sql`): **applied by the agent under the
session's explicit autonomous-database authorization** (direct authenticated
session-mode connection; the old paste-into-SQL-Editor flow did not apply
this session), then re-run to prove idempotency, then confirmed by a green
`node scripts/verify-schema.mjs`: all 8 new phase49 checks (5 columns, the
two widened RPC signatures, the sentinel `post_wizard_fields_enabled()`)
flipped PENDING→OK on their own, total now **139 OK, 0 MISSING, 0 PENDING**,
exit 0 — 2026-08-08. Adds `jobs.budget_min_cents`/`budget_max_cents`,
`jobs.scheduled_date`/`arrival_start_hour`/`arrival_end_hour`, makes
`job_locations.lat`/`lng` nullable-as-a-pair, and recreates
`create_job`/`update_job_details` with the widened parameter list (all new
params defaulted; the old nine-argument call shape was proven to still
resolve, in a rolled-back transaction). Touches no policy, no trigger, no
lifecycle RPC.
phase48 (`phase48_bids_drift_view_rewrite.sql`): **applied by the user and
confirmed by a green `verify-schema.mjs` run** — both checks flipped PENDING to
OK on their own, and the migration's own post-commit grid reported
`repairable_drift = 0`, `orphan_rows = 0`. Writes no data, touches no trigger —
2026-08-08. **This closed Phase 3.**

phase47 (`phase47_bids_projection_trigger.sql`): **applied by the user and
confirmed by a green `verify-schema.mjs` run** — both checks flipped from
PENDING to OK on their own, which also proves its repair pass found zero drift
(it raises and rolls back otherwise) — 2026-08-08.

phase45 (`phase45_job_requests_to_job_offers.sql`) + phase46
(`phase46_offer_rpcs_and_rls.sql`): **applied by the user via the Supabase SQL
Editor**, phase45 first as the enum dependency requires. Confirmed by a green
`node scripts/verify-schema.mjs` run — all ten phase46 checks flipped from
PENDING to OK on their own — 2026-08-08.

phase43 (`phase43_job_offers_foundation.sql`) + phase44
(`phase44_backfill_bids_to_job_offers.sql`): **applied by the user via the
Supabase SQL Editor and confirmed by a green `node scripts/verify-schema.mjs`
run** — all six phase43 checks flipped from PENDING to OK on their own, which
is the sentinel mechanism working as designed. phase44 confirmed separately by
row counts: 25/25 bids migrated, 24/24 accepted links set — 2026-08-08.

phase42 (`phase42_active_mode.sql`): **applied by the user via the Supabase
SQL Editor, then confirmed via a green `node scripts/verify-schema.mjs` run**
(all three phase42 checks OK) — 2026-08-08.

phase15 through phase39: all confirmed live via `node scripts/verify-schema.mjs`
(clean run, 2026-08-08). phase40/phase41 are not covered by the script
(pre-existing gap, not new) — phase41 (`jobs_within_radius`) is confirmed live
indirectly, since `BrowseJobsScreen`/`WorkerResultsScreen` call it successfully
in the running app per source inspection; not independently re-verified via
the script this pass.

## Phase 3B test changes (deliberate, itemised)

Baseline stays 212/214. Nothing lost coverage; assertions moved to the code
that replaced what they pointed at.

- `hardening.test.mjs` — "missing accept_bid deployments have a constrained
  compatibility path" **replaced** by "offer acceptance has no client-side
  fallback write path". The old test asserted the behaviour of
  `lib/acceptBidCompatibility.ts`, which this phase deletes on purpose; the
  new test asserts its absence and that `lib/offers.ts` contains no PGRST202
  fallback and no direct write, so reintroducing one fails here.
- `hardening.test.mjs` — the marketplace-writes test now reads
  `lib/offers.ts` and requires all four offer RPCs plus no direct write to
  `job_offers`, `bids` or `job_requests`.
- `customerCore.test.mjs` — five assertions retargeted from deleted files to
  their replacements: `createJobRequest`→`createDirectOffer`,
  `acceptBid`→`acceptOffer`, `BidWorkerCard.tsx`→`OfferCard.tsx`,
  `useJobBids.ts`→`useJobOffers.ts`, `setBids`→`setOffers`.

## Known issues
- **RESOLVED (stale Metro bundle, no source defect): 'PostJob' NAVIGATE failed
  from Customer Home** (2026-08-08, Phase 3B device pass). Tapping "Post a job"
  threw `The action 'NAVIGATE' with payload {"name":"PostJob","params":{}} was
  not handled by any navigator`. **Restarting Expo fixed it. No code change was
  made and none was needed.**
  - Call site was identified with confidence — `HomeScreen.tsx:141`, where
    `initialDescription: query.trim() || undefined` serializes to `{}` on a
    blank search box — but the source at HEAD cannot produce the failure:
    `PostJob` is registered unconditionally at `navigation/CustomerRoot.tsx:42`
    as a direct sibling of `HomeMain`, and `HomeScreen` is typed to that same
    stack. That contradiction is what pointed at the bundle rather than the code.
  - **Lesson for future device passes: confirm the running bundle before
    reporting a navigation defect.** Of the two "bugs" this pass surfaced, one
    (the OfferCard accept gate) was real in the source and one was a stale
    bundle. Reading the source first is what separated them — a symptom that
    the code provably cannot produce is a bundle problem until shown otherwise.
- ~~**LATENT (found by inspection, not the cause of the above): `PostJob` is not
  registered in `WorkerHomeStack`**, so navigating to it from anywhere inside
  the worker Home tab would throw the same error.~~ **RESOLVED 2026-08-10:
  stopped being latent — device-reproduced as a live crash (twice, dev build,
  cold launch) — and was fixed by registering `PostJob` in `WorkerHomeStack`
  by explicit user decision. The "Do NOT fix by registering" stance below is
  superseded: it predates Phases 5–9 registering PostJob in all four shared
  tabs, which had already made posting reachable from worker mode everywhere
  except this one stack. Guarded now by tests/crossTabNavigation.test.mjs
  (exemption removed). Full record: the 2026-08-10 sections near the end of
  this file. Historical entry kept below.**
  - **Cause:** `PostJob` is registered in `CustomerHomeStack` and in all three
    shared stacks (MyJobs, Messages, Map) but **not** in `WorkerHomeStack`,
    which does register `WorkerProfile`. `screens/WorkerProfileScreen.tsx:46`
    carries a comment asserting the opposite — "PostJob is registered alongside
    WorkerProfile in every stack that can reach this screen" — which was true
    when written and stopped being true when Phase 2 added the worker tree. It
    is a comment, so nothing type-checks it.
  - **Neither issue is a Phase 3B regression.** `git diff 0e230bf..HEAD --
    navigation/ lib/navigation.ts App.tsx` is empty; `navigation/` was last
    touched by Phase 2's `e8cbb92`, and no commit since has gone near routing.
  - The worker-tree gap is real but latent: `WorkerProfileScreen.tsx:46` still
    carries a comment asserting "PostJob is registered alongside WorkerProfile
    in every stack that can reach this screen", which was true when written and
    stopped being true when Phase 2 added the worker tree. Nothing type-checks
    a comment. "Send an offer" from a worker profile opened via the worker Home
    tab would fail.
  - **Workaround in use:** post from the My Jobs tab (shared stack, registers
    the route) or switch to customer mode first.
  - ~~**Do NOT fix by registering `PostJob` in `WorkerHomeStack`.** Posting a job
    and sending a paid offer are customer actions; §F and Phase 2's own recorded
    decision route cross-mode actions through an explicit confirm plus
    `switchMode()`, as Customer Home's Live Nearby cards already do. Adding the
    route would let a worker-mode session post jobs without ever switching mode
    and weaken the isolation Phase 2 exists to enforce. Owner: a future
    navigation phase, not Phase 3.~~ **SUPERSEDED 2026-08-10 — see the RESOLVED
    marker above.**
- **OfferCard hid the Accept button in worker mode** — found in the same device
  pass, fixed in `51e5c38`. A perspective gate added in phase-3b suppressed the
  accept affordance whenever the app was in worker mode, and `ClientJobDetail`
  is mounted in both trees, so an owner viewing their own job from the shared My
  Jobs tab could not hire anyone. Removed; guard test added. This was a real
  Phase 3B regression and is the clearest argument on record for not closing
  Phase 3 on SQL evidence alone.
- ~~Device verification of the Phase 1 catalog was NOT performed by the
  agent.~~ **Resolved 2026-08-08**: user manually verified the catalog on a
  real Expo iOS device (Profile tab → "Component catalog (dev)") per the
  repo rule that Expo is never started from an agent session. Result: PASS —
  see the Phase log entry above for the checklist covered. No layout, safe-area,
  font, clipping, or overflow regressions observed.
- **ESLint was not run and is not installed.** `npx eslint .` would have to
  install the package (it is in neither `dependencies` nor `devDependencies`)
  and would then fail for lack of any config file — confirmed again this phase,
  consistent with DECISIONS.md D13. The repo's actual lint is
  `npm run lint` (`tsc --noEmit --noUnusedLocals --noUnusedParameters`), which
  is clean. No dependency was installed, per the standing rule.
- **2 pre-existing test failures, unchanged by Phase 1** (187/189 pass, both
  before and after — verified by stashing the Phase 1 work and re-running at
  HEAD): (1) `pwa.test.mjs` "web build is installable…", the documented frozen
  web-surface version-string mismatch; (2) `setupOnboarding.test.mjs`
  "navigation only ever follows a successful write", which slices
  `SetupScreen.tsx` on `'}\n\n'` and mis-slices under CRLF line endings — a
  brittle assertion, not a real regression in the screen. Neither was
  introduced here and neither was fixed here (out of Phase 1 scope).
- ~~Nav-bar/safe-area duplicate-bottom-inset bug live in 6 screens.~~
  **Fixed in Phase 2** by hand (not cherry-picked), guarded by
  `tests/layout.test.mjs`, and confirmed clean on a real device at closure.
- ~~Mode switch mounts a whole navigator tree inside the overlay's 500→700ms
  window, where it used to push a single screen — risk of a white/unpainted
  frame on a slow device.~~ **Confirmed clean on a real device at closure.**
  If a white frame ever does show up on a lower-end device than was tested,
  the fix is the overlay's `FALL_START_MS`, not a sleep in `switchMode()`.
- **Switching mode resets every tab's stack**, including an open chat or a
  half-filled Post-a-job wizard. That is §F's required behaviour ("resets
  navigation stacks"), and the wizard already warns before losing progress —
  but it is a real, deliberate behaviour change worth knowing about.
- ~~`PostJobScreen` draft state is in-memory only (no `AsyncStorage`) — lost on
  app kill.~~ **Fixed in Phase 4** (this session) — a fresh (not editing, not
  hiring) post now autosaves to AsyncStorage and restores on mount; cleared on
  publish and on a graceful Back-out, left in place on an app kill by
  construction (no unmount effect runs). See "Phase 4 — what was built".
- ~~`MediaUploader` built but not wired into `PostJobScreen` (ownership-rule
  conflict for restored drafts).~~ **Resolved in Phase 4 session 2**: the
  primitive gained a caller-supplied `shouldDeleteOnRemove` override; the
  screen passes "not in the job's original media", which is correct for
  fresh posts, restored drafts, and edit mode alike. Wired in, guarded by
  `tests/mediaUploader.test.mjs` (no parallel picker path may regrow).
- ~~No scheduling/arrival-window field on `jobs`.~~ **Resolved by phase49**
  (`scheduled_date` + `arrival_start_hour`/`arrival_end_hour`). The legacy
  `jobs.scheduled_for` timestamptz remains unused (0 rows, 0 code refs) and
  untouched — a Phase 13 deletion candidate.
- `lib/acceptBidCompatibility.ts`'s `acceptBidWithoutRpc()` fallback (only runs on `PGRST202`, i.e. if `accept_bid` RPC ever drops from PostgREST's schema cache) does a non-atomic read-then-multi-step-update with no row lock — a real TOCTOU race, unlikely to be exercised since the RPC is confirmed live, but untested for concurrency. **Phase 3A verdict: not dead code** — `lib/bids.ts:2,196` and `tests/hardening.test.mjs:86,91` reference it, so it was left in place and marked in-file for **mandatory removal in Phase 3B**, when `accept_offer()` replaces `accept_bid()` and it has nothing left to fall back from.
- ~~`fetchJobsByClient()` has no status filter.~~ **Stale entry, corrected
  2026-08-08 (Phase 4 session 2 audit):** the Gate-2
  `.not('status','eq','draft')` filter has been in place since Phase 3B —
  draft rows (unsent direct-offer negotiations) are excluded from My Jobs
  by design, and phase45 shipped with that gate satisfied.
- **A worker cannot read the job a direct offer refers to before accepting it.** `jobs_select_assigned_worker` needs `assigned_worker_id`, which a live direct offer has not set. Phase 3B must add a policy for the targeted worker, or the offer surfaces will render an unreadable job.
- **Declined/closed `job_requests` have no migration path** into `job_offers` — they never produced a job row and `job_offers.job_id` is NOT NULL. phase45 deliberately skips them rather than fabricating a job. Phase 3B decides whether `job_offers` should carry dead negotiations at all (if yes, `job_id` must become nullable — a model change).
- **`bids` carries duplicate `public`- and `authenticated`-role RLS policies** (`workers view own bids` ≈ `bids_select_own`, `job owner views bids on their job` ≈ `bids_select_job_owner`) — leftovers from a role migration. The `public` pair is strictly weaker (no `is_profile_active(worker_id)` term) and, being permissive, ORs with the stricter pair, so the stricter one currently adds nothing. Untouched in 3A per the brief; Phase 3B's RLS consolidation should drop the `public` pair.
- Avatar re-upload with a changed file extension orphans the old storage object (no cleanup call, unlike `deleteJobPhoto` for job photos).
- `WelcomeScreen` shows a "Protected payment" marketing badge; no payment system exists anywhere in the codebase. Flag to user before Phase 4/8.
- `components/SectionHeader.tsx` is dead code (never imported) — left in place per Phase 0 policy, candidate for Phase 13 deletion.

## Gate status

Phase 4 (2026-08-08) — code-complete, device/RLS verification outstanding:
- **tsc**: PASS — `npm run lint` (`tsc --noEmit --noUnusedLocals
  --noUnusedParameters`) exits 0, clean.
- **eslint**: NOT RUN — still not installed, no config. Unchanged since
  Phase 1.
- **tests**: **217/219 PASS.** Same two pre-existing failures (`pwa` frozen
  web version string; `setupOnboarding` CRLF mis-slice), zero unexplained new
  ones. Net +4 tests: `tests/postJobDraft.test.mjs` (2, guarding the
  AsyncStorage restore/autosave/clear rules) and `tests/mediaUploader.test.mjs`
  (2, guarding the failure-safe append rule and the barrel export).
- **verify-schema**: **PASS — 131 OK, 0 MISSING, 0 PENDING**, exit 0,
  identical to the Phase 3 closure baseline. No migration was written this
  phase — none was needed. Every column/RPC/media path Phase 4 needed
  (`jobs.photos`/`.videos`, `create_job`, `job-photos` storage bucket and its
  policies, `fetchOpenJobs()`/realtime for Worker Home's data source) was
  already live per the Phase 0 crosswalk, and this session did not find a gap
  serious enough to contradict that finding.
- **locked screens**: PASS. Screens 01–07 and 48 untouched — this phase's only
  screen edit was `PostJobScreen.tsx`, which is not on the locked list.
- **mode-smoke**: N/A this phase — no navigation, mode, or route-registration
  change. The latent `PostJob`/`WorkerHomeStack` gap (Known issues) was left
  exactly as found, per the brief's explicit instruction not to touch it.
- **rls-probe**: N/A this phase — no policy or schema change.
- **device/simulator**: **NOT RUN.** No real device or simulator was
  available this session, and the repo rule is that Expo is never started
  from an agent session. The cross-account "post → discover → open on two
  devices" proof, the mode-isolation smoke, and the RLS probe are all
  explicit open items for the user — none of the three is claimed as passing
  here. See "Phase 4 — what was built" for exactly what was and wasn't
  possible to verify without one.

**Phase 4 gate: green for everything checkable without a device or live
credentials. Phase 4 is explicitly NOT closed** until the user runs the
two-device post→discover→open pass (and, while there, the mode-isolation
smoke — unaffected by this phase's changes, but worth reconfirming before the
next phase builds on top of it).

Phase 3 closure (2026-08-08):
- **tsc**: PASS — `npm run lint` exits 0, clean.
- **eslint**: NOT RUN — still not installed, no config file. Unchanged since
  Phase 1; consistent with DECISIONS.md D13.
- **tests**: **213/215 PASS.** The same two pre-existing failures (`pwa` frozen
  web version string; `setupOnboarding` CRLF mis-slice), zero unexplained new
  ones. Net +1 test vs the 212/214 baseline: one guard test added for the
  projection, one obsolete compatibility test replaced by an absence assertion,
  six assertions retargeted to the files that superseded the deleted ones. All
  itemised under "Phase 3B test changes".
- **verify-schema**: **PASS — 131 OK, 0 MISSING, 0 PENDING**, exit 0. phase43,
  44, 45, 46, 47 and 48 all applied by the user and each confirmed by a green
  run in which its checks flipped from PENDING to OK on their own.
- **locked screens**: PASS. Screens 01–07 and 48 untouched throughout Phase 3 —
  not even an import line. `hooks/useBidCounts.ts` survives as a one-line
  deprecated re-export of `useOfferCounts` specifically so `HomeScreen.tsx` and
  `BrowseJobsScreen.tsx` stay byte-identical.
- **mode-smoke**: PASS. Cross-tree navigation remains a compile error. The one
  perspective-related defect the device pass found (`51e5c38`) was the opposite
  failure — a component varying by mode when it should not have been — and is
  now guarded by a test.
- **rls-probe**: **PASS — 5 passed, 0 failed, 0 skipped** via
  `scripts/rls-probe-offers.mjs`, run by the user with three real account
  credentials. anon reads neither `job_offers` nor `bids`; worker A cannot see
  worker B's offer on a shared job through `job_offers` or through the frozen
  `bids` mirror; the job's owner sees both. Owner-sees-both is asserted first,
  deliberately, so the isolation cases cannot pass trivially against absent data.
- **device/simulator**: **PASS**, on a real device, reported by the user.
  Part 1: bid → rival bid → poster sees both → accept → rival settles rejected →
  worker sees the job under working. Part 2: direct offer → counter → **live turn
  flip with no refresh** → accept, with **both phantom My Jobs checks clean**
  (absent before acceptance, present exactly once after). Part 3 (old-build
  compat) was covered by the SQL harness rather than a pre-cutover binary and is
  recorded as such, not as a device-verified compat pass.
- **shim/projection harness**: **PASS**, six checks — create_bid shim, rival
  chain, counter, accept, settle-then-reopen, plus correctness (`every bids row
  matches its own chain's leaf`) and coverage (`every pending chain has a row`).
  Notification behaviour asserted: exactly one `bid_received` per genuine new
  chain, **zero** per counter or accept. Ran in a subtransaction and rolled back
  clean, leaving no probe rows.

**Phase 3 gate: fully green. Phase 3 is closed.**

Phase 3B (2026-08-08) — code-complete, phase45/46 not applied:
- **tsc**: PASS — `npm run lint` exits 0, clean.
- **eslint**: NOT RUN — still not installed, no config. Unchanged.
- **tests**: **212/214 PASS — same total, same two pre-existing failures, zero
  unexplained new ones.** Six assertions were deliberately retargeted and one
  test deliberately replaced; see "Phase 3B test changes" below.
- **verify-schema**: **PASS (pre-apply state, as specified).** Every phase0–44
  check OK, all ten phase46 checks `PENDING — NOT APPLIED`, exit 0. Post-apply
  contract: those ten become mandatory automatically and must all read OK.
- **locked screens**: PASS — `HomeScreen.tsx` and `BrowseJobsScreen.tsx`
  untouched, not even their imports. `hooks/useBidCounts.ts` survives as a
  one-line deprecated re-export of `useOfferCounts` specifically so both stay
  byte-identical.
- **mode-smoke**: N/A — no navigation or mode change. OfferCard reads
  `useModePerspective()` rather than taking a perspective prop.
- **rls-probe**: N/A this session — phase46's policies are unapplied. Re-run
  after applying, and specifically confirm a second worker cannot read another
  worker's offer on the same job.
- **device/simulator**: **NOT RUN — required before Phase 3 can close.**

**Phase 3B gate: green for everything that can be checked before the
migrations are applied. Phase 3 is NOT closed.**

Phase 3A (2026-08-08) — code complete, migrations not applied:
- **tsc**: PASS — `npm run lint` exits 0, clean.
- **eslint**: NOT RUN — still not installed, no config. Unchanged.
- **tests**: **212/214 PASS — identical to the Phase 2 baseline.** The same two
  pre-existing failures (`pwa.test.mjs` frozen-web version string,
  `setupOnboarding.test.mjs` CRLF mis-slice), zero new failures, zero new
  tests. Phase 3A adds no TypeScript, so the suite is unchanged by design.
- **verify-schema**: **PASS (pre-migration state, as specified).** Every
  phase15–phase42 check reports OK; all six phase43 checks report
  `PENDING — NOT APPLIED`; exit code 0. The script now supports a per-group
  `sentinel`: while the sentinel RPC is absent the group's checks are reported
  as pending and excluded from the failure total; the moment phase43 is applied
  the same checks become mandatory automatically. No earlier check was
  weakened and no missing object is reported as passing.
- **locked screens**: N/A — Phase 3A changed no screen. The only TypeScript
  edit in the phase is a doc comment in `lib/acceptBidCompatibility.ts`.
- **mode-smoke**: N/A — no navigation or mode change.
- **rls-probe**: N/A this phase — no policy is applied. phase43 contains
  exactly one policy statement, a strict narrowing of `jobs_select_open`
  (adds `visibility = 'open_market'`), and it is unapplied. Re-run the probe
  after applying phase43.
- **device/simulator**: N/A — nothing user-visible changed.

**Phase 3A gate: green for what 3A is allowed to do.** It is deliberately NOT
a phase closure: Phase 3 closes when 3B's RLS, `accept_offer` /
`advance_job_status` and the applied migrations are verified.

Phase 2 closure (2026-08-08):
- **tsc**: PASS — `npm run lint` exits 0, clean. Re-confirmed at closure.
- **eslint**: NOT RUN — still not installed, no config. Unchanged from Phase 1.
- **tests**: 212/214 PASS. The same 2 pre-existing failures, zero new. 25 new
  tests in `tests/mode.test.mjs`, all passing. Three existing guard tests were
  updated, not deleted, because they asserted the architecture Phase 2
  replaces: `customerCore` now reads route registrations from `navigation/`
  instead of `App.tsx`; `layout` reads the tab-bar arithmetic from
  `ui/primitives/BottomNav.tsx` (byte-identical, moved file) and gained a new
  assertion covering all nine tab-contained screens' `edges`; `setupOnboarding`
  asserts the landing choice now resolves a MODE rather than parking a
  navigate. Every original assertion's intent is preserved. Re-confirmed at
  closure.
- **verify-schema**: **PASS.** phase15–phase42 all OK, including phase42's
  `get_my_active_mode()`, `set_active_mode()`, and the
  `profiles.active_mode not publicly readable` privacy check. The migration
  was applied by the user via the SQL Editor; this run (not that editor's own
  "Success" message) is the proof.
- **locked screens**: PASS. Screens 01–06 byte-identical (git hashes compared
  before and after). 07 (`HomeScreen`) and 48 (`BrowseJobsScreen`) changed by
  wiring only — imports, the navigation type parameter, and the bodies of the
  switch/browse handlers. No JSX structure, style, token, string, layout or
  prop change; `git diff` contains no style-object or JSX-attribute edits other
  than two `onPress` handler names. Real-device visual check at closure found
  no regression.
- **mode-smoke**: **PASS.** Cross-tree `navigate()` is a compile error
  (asserted by `tests/mode.test.mjs`, and by tsc rejecting the old call sites
  before they were rewritten). Confirmed on a real Expo device: mode
  persistence across restart, both switch directions, tab re-press in both
  modes, rapid double-tap, all four shared tabs from both modes, no loop, no
  white frame during the transition. See "Manual verification performed"
  above for the full checklist.
- **rls-probe**: N/A this phase — no policy change. phase42 adds no grant on
  `profiles`, and `verify-schema` confirms `active_mode` stays unreadable with
  the publishable key.
- **device/simulator**: **PASS.** Manually verified by the user on a real
  Expo device — see "Manual verification performed" above for the full
  checklist. This closes the last open item from Phase 2.

**Phase 2 gate: fully green. Phase 2 is closed.**

Phase 1 closure (2026-08-08):
- **tsc**: PASS — `npm run lint` (`tsc --noEmit --noUnusedLocals
  --noUnusedParameters`) exits 0, clean. Re-confirmed at closure.
- **eslint**: NOT RUN — not installed, no config file in repo; installing it
  was explicitly out of scope. Consistent with DECISIONS.md D13.
- **tests**: 187/189 PASS, 2 pre-existing failures, zero new. Baseline
  re-measured at HEAD (stash/pop) to confirm neither was introduced by
  Phase 1; re-confirmed at closure.
- **verify-schema**: PASS as of Phase 0; not re-run (Phase 1 touched no DB).
- **locked screens**: PASS — screens 01–07 and 48 byte-identical (`git diff`
  empty across all 11 files), and the shared brand token values they depend on
  proven unchanged against HEAD by a scripted 14-value comparison. Re-confirmed
  at closure.
- **mode-smoke**: N/A — the mode split does not exist yet (Phase 2 deliverable).
- **rls-probe**: N/A this phase — no policy or schema change.
- **device/simulator**: **PASS.** Manually verified by the user on a real
  Expo iOS device (not a simulator) — see the Phase log entry above for the
  full checklist. This closes the one open item from the earlier report.

**Phase 1 gate: fully green. Phase 1 is closed.**

## Phase 2 — what was built

### Architecture
- **`modes/`** — the one authoritative mode layer. `types.ts` is pure (no
  React/RN/Supabase) so its coercion, keying and precedence rules are executed
  by `tests/mode.test.mjs` rather than asserted as text. `ModeProvider.tsx`
  owns the state and is the only thing that may set it; `switchMode()` always
  confirms and has no opt-out flag. `ModeGuard.tsx` is the §F dev canary (logs,
  never blanks, never redirects). `perspective.tsx` supplies
  `useModePerspective()` plus a `__DEV__`-only `ModePreview` override used by
  exactly one caller, the catalog.
- **`navigation/`** — `CustomerRoot`, `WorkerRoot`, `sharedStacks`, `ModeShell`.
  Exactly one tree is mounted; swapping them IS the stack reset, so
  `switchMode()` needs no navigation choreography and there is no timer
  papering over a race. `App.tsx` no longer contains a navigator.
- **Typed split** — `CustomerParamList` / `WorkerParamList` (tabs) and
  `CustomerHomeStackParamList` / `WorkerHomeStackParamList` (the mode-defining
  Home tab). `HomeStackParamList` is deleted. Cross-tree `navigate()` is a tsc
  error, not a convention.
- **Persistence** — `profiles.active_mode` + `get_my_active_mode()` /
  `set_active_mode()` (phase42). Resolution precedence: Setup's just-made
  choice > server > device cache > `'customer'`. A missing RPC (phase42 not
  applied), an offline device, or a garbage value all fall back safely; an
  invalid mode cannot be stored (server check + column constraint) or held
  (`coerceAppMode` is the single narrowing point).

### The three named bugs, and how each is now structurally impossible
- *Customer-mode actions open Worker Home* — `BrowseJobs` is not in
  `CustomerHomeStackParamList` and not registered in `CustomerRoot`.
- *Home tab sends worker users back to Customer Home* — Worker Home is the
  ROOT of the worker Home stack, so popping to root is correct. The `tabPress`
  listener that used to infer mode from stack contents is deleted.
- *Customer "View all" crosses into worker behaviour* — it now takes §F's
  cross-mode route: an explicit confirm, then `switchMode('worker')`. Same for
  the Live Nearby cards (see Deferred).

### Files changed
New: `supabase/phase42_active_mode.sql` · `modes/{types,modeStorage,
ModeProvider,ModeGuard,perspective,index}` · `navigation/{CustomerRoot,
WorkerRoot,sharedStacks,ModeShell}` · `ui/primitives/{BottomNav,JobCard}` ·
`tests/mode.test.mjs`.
Modified: `App.tsx` · `lib/navigation.ts` · `lib/profiles.ts` ·
`lib/notificationRoutes.ts` · `screens/HomeScreen.tsx` (LOCKED, wiring only) ·
`screens/BrowseJobsScreen.tsx` (LOCKED, wiring only) ·
`screens/WorkerSearchScreen.tsx` · `screens/WorkerResultsScreen.tsx` ·
`screens/{AdminReports,CellJobs,PostJob,ProfileReviews,WorkerProfile}Screen.tsx`
(safe-area) · `ui/primitives/index.ts` · `dev-tools/ComponentCatalog.tsx` ·
`scripts/verify-schema.mjs` · `tests/{layout,customerCore,setupOnboarding}.test.mjs`.

## Phase 2 decisions (2026-08-08)

- **The tab set is unchanged (Home/Map/MyJobs/Messages/Profile), identical in
  both modes.** §F sketches `CustomerTabs: Home · Explore · Post(+) · Inbox ·
  Profile` and `WorkerTabs: Find Jobs · Map · My Work · Inbox · Profile`, but
  Explore (MarketplaceBrowse) is Phase 8 and the Post wizard tab is Phase 4 —
  those tabs have no screens yet. Renaming the existing four to §F's labels
  without their screens would be cosmetic churn on chrome that renders beneath
  LOCKED screens 07/48. The tab set is revisited when Phases 4/8 create what it
  is meant to point at.
- **Four tabs are genuinely shared, not duplicated.** A Brazos account is
  simultaneously customer and worker (CLAUDE.md: no role switch, no role gate),
  so its job hub, inbox, map and profile are the same surfaces in both modes.
  They are declared once in `navigation/sharedStacks.tsx` and mounted by both
  trees. §F "preserve shared routes"; §P.3 "no second version of a screen".
- **BottomNav is a config factory + item renderer, not a replacement
  `tabBar`.** React Navigation still draws the bar. The bar's correctness comes
  from a long argument with that library's internals (the
  `TAB_BAR_CONTENT_HEIGHT` arithmetic), and reimplementing it to satisfy the
  word "primitive" would risk exactly the pixel drift Phase 2 must not
  introduce on LOCKED screens. There is still one implementation; the catalog
  renders `BottomNavPreview` from the same renderer and constants.
- **JobCard is built but no screen was migrated onto it.** Migrating
  `BrowseJobCard` / `WorkerJobCard` / Home's `OpenJobCard` is a visual change
  to screens Phase 2 may not redesign, one of which is LOCKED. The primitive
  exists, is catalogued in both perspectives, and later phases adopt it per
  screen.
- **`switchMode()` adds a confirmation the locked homes did not have before.**
  Required by CLAUDE.md and §F ("mode changes ONLY via switchMode() with
  confirm + stack reset"). It changes behaviour, not rendered output — the
  pills, labels and disabled states are untouched. Flagged here rather than
  buried.
- **Customer Home's Live Nearby cards now open the cross-mode confirm instead
  of the worker bid screen.** The customer-safe destination is §E/§F's
  `MarketJobPreview`, which Phase 8 owns; building it here would be a new
  feature screen, explicitly outside Phase 2. Until then the honest behaviour
  for "show me the open-job marketplace" is §F's confirm-then-switch, not a
  silent push into a worker surface. Behaviour change on a LOCKED screen, no
  visual change.
- **`JobDetail` push notifications now route through the shared MyJobs tab.**
  They used to target the Home tab, which since the split only registers
  `JobDetail` in the worker tree — a customer-mode tap would have silently
  landed on Customer Home. MyJobs is mounted in both trees. §F's real answer is
  a mode segment in the payload, which Phase 12 owns.
- **`f3e75d0` still not cherry-picked; its fix applied by hand** to the six
  screens Phase 0 confirmed, exactly as recommended. `tests/layout.test.mjs`
  now asserts the absence of `edges={['top', 'bottom']}` across all nine
  tab-contained screens, so the regression cannot come back silently.

## Manual verification performed (Phase 2 closure, 2026-08-08)

**Supabase — done by the user:**
1. `supabase/phase42_active_mode.sql` applied via the Supabase SQL Editor.
2. `node scripts/verify-schema.mjs` re-run by the agent afterward and
   confirmed green: `phase42_active_mode.sql` shows OK for
   `get_my_active_mode()`, `set_active_mode()`, and
   `profiles.active_mode not publicly readable`; script exits 0. This is the
   proof — the SQL Editor's own "Success" message was not treated as one.

**Real Expo device — done by the user, all PASS:**
1. Session restores directly into the persisted mode, no opposite-mode flash.
2. Customer Home tab always returns to Customer Home.
3. Worker Home tab always returns to Worker Home.
4. Customer → Worker switch confirms, transitions, and lands correctly.
5. Worker → Customer switch confirms, transitions, and lands correctly.
6. Mode persists across kill/relaunch.
7. Rapid/double-tap on a switch pill produces exactly one confirm and one
   transition — no duplicates.
8. Shared Map / My Jobs / Messages / Profile tabs work correctly in both
   modes, same bottom bar in the same place.
9. No redirect/navigation loops observed.
10. No white/unpainted frame during the mode transition (the specific risk
    flagged in Known issues below, given the transition now mounts a whole
    tree instead of pushing one screen) — confirmed clean.
11. Safe-area/bottom-nav checks pass on the six screens fixed this phase.
12. Component Catalog's new BottomNav and JobCard sections confirmed correct
    (EST. PRICE / no bid button in customer perspective, EST. PAY / bid button
    / distance / "Break the ice" in worker perspective).

## Deferred out of Phase 2 (with the phase that owns each)

- **`MarketJobPreview`** (customer-safe job browsing) — Phase 8. Until it
  exists, Customer Home's marketplace entry points confirm-and-switch.
- **`JobDetail` reachable from the shared Map and MyJobs stacks in customer
  mode** — the same Phase 8 dependency. A customer drilling into a map cell can
  still reach the worker bid screen. Phase 2 closed the two leaks it owns and
  left this one flagged rather than half-fixed.
- **Deep-link scheme `brazos://c/…` / `brazos://w/…`** — §J lists it under
  Phase 2, but no linking configuration exists in the repo at all
  (`NavigationContainer` has no `linking` prop and no scheme is registered), so
  adding one is net-new deep-link plumbing rather than mode hardening. The
  cross-mode confirm it depends on is built and in use. Phase 12 wires the
  notification/deep-link router per §F and should add the scheme there.
- **Migrating existing job cards onto the `JobCard` primitive** — per screen,
  in the phase that touches that screen.
- **Generated DB enums for `active_mode`** — Phase 3, with every other status
  enum. `AppMode` is a hand-written union today, matching the DB constraint's
  two values exactly.

## Phase 4 — what was built

Per BRAZOS_MASTER_PLAN.md §J, Phase 4 (MEDIUM), screens 12–16, 51, minimal
38/39. Goal: a customer posts a real job; a worker sees and opens it on
another device — first end-to-end proof of the Phase 3 foundation.

**Starting point (Phase 0's crosswalk, re-confirmed this session):** almost
all of Phase 4's screen-level scope already existed and was already marked
COMPLETE — `PostJobScreen.tsx` (12/13/15, the 4-step wizard), `JobDetailScreen.tsx`
(51, worker perspective — shows `job.location`'s area string only, never an
exact address, matching the private-details split RLS enforces),
`MyJobsHubScreen.tsx` (38), `ClientJobDetailScreen.tsx` (39). Worker Home (48,
LOCKED) already reads real published jobs through `useOpenJobs()` →
`fetchOpenJobs()` (`lib/jobs.ts`), a live query against `jobs` plus a realtime
subscription — not a stub, not touched this phase. `verify-schema` staying at
131 OK / 0 MISSING / 0 PENDING with zero new migration written confirms no
column, RPC, or storage policy was missing for any of this.

That left exactly two real, named gaps to close, both closed this session:

1. **Draft persistence across app kill** (`screens/PostJobScreen.tsx`). A
   fresh post (not editing, not hiring — those have their own source of
   truth) now autosaves `{title, description, category, location, coords,
   budget, photos, videos, step}` to AsyncStorage under
   `brazos:postJobDraft:v1` on every change, and restores it on mount unless
   the route already seeded specific fields (Home's search box / category
   chips — an explicit fresh start wins over a stale draft). Restored media
   is tracked the same as this-session uploads, so removing it — or
   abandoning the draft again — deletes it from storage rather than leaking
   it. The draft is cleared on a successful publish and on a graceful
   Back-out of the wizard (which already deleted that session's uploaded
   media on abandonment; the draft record has to go with it or it would
   restore text pointing at now-deleted photos next time). It is
   deliberately left in place on an app **kill** — no `AppState` handler
   exists to catch that case, because there is nothing to catch: the process
   dies before any unmount effect runs, which is exactly what leaves the
   persisted draft available to restore. `tests/postJobDraft.test.mjs` guards
   all of this at the source level.
2. **`MediaUploader` primitive** (`ui/primitives/MediaUploader.tsx`) — the one
   primitive Phase 1 explicitly deferred here. Failure-safe by construction:
   `items` only ever grows by appending a URL a real `onUpload` call already
   returned; a failed pick or failed upload changes nothing, so there is no
   frame in which a failed attempt can clobber previously-uploaded media.
   Bucket-agnostic (`onUpload`/`onDelete`/`validate` are caller-supplied), so
   the same component can back a job posting, a review photo, or a
   completion photo without hardcoding a bucket. Exported from
   `ui/primitives/index.ts`, catalogued in `dev-tools/ComponentCatalog.tsx`.
   `tests/mediaUploader.test.mjs` guards the append-only-on-success ordering
   and the barrel export. **Not wired into `PostJobScreen`** — see the Known
   issues entry for the concrete reason (its ownership-on-removal rule is
   right for editing a published job, wrong for a draft) and the Phase 2
   `JobCard` precedent this follows.

**Not built, and why:** a separate, dedicated "Job published" (screen 16)
route on the `SuccessScreen` template. `PostJobScreen`'s existing inline
success overlay already delivers the same outcome (confirmation, a summary of
what was just published, "View my jobs" / "Back to home") and is deeply
intertwined with this phase's other changes (`uploadsCommittedRef`, the new
draft-clear call, the animated-success timing). Rebuilding it as a separate
navigable screen this session would have been a materially larger, riskier
change for no functional gain, against CLAUDE.md's smallest-safe-change rule.
Flagged here rather than silently dropped — a future phase that revisits the
wizard's shape can fold this in then.

**Files touched:** `screens/PostJobScreen.tsx` (draft persistence) ·
`ui/primitives/MediaUploader.tsx` (new) · `ui/primitives/index.ts` (export +
DEFERRED-block update + primitive-count correction) ·
`dev-tools/ComponentCatalog.tsx` (catalog section) ·
`tests/postJobDraft.test.mjs` (new) · `tests/mediaUploader.test.mjs` (new).
No screen on the locked list (01–07, 48) was touched. No migration was
written — Phase 4 needed zero schema change.

## Phase 4 second session (2026-08-08) — full slice + phase49

Ran under an explicit autonomous-execution brief with a direct authenticated
DB connection (project ref confirmed against `.env` before any change).

### Built
- **phase49** (see Migrations applied). Live-schema audit first: `jobs` had
  a single `budget_cents`, an unused legacy `scheduled_for` (0 of 119 rows,
  zero code references — left untouched), and no window columns;
  `job_locations` already carried `address_line`/`access_notes` (phase43)
  but required coords. The audit also found `fetchJobsByClient()` ALREADY
  carries the Gate-2 `.not('status','eq','draft')` filter — the Known-issues
  entry saying it had no filter was stale and is corrected below.
- **Wizard step 3 (screen 14):** exact service address field (→
  `job_locations.address_line`, private), a 14-day date chip row, and four
  preset arrival-window chips (Morning 8–11 / Midday 11–2 / Afternoon 2–5 /
  Evening 5–8, plus Flexible). No datetime-picker dependency added — chips
  cover the real cases and store honest values.
- **Wizard step 4 (screen 15):** editable MIN/MAX budget fields (both
  optional = open to bids), range-aware review card plus Timing and private
  Address rows. Hire mode keeps its single offer-amount field.
- **Step 2 (screen 13):** `MediaUploader` wired in for photos (10) and video
  (1, ≤60s) — the hand-rolled pickers are gone (guard test added). The
  ownership conflict session 1 flagged is resolved by a new caller-supplied
  `shouldDeleteOnRemove` override on the primitive: the screen passes
  "not in the job's original media", which is exactly right for fresh posts,
  restored drafts AND edit mode. `onPressItem` (photo viewer) and
  `videoMaxDurationSec` were added to the primitive at the same time.
- **Screen 16:** the fresh-post success is now a real `SuccessScreen`
  template configuration — "View job and bids" (straight to
  ClientJobDetail, which shows the job's real, currently-zero bids) /
  "Keep browsing". Copy explains bids arrive as workers respond; no match
  counts, no fake certainty. Edit/hire success keeps the old overlay.
- **Screen 51 (WorkerJobDetail):** budget renders as the range; arrival
  window row; "Posted by" trust card (real profile + counted posted/
  completed history, rendered only once loaded); "Est. payout after fee"
  card driven by a local named `ESTIMATED_PLATFORM_FEE_RATE = 0.1` with
  copy stating it is an estimate and payments are not live.
- **Screen 39 (ClientJobDetail):** budget range in the hero, a
  "Timing & address" card (window + private address with a privacy caption).
- **Screen 38 (MyJobsHub):** a dashed "Draft — not published yet" resume
  card under the Active view when the local wizard draft has content.
- **Draft persistence moved to `lib/postJobDraft.ts`** (one canonical
  implementation; the hub reads the same record). Same `v1` key; a
  pre-range draft's single budget folds into `budgetMax`; a
  slipped-into-the-past `scheduledDate` is dropped on restore.
- **lib/jobs.ts:** new columns in `Job`/`OpenJob`/both projections,
  `budgetRangeLabel`/`hasBudget`/`arrivalWindowLabel`/`fetchClientJobStats`,
  `fetchJobLocation` now returns `address_line` (PostJobScreen is its only
  caller — verified).

### Judgment calls (each per the brief's least-new-architecture rule)
- **Budget range = `budget_min_cents`/`budget_max_cents`; `budget_cents`
  stays and is mirrored server-side to `coalesce(max, min, legacy)`** —
  LOCKED Worker Home (48) and every legacy reader render `budget_cents`,
  and 48 may not be touched, so the ceiling (a real customer-stated number,
  not an invented midpoint) keeps those surfaces truthful. The RPCs are the
  only writers of the mirror.
- **Arrival window lives on `jobs` (public)** — a worker deciding to bid
  needs it, and a time window doesn't identify a household the way the
  address does. Stored as `scheduled_date` + local wall-clock hour pair
  (NOT timestamptz): the window is a promise about the job's neighborhood
  and must render identically for every viewer.
- **Address = `job_locations.address_line`** (job_private_details per the
  phase43 decision), `lat`/`lng` relaxed to nullable-as-a-pair because a
  typed address has no GPS fix (no geocoder exists). Radius/hotspot RPCs
  do arithmetic on coords, so null-coord rows simply never match.
- **`update_job_details` was extended in the same migration** — its old
  body deleted the `job_locations` row whenever an edit arrived without
  coords, which would have silently destroyed a saved private address the
  first time a poster edited a title. Now the row is removed only when the
  edit carries neither coords nor an address, and the upsert preserves
  `access_notes`. Its ownership/open-status/zero-bids guards are unchanged
  (the bids check now also covers `job_offers` directly — strictly
  stronger).
- **Old-build compat:** every new RPC param is defaulted, and the old
  nine-argument call shape was proven live (rolled back). Known, accepted
  wrinkle: a pre-phase49 build EDITING a job clears range/window fields its
  UI never showed — its single-budget edit wins, matching what that build
  displays.
- **Submit-a-bid CTA on 51 was NOT un-wired.** The brief assumed no working
  submit flow exists; in fact the screen's bid flow (createMarketplaceOffer,
  retargeted in 3B) is live and device-verified in the Phase 3 pass.
  Un-wiring it would regress working, verified functionality for zero gain.
  Kept exactly as-is; Phase 5's OfferComposer replaces it wholesale.
- **Distance on 51 is NOT rendered.** Exact coords are RLS-protected from
  browsing workers and no public coarse point exists on `jobs`; inventing
  one is Phase 8's discovery-model change (§E lists distance with the
  discovery/maps family). Coarse area text renders as before.
- **MyJobsHub was NOT rebuilt onto CommitmentsList** (§P.2 — it is a
  working tabbed hub whose filters already map the live enum; Open ≙ its
  Active view). DB `draft` rows remain deliberately EXCLUDED from the hub:
  in the live schema a draft jobs row is an unsent direct-offer negotiation
  (Gate 2, phase45 decision doc), not a customer's wizard draft — the
  brief's "add (draft, published) filter" is thereby satisfied in
  substance: published (=open) rows from the DB, the wizard draft from
  lib/postJobDraft.
- **The wizard was NOT rebuilt onto FormScreen's wizard mode** — it is
  already a working 4-step wizard with draft persistence and upload
  cleanup; rebuilding the container is churn with no functional gain
  (same call session 1 made implicitly; recorded explicitly now).
- **Hire-mode photo cap stays 5** — hire requests go through
  `create_offer()`, whose server cap is untouched (offer RPCs are Phase
  5's; altering them is on this brief's forbidden list). Server video cap
  stays 2 everywhere as a permissive superset; the UI offers 1 per the
  atlas.
- **`ESTIMATED_PLATFORM_FEE_RATE = 0.1`** is an assumption, clearly labeled
  in code and copy. Phase 5's sandbox checkout owns the real fee math.
- **No dependency added.** AsyncStorage was already present (session 1);
  date/window input is chip-based.

### Phase 4 second-session verification
- **Automated two-account proof: PASS.** One transaction against the live
  DB, RLS engaged exactly as PostgREST engages it (`set local role
  authenticated` + transaction-local `request.jwt.claims`), two real,
  distinct profile ids:
  1. As the customer identity, `create_job()` published a job with range
     (40–60), window (Aug 12, 8–11), and a private address.
  2. As the worker identity, `fetchOpenJobs()`'s exact column projection
     and status filter returned the job — range and window included
     (`budget_cents` correctly mirrored 6000) — proving Worker Home's data
     path sees it.
  3. As the worker identity, `job_locations` for that job returned **0
     rows** — the address is unreadable before hire.
  4. As the owner, the same read returned the address.
  5. `ROLLBACK` — a follow-up count proved zero probe rows remain.
  This is the brief's option 3 (two real identities through RLS), not a
  service-role read. **PHYSICAL TWO-DEVICE CONFIRMATION: NOT RUN.**
- **Old-call-shape compat: PASS** (also rolled back) — `create_job` with
  only the nine pre-phase49 named arguments resolves and mirrors
  `budget_cents` = 5000 with null range.

### Phase 4 second-session test changes (deliberate, itemised)
Baseline entering: 217/219. Now **218/220** — same two pre-existing
failures (`pwa` frozen web string; `setupOnboarding` CRLF), net +1 test.
- `customerCore.test.mjs` — "Post Job is a guarded four-step presentation":
  `'View my jobs'` / `title="Back to home"` assertions retargeted to screen
  16's real actions (`'View job and bids'` / `'Keep browsing'` /
  `<SuccessScreen`). The old labels were the pre-atlas success overlay this
  phase replaces.
- `customerCore.test.mjs` — "no paid-service claims": `arrival window`
  removed from the forbidden-claims regex — phase49 made it a real,
  schema-backed feature, so it is no longer an unbacked reference-mock
  claim. `protected payment/funds`, `fit percentage`, `available today`
  all remain forbidden.
- `postJobDraft.test.mjs` — storage-key/AsyncStorage assertions retargeted
  to `lib/postJobDraft.ts` (the helpers moved there); PostJobScreen must
  now import from it. Every behavioural invariant (fresh-post-only, route
  seed wins, autosave gating, clear-on-publish/abandon, no AppState
  handler) is asserted unchanged.
- `mediaUploader.test.mjs` — +1 test: PostJobScreen must render
  `<MediaUploader`, must NOT contain `launchImageLibraryAsync` (no parallel
  picker path may regrow), and must supply the `shouldDeleteOnRemove`
  ownership overrides.

### Gate (second session)
- **tsc / lint:** PASS (clean, incl. `--noUnusedLocals --noUnusedParameters`).
- **tests:** 218/220, only the two documented pre-existing failures.
- **verify-schema:** PASS — 139 OK / 0 MISSING / 0 PENDING after phase49.
- **locked screens:** PASS — screens 01–07 and 48 untouched (no diff).
- **mode-smoke:** N/A — no navigation/mode/route-registration change
  (screen 16 renders inside the existing PostJob route; "View job and
  bids" navigates to already-registered routes).
- **rls-probe:** no policy touched (verified: phase49 contains zero policy
  statements). The rolled-back two-account proof above additionally
  re-exercised the job_locations boundary as real identities.
- **dev catalog:** compiles with the extended MediaUploader (new props all
  optional; catalog fixture updated for the new OpenJob fields). The
  on-device catalog + representative-screen eyeball rides the user's
  device pass below.

### ⚠ Operational note for the user
While running a one-off compat check, a malformed PowerShell-quoted psql
call echoed the full database connection string — password included — into
this session's stored transcript. The credential is not in the repo or in
any file, but the transcript itself should be treated as having exposed it:
**rotate the database password in the Supabase dashboard** at your
convenience, and prefer script-file-based psql invocations in future
sessions (every other DB call this session used `-f`).

## What Phase 4 still needs from a real device (the user's closing pass)

No device/simulator was available in either session, and Expo is never
started from an agent session. Automated equivalents passed where they
exist; these remain the on-device closing checklist:

- **Physical two-device post→discover→open** — the automated RLS-engaged
  two-account proof PASSED (see above), but the literal two-phone run is
  the DoD's own wording. While there: confirm the published job shows its
  budget range, arrival window, and payout estimate on the worker's
  JobDetail, and that no exact address appears anywhere on it.
- **Draft survives an actual app kill** — force-quit mid-wizard (now
  including address/date/window/min-max fields), relaunch, confirm restore;
  also confirm the My Jobs "Draft" card appears and resumes it.
- **Failed media upload preserves prior state, on-device** — MediaUploader
  is now live in step 2 (airplane-mode a second upload and confirm the
  first tile survives).
- **Dev catalog + one real screen per affected template** — MediaUploader
  changed, so eyeball its catalog section plus PostJobScreen step 2, and
  screen 16 after a publish.
- **Mode-isolation smoke** — unaffected by this phase (no nav/mode edit),
  but worth reconfirming before Phase 5 builds on top.

## Phase 5 — what was built (2026-08-09, autonomous session)

Per BRAZOS_MASTER_PLAN.md §J, Phase 5 (LARGE), screens 26–32, 52, 53. The
full hire loop: bid/direct-offer/counter → compare → accept → sandbox
protected checkout → authorized → held → job confirmed. **STOPS at held** —
no completion, evidence, dispute, release, earnings, or payout surface was
built, and none can be reached: no function in the database or the app can
move a payment past `held`.

### Database (phase50 — applied by the agent, idempotency-proven, verified)
- **The pre-repo `payments` scaffold was EXTENDED, not replaced.** The audit
  found a `payments` table and `payment_status` enum that predate every
  numbered migration (like `bids`): 0 rows ever, no triggers, no code
  references, a `stripe_payment_intent_id` column from an abandoned era.
  BUILD_STATE's old "no payment implementation at any layer" claim was about
  implementation, not the inert table — corrected here. phase50 adds §H.3's
  missing enum values (`unfunded`, `authorized`, `paid_out`, `voided`,
  `partially_refunded`; the legacy `pending` label is unwritable and kept
  only because enum values cannot drop), columns kind/offer_id/provider/
  provider_ref/authorized_at/held_at/updated_at, integrity checks, a
  one-active-payment-per-(job,kind) partial unique index, and phase29-style
  explicit write revokes under the kept parties-only SELECT policy.
- **Sandbox checkout RPCs**: `sandbox_authorize_job_payment()` /
  `sandbox_hold_job_payment()` — named sandbox because they ARE the sandbox
  provider (fabricated `sandbox_<uuid>` refs, `provider` CHECK-locked to
  'sandbox'). Both idempotent; amount comes from the accepted offer, never
  the client; fee is 0 (no authoritative fee schedule exists — screen 51's
  10% stays a labeled estimate).
- **`withdraw_offer()`** — §H.2 withdrawn: the AUTHOR of a pending revision
  retracts it; the recipient's exit remains decline. Frees the
  one-live-chain slot.
- **`job_offers.expires_at`** — default now()+7 days on new rows (counters
  included, each a fresh window); existing pending rows deliberately NULL =
  never expire (no retroactive expiry of live negotiations). 7 days is a
  product default recorded here, not a §H number.
- **Expiry gates** in create/counter/decline/accept + `my_pending_offers()`
  (signatures unchanged — the six legacy shims keep delegating; the
  phase47-over-phase46 body-supersession precedent). Semantics, proven by
  the automated proof: accept/counter REFUSE a lapsed offer (a refusal's
  expired-flip rolls back with its own error — transaction semantics);
  decline and create_offer's re-bid sweep PERSIST the expired flip;
  my_pending_offers() excludes lapsed rows; clients render lapsed-pending
  as expired via `effectiveOfferStatus()`.
- Applied via psql script file over the authenticated direct connection,
  re-applied to prove idempotency, then confirmed by a green
  `node scripts/verify-schema.mjs` — all 6 phase50 checks flipped
  PENDING→OK via the `sandbox_payments_enabled()` sentinel. NOTE: the file's
  enum ADD VALUE statements run as standalone autocommit statements ahead of
  its main transaction (the phase45/46 lesson, one file instead of two) —
  first application must be via psql, not a transaction-wrapping editor.

### Client architecture
- **`lib/adapters/payments.ts` + `lib/adapters/paymentsMode.ts`** — the
  06_DEFERRED phoneAuth template applied to money: a provider-neutral
  `PaymentProvider` interface, ONE functional implementation (sandbox,
  calling the two phase50 RPCs), a fail-closed disabled provider, and a
  pure, test-executed mode resolver. A RELEASE binary requesting sandbox is
  refused with a config error (`EXPO_PUBLIC_PAYMENTS_MODE`; default sandbox
  in dev, disabled in release). Deliberately absent from the interface:
  release/refund/payout — an interface method nothing implements is an
  invitation to fake it; Phase 6 widens the boundary.
- **`lib/payments.ts`** — the ledger's types and its one read
  (`fetchJobPayment`, RLS payer/payee). `PaymentStatus` now lives here as
  the DB mirror; `ui/primitives/StatusPill` re-exports it (one definition,
  same string values, MoneyText untouched).
- **`lib/offers.ts`** — `withdrawOffer()`, `isOfferLapsed()`,
  `effectiveOfferStatus()`, `expires_at` in the row type and projection.

### OfferComposer (§E's required consolidation)
`components/OfferComposer.tsx` is the one offer-terms form: context-typed
(bid | counter), shared `validateOfferAmount()` + `OfferAmountField`,
in-flight ref guard + disabled CTA (double-tap safe), failure alerts and
returns without clearing entered terms, consequence copy above the CTA.
Screens 52 and 30 render it whole; the PostJob hire wizard (screen 26's
existing, device-verified direct-offer entry) now renders the shared
`OfferAmountField` and validates through `validateOfferAmount()` — one
validation, one presentation, three contexts, no third form. Terms are
price + message: the canonical `job_offers` row carries exactly those
(schedule/scope live on the JOB via phase49), and no column was invented.

### Screens
- **52 SubmitBid** (new, worker): OfferComposer bid context; replaces
  JobDetail's inline custom form; on success REPLACES itself with BidSent
  so Back cannot re-submit. Registered in every stack that mounts JobDetail
  (worker Home, MyJobs, Map) — the PostJob/WorkerHomeStack registration gap
  is the failure mode this avoids, and tests/offerComposer.test.mjs pins it.
- **53 BidSent** (new): SuccessScreen config; honest copy (customer decides,
  withdrawable while pending, 7-day self-expiry).
- **51 JobDetail** (wired): listed-price quick bid KEPT verbatim; custom
  form → "Write a bid" → SubmitBid; "Your bid" card gains expiry line +
  Withdraw (confirmed); lapsed bids render expired with a fresh-bid path;
  bid state re-read on focus; payout-estimate copy updated to sandbox-honest
  wording ("no real money is charged or paid out through the app yet").
- **27 Job & bids** (= ClientJobDetail, wired): Compare button (>1 bid),
  per-card "Full bid · counter or decline" link into BidDetail, accept
  confirm copy now names supersession + the sandbox checkout step, accept
  success navigates INTO Checkout (replacing the old overlay-then-hub
  flow), assigned-state payment card (held → MoneyText caption; unfunded →
  "Protect payment in checkout" CTA), payment re-read on focus.
- **28 CompareBids** (new): DetailScreen template; value/price/rating sort
  (existing lib/offers scoring — price is one option, never the layout),
  best-value highlight, trust fields per row; row → BidDetail. A comparison
  surface, deliberately not an auction hammer: accept lives one deliberate
  step away, behind its consequence copy.
- **29 BidDetail** (new): full terms, worker record (profile link,
  verification, rating, completion), expiry, consequence block, and the
  three decisions — accept (confirm → accept_offer → replace with
  Checkout), counter (→ 30), decline (confirm). Waiting state when the
  turn is the worker's.
- **30 Counteroffer** (new): OfferComposer counter context; original terms
  visible beside the proposed ones; popTo ClientJobDetail on success. (The
  chat thread's AmountPrompt counter — the direct-offer negotiation UI —
  stays as the working legacy path; this route is the bid-side counter
  that never existed before Phase 5.)
- **31 Checkout** (new): DetailScreen template over the ADAPTER only (no
  RPC strings, no table access — test-pinned). Visible SANDBOX banner
  (VerifyPhoneScreen precedent), summary (accepted offer, agreed amount,
  schedule, "Platform fee: None in sandbox", total), authorize/hold/release
  explainer ("in this build, funds can never leave protection"), one
  confirmed funding action running authorize→hold (both idempotent; a
  half-completed attempt resumes from the ledger's truth; failure copy
  states the accepted offer is unchanged). Customer surface: no worker
  payout info (V2 rule). Owner-only; disabled-mode and not-assigned states
  wired.
- **32 JobConfirmed** (new): renders its celebration ONLY when the ledger
  reads `held` (anything less shows the truthful state + a path back to
  checkout). Hired worker, terms, schedule, MoneyText held caption +
  payment StatusPill, sandbox note; actions View job / Message worker
  (existing chat — no Phase 7 work).
- **WorkerJob** (wired, minimal): payee-visible payment card — held shows
  "funds in protection… released only after approval", sandbox-labeled.
  This is the existing worker post-hire surface for checklist item 19.
- **Chat thread** (wired, minimal): OfferCard thread variant offers
  Withdraw to the pending revision's AUTHOR while awaiting the other side;
  ChatScreen confirms and calls withdraw_offer. Accept/decline/counter
  paths untouched.

### Phase 5 test changes (deliberate, itemised)
Baseline entering: 218/220. Now **230/232** — same two pre-existing
failures (`pwa` frozen web string; `setupOnboarding` CRLF), net +12 tests.
- `tests/offerComposer.test.mjs` (new, 6): composer canonicality across the
  three contexts; RPC-wrapper-only writes; double-tap/input-preservation;
  JobDetail routes to SubmitBid with no revived inline form; withdraw +
  expiry wired client-side; SubmitBid/BidSent registered in every
  JobDetail-mounting stack + the customer loop routes in MyJobs.
- `tests/sandboxCheckout.test.mjs` (new, 6): release-binary-can't-run-
  sandbox EXECUTED against the real resolver; no provider SDK dependency or
  import; adapter-only money paths and no client ledger writes; on-screen
  SANDBOX label + consequence confirm + funding guard; JobConfirmed gated
  on `held`; no hand-written released/paid captions and no release/payout
  RPC call anywhere.
- `customerCore.test.mjs` — two retargets: "Worker job detail" now asserts
  the SubmitBid navigation + withdraw instead of the removed inline
  `handleSubmit`; "no paid-service claims" drops `protected payment|funds`
  from the forbidden regex (the Phase-4 'arrival window' precedent: phase50
  made protection a real persisted state, and sandboxCheckout.test.mjs now
  guards that surface's honesty). `fit percentage` / `available today`
  remain forbidden.

### Phase 5 — automated proof (scripts/phase5-proof.sql)
**PASS — 27 assertions, exit 0.** One transaction against the live DB, RLS
engaged exactly as PostgREST engages it (`set_config('role',
'authenticated')` + transaction-local `request.jwt.claims`), THREE real
active identities (customer, worker A, worker B), ended in ROLLBACK with a
post-rollback zero-residue check (0 probe jobs / offers / payments / bid
mirrors; the payments table is back to 0 total rows). Mechanism reported
honestly: this is the Phase-4 mechanism — real identities through RLS in a
rolled-back transaction — NOT a physical two-device pass, and the one piece
of fixture surgery (rewinding one probe offer's expires_at as table owner
to make expiry testable inside a single transaction) is declared in the
script header. Sections:
- **A** bid path: publish (range mirrored) → worker opens job → bids →
  pending/awaiting-customer/7-day deadline → customer sees both bids +
  my_pending_offers.
- **B** counter: child row, parent superseded, linkage auditable, turn
  flips to worker; superseded parent can never win.
- **C** acceptance: atomic stamp (assigned, worker, accepted_offer_id,
  final 4800), exactly one accepted offer, sibling superseded in the same
  transaction; repeated accept idempotent (no second hire); losing sibling
  unacceptable.
- **D** checkout: non-owner refused; authorize → authorized row (amount
  from accepted offer, sandbox provider/ref, fee 0, payee = hired worker,
  offer_id audit link); authorize retry returns the SAME row; hold → held
  (+held_at); hold retry safe; exactly one ledger row; payee reads held.
- **E** negatives: decline settles; author withdraw works; unrelated
  account cannot withdraw/decline another's offer; recipient cannot
  withdraw (author-only); expired offer cannot be accepted; a non-raising
  touch (decline) persists `expired`; after decline/withdraw/expiry the
  worker opens a fresh chain.
- **F** privacy: address unreadable to both workers pre-hire; hired worker
  reads it post-accept; losing worker still cannot; workers cannot read
  each other's offers; unrelated worker cannot read the payment row.
- **G** money honesty: payment is `held` (never released/paid_out/legacy
  pending), provider is sandbox, and no release/payout function exists in
  the schema.

### RLS probe (scripts/rls-probe-offers.mjs, extended)
`payments` joined the anon cases. Run this session: **3 passed, 0 failed
(anon cannot read job_offers / bids / payments), 3 skipped** — the
authenticated cases need the user's PROBE_* credentials, absent in this
session by design. Exit 2 (inconclusive) is reported as exactly that, not
as a pass; the equivalent participant isolation ran live in the automated
proof (sections F3/F5/F6) as real identities.

### Judgment calls (each recorded per the brief)
- **No job_status enum change; `accept_offer` still assigns.** §H.1's
  pending_payment/confirmed would strand every installed build mid-hire
  (their My Jobs filters and transition_job_status know only the legacy
  values) — the same break class the phase46/47 shims exist to prevent.
  "Confirmed" is the derived, truthful state assigned + payment held,
  rendered from the ledger; the §H.1 enum migration rides the future
  version-gate phase that retires the shims.
- **`payments` extended in place** rather than a new §G-named table — the
  brief's own rule ("if the existing payments schema already supports
  Phase 5, use it"), plus one-ledger-no-duplicates (§O).
- **Fee = 0, stated on screen.** No authoritative fee formula exists
  (06_DEFERRED: fees are an open product/legal decision); inventing one in
  a money table would be fabricated marketplace data. Screen 51's 10%
  stays an explicitly-labeled estimate.
- **Checkout shows no worker payout figure** — CLAUDE.md V2: customer
  surfaces carry no worker payout info; that outranks the execution
  prompt's "worker-side amount if legitimately known".
- **One implementation commit, not the negotiation/checkout pair** — both
  halves share lib/navigation.ts + sharedStacks.tsx; any split commits a
  broken tree, and "no broken intermediate state" outranks the preferred
  milestone split. The migration and the proof/docs are separate commits.
- **Counters carry no message** — counter_offer()'s two-arg signature is
  live and verified; widening it means drop/recreate for a nicety the
  amount-only UI serves. Recorded, not smuggled.
- **Expiry default = 7 days; pre-phase50 pending rows never expire** — no
  retroactive expiry of live negotiations by fiat.
- **StatusBadge gained declined/expired/superseded colours** (additive
  keys only; existing states untouched).
- **SubmitBid inherits the documented JobDetail leak**: JobDetail is
  reachable from the shared Map/MyJobs stacks in customer mode (Known
  issues, Phase 8's MarketJobPreview closes it), so SubmitBid technically
  is too. Same leak, same owner, not widened — bidding still requires the
  server to accept the caller as a non-owner authenticated user.

### ⚠ Migration-file note (recorded, not hidden)
phase50's file was edited once AFTER first application, while still inside
this unclosed phase: a comment truth-up only (the expires_at COMMENT ON
overclaimed "flipped on touch"; the proof showed a refusal's flip rolls
back with its own error). No executable behaviour differed; the file was
re-applied idempotently and re-verified. The never-edit rule is understood
to protect closed, verified phases (phase29–32 etc.), not a same-session
file that has never been through a phase gate.

## Phase 5 gate (2026-08-09)
- **tsc / lint:** PASS (clean, incl. --noUnusedLocals --noUnusedParameters).
- **eslint:** NOT RUN — still not installed, no config. Unchanged since
  Phase 1 (DECISIONS.md D13).
- **tests:** **230/232 PASS.** Only the two documented pre-existing
  failures. +12 new Phase-5 guards, two deliberate retargets (itemised).
- **verify-schema:** **PASS** — every group green; all 6 phase50 checks
  flipped PENDING→OK via sentinel; exit 0.
- **locked screens:** PASS — screens 01–07 and 48 untouched (no diff).
- **mode-smoke:** PASS at the compile level (tests/mode.test.mjs all green;
  cross-tree navigation still a tsc error). New routes live only inside
  existing stacks; no tree/mode/switch change.
- **rls-probe:** anon layer PASS (3/3 incl. new payments case);
  authenticated cases SKIPPED for credentials (exit 2, inconclusive —
  reported as such); participant isolation proven live by the automated
  proof instead.
- **automated two-account proof:** PASS (27 assertions, rolled back, zero
  residue).
- **dev catalog:** compiles; no catalogued primitive changed visually
  (StatusPill's PaymentStatus is a type-source move; MoneyText untouched).
  On-device catalog eyeball rides the user's device pass.
- **device/simulator:** **NOT RUN** — no device this session; Expo is never
  started from an agent session.

**Phase 5 gate: green for everything checkable without a device. Phase 5 is
explicitly NOT closed** until the user runs the two-device hire-loop pass
below.

## Phase 5 — physical two-device checklist (the user's closing pass)

DEVICE A = customer account · DEVICE B = worker account. Use a fresh test
job, not a real customer's. Expected state is listed after every action.

1.  **A:** Home → Post a job → complete the wizard (title/category/photos →
    location + exact address → budget range 40–60 → Publish). *Expect:
    screen 16 "Job published", then My Jobs → Active shows the job as
    Open.*
2.  **B:** Worker Home → open the new job. *Expect: budget range, arrival
    window if set, payout ESTIMATE card (10% wording, sandbox note), NO
    exact address anywhere.*
3.  **B:** Tap **Write a bid**. *Expect: the SubmitBid screen (52) with the
    job context card and the customer's budget.*
4.  **B:** Enter an amount (e.g. 45) and a pitch; note the consequence line
    (withdrawable, 7-day expiry). *Expect: Send bid enabled; double-tap
    sends exactly one bid.*
5.  **B:** Send. *Expect: Bid Sent (53) — amount, job title, withdraw/expiry
    copy; Back does NOT return to a re-submittable form.*
6.  **B:** Back on the job detail. *Expect: "Your bid" card, Pending badge,
    "accept until <date>" line, Withdraw bid button.*
7.  **A:** My Jobs → the job. *Expect: "1 bid to compare"; the bid card
    shows B's name, rating, amount, pitch, "Full bid · counter or decline".*
    (Optional: a second worker device bidding here makes step 8 richer and
    step 13 provable in the UI.)
8.  **A:** With 2+ bids, tap **Compare**. *Expect: CompareBids (28) — rows
    with rating/completion/amount/pitch; Best value highlight; sort control;
    lowest price is a sort option, not the default layout.*
9.  **A:** Open a row. *Expect: BidDetail (29) — full terms, worker card →
    profile, expiry line, the Accept/Counter/Decline consequence block.*
10. **A:** Tap **Counter**, send a lower amount (e.g. 42). *Expect:
    Counteroffer (30) shows B's original terms beside your field; after
    send, back on the job the bid list shows the negotiation awaiting B.*
11. **B:** Reopen the job (or My Jobs). *Expect: the counter at 42 awaiting
    B; B's original bid shows superseded/replaced in its history.*
12. **B:** Accept the counter (from the offer surface). *Expect: accept
    confirm names the consequence; then the job appears under My Jobs as
    Assigned for B.*
13. **A:** (If a rival bid existed) check it. *Expect: no longer pending —
    superseded; it cannot be accepted from anywhere.*
14. **B:** Open the assigned job. *Expect: the exact service address is NOW
    visible to B. On any other worker account, it still is not.*
15. **A:** The job (ClientJobDetail). *Expect: "PAYMENT NOT PROTECTED YET"
    card + **Protect payment in checkout** → Checkout (31).*
16. **A:** Checkout. *Expect: SANDBOX banner; agreed amount 42; "Platform
    fee: None in sandbox"; authorize/hold/release explainer; confirm dialog
    stating sandbox authorize+hold and no real money. Confirm.*
17. **A:** *Expect: Job Confirmed (32) — B named as hired, $42 with
    "Funds held in protection", schedule if set, sandbox note. Double-tap
    on the checkout button earlier must NOT create a second payment (the
    proof verified the ledger enforces one row; the UI disables in flight).*
18. **A:** Back on the job. *Expect: "PROTECTED PAYMENT · SANDBOX" card
    with the held caption; the checkout CTA is gone.*
19. **B:** My Jobs → the assigned job (WorkerJob). *Expect: the payee
    payment card — "PAYMENT PROTECTED · SANDBOX", $42, "released only
    after the finished work is approved… no real money". This is an
    EXISTING worker surface; no Phase-6 screen was built for it.*
20. **A + B:** Sweep every Phase-5 screen just used. *Expect: the words
    "Released" / "Paid" appear NOWHERE except inside the explainer's
    future-tense "Release happens only after…" copy; every money label is
    authorized/held/protected with the sandbox note.*

While there (unchanged by this phase but load-bearing under it): the
mode-isolation smoke — switch modes both ways, tab re-press, no cross-tree
leak — and withdraw/decline: on a fresh bid, B taps Withdraw (bid card
returns to "Write a bid"), A declines another bid (it leaves the pending
list and cannot be accepted).

## Phase 6 — what was built (2026-08-09, autonomous run)

All work against STAGING (`brazos-staging`); production untouched. The run's
staging bootstrap (ACL repair + full migration replay + green verify) is
recorded in DECISIONS.md "RUN RESUMED".

**Database (supabase/phase51_active_work_lifecycle.sql, applied + verified):**
- `jobs.en_route_at` / `arrived_at` — §9's whole tracking scope: static,
  monotonic, worker-declared moments via `mark_worker_arrival(job, step)`
  (assigned status only; arrived backfills en_route; idempotent). NO live
  location anywhere. `jobs.completed_at` — stamped by transition_job_status
  (same signature, body re-created), starts the auto-release clock.
- `job_checklist_items` — worker-owned direct RLS DML (the message_reads
  treatment), both parties read, writes close outside assigned/in_progress.
- `job_disputes` + `dispute_status`/`dispute_reason` enums — RPC-only writes
  (`open_job_dispute` / `withdraw_job_dispute`), one open per job (partial
  unique), SELECT for the two parties. An open dispute freezes BOTH release
  paths. Refused once released.
- `sandbox_release_job_payment` — the third sandbox RPC (§9): held→released,
  payer-only, completed-only, dispute-frozen, idempotent-on-released,
  `released_at` + `release_reason='approved'`.
- `job_payment_state` — party-only payment read that runs the 72h on-read
  auto-release (`release_reason='auto_approved'`); the repo's no-cron rule.
- `sandbox_tip_worker` — one tip per job (partial unique index), only after
  release, $0.01–$1,000, born `released`. payments gained `released_at`,
  `release_reason` (CHECK'd).

**Client:**
- `lib/jobLifecycle.ts` — THE derivation point (run addendum §1):
  pending_payment/confirmed/en_route/arrived/in_progress/awaiting_approval/
  disputed/completed from status+payment+timestamps+dispute. TRACK_STEPS +
  trackStepIndex for the timeline surfaces. When §H.1 finally lands, this one
  file is the swap point.
- `lib/checklist.ts`, `lib/disputes.ts`; `lib/payments.ts` gained
  released_at/release_reason, isReleased(), fetchJobPaymentState(),
  fetchJobTip(); `lib/jobs.ts` gained the three timestamps + markWorkerArrival.
- Payment adapter widened: releaseJobPayment + tipWorker (sandbox = the RPCs,
  disabled = refuse). Refund/payout still deliberately absent.
- Screens: RouteArrival 56 (DetailScreen), WorkChecklist 57 (FormScreen),
  TrackWorker 33 (DetailScreen timeline), ApproveOrDispute 36 (FormScreen —
  approve/release, report-issue form, withdraw), ReviewAndTip 37 (gated on
  released; ReviewSection + tip presets/custom). All in MyJobsStack.
- Rewired: WorkerJobScreen (arrival/checklist entries, release-aware payment
  card, reads via job_payment_state), ClientJobDetailScreen (Track worker
  button; completed section now forks on the payment: approve CTA / dispute
  card / review CTA / legacy inline review only when no payment exists),
  CheckoutScreen copy updated (release now exists, honestly described).

**Deliberately NOT built (recorded):** completion_records table (evidence
stays on jobs.completion_* — no parallel system), checklist item caps, live
maps/ETA, dispute resolution (admin/human, later phase), MyJobsHub card
changes, review timing enforced in DB (Phase 10 owns review hardening).

## Phase 6 gate (2026-08-09)

- tsc `--noEmit`: clean · lint (`--noUnusedLocals --noUnusedParameters`): clean
- `npm test`: **240 pass / 2 fail — exactly the two documented baseline
  failures** (PWA config.js version string; setupOnboarding CRLF mis-slice),
  signatures identical to the §0 baseline. +10 new phase-6 guards
  (tests/lifecycle.test.mjs). Two Phase-5 guards in sandboxCheckout.test.mjs
  were updated deliberately (release now exists) — itemised in DECISIONS.md.
- `node scripts/verify-schema.mjs`: green incl. phase51 group (12 checks).
- `scripts/rls-probe-offers.mjs`: **6 passed / 0 failed / 0 skipped** with the
  seeded identities.
- `scripts/phase6-proof.sql`: **28 PASS**, single transaction as three real
  identities through RLS, ROLLBACK, zero residue (sections A–H: fixtures via
  real RPCs, arrival auth+monotonicity, checklist RLS both directions,
  completed_at stamping, dispute freeze incl. the auto clock, payer-only
  idempotent release, tip gates, 72h auto-release fired + recorded).

## Phase 6 — physical checklist (the user's closing pass, PENDING)

Seed first: `psql -X -v ON_ERROR_STOP=1 -f scripts/seed-phase-6.sql
"$SUPABASE_DB_URL_STAGING"` (re-runnable; resets the fixtures). Accounts
(password `brazos-test-1234`): `phase6.customer@brazos.test` (Casey),
`phase6.worker@brazos.test` (Wren). App `.env` must point at staging.

Device W = signed in as Wren (Worker mode), device C = Casey (Customer mode).

1. **W** · My Jobs → "Assemble a bookshelf" → expect status Confirmed card,
   payment card "Funds held in protection", buttons Route & arrival / Work
   checklist / Start job.
2. **W** · Route & arrival → expect the exact address (1400 S 5th St), the
   9 AM–12 PM window, both steps unchecked → tap "I'm on my way" → step 1
   checks, button becomes "I've arrived".
3. **C** · My Jobs → same job → Track worker → expect timeline Hired ✓ +
   "On the way" ✓ with a timestamp, "no live location" notice visible.
4. **W** · "I've arrived" → C pull-refresh Track worker → Arrived ✓.
5. **W** · back → Work checklist → add "Unbox parts", "Attach shelves" →
   check off "Unbox parts" → expect 1 of 2 done.
6. **W** · Start job → status In progress. Route & arrival now read-only
   ("arrival is behind you").
7. **W** · checklist → check off the second item → Finish up → add 1 photo →
   Mark complete.
8. **C** · job detail → expect "The work is done — your call" card → Review &
   approve → expect the completion photo, held payment card, Approve & release
   + Report an issue.
9. **C** · Report an issue → pick "Work is incomplete" + details → Send →
   expect the red Issue reported card; the pinned button is now Withdraw
   report. **W** · job → expect the payment note saying an issue holds the
   funds.
10. **C** · Withdraw report (confirm) → back to Approve & release → confirm →
    expect replace to Review & tip with "PAYMENT RELEASED · SANDBOX".
11. **C** · leave 5★ review with a comment → submit → expect the quoted
    review card. Tip $5 → confirm → expect the tip row "Released to worker".
    Tap $10 again → expect the SAME $5 tip (one per job).
12. **W** · job → expect payment card "Released to worker · released on
    approval" wording and (Phase 5 card) review section for the client.
13. **C** · My Jobs → "Mount a closet shelf" (the pre-completed fixture) →
    Review & approve → Approve & release → Review & tip works end-to-end
    without the walk (shortcut QA).
14. Re-run the seed script → both jobs reset to their starting states.

## Exact next task (Phase 6 — was, now superseded; kept for context)

Per BRAZOS_MASTER_PLAN.md §J, Phase 6 (LARGE), screens 33–37, 55–58.
Blocked on Phase 5's device verification per §K's critical path
(`0 → 1 → 2 → 3 → 4 → 5 → 6`) — start only after the user confirms the
two-device hire-loop pass above.

**Goal:** confirmed → en route → arrived → in progress → completion
evidence → approve/dispute → completed, with held funds released honestly
— Phase 6 is where a payment may first move past `held`, through the
approval flow and a deliberate widening of the payment adapter.

**Carried forward, explicitly NOT Phase 5's job:**
- The six legacy shims, the projection trigger,
  `project_offer_chain_to_bids()` and `v_bids_projection_drift` retire together
  in the first phase that ships a version gate — Expo update-gating or a
  store-side forced update. See §11 of the decision doc. That phase must also
  update the phase18/29/30/36/38 groups in `verify-schema.mjs`, which currently
  require the shims to exist, AND owns the §H.1 job-lifecycle enum migration
  (pending_payment/confirmed/en_route/… — see the Phase 5 judgment call on
  why accept_offer still assigns).
- **Generated database types still do not exist.** `supabase gen types` needs
  the CLI plus a local Postgres or a service-role connection, none of which is
  present, and adding either is a flaggable dependency. `StatusPill`'s
  job/offer unions stay local until then (its PaymentStatus now mirrors the
  DB via lib/payments.ts).
- **Release/refund/payout and the payment states past `held`** — Phase 6's
  approval flow widens the PaymentProvider interface and adds the first
  RPC that may move money past held. `stripe_payment_intent_id` (the dead
  scaffold column) is a version-gate-phase deletion candidate.
- Phase 6 also owns: checklist/completion_records/disputes tables if
  needed, transition validations, the 72h auto-approve on-read check, and
  screens 33–37/55–58. Do NOT reuse `transitionJobStatusWithoutRpc`'s
  legacy fallback for any new transition.
- `MarketJobPreview` and customer-safe job browsing (Phase 8) — SubmitBid
  now inherits JobDetail's documented customer-mode reachability leak; both
  close together there.
- The latent `PostJob` / `WorkerHomeStack` navigation gap (Known issues) — a
  navigation-phase change, deliberately NOT fixed by registering the route
  in the worker tree. Re-confirmed untouched this phase (SubmitBid/BidSent
  were registered by the JobDetail rule, which does not touch PostJob).

## Phase 7 — what was built (2026-08-09, autonomous run)

**Kept (decision, recorded):** screens 40/41/61/62 stay on the existing
MessagesInboxScreen/ChatScreen — the crosswalk already marked them COMPLETE,
and the system beneath them (Realtime postgres_changes, media + voice +
unsend, reactions, negotiation cards, read markers, the conversations view)
is real and device-proven. Rebuilding them onto ui/templates would have been
churn without behavior; template migration belongs to the Phase 13 sweep.

**Database (supabase/phase52_offer_scoped_chat.sql, applied + verified):**
- AFTER INSERT trigger `job_offers_thread_autocreate` →
  `ensure_thread_for_offer()` (security definer, no client EXECUTE, failure
  can never lose the offer insert) calls phase36's `ensure_direct_thread()`
  for the offer's pair. Every offer path — create, counter, future — now
  guarantees the pair's thread from the first offer.
- Backfill: threads ensured for every distinct pair with a still-pending
  offer (2 pairs on staging at apply time).
- Deliberately unchanged: message RLS (job thread = client + assigned worker
  only; direct thread = its two parties), the conversations view (a thread
  surfaces in the inbox once it has a message — so ten bids do NOT create
  ten empty inbox rows; the silent thread is reached from the offer
  surfaces), addresses never auto-inserted anywhere.

**Client:**
- `fetchDirectThreadWith(userId, otherId)` (lib/conversations.ts) — pure
  lookup; nothing client-side creates threads.
- Chat entries: BidDetail "Message {worker} first" (customer, pre-decision);
  JobDetail's own-bid card "Message {poster}" (worker). Chat registered in
  WorkerHomeStack + MapStack per the existing "alongside JobDetail" rule.
- Quick replies mode-specific: WORKER_CHAT_TEMPLATES /
  CUSTOMER_CHAT_TEMPLATES + chatTemplatesForMode(); QuickReplies reads
  useMode() (perspective from ModeContext, never a prop).

## Phase 7 gate (2026-08-09)

- tsc/lint: clean · `npm test`: **245/247 — same 2 documented baseline
  failures**, +5 new guards (tests/offerScopedChat.test.mjs).
- verify-schema: green incl. phase52 sentinel · offers RLS probe: 6/6.
- `scripts/phase7-proof.sql`: **10 PASS**, zero residue — offer→thread
  auto-create, pair-only visibility, both parties write/read, outsider
  blind + insert-refused, inbox view + read-marker truth for both parties,
  and the job-thread boundary re-proven against a bidder.

## Phase 7 — physical checklist (the user's closing pass, PENDING)

Seed: phase-6 seed, then `psql -X -v ON_ERROR_STOP=1 -f
scripts/seed-phase-7.sql "$SUPABASE_DB_URL_STAGING"`. Devices as in the
Phase 6 checklist (W = Wren/worker mode, C = Casey/customer mode).

1. **C** · Messages tab → expect ONE unread conversation from Wren
   ("SEED phase-7: Hi! I bid on the yard work…"), unread dot visible.
2. **C** · open it → chat opens with Wren's message; quick replies show the
   CUSTOMER set ("How's it going?" / "Any update?" / "When can you start?" /
   "Thank you!") → send "When can you start?" → back to inbox → unread dot
   gone.
3. **W** · Messages tab → the same thread shows Casey's reply unread → open →
   quick replies show the WORKER set ("On my way" / "Running late" / …).
4. **C** · My Jobs → "Rake and bag the front yard" → open Wren's bid detail →
   "Message Wren first" lands in the SAME thread (no duplicate conversation).
5. **W** · Home → open the yard-work job (own-bid card) → "Message Casey" →
   same thread again.
6. **W** · send a photo from the library in that thread → **C** sees it
   arrive live without leaving the screen (realtime + media).
7. **C** · sign in as Blake (phase6.workerb@brazos.test) on a third session
   if available: Messages tab must show NOTHING of the Casey↔Wren thread.
8. Re-run seed-phase-7 → Casey's thread unread again (reset works).

## Phase 8 — what was built (2026-08-09, autonomous run)

**No schema change.** The phase41 `jobs_within_radius()` was audited and
kept; its correctness is now PROVEN, not assumed (scripts/phase8-proof.sql
against scripts/seed-phase-8.sql's controlled fixtures at 2/4/20 miles):
5-mile search returns exactly the two near jobs, 25-mile all three, measured
distances 2.00/4.01 mi, the RPC's declared row type carries no raw
coordinates (checked against the catalog), and job_hotspots() covers the
same seeded area (grid/radius agreement).

**§10 leak closure (the phase's spine):**
- `components/MarketJobPreview.tsx` — the customer-safe rendering of an open
  job: EST. PRICE (budget vocabulary), approximate `location` string only,
  posting media, poster identity, and ONE action — switchMode()'s confirmed
  switch. Zero worker vocabulary, enforced by a comment-stripping guard test.
- `screens/JobDetailScreen.tsx` — delegates to MarketJobPreview whenever
  reached in customer mode on someone else's job. Closed AT THE SCREEN: no
  navigation path (map drill-down, MyJobs, retained route) can bypass it.
- `screens/SubmitBidScreen.tsx` — refuses customer mode outright with the
  same confirmed-switch affordance.

**Worker job filters (screen 50):**
- `lib/jobFilters.ts` — pure model: category set, budget floor (a job with
  NO stated budget always survives a floor — an open negotiation is not a
  low budget), newest/pay/distance sorts (no-budget can never rank
  best-paying; rows without distance sink). Unit-tested in node.
- `components/JobFilterSheet.tsx` over the ui Sheet primitive; wired into
  WorkerResultsScreen (header badge, filtered-empty state with clear,
  distance sort offered only in geo modes). Filters apply AFTER the mode
  picks its base set, so a filtered "nearby" list stays honestly within its
  stated radius.

**Deferred, with reasons (recorded in DECISIONS):** the pannable-map
swipe-card rework (19/49), Rebook 08 as a screen, Explore-services 17 as a
distinct screen.

## Phase 8 gate (2026-08-09)

- tsc/lint clean · `npm test`: **252/254 — same 2 documented baseline
  failures**, +7 new guards (tests/discovery.test.mjs).
- verify-schema: green (no schema change; phase51/52 groups still green).
- `scripts/phase8-proof.sql`: **3 PASS** (radius boundaries, distance
  honesty + no-raw-coordinates, grid/radius agreement). Offers RLS probe
  last ran 6/6 this session; no policy or grant changed in Phase 8.

## Phase 8 — physical checklist (the user's closing pass, PENDING)

Seed: phase-6 seed, then `psql -X -v ON_ERROR_STOP=1 -f
scripts/seed-phase-8.sql "$SUPABASE_DB_URL_STAGING"`. W = Wren (worker),
C = Casey (customer).

1. **W** · Home → View all → filter icon → select Cleaning → Show jobs →
   only cleaning jobs remain ("Deep-clean a two-bed apartment" among them);
   header badge shows 1.
2. **W** · filters → min budget $50+ → the $40 cleaning job drops, the
   no-budget "Rehang a sagging gate" stays visible.
3. **W** · filters → sort Highest budget → "Clear the back fence line" ($90)
   leads; no-budget jobs sit at the bottom.
4. **W** · near Waco with location on: Home → the "within 5 miles" pill →
   expect the 2mi and 4mi seeded jobs, NOT the 20mi one; filter sheet now
   offers "Closest first"; picking it orders 2mi before 4mi.
5. **W** · clear filters from the empty/filtered state → full list returns.
6. **C** (customer mode) · Map tab → drill into a Waco cell → open a seeded
   job → expect the CUSTOMER-SAFE preview: "EST. PRICE", "approximate area",
   NO bid button, no payout figures; the only action is "Switch to Worker
   Mode to bid", which asks before switching.
7. **C** · confirm the switch → lands in Worker Mode; reopen the same job →
   full worker detail with bid entry returns.
8. Cold-start check: reopen the app in customer mode and deep-open any open
   job from Map again — preview, never the bid surface.

## Branch `env-parity-fix` — device-bug pass (2026-08-09)

Six commits on top of 2339344. Tree clean, nothing pushed. Base is
`mainexpo`; CLAUDE.md's required-branch rule was waived by the user for this
branch specifically, twice, in writing.

  f304fbd  cross-tab navigation guard
  09d99a7  Job details top safe-area inset
  6b6f7ce  one platform-fee source of truth
  6af4426  offers RLS probe actually runs
  34e138d  Map "See All Jobs" gated to worker mode
  5ca304d  setupOnboarding CRLF slicing

**Three reported bugs, and what each turned out to be.**

1. *Worker Home chips dispatch an unhandled `WorkerResults`.* No name
   mismatch exists: declared once in `lib/navigation.ts`, registered once in
   `navigation/WorkerRoot.tsx`, one spelling everywhere. Deliberately NOT
   renamed and NOT aliased. The real defect was the failure CLASS — four
   screens crossed tabs with a hand-cast `getParent().navigate(tab,
   {screen})`, which tsc cannot check, and two named a `Home` route that
   exists in one mode only (`MapScreen` → BrowseJobs, customer mode;
   `PostJobScreen` → HomeMain, worker mode). `navigateAcrossTabs()` in
   `lib/navigationRef.ts` now holds the check and the dispatch together and
   is the only way to cross tabs; `tests/crossTabNavigation.test.mjs` fails
   if a second way appears.
2. *Header over the status bar.* `JobDetailScreen` main render was
   `edges={['bottom']}` while its own not-found branch was `['top','bottom']`.
   Edge is now conditional on the hero (full-bleed photo keeps its own
   `insets.top` back button). Only screen in the repo with the defect —
   `tests/layout.test.mjs` now fails on any bottom-only SafeAreaView.
3. *Contradictory platform fee.* Standardised on **0%**, from the ledger:
   every `insert into public.payments` writes `platform_fee_cents = 0`
   (phase50/51/58). `PLATFORM_FEE_RATE` + `platformFeeCents()` +
   `workerPayoutCents()` live in `lib/payments.ts`; JobDetail, Checkout and
   Earnings all derive from them. `tests/platformFee.test.mjs` also asserts
   the SQL still writes 0, so the client constant cannot silently diverge
   from the RPCs.

**Two things that were being carried as true and were not.**

- The offers RLS probe had NEVER run its authenticated cases — it read
  `PROBE_*` from `process.env` only, so all three reported SKIPPED and every
  run was INCONCLUSIVE while reading as green. Now sourced from `.env`
  (git-ignored) using the `scripts/seed-phase-6.sql` fixtures, shell still
  overriding. **Real result: 6 passed, 0 failed, 0 skipped, exit 0**, target
  job `b6c00000-0000-4000-8000-00000000000c`. `SUPABASE_SERVICE_ROLE_KEY` is
  still forbidden in `.env` and that prohibition is restated in
  `.env.example`.
- `setupOnboarding` → "navigation only ever follows a successful write" was
  never a SetupScreen defect. `screens/SetupScreen.tsx` is CRLF (471 CRLF, 0
  bare LF) and the test sliced with `indexOf('}\n\n')`, which cannot match
  CRLF: it returned −1, `slice(start, −1)` widened to the whole handler, and
  the assertion inspected the success path it was written to exclude.
  Measured: `indexOf('}\n\n') = −1`, `indexOf('}\r\n\r\n') = 523`. Test-only
  fix (LF normalisation at read + a non-negative terminator assertion). No
  patch owed against the LOCKED screen. `'}\n\n'` was the only fragile needle
  in all 24 test files; needles starting with `\n` are safe.

Suite: **284 passing, 1 failing** — `tests/pwa.test.mjs` only, the documented
frozen-web `config.js?v=` mismatch. `verify-schema` green. LOCKED_MANIFEST
untouched throughout.

## Branch `env-parity-fix` — physical checklist (the user's closing pass, PENDING)

Both items are device evidence I could not gather myself. Everything else on
this branch is verified by test or by executed probe.

1. **Cold-start navigator error — unreproducible at HEAD by static analysis;
   needs one device run to close.** No `linking` prop on `NavigationContainer`,
   no navigation-state persistence, and the only automatic launch-time
   dispatch (`getLastNotificationResponseAsync` replay) routes through
   `TAB_FOR_SCREEN` to MyJobs/Messages/Profile — never Home. The stale-bundle
   theory matches the precedent at line 490 of this file but was never
   confirmed.
   - `npx expo start -c` (the `-c` matters — a warm Metro cache is where the
     stale-bundle theory hides). Force-quit from the app switcher; a Fast
     Refresh reload is not a cold start, and a LogBox overlay from an earlier
     tap survives a reload.
   - **Run A, customer mode:** cold launch, touch nothing ~10s. Then Map tab
     → "See All Jobs" must be ABSENT.
   - **Run B, worker mode:** switch, force-quit, cold launch, wait. Map tab →
     "See All Jobs" PRESENT → tap → Worker Home.
   - Nothing in the console on both runs ⇒ confirmed stale bundle, close it.
     A `[nav] dropped cross-tab target <Tab>/<Screen> — not handled by the
     navigator this mode mounted` line (`lib/navigationRef.ts:142`) ⇒ the
     guard caught a real cross-tree dispatch and the line names the culprit.
     Red box with NO `[nav]` line ⇒ a dispatcher nobody has found; capture the
     full stack. Note the prefix changed: push drops now read `[nav]`, not
     `[push]`.
2. **Worker Home chips — verified by test, not on device.** They do not cross
   tabs at all (in-stack push where `WorkerResults` is a sibling of
   `BrowseJobs`), so `navigateAcrossTabs()` is not on their path and nothing
   about them was broken at HEAD. `tests/crossTabNavigation.test.mjs`
   enumerates every literal the screen dispatches — `WorkerResults`,
   `JobDetail` — and asserts each is registered in `WorkerRoot`. Run B above
   taps them on the way; a red box there means the running bundle disagrees
   with source, which is the same stale-bundle question as item 1.

## Device finding 2026-08-10 — `PostJob` NAVIGATE not handled (SEPARATE, OPEN)

**This is not the "See All Jobs" item above.** That one (physical checklist
item 1) stays OPEN and unaltered — different route name, different trigger
(launch vs tap), different dispatch mechanism. Recorded separately on purpose.

Reported from device: `The action 'NAVIGATE' with payload
{"name":"PostJob","params":{}} was not handled by any navigator`, customer
mode, attributed to the Customer Profile screen, fires on tap. **No `[nav]`
line**, which is itself informative: `navigateAcrossTabs()` warns on every
target it drops, so its absence proves the dispatch never went through the
cross-tab guard. This was a plain in-stack `navigation.navigate()`.

**Registration map — every stack, verified by reading each navigator:**

| Stack | `PostJob` registered |
| --- | --- |
| `CustomerHomeStack` | yes — `navigation/CustomerRoot.tsx:42` |
| `MyJobsStack` | yes — `navigation/sharedStacks.tsx:97` |
| `MessagesStack` | yes — `sharedStacks.tsx:109` |
| `MapStack` | yes — `sharedStacks.tsx:126` |
| `ProfileStack` | yes — `sharedStacks.tsx:151` (+ ParamList `lib/navigation.ts:313`) |
| `WorkerHomeStack` | **NO — the only gap in the repo** |

In customer mode `WorkerHomeStack` is not mounted, so **every mounted stack
registers `PostJob`.**

**`screens/ProfileScreen.tsx` cannot produce this error.** It contains no
`'PostJob'` literal, no dynamic navigate, no `getParent()`, and no
`navigateAcrossTabs` import. Its only targets are ProfileReviews,
NotificationSettings, Notifications, Earnings, ServicesPricing, SavedWorkers,
PaymentMethods, LegalDocument, ComponentCatalog, AdminReports.

**Payload fingerprint pins the dispatcher.** `params:{}` means an object
literal whose every value was `undefined` (`JSON.stringify` drops those) —
NOT a params-less call, which omits the `params` key entirely. Across all 10
call sites exactly one can emit it:

- `screens/HomeScreen.tsx:145` — `initialDescription: query.trim() || undefined`,
  which is `{}` whenever the search box is blank. **Only match.**
- `MyJobsHubScreen.tsx:145`, `WorkerSearchScreen.tsx:324` — no params at all,
  would print `{"name":"PostJob"}`.
- The four hire sites (`SavedWorkersScreen:129`, `WorkerProfileScreen:287,336`,
  `ClientJobDetailScreen:640`, `ChatScreen:604`) always send a defined
  `hireWorkerName` via a `?? 'this worker'` fallback — never empty.
- `useJobOwnerActions.ts:91` sends `{editJobId: jobId}`; empty only if `jobId`
  were undefined, which the hook's own owner gate rules out.

**Contradiction, and why it still points at the bundle.** The fingerprint says
Customer Home (screen 07, LOCKED) — whose stack registers `PostJob` at
`CustomerRoot.tsx:42`. The reported screen says Profile — which dispatches
`PostJob` nowhere. **Both readings are unreachable at HEAD in customer mode.**
That is the same shape as the resolved 2026-08-08 entry earlier in this file,
including the identical route name and identical empty payload, and the lesson
recorded there applies unchanged: a symptom the code provably cannot produce is
a bundle problem until shown otherwise. Note also that `PostJob` only joined
`ProfileStack` in phase-9 (`b51804d`), so a device bundle predating that commit
would fail from the Profile tab exactly as reported.

~~**NOT fixed by registering `PostJob` in `WorkerHomeStack`** — see Known issues
above. Posting a job is a customer action; §F routes cross-mode actions through
an explicit confirm plus `switchMode()`. That gap is deliberate and stays.~~
**SUPERSEDED 2026-08-10, same day (user decision after device reproduction):
registered.** See the resolution block below and the session section at the end
of this file.

**Real coverage gap this exposed — CLOSED by a new guard.**
`tests/crossTabNavigation.test.mjs` guarded *cross-tab* literals only. Nothing
asserted that an *in-stack* `navigate('X')` literal is registered in every stack
its screen is mounted in — precisely the failure class reported here, and the
class the `WorkerHomeStack` gap belongs to. Added: **"every in-stack navigate
target is registered in each stack its screen is mounted in"** — it parses the
three navigator files into stack → registered routes and component → stacks it
is mounted in, then asserts every `navigation.navigate('X')` literal in each
screen resolves in ALL stacks that screen is mounted in.

**Proven non-vacuous, not merely green.** With the exemption disabled the guard
reports exactly one failure — `WorkerProfileScreen in WorkerHomeStack ->
'PostJob' NOT registered`. So it demonstrably goes red on the real gap, and it
passes only because that gap is exempted BY NAME (`WorkerHomeStack::PostJob`);
any *accidental* new gap still turns it red. It also carries two anti-vacuity
assertions (all six stacks parsed; `PostJobScreen` mounted in ≥5 stacks) so a
broken regex cannot make it pass by matching nothing.

Side effect worth recording: this is the first **executed** confirmation of the
long-standing Known Issue that "Send an offer" from a worker profile opened via
the worker Home tab would fail. It had only ever been asserted in prose.

**NEW, SEPARATE FINDING — four unguarded `getParent()` tab hops (OPEN, not fixed).**
The previous pass routed cross-tab jumps through `navigateAcrossTabs()`, but its
guard only catches the NESTED form (`navigate('Tab', {screen})`) and only scans
`screens/`. Four bare tab-level hops still bypass the helper entirely:

- `hooks/useJobOwnerActions.ts:119` — `navigation.getParent()?.navigate('MyJobs' as never)`
- `screens/BidSentScreen.tsx:40` — `(navigation as any).getParent()?.navigate('MyJobs')`
- `screens/HomeScreen.tsx:162` — `navigation.getParent()?.navigate('Map')` — **screen 07, LOCKED**
- `screens/JobDetailScreen.tsx:277` — `(navigation.getParent() as unknown as {...}).navigate(...)`

**None is a live crash**: all four target SHARED tabs (`MyJobs`, `Map`) that
exist in both trees, so they resolve in either mode. They are the same latent
CLASS as the fixed cross-tab bugs, not instances of it. Deliberately NOT fixed
this pass: one of the four is a locked screen, so a guard that went red on them
could not be satisfied without touching locked code, and rewriting the other
three is a behaviour change outside a bug-diagnosis pass. Owner: the same future
navigation phase that owns the `WorkerHomeStack` decision.

**Also uncovered by any guard:** navigate literals dispatched from `hooks/` and
`components/` against a caller-supplied navigation object — e.g.
`useJobOwnerActions.ts:91` dispatches `PostJob` for `components/JobOwnerActions.tsx`,
rendered by `ClientJobDetailScreen` and `JobDetailScreen`. Those screens' stacks
all register `PostJob`, so it is safe today; it is unverified rather than wrong.

**RESOLUTION (2026-08-10, same day).** The user reproduced the crash twice on
a real dev build (5G, cold launch, not Expo Go) and identified the dispatcher
as the guard's own named gap: the worker tree. The "customer mode / Customer
Profile screen" attribution in the original report was the misleading part —
the static analysis above (ProfileScreen dispatches PostJob nowhere; customer
mode registers it everywhere) remains correct and is exactly why the report
was unreproducible AS ATTRIBUTED. The real surface was the worker Home tab,
which mounts THREE screens that dispatch `PostJob` — WorkerProfile ("Send an
offer", plain navigate), Chat (re-hire, object-cast navigate), JobDetail
(own-job Edit via useJobOwnerActions, function-cast navigate) — while being
the only stack of six not registering it. The two cast forms were invisible
to both tsc (hand-cast by construction) and the guard's original regex, which
is how three live crash paths hid behind one prose comment.

**Fixed by registering, per explicit user decision overriding the Phase-3
"Do NOT fix by registering" stance** (that stance predates Phases 5–9, which
registered PostJob in all four shared tabs — a worker-mode session could
already post from My Jobs, Messages, Map, and Profile, so the §F isolation
argument had already been decided the other way by the standing
every-stack-that-surfaces-a-user rule; worker Home was the one inconsistent
stack left). Changes: `lib/navigation.ts` WorkerHomeStackParamList + 
`navigation/WorkerRoot.tsx` registration; `tests/mode.test.mjs` "worker code
cannot name the customer post/search routes" now guards HomeMain/WorkerSearch
only (the real §F Home-tab boundary); the crossTabNavigation guard's
exemption is REMOVED (no exemptions remain), its matcher widened to all three
dispatch shapes in the repo (plain, object-cast, function-cast — with a
getParent lookback exclusion for tab hops), `INDIRECT_DISPATCHES` covers the
useJobOwnerActions hook path via its two host screens, and a ChatScreen
canary asserts the cast matchers stay alive (both its in-stack targets are
cast-form). LOCKED screens untouched.

## Branch `env-parity-fix` — session 2026-08-10 (PostJob fix · scheme · transitions)

**Connectivity: SOLVED, both prior threads superseded.** The user is on
Tailscale — Metro reachable at `100.105.206.93:8081` from anywhere over LTE.
The two threads from the previous report are closed unactioned: the Expo
shared-ngrok session cap (ERR_NGROK_108) no longer matters because tunnel mode
is no longer needed, and no Windows firewall rule was added because the LAN
path is no longer the transport. Metro was left running and untouched
throughout this session.

**A. PostJob crash — FIXED.** See the RESOLUTION block in the 2026-08-10
device-finding section above. One registration closed three live crash paths
(WorkerProfile offer, Chat re-hire, JobDetail own-job Edit — all in the worker
Home tab); guard exemption removed; mode test retargeted to the real §F
boundary (HomeMain/WorkerSearch).

**B. "Unable to determine the default URI scheme" — NOT a missing scheme; no
config change made, deliberately.** The warning's source is
`@expo/cli/build/src/utils/scheme.js:166-175` (`getManagedDevClientSchemeAsync`):
in a managed project (no ios/ or android/ dirs — this repo) the CLI resolves
the dev-client deep-link scheme by requiring `expo-dev-client/getDefaultScheme`
from the project, and **expo-dev-client is not installed and never has been**
(`git log -S expo-dev-client -- package.json` is empty), so the require throws
and the CLI prints exactly this warning. It never reads app.json's `scheme` on
that path. app.json has carried `"scheme": "brazos"` since `8eee70d` (long
before any current build), so the installed binary's Info.plist already
registers `brazos` — changing the scheme to the bundle identifier
(`com.brazos.app`) would DESYNC the installed app for zero gain, which is
exactly what the task's own constraint forbade. Consequences of the warning:
none for the Tailscale workflow (the binary attaches to Metro directly; only
QR-code/deep-link launching into a dev client is degraded, and there is no dev
client). **Decision owed by the user, not taken unilaterally (new dependency):**
install `expo-dev-client` + rebuild if dev-client QR launching is ever wanted;
otherwise the warning is cosmetic and correctly ignored.

**C. Dead transitions — no code cause exists at HEAD; the discriminating step
is a rebuild, not a code change.** Checked, in the order the user specified:
1. *Reanimated babel plugin:* N/A by design — reanimated is not installed
   (CLAUDE.md: built-in `Animated` only, no animation library), so no plugin
   belongs in babel.config.js (which holds only babel-preset-expo + dotenv),
   and native-stack transitions do not use reanimated in the first place —
   they are react-native-screens' native UINavigationController transitions.
2. *Version skew:* none possible from this checkout — package.json
   `react-native-screens ~4.16.0` = package-lock `4.16.0` = node_modules
   `4.16.0`, and package.json has not changed since long before the emerald
   phases (its newest commit predates them; the SDK became 54 in `d252932`,
   2026-07-24), so ANY binary built from this repo since then embeds the same
   native versions the JS expects.
3. *enableScreens():* not called anywhere and not needed — native-stack
   enables native screens itself.
4. *animation:'none' / animationEnabled:false / presentation overrides:*
   zero hits repo-wide (App.tsx, navigation/, screens/, ui/, modes/, lib/).
   All six stack navigators pass only `{ headerShown: false }`;
   `bottomNavScreenOptions` is pure tab-bar styling; no env-parity-fix commit
   touched navigator options.
Remaining candidates are all binary/runtime-side, uninspectable from the repo:
the installed debug binary's actual build commit, or a screens-4.16/Fabric
runtime issue on this device (SDK 54 defaults the New Architecture on; app.json
sets no `newArchEnabled`). **Next step (user, on the Mac that built the binary):
rebuild the debug app from current HEAD (`npx expo run:ios`). Transitions
return ⇒ stale binary, closed. Still dead ⇒ flag before acting: the probes are
`"newArchEnabled": false` in app.json or a react-native-screens patch bump —
both build-affecting decisions, neither taken here.**

**Bug hunt (beyond the assigned three).** The widened guard is the durable
yield: the two cast-form dispatch shapes were invisible to tsc AND to the
original guard regex, and both existed in WorkerHomeStack as live crash paths
(Chat re-hire, JobDetail own-job Edit) — same root cause, same fix, now
covered by test including a canary that fails if the cast matchers rot.
Reviewed clean: all `navigateAcrossTabs` call sites (targets registered in
both trees, params match declared shapes), `lib/notificationRoutes.ts`
TAB_FOR_SCREEN (shared tabs only, guarded helper, DROP semantics preserved),
and the three remaining `getParent()` tab hops (documented latent class —
all target shared tabs, none can crash; `HomeScreen.tsx:162` is LOCKED).

**Gate (measured, not predicted):** tsc/lint clean; **285/286 tests, 0
skipped** — the single failure is the documented frozen-web PWA
`config.js?v=` mismatch. Same totals as the session baseline by construction:
the guard upgrades added assertions inside existing tests (the cast canary,
the six-stack floor), not new test cases. LOCKED screens and manifest
untouched.

**Still OPEN, unchanged:** the "See All Jobs" cold-start item (physical
checklist item 1 above) — explicitly out of scope this session, by user
instruction. Worker Home chips remain verified-by-test only (Run B still taps
them whenever it happens).

## Branch `pre-review-hardening` — session 2026-08-10 (six-item hardening pass)

**Branch note, stated up front:** the brief named `pre-review-hardening`, whose
tip (a6bde00) predated the env-parity work — but the work items referenced
`lib/errorMessage.ts` and `navigateAcrossTabs()`, which existed only in the
env-parity commits. History was LINEAR (a6bde00 is a strict ancestor of
6b079b7), so `pre-review-hardening` was **fast-forwarded** to 6b079b7 (`git
merge --ff-only` — no merge commit, nothing rewritten, every commit previously
reported) and the session's one commit sits on top. Nothing pushed.

**1 · Raw-error sweep — every unlocked surface now routes through
`lib/errorMessage.userMessage()`.** Fixed at the HOOK level (every consumer
inherits): useHotspots, useJob, useJobOffers, useMyJobsHub, useProfile,
useVoiceRecorder (its two fallbacks preserved via the fallback arg),
useJobOwnerActions. At the SCREEN/COMPONENT level: AdminReports (×4), CellJobs,
NotificationSettings (×2), PostJob (×4, incl. the map-pin partial-failure
template line), ProfileReviews, Profile (×3), WorkerSearch, WorkerProfile,
OfferComposer (×2 — its better 23505 wording kept, userMessage as fallback),
PortfolioPicker (×3), ReportDialog, ReviewSection (×2). LOCKED hooks
(useChat/useConversations) got wrapped at their UNLOCKED render seams
(ChatScreen:627-ish, MessagesInbox) with pointers to the patch doc; the one
chain locked at BOTH ends (useOpenJobs → BrowseJobs:351) is patch-doc item A7.
Guard: `tests/errorMessage.test.mjs` replaced its 14-screen list with an
ALL-screens/components/hooks sweep whose regex also catches `err`/`firstError`
variants the old one missed, plus a seam-wrap assertion for the two locked-hook
consumers; the 6-file allowlist names each locked exception and why.

**2 · Navigation sweep — zero unguarded tab hops outside one locked file.**
Converted to `navigateAcrossTabs()`: useJobOwnerActions:119, BidSentScreen:40,
JobDetailScreen:277 (all previously hand-cast `getParent()` hops). The fourth —
HomeScreen.tsx:162, LOCKED — is patch-doc item A8 and is the only name on the
new guard's allowlist: `tests/crossTabNavigation.test.mjs` now fails on ANY
`getParent(` in screens/, hooks/, or components/ outside that allowlist.

**3 · Own-job exclusion from Potential Earnings — NOT implementable without a
locked file; delivered as patch-doc item A5 with the exact diff.** The sum is
inline in LOCKED screen 48 (`stats` memo, BrowseJobsScreen:105-109) and its
data source `useOpenJobs` is itself a do-not-patch file, and data-level
filtering is wrong anyway (the card must STAY in the feed with Edit intact).
The ready diff excludes `job.client_id === profile.id` rows from cents+count
only, uses ModeContext-free ownership (no new prop), and names the unit tests
that land with it. Flagged as a release blocker in the doc (wrong money math
on the primary worker surface).

**4 · State-coverage audit — matrix over 30 routed data screens; three gaps
filled, all with existing components.** Filled: **NotificationSettings** (load
failure used to alert once then silently render DEFAULT_PREFS as if saved —
now an inline warn banner + Try again, alert removed for the load path only);
**MapScreen** (error banner gained Try again wired to the hook's existing
refresh); **WorkerResults** (no recovery path existed — RefreshControl added
to the FlatList, wired to useOpenJobs.refresh). Audited N/A, no fill:
Counteroffer/SubmitBid (param-driven, submit errors live in OfferComposer),
PaymentMethods (static sandbox surface), TrackWorker (primary content is
param-driven; its two secondary strips deliberately keep-last-known on error
per the hardening run's A8 precedent). Everything else already carried
loading/empty/error+retry from earlier passes. "Offline" app-wide is the
error+retry path with connection wording via userMessage — no NetInfo
dependency exists and none was added.

**5 · Phase58 backward compatibility (written verdict — no fix, no
migration).** An installed build running THIS code against a pre-phase51–58
schema (production today, per PROD_APPLY.md) **does not crash anywhere**:
every touch point returns a handled `{error}` that renders as the friendly
VERSION_SKEW banner. The worker FEED works (OPEN_JOB_COLUMNS is ≤phase49,
lib/jobs.ts:290). Exact degraded sites: every job DETAIL read
(lib/jobs.ts:293 JOB_COLUMNS selects en_route_at/arrived_at/completed_at →
42703 → WorkerJob/ClientJobDetail/TrackWorker/notification tap-throughs);
lib/earnings.ts:32 (released_at/paid_out_at → Earnings);
lib/notifications.ts:27 (pre-56 outbox is sealed → Notifications);
lib/checklist.ts:25-56 (42P01 → WorkChecklist); lib/disputes.ts:55/71/84
(ApproveOrDispute reporting); lib/adapters/payments.ts:86/88/96
(release/tip/cash-out PGRST202); lib/payments.ts:148 (job_payment_state →
payment strips absent); lib/jobs.ts:584 (mark_worker_arrival → RouteArrival);
lib/services.ts + lib/savedWorkers.ts + profiles.accepting_work
(ServicesPricing/SavedWorkers/WorkerProfile — the observed device errors);
lib/clientStats.ts:18 (client_job_stats PGRST202 → JobDetail trust row hides,
console.warn only, JobDetailScreen:195-198); lib/profiles.ts:65
(update_my_profile rejects phase53 keys with its own human sentence).
Transitions WORK on old schemas: the 4-arg call resolves against the
phase35-era function, and a PGRST202 falls back to
lib/jobStatusCompatibility.ts:38's guarded direct update (lib/jobs.ts:570).
Non-erroring behavioral gaps that remain on old schemas: the phase58
unfundable-job race (worker Start before checkout → authorize refuses with its
human message), retry-of-landed-transition punished with "Invalid job status
transition", and phases 52/56/57's triggers silently absent (no pre-hire
thread backfill, no notification rows).

**6 · docs/LOCKED_FILE_PATCHES.md written** — the four DECISIONS.md [LOCKED]
findings (useReactions topic collision, useConversations topic+token-refresh
churn, useChat+useOpenJobs rejoin refetch, JobProgress duplicate staging map)
each with exact diff / risk / blocker verdict, plus addendum items A5–A8 from
this session's sweeps (own-job earnings, locked auth raw errors, the
useOpenJobs↔BrowseJobs raw chain, HomeScreen's getParent hop). Release-blocker
verdicts: A5 YES, A7 YES (one line, rides any batch), all others NO.

**Gate (measured):** tsc exit 0 · **288 tests, 287 pass, 1 fail, 0 skipped**
— the single failure is the documented frozen-web PWA `config.js?v=` mismatch;
NO new failures (baseline 285/286 + 2 new guard tests, both passing) ·
`verify-schema` green ("All REQUIRED objects exist"), read-only run. LOCKED
screens, frozen PWA, app.json, dependencies: untouched.

## Branch `pre-review-hardening` — session 2026-08-11 (unhandled GO_BACK fix)

**Symptom (device, confirmed):** `The action 'GO_BACK' was not handled by any
navigator`, on cold start and after landing on a screen via
`navigateAcrossTabs()`.

**Root cause — CONFIRMED as the suspected class, with the precise mechanism.**
`navigateAcrossTabs()` dispatches the NESTED navigate form
(`lib/navigationRef.ts:124`), and React Navigation mounts an unvisited tab's
stack with that target as its INITIAL route — the stack's declared first
screen is NOT underneath it. Every screen reached that way is its stack's
root, and its back control dispatched a bare `goBack()` into a navigator with
nothing to pop. Cold start is the same path: the parked notification replay
(`navigateWhenReady` → `flushPendingNavigation`) lands Chat/ClientJobDetail/
WorkerJob as stack roots. Root-of-stack is therefore a NORMAL state in this
app, not an edge case.

**Fix.** ONE guarded helper in the module that already owns cross-tab
dispatch: `goBackOrHome()` (`lib/navigationRef.ts`) — pops when
`navigationRef.canGoBack()`, otherwise dispatches `navigateAcrossTabs('Home')`,
which lands on the mounted tree's Home tab root. The mounted tree IS
ModeContext's decision in navigation form (§F, exactly one tree mounted), so
the fallback is Customer Home in customer mode and Worker Home in worker mode
with no mode state mirrored into the module and no new prop. 'Home' is the
one tab name both CustomerParamList and WorkerParamList declare.

**Sweep: 43 call sites converted across 24 files** — every bare
`navigation.goBack()` in unlocked screens/, hooks/ (AdminReports,
ApproveOrDispute ×3, BidDetail ×3, BidSent, CellJobs, Chat, Checkout ×3,
ClientJobDetail ×2, CompareBids, Counteroffer, Earnings, JobConfirmed,
JobDetail ×5, LegalDocument ×2, NotificationSettings, Notifications ×2,
PaymentMethods, PostJob ×5, ProfileReviews, ReviewAndTip ×3, RouteArrival ×3,
SavedWorkers ×2, ServicesPricing, SubmitBid ×2, TrackWorker ×3,
WorkChecklist ×2, WorkerJob, WorkerProfile, WorkerResults, WorkerSearch,
useJobOwnerActions). Ten screens whose `navigation` object became fully
unused had the declaration + imports removed (tsc --noUnusedLocals enforced).
`StackActions.popToTop()` in PostJob's leave flows is NOT goBack and stays.

**Locked-file findings deferred (docs/LOCKED_FILE_PATCHES.md §A9):** seven
bare goBack sites in the LOCKED auth flow (SignIn, EmailSignIn,
CreateAccount, EmailCreateAccount, VerifyPhone ×3) — all pushed-from-Welcome,
never cross-tab-landed, so canGoBack is true in practice; risk ≈ nil, no
blocker. `OnboardingFlow.tsx:78` already used the canGoBack-guarded form and
needs nothing (the guard test asserts it stays that form).

**Guards (same mechanism as the cross-tab checks, extended in
tests/crossTabNavigation.test.mjs):** "no bare goBack() dispatch exists
outside the helper and the locked allowlist" (scans screens/hooks/components/
ui; the auth files + OnboardingFlow are the named allowlist) and "back pops
when it can, and lands on the mounted mode home when it cannot" — helper-shape
assertions plus the executed-static both-modes composition: fallback targets
the Home TAB, CustomerHomeStack roots at HomeMain/HomeScreen, WorkerHomeStack
at BrowseJobs/BrowseJobsScreen. (Mounting real navigators is outside the
node:test suite's reach — this is the honest static form of the both-modes
proof, and the device pass is the runtime form.)

**Gate (measured):** tsc exit 0 · **290 tests, 289 pass, 1 fail, 0 skipped** —
the one failure is the documented frozen-web PWA mismatch; NO new failures
(288 baseline + 2 new guard tests, both passing) · verify-schema green.
LOCKED screens, frozen PWA, app.json, dependencies untouched.

## Exact next task (Phase 9 — Profiles, portfolio & worker self-service)

Per BRAZOS_MASTER_PLAN.md §J Phase 9 (MEDIUM), screens 22–25, 43–46, 63–66.
The run continues without stopping at this boundary.

- **Goal:** workers fully manage their public presence; customers get the
  trust surfaces. **DB:** portfolio drafts/publish, services/pricing,
  availability, verification status field. **FE:** WorkerProfile 22/63
  (isOwner), PortfolioGallery 23/Manager 65, PortfolioProject 24,
  ServiceDetail 25, ServicesPricing 64, AvailabilityVerification 66,
  EditProfile 44 (failure-safe avatar), PaymentMethods 45 (sandbox),
  SavedWorkers 46, profile hub 43 polish.
- **Reuse:** existing profile/portfolio code (portfolio_items table,
  WorkerProfileScreen, ProfileScreen). Audit-first via crosswalk rows.
- **Fold in:** Rebook 08 (deferred from Phase 8) belongs with SavedWorkers
  46 — one past-workers surface with hire-again.
- **DoD:** worker edits services/portfolio/availability → customer sees the
  changes; avatar failure preserves the old photo; drafts invisible
  publicly; gate clean.
- **Carried forward:** Phase 6/7/8 physical checklists PENDING; production
  apply queue = phase51, phase52.

## Branch `stability-core-transactions` — run 2026-08-11/12 (core transaction integrity)

Base tag `pre-core-transactions-2026-08-11` (= mainexpo @ aa41328). Closed-scope
autonomous run against AUDIT_2026-08-12.md: P1-09, P1-07, P1-11/P2-19, P2-07,
P2-06, error boundary, P1-01, P1-02. Branch NOT merged, NOT pushed.

**Fixed (one commit each, audit ID in the message):**
- **AUD-P1-09** `initial: false` on navigateAcrossTabs' nested payload
  (lib/navigationRef.ts) — a cross-tab landing never again becomes its stack's
  only route; guard added to tests/crossTabNavigation.test.mjs.
- **AUD-P1-07** post-job draft keyed `brazos.postJobDraft.v2.<uid>`
  (lib/postJobDraft.ts + both consumers); legacy device-global
  `brazos:postJobDraft:v1` DELETED (never migrated) on first authed read.
- **AUD-P1-11 / P2-19** app.json: NSPhotoLibraryAddUsageDescription added;
  bespoke cameraPermission on the expo-image-picker plugin (verified against
  the installed plugin source). app.json's untouched-streak ends deliberately.
- **AUD-P2-07** AuthContext getSession catch/finally — the launch overlay can
  no longer hang forever; session never fabricated nor torn down on failure.
- **AUD-P2-06** ModeProvider sign-out reset now also `setArmed(false)` — a
  second account can no longer race Setup's "Start in" choice; ModeShell
  re-arms on mount.
- **Error boundary** components/AppErrorBoundary.tsx wrapping RootNavigator
  inside NavigationContainer: remount-key reset, __DEV__ error+stack logging,
  token-styled fallback. Render/lifecycle errors only.
- **AUD-P1-01** worker's offer card derives from author_id/awaiting_id (never
  worker_id): respond card (Accept/Decline + INLINE OfferComposer counter —
  the Counteroffer route is MyJobsStack-only and pops to ClientJobDetail, so
  no route reuse), author-only Withdraw, canonical re-read after every action
  including refusals; lib/offers.ts adds fetchOfferChain(). Discoverability:
  inbox badge keys thread-less marketplace chains by counterparty onto the
  pair's direct row (direct:null keying removed); hub card reads "countered —
  respond" via awaiting/author; HubCard gains statusLabel pass-through.
- **AUD-P1-02** canOfferJobFunding() in lib/payments.ts is THE funding-CTA
  derivation (whitelist: owner + assigned worker + status in {assigned,
  in_progress, completed} + no open dispute + payment null-or-authorized;
  everything else NEVER — the double-charge line). ClientJobDetail renders
  from it alone (assigned-only fork and payment-nested "Finish checkout"
  DELETED); ApproveOrDispute's "nothing to release" dead end offers funding
  under the same predicate; Chat's customer-accept routes into Checkout via
  navigateAcrossTabs with an honest fallback. A null ledger no longer renders
  the legacy inline review as settled — the review survives only where no
  funding path exists (pre-payments-era jobs now fund-first by design).

**Migration written, NOT applied:** supabase/phase59_staging_counter_notification.sql
— marketplace-counter notification through the phase20/56 outbox (category
'bids', dedupe offer_countered:<id>, payload screens already in
notificationRoutes.ts; direct offers excluded — their thread message already
notifies). STAGING-only; verify-schema has its sentinel
(counter_notification_enabled, confirmed PENDING against the live DB). The
AUD-P1-01 client fixes stand fully without it.

**Test changes (accounting):** tests/postJobDraft.test.mjs retargeted to the
per-user key + userId call shapes, plus three EXECUTED tests (module run with
AsyncStorage stubbed): per-account isolation, legacy deletion (gone, not
parked), cross-account clear. tests/crossTabNavigation.test.mjs +1 (nested
payload carries initial:false). tests/mode.test.mjs +1 (sign-out disarms).
NEW tests/fundingPath.test.mjs (canOfferJobFunding executed across the full
status × payment matrix with an anti-vacuity count + source pins).
NEW tests/counterResponse.test.mjs (executed effectiveOfferStatus/
countersRemaining + respond/authored card pins + badge keying + phase59 SQL
guards). No unrelated test altered.

**Gate (measured):** tsc exit 0 · lint exit 0 · **308 tests, 307 pass, 1 fail**
— the one failure is the documented frozen-web PWA mismatch. LOCKED screens,
frozen PWA, .env, dependencies untouched (verified by empty diff + sweep).

**Verification (5-agent static walk + sweep, full evidence archived in the
run report):** 31 PASS / 2 FAIL / 5 NEEDS-DEVICE; sweep clean on all mandated
grep categories, no correctness bugs.

**Known issues found, NOT fixed (closed scope):**
1. components/OfferCard.tsx:130 `canAcceptThisOffer` has no awaiting/author
   check → after the customer counters, their OWN counter renders under the
   worker's name with a live "Accept offer" the server always refuses
   ("not your turn"). Same class as AUD-P1-01, customer list side.
2. A marketplace pair that has NEVER chatted has no inbox row at all
   (conversations inner-join messages, by recorded design), so the corrected
   badge has nothing to land on in that case — and when a row exists, the
   tapped Chat shows no negotiation card for marketplace chains.
   Discoverability rests on the hub card + phase59 notification.
3. Low-severity (sweep): JobDetail focus effect dropped its `active` flag
   (React 18 no-op); fetchOfferChain errors swallowed → countersLeft
   transiently 3 (server refuses; self-corrects); JobConfirmed's non-held
   fallback mislabels any non-held row as "authorized".
4. ClientJobDetailScreen's PROTECTED-PAYMENT informational card keeps one
   `payment && isHeld && status==='assigned'` conditional — deliberately NOT
   folded into deriveJobLifecycle (it must render during en_route/arrived too).

**phase59 apply instructions (STAGING `zzkumxcjtbqoselzptig` ONLY — hand-run
by the owner; nothing in this run executed SQL anywhere):**
1. `psql "<staging connection string>" -f supabase/phase59_staging_counter_notification.sql`
   (or paste the whole file into the STAGING project's SQL Editor). Idempotent;
   safe to re-run. Do NOT run against production `avkighsiufeefyycbebf` — it is
   not in the production apply queue until promoted.
2. `node scripts/verify-schema.mjs` (reads `.env`, which currently holds the
   STAGING pair, so the probe targets staging). The apply counts ONLY when the
   `phase59_staging_counter_notification.sql` group's sentinel
   `counter_notification_enabled()` flips PENDING → OK. It was confirmed
   PENDING (404 PGRST202) during this run's verification — i.e. unapplied.
3. Re-run the counter round-trip on two staging devices: exactly one
   "New counter-offer" feed row per marketplace counter, none for
   direct-offer counters, none for roots (those keep `bid_received`).

**Tracked run artifacts (swept in by the checkpoint's `git add -A`; contents
untouched, all three pre-date this run):** `AUDIT_2026-08-12.md` is the
read-only forensic audit this run executed against; `PROD_APPLY_READY.sql` is
the pre-existing phase51–58 concatenation for the PRODUCTION apply queue;
`PROD_VERIFY.sql` is the read-only phase51–58 sentinel check. None is related
to phase59. Credential scan before any push: no keys, no JWTs, no connection
strings in any of the three; the audit doc names the staging/production
project REFS (public identifiers, baked into every client bundle) and
catalogs the app's security posture — fine for a private remote, do not
publish it to a public one.

**Exact next task:** owner decisions — apply phase59 per the instructions
above; run the two-device staging script from the run report (counter
round-trip, unfunded-race walk, badge/hub checks, cold-start landings);
decide OfferCard fix (known issue 1) as the next closed-scope item;
merge/keep the branch. The audit's untouched P1s (P1-03/04/05/06/08/10) and
the release pipeline remain owner-led.

### End of session — 2026-08-12 (HEAD `2f8205b`, tree clean)

**Added tonight (no code changes, no fixes):**
- **phase59 confirmed APPLIED to staging.** `node scripts/verify-schema.mjs`
  is fully green — `counter_notification_enabled()` flipped PENDING → OK,
  and every phase20–59 group reports OK with no MISSING and no PENDING.
  Steps 1–2 of the phase59 apply instructions above are therefore done;
  only the on-device confirmation (step 3) remains.
- **Push-notification pipeline audit (read-only).** Findings: client
  registration is fully wired (`configurePushHandling()` on start,
  non-interactive token re-sync on mount via `usePushNotifications()`,
  `maybePromptForPush()` after post/bid, `unregisterPushToken()` on
  logout) but minting returns `unsupported` in Expo Go, on simulators and
  on web, so no token has likely ever been registered; server-side enqueue
  is complete and verified live, and those same outbox rows already drive
  the in-app feed and badges; `supabase/functions/send-push/index.ts` is a
  COMPLETE working Expo sender that **nothing invokes** — phase20 §8's
  pg_net/pg_cron drain is commented out by design, phase39:71 confirms
  neither extension is used, and no client calls it (nor should it —
  service-role only, 403s anything else). Its deployment status is not
  determinable from the repo. Net: the outbox fills, nothing sends.
- **`docs/emerald-v2/06_DEFERRED_INTEGRATIONS.md:21` corrected** (commit
  `2f8205b`) — the push row's two "not re-verified this pass" hedges
  replaced with the confirmed status above, the three outstanding items
  enumerated (confirm/deploy the function, decide and implement a trigger,
  cut a dev/EAS build), and the activation point re-marked **OWNER-LED,
  post-hardening**. Doc only; the table's 12-column structure verified
  unchanged. This is NOT one of the emerald-v2 immutable references
  (those are `docs/emerald-v2/references/*`).

**Still open at session end:**
1. **Two-device staging script — Tests 1, 2, 3, 5 NOT RUN.** Counter
   round-trip both directions; unfunded-race walk at in_progress and
   completed (plus the Chat direct-offer variant); badge/inbox checks
   including the never-chatted pair; duplicate-tap and two-device
   double-accept races plus the Checkout stale-frame flash. Script is in
   the run report; these are the only way to close the 5 NEEDS-DEVICE
   verdicts and the P1-09 cold-start landings.
2. **Test 4 (phase59 push delivery end to end) BLOCKED** on the three
   push items above — deployment, a trigger, and a real dev/EAS build.
   Owner-led, post-hardening. The in-app feed/badge half of phase59's
   value already works without any of it.
3. **OfferCard fix (known issue 1) UNDECIDED** — `components/OfferCard.tsx:130`
   `canAcceptThisOffer` lacks the awaiting/author check, so a customer's
   own counter renders with a live "Accept offer" the server always
   refuses. Same class as AUD-P1-01, customer list side. Server-guarded,
   no state corruption; recommended as the next closed-scope item.
4. **Merge of `stability-core-transactions` into mainexpo UNDECIDED.**
   Branch is unmerged and unpushed; base tag `pre-core-transactions-2026-08-11`
   remains the rollback point.

**Gate unchanged since the run:** tsc exit 0 · lint exit 0 · 308 tests,
307 pass, 1 fail (the documented frozen-web PWA mismatch) · verify-schema
green including phase59.

---

## Session 2026-08-13 — one person, one conversation

**Base:** `abfced9` on `mainexpo`, clean. Two commits, in order:
`2ce3aca` *feat(inbox): one row per person*, then *feat(chat): merged
conversation timeline and send routing* (this one).

**Progress.** The inbox showed one row per JOB THREAD and papered over the
duplicates with an "N conversations together" subtitle. It now shows one row
per PERSON, and the chat screen renders every thread with that person as one
chronological timeline with a divider wherever the job context changes. A pair
have exactly one conversation; jobs are context inside it.

This is a **presentation-layer collapse only**. No message data moved, no row
was reparented, `messages.job_id` / `direct_thread_id` semantics are unchanged,
and phase66's RLS lock, the offer events and the chat-media storage paths all
still key on `job_id`. **No migration was written and no SQL was executed** —
every input the collapse needs was already reachable client-side.

**Decisions made.**

- **The resolver contract** (owner-signed-off, recorded verbatim in
  `lib/conversationResolver.ts` and in FINDINGS.md): among the pair's
  `assigned`/`in_progress` jobs, greatest `conversations.last_message_at` wins;
  a job with no messages at all beats a job still being chatted in only if it
  is the more recently CREATED of the two (otherwise the first message about
  new work routes into the old job); ties break on ascending job id; no active
  job means the pair thread. Rule 2's comparison is `created_at` against
  `created_at` — that is what makes a brand-new silent job beat an old job
  whose last message is newer than the new job's creation.
- **`conversations.last_message_at` is THE canonical activity timestamp.**
  `jobs` has no `updated_at` column in any migration and none was invented.
- **One resolver, read by everything downstream** — send routing, the inbox
  subtitle, the header subtitle, attachment availability and the quick
  replies. `messaging_unlocked()` is asked about the resolved target and
  nowhere else; unknown stays locked.
- **`counterpartyId` is the canonical route identity; the two legacy shapes
  stay valid forever.** `ChatTargetParams` carries `ChatTarget` through
  unchanged, so no call site has to manufacture a counterparty id. A supplied
  `jobId` is kept ONLY as the initial scroll target.
- **Attachments follow the resolved target, not the route** — chat media is
  stored under `{jobId}/{userId}/…`, so the pair thread still has none. Pair-
  thread attachment storage was explicitly NOT added.
- **Hire Again now follows the relationship, not the route.** It used to also
  require a route `jobId`; with the inbox opening chats by counterparty that
  gate would have hidden the CTA on exactly the completed-job conversations it
  exists for. `tests/customerCore.test.mjs:152` updated to match, and it now
  also pins where the offer is posted (`threadJobId: activeJob?.id`).
- **Reactions stay scoped to one job thread** — `message_reactions` is keyed by
  job, so the merged view loads reactions for the thread being added to now.
  See known issues.

**Migrations verified:** none written and none touched. `.env` was checked to
resolve to STAGING `zzkumxcjtbqoselzptig` (not production
`avkighsiufeefyycbebf`) before anything ran, and `.env` itself was not
modified. `node scripts/verify-schema.mjs` then ran **green, exit 0** — all
required objects through phase66 exist. Nothing new needed verifying; this is
the unchanged-schema baseline.

**Known issues opened by this change.**

1. **Reactions on other threads do not render.** `useReactions(jobId)` loads one
   job's reactions; in a merged conversation that is the resolved job (or the
   route job). Messages from the pair thread or from a finished job render
   without their reaction chips and cannot be reacted to. Decorative only, no
   data loss — every reaction row is intact. Fixing it means either N
   subscriptions or a by-message-ids read, both of which are wider than this
   change.
2. **Realtime is one channel per thread.** `messages` has no filter expressing
   "either of these two columns", so a conversation with N threads opens N
   channels. The merged store is keyed by thread and never assigned wholesale,
   which is what makes that safe — see the 16511c9 note in
   `hooks/useConversationChat.ts`.
3. **`hooks/useChat.ts` is now unreferenced.** Left in place deliberately: it
   is a locked-manifest file and deleting it is a modification, not a cleanup.
   Its replacement is `hooks/useConversationChat.ts`.
4. **Not device-verified.** Every claim here is from tsc, the source-level
   guard suite and the executed resolver tests. The merged timeline, the
   dividers and the initial-scroll jump have not been seen on a device.

**Gate:** tsc exit 0 · lint exit 0 · **382 tests, 381 pass, 1 fail** — the
documented frozen-web PWA `config.js` version mismatch, unchanged. Baseline
before this session was 361/360/1, so all 21 new tests pass and nothing
regressed.

**Next exact task.** Run the merged conversation on a device for a pair with
two active jobs and a pair thread: confirm the inbox shows one row, the
subtitle names the resolver's job, the timeline interleaves with dividers in
the right places, a "Message client" tap from an active job lands scrolled to
that job's first message, and the composer's attachment controls disappear on
a pair-thread conversation. Then decide known issue 1 (reactions).

## Session 2026-08-13 — CLAUDE.md rewrite + Claude Code guard hardening (docs/config only)

**What was done.** Docs and Claude Code configuration only — no app code, no
SQL, nothing under supabase/, no locked screen touched, no database contacted.

- **docs/CLAUDE_MD_AUDIT.md** (written earlier the same day, committed here):
  read-only ground-truth audit of the repo and live staging. Found ten
  contradictions in the old CLAUDE.md, including a phantom RPC
  (`advance_job_status` — exists nowhere), a dead working-branch instruction
  (`v2` is 66 commits behind mainexpo, 0 ahead), and a protect path that
  matches nothing (`docs/emerald-v2/references/` does not exist; the real
  assets are in `design-reference/`).
- **CLAUDE.md rewritten in full** from that audit. Single-generation now:
  dual-tree navigation (CustomerRoot/WorkerRoot under ModeShell),
  accept_offer()/transition_job_status() as the only lifecycle RPCs,
  ui/tokens.ts as token source of truth with lib/theme.ts as the standard
  screen-facing wrapper, the 11 locked screen files named explicitly, and the
  production ref named explicitly as never-contacted.
- **.claude/rules/** added (path-scoped, `paths:` frontmatter):
  `supabase.md` (migration mechanics, scoped to supabase/**/*.sql) and
  `native-ui.md` (mobile UX mechanics, scoped to screens/components/ui/modes).
- **.claude/settings.json hardened:** permissions.deny for git push (incl.
  --force/-f), git reset --hard, git clean, git stash — each in Bash(...) and
  PowerShell(...) form — plus Edit(...) deny rules for design-reference/,
  public/, hosting/, dist/, WEB_DEPLOYMENT.md, *.web.ts(x), and each of the
  11 locked screen files. PreToolUse hook (matcher Bash|PowerShell) runs
  `.claude/hooks/guard.ps1`, which whole-string-scans every shell command and
  blocks (exit 2) anything containing the production ref, git push,
  push --force/-f, reset --hard, git clean, or git stash. SessionStart hook
  runs `.claude/hooks/session-context.ps1` (injects branch/HEAD/dirty-clean).
- **.claude/settings.local.json:** removed the `Bash(git:*)` blanket approval
  and the pre-approval that extracted the postgresql:// credential from
  start.ps1 for psql; added narrow read-only approvals (git status/log/diff,
  grep/Select-String, verify-schema) mirrored for Bash and PowerShell.
- **.claude/launch.json deleted** (it targeted the frozen web surface).
- **Canaries all blocked pre-execution, both tools:** `echo <prod-ref>` and
  `git push --dry-run` were each rejected by guard.ps1 (its reason line
  visible in the rejection) through Bash AND through PowerShell; benign
  commands pass. The dry-run push never reached Git.

**Migrations verified:** none written, none touched, no database contacted
this session.

**Open items (recorded, deliberately not acted on):**
1. Future migration: drop the `accept_bid`/`respond_job_request` compat shims
   and revoke their `authenticated` grants — live, callable, zero app callers
   (audit §2).
2. Consolidate/verify the live `transition_job_status` signature across its
   five stacked definitions (phase29/31/35/51/58, arity change at phase35).
3. `docs/architecture.md` navigation section is stale (pre-dual-tree);
   rewrite pending.
4. The audit's verify-schema run executed in PostgREST-reachability mode
   (`SUPABASE_DB_URL_STAGING` not set): RPC presence confirmed, signatures
   and bodies not. Re-run with the staging DB URL for signature-level proof.

**Gate:** JSON validity of both settings files (node JSON.parse), guard.ps1
unit-tested against 8 payloads (blocks case-insensitive and compound
commands, fail-open on non-command payloads), all 4 live canaries blocked.
No app code changed, so tsc/test suite not re-run — nothing it covers moved.

**Next exact task.** Unchanged from the previous session (device pass on the
merged conversation timeline, then decide reactions known issue 1). For the
config surface: apply open item 4's signature-level verify-schema run when
the staging DB URL is next available in a shell.
