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
| Board 2 (D, J, E) and Board 3 (F, I, G, H) | `.shots/refresh/boards/board-2.html` https://claude.ai/artifact/4hydJgq6dFGP6FTTtwjwXt · `board-3.html` https://claude.ai/artifact/3LqsNGzgduDRriPX4zWHNg |
| The pictures board (ideas 2, 8, 9 drawn) | `.shots/refresh/boards/board-4.html` — https://claude.ai/artifact/8DPpyoTwddW8k7GSWdXQUC |
| The demos board (ideas 2 and 8 auto-playing: finger, slide, tap counter) | `.shots/refresh/boards/board-5.html` — published URL in HANDOFF |
| Ideas round 2 (18–25), its own page | `.shots/refresh/boards/ideas-2.html` — https://claude.ai/artifact/5SsK9MBZmHBrPmYxLBnJV2 |
| Demos 2 (2 via the + sheet, 18, 23, 20, 8 richer) + the alerts map | `.shots/refresh/boards/board-6.html` — https://claude.ai/artifact/QXW6GG9yKQFd2APmRF77aj |
| Options (2: doors A–E; 18: looks F–H; 23: the fold, ways A and B) | `.shots/refresh/boards/board-7.html` — https://claude.ai/artifact/WGnDhyufrhVFGwcP8t3q5u |
| Demos 3 (the Reuse row, the two mics, tiles v1, the push with the app's confirm box) | `.shots/refresh/boards/board-8.html` — https://claude.ai/artifact/Ri2xMdX7Qg2C5CHi8ZmiU4 |
| Demos 4 (Reuse cards keeping every detail; the app's own tiles + the questions DROPDOWN in the app's frosted pane with the page scrolling itself, drawn with `fonts/Ionicons.ttf`, the app's icon font; the push confirmed in place, then the live card) | `.shots/refresh/boards/board-9.html` — https://claude.ai/artifact/KLZuy3fabQCgj5AzrSoT8t |
| Receipts, four ways (A the provider's as is, B dressed, C Brazos essential, D Brazos full) + the detail table | `.shots/refresh/boards/board-10.html` — https://claude.ai/artifact/T8Psyn8r5yTYqBTws74Si4 |
| THE FULL LIST, LIVE — one local file, no artifact (the operator's ask): every decision A–J and every picked idea with today on the left and the change playing on the right, on the real screens; 27 shots × 2 schemes inlined as 1x JPEG, the app's Ionicons font inlined; 3.9 MB | `.shots/refresh/boards/full-list.html`, built by `node inline.mjs full-list.tpl.html full-list.html` from `full-list.tpl.html` (the source of truth for the page) |
| The disk renderer for a board (the app's browser pane cannot show these) | `.shots/refresh/boards/look.mjs` — `node look.mjs <board>.html "<selector>@<nth>" …` clicks, then `_look-*.png` |
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

Popup 6 (2026-09-29), after the pictures board (`boards/board-4.html`,
`https://claude.ai/artifact/8DPpyoTwddW8k7GSWdXQUC`), their words:
- Post it again: "Need to visualize it in html style interactive with animations auto playing the
  process" → not decided; a demo that auto-plays the taps (finger, slide, counter) replaces the
  crossfade stepper (`boards/board-5.html`).
- Receipt: "I think option 1 bc i dont want new dependency etc but Need to visualize it in html
  style interactive with animations auto playing the process" → leaning to the payment provider's
  standard receipt (no new service); the same kind of auto-playing demo requested before deciding.
- Round 2: "confused which artifact are you reffering to" → the `#round2` anchor on the ideas page
  was not found; round 2 moved to its own page (`boards/ideas-2.html`).

Popup 7 (2026-09-29), after the demos board (`boards/board-5.html`,
`https://claude.ai/artifact/GD8Wi2vTJUqm1v35FJCwUB`) and the round-2 page
(`https://claude.ai/artifact/5SsK9MBZmHBrPmYxLBnJV2`), their words:
- 2 Post it again: "yeah but wouldn't it be easier to place it somewhere else? than the customer
  having to go into the completed job to press post again? like maybe an option in the + button
  popup where it lists out all of the job the customer posted and which one he / she wants to
  reuse ?" → YES to the idea; the ENTRY POINT moves to the [+] sheet, which lists the customer's
  past jobs to reuse. To be shown as a demo before it is written into the list.
- 8 Receipt: "is there way to make the email formatting prettier / better / + more professional
  and add more details? + like a order # or job # or something so if any admin needs to access
  it.. they can it'll be saved in the database" → wants a richer, more professional email with a
  job/order number that is stored in the database for admin lookup. To answer: what the
  provider's standard receipt can carry (logo, brand colour, one custom line, the job number in the
  description) versus Brazos's own email (needs an email service); a draft of the richer email.
- 18 Say it: "is a really nice feature but how would it look in actual app? show me
  demonstration" → demo requested. 19 Photo first: "no". 20 Hire from the push: "nice feature but
  how would it look in actual app? show me demonstration" → demo requested. 21 Saved workers hear
  first: "how does it work right now? i wanna know before we add this to the list... like everyone
  gets notified instantly? like specifically how does the notification mechanism work right now?"
  → explain today's mechanism from the code, visually, before any decision. 22: "No". 23 The
  usual questions: "is a really nice feature but how would it look in actual app? show me
  demonstration" → demo requested. 24: "no". 25 Move it, one tap: "yes add to list" → ADDED.
PICKED so far, in full: 1, 2 (entry in the [+] sheet; demo pending), 3, 4, 5, 6, 7, 8 (email
format pending), 9, 10, 12, 14, 25. Pending a demo: 18, 20, 23. Pending an explanation: 21.
Declined: 11, 13, 15, 16, 17, 19, 22, 24.

HOW ALERTS WORK TODAY (for 21; read from `supabase/migrations/20260901000000_baseline.sql:3148`
`notify_nearby_for_job`, the trigger `job_locations_notify_nearby` at `:6722`, and
`docs/architecture.md` §Notifications): when a job's location row is inserted (publish), the
function selects every `notification_prefs` row with `nearby_jobs` on, a home lat/lng, not the
poster, not banned, whose `profiles.categories` is empty or contains the job's category, and whose
home is within THEIR OWN `nearby_radius_miles` (1/3/5/10, default 5; a bounding box then a
haversine check). Each match gets one `enqueue_notification` (category `nearby_jobs`, type
`job_nearby`, "New job near you · <title> · <area>", deep link JobDetail, dedupe
`job_nearby:<job>:<user>`) through the `should_notify` gate (ban/block/mute/prefs). The outbox is
drained on a pg_cron schedule (phase74, every minute) into the `send-push` edge function → Expo.
So: everyone eligible is queued at once and pushed within about a minute; no cap, no order, saved
workers get nothing special. The 21 idea = the same selection, saved workers queued now, others
with a delay (an additive `send_after` column on `notification_outbox`, honoured by the drain).
Explained on `boards/board-6.html` as an animated map.

Popup 8 (2026-09-29), after the second demos board (`boards/board-6.html`,
`https://claude.ai/artifact/QXW6GG9yKQFd2APmRF77aj`), their words, pasted into all three answers:
"for idea 2There has to be a simpler way to implement it in a more visually appealing way..... give
me some other ideas" and, for 23: "Like where when you select a category it moves all of the other
pills somewhere else in a nice way and then it expands the questions..?" → for 2: neither door is
chosen; offer several placements as pictures to pick from (`boards/board-7.html`). For 23: the
interaction they want — on choosing a category the other pills move away with motion and the
questions expand under the chosen one — built as a demo with two variants. For 18: no specific
answer; alternatives offered as pictures on the same board. 20, 8 (format) and 21 still open.

Popup 9 (2026-09-29), after the options board (`boards/board-7.html`,
`https://claude.ai/artifact/WGnDhyufrhVFGwcP8t3q5u`), their words exactly:
- 2 Post again → **C, changed:** "C but want to make the boxes compact but not lose the info like
  title, name, date, price / and instead of Post again... it should say... Reuse drafts (in same
  white color as rest for consistency) (and next to it in small grey letters should say something
  like "Reuse already posted jobs as templates" or if you can make it sound better and more
  concise... / And that Reuse drafts should have a downward > that expands that section and shows
  all of the previous drafts..... where you can slide indefinetly...) (any questions?)" → the + sheet
  gets a "Reuse drafts ˅" row (white, like the other rows) with a small grey caption; tapping the
  chevron expands a horizontal, endlessly scrollable strip of compact cards, each keeping title,
  worker name, date and price. Two questions asked back (popup 10): the word "drafts" already
  means an unpublished post in the app (My Jobs → Draft); and what the collapsed state shows.
- 18 Say it → **scratched, replaced:** "(scratch this feature just add microphone icons next to
  title and description, where it uses apple's speech to text for title (far right of the pill)
  and description (bottom left of box)" → DECIDED as: a mic icon at the far right inside the title
  field and one at the bottom-left inside the description box; on-device dictation fills the field
  in place. No sheet, no big button. (The app already carries `expo-speech-recognition` for the
  Home search; the same listening.)
- 23 The usual questions → **changed:** "I think instead of pills entirely.... we can use similar
  system with the popular services sliding system where you can scroll.... then if you click one
  of them it highlights / and puts a checkmark inside the box at the beginning of the icon box and
  makes it a little bit wider to accomodate space for checkmark... then it drops down a a tab with
  the most useful questions with choices... / answers) (would like to see how it look in html
  tho)" → the category picker becomes a horizontal tile row like Home's Popular services; the
  tapped tile highlights, grows a little wider and shows a checkmark before its icon; a panel drops
  down under the row with the questions and their answer chips. Demo requested (`boards/board-8.html`).

Popup 10 (2026-09-29), their words: the word → "“Reuse a past job” (Recommended)" — DECIDED: the
row reads "Reuse a past job ˅", grey caption "Start from one you posted before". Collapsed state →
"confused... (please elaborate more simpler way)" → shown as two pictures on `boards/board-8.html`
(closed until tapped, or two cards always showing) and asked again. 20 Hire from the push → "Let me
a live html of it working first... and how the push looks... I want it to be as simple as possible
and concise without missing details" → a dedicated, minimal demo on the same board: the push
arrives compact, a long-press expands it (that is how iOS shows a push's buttons), Accept & pay
opens the app's own confirm box, confirm, held.

Popup 11 (2026-09-29), after `boards/board-8.html` (`https://claude.ai/artifact/Ri2xMdX7Qg2C5CHi8ZmiU4`),
their words exactly:
- Reuse row: "you ignored my comment when i said want to make the boxes compact but not lose the
  info like title, name, date, price" → the cards on board-8 abbreviated the name ("Priya N.") and
  clipped long titles; REDO: compact cards that keep the full title, full name, date and price
  (`boards/board-9.html`). The closed-or-two-cards question is still open.
- 23 Tiles: "yes but use the same icons / style / icons as the ones in home customer (for both
  modes) but just add a > pointing down to showcase it opening a popup... then autoscroll to
  thebottom of the popup to auto display all of the questions.... (please use all real icons /
  styles / look as it is used in real app currently)" → YES with changes: the tiles copy Home's
  Popular-services tiles exactly (the app's own Ionicons, the app's tile style, both modes); the
  tapped tile shows a downward chevron and opens a popup sheet of the questions, which scrolls
  itself to the bottom so every question is seen. Demo redone with the real icon font.
- 20 Push: "shouldn't open the app for confirmation from lock screen (for double confirmation)
  (the accept and pay pill should turn into "Confirm" and if they press it again then it just auto
  accepts without opening anything.... and then it removes the notification and shows the ios
  status bar on lockscreen) (any questions? (i wanna see it visually too" → CHANGE: two taps on
  the notification itself, no app: the pill becomes "Confirm", the second tap accepts and pays,
  the notification goes away. Questions to ask back: paying without opening the app needs a card
  saved with the payment provider (today the app stores none — `screens/PaymentMethodsScreen`
  says "No stored payment methods", and Checkout uses the provider's payment sheet each time), so
  a "save my card for one-tap hiring" step comes first; and whether a quiet "Hired · protected"
  line should follow the confirm or nothing at all. Demo redone visually.

Popup 12 (2026-09-29), after `boards/board-9.html` (`https://claude.ai/artifact/KLZuy3fabQCgj5AzrSoT8t`),
their words exactly:
- Reuse row, closed or open → "1 · Closed until you tap (Recommended)" — DECIDED: the "Reuse a
  past job ˅" row is closed until tapped; the chevron opens the sliding strip of compact cards
  (full title up to three lines, full worker name, date, price).
- Saved card → "yes opt in at checkout as well as the payment method tab on profile settings..." —
  DECIDED: a "Save this card for one-tap hiring" opt-in (off by default) at Checkout AND in
  Profile → Payment methods; removable there. (Needs the provider's saved-payment-method setup
  and a server-side charge for the push's Confirm; Checkout today opens the provider's sheet each
  time and stores nothing.)
- After Confirm → "It turns into the 9. On the way, on the lock screen (ios native status bar)" —
  DECIDED: after Confirm the push becomes the lock-screen live card of idea 9 for that job (hired,
  then on the way, arrived, started, finished), in the native lock-screen module; no separate
  "quiet line". 20 and 9 are one flow now.

Popup 13 (2026-09-29), their words exactly:
- 23 Tiles → "1st option... but not a popup.. a dropdown... then the customer gets auto scrolled
  to the bottom to see all of the questions... emerald lux style (liftoff; check references for
  how it is done currently.. then make accurate html to show final)" → YES with: the questions
  open as a DROPDOWN in the page under the tile row (not a bottom sheet), the page then scrolls
  itself so the whole dropdown is in view; styled as the app's Emerald Lux in-place expansions
  are today (the Profile hub's rows that open in place, LUX-LIST-2 #7; the lit card). Final demo
  redone on `boards/board-9.html`.
- 8 Receipt → "providers receipt, with job number... but I wanna know if there are anything else
  we can add to the receipt to make it as professionally made / very nicely done... / adding more
  details etc... (give me some ideas and then make me a html showing all of the diff versions of
  the email + what things you added in the receipt and why etc)" → DECIDED: the provider's receipt
  carrying the job number; PLUS a receipts page with every version side by side (the provider's
  default, the provider's dressed as far as it allows, Brazos's own essential, Brazos's own full)
  and what each added detail is for (`boards/board-10.html`).
- 21 Saved workers hear first → "Not now" — CLOSED; alerts stay as they are.

Popup 14 (2026-09-30), their words exactly:
- 23 Dropdown → "show me diff versions live...." → three live versions of the dropdown to pick
  from (the frosted pane; plain in-place rows like the Profile hub; the lit card), all playing.
- 8 Receipt → "I want it like D but no option to open job in brazos.... and anything under that /
  and no provider receipt number.... / no explanation of protection fee.... / so everything under
  amount charged is not suppose to be there it should just say Questions? Reply to this email and
  quote the job number. / And no option to open job in brazos / But i do want the what happened
  section and the category / area section / Also what receipt does the worker get? how does it
  look?" → DECIDED (the customer's receipt): D without the button, without the provider receipt
  number, without the fee explanation, and nothing under "Amount charged" except "Questions? Reply
  to this email and quote the job number."; the What-happened timeline and the category · area
  stay. ASKED: the worker's receipt — to be drawn (today the worker gets the app's "Payment
  released" push and feed row and the Earnings rows; no email from Brazos; the provider may email
  a payout notice from its own side).
- Wrap up → "Show me the full list, alongside it live view of before and after change and how it
  would look in the real honest app.... exactly..... / So dont make artifcats just make html file
  and let me see it" → ONE local HTML file (no artifact): every decision with a live before →
  after on the real screens; opened in the app's browser pane and sent as a file.

Popup 15 (2026-09-30), after the full list (`boards/full-list.html`, sent as a file; the app's
pane could not open a 3.9 MB local file): 23's dropdown look → "3 · The lit card" — DECIDED: the
questions dropdown wears the app's lit-card material (the gradient, the rim, the lift shadow),
under the app's own tiles, the page scrolling itself. The file → "It opens but something is
wrong" (no detail yet). The list → "Change something" (no detail yet). Both asked back.

The operator's list of what is wrong, item 1 (2026-09-30, in chat, with a marked-up picture of
the strip), their words: "start the list of whats wrong.... so first i kept on mentioning to make
these boxes more conise... .you never listened to me..... so look this is how its suppose to be
shown and it boxes width can adjust slightly to better show the info in a nicer way and there
should be about 2.5 box shown with full horizontal scrollable method" → FIXED in the full list
and board-9: the Reuse cards are 128–160 px wide (each just wide enough for its own text), about
2.5 visible across the strip, the title up to three lines, the worker's name and the date on
their own lines, the price bottom-right, the strip scrolling sideways.
Item 2 (2026-09-30, a screenshot of idea 3 "Reuse your last pitch" with "no get rid of this") →
idea 3 DROPPED; removed from the full list. PICKED now: 1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18,
20, 23, 25.
Item 3 (2026-09-30, a marked-up screenshot of idea 9's Dynamic Island scene over Home): "since
dynamic is doing same work as the on the way above post a job tab.... get rid of that (unless it
doesnt)" → the Dynamic Island scene is REMOVED from 9; the lock-screen live card stays. (Noted
back: on Home the island does repeat the live bar; outside the app it would be the only place the
stage shows — the operator's call stands.)
Item 4 (2026-09-30, a marked-up screenshot of idea 18): "make the description one on the right
bottom corner not left... and make both of the outline circles a little smaller..." → DECIDED:
the description mic sits at the bottom-RIGHT of the box; both mic circles are smaller (26 px, was
30). Fixed in the full list and board-8.
Item 5 (2026-09-30, a screenshot of idea 20's push with "i hope all of these (not just these) arent
what it looks like on the app exactly...") → ANSWERED HONESTLY: the app screens are real
screenshots; everything the app cannot show (the lock screen, a push, an email, the live card) is
DRAWN and was drawn in the app's colours, which a phone would not do for a push. Redrawn: the
lock-screen pushes now look the way a phone shows them (a light frosted banner, the app icon,
dark text, plain stacked action rows that a phone cannot tint). The live card stays app-designed
(a phone lets the app design that one). The emails are drawn as an email client shows them.
Item 6 (2026-09-30, a marked-up screenshot of 23's three looks, "I pick this one (2)") → 23 DECIDED
AGAIN, the last word wins: version 2, plain rows in the page (like the Profile rows), not the lit
card. The full list keeps only that version.
Item 7 (2026-09-30, a screenshot of idea 25 with "remove this scratch") → idea 25 DROPPED.
PICKED now: 1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 20, 23. Item 8 onwards: awaited.
