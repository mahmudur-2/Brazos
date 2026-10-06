# Handover — the Emerald Lux Glass pages (written 2026-09-21, for the next chat)

> **STATE AFTER THE DRAWING RUN (2026-09-21, later the same day): ALL 67 SCREENS ARE
> DRAWN.** Batches 1 and 2 were approved by the operator ("Yes, all of them"); batches
> 3–6 were drawn under their standing instruction to build every batch without pausing
> ("Build all of the batches til 6, without my permission … just NO IMPLEMENTATION IN
> THE ACTUAL REPO") and await their review. `docs/mockups/html/lux/index.html` opens
> every page; `SCREENS.md` is fully ticked with each batch's notes; the review sheets
> are `.shots/mockups/lux-sheet-b<batch>-<n>.png` (gitignored, on the operator's
> machine). What the next chat does: read the operator's changes per screen, remake
> only those (the loop below, step 3), then ask "plan the rebuild, or park it?" —
> applying anything is a NEW plan (tokens → primitives → screens). Fable was NOT used:
> the operator asked for it to be reserved for hard accuracy or layout calls, and none
> arose; the seven pastes below remain optional. Two rulings are theirs on return:
> whether the auth flow (batch 6) keeps its own emerald/ivory palette or takes Lux,
> and whether the reviews and worker-profile pages should show a populated (sample)
> reputation — they are drawn with none, by the README's honesty rule.

Read this, then `docs/mockups/html/lux/README.md` (the system) and
`docs/mockups/html/lux/SCREENS.md` (the checklist). Machine state is git's — this
was written at the end of the sitting that landed the eighteen-item run
(`3a6f461`) and chose direction B; check `git log` first.

## What the operator asked for, in their words

"I really like B … show me how every screen would look if I implemented B Emerald
Lux Glass. Keep in mind I want all of the features as they are currently, just if
there was a better way to lay it out — cleaner, subtler, luxury. I wanna see how
every single screen would look. Make me an HTML for every single current screen.
But don't implement any — I wanna see how they look first."

So: **pages only, no app code**, until every screen has been seen and approved.
Then a rebuild plan (tokens → primitives → screens, measured against these pages).

## How to work (the operator's standing rules, from this and earlier sittings)

- Concise. Plain English. Lead with what they will SEE. Ask the important
  question first (`AskUserQuestion`, a "(Recommended)" first option); read any
  free text they type into the answer.
- Options before code; renders before prose. They pick from pictures. Every render
  must be honest to the phone (README's honesty rules), labelled inside the frame.
- One batch per round: draw the batch (`SCREENS.md`), shoot, measure (no overflow,
  nothing wider than the frame but the rails), send a sheet (3–4 phones across,
  captions inside) with `SendUserFile` AND the `file:///` paths, tick the rows.
- Nothing is applied. If they say "apply", that is a new plan: tokens first.
- End of every run: commit by explicit path, `git push origin mainexpo` alone after
  `npm run verify` is green, ONE push notification, HANDOFF.md rewritten last.

## The review loop — autonomous, one question at a time (the operator's ask, 2026-09-21)

Run batch by batch without waiting to be told:

1. Draw the batch (`SCREENS.md`), measure, send the sheets.
2. `AskUserQuestion`: **"Happy with these?"** — options: "Yes, all of them (Recommended)",
   "Changes" (they type what, per screen — read the free text), "No — redo the batch".
3. Remake only what they flagged, send again, ask again, until "yes".
4. `AskUserQuestion`: **"Move to batch N+1?"** — "Yes (Recommended)" / "Pause here". On yes, go
   straight to step 1 for the next batch. Tick the rows in `SCREENS.md` as each batch is
   approved; commit by path and push at the end of every batch (docs only).
5. After batch 6: **"Seen all 67 — plan the rebuild, or park it?"** Applying anything is a
   NEW plan (tokens → primitives → screens), never a step of this loop.

One question per round. Nothing is applied to the app at any point.

## Models (the operator's settings, 2026-09-21)

- **This loop runs on Opus 5 at effort max.** Ultracode (multi-agent) is NOT available on
  this machine — the guard refuses the Agent tool — and one hand drawing every page is
  what keeps a design system consistent, so Opus max is the best there is here.
- **The Fable comparison set — exactly seven screens, no more.** The operator wants to see
  whether **Fable 5.1** (model id `claude-fable-5-1` — 5.1 specifically, never "Fable 5"
  or any other model) at **effort xhigh ("extra"), not max**, draws the customers' most-
  seen screens better than Opus. It must NOT run in this chat (the second model would
  copy the first's page from context — no fair comparison); it runs in its own chat, one
  paste per screen, fresh each time.

  The seven: **home** (Customer Home), **post-review** (Post a job · Review and publish),
  **compare** (Compare bids), **cjob** (the client's job detail), **chat** (Chat),
  **checkout** (Checkout), **review-tip** (Review and tip).

  What THIS chat does when it draws one of the seven: draw its own page as usual, then
  hand the operator this paste (fill in the key) —

  > Model: Fable 5.1 (`claude-fable-5-1`), effort xhigh. Read
  > `docs/dispatch/LUX-HANDOVER.md`, `docs/mockups/html/lux/README.md` and the screen's
  > source named in `SCREENS.md`. Draw ONLY the screen `<key>` as a Lux page, every control
  > kept, into `docs/mockups/html/lux/lux-<key>-fable.html` (a render function in
  > `lux.build.mjs` named `<key>_fable`, data-shot `lux-<key>-fable`). Do not open
  > `lux-<key>.html`. Shoot it, measure it, send the PNG. Draw nothing else.

  When the Fable page exists, this chat puts the two on ONE sheet (Opus | Fable, captions
  inside, `.shots/mockups/lux-<key>-vs.png`) and asks which reads better. The answer is
  recorded in `SCREENS.md`'s row; the loop itself never leaves Opus, and Fable never
  draws an eighth screen unless the operator names it.

## The build loop, exactly

```
node docs/mockups/html/lux/lux.build.mjs <key>[,<key>…]     # one HTML per screen
node docs/mockups/html/shoot.mjs lux/lux-<key>.html         # → .shots/mockups/lux-<key>.png (2x)
```
The measurement pattern is `.shots/harness-blur/redesign/measure.mjs` (gitignored;
re-create if gone: Playwright, per `.phone` — the body's last child's bottom
against the nav's / sticky bar's top; elements wider than the frame). The
side-by-side with the LIVE screen comes from the harness target named in
`SCREENS.md` (`node scripts/shots.mjs --only <target>`; the export under
`.shots/web` is reused, `--build` refreshes it) — put both on one sheet when it
helps the operator see what moved.

Each screen's controls come from its SOURCE (`screens/<Name>Screen.tsx` and the
components it renders); list them before drawing, keep every one. The copy is
the app's, verbatim. The only invented rows are the harness's four seeded jobs
and the mockup's sample detail job (`lux.build.mjs` JOBS / DETAIL).

## Tooling facts (this machine)

- Guards: image `Read`s refused (measure with Playwright / pngjs, never look);
  the Agent tool refused; `Write` outside the project refused (the plan file, the
  memory dir); `node -e` refused; the word "Claude" cannot appear in a shell
  command — commit with `git commit -q -F <file>` (the trailer lives in the file);
  the push is exactly `git push origin mainexpo`, alone.
- Bash heredocs collapse `\\` to `\` — any script with a backslash goes through
  the Write tool. `.shots/harness-blur/patchlib.mjs` is the CR-aware exact-match
  patch helper (CRLF files: `docs/DECISIONS.md`, `lib/time.ts`, `lib/hotspots.ts`).
- pngjs is in node_modules (transitive) and fine for gitignored measurement
  scripts; a TRACKED script uses the repo's own codec (`tests/pngGeometry.mjs`
  decode, `scripts/atmosphere-tune.mjs` encodePng, `scripts/home-ground-blend.mjs`
  resample) — `lux.build.mjs` does, for the toolbox art.

## Where the previous sitting left the app

- The app is at the eighteen-item run (`HANDOFF.md`; DECISIONS 2026-09-20 sitting
  3, (13)); its OTA is live and NOT yet walked by the operator — ask what they saw
  if they bring it up, but the Lux pages are the task.
- The three direction concept pages that decided B are gitignored scratch
  (`.shots/harness-blur/redesign/`); the five B screens were ported into
  `lux.build.mjs` as `home`, `whome`, `jobs`, `detail`, `profile` — the next
  screens follow their pattern.
- The dark rebuild's earlier token-level directions (a–e, real renders through the
  harness's `--design` seed) are `docs/mockups/directions/`; superseded by B for
  the look, but the seed (`scripts/shots.mjs --design <file> --suffix .x`) is how
  a candidate token table renders as real screens later, when B is applied.
