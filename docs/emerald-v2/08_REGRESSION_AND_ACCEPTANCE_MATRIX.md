# 08 — Regression Protection and Acceptance Matrix

Baseline: `npm run typecheck` clean, `npm run lint` (strict, `--noUnusedLocals
--noUnusedParameters`) clean, `npm test` **172/173** (1 known pre-existing
`tests/pwa.test.mjs` failure on the frozen web/PWA surface, unrelated to any
work in this plan — see CLAUDE.md).

| Behavior | Existing evidence | Current status | Existing test coverage | Manual verification still needed | Phases likely to touch it | Required regression test before merge |
|---|---|---|---|---|---|---|
| Launch behavior / branded splash | `screens/LaunchScreen.tsx`, timing/reduced-motion logic read directly | COMPLETE | None found specifically for timing | On-device timing feel (simulated timers only in source review) | Phase 1 (tokens) if launch art changes | Add a smoke test asserting `onFinish` fires once session + floor timer both resolve |
| Session restoration | `lib/AuthContext.tsx`, `App.tsx::LaunchGate` | COMPLETE | Implicit via auth tests | Cold-start on a real device | Phase 2 (onboarding) | none new — don't touch `AuthContext` in onboarding work |
| Welcome screen buttons | `screens/WelcomeScreen.tsx` → SignIn/CreateAccount | COMPLETE, confirmed matches atlas visually | UNKNOWN — no dedicated test file found | — | Phase 1 if reskinned | Add a navigation-assertion test if not already covered |
| Email signup | `screens/EmailCreateAccountScreen.tsx` → `AuthContext.signUp` | COMPLETE | UNKNOWN — not confirmed in a dedicated test file this pass | Real signup against Supabase | Any auth-adjacent phase | Do not touch `AuthContext.signUp` signature without a test added first |
| Email login | `screens/EmailSignInScreen.tsx` | COMPLETE | UNKNOWN | Real login against Supabase | Any auth-adjacent phase | Same as above |
| Existing-account access (pre-mode-field users) | `hooks/useSetupStatus.ts` fails toward showing Setup only when there's no stored record | COMPLETE for today's shape | `tests/setupOnboarding.test.mjs` | Confirm a real existing account (created before this branch) doesn't get relocked into onboarding | Phase 2 | **New required test**: an account with a legal acceptance on file but no setup record completes Setup without re-prompting legal |
| Logout | `SetupScreen`/`LegalGateScreen`'s sign-out escape hatches | COMPLETE | UNKNOWN | — | — | — |
| Customer-side routes (today's single tab set) | `HomeStack`, `MyJobsStack` | COMPLETE, see [01](01_CURRENT_APP_INVENTORY.md) | `tests/hardening.test.mjs`, others | — | Phase 2/3 (mode split) | **New required test**: every route currently reachable from the 5-tab set remains reachable after the mode split, for at least one mode |
| Worker-side routes (today folded into the same tabs) | `WorkerJobScreen`, `WorkerSearchScreen` | COMPLETE | Same | — | Phase 3 | Same as above, other mode |
| Mode handling | Does not exist yet (§4 of [01](01_CURRENT_APP_INVENTORY.md)) | N/A — nothing to regress yet | N/A | — | Phase 2/3 | New test suite entirely, written alongside the mode field itself |
| Job posting | Real `create_job`/`update_job_details` RPCs confirmed | COMPLETE | Indirect (hardening tests cover the RPC boundary, not the screen) | — | Any phase touching PostJobScreen | Don't change `PostJobScreen`'s call shape without running `tests/hardening.test.mjs` |
| Job browsing | Real `fetchOpenJobs`, batched bid counts | COMPLETE | Indirect | — | Phase 3, 5 | — |
| Bidding | Real `create_bid`/`accept_bid` RPCs, with `PGRST202` compatibility fallback | COMPLETE | `tests/hardening.test.mjs` tests 3–4 explicitly guard the compatibility-fallback behavior | — | Phase 3, 4 | Keep tests 3–4 passing; do not remove the fallback path without confirming target Supabase project has phase30/31 deployed |
| Bid acceptance | Atomic `accept_bid` RPC | COMPLETE | `tests/hardening.test.mjs` | Live-deployment status of phase30 against the connected project — UNKNOWN, not re-verified this pass | Phase 4 | — |
| Messaging (text/photo/voice) | Real send paths at 4 call sites in `ChatScreen.tsx` | COMPLETE | Indirect | — | Phase 6 | — |
| Photo messages | `uploadAsset` + `chat-photos` bucket (private, party-scoped since phase29) | COMPLETE | `tests/hardening.test.mjs` test 5 (chat media privacy) | — | Phase 6 | Keep test 5 passing |
| Voice messages | `VoiceNote.tsx`, `useVoiceRecorder.ts` | COMPLETE per source; on-device recording/playback not re-verified this pass | Indirect | On-device audio recording | Phase 6 | — |
| Media upload (job photos/video, avatar, completion evidence, review photos) | Path-owned storage policies (phase29/34/35/37) | COMPLETE | `tests/hardening.test.mjs` tests 6, 9 | — | Any phase touching media pickers | Keep tests 6, 9 passing |
| Maps (hotspot discovery) | `job_hotspots`/`jobs_in_cell` RPCs, realtime-debounced | COMPLETE for hotspot abstraction; **not** a live pannable map (confirmed — see [01](01_CURRENT_APP_INVENTORY.md) §7) | Indirect | Confirm whether `react-native-maps` is used anywhere or is a dependency with no current call site — UNKNOWN, worth a quick grep before Phase 6 map work begins | Phase 6 | — |
| PWA/web access | Frozen surface per CLAUDE.md | 1 known pre-existing failure (`config.js` version string), explicitly left alone | `tests/pwa.test.mjs` | — | None — do not touch without explicit request | Do not "fix" the known failure as a drive-by; it is out of scope by repository policy |
| iOS behavior | Not exercised on-device this pass | UNKNOWN — requires runtime verification | None (no device test harness in repo) | Real device/simulator pass before any release | Every phase | — |
| Android behavior | Same | UNKNOWN | None | Same | Every phase | — |
| Supabase persistence / RLS posture | phase29 hardening + phases 30–40 | COMPLETE in SQL source; **live-deployment status against the connected project was not re-verified this pass** (`scripts/verify-schema.mjs` needs `.env` + network, not run under this audit's read-only constraint) | `supabase/tests/phase29_security_contract.sql` (STALE — asserts the old 4-arg `create_review` signature phase37 replaced; would need updating before re-running) | Run `node scripts/verify-schema.mjs` before relying on any phase ≥15 being live; phases 1–14 are **not checked by that script at all** | Any backend-touching phase | Regenerate `phase29_security_contract.sql`'s `create_review` assertion to the 5-arg signature before next use |
| Old account compatibility | `PGRST202` fallback paths (`acceptBidCompatibility.ts`, `jobStatusCompatibility.ts`) | COMPLETE, tested | `tests/hardening.test.mjs` tests 3–4 | — | — | — |
| Worker semantic search | phase39/40, Edge Function | COMPLETE, extensively tested (29 tests) including a guard that the deterministic fallback is byte-for-byte unchanged | `tests/workerMatching.test.mjs` | Real embedding quality on production data — explicitly flagged as unmeasured in `docs/CURRENT_IMPLEMENTATION_HANDOFF.md` | Phase 5 (discovery) if search UI is reskinned | Keep all 29 tests passing; do not touch `MIN_SIMILARITY` or the hybrid weights without re-running the mutation-verified assertions |
| Legal acceptance gate | `legal_acceptances`, fails open on error | COMPLETE | `tests/legalGate.test.mjs` | — | Phase 2 | — |
| Setup / permissions / landing preference | Device-local only (AsyncStorage) | COMPLETE for current scope, but landing preference has no server durability by design (see [01](01_CURRENT_APP_INVENTORY.md) §4) | `tests/setupOnboarding.test.mjs` | — | Phase 2 | If a durable `mode` field is added, write a new test proving a fresh install of an *existing* account defaults to a sane mode without replaying Setup or re-prompting legal |

## Per-phase acceptance gates (cross-reference)

Each phase in [07_PHASED_IMPLEMENTATION_PLAN.md](07_PHASED_IMPLEMENTATION_PLAN.md)
must, before being considered done:

1. `npm run verify` (lint + test) passes with no newly-introduced failures —
   the one pre-existing `pwa.test.mjs` failure is the only allowed exception.
2. Every row in this matrix whose "Phases likely to touch it" column includes
   that phase has been manually re-checked, not just left to CI.
3. No change to `public/`, `hosting/`, `dist/`, `WEB_DEPLOYMENT.md`, the
   service worker, PWA bootstrap, web deployment config, `*.web.tsx` files,
   or the web map implementation, unless the phase explicitly required it and
   the user confirmed that requirement in advance (CLAUDE.md's frozen
   surface).
4. No migration is applied to production Supabase directly — new SQL is
   written as the next `supabase/phaseNN_*.sql` file for the user to run.

## Device checks still outstanding (flagged, not performed)

Everything under "on-device" columns above is UNKNOWN by this audit's own
read-only constraint — no simulator/device run was performed. Treat every
COMPLETE verdict in this matrix as "complete by source and automated-test
evidence," not "confirmed working on a physical phone."
