# Stage 4D — UI/UX Redesign Plan (v3)

Snapshot 2026-08-16. Supersedes v2. Adds: dual-theme system (Heritage light /
Emerald Prestige dark + Light/Dark/System setting), customer Home dynamic
states, final navigation decision. Read before dispatching any 4D batch.

## Navigation — FINAL
Customer: Home · My Jobs · [ + ] · Messages · Profile   (no Map tab)
Worker:   Home · Map · My Jobs · Messages · Profile

The center [ + ] is a rounded-square emerald button with a dark plus. It
opens a floating menu of exactly two CREATION actions:
  - Post a job
  - Hire someone again  (direct offer to a saved/past worker)
My Jobs stays a first-class TAB, not a menu item: per docs/architecture.md
the MyJobs stack hosts the whole hire loop (CompareBids, BidDetail,
Counteroffer, Checkout, JobConfirmed) and the active-work loop
(RouteArrival, WorkChecklist, TrackWorker, ApproveOrDispute, ReviewAndTip).
Burying its entry buries every surface where customer money lives.
"Explore" is NOT a tab: it is pushed from Home search and from
"Available Nearby -> View all".

## Customer Home — dynamic states (operator spec, adopted)
Always visible: hero/header, search, category chips, CTA card, Available
Nearby, bottom nav. Optional strips insert ABOVE the CTA card; the CTA card
keeps its size and shifts down.
  State 1 New customer      - no strips.
  State 2 Active job        - one Active Job strip.
  State 3 Hire again        - one Hire Again strip (requires >=1 completed
                              job with a worker, or a saved worker).
  State 4 Active + Hire     - both strips, Active Job first; equal width,
                              similar height.
  State 5 Quick actions     - [ + ] opens the floating creation menu.
All five states derive from data that already exists: lib/jobLifecycle.ts
for the active job, saved_workers + completed-job history for rebook.
Keep Emerald Trust graphics and CTA card style unchanged.

### Two corrections to the current Home content
1. "Available Nearby" in CUSTOMER mode must list nearby WORKERS (avatar,
   rating, jobs completed, "from $X"), not nearby jobs. Today it lists
   jobs, which is worker content, and tapping one lands a customer on a
   worker surface — the open "customer-safe market preview route" item in
   BRAZOS_MASTER_PLAN.md. Switching the content closes that gap
   structurally. Remove the customer "View map" chip.
   COLD-START FALLBACK (operator decision 2026-08-16) — three steps, and
   the section is never rendered empty:
     a. Workers inside the radius -> list them.
     b. None -> widen the radius and label it honestly
        ("Nearest to you · 12 mi").
     c. Still none -> the whole section becomes a post-a-job card stating
        the true mechanic: post it and nearby workers are notified
        (notify_nearby_for_job + notification_prefs.nearby_jobs /
        nearby_radius_miles / home_lat / home_lng already implement this).
        Optional single liveness LINE of text, never tappable cards:
        "14 jobs posted near you this month".
   NEVER fall back to job cards in customer mode: it is worker content, it
   re-opens the worker-surface leak, and at true cold start there are no
   jobs either. Real fix is ops — seed one tight geography + 3-5
   categories so step (a) has answers.
2. Search bar: KEEP the mic icon (operator decision — voice is planned
   later). Note for whoever builds it: iOS keyboards already provide
   system dictation into any text field, and there is no public API to
   trigger dictation programmatically, so the in-app icon can only focus
   the field until a speech-recognition dependency is added (needs
   operator approval per CLAUDE.md). REMOVE the AI-sparkle icon: it
   advertises AI job parsing, which CLAUDE.md places permanently out of
   scope. Both are locked-screen edits, operator-only.

## Theme system — Heritage (light) + Emerald Prestige (dark)
Setting in Profile: Appearance = Light / Dark / System. Default System.
`system` follows the phone; dark resolves to Emerald Prestige.

Architecture (no schema, no new dependency):
- ui/tokens.ts exports TWO palettes with IDENTICAL key names: `light`
  (Heritage cream/green/gold) and `dark` (Emerald Prestige: near-black
  emerald bg, dark-green cards, gold hairline borders, gold primary,
  sage success).
- A ThemeProvider resolves stored preference (AsyncStorage, same pattern as
  modes/modeStorage.ts — NOT SecureStore) against RN's Appearance API.
- hooks/useThemeColors.ts (already exists) becomes the reactive read; no
  screen imports ui/tokens.ts directly (existing CLAUDE.md rule).
- expo-status-bar style follows the resolved theme.

Four traps, each must be handled explicitly:
  T1. app.json `userInterfaceStyle` MUST be "automatic". If it is "light",
      iOS pins the app light and useColorScheme() always returns light —
      the whole feature fails silently. Operator check, one line.
  T2. react-native-maps needs a dark map style on the dark theme, or the
      worker Map renders as a white slab.
  T3. Brand raster assets (customer-home-chair, worker-home-toolbox,
      brazos-b-leaf, transition-*) are drawn for cream and will halo on
      dark. Dark variants are DESIGN work, not code — produce them before
      the dark theme ships.
  T4. Locked screens 01-07 and 48 cannot be themed inside a dispatch. Their
      theming happens in the operator's unlock session.

Cost gate — run before scoping:
  git grep -c -E "#[0-9a-fA-F]{3,8}" -- screens components ui navigation modes
  <40 total  -> dual palettes ride inside 4D-1's token pass.
  >150 total -> a token-migration run precedes everything else.

## 4D-1 — Trust, hierarchy, mode purity, tokens
1. Kill every "Not verified" / negative badge. Positive-only trust row
   (rating · jobs completed · responds-in) from existing profiles columns,
   non-null only.
2. One hero card on Job Detail (status + single next action); demote rest.
3. Unify the two progress renderings into one component fed by
   lib/jobLifecycle.ts. Five steps: Booked, On the way, Arrived, Working,
   Done. No new states.
4. Mode purity: MyJobsHub mode-aware — worker mode = accepted work + your
   bids only (no "You Posted", no "Post another job"); customer mode =
   posted jobs. Every card carries a derived NEXT-ACTION line as its
   primary label.
   TABS = Active / Review / Closed (operator decision 2026-08-16).
     Active  - open + taking bids, assigned, en_route, arrived,
               in_progress, draft. Worker side also: pending bids placed.
     Review  - work submitted and awaiting approval, plus disputed.
               Definition: work finished, money still HELD. Empties when
               funds release (manual approval or the 72h auto-release).
     Closed  - released / paid_out, cancelled, declined or expired bids.
   A completed-but-unrated job sits in Closed carrying a "Leave a review"
   next-action; the Review TAB never means star-ratings. If that reads
   ambiguous on device, rename the tab to "Approval" - same mapping.
5. Navigation restructure per FINAL above. `[verify]` read locked
   HomeScreen.tsx (read-only) for its exact navigate targets before
   registering the pushed Explore/Map routes; device-test every link.
   `[verify]` cross-mode notification deep links must prompt switchMode()
   (mandatory confirm) before routing — lib/notificationRoutes.ts, named
   acceptance test required.
6. New WorkerHomeScreen above locked BrowseJobs (which stays untouched as
   "View all"): greeting, potential-earnings (lib/earningsMath.ts),
   taking-new-work toggle (phase53 flag — availability, NOT live presence),
   match counts, top job cards.
7. Token layer: dual palettes as above; unified category tiles; three-tier
   buttons (filled/outline/text; sage = disabled ONLY).
8. Messages inbox state chips; chat job-state strip. KEEP the label
   "Deleted user" verbatim (operator decision) - but suppress the Hire
   button on deleted-user rows in Saved & past workers; it is a dead-end
   tap today.
9. NO new fee copy anywhere (operator decision 2026-08-16). The existing
   lines on Earnings and the bid screen stay exactly as they are; do not
   add, restate, or propagate fee messaging to other screens. Standing
   copy bans still hold: never "escrow" (say "held in protection"), never
   "always"/"forever" about fees.
10. `[verify]` report/block reachable from job, profile, message surfaces.

## 4D-2 — Worker discovery (worker tree only)
Map rebuild (clustered pins -> bottom-sheet cards -> detail); photo-first
job cards with distance + window; distance filter chips + persisted
filters; market job detail with scope above the fold; deterministic
match-reason checkmarks (category / distance / budget), no percentages.

## 4D-3 — Conversion + rebook
Post flow with static per-category price ranges, 20-char floor, photo
nudge; rebook strip data + prefilled direct offer via existing RPC;
instant-book on worker_services rows; bid composer availability + duration
chips; Compare Bids trust rows with rating-desc sort; worker profile
completeness meter; "Flat price / Ask me" toggle + same-day availability.

## 4D-4 — Emerald dark theme + voice search (ONE native build)
These two ship together because they need the SAME new EAS development
build and both touch app.json. Paying that cost once is the whole reason
they are batched.

Dark theme: appearance setting UI (Light / Dark / System), dark map style
(T2), dark brand asset variants (T3), status-bar audit, full-screen sweep
in both themes. Gated on the 4D-1 token pass and on T1
(`userInterfaceStyle: "automatic"`).

Voice search (operator approved the dependency 2026-08-16):
- Package `expo-speech-recognition@sdk-54` (jamsch) — matches Expo
  54.0.36. Wraps Apple's native recognizer: on-device, free, no cloud, no
  API key, so it does NOT introduce an AI/LLM dependency.
- Config plugin writes NSSpeechRecognitionUsageDescription and
  NSMicrophoneUsageDescription. Apple REJECTS apps whose purpose strings
  are vague — write specific ones.
- Requires a development build (no ios/ directory; Continuous Native
  Generation). Cannot be tested on the existing dev client.
- Set on-device recognition EXPLICITLY. Left default, audio may route to
  Apple's servers depending on locale — in which case the UI must not
  claim on-device processing.
- Wire it to the EXISTING mic icon in the locked Home search bar; degrade
  gracefully (icon hidden or inert with a one-line reason) when permission
  is denied or the locale is unsupported.
- REJECTED alternative: on-device Whisper via ExecuTorch — ~150MB model
  download on first use, and it IS an AI model dependency.

## Rejected — unchanged
AI router / AI job-brief extraction; hard offer caps; verification-gated
hireability; worker calendar and live online/offline presence; payout UI
before a provider; match percentages; Google sign-in (drags Sign in with
Apple + a new dependency).

## [locked] queue — ONE operator unlock session
Home (48): remove AI sparkle (mic STAYS — voice planned later); Active
Job strip; Hire Again strip;
Available Nearby switched to WORKERS; remove View-map chip; new bottom nav
with center [ + ]; theme tokens applied.
Welcome: swap "Verified workers" badge for "Protected payments" or "Real
reviews only"; flat B mark in-app (metallic B stays marketing-only).

## Roadmap (not 4D)
Change orders (provider-gated); tiered verification badges (provider-
gated); Stripe Connect as leading provider candidate.

## Launch/ops (operator's)
Wipe staging test data before screenshots; 3-5 categories, one tight
geography, manual high-touch matching; track time-to-first-match,
post->hire, accepted->completed, cancellation/no-show, dispute, repeat.
