## 2026-08-22 — LIGHT-PARITY CLEANUP + GUARD-COVERAGE AUDIT — COMPLETE, ONE COMMIT SKIPPED

Four dispatched commits; **three landed, one was skipped at its own gate**,
plus this record. `dd518d9` fixes the light star (L-010), `1714fd8` moves the
category accents into the token layer (L-002), `19357ab` writes the read-only
guard-coverage audit. Bare `npm run verify` exit 0 at baseline and after every
commit — **suite 844 → 845 → 846 → 846 pass / 0 fail / 0 skipped / 0 TS
errors**. Every delta is one added fence: +1 the L-010 star fence, +1 the L-002
value-parity fence, +0 for the docs-only audit. `git` is the authority on what
reached the remote.

**No guard, hook, deny rule, fence or lint rule was weakened, disabled,
narrowed or granted an allowance anywhere in this run.** That constraint is
what skipped a commit and what shaped the L-002 design; both are recorded
below rather than quietly absorbed.

### L-010 — the light star, fixed (`dd518d9`)

The dark pass gave the app ONE star treatment (`lib/theme.ts` `starColors`)
but repointed the three bare-`★`-in-a-sentence spans on the dark side only:
`<Text style={isDark ? styles.xStarDark : undefined}>★</Text>`. `undefined` is
not "the Heritage star" — it is no paint at all, so in light the glyph
inherited the muted grey of the meta line it sat in. The helper had expressed
light correctly the whole time; nothing called it there.

All three sites (`BidDetailScreen`, `ProfileScreen`, `SavedWorkersScreen`,
each re-located against current code rather than trusting the audit's recorded
line numbers) now paint through `starColors(colors, isDark).filled`, the same
expression the six Ionicons star sites already use. The three dark-only
`…StarDark: { color: colors.gold }` keys are deleted, not left dangling. Dark
is byte-unchanged. The `starColors` docblock, which had recorded "the light
pass owns that call", now records that the pass happened.

`tests/themeTokens.test.mjs` gains the fence — and with it an **executed
`lib/theme.ts`** (react-native stubbed, its `ui/tokens` import fed from the
module that file already executes, so the palette the helpers see is the real
one). Half one calls `starColors` against both palettes; half two derives the
site list by scanning `screens/`, `components/`, `ui/` for the glyph and
counts painted spans against glyphs per file, so a fourth bare star anywhere
fails by path. **Proven red before green:** repointing `SavedWorkersScreen` to
the exact pre-fix shape failed with `0 !== 1` at suite exit 1, then reverted.

### L-001 — SKIPPED at its gate: `emeraldColors` has live consumers

The dispatch's gate was "zero live consumers → delete; any live consumer → do
not delete, report and continue." Two search passes (gitignore-respecting and
raw, with `\bemeraldColors\b` so `emeraldColorsFor` cannot be confused for it)
found **zero production importers** — the five screens that name
`emeraldColors` all declare it as a LOCAL const from
`emeraldColorsFor(colors)` — but **two live consumers in test code**:

* `tests/customerCore.test.mjs:225` — `assert.match(theme, /export const emeraldColors/)`, a hard assertion the export exists.
* `tests/emeraldFences.test.mjs:1485` — `paletteBlock(theme, 'colors = {', 'emeraldColors')` uses the export's NAME as the end delimiter for slicing the light palette block, and `paletteBlock` asserts `${next} must stay a named export after ${name}`.

Deleting the export turns both red, and the only way through is to edit two
fences — which this run's binding constraint forbids. **The audit's L-001 line
("zero live consumers") is therefore contradicted by current code**: it
counted importers, not the two fences that pin the export's existence and use
its name as a source delimiter. Recorded, skipped, continued. Whoever picks
this up owns those two fences as part of the change.

### L-002 — category accents moved to the token layer (`1714fd8`)

The eleven job-category accents were twenty-two raw hexes in `lib/jobs.ts`: a
data-access module, so outside all three sanctioned token surfaces AND outside
the hex fence's scanned directories, where a twelfth could have been added with
nothing to catch it. They are now `categoryAccents` in `ui/tokens.ts`;
`lib/jobs.ts` keeps the vocabulary it owns and carries **no colour literal of
any kind**. All twenty-two values moved byte for byte — a refactor, pinned by a
fence that compares the executed token module against a copy of the
pre-refactor table.

**Two deliberate deviations from the dispatch's wording, both because current
code wins:**

1. The dispatch asked for resolution "through the palette". `emeraldFences` F5
   pins **both** `lib/jobs.ts` declarations verbatim —
   `JOB_CATEGORY_COLORS: Record<JobCategory, { bg: string; icon: string }>` and
   `categoryAccent(category: JobCategory)` — so a palette-parameterised
   accessor cannot land without editing that fence. It is also F5 that proves
   dark never paints this table at all (every read sits on the FALSE branch of
   an `isDark` ternary), so a dark half would be **dead by construction** and
   no golden master specifies one. One theme-constant group, the same shape
   `star`/`black`/`white`/`mediaChrome` already have.
2. The group is deliberately NOT folded into `colors`/`ColorToken`: eleven
   identity pairs are not palette roles, and folding them in would put
   twenty-two keys into every resolved `EmeraldPalette` that no primitive reads.

The hex fence was **not** extended to `lib/` and no allowance was recorded
anywhere — the dispatch forbade the allowance, and extending the fence would
have required them for `lib/theme.ts`, `lib/authTheme.ts` and `lib/hotspots.ts`.

### Guard-coverage audit (`19357ab`) — read-only, P0 0 / P1 2 / P2 8

`docs/audit/2026-08-22/guard_coverage.md`. Every active guard enumerated from
disk with its boundary quoted verbatim, then each guard's COMPLEMENT scanned
for the class of violation it exists to prevent.
`docs/emerald-v2/DECISIONS.md` **D31** carries the boundary table, which is the
part that must not be lost — the drift between a fence's docblock intent and
its actual directory list is what both P1s are made of.

**P1 · G-001 — raw Supabase Storage error text reaches a user-facing alert.**
`lib/storage.ts`'s `uploadAsset()` returns the service's own `StorageError`
unwrapped; `ui/primitives/MediaUploader.tsx:123` extracts `error?.message`;
`screens/PostJobScreen.tsx:1030,1051` render it with `alertAsync`. Two live
mounts (photo + video). This is exactly the class
`tests/errorMessage.test.mjs` calls a ship-blocker — and it survives because
that fence's `dirs` are `['screens','components','hooks']` and **`ui/` is not
among them**, so the extraction happens one directory outside the sweep and
arrives at the scanned screen bound to a parameter named `message`, which the
fence's `\w*[Ee]rr\w*\??\.message` needle cannot see.

**P1 · G-002 — the guard layer's own regression suite never runs in CI.**
`tests/safety.test.mjs` holds **120 of the 846 tests** — every executed proof
that `guard.ps1`'s ten rules and the deny matrix still behave — inside
`describe(…, { skip: PLATFORM_SKIP })`, and `PLATFORM_SKIP` is falsy only on
win32. `.github/workflows/ci.yml` is `runs-on: ubuntu-latest`. CI therefore
runs 726 tests and skips precisely the 120 that protect the controls: a
weakening edit to the guard or the matrix is green on every PR and is caught
only when the operator happens to run `verify` on Windows.

**P2s:** `lib/` outside the hex fence, with 4 live literals in
`lib/hotspots.ts` (L-003) and nothing mechanical separating a sanctioned token
surface from any other `lib/` file; `lib/sharing.ts` → `PhotoViewer` showing a
raw platform exception (same class as G-001, different source); the two Deno
edge functions type-checked by nothing (`tsconfig` excludes
`supabase/functions`); three non-recursive sweeps (F-ERRMSG, F-TOKENIMPORT,
F-SQLENUM) one `mkdir` from silently shrinking; `lib/adapters/payments.ts`
dropping `code` and degrading `userMessage`'s classification (no leak — it
fails safe — but it lands on the generic branch); `MIGRATED_FILES` being a
hand-list rather than a walk; and the two already-recorded frozen/dev-only
literals (L-009, L-008).

**Nine complement scans came back clean** and are recorded as measured facts,
including a tree-wide sweep for CSS **named** colour literals across all 257
app files — zero hits, confirmed by an independent grep. **Nothing is marked
UNKNOWN**: every scope was read from source. The one coverage that is not a
path boundary is `scripts/verify-schema.mjs`, whose scope is a human cadence.

**Not reached, named rather than sampled:** `dist/` and `.shots/` (build
output), `public/` + `hosting/` (counted, not itemised — frozen web),
`node_modules/`, `assets/`, `design-reference/`, `docs/`, and a full SECURITY
DEFINER ACL sweep of the ~80 migrations, which is database-shaped and out of
scope for a run that touches no SQL.

