## 2026-08-20 — Home reconstruction (`home(1)`–`home(10)`): COMPLETE

Nine functional commits plus this record, on `mainexpo`, based on `fbb6be9`.
`origin/mainexpo` is at `fbb6be9`, so **this run's commits are the unpushed
ones** — the emerald and audit work that the previous handoff described as
unpushed has since reached the remote. Read that from `git`, not from here.

Scope: Customer Home, Worker Home, the shared pinned-footer template, the dark
base tokens, and the raster roster.

**Suite: 781 pass / 1 fail at baseline → 790 pass / 0 fail / 0 skipped, exit 0.**
The one red baseline assertion was the expected raster/alpha claim, failing
because the transparent replacements were already installed; `home(1)` corrected
the recorded fact. **No assertion was relaxed, deleted or allowlisted anywhere in
this run.** Bare `npm run verify` ran after every commit, stdout redirected,
exit read from `$?`.

The living record — every decision, skip, deviation and mutation — is the
**"Home reconstruction — 2026-08-20"** section at the end of
`docs/mockups/PRESTIGE_RUN_REPORT.md`. What follows is the operational summary.

### The one thing to read before anything else

**The app did not build.** `assets/brand/customer-home-post-mark-hd.png` had been
deleted from disk while `screens/HomeScreen.tsx:51` still `require`d it. Metro
resolves an asset `require` at BUNDLE time, so this was not a light-mode blemish
— it failed the whole bundle, in both themes. `home(1)` repointed the light mark
at `assets/brand/brazos_b_drape.png`, the byte-identical brand-folder drape
installed in the same batch, kept under `assets/brand` so light never mounts an
`assets/prestige` file. **The customer promo card's LIGHT artwork is therefore
different from what shipped before this run** — that is the deliberate reading of
operator intent, and it is the first thing to look at on a device.

### What changed, by commit

|Commit|What it decided|
|-|-|
|`e9d0706` home(1)|The three hero rasters are real cut-outs (72.66% / 38.51% / 69.39% of samples fully transparent, corners at 0), decoded here from IDAT rather than trusted. The roster now measures BOTH bake directions; relabelling an asset `transparent` used to remove it from all checking. The gate did NOT move with the bake. Repointed the broken light `require`.|
|`1007cb0` home(2)|The B drape is 18.3% of SCREEN WIDTH, measured at render, with its height from the artwork's own 918x753 aspect and the promo heading's column computed from the same width. A fixed pt value cannot be a fixed percentage.|
|`b5357af` home(3)|`letterSpacing: -1` on six serif heading roles — `display`/`h1`/`h2` and `title`/`heading`/`subheading` — and on nothing else.|
|`7b8e3a3` home(4)|`components/HomeAtmosphere.tsx`: one fixed layer behind both homes, a SIBLING of the scroller so it never travels, pulled up by the safe-area inset so it is full-bleed above the notch, `cover`, dark only.|
|`839dd6a` home(5)|Dark base ground `#08110E` → `#03110E` in exactly three declarations. Light untouched, proved by hex inventory.|
|`ab485d9` home(6)|The Post a Job seam was a STRAY TOKEN — the photo nudge painted `mint` beside a `surface` footer. Found by searching every dark token and every alpha step over `bg` and `surface`.|
|`cba05ce` home(7)|Pinned footers stop reserving the floating pill's footprint a second time. New shared `PINNED_FOOTER_BOTTOM_PADDING` (= `layout.floatingNavGap`) at both templates and PostJob's hand-rolled footer.|
|`3c476a1` home(8)|The centre `[ + ]` is a FILLED gold control with forest content, 14.9% of screen width, dark only.|
|`f8abe8d` home(9)|"View map" leaves customer Home. The Map ROUTE stays registered and hidden.|

### Four reversals this run made that a later run must not "correct"

These join the seven already listed further down; do not undo either set.

8. **Gold FILLS the centre `[ + ]` in dark**, reversing decision 3's "no gold
   fills anywhere" for exactly that one control, on operator instruction. The
   masters draw it as a gradient; no gradient library exists and none was added,
   so flat palette gold is the accepted approximation. The tree-wide gold-fill
   rule is NOT weakened — the exception is recorded in
   `tests/goldOnForest.test.mjs` as one file-AND-style-key pair, so a second
   gold fill in the same file is still an offender, and a stale exception now
   fails the suite.
9. **A PINNED footer must NOT take `useFloatingNavClearance()`.** The bar is laid
   out in normal flow beneath the scene, so its space is already reserved; a
   footer that reserved it again put ~104pt of empty chrome under every action
   button. Scrolling surfaces still take the clearance and the hook is untouched.
   `tests/layout.test.mjs` now asserts the two classes with OPPOSITE assertions;
   its old roster ACCEPTED a pinned footer carrying the clearance, which is how
   the double count survived a device pass.
10. **The customer has no link to Map at all**, and the Map ROUTE stays
    registered anyway. Un-registering a route because nothing currently calls it
    is what turns the next dispatch into NAVIGATE-not-handled. The worker Map tab
    is untouched.
11. **Sizes that are stated as a percentage of the screen are derived from the
    screen**, not written as points. Both the B drape and the `[ + ]` read
    `useWindowDimensions()` at render. A future run that "tidies" either back
    into a constant reverses the only implementation that can hold the stated
    figure across 320–440pt.

### Held by a test, added by this run

The B drape's ratio, aspect (re-derived from both PNGs on disk) and copy column;
the promo heading's 25pt, so shrinking type never becomes the fix for a wrap;
the -1 tracking in both scales and its absence everywhere under 15pt; the
atmosphere's gate, its `cover`, its inset pull-up, its presence on BOTH homes,
and its position OUTSIDE the scroller; the dark ground in all three declarations
and the three LIGHT grounds at their exact frozen values; the Post a Job seam's
two surfaces compared to EACH OTHER; the pinned-footer / scrolling-surface
split; the `[ + ]`'s ratio, its filled treatment, its dark content, light's
frozen 52pt, and that `bottomNavHeight` mentions no `CREATE_` constant; and that
nothing on the customer Home stack links to Map — derived by parsing the stack's
registrations and resolving them through the file's own import map, so a screen
added to that stack falls under the fence automatically.

**Every fence was mutated before it was kept**, and one was rewritten because it
survived: the pinned-footer assertion originally passed on the mere IMPORT of
the shared constant. The mutation table is in the run report.

### Two places where the dispatch and the code disagreed

Both are recorded rather than smoothed over, and both are worth the operator's
eye:

1. The dispatch says the B renders at **~34.9%** of screen width. No code path
   produces that; the drape's box was 92pt (21–29% by device). The
   identification is still certain because the dispatch names the consequence —
   the CTA heading wrapping to three lines — and that is definitively the
   `heroMarkDark` / `heroCopyDark` pair.
2. The dispatch says the Post a Job strip and its footer share **an edge with no
   border**. They do not: the nudge carries a 1pt mint2 hairline and an 8pt gap
   below it. Everything measurable matched, so it is the element — but if a
   different surface was meant, that description is where to start.

### Frozen through this run

**Light did not move.** Mechanically: `ui/tokens.ts`'s light palette is 16 hex
values, byte-identical to base; `lib/theme.ts`'s is 31, byte-identical. The dark
palette's whole delta is `#08110E` out, `#03110E` in. Light keeps its 52pt
forest-filled gold-ringed `[ + ]`, its fixed Heritage mark and its fixed 68pt
promo reserve.

Also untouched: every modal scrim (all seven still `scrimInDark` at
`SCRIM_DARK_ALPHA = 0.55`, now compositing over the new ground — token
propagation, not a change); money formatting, money colour and every
payment-state label; the five-slot customer bar; `ModeShell`'s painted ground;
the derived clearance hook and the still-absent static token; schema, SQL, env,
`app.json`, `package.json`, `.claude/`, and every frozen web surface. No
dependency added. No marketplace data invented. No raw colour literal
introduced.

### Found and NOT fixed by this run

* **`screens/ChatScreen.tsx` double-counts the floating-nav clearance** on its
  whole `KeyboardAvoidingView` column — the same defect `home(7)` fixed for
  pinned footers. It is a composer under live keyboard behaviour rather than a
  pinned action bar, and Chat was outside scope. **This is the highest-value
  carry-forward from this run.**
* **Customer Home's LIGHT `heroMark` box is `79x101`**, sized for the old
  portrait post-mark; it now holds the landscape drape, which `contain` renders
  at `79x65` centred inside it. Undistorted and correctly placed, but the box
  reserves ~36pt more height than the art uses. Light is frozen, so it was left.

*(One carry-forward WAS cleared: `lib/navigation.ts`'s stale block comment — item
9 below in the previous handoff, "the single most worthwhile one-line fix in the
tree" — is corrected. It sat directly above a JSDoc `home(9)` was editing and it
described the customer bar as `Home · Map · My Jobs · Messages · Profile`, which
is exactly what `home(9)` must not have restored.)*

