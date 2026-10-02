# FIX RUN — the brief for "build" (written 2026-10-02; NOT started)

**Start here.** This brief changes nothing until the operator says "build". It comes from the
whole-app review of 2026-10-01 (79 screens walked dark and light, plus three code readers:
looks/words/accessibility, code/speed/motion, flows/bad days/App Store). The operator's answers
are in `docs/dispatch/LUX-LIST-3.md` §7, in their words.

- **Order (the operator's):** A money & safety → B App Store & bad days → E accessibility →
  F smooth, fast, built better. C (one language) and D (one look) wait on the operator's a–f picks.
- **✔ = confirmed in the code** on 2026-10-01/02, file and line read. Every other item comes from a
  review reader and is unconfirmed: its first step is one read of the cited code. Drop the item if
  the code doesn't show it.
- **Lean (operator, 2026-10-02):** "dont use 100 agents are you crazy..... (use the usages
  efficiently..)". One main session builds. At most ONE fresh-eyes review per batch. No fan-outs.
- **Nothing is deleted** (operator, 2026-10-01). Merges that would remove a screen are proposed, not
  done.

## The operator's rulings (their words, LUX-LIST-3 §7)

- "Continue with phone": "forward to the screen to show email + phone number just dont change it
  to continue with email (will add it later)".
- Deletions: "No show me all of the features that were planned but never built....".
- Order: "Money & safety first (Recommended)".
- This sitting: "Pictures first, build later"; picks: "Draw a–f, I pick later"; new Beta build for
  the permission wording: "Yes, start it".

## Picks waiting (no boards drawn yet; draw them lean, one at a time, when asked)

1. **Stage names.** One set of words for a job's states. Today there are four sets: Hired/On the
   way/Working/Done · Assigned/In progress/Completed · Confirmed/On my way/Arrived/Started/Finished ·
   Track Worker's five. → C1.
2. **One main button** (main, outline and danger buttons as one family). → D1.
3. **Capital letters.** Sentence case everywhere is recommended. → C5.
4. **The tab bar on deeper screens.** Hiding it is recommended (the iOS norm). → D2.
5. **What shows under the floating bar.** A soft fade is recommended. → D13.
6. **Money rule: a worker who never shows.** Recommended: a full refund including the protection
   fee, once the arrival window has passed, only if the worker never tapped Arrived. → A1.
7. **Legal facts.** Recommended: fix the facts now and keep the draft notice until a lawyer signs
   off. → B1.

## A — Money & safety

**A1 ✔ P0 — There is no way to cancel, drop a job, or report a no-show.**
- **What's there today:** `cancel_job(p_job_id, p_reason)`
  (`supabase/migrations/20260905000000_stripe_foundation.sql:1162`) has no caller in the client.
  Its reasons are `customer_cancelled`, `worker_cancelled` and `customer_no_show` (the WORKER's
  claim that the customer wasn't there; it moves no money). There is no reason for a CUSTOMER to
  report a WORKER no-show. Using `customer_cancelled` inside 24 h charges the no-show worker the
  late fee.
- **Customer — "Cancel job":** the confirm shows the fee from the frozen terms, in plain words:
  - free more than 24 h before the window, within 15 min of hiring, or when there's no date
  - otherwise the late fee (`cancellation_fee_cents`)
  - in progress always pays the fee
- **Worker — "Drop this job":** uses `worker_cancelled`; the customer is refunded in full.
- **Worker — "Customer wasn't there":** uses `customer_no_show`, a claim that moves no money.
- **Customer — "Worker didn't show?":** needs a NEW reason, `worker_no_show`, in a new migration
  (`create or replace cancel_job`, additive).
  - Gates: status `assigned`, `arrived_at` null, the arrival window has passed.
  - Pays a full refund including the protection fee.
  - Waits on pick 6.
- **Customer — open post with bids:** the owner can take it down (`customer_cancelled` on `open`).
- **Delete Account:** `screens/DeleteAccountScreen.tsx:194` must name an action that now exists.
- **Files:** a cancel wrapper in `lib/jobs.ts`, `hooks/useJobOwnerActions.ts`,
  `screens/ClientJobDetailScreen.tsx`, `screens/WorkerJobScreen.tsx`, the new migration,
  `supabase/tests/030_payments.sql` §8.
- **Pass:** pgTAP proves `worker_no_show` refunds in full only after the window with `arrived_at`
  null, and is refused otherwise. Each action shows only in its own states. `npm run verify` and
  `npm run db:test` are green.
- **Needs:** a migration, and pick 6.

**A2 ✔ P0 — Workers see "Customer paid $X" while the money is only held.**
- `screens/WorkerJobScreen.tsx:662-684` shows the "Customer paid" row when `status === 'held'`.
- **Fix:** "Customer's payment · held" until released, "Customer paid" only after. Use one fee name
  (see C4) instead of "Brazos Protection".
- **Pass:** no "paid" string can render before `released`; a source test fences it.

**A3 ✔ P0 — Opening the same job's chat twice crashes the app.**
- **Cause:** `hooks/useReactions.ts:35` names its channel `reactions:job:${jobId}`, with nothing
  unique per mount. `RealtimeClient.channel()` hands back the channel already joined under that
  name, and `.on('postgres_changes')` on a joined channel throws, so `AppErrorBoundary` resets the
  app.
- **How to hit it:** Messages → Chat → offer card → job → Message, or leaving and re-entering fast.
- **Fix:** add a per-mount suffix (`useId()` plus a counter). Check every `supabase.channel(` call.
- **Pass:** no channel name is shared between two mounts; a source test asserts the suffix.

**A4 ✔ P1 — A repeat visit's "Confirm" push charges with no in-app confirm.**
- `screens/ClientJobDetailScreen.tsx:260-267` opens Checkout with `oneTap`, and
  `screens/CheckoutScreen.tsx:429-440` pays at once with the saved card. The card check is skipped
  when no card id is passed.
- **Fix:** the arrival shows the Pay & protect confirm, naming the card and the amount. One-tap pay
  runs only with the card id that confirm named.
- **Pass:** no path reaches `fundBySavedCard` without an in-app confirm that named the card. This
  restores the build run's ruling (1): no charge ever happens out of sight.

**A5 ✔ P1 — Bid Detail's accept confirm has no fee and no total.**
- `screens/BidDetailScreen.tsx:375-390` doesn't follow the job screen
  (`ClientJobDetailScreen.tsx:1477-1495`).
- **Fix:** quote the price and show "Accept & pay $TOTAL" (pick C). Remove the "development build"
  sentence.
- **Pass:** both accept paths show the same three lines and the same button.

**A6 ✔ P1 — A released job reads "$86 · Released to worker", but $86 is the customer's charge.**
- `ClientJobDetailScreen.tsx:1212` passes `customerChargeCents` to MoneyText, so the shared caption
  sits under the customer's own charge.
- **Fix:** captions depend on who is viewing. The customer sees "Paid $86" with "Sam received $74";
  the worker sees "You received $74".
- Use one captions map; today it's in both `ui/primitives/MoneyText.tsx:24-34` and
  `StatusPill.tsx:141`.

**A7 P1 — The worker sees three different numbers for one job.**
- Cards say "EST. PAY $75" (the budget); Job Details says "EST. PAYOUT AFTER FEE $69.37";
  `MarketJobPreview` says "EST. PRICE"; My Jobs shows "$70" while the payment card shows "$64.75".
- **Fix:** label the budget "Budget $75" and show one "You get $X" figure after the fee everywhere.
  Closes BACKLOG's "$92.50 shown as $100".

**A8 ✔ P1 — "Start anyway" always fails.**
- `WorkerJobScreen.tsx:511-521` offers it before the payment is held, but the server refuses
  (`20260925000000_job_completions.sql:150-159`).
- **Fix:** remove it until held. Show "Waiting for the customer to protect the payment" and keep
  Message.

**A9 ✔ (partly) P1 — The payout queue can jam.**
- `process-settlements/index.ts:75` sets `QUEUE_LIMIT = 25`. Payees whose payouts aren't enabled
  are skipped but left at the head of the queue (`:283-288`).
- **Fix:** filter or page past blocked payees in the query, and report how many were blocked.
  Check the `transfers_due` order and the refunds pass the same way.
- **Pass:** a test with 30 blocked rows ahead of 1 payable row still pays that row.

**A10 P1 — A worker without payouts set up leaves things hanging.**
- The customer sees "payout on its way" forever, can't tip, and neither account can be deleted.
- **Fix:** customer copy that says what it's waiting for, plus a nudge to the worker at their first
  hire.
- A tip once the release is requested is a money rule: ask before building it.

**A11 P1 — A banned worker's job is cancelled but the money stays held and hidden.**
- `ban_user()` does it (`baseline.sql:632-640`; check the newest definition), and
  `ClientJobDetailScreen.tsx:393` skips the payment read on cancelled jobs.
- **Fix:** queue the refund inside the ban (a migration) and show the payment on cancelled jobs.

**A12 P1 — Disputes go nowhere.**
- `resolve_job_dispute()` is service-role only, and the customer is only told the money stays held
  (`ApproveOrDisputeScreen.tsx:302`).
- **Fix:** copy that says who decides and how fast (rule: ask), plus a resolution runbook for the
  operator. No admin UI in this run.

**A13 P1 — Unpaid hires get the evening-before reminder.**
- `20260930000900_tomorrow_reminders.sql:58` sends it regardless of payment.
- **Fix (migration):** the worker gets the reminder only when the payment is held; the customer gets
  "Protect the payment" instead.

**A14 P1 — One partly refunded job blocks account deletion forever.**
- `account_deletion_blockers()` (`baseline.sql:418`; check the newest) treats `partially_refunded`
  as unfinished.
- **Fix (migration):** count it as finished.

**A15 P2 — A declined saved card retries into the same cached decline.**
- The decline push arrives on top of the alert, and a retry within 24 h replays the cached decline
  (fixed key, `create-payment/index.ts:366-386`).
- **Fix:** rotate the key on a decline, and skip the push while the app is in front.

**A16 P2 — Bid Detail → Checkout flashes "Nothing to check out yet".**
- **Fix:** hand Checkout the job as it is after accepting (`BidDetailScreen.tsx:135`).

**A17 ✔ P2 — Money is formatted outside `formatBudget()`.**
- SQL `to_char(...,'FM999999990.00')` (`baseline.sql:3230,3319,3565`) shows "$135.00" in the feed.
  A second SQL formatter is in `20260930001000_job_series.sql:155-157`, and `'$0'` is hard-coded at
  `WorkerHomeScreen.tsx:692`.
- **Fix:** one SQL helper that matches `formatBudget` (a migration, `create or replace` only), and
  `formatBudget(0)`.

**A18 P2 — Account deletion keeps the Stripe customer, saved cards, the Connect account and exact
addresses.**
- **Fix:** with the §4.1 launch-gate item. The operator decides whether the Connect account is
  closed.

**A19 ✔ P2 — Card billing details in payment records are never pruned.**
- A comment promises a 90-day prune of `payment_events.payload`
  (`stripe_foundation.sql:334`), but nothing does it.
- **Fix:** add the prune (a scheduled job) or correct the comment.

**A20 P2 — The running-late day uses the phone's date while the server uses New York time.**
- **Fix:** use New York time in `lib/runningLate.ts:31-35`.

## B — App Store & bad days

**B1 P0 — Terms and Privacy are unreviewed drafts that contradict the app.**
- `lib/legal/termsOfService.ts:15-21,77` says "does not currently process payments".
  `privacyPolicy.ts` names only Supabase and Expo.
- **Fix (waits on pick 7):** state the payments through Stripe and the hold until approval; list
  Stripe, PostHog, Sentry, OpenStreetMap Nominatim and Resend; correct the contact line; bump the
  versions in `lib/legal/index.ts`.
- A hosted web address needs the domain (operator), and a lawyer signs off (operator).

**B2 ✔ P0 — Welcome's lead button dead-ends.**
- Phone auth resolves to disabled outside development (`lib/phoneAuth/mode.ts`).
- **Fix (the operator's ruling):** labels stay. "Continue with phone" opens the email + phone sign-up
  screen; "I already have an account" opens email sign-in; the "Use Phone Number Instead" buttons are
  hidden. All of this applies only while the phone-auth mode isn't `supabase`.
- **Pass:** with phone auth off, no button leads to "Sign-in by text message is not switched on
  yet".

**B3 P0 — Apple's user-content rules (1.2) aren't met.**
- Report and Block exist only in chat and the inbox.
- **Fix:**
  - Add Report + Block to job posts (JobDetail, MarketJobPreview), worker profiles, reviews and
    portfolio photos.
  - Add an "Inappropriate content" reason (`lib/moderation.ts:114-120`).
  - Add a basic word filter with no new library, enforced on the server for posts, bios, reviews and
    messages.
  - Point the inbox's "Support coming soon" pill (`lib/inboxFilters.ts:37,107`) to Contact support.

**B4 P0 — Apple's reviewer can't walk post → bid → pay.**
- **Fix:** write `docs/runbooks/app-review.md`: a demo customer and a demo worker, jobs in each
  state, the Review Notes text, and the production settings to choose (payments mode).
- Operator: apply it on production, plus migrations `20260930000600`–`001300`.

**B5 ✔ P1 — About 50 developer sentences on real screens.**
- "this build", "sandbox", "simulated", "ledger rows", "database row you can audit", "simple
  declarations", "FUNDING WINDOW CLOSED".
- **Fix:** rewrite them as product copy. A sandbox notice appears only in sandbox mode.

**B6 P1 — Offline locks people out.**
- An offline start shows a full-screen "Terms check didn't load" (`App.tsx:160-173`), and Sign out
  fails offline.
- **Fix:** an offline banner (NetInfo, already installed), a cached accepted legal version, and a
  local sign-out fallback.

**B7 P1 — Sign-up shows raw server text.**
- `EmailCreateAccountScreen.tsx:100,108-111` and `EmailSignInScreen.tsx:130`.
- **Fix:** map the errors to plain sentences, and drop "If email confirmation is enabled".

**B8 P1 — A push opened from a closed app can land in the wrong mode.**
- **Fix:** wait until the mode resolves, then apply the switch prompt
  (`hooks/useNotificationModeBridge.ts:27`, `lib/notificationRoutes.ts:279-285`).

**B9 P1 — Live location sharing isn't disclosed.**
- **Fix:** add it to the location permission text (`app.config.ts:161-162`; **native build**) and
  to the privacy text.

**B10 P1 — "Share profile" links to brazos.app, which marks itself a placeholder.**
- **Fix:** hide the action until the domain serves the page (`lib/appLinks.ts:9-23`).

**B11 P2 — Permission denials are dead ends.**
- **Fix:** "Open Settings" for camera, microphone/speech and location; plain location errors.

**B12 P2 — Permission texts promise video that nothing records.**
- **Fix (native build):** remove the video claims.

**B13 P2 — The Time Sensitive and Apple Pay entitlements are declared but unused.**
- The operator decides whether to remove them (native build).

**B14 P2 — Job screens go stale while open.**
- TrackWorker and ClientJobDetail don't update live, and a push for a deleted job lands silently on
  My Jobs.
- **Fix:** refresh live, and say "This job is no longer available".

**B15 P2 — One phone-auth setting crashes the app at launch.**
- **Fix:** `config/env.ts:84` must accept `disabled`.

**B16 P2 — Smaller session gaps.**
- Setup state is stored only on the device; the card sheet has no `returnURL` for 3-D Secure; the
  ban check runs only when the signed-in user changes; messaging a deleted account gives no notice.
- Phone numbers are never verified. That needs an SMS service (operator).

## C — One language (waits on picks 1 and 3)

- **C1 ✔ — One set of stage words.** One shared map in `lib/jobStage.ts` / `lib/jobLifecycle.ts`;
  pills, steppers and Track all read it.
- **C2 — "bid" everywhere** (`lib/offerCopy.ts:33-35` returns "offer" for workers). First check
  ruling H ("Filters and the bid wording stay").
- **C3 — customer (not client), job (not task).**
- **C4 — One money glossary.** One fee name, one held label, one copy table by state × viewer.
- **C5 — One capital-letter rule.**
- **C6 ✔ — Broken or robotic lines:**
  - the address hint
  - "Approval needed releases in 66h"
  - "66h left" → a real day and time
  - "Mark en route"
  - the feed's "Review and approve Mount …"
  - "Stay in Customer"
  - "Smart Match" vs "Best Match"
  - "SHARED IDENTITY"
  - "Off won't block offers."
- **C7 ✔ — The phone placeholder.** "347 320 0610" (`components/PhoneNumberInput.tsx:188`) is the
  test profile's number → a fictional 555-01xx number.
- **C8 ✔ — Sentences repeated on one screen.** "Funds held in protection" ×4, the photo limit ×2,
  "photo required" ×2.

## D — One look (waits on picks 2, 4 and 5)

- **D1 — One Button primitive** in `ui/primitives`. Today there are eight designs (Button,
  AuthButton, PostJobBar, the Home hero, FormScreen, Setup, the Filters sheet, Delete).
- **D2 ✔ — The tab bar on deep screens.** PostJob sits in the Home and Discover stacks
  (`navigation/CustomerRoot.tsx:113,140`), and nothing hides the bar.
- **D3 ✔ — No back buttons on tab roots** (Discover, My Jobs, Available Jobs).
- **D4 ✔ — One Popular services tile and one name per category.**
- **D5 ✔ — Worker job cards give the title the room** (`components/WorkerJobCard.tsx`).
- **D6 ✔ — One switch whose off state you can see in dark.**
- **D7 — One section-label style.**
- **D8 — Merge the two size scales** (`lib/theme` vs `ui/tokens.ts:506-546,632-639`).
- **D9 — Dark mode drops the light auth styling** (`AuthNotice.tsx:31,47,50`; the unthemed
  AuthButtons in Setup and VerifyPhone).
- **D10 — One page background per theme.**
- **D11 ✔ — The glitches seen in the screenshots:**
  - the see-through budget dropdown
  - clipped inbox pills
  - the Report dialog without a dim
  - two different ways to close a sheet
  - the lone star with no number
  - "Delete my account" reading as disabled
  - "Before & after" with only an after photo
  - the worker's name shown twice
  - "Job Detail" vs "Job Details"
  - two screens titled "Profile"
- **D12 — Adopt the unused primitives** (ListRow, JobCard, Divider, MediaGrid, StepHeader,
  Sheet/SheetHeader). Nothing is deleted.
- **D13 ✔ — What shows under the floating bar** (pick 5).

## E — Accessibility

- **E1 — Light-mode contrast.** Grey #6B7566 on cream is 4.26:1; #9AA38F is about 2.4:1; inactive
  tab labels 3.24:1; gold text on cream 2.41:1. Fix it in the tokens.
- **E2 — Dark-mode contrast.** #7F918A on chips is 3.93:1; the red Sign out is 3.75:1; captions at
  45% ink.
- **E3 — About 33 controls are under 44 pt.** Inbox and Filters pills, Today, Hire, Book, See all,
  Arrival details, Hide the questions.
- **E4 — VoiceOver.** Name the 9 unnamed icon controls, give selection rows a role and state, add
  `accessibilityRole="header"`, and announce errors on iOS (`announceForAccessibility`).
- **E5 — Dynamic Type.** `minHeight` instead of fixed heights (AuthButton, Filters pills,
  ConversationRow), and drop `maxFontSizeMultiplier={1}`.
- **E6 — Reduce Motion is ignored** by Skeleton, PeekSheet, PhotoViewer, AuthScaffold,
  SwipeableRow and the press animations. Gate them on `useReducedMotion()`.
- **E7 — Shared loading/error states.** `ScreenStateView` is used on only 17 of 55 screens. Use one
  set of retry and error words.

## F — Smooth, fast, built better

- **F1 — Cold start.** The legal and mode reads run one after the other while the launch layer
  hides. Keep it up, run the reads in parallel, and use the cached mode.
- **F2 — Load the dev-only design studio lazily** (ModeShell imports it at boot). Nothing deleted.
- **F3–F5 — Chat:**
  - keep the draft in the composer
  - memoise the rows
  - one scroll path (an inverted list)
  - load 50 messages at a time
  - batch the signed URLs and give expo-image a stable `cacheKey`
- **F6 — One rule set.** `isLiveJob()`, `nextWorkerStep()`, and `isHeld` / `isReleased` everywhere
  (P3-31).
- **F7 ✔ — A typed client.** `types/database.ts` exists but isn't used (`lib/supabase.ts` is
  untyped). Do it last, as its own milestone.
- **F8 / F9 — Keyboard.** Fix the Discover jump. Use keyboard-controller (installed) instead of the
  13 KeyboardAvoidingViews, and make pinned bars ride the keyboard.
- **F10 / F11 — Photo viewer and the media menu.** The photo viewer gestures move to the 120 Hz path;
  the Post-a-job media menu becomes a PopModal.
- **F12 — Motion on the most-pressed controls.** Button spring, chip crossfade, list entrances.
- **F13 — Caching.** React Query is installed: one feed store, a count query for the bell, a
  `staleTime` on the focus refetches.
- **F14 — Split PostJob and Chat** into parts. Move the source-text tests with them; 121 of the 124
  test files read source.
- **F15 — Smart Match never loads the worker's past jobs.** Refresh `useMyJobsHub`.
- **F16–F19 — Small fixes:**
  - pause endless loops off-screen
  - transform instead of width/height animations
  - the shellGround re-render
  - one date formatter
- **F20 — Duplicate screens and menus** (Route & Arrival vs Your Job, the two person menus, three
  Edit Profile doors). Propose merges only.
- **F21 — Right-size the launch images** (a 1.2 MB and a 1.9 MB PNG at logo size).
- **F22 — Stale docs.**
  - CLAUDE.md says "no animation libraries" and "NO generated Supabase database types"; both are
    stale, and the file is operator-owned text, so list the exact edits.
  - `lib/motion120/vendor.ts:35`, MOTION-INVENTORY and SCOPE (voiceSearch) are also stale.
- **F23 — Housekeeping, with the operator's OK only.** Unused libraries (use React Query, NetInfo
  and FlashList instead of removing them), dead files, about 13.6 MB of unused images, stale root
  docs.
- **F24 — Open BACKLOG bugs.** The ProfileReviews title name, "2 completed" vs "2 reviews",
  ReviewSection's dead prop, the orphaned navBar tokens.

## How each batch runs (lean)

1. Confirm each unmarked item with one read; drop the ones the code doesn't show.
2. Build in the main session. A batch's milestones are commits by explicit path. Money items each
   get their own commit and revert boundary.
3. Verify:
   - `npm run verify` green
   - for any migration: `npm run db:reset` then `npm run db:test` green, local only
   - changed screens re-shot dark and light, and looked at
4. One fresh-eyes review of the batch diff, its findings fixed.
5. Ship:
   - `git push origin mainexpo` (only after verify exits 0)
   - staging green
   - `npm run update:preview -- --message "…" --non-interactive`
   - one push to the operator
6. The new Beta build comes last, only for the native items (B9, B12, B13).

## Stops (CLAUDE.md "Agent autonomy")

Stop for any of these:
- a new dependency
- a destructive migration
- any remote database
- production
- `.env`
- the frozen web surface
- weakening a fence
- device-only checks
- a hook collision

## Only the operator

- Legal review (B1).
- The domain and a support inbox.
- An SMS service, for phone sign-in and verified numbers.
- The production payment mode, demo accounts and seeded jobs for Apple (B4).
- Copying migrations `20260930000600`–`001300` and this run's migrations to production.
- Installing the lock-screen add-on before the new Beta build, if the card is wanted in it.
- The receipt email key.
- Checking whether photo storage is public on staging and production (BACKLOG says yes).

## Not yet checked

A bug hunt over these 20 areas was started on 2026-10-02 and stopped at once (operator: use usage
efficiently). Nothing came back.
- Post a job; bids and counters; accept and pay; the worker's stages; approve, dispute and release.
- Reviews and tips; repeat jobs; notifications.
- Chat and inbox; sign-up and modes; discovery and the map; profile and settings.
- Edge functions; security in the newest migrations; data integrity; performance and leaks.
- Bad days screen by screen; navigation.
- App Store config, including the iOS privacy manifest for required-reason APIs.
- Client state and caching (the post draft keeps the private address in plain device storage).

Check them lean, one area at a time, only when the operator asks.
