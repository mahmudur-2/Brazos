# BUILD RUN — the one autonomous run (brief, 2026-09-30)

Written at the end of the DESIGN-LOOP-2 sitting from the operator's answers (`LUX-LIST-3.md` §7,
their words) and `docs/DECISIONS.md` 2026-09-30 entries (1)–(5). It starts ONLY on the operator's
word "build". Their pictures of it: `.shots/refresh/boards/v1-build.html` — panel 2 the steps,
panel 3 the plan, panel 4 repeat jobs. The operator's rule for the run, in their words: "rather
you look yourself.... and fix any mistakes / bugs....... then when its flawless you keep going
until finished" — no stop for them to look.

## 0. Before the first edit

- `git` on `mainexpo`; read `HANDOFF.md`'s first section.
- The session runs on Opus 5.5 at max effort and builds alone — no parallel builders.
- Helpers only if the session was launched with `BRAZOS_EVIDENCE` containing `subagents` (and
  `images`, which the self-look needs). Their plan, lean on tokens: after each group, one
  fresh-eyes review (Agent, model `opus`) given that group's diff and its spec, never your
  conclusions; before each ship, one review by model `fable` for smoothness and consistency —
  groups 0–4 before OTA 1, group 5 before the last ship. Helpers blocked: review yourself, say so.
- Docker Desktop was off at planning: start it, `supabase start`, then `npm run db:reset`,
  `npm run db:test` and `npm run verify` — all green before any edit.
- The practice copy must equal the app: `node docs/mockups/refresh/make-patch.mjs` gives an empty
  diff, or re-sync the practice copy from the app first (HANDOFF's 2026-09-27 primer §2–§3).
- `CLAUDE.md`'s invariants bind every item: money in integer cents through `formatBudget()`,
  `accept_offer()` the only assignment path, `transition_job_status()` the only status mover, no
  weakened RLS or grant, `revoke`/`grant` on every new SECURITY DEFINER function, no invented data.

## 1. The order, and where each spec lives

C and F: `DESIGN-LOOP-RECORD-2026-09-29.md` §2. Every numbered idea: its §3 entry. The drawn
reference: `.shots/refresh/boards/full-list.html`. Where §7 of `LUX-LIST-3.md` and the record
disagree, §7 wins.

- **Group 0, the feel.** (a) The Melt-through tab bar — `docs/dispatch/MELT-TAB-BAR.md`, whole;
  reference `.shots/refresh/navbar/handoff.html`. (b) The smoothness pass — the five shared
  motions onto the motion boundary (a `*.motion120.tsx` sibling through `resolveMotion120`, the
  current native-driver code kept as its twin, `tests/motion120.test.mjs`'s roster):
  `hooks/useSheetPresence.ts` with `ui/primitives/Sheet.tsx`, `hooks/useModalPresence.ts`,
  `hooks/useDropdownPresence.ts`, `hooks/usePressFeedback.ts`, `hooks/useEntrance.ts`; plus any
  animation the operator names as worst (§7); everything new in this run is built smooth-first;
  reduced motion gets a still or a short fade. Background: `docs/dispatch/MOTION-INVENTORY.md`.
- **Group 1, quick wins.** C · F · 10 · 4 (4 may reuse `components/UndoToast.tsx`).
- **Group 2, Post a job.** 23 (the run writes 2–4 questions per category) · 18 · 2 · 12.
- **Group 3, the server ones.** 5 · 7 (midnight to 6 am, OFF until switched on) · 6.
- **Group 4, the big ones.** 14 (`DECISIONS` 2026-09-30 (5)) · 8 → land, then OTA 1.
- **Group 5, the new-build ones.** 9 · 20 → land, then OTA 2 and the new Beta build.

Decided in this sitting:
- **8.** A short job number (an additive column, e.g. `BZ-0186`); the customer's and the worker's
  receipts as drawn (record §3). Sent from an edge function through an email service's HTTP API
  (no npm package); its key is a staging secret only the operator places; until it exists the
  send is skipped and logged. While testing it may go to the operator's own inbox; real customers
  need a domain.
- **9.** A Live Activities add-on (approved): choose one that works with Expo SDK 54 and the New
  Architecture. Its native module sits behind a presence check like `lib/motion120/vendor.ts`, so
  an OTA can never crash the current Beta binary. Live updates by push need Apple's push key on
  staging (operator-only); until then that path is off.
- **20.** The saved-card opt-in, off by default, at Checkout and in Payment methods (removable);
  `setup_future_usage` in `create-payment`; the off-session charge server-side on Confirm;
  notification actions through `expo-notifications`; a background add-on only if Confirm needs it
  (approved); a declined card sends a push that opens Checkout; the accept goes through
  `accept_offer()` and the payment through the Checkout path; the push then becomes 9's card.
- **Not in this run:** 1, Sign in with Apple.

## 2. Every change, the same loop

Test first → build in the practice copy → its checks (`tsc`; `node --test` minus safety and
governance; `npm run db:test` for server changes) → render dark and light (`export.mjs after`,
`prepare.mjs after`, `validate.mjs`, `.shots/refresh/shot.mjs`) → read the PNGs against the
drawing → fix until nothing is wrong → land it as its own commit (`make-patch.mjs`, `git apply
--ignore-whitespace`, `.shots/refresh/buildit-lf.mjs`, the narrow check, commit by explicit path).
If `make-patch.mjs`'s ROOTS lack a folder a change needs (such as `supabase/`), add it first. Last,
before each ship: every screen rendered again and compared with the previous After, so nothing
moved by accident.

## 3. Shipping

- **After group 4:** `npm run verify` exit 0 → `git push origin mainexpo` in its own call → wait
  for that push's `.github/workflows/staging.yml` run (verify, migrate, deploy) to finish green →
  `npm run update:preview` (OTA 1). A red pipeline means no OTA: stop and report.
- **After group 5:** the same, OTA 2, then `npx eas-cli@latest build --platform ios --profile
  preview --non-interactive` — the Beta's profile, internal distribution; the operator installs it
  from the link.
- Then rewrite `HANDOFF.md`, then ONE mobile push: what finished, whether verification passed,
  the install link.

## 4. Stops, and what is not one

Stop only for: a dependency beyond the two approved above, a migration that drops or renames,
SQL against a remote database, production, `.env`, `start.ps1` or the frozen web surface, a
fence whose logic would have to weaken, a hook or deny collision. NOT a stop: what only the phone
can show (pushes, haptics, the lock screen, the melt feel) — report it "landed, unverified" for
the operator's walk.

## 5. After the run, the operator

Install the new Beta; open it twice for the OTA; walk it in both appearances; place the email
service's key and Apple's push key on staging (the run's report gives the exact steps).
