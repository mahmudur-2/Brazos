# DESIGN LOOP 2 — how to run the next BRAZOS design session (read this first, all of it)

Written 2026-09-30 for a fresh session, at the end of the 2026-09-29/30 sitting. Short on purpose.
Everything you need is here, in `DESIGN-LOOP-RECORD-2026-09-29.md` (the checked record of that
sitting) and in `LUX-LIST-3.md` (the operator's exact words). Do NOT read other big files to "get
context". Git owns the live state; check it.

## 0. The operator — work this way or it fails

- ADHD, writes no code, reads on a phone, a VISUAL learner. Words do not land; pictures and short
  animations do. Show, don't tell. Every change is a live before → after on the REAL screen.
- One thing at a time. At most 6 short lines of text per reply, plain words, no jargon, no audit ids,
  no file paths unless asked. Start every reply with one line: `Where we are: …`. End every reply with
  one line: `Parked: …`.
- Questions are tap-to-answer popups (AskUserQuestion), 2–4 options, recommended first, at most 3 per
  popup. When the operator dismisses a popup ("do not proceed, wait"), STOP and wait; they will type.
  They often type their answer in chat with a marked-up screenshot instead of tapping — treat that as
  the answer, quote it exactly in the record, and act on it in the same turn.
- Their last word wins, even over an earlier tap (23 went 3 → 2 that way). "Get rid of this" / "remove
  this scratch" means drop it, no debate. When they say a thing was ignored, fix it first, without
  excuses, then move on.
- Nothing is confirmed until they tap or type it. Record every answer the moment it is given, in
  `LUX-LIST-3.md` §7, in their words.
- Be honest about what is real: the app screens are real screenshots; anything the app cannot show
  (a lock screen, a push, an email, the live card) is DRAWN, and a push must be drawn the way a phone
  shows it (light frosted banner, the app icon, plain stacked actions), never in the app's colours.
- Budget: fast and cheap. Narrow greps, one render per page, no screenshot loops.

## 1. Where things stand

- The app is `c508b09` + docs commits. NOTHING from the sitting is built, applied or sent OTA. The
  standing rule (popup 5): nothing is built until the operator says "build" in so many words.
- Decided: A, B, D, E, G, H, J kept; I closed (phone stays at sign-up); C and F are changes to build.
  Fourteen ideas picked with their final specs; 3, 25 and the Dynamic Island scene dropped; 21 closed;
  11, 13, 15, 16, 17, 19, 22, 24 not picked. All of it, checked, in `DESIGN-LOOP-RECORD-2026-09-29.md`.
- The working surface is ONE local file, `.shots/refresh/boards/full-list.html` (gitignored), built
  from `full-list.tpl.html` by `node inline.mjs full-list.tpl.html full-list.html` (run in that
  folder). Every decision, today beside the change playing, on the real screens. The operator reviews
  it and sends "what's wrong" items; items 1–7 are done; item 8 onwards is awaited.
- Open questions, in priority: (1) the receipt — Brazos's own email (their last words) or the
  provider's receipt with the job number (their earlier tap); (2) the new dependencies to flag before
  anything is added: Apple sign-in, a Live Activities add-on, an email service; (3) how the phone is
  collected after an Apple sign-in; (4) idea 7's default and hours; (5) idea 14 needs a DECISIONS
  entry (outside SCOPE v1).

## 2. Your first 10 minutes

1. `git log --oneline -3`; read `HANDOFF.md`'s first section only; read
   `DESIGN-LOOP-RECORD-2026-09-29.md` §3–§5.
2. Do NOT rebuild anything. Reply with `Where we are: …`, then one popup: "Next item on your list?"
   with two options (type it / that was all). If the operator dismisses it, wait.
3. For each "what's wrong" item: fix it in `full-list.tpl.html` (and in the matching board only if
   cheap), rebuild, render the changed phone once with `look.mjs`, read the PNG, send the file with
   `SendUserFile` (display render), record the item in `LUX-LIST-3.md` §7, one line of reply, popup.
4. When the list is done: ask the receipt question (§1 open question 1), then the dependency flags,
   then stop. Do not ask what is already decided.
5. Only on "build" (their word): the recipe in `DESIGN-LOOP.md` §5 steps 4–5 and `HANDOFF.md`'s
   BUILD IT section (practice copy → after.patch → `buildit-lf.mjs` → `npm run verify` → commit by
   path → push → `npm run update:preview` → HANDOFF → one mobile push). Build C and F first; the ideas
   in the order the operator names.

## 3. The pending list (compact; the record has the detail)

To build on "build": C (Accept & pay $TOTAL on the confirm button) · F (Terms + Privacy in one
scroll) · 2 Reuse a past job (the + sheet row, closed; compact cards ~2.5 across) · 4 Undo ·
5 Running late chips · 6 Tomorrow's reminder push · 7 Quiet hours row · 8 the receipt (customer +
worker; which sender is open) · 9 the lock-screen live card · 10 money moments · 12 Need it today ·
14 Repeat jobs (DECISIONS entry first) · 18 two mics · 20 hire from the push in place + saved-card
opt-in (Checkout and Payment methods) → the live card · 23 tiles + plain-row dropdown + auto-scroll ·
1 Sign in with Apple (dependency + the phone question). Nothing else.

## 4. Recipes and traps (learned the hard way)

- Shots: `.shots/refresh/shots/after-{dark,light}-<id>.png` are the app (786×1704 = 393×852 @2x); the
  `.txt` beside each is an element map in 1x CSS px (`top x left w×h text {style}`) — place overlays
  from it without opening the PNG. Sample exact colours with `boards/sample2.mjs <shot> <x> <y>…`
  (2x px).
- Render a board from disk: `cd .shots/refresh/boards && node look.mjs <page>.html "<selector>@<nth>"…`
  (each argument is a forced click; pause a demo first via its Pause button, then click its `.screen`
  to step); it writes `_look-<page>.png` and `_look-<page>-phoneN.png` and prints page errors. The
  app's browser pane cannot open these pages (it shows a data: snapshot without relative images, and
  refuses a 3.7 MB file); the published artifact needs a claude.ai sign-in the pane does not have.
  So: render with playwright, read the PNG.
- The full list inlines everything: `inline.mjs` turns every `data-id="<shot id>"` into a JPEG data
  URI map (1x, quality 80, via `jimp-compact`) and embeds `fonts/Ionicons.ttf` (the app's own icon
  font; codepoints from `node_modules/@expo/vector-icons/.../glyphmaps/Ionicons.json`).
- Guards that bite: no `node -e`, no `python -c` (GUARD-DYNEXEC); a command line containing the word
  "claude" is blocked (GUARD-NESTED-CLAUDE) — put commit messages in a file and `git commit -F` it;
  `git push origin mainexpo` alone, exact, in its own call (PowerShell's cwd is the project root,
  Bash's cwd drifts: never `cd` in a parallel call, use absolute paths); no writes outside the project
  (use `.shots/refresh/boards/` for scratch); a `cd` in one of several parallel Bash calls breaks the
  others.
- AskUserQuestion: an option's label comes back, not the notes typed beside it; only "Other" free
  text comes back whole. When the operator says "I'll type it", end the turn and wait.
- The artifact tool's `root` must be absolute (Bash's cwd is not the tool's); `files` keys are the
  paths the HTML references; a font goes through `files` with `contentType: "font/ttf"`.
- `npm run verify` is 40 s and green at `953de5f`; run it before any push, in the same run.

## 5. Do not

- Do not build, apply, or OTA anything without the word "build". Do not re-ask decided items. Do not
  publish artifacts unless asked (the operator said "don't make artifacts, just make html file"). Do
  not draw a push, an email or a lock screen in the app's colours. Do not claim a drawing is the app.
