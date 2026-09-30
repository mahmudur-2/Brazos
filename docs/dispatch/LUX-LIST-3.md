# LUX-LIST-3 — the design loop's third list (brief, in progress)

Written 2026-09-29 by the design-loop session (planner: Fable), following `DESIGN-LOOP.md`.
Same shape as `LUX-LIST-64.md`. NOTHING is built. Nothing is confirmed until the operator taps it;
every answer is recorded here the moment it is given, with the operator's numbers and words exactly.

## 1. Boundaries and how to run

- Build ONLY in the practice copy `.shots/refresh/practice`, and only after the operator says "go".
  The After reaches the repo as `docs/mockups/refresh/after.patch`, applied only on "build it".
- The verified statuses in §3 come from the code at HEAD `c71a5e1` (the app = the After of `c508b09`),
  read by grep on 2026-09-29 — never from memory.
- Boards are one Artifact page per batch under `.shots/refresh/boards/` (gitignored); the PNGs are the
  After export's shots, which ARE the current app.
- Questions are tap-to-answer popups only, at most three per popup; the reply text is six lines.

## 2. References (paths)

| For | File |
|-|-|
| Board 1 (A, B, C — the money moments) | `.shots/refresh/boards/board-1.html` — published https://claude.ai/artifact/6LhcHquAZjWMVkaKwefyct |
| The ideas board (17 numbered ideas, not on the list until picked) | `.shots/refresh/boards/ideas.html` — published https://claude.ai/artifact/JH7z7vvYqxcmdfCheJTTA9 |
| The Now shots | `.shots/refresh/shots/after-{dark,light}-<id>.png` (+ `.txt` element maps, 1x CSS px) |
| The audit entries (`flaw`, `fix`, `afterSpec`) | `.shots/ux-audit/synthesis.json` |
| The phone frame the boards copy | `docs/mockups/html/refs/inbox-clean-list.html` |
| The colour sampler for overlays | `.shots/refresh/boards/sample.mjs` (pngjs) |

## 3. The candidates, verified against the code (2026-09-29)

| # | Change (plain meaning) | Verified status | Evidence | Board |
|-|-|-|-|-|
| A | One decision, one pinned button | DONE | M-1/M-4 `screens/ClientJobDetailScreen.tsx:404` (`primaryAction`, derived from the lifecycle rule); M-2 `JobDetailScreen.tsx`; M-3 `WorkerJobScreen.tsx`, `RouteArrivalScreen.tsx`. The Now shots show the bar on `job-open`, `job-bids` (Compare 2 bids), `bid-detail` (Accept bid ($120)), `job-assigned-pay` (Track worker), `w-detail` (I'll do it for $75 / Write a bid), `w-submit` (Send bid), `w-job`/`w-job-end` (Mark complete). `approve` in the sample world shows "Payments are paused" and no bar. | 1 |
| B | Payout honesty | DONE, stripe mode only | `components/PayoutNudge.tsx`; Worker Home's first Needs-you row `screens/WorkerHomeScreen.tsx:470-489` ("Set up payouts to receive $X" / "Approved — waiting on your payout setup"); `lib/earningsCopy.ts:68`; `lib/payments.ts:365-373`. The sandbox harness never renders it, so Board 1 draws the row over `w-home`. OPEN for Board 2: the feed/push line "$55.50 for … is on its way to your payouts" (`after-dark-feed`) is written by the database at release time and cannot know the payout setup. | 1 |
| C | Money before the irreversible tap | DONE except the button | `components/OfferCard.tsx:233` "You'd pay $X all-in" (live in the shots: $135 → $145.13); the accept dialog's message carries "Agreed price · Protection fee · Total charged" when a quote exists (`ClientJobDetailScreen.tsx:1384-1387`, stripe mode); the confirm button stays "Accept bid" (`lib/offerCopy.ts:69`) — the audit's "Accept & pay $TOTAL" was not built; `job-assigned-pay` shows the held box ($118.25 charged · $110 agreed · held until you approve). Fee is 7.5%: $120 → $9 → $129. | 1 |
| D | Honest labels | PART | "New worker": `WorkerProfileScreen.tsx:320`, `CompareBidsScreen.tsx:295` (never from an unknown count, `lib/workerHeroCard.ts`, `lib/compareBids.ts:185`). "No reviews yet": BidDetail, ProfileReviews, Profile, SavedWorkers, OfferCard. "paid" in the shots only as "Get paid." (Worker Home) and "Then they're paid" (post-live explainer). Checked: the customer-side "Work approved — payout on its way" (`ClientJobDetailScreen.tsx:1311`) renders only while the release is requested and the transfer has not landed (D23: "never released until the transfer lands"), which is the true state. The feed line "is on its way to your payouts" is HARNESS FIXTURE TEXT (`docs/mockups/refresh/mock.js`), not app copy — the app's own payment_released body is written by the database trigger and was not read here. So D is live as far as the screens show; shown on Board 2 as "Already live". M-13 "TAKING NEW WORK" relabel live (`WorkerHomeScreen.tsx:608`); M-27 live (`WorkerJobScreen.tsx:443`, hired is not paid). | 2 |
| E | Every feature has a visible door | DONE | M-10 `MessagesInboxScreen.tsx`, `ChatScreen.tsx`; M-11 `MessagesInboxScreen.tsx`; M-22 `ProfileScreen.tsx`; M-29 `lib/profileCompleteness.ts`, `WorkerHomeScreen.tsx`, `WorkerResultsScreen.tsx`. | 2 |
| F | Fewer steps, simpler (sign-up) | NEW | Now: Create account → Setup with "Finish setup" disabled (`SetupScreen.tsx:258-269`, helper "Review Terms & Privacy to finish setup.") → the Terms & Privacy row → Legal gate, one changing button (`LegalGateScreen.tsx:172-177`, #10), both documents read to the end → back to Setup → Finish setup → Home. `App.tsx:171-176` renders the gate on its own only for re-acceptance. Audit M-19 fix: land on the gate first, one continuous reader, then Start in + Finish. | 3 |
| G | One set of filters | DONE | M-25 `components/DistanceChips.tsx`, `JobFilterSheet.tsx`, `hooks/useSessionJobFilters.ts`, `lib/jobFilterSession.ts`, `MapScreen.tsx`, `WorkerResultsScreen.tsx`. | 3 |
| H | One vocabulary (bid = offer) | DONE | M-17 `components/OfferResponseActions.tsx`, `lib/offerCopy.ts`, `ClientJobDetailScreen.tsx`. | 3 |
| I | Sign-up without a phone number | DROPPED by the audit, not merely declined | `synthesis.json` M-30 `whyDropped`: the phone at sign-up is the only ban-by-phone enforcement (`handle_new_user` reads it from sign-up metadata; nothing checks later profile writes); staging it to first hire would silently disable that, and it would rewrite two fences' logic. Shown on Board 3 with this caveat; the operator decides. | 3 |
| J | Questions before bidding | DONE | M-37 `components/OfferComposer.tsx`. | 2 |

Board plan: Board 1 = A, B, C. Board 2 = D, J, E. Board 3 = F, I (flows with tap counters), G, H.

F, the Now count, read from the code (2026-09-29): after Create account the user lands on Setup with
"Finish setup" disabled (`SetupScreen.tsx:263-269`; "Start in" is pre-selected, `:68`
`useState(DEFAULT_LANDING)`), taps (1) the Terms & Privacy row, on the gate scrolls Terms to the end
and taps (2) "Review Privacy Policy" (`LegalGateScreen.tsx:347`, the one changing button), scrolls
Privacy to the end, ticks (3) the "I have read and agree" box (`:315-323`, `canCheck = bothSeen`),
taps (4) "Agree and continue", is popped to Setup and taps (5) "Finish setup". Five taps, two long
scrolls, Setup seen twice. Board 3's Proposed: the gate first, both documents in ONE reader (one
scroll; the scroll-position detection and both "seen" flags stay as written), the button is the
consent once both are read (no separate tick box), then Setup once with Start in pre-picked: two
taps, one scroll. The tick-box-kept variant is three taps.

## 4. Confirmed items (the operator's exact words and numbers)

Popup 1 (Board 1, 2026-09-29):

- **A — KEEP.** Tapped "Keep (Recommended)". The pinned bar stays as built on every deciding screen
  (M-1/M-4 `ClientJobDetailScreen.tsx:404`, M-2, M-3). No change.
- **B — KEEP.** Tapped "Keep (Recommended)". The Needs-you row "Set up payouts to receive $X" /
  "Approved — waiting on your payout setup" and the Earnings copy stay as built. No change.
- **C — CHANGE: the total goes on the button.** Tapped "Put the total on the button (Recommended)".
  To build: when the accept dialog has a quote (`acceptQuote`, stripe mode), its confirm button reads
  `Accept & pay $129` — the amount is `formatBudget(acceptQuote.total_cents)`, never client
  arithmetic; without a quote (sandbox, or still loading) it stays `Accept bid`. The message keeps its
  "Agreed price · Protection fee · Total charged" line. Note for the build: `lib/offerCopy.ts:69`
  `acceptOfferConfirmText()` and the #64 (M-17) rule "the confirmation repeats the button's verb and
  noun" — extend the helper with an optional total rather than writing a second copy, and update the
  fence's expected string, never its logic.

Popup 2 (Board 2, 2026-09-29):

- **D — KEEP.** Tapped "Keep (Recommended)". "New worker", "No reviews yet", "Funds held in
  protection" and the D23 approval copy stay as built. No change.
- **J — KEEP.** Tapped "Keep (Recommended)". The messaging lock stays; the two explaining lines
  (`components/OfferComposer.tsx:398`, the job screen's line under its bid bar) stay. No change.
- **E — KEEP.** Tapped "Keep (Recommended)". The ••• menus on the inbox rows and in chat stay. No change.

Popup 3 (Board 3, 2026-09-29):

- **F — CHANGE, the operator's words exactly: "Leave as it is except the 1 long scroll of privacy +
  terms..."** Reading: the flow stays as today — Create account → Setup (Finish setup disabled) →
  the Terms & Privacy row → the gate → back to Setup → Finish setup — and the ONLY change is that
  Terms and Privacy become one reader read in one continuous scroll. The "Review Privacy Policy"
  tap disappears with it (there is no second document to switch to); the tick box and "Agree and
  continue" stay. Result: 4 taps (the row, the tick box, Agree and continue, Finish setup), 1 long
  scroll, Setup still seen twice. To build (`screens/LegalGateScreen.tsx`): render Terms then Privacy
  in ONE scroll view with the two status rows as jump links; the scroll-position detection sets
  `seen.terms` when the Terms block's end passes the viewport and `seen.privacy` at the end of the
  Privacy block; `canCheck = bothSeen` and the button logic stay; the single button reads "Agree and
  continue" once both are seen and names the document still owed before that. Fences: update
  expected strings only, never the gate's fail-closed logic (F-013). NOT accepted: the audit's
  "gate first, Setup once" reordering — the operator said leave the rest as it is.
- **I — NO CHANGE.** Tapped "Leave the phone at sign-up (Recommended)". The phone stays at sign-up;
  the ban-by-phone check is untouched. Closed.
- **G and H — KEEP BOTH.** Tapped "Keep both (Recommended)". Filters and the bid wording stay. No change.

**The list is complete.** Ten candidates decided: eight kept as built, two changes to build —
C (the total on the accept button) and F (Terms + Privacy in one scroll).

Popup 4 (2026-09-29), F re-checked: tapped "Yes, that's it" — one scroll for both documents; nothing
else in sign-up moves.

**STANDING RULE from popup 5 (2026-09-29), the operator's words exactly: "No don't build anything
yet until I specifically tell you to build and it publish OTA... I have alot of changes left... I
dont wanna make this too long of a process anymore".** Nothing is built in the practice copy, and
nothing is applied or sent OTA, until the operator says so in so many words. C and F wait here as
confirmed-not-built. Keep the loop short: fewer boards, fewer questions.

## 5. Parked

No candidate is parked: all ten are decided (popups 1–3). Open: "go" for the two changes (C, F), and
which of the 17 ideas, by number, join the next list.

## 6. New pictures from the operator

(none yet; numbered as they arrive, the full list re-sent every five)

## 7. Ideas offered (the ideas board; not on the list until the operator picks by number)

Simpler: 1 Sign in with Apple (new dependency; ruling on the phone-ban check) · 2 Post it again ·
3 Reuse your last pitch · 4 Undo instead of confirm (small actions only).
Practical: 5 Running late, one tap · 6 Tomorrow's job reminder · 7 Quiet hours · 8 A receipt after release.
Cool: 9 On the way, on the lock screen (Live Activity; new dependency) · 10 Money moments you can feel ·
11 Share the worker's card (ruling: link target) · 12 Need it today.
Game-changers: 13 What neighbours paid · 14 Repeat jobs · 15 Trusted on your street ·
16 Done near you this week · 17 Verified ID badge (all after ten users; real numbers only).
Checked before offering: Hire Again, completion photos, the would-you-hire-again review question and
"Worked for you before" already exist and are not re-proposed.

The operator's picks so far (popup 4, 2026-09-29, their words): "Sign in with Apple · one tap in, the
biggest single simplifier / Running late, one tap · the cheapest trust win in the app / Post it again ·
repeat customers in one tap (but I need to learn how this works first b4 adding to build list)". So:
1 and 5 named; 2 waits for a picture that explains it before it joins any build list. The operator
then said they were not done and asked for the question again.

Popup 5 (2026-09-29), the full pick, their words: "3, 7, 8(but i wanna see in what format does it
email the person), 10, 4, 5, 6, 9(I wanna see this visually aswell), 12, 14 / generate me give me
some more ideas (better than these ones)"; and for Post it again: "Yes, show me first".
PICKED for the next list: 1 Sign in with Apple · 2 Post it again (after a picture) · 3 Reuse your
last pitch · 4 Undo instead of confirm · 5 Running late, one tap · 6 Tomorrow's job reminder ·
7 Quiet hours · 8 A receipt after release (show the email format first) · 9 On the way, on the lock
screen (show it visually first) · 10 Money moments you can feel · 12 Need it today · 14 Repeat jobs.
NOT picked: 11, 13, 15, 16, 17. ASKED: a second round of ideas, better than the first.
None of these is built or scheduled; they are candidates for the next list, each to be confirmed by
popup like A–J were.
