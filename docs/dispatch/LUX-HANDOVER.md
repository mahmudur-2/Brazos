# Handover — the Emerald Lux Glass pages (written 2026-09-21, for the next chat)

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

## The loop, exactly

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
