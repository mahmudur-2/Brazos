# DESIGN LOOP — how to run the next BRAZOS design session (read this first, all of it)

Written 2026-09-29 for a fresh session (planner: Fable). Short on purpose. Everything you need is
here or one grep away. Do NOT read other big files to "get context".

## 0. The operator — work this way or it fails

- The operator has ADHD, writes no code, reads on a phone, and is a VISUAL learner. Words do not
  land; pictures and short animations do.
- Show, don't tell. Every change you propose is a looping before → after animation of the real
  screen, not a paragraph.
- One thing at a time. Batches of 3–4 changes, never more.
- Start every reply with one line: `Where we are: Board 1 of 3 · 2 decided · 3 parked`.
- At most 6 short lines of text per reply, plain words, no jargon, no audit ids, no file paths
  (unless asked). The visual carries the rest.
- Every question is a tap-to-answer popup (AskUserQuestion): 2–4 options, recommended first, the
  free-text answer is built in. Never ask in chat text. At most 3 questions per popup.
- End every reply with one line: `Parked: …`, the undecided items the operator asked you to keep
  reminding them about (see §3).
- Nothing is confirmed until the operator taps it. Keep asking and reminding. Record their
  numbers and words exactly.
- Budget: be fast and cheap. Narrow greps, no whole-file reads of big files, one look per page
  you publish, no screenshot loops.

## 1. Where things stand (git owns the live state; check it)

- The app IS the After now: LUX-LIST-64 and LUX-LIST-2 were applied in `c508b09`, verified
  1415/1415, pushed, and shipped to the Beta by OTA (HANDOFF first section).
- The practice copy `.shots/refresh/practice` equals the app. Build there first, always.
- The viewer `.shots/refresh/index.html`: its AFTER column is the current app. Its BEFORE column
  is the OLD app (stale), so never show it as "current".
- "Now" pictures come from the After export, which is the current app:
  `node docs/mockups/refresh/export.mjs after`, then `prepare.mjs after`, then
  `node .shots/refresh/shot.mjs after dark <ids>` (and `light`) → `.shots/refresh/shots/`.
  Screen ids: HANDOFF §10 of the 2026-09-27 primer (e.g. `job-open job-bids bid-detail accept
  job-assigned-pay approve w-detail w-submit w-job w-job-end w-earnings w-home w-filters w-jobs
  create-email create-phone setup legal welcome signin-phone`).
- Every recipe, guard and trap: `HANDOFF.md` (first section, plus the 2026-09-27 primer §3, §7, §8)
  and `docs/dispatch/LUX-LIST-64.md` §5. Read those sections only when you need them.

## 2. Your first 10 minutes

1. Run `git log --oneline -3` and read `HANDOFF.md`'s first section only.
2. Verify each candidate in §3 against the CODE before showing anything. Many are ALREADY BUILT.
   Grep the app for the audit id (the code carries `M-14`, `M-25` … comments) and for the key
   words in §3. Mark each one DONE, PART or NEW. Budget: about 10 greps in total.
3. Render the "Now" screens those candidates live on (one export, one shot batch).
4. Build Board 1 (§4), publish it, send the link and one popup.

## 3. The candidate list (the operator's words, 2026-09-29): NOT confirmed

Each has a plain meaning (use it in reminders), the expected status (verify it), and what the
animation must show. Use the audit's details in `.shots/ux-audit/synthesis.json` (grep the id,
read only that entry: `flaw`, `fix`, `afterSpec`).

| # | Change | Plain meaning (say it like this) | Audit id | Expected status | Operator said |
|-|-|-|-|-|-|
| A | One decision, one pinned button | When a screen has one important thing to do (Pay & hire, Approve the work, Send a bid, Start, Mark complete), that button sits in a bar fixed at the bottom, so you never scroll to find it. | M-1, M-2, M-3, M-4 | likely DONE (code refs exist) | "yes, but not sure what you mean; remind me" |
| B | Payout honesty | A worker who hasn't set up payouts is told "Set up payouts to receive $95 →" instead of "payout on its way". | M-14 (LUX-LIST-64 #63) | DONE in `c508b09`, but stripe-mode only, so the sample world doesn't show it: mock that one card | "yes, very important" |
| C | Money before the irreversible tap | You see the total with the fee ("You'd pay $107.50 all-in") before accepting; the button says "Accept & pay $107.50"; afterwards every screen shows the same box: "You paid $107.50 · Sam receives $100 · held until you approve". | M-5, M-6 | likely DONE | "yes, but remind me how it works" |
| D | Honest labels | Words never claim more than is true: no "paid" before the money is released; a worker with no reviews reads "New worker" instead of a fake or empty rating; every "next step" line comes from one rule so screens agree. | SIM-CONTRACT "Honest labels"; M-13, M-27 | PART (verify "New worker", "No reviews yet", every "paid") | "yes, but not sure what you mean; remind me" |
| E | Every feature has a visible door | Anything hidden behind a long-press or swipe also has a button you can see (a ••• menu or a More row). | M-10, M-11, M-22, M-29 | mostly DONE (Inbox •••, chat Report/Block) | (no comment) |
| F | Fewer steps, simpler | Fewer taps to finish things. The big one: signing up takes two required screens and five taps before Home. | M-19 | NEW (declined 2026-09-28; now back on the table) | "simplicity is key, backed by psychology" |
| G | One set of filters | Map, list and results share the same filters; distance is set in one place; Filters has a Cancel. | M-25 (LUX-LIST-64 #64) | DONE | "yes" |
| H | One vocabulary | "Bid" and "offer" mean the same thing on every screen, with the same button weight. | M-17 (#64) | DONE (verify on bid screens) | "yes" |
| I | Sign-up without a phone number | Ask for the phone only when it's first needed. Makes Create account fit one screen without squeezing. | M-30 | NEW (declined 2026-09-28; back on the table) | (no comment) |
| J | Questions before bidding | Workers can't message before being hired (a safety rule that stays). The screen says why and lets them add a question to their bid. | M-37 (#64) | DONE | "not sure; discuss later; remind me" |

Reminder duty: A, C, D and J must appear in `Parked:` until the operator decides them. For DONE
items, show what's live now ("This is already in your app, here's how it looks") and ask keep,
change or remove. Only NEW items need a proposed "after".

## 4. How to show a change (the visual recipe)

- **One board page per batch** (an Artifact), 3–4 cards. Each card: a 3–5 word title, ONE plain
  sentence, a status chip (Already live / New idea), and a phone that loops by itself.
- **The phone:** the REAL "Now" screenshot (PNG from §1) as the base. On top, an HTML/CSS layer
  draws the proposed change only where it differs, crossfading Now ↔ Proposed every 3 s, with a
  soft pulsing ring on the part that changes and a small "Now" or "Proposed" tag. For a flow
  (F, I): a row of step thumbnails with a tap counter, "Now: 5 taps" vs "Proposed: 3 taps",
  animated left to right.
- **Dark and light:** one switch at the top flips every phone. Light shots come from the app's
  light render, never guessed (light pills are filled tints).
- **Scaffold:** copy the phone frame, tokens and controls from
  `docs/mockups/html/refs/inbox-clean-list.html` (the same frame the operator approved). Put the
  PNGs in the artifact's `files`, not data URIs.
- **One look, then publish:** one screenshot of your own page at most, fix, publish, send the link.
  Keep all pages in `.shots/refresh/boards/`.
- **Taste check before publishing:** one mint accent; gold only for small labels and names;
  prices white; compact round pills; one line of copy; nothing that moves an approved layout.

## 5. The loop

1. Board → popup: for each card, Keep / Change / Remove (DONE) or Yes / No / Not now (NEW), plus
   "Explain again with a picture".
2. Record every answer the moment it's given in `docs/dispatch/LUX-LIST-3.md`, in the shape of
   `LUX-LIST-64.md`: confirmed items with exact numbers and references, then a `Parked` list.
   Record NEW design pictures the operator sends there too (number them; keep a numbered list;
   send the full list every 5 changes, and show only the new item in between).
3. Next board, until the list is empty or the operator stops.
4. When the operator says "go": build the confirmed items in the practice copy (HANDOFF recipes),
   render the real before → after of every changed screen in both modes, publish ONE "Proof"
   board, popup "Ship it?".
5. On "build it": apply `after.patch` to the app, run `.shots/refresh/buildit-lf.mjs` (the CRLF
   trap), `npm run verify` exit 0, commit by explicit path, push (its own Bash call), OTA
   `npm run update:preview`, rewrite HANDOFF, one mobile push.

## 6. Standing rules (from the operator; don't re-ask)

- References in the repo outrank pictures (pictures point at the problem). No invented data.
- Light mode gets every change; only colours differ. Colours now: mint `#4FC58C` (dark), light
  green `#0E6B52` with icons `#064C3B`; dark labels gold `#D4A24C`, light labels antique gold
  `#86641A`; prices white; error red `#D8604B` dark; Assigned gold `#E9C170`; In progress orange
  `#FF9046` (light: peach fill `#FBE2CA`, text `#9A4608`); Review work lavender `#B9A6FF`.
- Live dots: Sonar ring = alarm and the Home live bar; breathing dot = the Inbox tags.
- Everything feels 120 Hz; Reduce Motion gets a still or a short fade.
- Model and helpers: a session can't switch its own model (the operator uses `/model`). Subagents
  are blocked unless the session is launched with `BRAZOS_EVIDENCE` containing `subagents`.
- Guards: no `node -e`; no writes outside the project (the memory folder included); commit with
  `git commit -F`; `git push origin mainexpo` alone in its own call; no `cd` in parallel calls.
