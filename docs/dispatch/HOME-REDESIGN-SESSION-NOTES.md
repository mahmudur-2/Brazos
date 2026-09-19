# Customer Home redesign — session notes, 2026-09-17 → 2026-09-18

Written for the next chat or session. Everything below was read from the repository or
decided by the operator in this session; nothing is from memory. Machine state (branch,
HEAD, tree) is git's — the values here were true when written, check them with `git`.

---

## 1. Where things stand (written at HEAD `c428c41`, pushed, tree clean except HANDOFF.md)

Trunk `mainexpo` moved from `99c79e4` to `c428c41` tonight — twelve commits, all pushed.
The customer Home is redesigned and live on trunk. **Whether it has been sent to the Beta
phone is unconfirmed** — the OTA line was given but not seen run. If in doubt:

```
cd C:\Users\mdmah\BRAZOS; npm run update:preview -- --message "home redesign, complete"
```
then launch the Beta app, force-quit, launch again (the second launch shows it).

### What the customer Home looks like now, top to bottom
1. Greeting — unchanged (live values: two sans lines, 18/500, name gold in dark / emerald in light).
2. **"Switch to Worker" pill — STILL THERE.** Its removal is the next run (§5).
3. Hero — unchanged (Georgia 33/40, the armchair art 184×162).
4. Sub-copy — now two lines: "Describe it. Hire help." / "Get it handled."
5. **The task card** — replaced the standalone search bar AND the "FASTEST WAY TO START"
   promo card. Title "What do you need done?"; the search field (44pt, radius 17, real mic,
   **magnifier as the submit** in place of the gold arrow; ring `secondaryBorder`, fill
   mint in dark / white in light); the live "Post a job ›" pill, unchanged, moved inside.
   Dark card is lit: `#15362B` → `#0B2019`, edge `#27473A` (tokens `taskCardLitTop/Bottom/Edge`).
6. **"Popular services"** — one horizontal sliding row of **25 square tiles** (the 6 quick
   services, then the 18 specific ones, **Other last**), short tile labels defined once in
   `lib/skillCategories.ts`, shared component on **both** Homes (Worker Home has it too,
   unheaded). Four tiles visible, the fifth cut in half.
7. The "needs your attention" block — unchanged, shown only when non-empty.
8. **"Your jobs"** — replaced "Nearby" (Nearby stays on Discover). 3 most recent posted jobs,
   any status, existing card, "View all" → My Jobs. Empty: "No jobs have been posted yet".
9. Bottom bar — unchanged except **the dark [+] is now green** (the Post-a-job pill's own
   recipe, cream plus, no ring). Light [+] untouched (emerald, gold ring).

### Tonight's commits and their one-command reverts
| Change | Commit | Revert |
|---|---|---|
| Dark [+] green | `27adc77` | `git revert 27adc77` |
| "Your jobs" replaces Nearby | `a1e2c81` | `git revert a1e2c81` |
| Sub-copy two lines | `e205714` | `git revert e205714` |
| Service tile row (both Homes) | `753d71b` | `git revert 753d71b` |
| Task card replaces bar + promo card | `6e453fb` | `git revert 6e453fb` |
| Field ring/fill fix + trailing cluster | `c428c41` | `git revert c428c41` |

Docs commits between them: `f2eed5f` (mockup), `8666ad7`, `9f70156`, `de5fa03`, `86b0913`,
`75cb5f7`. After any revert: the OTA line again.

`npm run verify` was green at every commit: 1361 pass, 0 fail.

---

## 2. The mockup files (`docs/mockups/html/`)

| File | What | Tracked? |
|---|---|---|
| `home-redesign.html` | The Home mockup, dark + light side by side at 393×852, built as a spec: colours as CSS variables named after `ui/tokens.ts` keys, a table of every mockup-vs-app difference. The three prestige assets are embedded. | yes (`f2eed5f`) |
| `create-sheet.html` | The [+] popup as layouts: 1 tiles · 2 list · 2g glass · 2c centered · 3 hero card, over the REAL dark Home render. | **no — untracked** |
| `glass-sheet.html` | The [+] popup as **nine glass treatments** (G1–G8 dark, G1 in light), generated from `glass-sheet.build.mjs`. | **no — untracked** |
| `embed-assets.mjs` | Re-embeds the prestige PNGs into home-redesign.html after an edit. | yes |
| `embed-backdrop.mjs` / `embed-backdrop-glass.mjs` | Embed `.shots/customer-home-{dark,light}.png` into the two sheet files as backdrops. | no |
| `serve.mjs` | `node docs/mockups/html/serve.mjs` → http://127.0.0.1:4173/<file> | yes |

To view: double-click the html in Explorer, or serve it. **The desktop app's preview pane
cannot render glass-sheet.html** (nine blur layers) — use a real browser tab. The four
untracked files should be committed (docs only) before the next run so its tree is clean.

Reference images: `design-reference/home-redesign-mockup.png` (cream) and
`design-reference/home-redesign-dark-reference.png` (dark) — the same composition in two
palettes, 851×1848. `design-reference/` is read-only to runs.

---

## 3. The [+] popup — DECIDED, and BUILT 2026-09-18 in a chat session (`830a6e3`; light = L2 Frost, dark scrim stays 0.55; HANDOFF.md and docs/DECISIONS.md 2026-09-18 are the record — the rest of this section is the plan as it stood)

The operator chose **G1 "Clear"** from glass-sheet.html: the most see-through — dark
scrim at 40%, heavy blur, a thin white rim, a 1pt bright top edge, nothing else.

**Rows, fixed, in this order:**
1. **Needs you** — contextual card, shown only when a job is waiting on the customer. Uses
   the FIRST item of `attentionItems()` (`lib/homeAttention.ts`): the job's title, its
   category icon, and the item's existing next-action `line`. Tap →
   `navigateAcrossTabs('MyJobs', 'ClientJobDetail', { job })` (what the Home attention card does).
2. **Post a job** — first action, heavier; green glass circle glyph. → `navigateAcrossTabs('Home', 'PostJob')` (unchanged).
3. **Hire again** — relabelled from "Hire someone again". → SavedWorkers (unchanged).
4. **My jobs** — **label must stay exactly "My jobs"** (see E2E below). → MyJobs (unchanged).
5. **Switch to Worker** — set apart at the bottom with the hint "confirms first". Calls the
   same `switchMode('worker')` the Home pill calls (`modes/ModeProvider.tsx`; the confirm
   lives inside switchMode). Sheet closes first.

**Also in that run:** remove the "Switch to Worker" pill from the **customer** Home
(`screens/HomeScreen.tsx` modeSwitch + its dial `home.modeSwitch.paddingX`).
**Worker Home is NOT touched** — its pill stays (operator: "don't do anything in worker page").

**Theme:** glass in dark only. Light = the app's ordinary flat white sheet with a hairline,
same layout (frame "G1 in light"). The operator has not yet said whether light should be
frosted too — ask, or default to flat.

**E2E constraints (must hold):** `.maestro/money-walk.yml` taps **"Create"** (the [+]'s
accessibility label), waits for a title matching `.*What do you need\?.*`, then taps
**"My jobs"** by exact label — twice in the walk. `.maestro/sign-in.yml` waits for "Post a
job" on Home (HOME_MARK). No flow taps "Switch to Worker". Flows are never edited by a run.

**Implementation facts, verified:**
- Today's sheet: `components/ActionSheet.tsx` (title/subtitle/items with icon), also used by
  ChatScreen, MessagesInboxScreen, ProfileScreen — so the redesign is a NEW component for
  the create sheet (suggested `components/CreateSheet.tsx`), not an edit of ActionSheet.
  It is mounted from `navigation/CustomerRoot.tsx` (title "What do you need?", three rows).
- Glass material: `ui/primitives/Surface.tsx` with `material="sheet"` =
  `materials.sheet` in `ui/tokens.ts` (blur 40, scrim `#071B15` at 0.72, mint border 0.16,
  radius 28 top). G1 needs its OWN material entry (scrim ~0.40, rim cream/white ~0.14, plus
  a 1pt top highlight view) so the other sheets don't move. Light branch of Surface is
  flat `colors.surface` — leave it.
- The Needs-you data needs `useMyJobsHub()` rows; the sheet is mounted in the navigator,
  so mount the hook inside the sheet component (fetches on open; card absent until ready
  or when nothing is waiting; the rows never wait on it).
- Fences that will move: `tests/customerCore.test.mjs`, `tests/emeraldFences.test.mjs`
  (home(17) mode-switch ring, home(19) no mode-conditional layout, the H2 greeting/pill
  test), `tests/payouts.test.mjs` (references the pill text — read it), `tests/mode.test.mjs`,
  `tests/crossTabNavigation.test.mjs`, `tests/screenDials.test.mjs` (delete the
  `home.modeSwitch.paddingX` dial per the registry's own charter).

**Ideas the operator declined for the popup (do not add):** Finish your draft, Find a
worker, Help/support row. Everything else (repeat a job, invite a friend) is backlog.

---

## 4. How runs are dispatched here — what tripped us, so it doesn't again

- Prompt files live in `docs/dispatch/<name>.md`. Tonight's: `home-plus-and-your-jobs.md`,
  `home-slider-and-subcopy.md`, `home-task-card.md` (all committed) — copy their shape.
- Checker: `powershell -ExecutionPolicy Bypass -File C:\Users\mdmah\runs\preflight.ps1 -Prompt C:\Users\mdmah\BRAZOS\docs\dispatch\<name>.md`
- Launch — **absolute paths, or `cd` into the repo first** (the relative form fails from the home folder):
  `cd C:\Users\mdmah\BRAZOS; powershell -ExecutionPolicy Bypass -File C:\Users\mdmah\BRAZOS\scripts\dispatch\dispatch.ps1 -Prompt C:\Users\mdmah\BRAZOS\docs\dispatch\<name>.md -Model claude-opus-5 -Effort max`
- **STALLED after 90 s is a false alarm.** In print mode the agent's output is held until
  the end, so the log the launcher watches stays empty. The launcher does NOT kill the run.
  The real heartbeat is the session transcript: newest `.jsonl` under
  `%USERPROFILE%\.claude\projects\C--Users-mdmah-BRAZOS\`; count its tool calls twice a
  minute apart — rising means working. (Worth a small launcher fix; not done.)
- Runs took 32–36 minutes each; reports land in `.audit-scratch\dispatch\<name>-<stamp>.log`;
  renders in `.shots/<run-folder>/`.
- Guard rules that bite: the token `claude` anywhere in a shell command (so commit messages
  go by file: `git commit -F`); `git push origin mainexpo` must be bare — even `2>&1` after
  it is refused; `git checkout/switch/branch/restore/stash/reset` all denied — runs cannot
  make branches; the plan-mode plan file (`~\.claude\plans\…`) is unwritable here, so
  plan mode always shows "no plan yet" — harmless.
- Runs cannot open images (evidence guard). They measure PNGs with `tests/pngGeometry.mjs`
  and `scripts/master-diff.mjs`. In a chat session, the operator pasting a screenshot is the
  way to give Claude eyes; the desktop browser pane can screenshot served HTML.
- `lib/theme.ts` is the palette screens import, and it did NOT expose `secondaryBorder`
  until `c428c41` — a token missing there resolves to `undefined` silently. Check the
  palette before using a `ui/tokens.ts` key from a screen.

---

## 5. Next steps, in order

1. **Confirm on the phone** (OTA above) — nobody has seen the redesign on a device yet.
   Specifically: the mic inside the 44pt field and voice search from it; the tile row's
   snap and the faint dark tiles; "Your jobs" with real jobs.
2. **The [+] popup run** (§3): write `docs/dispatch/home-create-sheet.md`, one code commit
   + docs, revertible with one command. Decide light first (flat vs frosted).
3. Commit the four untracked mockup files (docs).
4. Cleanup run, no visible change: two orphaned tokens (`navBar.gold`, `navBar.glyphColorDark`)
   and two stale studio rows (`create.border`, `create.glowColor`); the launcher's STALLED
   check pointed at the transcript.
5. **Still open and not started: the money bug** — the worker's take (`$92.50`) shows as
   the job price (`$100`) on worker-perspective cards in `screens/MyJobsHubScreen.tsx`.
   Fix shape: add `amount_cents` + `platform_fee_cents` to `PaymentStatusSummary`
   (`lib/payments.ts`) and use `workerTakeCents()` on worker cards. The other two money
   bugs in `docs/BACKLOG.md` were already fixed by earlier runs (the payouts_enabled gate;
   the auto-release "told" gate) — strike them.
6. Deferred by the operator: the external clocks (domain, Stripe live activation,
   LLC/EIN/bank), the Worker Home pill, the remaining Gate 3 boxes.

---

## 6. Dated taste decisions made tonight (already in `docs/DECISIONS.md` by the runs)
- 2026-09-17: dark [+] green (reverses 2026-09-08 gold); Nearby leaves customer Home,
  "Your jobs" takes its slot; sub-copy two lines; the 25-tile service row on both Homes.
- 2026-09-18: the task card replaces the search bar and the promo card; the order ruling of
  2026-09-05 (4) amended (tile row between the card and the attention block).
- Not yet recorded (belongs to the popup run): G1 glass popup, rows as in §3, customer pill removed.
