## 2026-08-19 — Emerald correction pass: COMPLETE, and INDEPENDENTLY VERIFIED

**Now on `origin/mainexpo` (`fbb6be9`).** The previous handoff's "nothing is
pushed" no longer holds; `git` is the authority and says the seventeen
`emerald(N)` / `audit(N)` commits are on the remote.

### The verification, first

A second run audited the eleven emerald commits before they could be pushed. It
did not make them and did not read the chat log that produced them: every
verdict is derived from `git log`, `git diff` and the source at HEAD. Its record
is **`docs/audits/EMERALD_VERIFICATION_2026-08-19.md`**, and its summary is the
**"Verification 2026-08-19"** section of `docs/mockups/PRESTIGE_RUN_REPORT.md`.

**Verdict: SAFE TO PUSH.** No cross-run contradiction, no functional breakage,
no source file repaired. Six regression fences (`tests/emeraldFences.test.mjs`),
each proved red by mutation before it was kept. Floor **775 → 781 pass**.

**Three things it found that the pass's own record does not say plainly:**

1. **emerald(2) ADDED a painted layer; it did not remove one.** D2 as worded
   asks for every layer behind the tab pill to be transparent. Nothing of ours
   was painting — the band was the iOS root view showing through a MISSING
   ground — so the fix is a NEW `backgroundColor: palette.background` on
   `navigation/ModeShell.tsx`. That is the opposite of the instruction, it is
   correct, and **it is not in the six-reversal list below.** A run that reads
   D2 literally and deletes that View brings the white band straight back. Two
   suites now go red if it does.
2. **Two currency figures DID change colour**, so "money colour was not touched
   at all" is PARTIAL rather than absolute. Both are selection chips whose LABEL
   is an amount, and only in the selected dark state: `ReviewAndTipScreen`'s tip
   presets and `JobFilterSheet`'s budget chips took D6's gold. Every money
   surface in a money role is byte-identical.
3. **`lib/navigation.ts`'s stale block comment** describing the pre-emerald(1)
   customer bar. **Cleared by `home(10)`** — see above.

### The correction pass itself

**No SQL executed, no database contacted, no `.claude/` file modified, no `.env`
read, no dependency added or mutated, no frozen web surface touched, `app.json`
untouched, `package.json` untouched, `lib/authTheme.ts` untouched, no image
asset added.** The audit re-derived every one of those mechanically.

A second dark-mode pass on a physical iPhone produced 38 screenshots. That run
fixed what they show plus five direct operator instructions, and it was **not** a
paint-only run: two of the eleven commits changed structure (the customer tab
bar, the profile store), and three of the reported "paint" defects turned out to
have non-paint causes.

**The locked-screen set is EMPTY.** `CLAUDE.md` says so, and
`.claude/hooks/guard.ps1` agrees mechanically — its `GUARD-PATH-LOCKED` rule
sits inside `if ($false)` and can never fire. *(Two housekeeping notes for
whoever owns those files: the `$locked` array in the guard is now dead code that
still reads as live, and `CLAUDE.md`'s locked section ends with a dangling
`screens/BrowseJobsScreen.tsx` after the sentence that unlocks everything.)*

### Seven reversals a later run must not "correct"

1. **Map → Discover on the customer bar**, reversing manifest B-2. Label, glyph
   AND destination. The worker bar keeps Map.
2. **My Jobs left the customer bar.** The ROUTE stays registered — removing it
   would break the [ + ] sheet and all notification routing.
3. **The emerald/red toggle is retired.** Neutral track in both states; the knob
   carries the state. Red is not an error state for "not taking new work".
4. **Nav glyphs went 29 → 28** under a heading that says "LARGER". The explicit
   number won; the direction is on the record.
5. **`layout.floatingNavClearance` is deleted** as a token; a test fails if a
   static clearance token returns. *(`home(7)` narrowed WHO takes the derived
   replacement — scrolling surfaces, never pinned footers — without retiring the
   hook.)*
6. **All seven modal scrims went 0.7 → 0.55 in dark**, the filter sheet
   included — it was one of the seven identical copies, not the reference the
   others differed from.
7. **The ground behind the floating pill is PAINTED, not transparent.** D2's
   wording asks for the opposite; nothing of ours was painting and the white band
   was the iOS root view showing through a missing ground, so
   `navigation/ModeShell.tsx` gained a `backgroundColor: palette.background`.
   `tests/layout.test.mjs` and `tests/emeraldFences.test.mjs` both go red if you
   delete it.

### Frozen — as re-checked by the audit, which widened the check

The nav active tint is still `palette.emerald`. The verification badge is still
absent from every user-visible surface. Saturated per-category tile fills are
still retired in dark across all seven consumers. The centre [ + ] survives,
dead centre of five slots *(and is now filled gold in dark — see reversal 8)*.
Master 34's inbox search, master 46's compare grid and its "best fit" ribbon
remain unbuilt. No marketplace data was invented and no user-facing copy changed.

**Money is the one freeze that is PARTIAL.** All six dedicated money surfaces are
byte-identical and the five money-bearing detail screens took padding-only
edits — but two SELECTION CHIPS whose labels are amounts took D6's gold in their
selected dark state (`ReviewAndTipScreen`'s tip presets, `JobFilterSheet`'s
budget chips). No payment-state label moved and no CLAUDE.md money invariant is
affected. `MoneyText`'s colour rule is pinned by a test.

### Held by a test, versus held only by human review

**A test goes red if a future run reverts any of these:** the customer bar's
five-slot composition and the absence of a My Jobs item; My Jobs reachability
and every cross-tab dispatch target in both trees; Discover's label, glyph AND
destination; the hide-without-unregister mechanism; the ground behind the pill;
the state-blind toggle track and the single availability store; all seven
scrims; the selection and disabled helpers; the derived clearance, the deleted
static token and (new) the pinned-footer split; the nav glyph sizing;
`MoneyText`'s colour rule; the retired per-category fill; the absent
verification badge; `authTheme` and `CountryPicker`; the raw-literal scan; plus
everything `home(1)`–`home(9)` added, listed above.

**Nothing offline can reach these:** the band's rendered result on a real
iPhone; MapKit re-rasterisation across a live OS theme flip; anything reading a
runtime safe-area inset — which now includes BOTH the scroll clearance under the
pill AND the atmosphere layer's inset pull-up AND the pinned footers' new
spacing; keyboard appearance; label ellipsis at an accessibility text size; text
WRAPPING, which is what `home(2)` set out to fix; and the two availability
toggles agreeing ACROSS a navigation.

### What only a physical iPhone can confirm from THIS run

Nothing was rendered, screenshotted or visually verified — there was no
simulator and none was attempted. The full eleven-item list is at the end of the
run report's home section. The five that matter most:

1. **That the app builds and launches at all** — `home(1)` repaired a `require`
   of a deleted asset that would have failed the Metro bundle.
2. **The atmosphere layer** — full-bleed to the top of the screen, NOT moving
   when the page scrolls, uncovered by any card or scroller, and absent in light.
3. **The CTA heading's wrap** on Customer Home. Two lines rather than three is
   the whole point of `home(2)`, and text layout is not computable offline.
4. **The pinned footers' new 12pt** under Back / Continue, Publish job, Cash out
   and Delete my account — neither crowded by the pill nor floating away from it.
5. **The `[ + ]` where it overhangs the pill's rounded top edge.** It now rises
   ~11pt above the bar rather than ~4pt, and only a device shows whether that
   still draws cleanly.

### Carried forward from the earlier passes

The dark device pass before the emerald run is recorded in full as the **"Dark
device pass 2026-08-19"** section of the run report. Two of its findings still
stand and keep being rediscovered:

* **`forest` was the Heritage brand green ON CREAM; Prestige v2 made it the one
  solid FILL.** Any unconverted surface using it as CONTENT — a label, a body
  line, a dashed edge, a glyph — resolves in dark to one deep green on another
  and simply disappears.
* **The saturated per-category tile fills are retired in dark on purpose**,
  including the purple `dog_walking` tile masters 11 and 13 visibly draw.

**The raster roster** (`tests/themeResolution.test.mjs`) holds every mounted
image with its MEASURED background and a gate decision. `home(1)` strengthened
it to measure both directions and `home(4)` added the atmosphere layer to it.
**Adding a new image asset still fails the suite until it is put on that roster
with a gate decision.** That is intended.

### Invariants, unchanged

No schema was touched and no database contacted, in any of these runs. Money is
still integer cents through `formatBudget()`. `accept_offer()` is still the only
assignment path and `transition_job_status()` the only status mover; exact
address still comes from `job_locations` behind RLS; lifecycle derivation is
still expressed once; no marketplace data was invented. One account still
carries both capabilities, and mode still changes only through `switchMode()`.

**Navigation semantics changed twice, deliberately and customer-side only.**
emerald(1): two destinations left the customer bar and one joined it. `home(9)`:
the customer's last LINK to Map is gone. **No route was removed in either** —
`Map` and `MyJobs` stay registered and dispatchable, hidden — so every existing
NAVIGATE still resolves and no deep link needed retargeting.
`tests/emeraldFences.test.mjs` pins the whole class: every cross-tab tab name
dispatched anywhere must be registered in BOTH trees.

**One data-flow change** (emerald(6)): `hooks/useProfile.ts` is a shared store
rather than a per-component hook. Nine screens read it. Fetch behaviour is
unchanged — each mount still refreshes — but a write on one screen is now
visible on the others immediately.

