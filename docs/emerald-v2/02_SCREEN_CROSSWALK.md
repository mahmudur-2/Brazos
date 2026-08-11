# 02 — Screen Crosswalk (all 66 Emerald atlas screens)

Source of atlas truth: `design-reference/emerald-auth-v1/_extracted/BRAZOS_Emerald_Trust_UI/screen_map.json`
and the atlas PDF's per-screen spec pages (text-extracted and cross-checked —
identical purpose/actions/transitions to `screen_map.json` in every case
checked). Visual columns rely on a spot-check of 2 of 66 PNGs (Welcome,
Setup) — everything else is **VISUAL DETAIL UNVERIFIED** beyond structural
text.

**Validation:** 66 rows below, numbered 1–66, no gaps, no duplicate numbers.
Screens 41/62 ("Afnan M." / "Mah R.") are the atlas's named-example instances
of the generic chat screen — kept as their own rows per the atlas's own
66-screen count, cross-mapped to the same underlying `ChatScreen.tsx` route
as every other chat instance.

Split into two linked tables per mode group, joined by **#**. Status legend:
COMPLETE / PARTIAL / UI-ONLY / MOCKED / BROKEN / DEAD / UNKNOWN.

---

## SHARED / AUTH (Screens 1–6)

### Identity & status

| # | Atlas title | Slug | Purpose | Primary actions | Transitions | Current route/file | Status |
|---|---|---|---|---|---|---|---|
| 1 | Launch | launch | Brand launch, secure session restore | Restore session; continue to welcome/last mode | 02, 07, 48 | `screens/LaunchScreen.tsx` (overlay, not a nav route) | COMPLETE — intentionally diverges from atlas visually (per supplied context, not re-litigated) |
| 2 | Welcome | welcome | Introduce marketplace without forcing a role choice | Continue with phone; Sign in | 03, 04 | `screens/WelcomeScreen.tsx` (AuthStack) | COMPLETE — visually spot-checked against atlas, close match |
| 3 | Sign in | sign_in | Authenticate, phone first, email available | Submit phone; switch to email | 05, 04 | `screens/SignInScreen.tsx` + `screens/EmailSignInScreen.tsx` (AuthStack, two routes for the atlas's one screen) | COMPLETE |
| 4 | Create account | create_account | Create one identity for both modes | Enter identity; create account | 05 | `screens/CreateAccountScreen.tsx` + `screens/EmailCreateAccountScreen.tsx` (AuthStack, two routes) | COMPLETE |
| 5 | Verify phone | verify_phone | Confirm ownership before marketplace access | Enter code; resend | 06 | `screens/VerifyPhoneScreen.tsx` (AuthStack) | MOCKED — real UX, `lib/phoneAuth` mock provider, hands off to email auth for a real session |
| 6 | Setup | permissions_mode | Request permissions, choose initial mode | Enable permissions; choose initial mode | 07, 48 | `screens/SetupScreen.tsx` + `screens/LegalGateScreen.tsx` (OnboardingStack) | COMPLETE — mode choice is device-local only, see gap columns |

### Gaps & plan

| # | Reuse now | Must preserve | Missing UI | Missing workflow | Missing backend | Shared components needed | DB entities needed | Permissions | External dep | Mockable now | Classification | Phase | Effort | Risk | Key acceptance criteria | Unknowns |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Whole screen | Timing/crossfade-with-hydration behavior | None | None | None | None | None | None | None | N/A — already real | Visual reskin only (deferred, deliberately diverges) | 1 | XS | Low | Session restore never shows a blank frame | None |
| 2 | Whole screen | Button destinations, copy | None found in spot-check | None | None | None | None | None | None | N/A | Visual reskin only | 1 | XS | Low | Matches atlas layout/copy | Exact hex values |
| 3 | Whole screen | Phone-first/email-fallback split as two routes | None | None | None | None | None | None | None | N/A | Visual reskin only | 1 | XS | Low | Both entry paths reachable | Exact hex values |
| 4 | Whole screen | Two-route split | None | None | None | None | None | None | None | N/A | Visual reskin only | 1 | XS | Low | Both entry paths reachable | Exact hex values |
| 5 | Whole screen | Mock-mode banner, provider adapter shape | None | None | None | None | None | None | SMS provider (Phase 8) | Yes — already the reference mock pattern | Existing feature requiring workflow changes (real SMS activation later) | 1 (visual), 8 (real SMS) | XS (visual) | Low (visual) / Med (real SMS, Phase 8) | Mock clearly labeled, never claims a real session | Real SMS provider choice |
| 6 | Whole screen | Permission read-only-on-tap, legal-gate delegation, sign-out escape | Token verification only | Mode-persistence decision (see doc 05) | `profiles.mode_preference` column, if decision made | Generalized permission-row (Phase 1) | None yet — see doc 05 | Location, notifications (already correctly modeled) | None | Yes, already device-local | Existing feature requiring workflow changes | 1 (visual), 2 (mode decision) | S | Low (visual) / Med (mode decision touches persistence) | See [09_SETUP_IMPLEMENTATION_HANDOFF.md](09_SETUP_IMPLEMENTATION_HANDOFF.md) | Whether user wants mode durable now or later |

---

## CUSTOMER MODE (Screens 7–47)

### Identity & status

| # | Atlas title | Slug | Purpose | Primary actions | Transitions | Current route/file | Status |
|---|---|---|---|---|---|---|---|
| 7 | Home | customer_home | Primary customer dashboard, AI-assisted posting, nearby supply | Type/photo/voice intake; post a job; browse nearby | 09, 12, 20 | `screens/HomeScreen.tsx` (HomeStack) | COMPLETE (existing, single-mode) |
| 8 | Rebook & recent | rebook_recent | Reduce repeat-job friction, surface trusted relationships | Rebook prior worker; open recent profile; browse services | 25, 22, 17 | No dedicated screen — closest analog is the "Hire Again" flow (`hireWorkerId` param on PostJob, `JobRequestCard`) | PARTIAL — backend exists (`create_job_request`), no dedicated rebook/recent surface |
| 9 | AI Concierge | ai_concierge | Natural-language problem description, AI optional | Text/photo/voice input; manual fallback | 10, 12 | None | NOT IMPLEMENTED |
| 10 | Clarify the job | ai_clarify | Ask only high-value scoping questions | Answer suggested questions; skip unknowns | 11 | None | NOT IMPLEMENTED |
| 11 | Review draft | ai_draft | Show AI inference, preserve full control | Accept draft; edit any field | 14, 12 | None | NOT IMPLEMENTED |
| 12 | Post a job | post_describe | Capture title, description, category | Save draft; continue | 13 | `screens/PostJobScreen.tsx` (merged, section 1 of 1 screen) | COMPLETE, merged into one screen rather than the atlas's segmented flow |
| 13 | Add media | post_media | Photos/video, privacy warning | Add/remove media; continue | 14 | `screens/PostJobScreen.tsx` (merged) | COMPLETE, merged |
| 14 | Location & timing | post_location_time | Service address, date, arrival window | Set location; choose schedule | 15 | `screens/PostJobScreen.tsx` (merged) | PARTIAL, merged — scheduling/arrival-window field presence UNKNOWN, not confirmed this pass |
| 15 | Budget & review | post_budget_review | Editable budget range, confirm post | Edit range; publish | 16 | `screens/PostJobScreen.tsx` (merged) | COMPLETE, merged |
| 16 | Job published | job_published | Confirm publication, explain ranking | View job; continue browsing | 27, 18 | No dedicated confirmation screen found — likely falls through to job detail directly | PARTIAL/UNKNOWN — not confirmed this pass |
| 17 | Explore services | explore_services | Browse by outcome/category/urgency | Search services; open category; view service | 20, 25 | None distinct — closest is `WorkerSearchScreen`'s category chips | NOT IMPLEMENTED as its own screen |
| 18 | Explore workers | explore_workers | Rank workers by fit and trust | Search/filter; open worker; switch to map | 22, 19, 21 | `screens/WorkerSearchScreen.tsx` (HomeStack) | COMPLETE — closest atlas match, semantic-ranked |
| 19 | Map discovery | map_discovery | Map as secondary discovery, persistent swipe card | Pan/search area; filter; open job | 20, 21, 39 | `screens/MapScreen.tsx` + `screens/CellJobsScreen.tsx` (MapStack) | PARTIAL — hotspot/cell abstraction, not the atlas's pannable-map-with-swipe-card pattern |
| 20 | Search results | search_results | Dense, readable, comparison-clear results | Sort/filter; open result; save result | 21, 25 | Merged into `WorkerSearchScreen.tsx` / `BrowseJobsScreen.tsx` result lists | PARTIAL, merged — no distinct comparison-dense layout confirmed |
| 21 | Filters | filters | Practical filters, explainable ranking | Set timing/distance/trust/budget; apply/reset | 20, 18 | Inline query/category chips only, no full filter screen found | NOT IMPLEMENTED as a distinct screen |
| 22 | Worker profile | worker_profile | Portfolio proof + measurable trust/pricing | Save worker; open portfolio; send offer | 23, 26 | `screens/WorkerProfileScreen.tsx` (every stack) | PARTIAL — render confirmed, some actions unverified at runtime |
| 23 | Portfolio | portfolio_gallery | Work-first gallery, preserves context | Filter portfolio; open project | 24 | `components/PastWork.tsx` (embedded in WorkerProfileScreen, not its own route) | PARTIAL — component exists, not a dedicated full-screen route |
| 24 | Project story | portfolio_project | One portfolio image → scope/time/price/review proof | Request similar work; save project | 26 | None dedicated | NOT IMPLEMENTED |
| 25 | Service detail | service_detail | Included work, pricing, availability | Choose date; request service | 26 | None dedicated — no services/pricing schema exists (see doc 05) | NOT IMPLEMENTED |
| 26 | Send an offer | send_offer | Private protected offer with clear terms | Set price/date/message; send offer | 29, 31 | `screens/PostJobScreen.tsx` (hireWorkerId path) → `sendOffer()`/`create_job_request` | COMPLETE — phase36 direct-offer path, `ConfirmDialog`-gated |
| 27 | Job & bids | job_bids | Job context + bid decisions, one screen | Compare bids; open worker; accept/counter/decline | 28, 29, 31 | `screens/ClientJobDetailScreen.tsx` (MyJobsStack) | COMPLETE |
| 28 | Compare bids | compare_bids | Compare value/trust, not auction feel | Select offer; open details | 29, 31 | Inline `BidWorkerCard` list within `ClientJobDetailScreen.tsx` | PARTIAL — inline, not a dedicated comparison screen |
| 29 | Bid detail | bid_detail | All terms, proof, actions before accept | Decline; counter; accept | 30, 31 | Inline within `ClientJobDetailScreen.tsx`/`BidWorkerCard` | PARTIAL — no dedicated bid-detail screen |
| 30 | Counteroffer | counteroffer | Negotiate one price/schedule, no auction pressure | Edit terms; send counter | 41, 29 | `components/AmountPrompt.tsx` modal, wired to `job_requests` counters (Hire Again path) | PARTIAL — open-job bid counteroffer mechanism vs. job_requests mechanism is an open schema question, see doc 05 |
| 31 | Protected checkout | protected_checkout | Explain authorization/fees/release before payment | Change payment; confirm funding | 32 | None | NOT IMPLEMENTED — no payment system at any layer |
| 32 | Job confirmed | job_confirmed | Confirm booking, next milestones, comms | Message worker; open job; add calendar | 41, 34 | No dedicated confirmation screen — falls through to job detail after `accept_bid` | PARTIAL/NOT IMPLEMENTED as its own screen |
| 33 | Track worker | track_worker | Live arrival only after confirmation | Message worker; share entry instructions | 41, 34 | None | NOT IMPLEMENTED — no live tracking anywhere |
| 34 | Active job | active_job | Shared job state, checklist, payment status | Message; report issue; view progress | 35, 41, 36 | `screens/WorkerJobScreen.tsx` / `screens/ClientJobDetailScreen.tsx` (in-progress state) | COMPLETE, merged into the existing detail screens — no separate checklist sub-view |
| 35 | Completion evidence | completion_evidence | Evidence + review state before release | Inspect media; report issue; approve | 36, 37 | `screens/ClientJobDetailScreen.tsx` (photo/video evidence display, phase35) | COMPLETE |
| 36 | Approve or report issue | approve_dispute | Explicit payment consequences, recoverability | Approve/release; open structured issue report | 37, 47 | Approve via `transition_job_status`; structured issue report path UNKNOWN — `reports` table exists but not confirmed wired to this exact flow | PARTIAL — approve works, dispute-reporting-from-here UNKNOWN |
| 37 | Review & tip | review_tip | Job-specific feedback + optional tip | Rate; write review; add tip | 38, 22 | `components/ReviewSection.tsx` — review complete; **tip not modeled anywhere** | PARTIAL — review COMPLETE, tip NOT IMPLEMENTED |
| 38 | My jobs | my_jobs | Organize by lifecycle, not flat list | Switch lifecycle tab; open job; message | 39, 41 | `screens/MyJobsHubScreen.tsx` (MyJobsStack) | COMPLETE |
| 39 | Job detail | job_detail | Scope, worker, payment, lifecycle, one page | Message; view worker; job actions | 41, 22, 34 | `screens/ClientJobDetailScreen.tsx` | COMPLETE |
| 40 | Messages | customer_messages | Separate jobs/offers/support, one inbox | Search/filter; open thread; mark read | 41 | `screens/MessagesInboxScreen.tsx` (shared, not customer-specific) | COMPLETE, shared implementation |
| 41 | (chat instance) "Afnan M." | customer_chat | Chat tied to live job, contextual actions | Send message/media; open job; quick replies | 34, 39 | `screens/ChatScreen.tsx` (shared) | COMPLETE, shared implementation |
| 42 | Notifications | notifications | Prioritize actionable lifecycle/payment updates | Open linked object; filter type; mark read | 35, 29, 31 | None — `screens/NotificationSettingsScreen.tsx` is preferences only, not a notification feed | NOT IMPLEMENTED as a screen (backend outbox exists) |
| 43 | Your profile | customer_profile | Identity/contact/tools, no worker-metric mixing | Edit identity; open payment/saved/settings; switch mode | 44, 45, 46, 47 | `screens/ProfileScreen.tsx` (shared, not customer-mode-specific) | PARTIAL, shared implementation |
| 44 | Edit profile | edit_profile | Shared identity flow, phone formatting, photo controls | Change/remove photo; edit identity; save | 43 | Inline within `screens/ProfileScreen.tsx`, no dedicated route | PARTIAL — functionality exists, not a distinct screen |
| 45 | Payment methods | payment_methods | Funding sources, default/security states | Add/remove/set default; open details | 31, 43 | None | NOT IMPLEMENTED |
| 46 | Saved workers | saved_workers | Relationship reuse vs. open-market posting | Rebook; remove save; open profile | 25, 22 | UNKNOWN — presence not confirmed this pass, grep needed before assuming absent | UNKNOWN |
| 47 | Settings & support | settings_support | Mode switch, privacy, help, safety, legal | Switch mode; manage privacy/notifications; support; log out | 48, 40 | Inline card within `screens/ProfileScreen.tsx` (no dedicated Settings screen, per `docs/CURRENT_IMPLEMENTATION_HANDOFF.md`'s own note) | PARTIAL — mode switch specifically cannot exist yet (no dual-mode nav) |

### Gaps & plan

| # | Reuse now | Missing UI | Missing workflow | Missing backend | Shared components needed | DB entities needed | External dep | Mockable now | Classification | Phase | Effort | Risk | Unknowns |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 7 | Whole screen, reskin | Emerald tokens | None | None | Design-system tokens | None | None | N/A | Visual reskin only | 3 | S | Low | None |
| 8 | `create_job_request` backend | Dedicated rebook/recent surface | None | None | Rebook card component | None | None | N/A | Existing feature requiring workflow changes | 3 | S | Low | None |
| 9 | JobDraft contract (via `createJob`) | Entire screen | AI intake UX | AIJobDraftProvider mock | New | None (reuses jobs schema) | LLM (Phase 8) | Yes — rule-based stub | Net-new, external-integration-required for real mode | 7 | M | Med | Provider/model choice |
| 10 | — | Entire screen | Clarify-question UX | Same provider | New | None | LLM (Phase 8) | Yes | Net-new / external-integration-required | 7 | M | Med | Question-generation approach |
| 11 | `createJob` shape as ground truth | Entire screen | Draft-review UX | None beyond provider | New | None | LLM (Phase 8) | Yes | Net-new / external-integration-required | 7 | S | Med | None |
| 12 | `PostJobScreen` logic | Segmented step UI (optional) | None | None | Step-progress component | None | None | N/A | Visual reskin only (or workflow change if segmenting) | 3 | S–M | Low | Whether segmenting is wanted |
| 13 | `PostJobScreen` media logic | Segmented step UI (optional) | None | None | Same | None | None | N/A | Visual reskin only | 3 | S | Low | Same |
| 14 | `PostJobScreen` location logic | Segmented step UI (optional); scheduling field if missing | Confirm scheduling field exists | Possibly a schedule column | Same | Possibly `jobs.scheduled_at`/window | None | N/A | Existing feature requiring workflow changes (pending schedule-field check) | 3 | S–M | Low | Scheduling field presence |
| 15 | `PostJobScreen` budget logic | Segmented step UI (optional) | None | None | Same | None | None | N/A | Visual reskin only | 3 | S | Low | None |
| 16 | `createJob` success path | Confirmation screen | Post-publish routing decision | None | New confirmation component | None | None | N/A | Net-new internal/free feature | 3 | XS | Low | Whether atlas wants a distinct screen or a toast |
| 17 | `WorkerSearchScreen` category chips | Full browse-by-category screen | None | None | Category grid component | None | None | N/A | Net-new internal/free feature | 5 | S | Low | None |
| 18 | `WorkerSearchScreen`, semantic matching | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 5 | S | Low | None |
| 19 | `job_hotspots`/`jobs_in_cell` | Pannable map + swipe card, if pursued | Confirm `react-native-maps` usage | None (schema already privacy-safe) | Live map component (if pursued) | None | Maps API key (verify if needed) | Partially — hotspot view is already the safe mock shape | Existing feature requiring workflow changes | 6 | M | Med | Whether live map replaces hotspot view |
| 20 | `WorkerSearchScreen`/`BrowseJobsScreen` results | Dense comparison layout | None | None | Comparison-row component | None | None | N/A | Visual reskin only | 5 | S | Low | None |
| 21 | Existing category/query params | Full filter screen | None | None | Filter-sheet component | None | None | N/A | Net-new internal/free feature | 5 | S | Low | None |
| 22 | `WorkerProfileScreen` | Emerald reskin | Confirm all actions wired | None confirmed missing | None | None | None | N/A | Visual reskin only (pending action re-check) | 5 | S | Low | Which actions are unverified |
| 23 | `PastWork.tsx` | Dedicated full-screen gallery route | None | None | Promote `PastWork` to a routed screen | None | None | N/A | Existing feature requiring workflow changes | 5 | S | Low | None |
| 24 | `portfolio_items` + `profile_reviews` data | Entire screen (likely a UI composition, no new table) | None | Confirm no new table needed | New composition component | None (see doc 05) | None | N/A | Net-new internal/free feature | 5 | S | Low | Confirm composition-only |
| 25 | None directly — needs services schema | Entire screen | Services/pricing concept | Services table | New | Services/pricing table | None | N/A | Net-new internal/free feature | 5 | M | Low | Schema design |
| 26 | `sendOffer`/`create_job_request`, `ConfirmDialog` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 3 | S | Low | None |
| 27 | `ClientJobDetailScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 4 | S | Low | None |
| 28 | `BidWorkerCard` list | Dedicated comparison screen | None | None | Comparison-table component | None | None | N/A | Existing feature requiring workflow changes | 4 | S | Low | None |
| 29 | `BidWorkerCard` | Dedicated bid-detail screen | None | None | Bid-detail component | None | None | N/A | Existing feature requiring workflow changes | 4 | S | Low | None |
| 30 | `AmountPrompt`, `job_requests` counters | Open-job counteroffer UI, if distinct mechanism chosen | Schema decision (doc 05) | Possibly new counter columns on `bids` | Counter-offer component | Possibly new, TBD | None | N/A | Existing feature requiring workflow changes | 4 | M | Med | Bid-counter vs. job_request-counter mechanism |
| 31 | `budget_cents` convention only | Entire screen | Payment authorization workflow | Full payment schema | Sandbox checkout component | Payment-intent/ledger tables | Payment processor | Yes — sandbox, labeled | External integration required | 4 (sandbox) / 8 (real) | L | High | Provider choice, fee model |
| 32 | `accept_bid` success path | Confirmation screen | None | None | New confirmation component | None | None | N/A | Net-new internal/free feature | 4 | XS | Low | None |
| 33 | `job_locations` (exact-location-privacy pattern to repeat) | Entire screen | Live tracking workflow | Tracking state table (repeat publication-exclusion pattern) | Simulated arrival component | New tracking table | Background location (Phase 8 for real) | Yes — simulated | Existing feature requiring workflow changes (simulated) / external integration (real) | 6 (sim) / 8 (real) | M | Med (privacy pattern must be repeated correctly) | None |
| 34 | `WorkerJobScreen`/`ClientJobDetailScreen` | Shared checklist sub-view, if pursued | Checklist schema decision | Checklist table, if pursued | Checklist component | Possibly new table | None | N/A | Existing feature requiring workflow changes | 4 | M | Low | Checklist schema |
| 35 | phase35 evidence display | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 4 | S | Low | None |
| 36 | `transition_job_status` (approve path) | Structured issue-report UI from this screen | Confirm/extend `reports` table wiring | Possibly extend `reports` or new `job_disputes` | Issue-report component | TBD, see doc 05 | None | N/A | Existing feature requiring workflow changes | 4 | M | Med | `reports` vs. new dispute table |
| 37 | `ReviewSection` (review half) | Tip UI | Tip data model | New `tips` concept (amount, job_id, payer) | Tip component | New tip table/column | Payment processor (tips move money) | Partially — UI mockable, real tip transfer needs Phase 8 | Existing feature requiring workflow changes (review) / external integration (tip) | 4 (review reskin) / 8 (real tip) | S (review) / M (tip) | Low (review) / High (tip, touches money) | Tip fee/payout handling |
| 38 | `MyJobsHubScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 4 | S | Low | None |
| 39 | `ClientJobDetailScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 4 | S | Low | None |
| 40 | `MessagesInboxScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 6 | S | Low | None |
| 41 | `ChatScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 6 | S | Low | None |
| 42 | `notification_outbox`/prefs schema | Entire in-app notification feed screen | None | None | Notification-list component | None (schema exists) | Push delivery confirmation | N/A | Net-new internal/free feature | 6 | M | Low | Push/EAS linkage status |
| 43 | `ProfileScreen` | Emerald reskin, mode-scoping | Mode-aware presentation | None | None | None | None | N/A | Visual reskin only (until mode split) | 5 | S | Low | None |
| 44 | Inline edit logic | Dedicated route, if pursued | None | None | None | None | None | N/A | Existing feature requiring workflow changes | 5 | S | Low | None |
| 45 | `budget_cents` convention only | Entire screen | Funding-source management | Payment-method table | New | Payment-method table | Payment processor | Yes — sandbox display of "no methods yet" | External integration required | 8 | M | Med | Provider choice |
| 46 | UNKNOWN | Entire screen, pending confirmation of absence | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | N/A | UNKNOWN — verify before classifying | 5 | UNKNOWN | Low | Whether this exists in any form today |
| 47 | Inline settings card | Dedicated Settings screen, mode-switch control | Mode-switch workflow (Phase 2/3 dependency) | `mode` field, if durable | Settings-screen shell | See doc 05 | None | N/A | Existing feature requiring workflow changes | 3 | M | Med | Depends entirely on Phase 2/3 mode decision |

---

## WORKER MODE (Screens 48–66)

### Identity & status

| # | Atlas title | Slug | Purpose | Primary actions | Transitions | Current route/file | Status |
|---|---|---|---|---|---|---|---|
| 48 | Find jobs | worker_home | Rank opportunities by fit/distance/schedule/payout/reliability | Go online/offline; switch list/map; open job | 49, 50, 51 | `screens/BrowseJobsScreen.tsx` (currently under Home tab, not its own worker home) | COMPLETE functionally, not yet its own tab |
| 49 | Jobs map | worker_map | Geographic discovery, without replacing the list | Search area; select pin; open job | 51, 50 | `screens/MapScreen.tsx` + `screens/CellJobsScreen.tsx` (shared with customer map) | PARTIAL, shared hotspot abstraction |
| 50 | Availability & filters | worker_filters | Availability + ranking inputs, non-permanent hiding | Go online/offline; set availability/skills/radius/pay; apply | 48, 49 | None — no availability schema (confirmed in doc 05) | NOT IMPLEMENTED |
| 51 | Job detail | worker_job_detail | Full scope, customer trust, net payout before bid | Save job; message if allowed; submit bid | 52, 63 | `screens/JobDetailScreen.tsx` (HomeStack, MyJobsStack, MapStack) | COMPLETE |
| 52 | Submit bid | submit_bid | Complete offer: price, timing, message, scope | Set terms; submit | 53 | Inline within `screens/JobDetailScreen.tsx` (`create_bid`) | COMPLETE, merged |
| 53 | Bid sent | bid_sent | Confirm bid, set expectations, no acceptance implication | View/edit before response; message; continue browsing | 61, 48 | No dedicated confirmation screen — likely inline state after submit | PARTIAL/NOT IMPLEMENTED as its own screen |
| 54 | My work | my_work | Organize commitments by stage, upcoming attention | Switch stage; open calendar/job; message client | 55, 61 | `screens/MyJobsHubScreen.tsx` (shared, not worker-mode-specific view) | PARTIAL, shared implementation |
| 55 | Accepted job | work_detail | Exact scope, client trust, payout, next step | Message client; open route; start job | 56, 62 | `screens/WorkerJobScreen.tsx` (MyJobsStack) | COMPLETE |
| 56 | Route & arrival | route_arrival | Exact location only after hire, honest arrival states | Start navigation; mark arrived; report delay | 57, 62 | None | NOT IMPLEMENTED |
| 57 | Work checklist | work_checklist | Shared, auditable progress state | Complete steps; add evidence; message; submit completion | 58, 62 | None (confirmed no checklist schema — doc 05) | NOT IMPLEMENTED |
| 58 | Completion upload | completion_upload | After-evidence + completion note + attestation | Upload evidence; write note; submit | 55, 59 | `screens/WorkerJobScreen.tsx` (phase35 photo+video evidence) | COMPLETE |
| 59 | Earnings | earnings_wallet | Available/pending/transferred money, unambiguous | Cash out; open payout/history; inspect job money state | 60, 55 | None | NOT IMPLEMENTED — no payment system |
| 60 | Payout details | payout_details | Fees + state transitions per job | Inspect calculation; change payout method | 59 | None | NOT IMPLEMENTED |
| 61 | Messages | worker_messages | Same contextual inbox, worker-specific jobs/offers | Search/filter; open thread | 62 | `screens/MessagesInboxScreen.tsx` (shared) | COMPLETE, shared implementation |
| 62 | (chat instance) "Mah R." | worker_chat | Chat tied to accepted job, address access, payment protection | Send text/media; open job; system context | 55, 56 | `screens/ChatScreen.tsx` (shared) | COMPLETE, shared implementation |
| 63 | Worker profile | public_worker_profile | Public identity as customers see it, edit entry point | Preview public profile; manage services/portfolio | 64, 65 | `screens/WorkerProfileScreen.tsx` (shared with Screen 22) | PARTIAL — same screen serves both; distinct "preview as public" entry not confirmed |
| 64 | Services & pricing | services_pricing | Service eligibility, starting price, travel area | Add/edit services; set pricing/radius; save | 63, 48 | None (confirmed no schema — doc 05) | NOT IMPLEMENTED |
| 65 | Portfolio manager | portfolio_manager | Curate real proof, privacy checks, draft states | Add/edit/reorder project; publish/unpublish | 63 | `components/PortfolioPicker.tsx` (within ProfileScreen) | COMPLETE |
| 66 | Availability & verification | availability_verification | Schedule controls + transparent trust status | Set weekly availability; review verification; save | 48, 63 | `components/VerificationBadge.tsx` displays status only; no availability schema | PARTIAL — verification is UI-only, availability NOT IMPLEMENTED |

### Gaps & plan

| # | Reuse now | Missing UI | Missing workflow | Missing backend | Shared components needed | DB entities needed | External dep | Mockable now | Classification | Phase | Effort | Risk | Unknowns |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 48 | `BrowseJobsScreen` | Own worker-mode tab entry | Mode-nav split (Phase 3) | None | Mode-aware tab bar | Mode field | None | N/A | Existing feature requiring workflow changes | 3 | S | Low | None |
| 49 | `MapScreen`/`CellJobsScreen` | Worker-specific framing (same UI, different tab) | Same mode-nav dependency | None | Same | Same | Maps API key (verify) | N/A | Existing feature requiring workflow changes | 3 | S | Low | Same as Screen 19 |
| 50 | None | Entire screen | Availability data model | Availability table, skill/radius/pay filter fields | New | Availability table | None | N/A | Net-new internal/free feature | 5 | M | Low | Schema design |
| 51 | `JobDetailScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 3 | S | Low | None |
| 52 | `create_bid` inline form | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 3 | S | Low | None |
| 53 | `create_bid` success path | Confirmation screen | None | None | New confirmation component | None | None | N/A | Net-new internal/free feature | 3 | XS | Low | None |
| 54 | `MyJobsHubScreen` | Worker-filtered view | Mode-nav split | None | Filtered hub variant | Mode field | None | N/A | Existing feature requiring workflow changes | 3 | S | Low | None |
| 55 | `WorkerJobScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 4 | S | Low | None |
| 56 | `job_locations` pattern to repeat | Entire screen | Live tracking / simulated arrival | Tracking table (repeat privacy-exclusion pattern) | Simulated arrival component (shared with Screen 33) | New tracking table | Background location (Phase 8) | Yes — simulated | Existing feature requiring workflow changes (sim) / external (real) | 6 (sim) / 8 (real) | M | Med | Same privacy pattern as Screen 33 |
| 57 | None | Entire screen | Checklist schema decision (shared with Screen 34) | Checklist table | Checklist component (shared with Screen 34) | Checklist table | None | N/A | Net-new internal/free feature | 4 | M | Low | Checklist schema |
| 58 | phase35 evidence upload | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 4 | S | Low | None |
| 59 | `budget_cents`/`final_amount_cents` convention only | Entire screen | Earnings/wallet workflow | Ledger/payout tables | New | Ledger table | Payment processor | Yes — sandbox "no earnings yet" state | External integration required | 8 | M | High | Provider choice |
| 60 | None | Entire screen | Payout detail workflow | Payout table | New | Payout table | Payment processor | Yes — sandbox | External integration required | 8 | S | High | Same |
| 61 | `MessagesInboxScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 6 | S | Low | None |
| 62 | `ChatScreen` | Emerald reskin | None | None | None | None | None | N/A | Visual reskin only | 6 | S | Low | None |
| 63 | `WorkerProfileScreen` | Public-preview entry point, if distinct from Screen 22 | Confirm whether one screen genuinely serves both | None | None | None | None | N/A | Visual reskin only (pending confirmation) | 5 | S | Low | Whether Screen 22/63 need to diverge at all |
| 64 | None | Entire screen | Services/pricing data model (shared with Screen 25) | Services table (shared with Screen 25) | New (shared with Screen 25) | Services table | None | N/A | Net-new internal/free feature | 5 | M | Low | Schema design |
| 65 | `PortfolioPicker` | Promote to own routed screen if atlas wants a distinct manager view vs. embedded editor | None | None | Route wrapper | None | None | N/A | Visual reskin only / existing feature | 5 | S | Low | None |
| 66 | `VerificationBadge` (display only) | Availability controls; verification review UI | Availability schema (shared with Screen 50); verification workflow | Availability table; verification provider (Phase 8) | Shared with Screen 50 | Availability table | Identity verification provider (Phase 8) | Availability: yes. Verification: only as "not verified" honest default | Net-new (availability) / external integration (real verification) | 5 (availability) / 8 (verification) | M | Low (availability) / Med (verification, trust-surface) | Verification provider choice |

---

## Crosswalk validation

- Total rows: **66**.
- Numbers present: **1 through 66**, confirmed by construction (three
  sequential ranges: 1–6, 7–47, 48–66, no gaps at the boundaries).
- No duplicate screen numbers.
- No duplicate slugs except the atlas's own intentional customer/worker
  pairs, all of which are genuinely distinct slugs in `screen_map.json`
  (`worker_profile` #22 vs `public_worker_profile` #63 — different slugs,
  confirmed not a collision).
- "Complete" is used only where a route, its actions, and its persistence
  behavior are backed by direct source evidence (RPC calls, table
  reads/writes) gathered in this pass or the immediately preceding
  marketplace-feature verification. Every other verdict is qualified
  (PARTIAL/NOT IMPLEMENTED/UNKNOWN) rather than guessed.
