# Screen Crosswalk (Phase 0 — BRAZOS_MASTER_PLAN.md §B.6)

Audit date: 2026-08-08. Branch `v2` (HEAD `24bd550`, created from
`feature/emerald-v2-fidelity` HEAD `f295a65`).

This document supersedes `02_SCREEN_CROSSWALK.md` (dated 2026-08-04, an older
branch) for every row it revises below. `02_SCREEN_CROSSWALK.md` is left in
place as historical reference and is still accurate for every row **not**
listed in the "Changed since 2026-08-04" section — do not re-derive those from
scratch. Screens 09–11 (AI Concierge) are explicitly **out of V1 scope** per
`BRAZOS_MASTER_PLAN.md` and are listed here as OUT OF SCOPE, not NOT
IMPLEMENTED — do not build them.

Classification legend (per §B.6): **exists** (working route, reuse as-is or
with restyling) / **needs-rework** (real functionality present but merged,
inline, or missing a real screen boundary) / **net-new** (no current
implementation) / **reuse-candidate** (an existing component/screen could
become this atlas screen with promotion, not a rebuild).

Status legend (kept from the prior audit's vocabulary — more informative than
the 4-way classification alone): COMPLETE / PARTIAL / MOCKED / OUT OF SCOPE /
NOT IMPLEMENTED / UNKNOWN.

---

## Changed since 2026-08-04 (verified against current `v2` source)

| # | Atlas title | What changed | New status | New classification |
|---|---|---|---|---|
| 1 | Launch | `LaunchScreen.tsx` — icon-badge asset swap (D28), edges/safe-area audited, no bug found | COMPLETE (unchanged verdict, re-confirmed) | exists |
| 6 | Setup | Token/polish pass only (per `09_SETUP_IMPLEMENTATION_HANDOFF.md`); mode choice still device-local (`lib/setupState.ts`, no `profiles` column) | COMPLETE — mode choice still not durable | needs-rework (mode persistence) |
| 7 | Home (Customer Home) | Full Emerald redesign: hero art, serif display type, live-nearby feed, **"Switch to Worker" pill wired to `useModeTransition()`/`ModeTransitionOverlay`**. **LOCKED per BRAZOS_MASTER_PLAN.md — do not modify.** | COMPLETE — Emerald-styled, now LOCKED | exists (locked) |
| 12–15 | Post wizard | `PostJobScreen.tsx` is now a real 4-step wizard (Describe/Media/Location/Review, `POST_STEPS`), not one merged form. Still creates no job row until publish (confirmed). Scheduling/arrival-window field confirmed **absent** (previously only suspected). Draft state confirmed **in-memory only** — no `AsyncStorage`, lost on app kill. | PARTIAL (upgraded structurally, two real gaps newly confirmed) | needs-rework (draft persistence, scheduling field) |
| 17–20 | Explore/search (worker-search / results) | `WorkerSearchScreen.tsx` (customer→worker search) unchanged in substance. **`WorkerResultsScreen.tsx` is an entirely new screen** (not in the 2026-08-04 crosswalk) — dense results list over the real `jobs_within_radius()` RPC, driven by a `mode: 'all'|'skills'|'nearby'|'search'` param from `BrowseJobsScreen`. No sort control, no distinct filter UI. | WorkerSearch: COMPLETE (unchanged). WorkerResults: PARTIAL, new — best maps to atlas #20 "Search results" | WorkerResults: reuse-candidate → net-new-built |
| 27–29 | Job & bids / Compare bids / Bid detail | `ClientJobDetailScreen.tsx` unchanged in structure — bids still inline `BidWorkerCard` list, no dedicated compare/detail screens exist anywhere in the repo (confirmed by file search) | Unchanged: #27 COMPLETE, #28/#29 PARTIAL | needs-rework (28, 29) |
| 48 | Find jobs (Worker Home) | Full Emerald redesign: hero art, forest banner, **online/offline toggle** (`useWorkerAvailability`), **real exact-radius distance** via `jobs_within_radius()` RPC (replacing hotspot-only estimate), "Switch to Customer" pill wired to `useModeTransition()`. **LOCKED per BRAZOS_MASTER_PLAN.md — do not modify.** Still not its own tab (registered inside `HomeStack`). | COMPLETE — Emerald-styled, real radius search, now LOCKED | exists (locked) |
| 50 | Availability & filters | Still NOT IMPLEMENTED as its own screen/schema — `WorkerResultsScreen`'s `mode` param is preset feed switching, not a user-adjustable availability/skill/radius/pay filter model | NOT IMPLEMENTED (unchanged) | net-new |

**Also newly confirmed this pass (mode/navigation, not a screen row):** there is still only **one** shared five-tab bar (Home/Map/MyJobs/Messages/Profile). "Mode" today is a client-side illusion: `ModeTransitionOverlay` plays a branded animation while `HomeScreen`/`BrowseJobsScreen` navigate within the *same* `HomeStack* (pushing `BrowseJobs` for "worker", popping back for "customer"); the Home tab's `tabPress` listener infers current mode by checking whether `BrowseJobs` is on the stack (`App.tsx` lines ~334–343). There is no `CustomerParamList`/`WorkerParamList` split, no `ModeProvider`, no `switchMode()`, no `profiles.active_mode` column. This is real, polished UX but is **not** the master plan's structurally-enforced dual-navigator-tree architecture — that is genuine Phase 2 work, not wiring.

---

## SHARED / AUTH (Screens 1–6)

| # | Atlas title | Current route/file | Status | Classification | Notes |
|---|---|---|---|---|---|
| 1 | Launch | `screens/LaunchScreen.tsx` (overlay, not a route) | COMPLETE | exists | Intentional atlas departure, unchanged; icon asset fixed since Aug 4 (D28) |
| 2 | Welcome | `screens/WelcomeScreen.tsx` | COMPLETE | exists | Unchanged. Carries a "Protected payment" marketing badge (line ~170) with **no backing payment system anywhere in the repo** — flag as a copy/capability mismatch, not an engineering gap |
| 3 | Sign in | `screens/SignInScreen.tsx` + `screens/EmailSignInScreen.tsx` | COMPLETE | exists | Unchanged |
| 4 | Create account | `screens/CreateAccountScreen.tsx` + `screens/EmailCreateAccountScreen.tsx` | COMPLETE | exists | Unchanged |
| 5 | Verify phone | `screens/VerifyPhoneScreen.tsx` | MOCKED | exists | Unchanged. `lib/phoneAuth` provider boundary confirmed still mock-only in practice; real Supabase phone provider code exists but is dormant/unprovisioned (`lib/phoneAuth/supabase.ts`, `docs/phone-auth-activation.md`) |
| 6 | Setup | `screens/SetupScreen.tsx` + `screens/LegalGateScreen.tsx` (OnboardingStack) | COMPLETE | needs-rework (mode persistence only) | Mode/"landing" choice remains device-local `AsyncStorage` only (`lib/setupState.ts`); no `profiles` column. Everything else unchanged since Aug 4 token pass |

---

## CUSTOMER MODE (Screens 7–47)

| # | Atlas title | Current route/file | Status | Classification | Notes |
|---|---|---|---|---|---|
| 7 | Home | `screens/HomeScreen.tsx` (HomeStack) | COMPLETE — **LOCKED** | exists (locked) | Full Emerald redesign + mode-switch pill; do not modify layout/styling/behavior |
| 8 | Rebook & recent | No dedicated screen — closest analog is "Hire Again" (`hireWorkerId` param on PostJob) | PARTIAL | needs-rework | Unchanged since Aug 4 |
| 9 | AI Concierge | None | **OUT OF SCOPE** | — | Explicitly excluded from V1 per `BRAZOS_MASTER_PLAN.md` — do not build |
| 10 | Clarify the job | None | **OUT OF SCOPE** | — | Same |
| 11 | Review draft | None | **OUT OF SCOPE** | — | Same |
| 12 | Post a job (Describe) | `screens/PostJobScreen.tsx`, step 1 of 4 | COMPLETE (real wizard step) | exists | See "Changed since" table — now a genuine step, not a merged section |
| 13 | Add media | `screens/PostJobScreen.tsx`, step 2 of 4 | COMPLETE | exists | Media uploads immediately to storage on pick, cleaned up on abandoned session |
| 14 | Location & timing | `screens/PostJobScreen.tsx`, step 3 of 4 | PARTIAL | needs-rework | Location only — **no scheduling/arrival-window field exists**, confirmed absent |
| 15 | Budget & review | `screens/PostJobScreen.tsx`, step 4 of 4 | COMPLETE | exists | Sole call site of `createJob`/`updateJob`/`createJobRequest`; no job row created earlier |
| 16 | Job published | No dedicated confirmation screen | PARTIAL/UNKNOWN | net-new | Unchanged since Aug 4 |
| 17 | Explore services | None distinct — `WorkerSearchScreen`'s category chips | NOT IMPLEMENTED as own screen | net-new | Unchanged |
| 18 | Explore workers | `screens/WorkerSearchScreen.tsx` (HomeStack) | COMPLETE | exists | Unchanged — semantic-ranked worker search |
| 19 | Map discovery | `screens/MapScreen.tsx` + `screens/CellJobsScreen.tsx` | PARTIAL | needs-rework | Hotspot/cell abstraction, not pannable-map-with-swipe-card; unchanged |
| 20 | Search results | `screens/WorkerResultsScreen.tsx` (new) / `WorkerSearchScreen.tsx` result lists | PARTIAL | reuse-candidate | `WorkerResultsScreen` is a genuinely new, real dense results list over exact-radius search; still no sort/filter UI |
| 21 | Filters | Inline query/category chips only | NOT IMPLEMENTED as distinct screen | net-new | Unchanged |
| 22 | Worker profile | `screens/WorkerProfileScreen.tsx` | PARTIAL | exists | Unchanged |
| 23 | Portfolio | `components/PastWork.tsx` (embedded, not routed) | PARTIAL | reuse-candidate | Unchanged |
| 24 | Project story | None dedicated | NOT IMPLEMENTED | net-new | Unchanged |
| 25 | Service detail | None — no services/pricing schema | NOT IMPLEMENTED | net-new | Unchanged |
| 26 | Send an offer | `screens/PostJobScreen.tsx` (hireWorkerId path) → `create_job_request` | COMPLETE | exists | Unchanged |
| 27 | Job & bids | `screens/ClientJobDetailScreen.tsx` (MyJobsStack) | COMPLETE | exists | Unchanged |
| 28 | Compare bids | Inline `BidWorkerCard` list within `ClientJobDetailScreen.tsx` | PARTIAL | needs-rework | Re-confirmed this pass — still no dedicated screen anywhere in repo |
| 29 | Bid detail | Inline within `ClientJobDetailScreen.tsx`/`BidWorkerCard` | PARTIAL | needs-rework | Re-confirmed this pass |
| 30 | Counteroffer | `components/AmountPrompt.tsx` modal → `job_requests` counters | PARTIAL | needs-rework | Open-job-bid-counter vs. job_requests-counter is still an open schema question (see DB summary) |
| 31 | Protected checkout | None | NOT IMPLEMENTED | net-new | No payment system at any layer, confirmed unchanged. Note: `WelcomeScreen` shows a "Protected payment" marketing badge with nothing behind it — flag for product review |
| 32 | Job confirmed | Falls through to job detail after `accept_bid` | PARTIAL/NOT IMPLEMENTED | net-new | Unchanged |
| 33 | Track worker | None | NOT IMPLEMENTED | net-new | Unchanged — no live tracking anywhere |
| 34 | Active job | `screens/WorkerJobScreen.tsx` / `screens/ClientJobDetailScreen.tsx` | COMPLETE (merged) | needs-rework | Unchanged |
| 35 | Completion evidence | `screens/ClientJobDetailScreen.tsx` (phase35 photo/video) | COMPLETE | exists | Unchanged |
| 36 | Approve or report issue | `transition_job_status` (approve); dispute-report wiring unconfirmed | PARTIAL | needs-rework | Unchanged |
| 37 | Review & tip | `components/ReviewSection.tsx` | PARTIAL (review complete, tip not modeled) | needs-rework | Unchanged |
| 38 | My jobs | `screens/MyJobsHubScreen.tsx` | COMPLETE | exists | Unchanged |
| 39 | Job detail | `screens/ClientJobDetailScreen.tsx` | COMPLETE | exists | Unchanged |
| 40 | Messages | `screens/MessagesInboxScreen.tsx` (shared) | COMPLETE | exists | Unchanged |
| 41 | (chat instance) | `screens/ChatScreen.tsx` (shared) | COMPLETE | exists | Unchanged |
| 42 | Notifications | None — `NotificationSettingsScreen` is preferences only | NOT IMPLEMENTED as a feed | net-new | Backend outbox (`notification_outbox`) exists and is RLS-locked-to-nothing (server/service-role only), confirmed this pass |
| 43 | Your profile | `screens/ProfileScreen.tsx` (shared) | PARTIAL | exists | Unchanged |
| 44 | Edit profile | Inline within `ProfileScreen.tsx` | PARTIAL | needs-rework | Unchanged |
| 45 | Payment methods | None | NOT IMPLEMENTED | net-new | Unchanged |
| 46 | Saved workers | UNKNOWN presence (not confirmed this pass either) | UNKNOWN | — | Carried over unresolved — grep needed before Phase 5/9 |
| 47 | Settings & support | Inline card within `ProfileScreen.tsx` | PARTIAL | needs-rework | Mode-switch entry point still cannot be a real settings-driven switch until Phase 2/3 exists — today's mode pill lives on Home/Worker Home directly, not Settings |

---

## WORKER MODE (Screens 48–66)

| # | Atlas title | Current route/file | Status | Classification | Notes |
|---|---|---|---|---|---|
| 48 | Find jobs | `screens/BrowseJobsScreen.tsx` | COMPLETE — **LOCKED** | exists (locked) | Full Emerald redesign, real radius search, online/offline toggle; do not modify layout/styling/behavior. Still not its own tab (Phase 2/3 work) |
| 49 | Jobs map | `screens/MapScreen.tsx` + `screens/CellJobsScreen.tsx` (shared) | PARTIAL | needs-rework | Unchanged |
| 50 | Availability & filters | None — no availability schema | NOT IMPLEMENTED | net-new | Re-confirmed this pass — `WorkerResultsScreen`'s preset `mode`s do not constitute this |
| 51 | Job detail | `screens/JobDetailScreen.tsx` | COMPLETE | exists | Unchanged |
| 52 | Submit bid | Inline within `screens/JobDetailScreen.tsx` (`create_bid`) | COMPLETE | exists | Unchanged |
| 53 | Bid sent | No dedicated confirmation screen | PARTIAL/NOT IMPLEMENTED | net-new | Unchanged |
| 54 | My work | `screens/MyJobsHubScreen.tsx` (shared) | PARTIAL | exists | Unchanged |
| 55 | Accepted job | `screens/WorkerJobScreen.tsx` | COMPLETE | exists | Unchanged |
| 56 | Route & arrival | None | NOT IMPLEMENTED | net-new | Unchanged |
| 57 | Work checklist | None | NOT IMPLEMENTED | net-new | Unchanged — no checklist schema |
| 58 | Completion upload | `screens/WorkerJobScreen.tsx` (phase35) | COMPLETE | exists | Unchanged |
| 59 | Earnings | None | NOT IMPLEMENTED | net-new | Unchanged — no payment system |
| 60 | Payout details | None | NOT IMPLEMENTED | net-new | Unchanged |
| 61 | Messages | `screens/MessagesInboxScreen.tsx` (shared) | COMPLETE | exists | Unchanged |
| 62 | (chat instance) | `screens/ChatScreen.tsx` (shared) | COMPLETE | exists | Unchanged |
| 63 | Worker profile (public) | `screens/WorkerProfileScreen.tsx` (shared with #22) | PARTIAL | exists | Unchanged |
| 64 | Services & pricing | None — no schema | NOT IMPLEMENTED | net-new | Unchanged |
| 65 | Portfolio manager | `components/PortfolioPicker.tsx` (within ProfileScreen) | COMPLETE | reuse-candidate | Unchanged |
| 66 | Availability & verification | `components/VerificationBadge.tsx` (display only) | PARTIAL | needs-rework | Unchanged — verification UI-only, availability not modeled |

---

## Validation

- Total rows: 66 (9–11 explicitly out of scope, not missing).
- No duplicate screen numbers; ranges 1–6, 7–47, 48–66 contiguous.
- Every row not listed in "Changed since 2026-08-04" was spot-checked against
  the old crosswalk's file references this pass (files still exist, imports
  still resolve from `App.tsx`) and is otherwise carried forward unchanged.
- New file this pass: `screens/WorkerResultsScreen.tsx` (row 20), not present
  in the prior audit.
- Dead code found: `components/SectionHeader.tsx` exists, exports a component,
  but is never imported anywhere in the repo — confirmed via import-site
  search. Not deleted in Phase 0 per policy; candidate for Phase 13.
