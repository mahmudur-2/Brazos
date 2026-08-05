# 01 — Current App Inventory

Audit date: 2026-08-04. Branch `feature/setup-onboarding-v1`, HEAD `0b1f170`, tree clean.
Baseline for this document: direct repository inspection, cross-checked against
`project-audit/*.md` (2026-07-29, branch `master`, HEAD `065a420`),
`hardening-report/*.md` (2026-07-30), and `docs/CURRENT_IMPLEMENTATION_HANDOFF.md`
(Sessions 1–4, latest recorded HEAD `15d88e7` — this branch is newer and adds the
auth/onboarding redesign on top).

Status legend: **COMPLETE** (working, backend-wired) / **PARTIAL** / **UI-ONLY** /
**MOCKED** (explicit dev-only provider) / **BROKEN** / **DEAD/UNREACHABLE** /
**UNKNOWN — requires runtime verification**.

## 1. Navigation architecture (current)

Single navigation tree, **no customer/worker mode split exists yet**. `App.tsx`
renders one of four trees depending on state:

1. `AuthFlow` (signed out) — its own stack, `lib/navigation.ts` `AuthStackParamList`.
2. `OnboardingFlow` (signed in, `useSetupStatus()==='incomplete'`) — `Setup` → optionally `LegalGate`.
3. `LegalGateScreen` alone (signed in, setup complete, but `useLegalGate()==='needs_acceptance'` — an existing user whose accepted document version is stale).
4. `MainTabs` — 5 bottom tabs, each its own native stack: **Home / Map / My Jobs / Messages / Profile**.

This is flat — every signed-in user gets the same 5 tabs regardless of any
"Hire help" / "Find work" choice. The atlas's ten-route dual-mode navigation
(Customer: Home/Explore/Post/Inbox/Profile, Worker: Find Jobs/Map/My Work/Inbox/Profile)
does not exist. See [03_NAVIGATION_AND_ROUTE_PLAN.md](03_NAVIGATION_AND_ROUTE_PLAN.md).

## 2. Route inventory

| Route | File | Stack(s) | Status | Notes |
|---|---|---|---|---|
| Welcome | `screens/WelcomeScreen.tsx` | AuthStack | COMPLETE | Matches atlas Screen 02 closely (verified against `design-reference/02_welcome.png`) |
| SignIn | `screens/SignInScreen.tsx` | AuthStack | COMPLETE | Phone-first entry, routes to VerifyPhone |
| EmailSignIn | `screens/EmailSignInScreen.tsx` | AuthStack | COMPLETE | Real Supabase email/password auth |
| CreateAccount | `screens/CreateAccountScreen.tsx` | AuthStack | COMPLETE | Phone-first entry, routes to VerifyPhone |
| EmailCreateAccount | `screens/EmailCreateAccountScreen.tsx` | AuthStack | COMPLETE | Real Supabase email/password signup |
| VerifyPhone | `screens/VerifyPhoneScreen.tsx` | AuthStack | MOCKED (by design) | `lib/phoneAuth` provider adapter; mock mode passes the OTP UX, then hands off to email auth — no real session is created by phone alone yet |
| Setup | `screens/SetupScreen.tsx` | OnboardingStack | COMPLETE (device-local only) | Permissions + legal status + one-time landing choice; see §4 |
| LegalGate | `screens/LegalGateScreen.tsx` | OnboardingStack (pushed) + standalone | COMPLETE | Scroll-to-read gate, `legal_acceptances` table, fails open on read error |
| LaunchScreen | `screens/LaunchScreen.tsx` | Overlay, not a route | COMPLETE | Branded splash over hydration, not a screen in the nav tree |
| HomeMain | `screens/HomeScreen.tsx` | HomeStack | COMPLETE | |
| PostJob | `screens/PostJobScreen.tsx` | HomeStack, MyJobsStack, MessagesStack, MapStack | COMPLETE | Real writes via `create_job`/`update_job_details`/`create_job_request` RPCs |
| BrowseJobs | `screens/BrowseJobsScreen.tsx` | HomeStack | COMPLETE | |
| JobDetail (worker bid view) | `screens/JobDetailScreen.tsx` | HomeStack, MyJobsStack, MapStack | COMPLETE | Real `create_bid` RPC |
| WorkerSearch | `screens/WorkerSearchScreen.tsx` | HomeStack | COMPLETE | Semantic matching (phase39/40) with tested deterministic fallback |
| WorkerProfile | `screens/WorkerProfileScreen.tsx` | every stack | PARTIAL | Public profile render verified; some actions unverified at runtime |
| ProfileReviews | `screens/ProfileReviewsScreen.tsx` | every stack | COMPLETE | phase37 |
| MyJobsHub | `screens/MyJobsHubScreen.tsx` | MyJobsStack | COMPLETE | |
| ClientJobDetail | `screens/ClientJobDetailScreen.tsx` | MyJobsStack | COMPLETE | Real `accept_bid` RPC + compatibility fallback |
| WorkerJob | `screens/WorkerJobScreen.tsx` | MyJobsStack | COMPLETE | Real `transition_job_status` RPC + compatibility fallback, photo+video completion evidence |
| Chat | `screens/ChatScreen.tsx` | MyJobsStack, MessagesStack | COMPLETE | Text/photo/voice send, reactions, job-request negotiation inline |
| MessagesInbox | `screens/MessagesInboxScreen.tsx` | MessagesStack | COMPLETE | |
| MapMain | `screens/MapScreen.tsx` | MapStack | COMPLETE (hotspot discovery only) | No native geographic map component wired here — see §6 |
| CellJobs | `screens/CellJobsScreen.tsx` | MapStack | COMPLETE | |
| ProfileMain | `screens/ProfileScreen.tsx` | ProfileStack | PARTIAL | Own profile, portfolio, settings/admin/legal entry points |
| AdminReports | `screens/AdminReportsScreen.tsx` | ProfileStack | COMPLETE | Gated on `is_admin`; confirm gate is enforced server-side (RLS), not just hidden client-side |
| NotificationSettings | `screens/NotificationSettingsScreen.tsx` | ProfileStack | COMPLETE (preferences only) | Push *delivery* itself has open questions — see §7 |
| LegalDocument | `screens/LegalDocumentScreen.tsx` | ProfileStack | COMPLETE | Static terms/privacy viewer |

All screen file exports were confirmed to match `App.tsx`'s imports; no
dangling or misregistered route was found.

## 3. Shared component inventory

| Component | Purpose | Consumers |
|---|---|---|
| `Button.tsx`, `AuthButton.tsx` | Primary/secondary action buttons — two families, in-app vs auth-surface palette | app-wide / auth screens |
| `Card.tsx` | Generic bordered surface | app-wide |
| `TextField.tsx`, `AuthField.tsx` | Form inputs — two families, same split as buttons | app-wide / auth screens |
| `ScreenHeader.tsx` | Back button + title header | most stacked screens |
| `AuthScaffold.tsx`, `AuthBackdrop.tsx`, `AuthNotice.tsx` | Shared shell for the auth-surface screens (ivory/emerald palette, backdrop art, inline notices) | Welcome/SignIn/CreateAccount/VerifyPhone/Setup |
| `BrandLogo.tsx` | App mark, used on Launch and auth surfaces | LaunchScreen, AuthScaffold |
| `OtpInput.tsx` | 6-cell OTP entry | VerifyPhoneScreen |
| `PhoneNumberInput.tsx`, `CountryPicker.tsx` | E.164-normalized phone entry with country picker | SignIn/CreateAccount screens |
| `SetupChoiceCard.tsx`, `SetupRow.tsx` | Setup screen's mode-choice cards and permission/legal rows | SetupScreen |
| `Avatar.tsx`, `AvatarPressable.tsx` | User avatar display/tappable variant | app-wide |
| `StarRating.tsx`, `VerificationBadge.tsx`, `StatusBadge.tsx` | Trust/status indicators | profile, job, review surfaces |
| `Skeleton.tsx`, `FadeIn.tsx` | Loading placeholder + entrance animation | scattered, not universal |
| `ConfirmDialog.tsx`, `ActionSheet.tsx`, `AmountPrompt.tsx`, `ReportDialog.tsx` | Modal interaction primitives | destructive actions, counter-offers, moderation |
| `BrowseJobCard.tsx`, `HubCard.tsx`, `BidWorkerCard.tsx`, `JobOwnerActions.tsx`, `JobProgress.tsx` | Job/bid domain cards | browse, hub, client job detail |
| `JobVideo.tsx`, `PhotoViewer.tsx`, `PortfolioPicker.tsx`, `PastWork.tsx` | Media display/curation | job detail, profile, portfolio |
| `ChatBubble.tsx`, `ChatComposer.tsx`, `VoiceNote.tsx`, `QuickReplies.tsx`, `JobRequestCard.tsx`, `ReactionPicker.tsx` | Messaging surface | ChatScreen |
| `ReviewSection.tsx` | Review submission/display | ClientJobDetail, WorkerJob |
| `CategoryAccordion.tsx` | Worker skill-category multi-select | ProfileScreen |
| `HotspotMap.native.tsx` / `HotspotMap.web.tsx` / `MapPinIcon.tsx` | Platform-split hotspot map rendering | MapScreen — **`.web.tsx` is frozen per CLAUDE.md, do not touch without explicit request** |
| `SegmentedControl.tsx`, `Chip.tsx` | Generic small controls | scattered |
| `MarkdownText.tsx` | Renders legal document bodies | LegalGateScreen, LegalDocumentScreen |

No duplicate components performing the same job were found — the auth-surface
family (`AuthButton`/`AuthField`/`AuthScaffold`) and the in-app family
(`Button`/`TextField`) are a deliberate two-palette split, not accidental
duplication; this is exactly the seam the Emerald design system needs to
extend through rather than replace.

## 4. Auth / onboarding feature trace (this branch's new work)

This is the most recently active area and the direct predecessor to Screen 06.

| Piece | File(s) | Status |
|---|---|---|
| Phone-auth provider boundary | `lib/phoneAuth/{index,mode,mock,supabase,types,errors}.ts` | COMPLETE, adapter-shaped. `phoneAuth` is chosen once at module load from `EXPO_PUBLIC_PHONE_AUTH_MODE` (`mock` / `supabase` / disabled-fail-closed). Screens only ever call `phoneAuth.*` and check `getMode()==='mock'` to show the dev-code banner. |
| Mock OTP flow | `lib/phoneAuth/mock.ts`, `screens/VerifyPhoneScreen.tsx` | MOCKED, by design. Exercises the full OTP UX (request/resend/verify/attempt-limit/expiry) with an in-memory challenge and on-device generated code; explicitly labeled "MOCK MODE" and states real app access still requires email sign-in. No SMS provider is wired or activated. |
| Real authentication | `lib/AuthContext.tsx`, `EmailSignInScreen.tsx`, `EmailCreateAccountScreen.tsx` | COMPLETE — Supabase email/password is the only path that currently creates a real session |
| Legal acceptance gate | `hooks/useLegalGate.ts`, `lib/legal/*.ts`, `screens/LegalGateScreen.tsx` | COMPLETE, server-durable (`legal_acceptances` table, versioned). Fails open on read error (deliberate — see hook comment) |
| Final setup step | `hooks/useSetupStatus.ts`, `hooks/useSetupPermissions.ts`, `lib/setupState.ts`, `lib/setupStorage.ts`, `lib/setupLanding.ts`, `screens/SetupScreen.tsx` | COMPLETE for what it does, but **device-local only** — see below |
| Onboarding flow shell | `screens/OnboardingFlow.tsx`, `screens/AuthFlow.tsx`, `App.tsx::RootNavigator` | COMPLETE |

**Critical finding — mode/landing preference has no server-side representation.**
`lib/setupState.ts` documents this explicitly: `profiles` has no onboarding/mode
column, so `SetupRecord {completed, landing}` is written to
`AsyncStorage` only, keyed per-user (`brazos.setup.v1.<userId>`). Consequences,
confirmed from source:

- A user who reinstalls or signs in on a second device sees Setup again — expected and accepted per the code comment, not a bug.
- "Landing" (`hire` | `work`) is consumed exactly once by `lib/setupLanding.ts` to jump `MainTabs` to a specific screen (`BrowseJobs` for `work`) on the very next mount. It is **not** a persistent mode — there is no field anywhere that says "this session is in worker mode," and no navigation structure that would respond to one, because the dual-mode nav does not exist (§1).
- This is the central gap the Setup screen currently *cannot* close on its own: the atlas's Screen 06 asks the user to "choose the initial mode" for a nav that has two mode-specific tab sets; today's Setup asks the same UI question but the answer only steers a single one-time jump inside one shared tab set.

**Visual comparison against the atlas (spot-checked):** `design-reference/02_welcome.png`
and `design-reference/06_permissions_mode.png` were compared directly against
the running `WelcomeScreen.tsx`/`SetupScreen.tsx` structure and copy. Layout,
copy, and color language (forest-green primary button, mint accents, ivory
background) match closely. The current Setup screen additionally surfaces a
Terms & Privacy row the atlas mock doesn't show explicitly (product's own
addition, not a deviation) — worth reconciling as a deliberate choice, not
flagging as a gap. VISUAL DETAIL UNVERIFIED for screens 07–66; not spot-checked
in this pass beyond the architecture/journey-map pages, per the PDF text
extraction in `02_SCREEN_CROSSWALK.md`'s sourcing.

## 5. Feature modules — marketplace (verified this pass)

Full detail and file:line evidence: see the delta findings folded into
[02_SCREEN_CROSSWALK.md](02_SCREEN_CROSSWALK.md) and
[08_REGRESSION_AND_ACCEPTANCE_MATRIX.md](08_REGRESSION_AND_ACCEPTANCE_MATRIX.md).
Summary status, updated from `project-audit/03_FEATURE_INVENTORY.md`
(2026-07-29) to account for Sessions 3–4:

| Feature | 2026-07-29 status | Current status | What changed |
|---|---|---|---|
| Job posting | PARTIAL (submission unverified) | **COMPLETE** | Real RPC writes confirmed by source trace; `ConfirmDialog` gates on direct offers |
| Job browsing/bidding | PARTIAL | **COMPLETE** | Real `create_bid`/`accept_bid` RPCs confirmed, with `PGRST202` compatibility fallbacks for undeployed-RPC environments |
| Job lifecycle/completion | PARTIAL | **COMPLETE** | phase35 completion photo+video evidence; `transition_job_status` RPC confirmed |
| Reviews | PARTIAL | **COMPLETE** | phase37 profile reviews + review photos confirmed live and tested |
| Messaging | PARTIAL | **COMPLETE** | Text/photo/voice sends confirmed real; phase36 direct-offer threads remove the old completed-job gating bug |
| Worker discovery/search | not present in 07-29 audit | **COMPLETE** | phase39/40 semantic matching, 29-test regression suite, tested deterministic fallback |
| Maps (hotspot) | PARTIAL | **COMPLETE** for hotspot drill-down; **nearest-hotspot selection confirmed NOT started** | |
| Video thumbnails | not tracked | **NOT STARTED, confirmed** | No `expo-video-thumbnails` dependency; `JobVideo.tsx` deliberately uses a labeled poster tile instead |
| Admin/moderation | PARTIAL | **COMPLETE** | |
| Notification preferences | PARTIAL | **COMPLETE** (preferences only — delivery still open, see §7) | |
| Payments/escrow | NOT IMPLEMENTED | **NOT IMPLEMENTED, unchanged** | No dependency, schema, or code found in this pass |
| Identity verification | UI ONLY | **UI ONLY, unchanged** | `VerificationBadge` displays `verification_status`; no provider |

## 6. Tests

| File | Covers |
|---|---|
| `tests/authPhone.test.mjs` | Phone-auth provider boundary (mode resolution, mock provider behavior) |
| `tests/phoneOtp.test.mjs` | OTP flow details (37KB — the most extensive single test file) |
| `tests/legalGate.test.mjs` | Legal acceptance gate behavior |
| `tests/setupOnboarding.test.mjs` | Setup screen / setup state / landing preference (25KB) |
| `tests/hardening.test.mjs` | 13 named regression guards for phase29 hardening + phase34/36/37/39/40 (see [08](08_REGRESSION_AND_ACCEPTANCE_MATRIX.md)) |
| `tests/workerMatching.test.mjs` | 29 named tests for semantic worker search, including a guard that the deterministic fallback is unchanged |
| `tests/layout.test.mjs` | Small layout/safe-area guard |
| `tests/pwa.test.mjs` | **1 known pre-existing failure** — `config.js?v=20260731-1` vs shipped `-2`; both sides are frozen web/PWA surface, left alone deliberately per CLAUDE.md |

`npm run typecheck` and `npm run lint` (adds `--noUnusedLocals
--noUnusedParameters`) both pass clean. `npm test` — **172/173 pass**, the one
failure is the pre-existing pwa.test.mjs mismatch above. No `TODO`/`FIXME`/`XXX`
markers and no `*.bak`/`*_old`/`*_v1`/`*_deprecated` files exist anywhere in
`screens/`, `components/`, `lib/`, or `hooks/`.

## 7. Known open items (carried from prior audits, re-verified where noted)

- Push notification *delivery* (not preferences) — EAS project linkage status is UNKNOWN in this pass; `NotificationSettingsScreen` shows a diagnostic banner for it, which is itself evidence the gap is known and surfaced honestly rather than hidden.
- No payment/escrow system exists at any layer (schema, client, or provider) — confirmed unchanged from the 2026-07-29 audit.
- Identity verification is a UI badge only.
- Map screen renders a hotspot/cell abstraction, not a live pannable geographic map with worker/job pins — `react-native-maps` is a dependency but `MapScreen.tsx` does not appear to use it directly for the primary discovery view (uses `HotspotMap.native/web` instead); confirm actual usage before relying on this for Screen 19/49 (Map discovery) work.
- `supabase/phase29_security_hardening.sql` and later phases (30–40) are written but their live-deployment status against the connected Supabase project was **not re-verified this pass** (`scripts/verify-schema.mjs` was not run — it needs `.env` and network access; per this audit's read-only constraints it was not executed. `docs/CURRENT_IMPLEMENTATION_HANDOFF.md` records phase15–38 as previously verified deployed and phase39 as deployed-with-iteration; phase40 deployment status is UNKNOWN — requires runtime verification).

## 8. Reuse recommendation

**Preserve and reskin, do not rebuild**, for every item marked COMPLETE above.
The marketplace vertical (post → browse → bid → accept → complete → review →
message) is real, tested, and RPC-backed end to end. The auth/onboarding work
on this branch is a genuine head start on atlas Screens 01–06, not a
placeholder — it needs a visual pass toward the exact Emerald tokens and the
mode-persistence upgrade described in §4, not a rewrite.
