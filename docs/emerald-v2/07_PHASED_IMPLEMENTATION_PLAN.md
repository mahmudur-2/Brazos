# 07 — Phased Implementation Plan

Organized by vertical slice, not screen number, per the audit brief. Each
phase lists goal, atlas screens included, existing assets reused, new shared
components, data prerequisites, mocked vs. production dependencies, risks,
required tests, definition of done, commit boundaries, effort, and a
recommendation on reasoning-effort/model tier. This plan sequences work; it
does not perform any of it.

## Phase 0 — Stabilize and inventory (this audit + immediate follow-ups)

- **Goal:** establish the documentation baseline (this deliverable) and close
  the cheap, high-value verification gaps found along the way before any new
  feature work starts.
- **Included atlas screens:** none (infrastructure).
- **Existing assets reused:** the entire working marketplace vertical, as-is.
- **New shared components:** none.
- **Data prerequisites:** none.
- **Mocked/production dependencies:** none.
- **Major risks:** none if scoped correctly; risk is entirely in skipping
  this phase and building Phase 2+ on unverified assumptions.
- **Tests required:** re-run `node scripts/verify-schema.mjs` against the
  connected project (needs `.env`, network — not run in this audit) to
  confirm phase15–39 live-deployment status; regenerate
  `supabase/tests/phase29_security_contract.sql`'s stale `create_review`
  assertion.
- **Definition of done:** verify-schema run recorded, stale test file fixed,
  this documentation set reviewed by the user.
- **Commit boundary:** the stale-test-file fix is its own tiny commit if
  done; documentation is not committed as application code.
- **Effort:** XS.
- **Model tier:** cheaper model sufficient — mechanical verification.

## Phase 1 — Emerald design-system foundation

- **Goal:** consolidate tokens, verify colors against the real atlas source,
  build the reusable permission-row pattern, stand up a UI Lab.
- **Included atlas screens:** none directly (infrastructure feeding every
  future screen).
- **Existing assets reused:** `lib/authTheme.ts` (extend, don't replace),
  `useSetupPermissions.ts`'s three/four-state permission model, `authType`'s
  existing type scale.
- **New shared components:** UI Lab dev route; a generalized permission-row
  component extracted from `SetupScreen.tsx`'s `PermissionSetupRow`.
- **Data prerequisites:** none.
- **Mocked dependencies:** none.
- **Production dependencies:** none.
- **Major risks:** token consolidation touching `lib/theme.ts` could regress
  older marketplace screens if done carelessly — do this additively (extend
  `authTheme`, don't delete `theme.ts`) until every consumer is confirmed
  migrated.
- **Tests required:** none new beyond `npm run verify` staying clean.
- **Definition of done:** see [09_SETUP_IMPLEMENTATION_HANDOFF.md](09_SETUP_IMPLEMENTATION_HANDOFF.md)
  for the bounded first slice of this phase (Setup/LegalGate token pass).
- **Commit boundary:** one commit per token family or component extracted.
- **Effort:** S–M.
- **Model tier:** cheaper model viable for the mechanical token-value
  verification; keep a stronger model for the permission-row extraction
  (touches shared state logic).

## Phase 2 — Shared onboarding completion

- **Goal:** finish Setup's remaining gaps (mode durability decision),
  confirm existing-user compatibility, keep the phone-verification adapter
  deferred and honest.
- **Included atlas screens:** 01–06 (Launch through Setup) — already
  substantially built; this phase is closing the mode-persistence question
  identified in [05](05_DATA_AND_STATE_MODEL_PLAN.md), not building these
  screens from scratch.
- **Existing assets reused:** the entire current auth/onboarding stack.
- **New shared components:** none required unless the mode field is added.
- **Data prerequisites:** the `profiles.mode_preference` decision from
  [05](05_DATA_AND_STATE_MODEL_PLAN.md) — product decision required before
  this phase can close.
- **Mocked dependencies:** phone verification stays mock (`lib/phoneAuth`),
  unchanged.
- **Production dependencies:** none.
- **Major risks:** conflating this with Phase 3's navigation work — keep the
  mode *storage* decision separate from the mode *navigation* rollout so
  each is independently testable and revertible.
- **Tests required:** extend `tests/setupOnboarding.test.mjs` for whatever
  mode-storage shape is chosen; a specific regression test proving an
  existing account (legal accepted, no setup record) is not re-prompted for
  legal when Setup completes for the first time.
- **Definition of done:** mode-persistence decision made and either
  implemented or explicitly deferred in writing; all Phase 0/1 gates still
  green.
- **Commit boundary:** one commit for any storage/schema change, separate
  from Phase 1's token commits.
- **Effort:** S.
- **Model tier:** stronger model — this is a real architecture decision
  (schema vs. device storage), not mechanical work.

## Phase 3 — Posting and bidding vertical slice (customer + worker nav split)

- **Goal:** the requested end state — "one complete path where a customer
  can publish a job and a worker can submit a bid" — **already exists** in
  today's single-tab-set app (confirmed COMPLETE in
  [01](01_CURRENT_APP_INVENTORY.md)/[02](02_SCREEN_CROSSWALK.md)). This
  phase's real work is introducing the dual-mode navigation
  ([03](03_NAVIGATION_AND_ROUTE_PLAN.md)'s Steps 1–2) around that already-
  working slice, not building the slice itself.
- **Included atlas screens:** Customer 07 (Home), 12–16 (post flow, partially
  net-new UI over existing `PostJobScreen` logic), 27–29 (Job & bids, partial
  UI net-new over existing `ClientJobDetailScreen`); Worker 48 (Find jobs,
  reskin of `BrowseJobsScreen`), 51–53 (Job detail/Submit bid/Bid sent,
  reskin of `JobDetailScreen`).
- **Existing assets reused:** `PostJobScreen`, `BrowseJobsScreen`,
  `JobDetailScreen`, `ClientJobDetailScreen`, `create_job`/`create_bid`/
  `accept_bid` RPCs — all confirmed COMPLETE, reuse as-is behind new screen
  shells where the atlas wants a different layout.
- **New shared components:** mode-aware tab bar (extends `App.tsx::MainTabs`
  per [03](03_NAVIGATION_AND_ROUTE_PLAN.md)).
- **Data prerequisites:** Phase 2's mode-persistence decision.
- **Mocked dependencies:** none.
- **Production dependencies:** none.
- **Major risks:** the single biggest regression-risk phase in this plan —
  touches the root navigator every signed-in user hits. Use
  [08_REGRESSION_AND_ACCEPTANCE_MATRIX.md](08_REGRESSION_AND_ACCEPTANCE_MATRIX.md)'s
  route-reachability check explicitly before merging.
- **Tests required:** new navigation tests proving every currently-reachable
  route stays reachable from at least one mode; existing hardening/job/bid
  tests must stay green untouched.
- **Definition of done:** both mode tab bars render, existing job posting/
  bidding smoke path (typecheck+lint+test) unaffected, manual device check
  recommended before considering this phase shippable (this audit performed
  no device testing).
- **Commit boundary:** navigation restructure as its own commit, separate
  from any screen reskinning.
- **Effort:** L.
- **Model tier:** stronger model — cross-cutting navigation change with real
  regression risk; not a fit for a cheaper model.

## Phase 4 — Acceptance, work, and completion

- **Goal:** compare bids, counteroffer (open-job path — note the schema
  question flagged in [05](05_DATA_AND_STATE_MODEL_PLAN.md) about whether
  this reuses `job_requests`' counter mechanism or needs its own), sandbox
  checkout states, confirmation, arrival simulation, checklist, completion
  evidence, approval/issue, review, job history.
- **Included atlas screens:** 28, 30–37, 54–58.
- **Existing assets reused:** `accept_bid`, `transition_job_status`,
  completion photo/video evidence (phases 34/35), `ReviewSection`/
  `create_review` (phase37) — all COMPLETE, reuse directly.
- **New shared components:** checklist UI (no schema backing exists yet —
  see [05](05_DATA_AND_STATE_MODEL_PLAN.md)), sandbox checkout screen
  (labeled, per [06](06_DEFERRED_INTEGRATIONS.md)), simulated arrival state
  UI.
- **Data prerequisites:** checklist schema decision; payment-provider
  interface stub (mocked only, per [06](06_DEFERRED_INTEGRATIONS.md)); tips
  are unmodeled — needs a small new table if in scope.
- **Mocked dependencies:** `PaymentProvider` sandbox implementation.
- **Production dependencies:** none yet.
- **Major risks:** money-language discipline — every screen touching the
  sandbox checkout must never say "paid" for authorized/held states, per the
  atlas's non-negotiable UI rule and this repo's own `budget_cents`
  discipline.
- **Tests required:** a lint-style guard (mirroring `hardening.test.mjs`'s
  existing pattern of banning specific words from specific screens) that
  bans "paid"/"charged" language on any authorization/hold-state screen.
- **Definition of done:** full accept→work→complete→review loop functional
  with real data except payment, which is sandboxed and visibly labeled.
- **Commit boundary:** per-screen or per-small-group commits; checklist
  schema (if added) is its own migration-writing commit, not run.
- **Effort:** L.
- **Model tier:** stronger model for the checklist schema decision and
  money-language guard test; cheaper model viable for individual screen
  reskins once the shared components exist.

## Phase 5 — Discovery, profiles, and trust

- **Goal:** service discovery, worker discovery, search/filtering, profiles,
  services/pricing, portfolio, saved workers, availability, verification UI
  states.
- **Included atlas screens:** 17–26, 43–47, 63–66.
- **Existing assets reused:** `WorkerSearchScreen`/`lib/workerSearch.ts`
  (semantic matching, COMPLETE, extensively tested — reuse directly for
  Explore/worker-discovery screens), `PastWork`/`PortfolioPicker`
  (COMPLETE), `ProfileReviewsScreen` (COMPLETE).
- **New shared components:** services/pricing editor (no schema exists —
  net-new), availability editor (no schema exists — net-new), "saved
  workers" surface (presence UNKNOWN — verify before building; may already
  partially exist).
- **Data prerequisites:** services/pricing table, availability table — both
  net-new, deferrable schema per [05](05_DATA_AND_STATE_MODEL_PLAN.md).
- **Mocked dependencies:** none — this phase is achievable entirely on
  internal/free data.
- **Production dependencies:** none.
- **Major risks:** low — mostly additive UI over either existing or clearly
  net-new schema, low regression surface on the working marketplace core.
- **Tests required:** new coverage for any new table's RPCs, following the
  `create_job`/`create_bid` validated-RPC pattern (never raw table writes
  from the client, per the established security posture).
- **Definition of done:** worker discovery, profile, and portfolio surfaces
  reskinned/built against real or clearly-labeled-empty data; no fabricated
  ratings/reviews/verification anywhere (repo invariant, already upheld
  today).
- **Commit boundary:** per feature area (search UI, profile UI, services
  schema+UI, availability schema+UI).
- **Effort:** L.
- **Model tier:** cheaper model viable for most of this phase (UI over
  established or simple new CRUD patterns); stronger model only for new RPC
  security design.

## Phase 6 — Messaging, maps, and notifications

- **Goal:** contextual inbox, job-linked chat, media messaging (all
  COMPLETE, reskin only), in-app notifications, map/list modes, address
  privacy (already correctly enforced, preserve), simulated arrival states.
- **Included atlas screens:** 19, 33, 40–42, 49, 56, 61–62.
- **Existing assets reused:** `ChatScreen`/`MessagesInboxScreen` (COMPLETE),
  `job_hotspots`/`jobs_in_cell` (COMPLETE hotspot abstraction),
  `notification_outbox`/prefs (COMPLETE schema, delivery status UNKNOWN).
- **New shared components:** live-map pin rendering IF the product decision
  is to move beyond the hotspot abstraction (confirm `react-native-maps`
  actual usage first — UNKNOWN per [01](01_CURRENT_APP_INVENTORY.md)/
  [08](08_REGRESSION_AND_ACCEPTANCE_MATRIX.md)); simulated arrival ticker
  component (per [06](06_DEFERRED_INTEGRATIONS.md)'s `LocationTrackingProvider`
  mock).
- **Data prerequisites:** none beyond what exists, unless live tracking is
  pursued for real (deferred to Phase 8).
- **Mocked dependencies:** `LocationTrackingProvider` simulated mode.
- **Production dependencies:** push delivery confirmation (verify EAS
  linkage — a Phase 0 stabilization item, not new work, if not already
  closed).
- **Major risks:** exact-location privacy — any new live-tracking table must
  repeat `job_locations`'s realtime-publication exclusion pattern exactly
  ([05](05_DATA_AND_STATE_MODEL_PLAN.md)).
- **Tests required:** a guard test mirroring `hardening.test.mjs`'s existing
  location-privacy pattern, applied to any new tracking table.
- **Definition of done:** messaging/notification surfaces reskinned; map
  discovery either confirmed already using `react-native-maps` correctly or
  explicitly still hotspot-abstraction-only with that decision documented,
  not silently left ambiguous.
- **Commit boundary:** per feature area.
- **Effort:** M.
- **Model tier:** cheaper model for reskinning already-working screens;
  stronger model for the map-technology decision and any new
  privacy-sensitive schema.

## Phase 7 — AI Concierge

- **Goal:** implement only after manual posting is confirmed reliable
  (already true — `PostJobScreen`'s manual path is COMPLETE). The AI path
  must produce the exact same `JobDraft` shape manual posting already
  produces.
- **Included atlas screens:** 09–11.
- **Existing assets reused:** `create_job`'s validated argument shape as the
  canonical `JobDraft` contract; `PostJobScreen`'s manual fallback stays the
  ground truth.
- **New shared components:** `AIJobDraftProvider` interface + mock/rule-based
  dev implementation (see [06](06_DEFERRED_INTEGRATIONS.md)).
- **Data prerequisites:** none beyond the existing jobs schema.
- **Mocked dependencies:** the AI provider itself, entirely, until a model
  choice is made (explicitly out of scope for this audit).
- **Production dependencies:** an LLM API, not chosen here; likely needs a
  thin server proxy so no key ships client-side.
- **Major risks:** the atlas's hard rule — AI must never auto-publish,
  auto-charge, or lock inferred fields — needs to be a tested invariant, not
  just a design intention, given this repo's existing pattern of testing
  product-language/behavior invariants directly (`hardening.test.mjs`'s
  banned-word tests are the precedent to follow).
- **Tests required:** a guard test asserting the AI draft screen always
  routes through the same editable-review step manual posting uses, never
  directly to `createJob()`.
- **Definition of done:** AI concierge produces an editable draft
  indistinguishable in shape from a manually-built one; manual posting path
  completely unaffected.
- **Commit boundary:** provider interface + mock as one commit; UI screens as
  separate commits.
- **Effort:** M (excluding the real LLM integration, which is Phase 8-
  adjacent and not scoped here).
- **Model tier:** stronger model — this phase is mostly architecture
  (provider boundary, invariant enforcement), not repetitive UI.

## Phase 8 — Production integrations

- **Goal:** activate real phone verification, real payments/payouts, real
  push (if not already resolved in Phase 0), real live tracking, real
  identity/background verification, real AI — only after core visual and
  functional stability across Phases 1–7.
- **Included atlas screens:** none new — this phase swaps mock providers for
  real ones behind the interfaces built in every prior phase.
- **Existing assets reused:** every `*Provider` interface from
  [06_DEFERRED_INTEGRATIONS.md](06_DEFERRED_INTEGRATIONS.md), especially the
  already-built `lib/phoneAuth` boundary as the direct template.
- **New shared components:** none — this phase is provider implementations,
  not UI.
- **Data prerequisites:** payment/payout/verification schema, none of which
  exists yet — must be designed fresh at this point, informed by whichever
  providers are chosen.
- **Mocked dependencies:** none — this is where mocks are retired.
- **Production dependencies:** all of them — SMS provider, payment processor,
  payout provider, identity verification vendor, maps API key (if actually
  required), LLM provider, push/EAS.
- **Major risks:** this is the highest-compliance-surface phase in the whole
  plan (PCI scope, KYC, background-check legal review) — explicitly flag to
  the user before starting any sub-part of it; do not let engineering
  momentum carry a payment integration past a legal/product decision point.
- **Tests required:** provider-swap tests proving the mock and real
  implementations satisfy the same interface contract (the phone-auth
  boundary already has this shape via its 3-mode test coverage — replicate
  it).
- **Definition of done:** each provider activated independently and
  reversibly (env-var-gated, matching `EXPO_PUBLIC_PHONE_AUTH_MODE`'s
  pattern), never all-or-nothing.
- **Commit boundary:** one commit per provider activation, never bundled.
- **Effort:** XL, and likely the only phase in this plan that genuinely
  needs to be broken into its own sub-plan once specific providers are
  chosen.
- **Model tier:** stronger model throughout — security, compliance, and
  cross-feature debugging concentrate here per the audit brief's own
  guidance.

## Cross-phase notes

- Phases 1–2 and 3 have a hard dependency chain (tokens → mode-storage
  decision → mode-navigation rollout); Phases 4–6 are largely independent of
  each other and can be resequenced by the user's priority without breaking
  anything structural.
- Every phase's "definition of done" implicitly includes
  [08_REGRESSION_AND_ACCEPTANCE_MATRIX.md](08_REGRESSION_AND_ACCEPTANCE_MATRIX.md)'s
  relevant rows staying green — that document is the shared gate, not
  repeated per phase here.
