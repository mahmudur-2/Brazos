# BRAZOS MASTER BUILD PLAN

**Version 1.0 — August 2026 — Authoritative roadmap for all Claude Code sessions.**

This document is the single source of truth for how BRAZOS goes from its current state to a complete, reliable V1 marketplace. It supersedes the phase ordering in `brazos-v2-claude-code-kit.md`, while keeping that kit's workflow constraints (hand-applied numbered migrations verified by `scripts/verify-schema.mjs`, base branch `mainexpo`, frozen PWA untouched, dependency flagging, one clean commit per milestone).

**Changed since the kit was written:**
1. App screens **01–07 (Launch → Customer Home) and 48 (Worker Home) are FINISHED and LOCKED.** Do not modify their layout, styling, or behavior. They are the visual baseline the design system is extracted *from*, not migrated *onto*. The matching HTML/PNG references in `docs/emerald-v2/` are immutable reference material.
2. **AI Concierge screens 09–11 are removed from V1 scope** along with all LLM dependencies. Job posting begins at the manual flow (screen 12). The seam for future AI is a plain `JobDraft` object that the manual wizard produces — an AI module could someday produce the same object, so nothing in V1 architecture may depend on AI.

Anything about the existing repository that cannot be known from the design package is tagged **VERIFY DURING REPOSITORY AUDIT** — Phase 0 resolves every such tag before implementation begins.

---

## A. Executive architecture

**One Expo/React Native TypeScript app. One Supabase project. One account, two modes.**

**Layer model (top to bottom):**

1. **UI kit** — design tokens (exact values in §I, extracted from the locked screens' stylesheet), ~25 primitives, and 6 screen templates. Every non-locked screen is composed from these. A fix to a primitive fixes every screen that uses it.
2. **Feature modules** — one folder per domain (§D). Each owns its screens, components, hooks, and a typed data-access file. Screens never call Supabase directly; they call their domain's data layer.
3. **Domain data layer** — thin, typed functions over the Supabase client. All status values are imported from generated database types; no string literals for statuses anywhere in the app.
4. **Supabase** — Postgres with RLS as the real security boundary, Storage with per-bucket policies, Realtime for messaging and job-status subscriptions, RPCs for guarded state transitions.
5. **External adapters** — `lib/adapters/{sms,payments,push}.ts` behind small interfaces. Dev builds use mock SMS, a sandbox payment adapter, and no-op push delivery. Production providers plug in later without touching feature code.

**Modes:** `profiles.active_mode` persists the user's last mode. A root-level `ModeProvider` holds the current mode; the root navigator mounts exactly one of two navigator trees (Customer or Worker). Mode changes happen only through `switchMode()`, which confirms, resets navigation stacks, and swaps trees. There is no other path between the trees (§F).

**Server state:** cached and invalidated through one query layer so that accepting a bid on one screen refreshes job status everywhere. **VERIFY DURING REPOSITORY AUDIT** whether TanStack Query (or an equivalent hook/cache layer) already exists. If a working layer exists, keep it. If nothing equivalent exists, TanStack Query is the **one pre-approved dependency addition** for this project — stale-cache drift across ~40 routes sharing job/bid/message data is otherwise the top regression source. No other state library may be added. Session and mode live in small contexts; everything else is component state.

**Security:** RLS first, frontend hiding second. Exact addresses and contact details live in `job_private_details`, a separate table readable only by the job owner and the hired worker after acceptance. Status transitions go through validating RPCs, not raw `UPDATE`s.

---

## B. Existing-app audit checklist (Phase 0 — read-only, in this order)

0. **Reality check.** Does the app build and run on a device/simulator right now? Is the previously reported bottom-nav breakage (blank content area, duplicated tab icons, opaque bar) still live? If yes, it is the top blocker and gets fixed in Phase 2 — record it, don't fix it yet.
1. **Toolchain.** `package.json`, Expo config, TypeScript config, router in use (expo-router vs react-navigation — **VERIFY**; the plan adapts to whichever exists, never switch routers).
2. **Navigation today.** How is mode represented? Search all `navigate(` targets for any customer-tree code that can reach worker routes (and vice versa). List every cross-mode path found.
3. **Schema.** Run `node scripts/verify-schema.mjs`. Inventory `supabase/` migrations. Compare live tables/RPCs against §G's target model; produce a KEEP / MODIFY / MIGRATE / ADD / REMOVE matrix per entity.
4. **Generated DB types.** Present? Current? Where are job/bid statuses defined, and which screens compare raw status strings?
5. **Auth.** Session restore, email auth, phone-auth stubs, E.164 handling, where verification is mocked.
6. **Screen crosswalk.** For each atlas screen except 09–11: exists / needs-rework / net-new / reuse-candidate, one-line reason each → `docs/emerald-v2/SCREEN_CROSSWALK.md`.
7. **Design system status.** Do shared tokens/components exist? Do the locked screens (01–07, 48) consume them or carry standalone styles? → `docs/emerald-v2/DESIGN_SYSTEM_STATUS.md`. Either answer is fine — locked screens are not restyled; tokens are extracted to match them exactly.
8. **Job state handling.** Every place job status drives UI. Note contradictory interpretations between screens.
9. **RLS coverage.** Which tables have policies. Then an anon-key probe: attempt to read another user's address, phone, messages, payment rows. Record every leak.
10. **Messaging** — tables, realtime subscriptions, media attachments.
11. **Media/storage** — buckets, upload paths, failure handling (does a failed avatar upload clobber the old one today?).
12. **Location** — how radius search works now (PostGIS? haversine RPC? client-side filter?).
13. **Payments** — any existing ledger/transaction tables or stubs.
14. **Tests/scripts** — what exists beyond verify-schema.
15. **Dead code** — duplicate screens, abandoned experiments, unused deps. **List only**; deletion decisions happen per-phase when touching that domain.

**Deliverables:** the two docs above, the KEEP/FIX/CONSOLIDATE/REMOVE/ADD summary, an initialized `BRAZOS_BUILD_STATE.md` (§M), zero code changes, one docs-only commit.

---

## C. Final V1 scope

### Included

- Account + auth: email, phone-verification architecture with **mock SMS provider**, session restore, setup/permissions, one shared identity.
- Customer/Worker modes with architecturally enforced isolation and intentional switching.
- Manual job posting: describe → media → location/time → budget → review → publish; drafts survive app kill.
- Discovery: explore services, explore workers, search, filters, list/map discovery with radius search, saved workers, rebook/recent.
- Worker profiles: public profile, portfolio (gallery, project detail, manager), services & pricing, travel radius, weekly availability, verification **status display** (manual/admin flag).
- Negotiation: worker bids, customer direct offers, counteroffers (both directions), compare bids, accept/decline/withdraw/expire.
- Hiring: protected checkout on a **sandbox payment adapter** — authorize → hold → release states with honest labels; no real money.
- Job lifecycle: confirmed → en route → arrived → in progress → completion submitted → approve/report issue → completed, with a shared checklist and completion evidence (photos + note + attestation).
- Status-based worker tracking: state buttons, ETA text, static route map.
- Messaging: job-linked realtime chat, media messages, mode-appropriate quick replies, inbox per mode, unread counts.
- Reviews + tip architecture (tip = sandbox payment row); worker rating aggregates; simple customer-reliability signal.
- Earnings: pending/available/transferred derived from the payment ledger; per-job payout breakdown; simulated cash-out.
- Notifications: in-app feed driven by DB events, mode-aware deep links, push **token registration + adapter** (delivery optional in dev).
- Settings/support, payment methods (sandbox), edit profile with failure-safe avatar upload, privacy controls, log out.
- RLS across every privacy boundary in §G.

### Explicitly deferred

- Screens 09–11 and any LLM/AI dependency or API.
- Production SMS delivery; production payment processing and real payouts; production push credentials.
- Continuous live-GPS breadcrumb tracking (disproportionate cost — V1 ships status-based tracking above).
- Third-party KYC/identity-verification providers (status field + admin flag now).
- Recommendation/ranking ML, analytics dashboards, gamification, social features.
- Any change to the frozen PWA/web build.

---

## D. Feature-domain architecture

| Domain | Responsibility | Key data | Depends on | Shared UI | Top risk |
|---|---|---|---|---|---|
| **auth** | Session, sign-in/up, phone verify (mock), setup | auth.users, profiles | adapters/sms | LOCKED screens 01–06 | Session restore edge cases |
| **identity** | Profile CRUD, avatar, active_mode | profiles | auth, storage | FormScreen, Avatar | Avatar upload clobbering |
| **modes** | ModeProvider, switchMode, tree guards | profiles.active_mode | navigation | — | Cross-mode leakage |
| **jobs** | Draft → publish, media, my-jobs views | jobs, job_private_details, job_media | identity, storage | Wizard, JobCard, CommitmentsList | Address leakage; draft loss |
| **discovery** | Explore/search/filter/map, radius, saved | categories, worker_services, saved_workers | jobs, profiles | MarketplaceBrowse, FilterSheet, MapDiscovery | Radius correctness; worker-CTA leaks into customer browse |
| **offers** | Bids, direct offers, counters, accept | job_offers | jobs, payments | OfferComposer, BidCard | Sibling supersession races |
| **lifecycle** | Guarded status transitions, checklist, evidence, approve/dispute | jobs.status, job_checklist_items, completion_records, disputes | offers, payments | ChecklistCard, EvidenceGallery, StatusPill | Status drift between screens |
| **messaging** | Conversations, realtime chat, media | conversations, messages | offers (gating) | InboxScreen, ChatScreen | Participant RLS; realtime consistency |
| **portfolio** | Projects, gallery, manager | portfolio_projects (+media) | identity, storage | MediaGrid | Fake-work policy; privacy in photos |
| **reviews** | Ratings, review, tip trigger | reviews | lifecycle, payments | RatingStars | Gating (only completed jobs) |
| **payments** | Ledger, sandbox adapter, checkout | payments | offers, lifecycle | MoneyText | Mislabeling held funds as paid |
| **earnings** | Wallet states, payout breakdown | derived from payments | payments | ListScreen | Displayed figures diverging from ledger |
| **notifications** | Event feed, push tokens, deep links | notifications, device_push_tokens | all event sources | ListScreen | Wrong-mode deep links |
| **settings** | Preferences, privacy, support, mode switch entry | profiles, settings | modes | SettingsList rows | Accidental destructive actions |

---

## E. Screen consolidation map

63 in-scope atlas screens (66 minus 09–11) collapse into **~40 routes built from 6 screen templates and ~10 heavyweight shared components**. 8 routes are already done and locked.

**The six templates** (each ships loading / empty / error+retry / offline / permission-denied states built in, so every screen inherits them for free):
`FormScreen` (single form or multi-step wizard) · `ListScreen` (configurable browse/list with header, tabs, pull-refresh) · `DetailScreen` (media header + sections + sticky action bar) · `SuccessScreen` (confirmation with next actions) · `InboxScreen` · `ChatScreen`.

**Heavyweight shared components:** `JobCard` (mode-aware — reads perspective from ModeContext, renders EST. PRICE + customer actions or EST. PAY + worker actions; leakage is structurally impossible because the perspective is not a manually passed prop) · `OfferComposer` · `MarketplaceBrowse` · `FilterSheet` · `MapDiscovery` · `CommitmentsList` · `ChecklistCard` · `EvidenceGallery` · `MoneyText` (renders payment-state-accurate labels) · `MediaUploader` (failure-safe, never clobbers existing media).

| Atlas screens | Family | Built as | Distinct routes |
|---|---|---|---|
| 01–06 | Auth | **LOCKED** | 6 (done) |
| 07, 48 | Homes | **LOCKED** | 2 (done) |
| 08 | Rebook & recent | ListScreen fed by saved/recent; entry from Home "See all" | 1 |
| 12–15 | Post wizard | One FormScreen wizard, 4 steps, one route | 1 |
| 16, 32, 53 | Confirmations | SuccessScreen, 3 configs | 3 |
| 17, 18, 20 | Explore/search | MarketplaceBrowse, 3 configs (services / workers / results) | 3 |
| 19, 49 | Map discovery | One MapDiscovery, mode-injected data source + card | 2 thin routes |
| 21, 50 | Filters | One FilterSheet, config-driven sections | modal, 2 configs |
| 22, 63 | Worker profile | One WorkerProfileScreen with `isOwner` (63 = own preview + manage entries) | 2 thin routes |
| 23, 65 | Portfolio gallery / manager | Shared gallery grid; manager adds edit affordances | 2 |
| 24, 25 | Project / service detail | DetailScreen configs | 2 |
| 26, 30, 52 | Offer forms | **One OfferComposer** (price, window, message, included work) with kind = direct / counter / bid | 1 component, 3 entry routes |
| 27, 28, 29 | Bids | BidsScreen (list + compare toggle) + BidDetail on DetailScreen | 2 |
| 31 | Checkout | Distinct screen over payments adapter | 1 |
| 33, 56 | Tracking / route | Shared LiveJobMap section; customer-track and worker-route thin screens | 2 |
| 34, 55 | Active job | Shared ActiveJob layout + mode perspective (customer: progress/approve path; worker: start/route/checklist path) | 2 |
| 57 | Checklist | Worker route; customer sees read-only ChecklistCard inside 34 | 1 |
| 35, 58 | Evidence | Shared EvidenceGallery; customer review screen + worker upload FormScreen | 2 |
| 36, 37 | Approve/dispute, review & tip | Decision screen + FormScreen | 2 |
| 38, 54 | My Jobs / My Work | **One CommitmentsList** (lifecycle-group tabs, mode-specific cards/copy) | 2 thin routes |
| 39, 51 | Job detail | Shared JobDetail body (media/scope/meta) + mode action bar: 39 = customer's own job, 51 = worker marketplace view. Plus a customer marketplace **preview** route (no bid CTA, EST. PRICE) for the customer "View All" browse case | 3 |
| 40, 61 / 41, 62 | Inbox / chat | One InboxScreen + one ChatScreen; quick replies + context actions from ModeContext | 2 + 2 thin routes |
| 42 | Notifications | ListScreen, both modes | 1 |
| 43–47 | Customer account | SettingsList + FormScreen configs (profile, edit, payments, saved, settings) | 5 |
| 59, 60 | Earnings | ListScreen + DetailScreen over ledger | 2 |
| 64, 66 | Worker manage | FormScreen configs (services/pricing, availability/verification) | 2 |

**The three consolidations that save the most code:** OfferComposer (3 screens → 1 form), MarketplaceBrowse (3+ screens → 1 template), CommitmentsList (2 screens → 1 template). Claude Code must not implement any member of a family without checking whether the family template already exists.

---

## F. Navigation architecture

```
RootNavigator (switches on session + mode; only ModeProvider can change mode)
├── AuthStack            [no session]        01 → 02 → 03/04 → 05 → 06
├── CustomerRoot         [session, mode=customer]
│   ├── CustomerTabs: Home · Explore · Post(+) · Inbox · Profile
│   └── CustomerStack: PostJobWizard, JobPublished, MyJobs, CustomerJobDetail,
│       MarketJobPreview, MarketplaceBrowse(services|workers|results), MapDiscovery,
│       FilterSheet(modal), WorkerProfile, PortfolioGallery, PortfolioProject,
│       ServiceDetail, SendOffer, JobBids, CompareBids, BidDetail, Counteroffer,
│       Checkout, JobConfirmed, TrackWorker, ActiveJob, EvidenceReview,
│       ApproveOrDispute, ReviewAndTip, Chat, Notifications, EditProfile,
│       PaymentMethods, SavedWorkers, Settings
└── WorkerRoot           [session, mode=worker]
    ├── WorkerTabs: Find Jobs · Map · My Work · Inbox · Profile
    └── WorkerStack: WorkerJobDetail, SubmitBid, BidSent, Counteroffer, MyWork,
        WorkDetail, RouteArrival, WorkChecklist, CompletionUpload, Earnings,
        PayoutDetails, Chat, Notifications, PublicProfilePreview, ServicesPricing,
        PortfolioManager, AvailabilityVerification, Settings
```

**Enforcement mechanisms (all four, not any one):**

1. **Type-level:** separate `CustomerParamList` and `WorkerParamList`. Navigators are typed against exactly one list, so `navigate('WorkerJobDetail')` from customer code is a compile error caught by `tsc`.
2. **Mount-level:** the trees are mutually exclusive children of the root. A screen from the other tree cannot render because it is not mounted.
3. **Intent-level:** `switchMode(target)` is the only function that changes mode. It confirms with the user, persists `active_mode`, resets both stacks to tab roots, and swaps trees. It is called only from Settings/Profile mode-switch controls — never from data taps, "View All", cards, or notifications.
4. **Runtime guard (dev):** a `ModeGuard` assertion in worker-only components logs loudly if mounted under `CustomerRoot` (and vice versa) — the canary for future mistakes.

**Deep links:** `brazos://c/...` and `brazos://w/...`. A link targeting the other mode never switches silently — it opens a confirm ("Switch to Worker Mode to view this?"); decline lands on the current mode's home. Notification payloads carry the mode segment; the notifications router resolves per §Phase 12.

**Customer browsing the job marketplace** ("View All"): stays entirely inside CustomerRoot on the `MarketJobPreview` route — JobDetail body, customer perspective (EST. PRICE, no bid CTA, no worker payout info, approximate location only). This is the atlas §8 rule made structural.

**Chat routes** exist in both trees as `Chat(conversationId)`; the screen is the same ChatScreen template, and mode-appropriate quick replies/context actions come from ModeContext.

---

## G. Database architecture (logical target — AUDIT EXISTING SCHEMA FIRST, then KEEP/MODIFY/MIGRATE/ADD per entity)

**Identity & worker supply**
- `profiles` — one row per account: name, avatar, active_mode, E.164 phone (private), created flags. Public columns exposed via a view or column-level policy; phone never publicly readable.
- `worker_profiles` — 1:1 extension: headline, bio, travel radius, base location, rating aggregates, online flag. Public read.
- `worker_services` — services offered, starting price, category FK. Public read; owner write.
- `service_categories` — taxonomy. Public read; admin write.
- `worker_availability` — weekly schedule + pause_until. Public read (coarse), owner write.
- `worker_verification` — status enum (unverified / pending / verified), evidence refs. Status public; evidence + writes admin-only.

**Jobs & negotiation**
- `jobs` — marketplace-safe fields only: title, description, category, budget range, timing window, **approximate** location (area label + coarse point for radius search), status (canonical enum §H), customer_id, hired_worker_id + accepted_offer_id when hired, visibility (`open_market` | `direct`). Published rows readable by any authenticated user; drafts owner-only.
- `job_private_details` — 1:1: exact address, geo point, access/entry notes. **RLS: job owner always; hired worker only after acceptance.** This split is the address-privacy rule enforced in the database, not the UI.
- `job_media` — photos/video refs. Follows job visibility.
- `job_offers` — **the single negotiation table**: job_id, author_id, author_role (customer|worker), kind (bid | direct_offer | counter), parent_offer_id (counter chains), amount, proposed window, message, included work, status (§H). Direct offers from a worker profile create a `visibility='direct'` job targeting that worker. Readable by job owner + offer author (+ targeted worker for direct jobs).
- `job_checklist_items` — per-job steps, done flags, evidence refs. Hired pair read; worker write; customer read-only.
- `completion_records` — evidence media refs, note, attestation, submitted_at, decision (§H). Hired pair.
- `disputes` — issue report: reason, description, media, status, resolution. Parties read/create; resolution writes admin/service-role only.

**Money**
- `payments` — the ledger, one row per money event: job_id, payer/payee, kind (job_payment | tip), amount, fee breakdown, provider ref (sandbox), status (§H), timestamps per transition. Payer sees their rows; payee sees payout-relevant columns. Wallet/earnings screens are **derived from this table** — never a separate hand-maintained balance.

**Communication & reputation**
- `conversations` — job_id + participant pair; created when an offer first links two users. Participants only.
- `messages` — conversation_id, sender, body, media refs, read markers. Participants only, via conversation membership.
- `reviews` — job_id (unique), rating, text, tip_payment_id nullable. Written only by the customer of a completed job (enforced in policy/RPC); public read.
- `saved_workers` — owner-only.
- `portfolio_projects` (+ media) — worker-owned; published rows public, drafts owner-only.
- `notifications` — recipient, type, linked object, mode hint, read flag. Recipient-only.
- `device_push_tokens` — owner-only.

**Privacy boundary summary**

| Data class | Readable by |
|---|---|
| Published job marketplace fields, worker public profile/portfolio/reviews/services, categories | Any authenticated user |
| Exact address, entry notes | Job owner; hired worker after acceptance |
| Bids/offers on a job | Job owner + each offer's author |
| Conversation + messages + checklist + evidence | The two participants |
| Payment rows | Payer (full) / payee (payout view) |
| Phone numbers, drafts, saved workers, notifications, push tokens, payment methods | Owner only |
| Dispute resolution, verification evidence, moderation | Admin / service role only |

Media classes (job / message / portfolio / evidence) may exist as separate tables or one polymorphic media table today — **VERIFY DURING REPOSITORY AUDIT** and keep whichever exists; the storage buckets must carry policies matching the table boundaries either way.

---

## H. Canonical state machines

All five live as Postgres enums; generated types are imported everywhere; screens never invent values. Job-status and offer-acceptance transitions execute only through two security-definer RPCs — `advance_job_status(job_id, to_status)` and `accept_offer(offer_id)` — which validate caller role and current state; RLS blocks direct `UPDATE` of the status columns. This single mechanism is what prevents "different screens interpreting status differently."

**1. Job lifecycle**
`draft → published → pending_payment → confirmed → en_route → arrived → in_progress → completion_submitted → approved → completed`
Branches: `published → expired` · `any pre-completion → cancelled_by_customer | cancelled_by_worker` (worker cancel of a confirmed job returns it to `published` or cancels per customer choice) · `completion_submitted → disputed → (approved | refund path)`.
UI grouping for tabs (My Jobs / My Work): **Open** draft, published · **Upcoming** pending_payment, confirmed · **Active** en_route, arrived, in_progress, completion_submitted · **Done** approved, completed · **Attention** disputed, cancelled_* , expired.

**2. Offer/bid lifecycle**
`pending → accepted | declined | withdrawn | expired | superseded`
A counter creates a child row and marks the parent `superseded`. `accept_offer` atomically: sets that offer `accepted`, marks all sibling pending offers `superseded`, sets job → `pending_payment`, stamps hired_worker_id + accepted_offer_id.

**3. Payment lifecycle**
`unfunded → authorized → held → released → paid_out`
Branches: `authorized → failed | voided` · `held → refunded | partially_refunded` (dispute resolutions).
Mandatory UI copy (via MoneyText): authorized = "Payment authorized — not charged yet" · held = "Funds held in protection" · released = "Released to worker" · paid_out = "Paid out". **"Paid" never appears before `released`.** Sandbox adapter: checkout drives authorized→held; customer approval drives held→released; cash-out simulates released→paid_out.

**4. Worker availability**
`offline ⇄ online`, plus weekly schedule and `pause_until`. Busy state (on an active job) is **derived** from assignments, never stored separately. Optional auto-offline while `in_progress`.

**5. Completion / dispute**
`awaiting_evidence (implicit while in_progress) → submitted → approved | issue_reported → dispute_open → resolved_release | resolved_refund | resolved_partial`
**Decision:** auto-approve 72h after submission if the customer takes no action (config constant; implemented as an on-read check first, scheduled function later — **VERIFY DURING REPOSITORY AUDIT** whether an edge-function/cron pattern already exists).

---

## I. Shared design system

Tokens are extracted **verbatim from the locked screens' stylesheet** (`style.css`) — they already define the Emerald Trust language; nothing is invented.

**Color tokens:** `bg #F6F3EA · surface #FFFFFF · ink #13201B · muted #6E7771 · forest #064C3B · emerald #0D6B52 · mint #E5F1EC · mint2 #D3E8DF · gold #C8A15B · goldSoft #F3E7CE · line #DDE2DD · danger #9C3F35` (danger surfaces `#F5E7E4` / border `#E9CAC5`; secondary border `#CBE0D7`; inactive nav `#839087`).
**Shadow:** color `#10261D`, opacity 0.08, radius ~14, offset (0,5); Android elevation ~3. Verify visually against locked screens.
**Radii:** `xs 10 · sm 13 · md 14 · lg 17 · xl 20 · xxl 22 · pill 999`.
**Type scale** (Inter; prototype px mapped to RN pt): display 28/1.05 800 · h1 26 · h2 21 · title 15/600–700 · body 14 · sub 11 muted · caption 10 · eyebrow 9/800, letter-spacing 1.2, uppercase, emerald.
**Spacing:** 4-base — 4/8/12/16/20/24/32; screen gutter 16; card padding 14; card gap 10. Buttons: height 38 (small 28); variants primary(forest/white), secondary(mint/forest), ghost, light(white), danger, small.

**Primitives (~25 — hard cap; adding a 26th requires a justification line in BUILD_STATE):**
Button · Input (text/phone/currency/textarea) · Card · Chip · SegmentedTabs · TopBar · BottomNav · Avatar · StatusPill (job/offer/payment enum-driven) · ListRow · SearchBar · EmptyState · Skeleton · Sheet/Modal · MoneyText · StepHeader · RatingStars · MediaGrid · MediaUploader · JobCard (mode-aware) · WorkerCard · ServiceCard · BidCard · ChecklistCard · EvidenceGallery · LiveJobMap.

**Templates (6):** FormScreen(+wizard) · ListScreen · DetailScreen · SuccessScreen · InboxScreen · ChatScreen — each with built-in loading/empty/error+retry/offline/permission-denied states and keyboard avoidance, so individual screens inherit correctness.

**Dev component catalog** — a hidden dev-only route rendering every primitive in every state. Any edit to a shared component requires eyeballing the catalog plus one representative real screen per template. This is the regression canary for "fixed one screen, broke five."

**Responsive rules:** SafeArea everywhere; flex layouts; no absolute positioning to match a PNG; no fixed 390×844 assumptions; text wraps; bottom content never collides with the floating nav (respect its 68pt + margins); reference PNGs are direction, not canvases.

---

## J. Master implementation sequence

**Git strategy (applies to all phases):** `mainexpo` stays stable and always-runnable. All V2 work happens on a single long-lived `v2` branch. One commit per Definition-of-Done milestone (a phase may be 2–4 commits at natural sub-milestones), imperative messages, clean tree between prompts. At the end of each phase: run the quality gate, merge `v2 → mainexpo`, tag `phase-N`. No other branches except a short-lived spike for something genuinely risky, deleted after. No giant unreviewable commits; no branch proliferation.

**Quality gate (end of every phase, and after any shared-component or DB change):** `npx tsc --noEmit` → `npx eslint .` → `node scripts/verify-schema.mjs` (if DB touched) → mode-isolation smoke (launch → customer home → switch → worker home → switch back; attempt cross-tree navigation must be a compile error) → RLS probe script (anon key cannot read address/phone/messages/payments of others). Fix until clean, or stop and report after two rounds with no progress.

---

**Phase 0 — Repository audit (MEDIUM)**
**Goal:** truth on paper; zero code changes. **Why now:** every later phase depends on KEEP/MODIFY decisions; skipping this is how duplicates happen. **Scope:** execute §B exactly. **DB:** verify-schema + schema matrix. **Checks:** none beyond running existing scripts. **DoD:** SCREEN_CROSSWALK.md, DESIGN_SYSTEM_STATUS.md, KEEP/FIX/CONSOLIDATE/REMOVE/ADD summary, all VERIFY tags in this plan resolved, BUILD_STATE initialized, nav-bar-bug verdict recorded. **Not included:** fixes of any kind. **Git:** docs-only commit `phase-0 audit`. **Parallel:** No — everything depends on it.

**Phase 1 — Design system foundation (MEDIUM)**
**Goal:** tokens + primitives + 4 templates (Form, List, Detail, Success) + dev catalog exist and are the mandatory basis for all future screens. **Why now:** every screen after this consumes it; building screens first recreates the 66-one-off problem. **Reuse:** whatever DESIGN_SYSTEM_STATUS found; extract token values to match locked screens exactly. **FE:** `ui/tokens.ts`, primitives, templates, catalog route. **DoD:** catalog renders every primitive/state; tokens visually match screens 07/48 side-by-side; locked screens untouched (byte-identical); gate clean. **Not included:** migrating any existing screen; Inbox/Chat templates (Phase 7). **Git:** `phase-1 design-system`. **Parallel:** No.

**Phase 2 — Mode & navigation hardening (MEDIUM)**
**Goal:** the cross-mode bug becomes structurally impossible. **Why now:** adding ~30 routes before isolation exists multiplies the leak surface. **Reuse:** existing router (per audit — do not switch routers); existing mode handling if any. **FE:** ModeProvider, typed param lists, root switch, `switchMode()` with confirm + stack reset, deep-link scheme `c/`|`w/` with cross-mode confirm, ModeGuard dev assertion; **fix the bottom-nav breakage here if Phase 0 confirmed it**. **DoD:** compile error on cross-tree navigate; smoke script passes on device; both locked homes reachable and untouched; nav renders correctly. **Not included:** new feature screens. **Git:** `phase-2 mode-isolation`. **Parallel:** No.

**Phase 3 — Data foundation (LARGE)**
**Goal:** canonical enums, privacy splits, guarded transitions, RLS baseline live and verified. **Why now:** every vertical slice writes against this; doing it per-slice rewrites migrations. **Reuse:** audit's schema matrix — keep everything working; only MODIFY/ADD gaps. **DB:** numbered migrations for status enums; `job_private_details` split (with data backfill if addresses currently sit on jobs); `job_offers` unification or a mapping layer over existing bid/offer tables (audit decides — prefer migrating data into one table if current tables are fragmented); RPCs `advance_job_status`, `accept_offer`; RLS for jobs/private details/offers/conversations/messages/payments; storage bucket policies; extend verify-schema for all of it; regenerate types. **FE:** replace raw status strings in touched code with generated enums. **DoD:** verify-schema green; RLS probe proves address/phone/messages unreadable cross-user; types imported; app still runs. **Not included:** new UI. **Git:** 2–3 commits (`enums+rpcs`, `privacy-split`, `rls`), tag phase-3. **Parallel:** No.

**Phase 4 — Post-a-job vertical slice (MEDIUM)** — screens 12–16, 51, minimal 38/39
**Goal:** a customer posts a real job; a worker sees and opens it on another device. **Why now:** first end-to-end proof of the foundation; produces the data every later slice needs. **Reuse:** existing job-creation code per audit; Worker Home 48 already lists jobs — wire its data source to real published jobs **without modifying the screen's UI** (VERIFY current source in audit). **DB:** any missing job columns, media upload path. **FE:** PostJobWizard (FormScreen), JobPublished (SuccessScreen), WorkerJobDetail 51 (DetailScreen, worker perspective, approximate location only), MyJobs 38 minimal (CommitmentsList, Open tab), CustomerJobDetail 39 basic; draft persistence across app kill; MediaUploader failure-safe. **DoD:** cross-account post→discover→open on two devices; drafts survive; failed media upload preserves prior state; gate clean. **Not included:** bidding, explore/search breadth, maps. **Git:** `phase-4 post-slice`. **Parallel:** No (first consumer of Phase 3).

**Phase 5 — Bidding & hiring slice (LARGE)** — screens 26–32, 52, 53
**Goal:** the full hire loop: bid/direct-offer/counter → compare → accept → sandbox checkout → confirmed. **Why now:** completes the marketplace's economic core; everything after assumes a hired pair. **Reuse:** existing bidding/acceptance code per audit; `accept_offer` RPC from Phase 3. **DB:** sandbox payment adapter writing real `payments` rows (authorized→held); offer expiry defaults. **FE:** OfferComposer (one component; SubmitBid 52, SendOffer 26, Counteroffer 30 entries), JobBids 27 / CompareBids 28 / BidDetail 29, BidSent 53, Checkout 31, JobConfirmed 32; MoneyText labels throughout. **DoD:** two-device hire loop; accepting supersedes siblings atomically; decline/withdraw/expire work; money never labeled beyond its true state; gate clean. **Not included:** post-hire lifecycle, messaging. **Git:** 2 commits (`negotiation`, `checkout`), tag phase-5. **Parallel:** No.

**Phase 6 — Active-work lifecycle slice (LARGE)** — screens 33–37, 55–58
**Goal:** confirmed → en route → arrived → in progress → evidence → approve/dispute → completed, with funds released honestly. **Why now:** closes the loop opened in 4–5. **Reuse:** existing lifecycle/evidence code per audit. **DB:** checklist + completion_records + disputes tables if missing; transition validations in `advance_job_status`; auto-approve on-read check. **FE:** WorkDetail 55, RouteArrival 56 (status buttons + ETA + static map), WorkChecklist 57, CompletionUpload 58, TrackWorker 33, ActiveJob 34, EvidenceReview 35, ApproveOrDispute 36, ReviewAndTip 37 (review gated to completed; tip = sandbox payment row). **DoD:** full lifecycle on two devices ends `completed` with payment `released`; dispute path freezes release and records the issue; out-of-order transitions rejected by RPC; gate clean. **Not included:** live GPS streaming; earnings screens. **Git:** 2–3 commits, tag phase-6. **Parallel:** No.

**Phase 7 — Messaging (MEDIUM)** — screens 40, 41, 61, 62
**Goal:** realtime job-linked chat between the pair. **Why now:** a marketplace without coordination isn't credible at launch; independent of discovery breadth. **Reuse:** existing messaging tables/realtime per audit. **DB:** conversation auto-create when an offer first links two users (messaging allowed once an offer/bid exists between the pair — pre-hire chat is offer-scoped; addresses never auto-inserted); read markers. **FE:** InboxScreen + ChatScreen templates, both modes' thin routes, media messages, job-context header, mode-specific quick replies, unread counts. **DoD:** two-device realtime chat with media; participants-only RLS proven by probe; unread counts correct; gate clean. **Not included:** offline outbox queue; typing indicators. **Git:** `phase-7 messaging`. **Parallel:** **Yes** — depends only on Phase 3 (+pair data from 5); can interleave with Phase 6.

**Phase 8 — Discovery breadth (LARGE)** — screens 08, 17–21, 49, 50, MarketJobPreview
**Goal:** explore services/workers, search results, filters, list/map discovery with radius, saved/rebook surfaces. **Why now:** widens supply/demand matching once the core loop works; heavy but parallelizable. **Reuse:** existing browse/map/radius code per audit; MapDiscovery may wrap existing map components. **DB:** radius RPC (keep existing approach if correct; PostGIS `ST_DWithin` or haversine — audit decided); indexes for filters. **FE:** MarketplaceBrowse ×3, FilterSheet (21/50), MapDiscovery (19/49), Rebook 08, MarketJobPreview (customer-safe job browse). **DoD:** radius/filter correctness against seeded data; list/map parity; ModeGuard confirms zero worker CTAs in customer browse; smooth scroll on low-end Android (virtualized lists); gate clean. **Not included:** ranking algorithms beyond simple sort. **Git:** 2 commits (`browse+filters`, `maps`), tag phase-8. **Parallel:** **Yes** — after Phases 1–3; independent of 5–7.

**Phase 9 — Profiles, portfolio & worker self-service (MEDIUM)** — screens 22–25, 43–46, 63–66
**Goal:** workers fully manage their public presence; customers get the trust surfaces. **Reuse:** existing profile/portfolio code per audit. **DB:** portfolio drafts/publish, services/pricing, availability, verification status field. **FE:** WorkerProfile 22/63 (isOwner), PortfolioGallery 23 / Manager 65, PortfolioProject 24, ServiceDetail 25, ServicesPricing 64, AvailabilityVerification 66, EditProfile 44 (failure-safe avatar), PaymentMethods 45 (sandbox), SavedWorkers 46, profile hub 43 polish. **DoD:** end-to-end: worker edits services/portfolio/availability → customer sees changes; avatar failure preserves old photo; drafts invisible publicly; gate clean. **Not included:** KYC provider. **Git:** `phase-9 profiles`. **Parallel:** **Yes** — after 1–3; only 25's booking entry touches offers.

**Phase 10 — Reviews & reputation (SMALL)**
**Goal:** review+tip flow live; aggregates on worker profiles; simple customer-reliability signal (completed/cancelled counts). **Reuse:** ReviewAndTip screen from Phase 6; reviews table per audit. **DoD:** one review per completed job enforced in DB; aggregates correct; tip appears as a ledger row; gate clean. **Not included:** worker-written text reviews of customers. **Git:** `phase-10 reviews`. **Parallel:** **Yes** — after 6.

**Phase 11 — Earnings & money surfaces (MEDIUM)** — screens 59, 60
**Goal:** wallet (pending/available/transferred) and per-job payout breakdown derived entirely from the ledger; simulated cash-out. **Why now:** ledger rows exist from 5–6; this is presentation + fee math. **DoD:** every displayed figure reproducible from `payments` rows; fee math matches checkout; cash-out flips released→paid_out with honest labels; gate clean. **Git:** `phase-11 earnings`. **Parallel:** **Yes** — after 6.

**Phase 12 — Notifications (MEDIUM)** — screen 42
**Goal:** in-app event feed + mode-aware deep links + push token architecture. **DB:** notifications table + triggers/RPC hooks on: bid received, offer/counter received, accepted, status transitions, message received, evidence submitted, approval. **FE:** feed (ListScreen), mark read, tap-through respecting the §F cross-mode confirm; expo push token registration + no-op delivery adapter. **DoD:** every listed event produces a row; taps land on the right screen in the right mode or confirm a switch; gate clean. **Not included:** production push credentials/delivery. **Git:** `phase-12 notifications`. **Parallel:** **Yes** — after 5–7 event sources exist.

**Phase 13 — Hardening & release checkpoint (MEDIUM)**
**Goal:** V1 quality bar. **Scope:** sweep every route for template-state coverage (loading/empty/error/offline/permission-denied actually configured, not just available); responsive pass on small iPhone, large Android, notch/safe-area variants; keyboard behavior on every form; list performance; basic accessibility labels; the regression suite finalized as one script (`npm run gate`); critical-flow checklist executed end-to-end on two devices (auth · customer loop · worker loop · messaging · mode switching ×3 · RLS probe · radius). Dead code identified in Phase 0 and now confirmed unused gets deleted here, not before. **DoD:** gate script green; checklist signed off in BUILD_STATE; tag `v1.0-core` on mainexpo. **Git:** `phase-13 hardening`, tag. **Parallel:** No — final.

---

## K. Critical path

**Blocking chain (strict order): 0 → 1 → 2 → 3 → 4 → 5 → 6.** That chain alone yields a working marketplace loop: post → discover (via Worker Home list) → bid → hire → pay (sandbox) → work → evidence → approve → funds released.

**Launch-credibility tier — required before calling V1 done, but parallelizable after Phase 3:** **7 (messaging)** — hiring strangers without chat isn't shippable; **8 (discovery)** — the loop works off the home list, but explore/search/map is what makes supply findable; **9 (profiles/portfolio)** — workers need self-service before real workers onboard.

**Polish tier — after the above, any order:** 10, 11, 12, then 13 to close.

**Practical schedule for one builder + Claude Code:** run 0–6 sequentially; then interleave 7 and 8 (7 first — smaller, higher credibility value); then 9; then 10–12 in any order; 13 last. If usage runs short mid-project, the safe pause points are the phase tags — every tag is a runnable app.

---

## L. Claude Code execution protocol (paste this before any coding task)

```
PROTOCOL — BRAZOS (read fully, then execute):
1. Read BRAZOS_BUILD_STATE.md, then ONLY the current-phase section of
   BRAZOS_MASTER_PLAN.md. Do NOT rescan the repository; the Phase-0 audit
   docs already describe it.
2. List the exact files you will read and the exact files you will change.
   Keep both lists minimal. If the list grows mid-task, stop and say why.
3. Plan the smallest change that satisfies the next unmet DoD item. Reuse
   the design-system primitives/templates and existing domain code; check
   SCREEN_CROSSWALK.md before creating any screen or component.
4. Implement. Constraints: never modify screens 01–07 or 48, the frozen
   PWA, or docs/emerald-v2 references; no new dependencies without flagging
   and waiting; no status string literals (import generated enums); no
   mode changes outside switchMode(); no files outside your declared list;
   no "while I'm here" cleanup.
5. DB changes = a new numbered migration in supabase/ + extend
   scripts/verify-schema.mjs. SQL Editor "success" is not proof — only a
   green verify run counts. Then regenerate types.
6. Run the gate: npx tsc --noEmit → npx eslint . → verify-schema (if DB
   touched) → mode-isolation smoke → RLS probe (if policies touched).
   If a shared UI component changed, open the dev catalog and one real
   screen per affected template.
7. Fix your own failures. If two consecutive rounds make no progress,
   stop and report exactly what is failing and why.
8. Update BRAZOS_BUILD_STATE.md: progress, decisions made, migrations
   verified, known issues, the next exact task.
9. One commit with an imperative summary of what changed and why. Clean
   working tree.
```

Model/effort conventions from your existing kit still apply: use your strongest model for architecture-heavy phases (2, 3, 5, 6) and a faster model for repetitive screen builds on established templates (parts of 8, 9); use your kit's batch-audit prompt pattern for "check many things and report" tasks like Phase 0 and the Phase 13 sweep.

---

## M. Context-management strategy

**Three permanent documents — no more:**

1. **`CLAUDE.md`** (repo root, loaded automatically each session) — the always-on rules. Replace the current V2 block with:

```markdown
## BRAZOS V2 — Emerald Trust

### References
- docs/emerald-v2/references/screen_map.json + NN_slug.png (immutable).
- Audit docs: docs/emerald-v2/SCREEN_CROSSWALK.md, DESIGN_SYSTEM_STATUS.md.
- Roadmap: BRAZOS_MASTER_PLAN.md. Session state: BRAZOS_BUILD_STATE.md
  (read BUILD_STATE first, always).

### Locked — never modify
- App screens 01–07 (Launch→Customer Home) and 48 (Worker Home): finished.
- The frozen PWA/web build. The emerald-v2 reference files.

### Scope
- AI screens 09–11 and all LLM dependencies are OUT of V1. Manual posting
  produces a JobDraft; nothing may depend on AI.

### Non-negotiable architecture
- One account, two modes. Mode changes ONLY via switchMode() with confirm
  + stack reset. Customer and Worker navigator trees are separately typed;
  cross-tree navigation must be a compile error.
- Customer surfaces: EST. PRICE, no bid CTAs, no worker payout info,
  approximate location only. Worker surfaces: EST. PAY + bid actions.
  JobCard perspective comes from ModeContext, never a hand-passed prop.
- Job/offer/payment statuses come from generated DB enums via the RPCs
  advance_job_status / accept_offer. No string literals, no raw UPDATEs.
- Exact address lives in job_private_details: owner + hired worker only,
  enforced by RLS, never only by the frontend.
- Money labels follow the payment state machine. Never "paid" before
  released. Never fake production payment states.

### UI rules
- Every screen consumes ui/tokens.ts + shared primitives/templates. No
  per-screen hex, radii, or spacing. Templates provide loading/empty/
  error/offline/permission-denied — configure them, don't reinvent them.
- Recoverable errors preserve user input. Failed uploads never clobber
  existing media. Destructive actions confirm; reversible ones get undo.
- Phones stored E.164. SafeArea everywhere; no absolute positioning to
  match PNGs; references are direction, not canvases.

### Workflow
- Migrations: numbered SQL in supabase/, hand-applied; only a green
  `node scripts/verify-schema.mjs` counts as applied. Regenerate types.
- Base branch mainexpo; work on v2; one commit per milestone; clean tree.
- Flag new dependencies before adding. No unrelated cleanup.
- Follow the PROTOCOL in BRAZOS_MASTER_PLAN.md §L for every task.
```

2. **`BRAZOS_MASTER_PLAN.md`** (this file) — the roadmap. Sessions read only the current-phase section plus any referenced section (§E before creating screens, §G/§H before DB work). Updated only when a plan-level decision changes; record the change in BUILD_STATE too.

3. **`BRAZOS_BUILD_STATE.md`** — the living state, read **first** every session, updated at the **end of every session**. Initialize with:

```markdown
# BRAZOS_BUILD_STATE
Updated: <date>

## Current phase
Phase 0 — Repository audit. Next exact task: execute §B checklist, write
crosswalk + design-system status docs, resolve all VERIFY tags.

## Phase log
- [ ] 0 audit · [ ] 1 design system · [ ] 2 mode/nav · [ ] 3 data ·
  [ ] 4 post · [ ] 5 hire · [ ] 6 lifecycle · [ ] 7 messaging ·
  [ ] 8 discovery · [ ] 9 profiles · [ ] 10 reviews · [ ] 11 earnings ·
  [ ] 12 notifications · [ ] 13 hardening
(mark with commit hash + one-line note when done)

## Locked
Screens 01–07, 48. Frozen PWA. emerald-v2 references.

## Resolved VERIFY items
- router: <expo-router | react-navigation>
- server-state layer: <existing … | TanStack Query added in Phase 1>
- radius search: <mechanism>
- media tables: <per-domain | polymorphic>
- scheduled-function pattern: <exists | on-read only>
- nav-bar bug: <fixed in Phase 2 | never reproduced>

## Key decisions (dated one-liners)

## Migrations applied (verify-schema green)

## Known issues

## Gate status
tsc · eslint · verify-schema · mode-smoke · rls-probe : <pass/fail each>
```

The Phase-0 audit outputs (`SCREEN_CROSSWALK.md`, `DESIGN_SYSTEM_STATUS.md`) are reference artifacts consulted when relevant, not required reading every session. This is the entire context system — nothing else needs to be re-explained to a new session.

---

## N. Risk register

| # | Risk | Failure looks like | Prevention (already in this plan) |
|---|---|---|---|
| 1 | Cross-mode leakage | Customer tap lands in Worker Mode; EST. PAY / bid CTAs shown to customers | Four-layer enforcement §F; ModeContext-driven JobCard; ModeGuard canary; mode smoke in every gate |
| 2 | RLS gaps | Address/phone/messages readable with another user's key | `job_private_details` split; boundary table §G; RLS probe script in the gate; never frontend-only hiding |
| 3 | Job-status drift | Screens disagree on what "active" means; illegal transitions | One enum + `advance_job_status` RPC; direct status UPDATEs blocked; UI grouping table §H |
| 4 | Money mislabeling | "Paid" shown for held funds; wallet diverges from truth | Payment state machine + MoneyText mandatory copy; earnings derived only from ledger rows |
| 5 | Migration drift | SQL Editor "success" but schema unchanged; types stale | verify-schema is the only proof; extend it per migration; regenerate types immediately |
| 6 | Shared-component regression | One primitive fix breaks five screens | Dev catalog check + one real screen per template after any shared edit; locked screens byte-identical |
| 7 | Realtime message inconsistency | Missing/duplicated messages, wrong unread counts | Single conversations model; read markers in DB; two-device DoD test in Phase 7 |
| 8 | Radius search wrong/slow | Workers miss nearby jobs or see far ones; map lags | Audit-first mechanism choice; seeded-data correctness test in Phase 8 DoD; indexes |
| 9 | Media upload data loss | Failed avatar/evidence upload clobbers previous data | MediaUploader writes-then-swaps; explicit DoD checks in Phases 4 and 9 |
| 10 | Responsive/safe-area breakage | Content under the floating nav; stretched layouts on tall phones | §I responsive rules; no PNG-absolute positioning; Phase 13 device sweep |
| 11 | Scope creep re-adding AI/paid services | LLM or live payment deps sneak back in | CLAUDE.md scope block; dependency flagging; adapters keep provider seams closed |
| 12 | Context waste | Sessions rescan the repo, re-decide architecture, duplicate files | BUILD_STATE-first protocol §L; crosswalk check before creating anything; declared file lists per task |

---

## O. Final folder/module architecture

Adopt **incrementally**: Phase 0 maps current → target; files move only when a phase already touches that domain. No big-bang reorganization commit.

```
src/
  navigation/            # root switch, AuthStack, CustomerRoot, WorkerRoot,
                         # CustomerParamList.ts, WorkerParamList.ts, linking.ts
  modes/                 # ModeProvider, switchMode, ModeGuard
  ui/                    # tokens.ts, primitives/ (Button, Card, …),
                         # templates/ (FormScreen, ListScreen, DetailScreen,
                         # SuccessScreen, InboxScreen, ChatScreen), catalog/
  features/
    auth/                # LOCKED screens live here untouched
    identity/            # profile, edit, avatar
    jobs/                # wizard, my-jobs, job details (customer + worker views)
    discovery/           # browse, filters, maps, saved/rebook
    offers/              # OfferComposer, bids screens
    lifecycle/           # active job, route, checklist, evidence, approve
    messaging/           # inbox, chat
    portfolio/
    reviews/
    payments/            # checkout, methods, sandbox adapter consumer
    earnings/
    notifications/
    settings/
    # each feature: screens/  components/  api.ts  hooks.ts  types.ts
  lib/
    supabase.ts          # THE client — exactly one
    adapters/            # sms.ts, payments.ts, push.ts (interface + mock + real)
    utils/               # phone (E.164), dates, currency, geo
  types/                 # generated database types + shared enums re-exports
assets/
supabase/                # numbered migrations, functions
scripts/                 # verify-schema.mjs, gate, rls-probe, seed
docs/emerald-v2/         # references (immutable), audit outputs
CLAUDE.md · BRAZOS_MASTER_PLAN.md · BRAZOS_BUILD_STATE.md
```

**Never duplicated, anywhere:** the Supabase client · design tokens · status enums/state logic · JobCard (and its perspective logic) · MoneyText/currency formatting · MediaUploader · navigation param types · phone normalization · radius query logic · the quality-gate script. If a second copy of any of these appears in review, the task is wrong.

---

## P. "DO NOT DO THIS" list

1. **Do not modify screens 01–07 or 48** — not styling, not layout, not "small improvements." Wiring their data sources to real data is allowed only where a phase says so, and only without visual/behavioral change.
2. Do not rebuild any working system the audit marked KEEP; extend or consolidate it.
3. Do not create a second version of an existing component or screen ("JobCardV2", "chat_new.tsx"). Fix the original or consolidate into it.
4. Do not change mode anywhere except `switchMode()`. No data tap, card, "View All", deep link, or notification may silently switch trees.
5. Do not render worker-only content (EST. PAY, Submit Bid, Break the Ice, payout info, precise location) in any customer surface — perspective comes from ModeContext, never a manually passed prop or a copied component.
6. Do not compare or assign job/offer/payment statuses with string literals, and do not `UPDATE` status columns directly — enums + RPCs only.
7. Do not create a new migration that re-declares existing schema; audit first, then MODIFY. Never mark a migration applied without a green verify-schema run.
8. Do not put security in the frontend only. Every privacy rule in §G exists as RLS/policy, and the probe script proves it.
9. Do not display or fabricate payment states ahead of reality — no "Paid" before `released`, no fake production provider responses.
10. Do not add dependencies without flagging first. TanStack Query (only if the audit found no equivalent) is the single pre-approved addition.
11. Do not re-introduce AI screens, LLM SDKs, or paid inference in any form in V1.
12. Do not fix layout with absolute positions, fixed 390×844 sizes, or magic numbers to match a PNG; the references are direction, not canvases.
13. Do not touch the frozen PWA/web build or the emerald-v2 reference files.
14. Do not rewrite unrelated files, reorganize folders wholesale, or do "while I'm here" cleanup during a focused task. Dead-code deletion happens in Phase 13.
15. Do not rescan the whole repository after Phase 0; read BUILD_STATE + the current phase + your declared file list.
16. Do not build a screen without checking §E and SCREEN_CROSSWALK.md for its family template first.
17. Do not skip the gate, and do not commit with a dirty tree or bundle unrelated changes into one commit.
18. Do not let a shared-component edit ship without the dev-catalog + representative-screen check.
19. Do not replace a working implementation just because a different one looks cleaner; replacement requires a reliability/reuse justification recorded in BUILD_STATE.
20. Do not store or display a customer's phone number or exact address anywhere outside the §G boundaries — including inside chat system messages and notifications.

---

*End of plan. Next action: paste the §L protocol and run Phase 0.*
