# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-19 — Emerald Prestige DARK-mode device pass: COMPLETE

**No SQL executed, no database contacted, nothing pushed, no `.claude/` file
modified, no `.env` read, no dependency added or mutated, no frozen web surface
touched, `app.json` untouched, `lib/authTheme.ts` untouched, no locked screen
modified.**

A dark-mode pass on a physical iPhone found what a static master-by-master
comparison could not: controls whose two states resolve to the same dark
smudge, scrims that lighten instead of dim, and the screens with no golden
master that had only ever received the token shift. Six commits carry the
`fidelity(N)` prefix; a seventh is this rewrite.

The campaign's living record — every finding, judgment call, skip and
deviation, with the reason for each — is the **"Dark device pass 2026-08-19"**
section of `docs/mockups/PRESTIGE_RUN_REPORT.md`. Read it before reopening any
of this; the section below is the operational summary only.

### Verify

Every commit ran bare `npm run verify`, stdout redirected to a file and never
piped, with the exit code read from `$?` — a redirect leaves it as verify's
own; a pipe would have masked it. Final state: **758 pass / 0 fail / 0 skipped,
exit 0**, up from 755 because `fidelity(5)` added three tests. No assertion was
relaxed anywhere. Two assertions moved, both in `tests/mode.test.mjs` at
`fidelity(6)`, because the operator reversed the decision they encoded; both
came back stronger and the run report says how.

### The one root cause worth remembering

`forest` was the Heritage brand green ON CREAM. Prestige v2 made it the one
solid FILL. Every unconverted surface that used it as CONTENT — a label, a body
line, a dashed edge, a glyph — therefore resolves in dark to one deep green on
another, and parts of the screen simply disappear. That single mistake accounts
for most of `fidelity(3)`: the step-2 privacy notice, the media counters, the
success screen's check mark and its "Keep browsing" control were all it.

### What changed, by commit

- **`fidelity(1)` `fdb379f` — shared controls.** The toggle's ON track is
  emerald and its OFF track is the danger red (D1, a deliberate deviation from
  the set's no-red-control note). The standard button's hairline is real gold
  instead of the flat dim-gold `border`, so enabled and disabled stop reading
  alike. SEVEN shared modals scrimmed with `ink`/`text` — the CREAM in dark —
  and now dim with the page ground. One rating-star treatment,
  `starColors(palette, isDark)` in `lib/theme.ts`, across ten call sites.
  Selected distance chips take the gold outline masters 12/33 draw. Worker job
  detail's meta rows join the shared gold-glyph treatment.
- **`fidelity(2)` `3653ba7` — one category tile.** Five more surfaces adopt the
  deep-green tile with a gold glyph; the photo path is untouched, so a job with
  media still shows its real upload.
- **`fidelity(3)` `a5e6360` — the screens with no master.** Post a Job's four
  steps, the published-job success screen and Appearance. The active step label
  is now the brightest in its row (D6), multi-line inputs take the card radius
  (D5, both themes), and the muted text that was unreadable is readable.
- **`fidelity(4)` `4d643ef` — per-screen paint and copy.** Payment methods'
  last two sections are contained in cards; past work has ONE empty state
  instead of two; the budget wording follows the masters; curly quotes.
- **`fidelity(5)` `01aa021` — the artwork gate, as a rule.** See below.
- **`fidelity(6)` `46d765b` — the centre [ + ] returns**, customer bar only.

### Two things a later run must not "correct"

1. **The centre [ + ] is deliberate and no master draws it.** D3 reverses the
   half of decision 4 that retired it. It is structural, so it is the one
   intentionally light-visible change of this pass. Its gold is LINE-WORK — a
   gold ring and gold glyph on the deep-green fill — because decision 3 forbids
   gold fills and `tests/goldOnForest.test.mjs` enforces that tree-wide.
2. **The saturated per-category tile fills are retired in dark on purpose**,
   including the purple `dog_walking` tile master 12 visibly draws. Operator
   instruction, recorded with the pixel evidence in the run report.

### fidelity(5) found no defect, and shipped a guard instead

Customer Home's armchair and gold-B drape have resolved per palette since
prestige(1a); the reported leak is not in the code. Every raster the app mounts
was inventoried and its background MEASURED — from each PNG's IHDR colour type,
and for the RGBA ones a corner-alpha decode — and none leaks a wrong-theme
ground. The evidence table is in the run report.

So the commit made the rule enforceable instead: `tests/themeResolution.test.mjs`
now holds a roster every mounted raster must appear on with its measured
background, re-derives the no-alpha claim from the PNG header so the roster
cannot rot, and scans that every gated asset is mounted with `isDark` within
240 preceding characters — comment-stripped, so a docblock cannot stand in for
a real gate. **Adding a new image asset will now fail the suite until it is put
on that roster with a gate decision.** That is intended.

### Invariants, unchanged

Nothing in this pass touched data flow, schema or navigation semantics, except
D3's one added tab slot — which is an ACTION with no destination. Money is
still integer cents through `formatBudget()`; money COLOUR was not touched at
all (D8); `accept_offer()` is still the only assignment path and
`transition_job_status()` the only status mover; exact address still comes from
`job_locations` behind RLS; lifecycle derivation is still expressed once. No
marketplace data was invented.

## NEXT SCHEDULED RUN — the LIGHT-mode parity audit

Light was FROZEN for this pass (D10): every fix branched on `isDark` and left
the light value byte-identical, with two stated exceptions (the centre [ + ],
and D5's radius, which is theme-neutral). That freeze is now debt, and paying
it is the next run.

**The scope is written out in full** as section **(c) THE LIGHT AUDIT HANDOFF
LIST** at the end of `docs/mockups/PRESTIGE_RUN_REPORT.md`. It is meant to be
audited from directly, without rediscovery, and has four parts:

- **C1** — every shared component this run touched that carries a light branch,
  with what light renders today and why it needs looking at (thirteen entries,
  from the `Toggle` to `MediaUploader` to the seven modal scrims).
- **C2** — the five items deferred under D10. The largest is **L1**:
  `lib/jobs.ts`'s `JOB_CATEGORY_COLORS` is now a LIGHT-ONLY table, and whether
  light keeps eleven category colours or joins the one-tile rule is the biggest
  outstanding light decision. Also **L4**: `customer-home-chair.png` bakes
  `#FAF5F1` opaquely — invisible only because it matches `homeBackground`
  exactly today.
- **C3** — what prestige(0c)/(1c)/(0d)/(7a) changed in BOTH themes and nobody
  has seen under light: the shared Toggle, the disabled-button treatment, serif
  screen headers, segmented tabs, both steppers, the floating nav pill in both
  trees (now six slots on the customer side), the three profile pages, and the
  Avatar.
- **C4** — theme-neutral changes from this run, listed so they are not
  re-audited as light debt.

### Open items carried forward (unchanged by this pass)

1. **Master 34's inbox search, its four filter tabs and its per-thread unread
   COUNT** are not built — functionality, not presentation, and the data model
   has no support-thread kind and no per-thread count.
2. **Master 46's three-column grid and its "best fit" ribbon** are not built —
   bid count is unbounded, and the ribbon asserts a judgement no stored figure
   supports. The honest HIGHEST RATED badge stays.
3. **Master 33's dark map tiles** remain provider-style work.
   `HotspotMap.native` already follows the resolved theme.
4. **The verification badge** stays removed from every user-visible surface.
5. **Disk filenames for ten masters are shuffled** relative to the manifest's
   numbering — `My_Jobs_Closed_Dark.png` holds master 35's ACTIVE tab, and so
   on. Read by content; renaming is an operator call.
6. **Master 40's "No real charge" gold pill** and **master 25's gold ledger
   amount** remain unimplemented, both for reasons already on the record.
7. **Hand-drawn standard-shaped controls inside individual screens** never got
   the gold-hairline sweep — only the shared `Button` did. Worth its own pass.
