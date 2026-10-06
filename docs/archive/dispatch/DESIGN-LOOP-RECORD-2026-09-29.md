# DESIGN LOOP — the record of the 2026-09-29/30 sitting (checked against `LUX-LIST-3.md`)

Written 2026-09-30 at the operator's request: "a detailed md file of this chat and all of the changes
and stuff that's pending (full list (double check and be careful))". Every decision below was checked
line by line against `docs/dispatch/LUX-LIST-3.md` §4 and §7, which carry the operator's exact words.
When this file and that one disagree, that one wins.

**THE STANDING RULE, the operator's words (popup 5): "No don't build anything yet until I specifically
tell you to build and it publish OTA... I have alot of changes left... I dont wanna make this too long
of a process anymore".** NOTHING in this record is built. Nothing was applied to the app, nothing was
sent OTA. The app is still exactly `c508b09` (the After of LUX-LIST-64 + LUX-LIST-2). Every "change"
here is a decision, drawn and recorded, waiting for the word "build".

## 1. What happened, in order

1. The session read `docs/dispatch/DESIGN-LOOP.md` and verified its ten candidates (A–J) against the
   code at `c71a5e1` by grep (the audit ids `M-…` in the source, the key phrases, the Now shots'
   element maps). Result: A, B, C, E, G, H, J already built; D partly (then fully, once the one
   doubtful line proved to be harness fixture text); F new; I dropped by the audit itself for a safety
   reason (the sign-up phone is the only ban-by-phone check).
2. Three boards, one popup each, decided all ten (§2 below).
3. An ideas page (17 ideas, 1–17) and a second round (18–25) were offered; the operator picked, dropped,
   reshaped and re-picked over eleven more popups and seven chat messages with marked-up screenshots
   (§3 below). Every step was drawn on the real screens first: boards 4–10 (pictures, auto-playing
   demos, option pages, the receipts page).
4. At the operator's request the closing surface became ONE local HTML file, not an artifact:
   `.shots/refresh/boards/full-list.html` — every decision with "today" on the left and the change
   playing on the right, on the real screenshots, the app's own icon font inlined. It was rebuilt and
   re-sent after each correction.
5. The operator then walked a "what's wrong" list against that file, items 1–7 (§4 below). The list
   was open ("item 8 onwards awaited") when they asked for this record and a new handoff.
6. Commits in this run: `ee87429` (the ten candidates recorded), `953de5f` (popups 4–14, the full
   list), and the closing commit that carries this file. `npm run verify` exited 0 three times in the
   run (1415 tests) before the pushes; the pushes were `git push origin mainexpo`, flag-free.

## 2. The audit list A–J — all ten decided

| # | Item | Decision | Status | What it means for the build |
|-|-|-|-|-|
| A | One decision, one pinned button | Keep | Live today | Nothing. |
| B | Payout honesty ("Set up payouts to receive $X") | Keep | Live today (stripe mode) | Nothing. |
| C | Money before the irreversible tap | **Change: the total goes on the button** | To build | When the accept dialog has a quote (stripe mode), its confirm button reads `Accept & pay $129` (`formatBudget(acceptQuote.total_cents)`, never client arithmetic); without a quote it stays `Accept bid`. Extend `lib/offerCopy.ts` `acceptOfferConfirmText()` with an optional total; update the #64/M-17 fence's expected string, never its logic. |
| D | Honest labels | Keep | Live today | Nothing. |
| E | Every feature has a visible door | Keep | Live today | Nothing. |
| F | Sign-up in fewer taps | **Change: Terms + Privacy in one scroll, nothing else moves** | To build | `screens/LegalGateScreen.tsx`: both documents in ONE scroll view, the two status rows as jump links; `seen.terms` / `seen.privacy` set by scroll position at the end of each block; `canCheck = bothSeen`, the tick box, "Agree and continue", Setup before and after — all unchanged. 4 taps instead of 5. The audit's "gate first, Setup once" reordering was NOT accepted. Fences: expected strings only, never the fail-closed logic (F-013). |
| G | One set of filters | Keep | Live today | Nothing. |
| H | One vocabulary: bid | Keep | Live today | Nothing. |
| I | Sign-up without a phone number | **Leave the phone at sign-up** | Closed | Nothing. The ban-by-phone check stays intact. |
| J | Questions before bidding | Keep | Live today | Nothing. |

## 3. The ideas — final state of every number

### Picked, with the spec as the operator finally shaped it

- **1 · Sign in with Apple** — picked (popup 4: "one tap in, the biggest single simplifier"). Needs
  `expo-apple-authentication` (a NEW dependency, to be flagged before adding) and the Apple provider
  on the auth side. OPEN: how the phone number is collected after an Apple sign-in, since decision I
  keeps the phone at sign-up (the ban check reads it there). Not drawn yet.
- **2 · Reuse a past job** — picked and reshaped four times; FINAL: in the + sheet, a row in the same
  white as the other rows, "Reuse a past job", grey caption "Start from one you posted before", a
  chevron; CLOSED until tapped (popup 12); the chevron opens a horizontal, endlessly scrollable strip
  of compact cards, about 2.5 visible across, each 128–160 px wide (just wide enough for its own
  text), the full title up to three lines, the worker's full name and the date on their own lines,
  the price bottom-right (what's-wrong item 1). Tapping a card opens the post on its Review step,
  filled from that job; Publish. Three taps from anywhere. The finished-job row and the Home row
  were NOT chosen; the sheet is the one door. The word "drafts" was rejected because the app already
  uses it for unpublished posts.
- **4 · Undo instead of "Are you sure?"** — picked (popup 5). Archive, mute and mark-unread just
  happen, with a five-second Undo toast; money and hiring keep their confirm box. Drawn on the Inbox.
- **5 · Running late, one tap** — picked (popup 4). On the worker's job screen, inside the progress
  card: three chips (10 / 20 / 30 min); one tap tells the customer and moves the arrival time; the
  label turns into "Dana was told ✓". Jobs already carry `scheduled_date`, `scheduled_for` and an
  arrival window (`arrival_start_hour` / `arrival_end_hour`), so the time can move.
- **6 · Tomorrow's job reminder** — picked (popup 5). The evening before, both sides get one push with
  the job, the time and two actions (Message, Route). Jobs carry the date (see 5); the push needs a
  scheduled job on the server (a daily cron enqueueing into `notification_outbox`).
- **7 · Quiet hours** — picked (popup 5). One row in Notification settings, "Quiet hours · 10 pm to
  7 am · nearby alerts wait"; nearby-job alerts wait until morning, your own jobs and money still come
  through. Drawn as ON by default — the default and the hours were never confirmed by the operator.
- **8 · The receipt** — picked and reshaped three times. The last words (popup 14): "like D but no
  option to open job in brazos… no provider receipt number… no explanation of protection fee… so
  everything under amount charged is not suppose to be there it should just say Questions? Reply to
  this email and quote the job number… But i do want the what happened section and the category /
  area section". FINAL customer receipt, as drawn: the Brazos band with the job number, the amount,
  "Released to <worker> on <date>, after you approved the work", Worker · Paid with · Category · area
  · Hired, the What-happened timeline (posted, hired + held, completed, approved + released), the
  lines Agreed price · Protection fee · Amount charged, then only "Questions? Reply to this email and
  quote the job number." The worker's receipt was drawn beside it: "You've been paid", $74.00 of the
  $80 agreed (the fee is 7.5% on each side, `fee_schedule`), Customer · Goes to · Category · area ·
  Hired, the same timeline from the worker's side, Agreed price · Brazos fee (7.5%) · Paid to you,
  the same closing line. OPEN, and important: "like D" means a Brazos-made email, which needs an
  email service (a new dependency and an account) and a job-number column (a short serial such as
  BZ-0186, an additive migration); popup 13 had chosen "the provider's receipt with the job number",
  which needs neither. The next session confirms which. Today: no receipt email exists; the worker
  gets the app's "Your work was approved" push and the Earnings rows.
- **9 · On the way, on the lock screen** — picked (popup 5). The worker's taps on the stage rail (On
  my way, Arrived, Started, Finished) reach the customer's lock screen as a live card with the rail
  and the arrival time. The Dynamic Island version was DROPPED (what's-wrong item 3: on Home it
  repeats the live bar). Needs a native add-on for Live Activities (a NEW dependency, to be flagged).
- **10 · Money moments you can feel** — picked (popup 5). A soft haptic and a one-second pulse when
  funds are held; a full tick and haptic when they are released. Built with `Animated` and the haptics
  the app already has.
- **12 · Need it today** — picked (popup 5). A toggle on the Review step (off by default); on: nearby
  workers get an instant alert and the job card shows a Today pill.
- **14 · Repeat jobs** — picked (popup 5). Post once; the same worker gets first refusal each time;
  the customer still approves each visit; the money rules stay. Offered as "after ten users" and
  picked anyway; recurrence and calendars are outside `docs/SCOPE.md` v1, so building it needs a dated
  `docs/DECISIONS.md` entry first. Drawn as a row on the Review step ("Repeat this job · Every 2 weeks").
- **18 · Two mic icons, dictation in place** — the operator's own version (popup 9), corrected once
  (item 4): a 26 px mic at the far right inside the title field and a 26 px mic at the bottom-RIGHT
  inside the description box; on-device speech-to-text fills that field in place. No sheet, no big
  button. `expo-speech-recognition` is already in the app (the Home search).
- **20 · Hire from the push, confirmed in place** — the operator's own version (popup 11 + 12): the
  bid push lands; press and hold shows its two actions (View / Accept & pay $129); Accept turns the
  pill into "Confirm $129" (and View into Cancel) — on a phone this is a second notification that
  replaces the first, because a push's buttons cannot change in place; Confirm hires and pays with
  nothing opening; the push disappears; then the push becomes the live card of idea 9 for that job.
  DECIDED with it: a "Save this card for one-tap hiring" opt-in, off by default, at Checkout AND in
  Profile → Payment methods, removable there. What it needs: the provider's saved payment method
  (`setup_future_usage` on the payment sheet the app already uses — `@stripe/stripe-react-native` is
  present) and a server-side off-session charge on Confirm; notification categories with actions
  (`expo-notifications` is present); the accept must still go through `accept_offer()` and the payment
  through the same RPC path as Checkout — no new money rules. Drawn the way a phone shows a push
  (light frosted banner, the app icon, plain stacked action rows; a phone cannot tint them).
- **23 · Category tiles, then the questions** — the operator's own version, shaped over popups 9, 11,
  13, 14 and 15 and item 6; FINAL: the category picker becomes a sliding row of the app's own tiles
  (Home's Popular-services tiles, same size, corners, names, the same `-outline` Ionicons, both
  modes); the tapped tile highlights, grows about 25 px wider, shows a checkmark box before its icon
  and a small down-arrow under it; a DROPDOWN opens in the page under the row — look **2, plain rows
  with hairlines, the way the Profile hub's rows open in place** (`useDropdownPresence`); the page
  scrolls itself so the whole dropdown is in view; two to four questions per category with answer
  chips; each answer becomes a line in the description. (The "3 · lit card" tap of popup 15 was
  superseded by "I pick this one (2)", the last word.)

### Dropped by the operator
- **3 · Reuse your last pitch** — "no get rid of this" (item 2).
- **25 · Move it, one tap** — "remove this scratch" (item 7). (It had been "yes add to list" in popup 7.)
- The Dynamic Island scene of **9** (item 3). The lock-screen live card stays.

### Closed
- **21 · Saved workers hear first** — "Not now" (popup 13), after the current alert mechanism was
  explained: on publish the database queues every worker with alerts on, within their own radius,
  with the category (or no categories), all at once; the queue drains every minute to the push
  service; no order, no cap, nothing special for saved workers.

### Not picked
11 Share the worker's card · 13 What neighbours paid · 15 Trusted on your street · 16 Done near you
this week · 17 Verified ID badge · 19 Photo first · 22 Tell someone where you are · 24 The worker's
morning brief.

## 4. The operator's "what's wrong" list against the full-list file

| Item | Their words | What was done |
|-|-|-|
| 1 | "make these boxes more concise… boxes width can adjust slightly… about 2.5 box shown with full horizontal scrollable method" | The Reuse cards redone as in idea 2 above. |
| 2 | "no get rid of this" (idea 3) | Idea 3 dropped and removed from the file. |
| 3 | "since dynamic is doing same work as the on the way above post a job tab.... get rid of that (unless it doesnt)" | The Dynamic Island scene removed from idea 9. |
| 4 | "make the description one on the right bottom corner not left... and make both of the outline circles a little smaller" | Idea 18's mics moved and shrunk. |
| 5 | "i hope all of these (not just these) arent what it looks like on the app exactly..." | Answered honestly: app screens are real screenshots; a lock screen, a push, an email or the live card are DRAWN. The pushes were redrawn the way a phone shows them. |
| 6 | "I pick this one (2)" (idea 23's three looks) | Look 2 kept, the others removed. |
| 7 | "remove this scratch" (idea 25) | Idea 25 dropped. |
| 8+ | awaited | — |

## 5. Pending — everything that is not finished, carefully

1. **The word "build" has not been said.** C, F and the fourteen picked ideas are confirmed-not-built.
   When it is said, the order is: build in the practice copy `.shots/refresh/practice`, real
   before → after renders of every changed screen in both modes, ONE Proof board, "Ship it?", then
   `after.patch`, `.shots/refresh/buildit-lf.mjs`, `npm run verify` exit 0, commit by path, push,
   `npm run update:preview`, HANDOFF, one mobile push.
2. **The "what's wrong" list may continue** (item 8 onwards).
3. **Receipt: provider's or Brazos's own?** The last words describe a Brazos-made email; the earlier
   choice was the provider's receipt with the job number. Confirm before anything is built. Either way
   a short job number column is new.
4. **New dependencies to flag before adding:** `expo-apple-authentication` (idea 1); a Live Activities
   add-on (idea 9 and the end of idea 20); an email service (idea 8 if Brazos's own). Nothing else
   picked needs a new package.
5. **Idea 1:** how the phone is collected after an Apple sign-in (decision I keeps it at sign-up).
6. **Idea 7:** confirm the default (drawn ON) and the hours (drawn 10 pm–7 am).
7. **Idea 14:** a dated `docs/DECISIONS.md` entry before it can be scheduled (outside SCOPE v1).
8. **Idea 20:** the failure path (a declined saved card) needs a push that opens the app to Checkout;
   not drawn. The notification-action flow was drawn as a phone shows it; the exact copy of the
   second ("Confirm") notification is as drawn.
9. **Ideas never drawn on the real screen:** 1 (Apple sign-in) has no picture yet.
10. **Two published boards still show superseded versions** (board-6's popup-style tiles, board-7's
    options); the full-list file is the surface of truth. The boards are records, not proposals.
11. **The full-list file** lives in the gitignored `.shots/refresh/boards/`; its source
    `full-list.tpl.html` and builder `inline.mjs` are there too. It is rebuilt with
    `node inline.mjs full-list.tpl.html full-list.html` from that folder. It is 3.7 MB; the app's
    browser pane cannot open it, so it is sent as a file.

## 6. Deliverables and where they live

| What | Where |
|-|-|
| The operator's exact words, every popup | `docs/dispatch/LUX-LIST-3.md` §4, §7 |
| Board 1 · A, B, C | https://claude.ai/artifact/6LhcHquAZjWMVkaKwefyct · `.shots/refresh/boards/board-1.html` |
| Board 2 · D, J, E | https://claude.ai/artifact/4hydJgq6dFGP6FTTtwjwXt · `board-2.html` |
| Board 3 · F, I, G, H | https://claude.ai/artifact/3LqsNGzgduDRriPX4zWHNg · `board-3.html` |
| Ideas 1–17 | https://claude.ai/artifact/JH7z7vvYqxcmdfCheJTTA9 · `ideas.html` |
| Ideas 18–25 | https://claude.ai/artifact/5SsK9MBZmHBrPmYxLBnJV2 · `ideas-2.html` |
| Pictures (2, 8, 9) | https://claude.ai/artifact/8DPpyoTwddW8k7GSWdXQUC · `board-4.html` |
| Demos (2, 8) | https://claude.ai/artifact/GD8Wi2vTJUqm1v35FJCwUB · `board-5.html` |
| Demos 2 (2 via +, 18, 23, 20, 8) + the alerts map | https://claude.ai/artifact/QXW6GG9yKQFd2APmRF77aj · `board-6.html` |
| Options (2: A–E, 18: F–H, 23: two folds) | https://claude.ai/artifact/WGnDhyufrhVFGwcP8t3q5u · `board-7.html` |
| Demos 3 (Reuse row, mics, tiles, push) | https://claude.ai/artifact/Ri2xMdX7Qg2C5CHi8ZmiU4 · `board-8.html` |
| Demos 4 (Reuse cards, tiles dropdown, push in place → live card) | https://claude.ai/artifact/KLZuy3fabQCgj5AzrSoT8t · `board-9.html` |
| Receipts, four ways | https://claude.ai/artifact/T8Psyn8r5yTYqBTws74Si4 · `board-10.html` |
| THE FULL LIST, live (the surface of truth) | `.shots/refresh/boards/full-list.html` (from `full-list.tpl.html` via `inline.mjs`) |

## 7. Facts learned about the app (read from the code; useful to whoever builds)

- Alerts: `notify_nearby_for_job` (baseline `:3148`) on `job_locations` insert; radius is the worker's
  own (1/3/5/10 mi, default 5); category filter only if the worker listed categories; `should_notify`
  gate; `notification_outbox` drained every minute by pg_cron into `send-push`. No `send_after`
  column exists (21 would have added one).
- Fees: `fee_schedule` — 7.5% customer side, 7.5% worker side with a $1.00 worker minimum; tips carry
  the customer fee only; tax 0; cancellation 20% floored $15 capped $35.
- Cards: nothing is saved. Checkout opens the provider's payment sheet (`lib/payments/stripe.ts`,
  customer + ephemeral key + payment intent) every time; `create-payment` sets no
  `setup_future_usage`; Payment methods says "No stored payment methods".
- Jobs carry `scheduled_date`, `scheduled_for` and an arrival window (`arrival_start_hour` /
  `arrival_end_hour`), all nullable.
- The accept dialog already carries "Agreed price · Protection fee · Total charged" in stripe mode
  (`ClientJobDetailScreen.tsx:1384`); the button is `acceptOfferConfirmText()` = "Accept bid".
- Home's service tiles: `components/ServiceTileRow.tsx` — four tiles across, 73.25 px on a 393 phone,
  the `-outline` Ionicon of `lib/skillCategories.ts`'s icon at 30 px in mint, the name inside under
  the icon; `HOME_SERVICE_TILES` = the six quick services then the eighteen more; `ALL_SERVICES` adds
  Other.
- In-place opening: `hooks/useDropdownPresence.ts` — opacity 0→1 with translateY −6→0, ease-out
  cubic, the chevron rotating 180°. The dropdown pane material: `ui/tokens.ts` `paneFills.dropdown`.
  The card material: `lib/theme.ts` `litCardStyle()` over `tokenLitCard`.
- The legal gate: one changing button (`LegalGateScreen.tsx:172-177`), the tick box (`:315-323`,
  `canCheck = bothSeen`), fail-closed (F-013). Setup pre-selects "Start in" (`SetupScreen.tsx:68`).
- The harness's feed text "is on its way to your payouts" is fixture text
  (`docs/mockups/refresh/mock.js`), not app copy; the worker's real release push is "Your work was
  approved" / "Payment released automatically" with a sandbox body (baseline `:3590`).
- No human-readable job number exists; jobs have UUIDs, payments have `provider_ref`.
- Present packages that the picked ideas lean on: `expo-notifications`, `expo-speech-recognition`,
  `@stripe/stripe-react-native`. Absent: Apple sign-in, Live Activities, any email service.
