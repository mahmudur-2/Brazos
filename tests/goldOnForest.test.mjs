import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ===========================================================================
// Prestige v2 (0b) — REWRITTEN, superseding the 4D-4 "no gold on forest" scan.
//
// The old scan guarded a premise the v2 palette inverted: under v1's dark
// palette `forest` and `gold` were the same hex (#D9B978, the gold-primary
// experiment), so forest-fill + gold-content was invisible paint. Under v2
// — pixel-derived from the 43 golden masters — `forest` is a deep green
// solid again and gold/cream content ON a forest fill is CORRECT (master 44's
// hero card is exactly that). The old assertion would now reject designs the
// masters demand, so it is replaced, not weakened, by the two truths below:
//
//   1. GOLD IS LINE-WORK, NEVER A FILL. Across every master, gold draws
//      eyebrows, hairlines, icons, rings and borders; no control fills with
//      it (pre-made decision 3: "No gold fills anywhere"). goldSoft is a
//      wash token and legitimately fills warning cards.
//   2. THE PALETTE KEEPS THE INVERSION. dark.forest is the deep green and
//      dark.gold the metal, and they can never silently re-merge.
//
// The HotspotMap per-theme pin assertion is carried over unchanged from the
// 4D-4 suite — it still pins the code as it stands; the 3a map restyle will
// update it when the pin adopts master 33's gold ring.
// ===========================================================================

const SOURCE_DIRS = ['screens', 'components', 'ui'];
const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'))
);

// Decorative shimmer bars over the baked LIGHT transition PNGs — translucent
// glow, not a control fill; migrates with those assets (standing decision,
// HANDOFF "Deliberately left light").
const GOLD_FILL_ALLOWLIST = new Set(['components/ModeTransitionOverlay.tsx']);

/**
 * home(8) — the ONE control decision 3 was reversed for, on operator
 * instruction: the customer bar's centre [ + ]. It was a gold glyph and gold
 * ring on the deep-green conversion fill; it is now palette gold, filled,
 * with dark content. The masters draw it as a gradient, no gradient library
 * exists here and none is being added, so flat gold is the accepted
 * approximation.
 *
 * 2026-08-23 EXTENDS THE SAME REVERSAL TO LIGHT, on operator instruction:
 * light was still painting the inverse (forest fill, gold ring), which made
 * one control two designs. The base style now carries the gold tile, so the
 * exception set names BOTH keys. This widens the reversal by exactly the one
 * style the operator named and by nothing else — it is not a relaxation of
 * the rule's shape.
 *
 * Recorded as file-AND-style-key, deliberately NOT as a file entry in
 * GOLD_FILL_ALLOWLIST above: a THIRD gold fill introduced in
 * ui/primitives/BottomNav.tsx is still an offender, and either of these is
 * still an offender if it moves to another file. Every other control in the
 * tree, in both themes, is still forbidden to fill with gold — and the
 * deepEqual below means a key that stops matching is a hard failure rather
 * than a hole left standing.
 */
const GOLD_FILL_EXCEPTIONS = new Set([
  'ui/primitives/BottomNav.tsx::createButton',
  'ui/primitives/BottomNav.tsx::createButtonDark',
]);

/**
 * The one shape decision 3's "no gold fills" was never about: the filled part
 * of a MEASUREMENT BAR. Masters 27 (the per-star rating distribution) and 37
 * (the job progress bar) both run a gold fill along a deep track, and a bar's
 * fill is DATA — how much of something there is — not a control anyone can
 * press. Recognised by style-key convention (`…Fill`) rather than by file, so
 * a gold button fill in the same file is still an offender.
 *
 * Returns the nearest enclosing style key for an offset, or null.
 */
function enclosingStyleKey(source, index) {
  const before = source.slice(0, index);
  const open = before.lastIndexOf('{');
  if (open < 0) return null;
  // `…  distFill: {` → "distFill". An inline `style={{ … }}` has no `name:`
  // before its brace, so it yields null and stays an offender.
  const key = /(\w+)\s*:\s*$/.exec(before.slice(0, open).trimEnd());
  return key ? key[1] : null;
}

test('[static] gold is line-work, never a fill', () => {
  const offenders = [];
  let goldLinework = 0;
  let barFills = 0;
  const exceptionsSeen = new Set();
  for (const file of sourceFiles) {
    const source = stripComments(read(file));
    goldLinework += (
      source.match(/(?:[{,]\s*color|border(?:Top|Bottom|Left|Right|Start|End)?Color):\s*\w+\.gold\b/g) ?? []
    ).length;
    for (const fill of source.matchAll(/backgroundColor:\s*\w+\.gold\b/g)) {
      if (GOLD_FILL_ALLOWLIST.has(file)) continue;
      const key = enclosingStyleKey(source, fill.index);
      if (key && GOLD_FILL_EXCEPTIONS.has(`${file}::${key}`)) {
        exceptionsSeen.add(`${file}::${key}`);
        continue;
      }
      if (key && /Fill$/.test(key)) {
        barFills += 1;
        continue;
      }
      offenders.push(`${file}: ${fill[0].trim()}`);
    }
  }
  // Every recorded exception must still be a real, live gold fill. A stale
  // entry is a hole standing open for a fill that no longer exists.
  assert.deepEqual(
    [...exceptionsSeen].sort(),
    [...GOLD_FILL_EXCEPTIONS].sort(),
    'a recorded gold-fill exception no longer matches anything — delete it rather than leave the hole'
  );
  // The bar exception must stay an exception: if it ever stops matching
  // anything, it is dead and should be deleted rather than left as a hole.
  assert.ok(barFills >= 1, 'the measurement-bar exception must still match a real bar fill');
  // The sweep must actually be looking at something: the tree is large and
  // gold line-work is everywhere by design.
  assert.ok(sourceFiles.length > 100, `the sweep must enumerate the tree (saw ${sourceFiles.length})`);
  assert.ok(goldLinework >= 10, `the sweep must see the known gold line-work (saw ${goldLinework})`);
  assert.deepEqual(offenders, [], 'gold may draw lines, text and icons — never fill a control');
});

test('[static] the v2 dark palette keeps forest green and gold metal, distinct', () => {
  const tokens = read('ui/tokens.ts');
  const darkBlock = tokens.slice(tokens.indexOf('export const dark = {'));
  const value = (key) => {
    const hit = darkBlock.match(new RegExp(`${key}: '(#[0-9A-Fa-f]{6})'`));
    assert.ok(hit, `ui/tokens.ts dark is missing ${key}`);
    return hit[1];
  };
  // Prestige v2.1: the operator's tuning pass darkened the ground and cooled
  // the forest and the gold by a step. The pins move with it; what they are
  // for is unchanged -- these are the two hues v1 had merged, and the ground
  // they sit on.
  assert.equal(value('forest'), '#1B3527');
  assert.equal(value('gold'), '#D4A24C');
  assert.equal(value('bg'), '#02110D');
  assert.notEqual(value('forest'), value('gold'), 'v1 merged these; v2 must never re-merge them');
});

/** The innermost balanced `{…}` around `index` — for a style property match,
 *  that is the style object it lives in. */
function enclosingObject(source, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

test('[static] the HotspotMap pin is master 33: forest fill, ONE gold hairline, cream count', () => {
  const source = stripComments(read('components/HotspotMap.native.tsx'));
  // Golden master 33 rings the pin in gold. The per-theme split this carried
  // under palette v1 existed because forest WAS the gold primary there, so a
  // gold hairline vanished into its own fill; v2 restored forest to a deep
  // green (guarded distinct below), which makes one rule correct in both.
  const badge = enclosingObject(source, source.indexOf('minWidth: 40'));
  assert.match(badge, /backgroundColor: colors\.forest/);
  assert.match(badge, /borderColor: colors\.gold/);
  const tail = enclosingObject(source, source.indexOf('marginTop: -5'));
  assert.match(tail, /backgroundColor: colors\.forest/);
  assert.match(tail, /borderColor: colors\.gold/);
  // No per-theme override survives, in either direction.
  assert.doesNotMatch(source, /pinBadgeLight|pinBadgeDark|pinTailLight|pinTailDark/);
  // The count itself already sat on onForest — that stays.
  assert.match(source, /pinCount: \{\s*color: colors\.onForest/);
});

// ===========================================================================
// emerald D6 / D7 — ONE selected treatment, ONE disabled treatment
// ===========================================================================
//
// Masters 11, 23 and 24 draw selection the same way and the app drew it three:
// a gold outline on the distance chips, EMERALD on the service-category chips,
// the filter-sheet chips and radios, the tip presets, the portfolio chips, the
// report reasons, the past-work tabs and the flat/ask pill — which master 23
// draws gold — and a `primary` FILL on several of those. In dark, `mint` and
// `emerald` sit close together on a near-black ground, so half of them barely
// read as chosen at all.
//
// D6 collapses that to one: full-strength gold line, gold label, no fill. D7
// does the same for the other end of the range — a disabled control is a flat
// neutral fill with muted text and no border, never an opacity dim over the
// conversion green.
//
// Light is deliberately untouched by both: every control keeps the Heritage
// state it already had, which is why each call site reads
// `active && (isDark ? …Dark : …)` rather than replacing the light branch.

/** A top-level function's source, from its declaration to its closing brace. */
function functionBody(source, declaration) {
  const start = source.indexOf(declaration);
  assert.ok(start >= 0, `expected ${declaration} in lib/theme.ts`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `${declaration} must be a top-level function`);
  return source.slice(start, end + 2);
}

/** Every surface emerald D6 converted, with the style keys it converted. */
const D6_SURFACES = [
  ['components/Chip.tsx', ['chosen.line', 'chosen.fill']],
  ['components/SegmentedControl.tsx', ['activeLabel']],
  ['components/JobFilterSheet.tsx', ['chipActiveDark', 'radioActiveDark', 'sortLabelActiveDark']],
  ['components/PortfolioPicker.tsx', ['categoryChipSelectedDark']],
  ['components/PastWork.tsx', ['tabActiveDark', 'tabTextActiveDark']],
  ['components/ReportDialog.tsx', ['reasonSelectedDark', 'reasonTextSelectedDark']],
  ['screens/ServicesPricingScreen.tsx', ['categoryChipActiveDark']],
  ['screens/ApproveOrDisputeScreen.tsx', ['reasonRowActiveDark', 'radioActiveDark']],
  ['screens/ReviewAndTipScreen.tsx', ['presetActiveDark', 'presetTextActiveDark']],
  ['screens/MyJobsHubScreen.tsx', ['tabLabelSelectedDark']],
];

test('[static] selection in dark resolves through ONE helper, everywhere', () => {
  const theme = stripComments(read('lib/theme.ts'));

  // The helper exists and says what D6 says: full gold for the chosen option,
  // NO fill (gold is line-work), and the hairline tier for the rest of the
  // group so "chosen" is a step up rather than a different colour.
  assert.match(theme, /export function selectedInDark\(palette: ColorPalette\)/);
  const helper = functionBody(theme, 'export function selectedInDark');
  assert.match(helper, /line: palette\.gold,/);
  assert.match(helper, /fill: 'transparent',/);
  assert.match(helper, /idleLine: alpha\(palette\.gold, 0\.35\),/);
  // Light is not expressed in it at all — no isDark, no second branch — which
  // is what keeps every Heritage selected state byte-identical.
  assert.doesNotMatch(helper, /isDark|\?/);

  for (const [file, keys] of D6_SURFACES) {
    const source = stripComments(read(file));
    assert.match(
      source,
      /selectedInDark\(/,
      `${file} must take its selected colour from the one helper`
    );
    for (const key of keys) {
      assert.ok(
        source.includes(key),
        `${file} must still carry its ${key} selected treatment`
      );
    }
    // The light branch survives beside it: a call site that replaced rather
    // than added would have dropped the conditional.
    if (file !== 'components/Chip.tsx' && file !== 'components/SegmentedControl.tsx') {
      // Two shapes are in use and both are fine: the ternary that swaps the
      // light style for the dark one, and the AND chain that layers the dark
      // one on top of it. What matters is that a LIGHT branch still exists.
      assert.match(
        source,
        /isDark\s*\?\s*styles\.\w+\s*:\s*styles\.\w+|&&\s*isDark\s*&&\s*styles\.\w*(?:Active|Selected)Dark/,
        `${file} must branch on isDark rather than repaint light`
      );
    }
  }
});

test('[static] disabled is a neutral fill, never an opacity dim on a live colour', () => {
  const theme = stripComments(read('lib/theme.ts'));
  assert.match(theme, /export function disabledControl\(palette: ColorPalette\)/);
  const helper = functionBody(theme, 'export function disabledControl');
  assert.match(helper, /backgroundColor: palette\.neutralBg,/);
  assert.match(helper, /borderColor: 'transparent',/);
  assert.match(helper, /color: palette\.textMuted,/);

  // The two hand-rolled BUTTONS that never went through the primitive. Icon
  // buttons (ChatComposer's mic/send) and whole-group dimmers (OfferComposer's
  // chipGroups) are deliberately out of scope: neither is a filled control, so
  // "flat neutral fill" has nothing to say about them.
  for (const file of [
    'screens/ServicesPricingScreen.tsx',
    'components/CategoryAccordion.tsx',
  ]) {
    const source = stripComments(read(file));
    assert.match(source, /disabledControl\(colors\)/, `${file} must use the one disabled rule`);
    assert.doesNotMatch(
      source,
      /Disabled: \{\s*opacity:/,
      `${file} must not dim a live fill instead of replacing it`
    );
  }
  // The pale sage "Add service" fill is gone: the enabled state is the
  // standard conversion fill now.
  const services = stripComments(read('screens/ServicesPricingScreen.tsx'));
  const start = services.indexOf('  addButton: {');
  assert.ok(start >= 0, 'expected the Add service button style');
  const addButton = services.slice(start, services.indexOf('\n  },', start));
  assert.match(addButton, /backgroundColor: colors\.primary/);
  assert.doesNotMatch(addButton, /colors\.emerald/);
});

// ===========================================================================
// emerald D8 — ONE scrim, at the strength master 11 draws
// ===========================================================================

test('[static] every modal scrim in dark is the one shared strength', () => {
  const theme = stripComments(read('lib/theme.ts'));
  assert.match(theme, /export const SCRIM_DARK_ALPHA = 0\.55;/);
  assert.match(theme, /export function scrimInDark\(ground: string\): string/);
  assert.match(functionBody(theme, 'export function scrimInDark'), /alpha\(ground, SCRIM_DARK_ALPHA\)/);

  // Every sheet, dialog and picker with a dark scrim. They had independently
  // landed on the SAME 0.7 — including ui/primitives/Sheet.tsx, which draws
  // master 11's filter sheet and is the reference the operator named — so the
  // creation sheet was not an outlier: seven copies of one number were all too
  // strong. A scrim dims the page; it does not erase it.
  const scrimFiles = [
    'components/ActionSheet.tsx',
    'components/AmountPrompt.tsx',
    'components/ConfirmDialog.tsx',
    'components/ReactionPicker.tsx',
    'components/ReportDialog.tsx',
    'components/ServicePickerSheet.tsx',
    'ui/primitives/Sheet.tsx',
  ];
  for (const file of scrimFiles) {
    const source = stripComments(read(file));
    assert.match(
      source,
      /backdropDark: \{ backgroundColor: scrimInDark\(colors\.(background|bg)\) \}/,
      `${file} must take its dark scrim from the one helper`
    );
    // ...and its LIGHT scrim is untouched: still each surface's own value,
    // which is deliberately NOT unified — the three that exist (35%, 42%, 45%)
    // were never the complaint, and a shared light number would have repainted
    // six surfaces nobody reported.
    assert.match(
      source,
      /backgroundColor: withAlpha\(colors\.(text|ink), 0\.\d+\)/,
      `${file} must keep the light scrim it already had`
    );
  }
  // No file may go back to hand-rolling one.
  for (const file of sourceFiles) {
    const source = stripComments(read(file));
    assert.doesNotMatch(
      source,
      /backdropDark: \{ backgroundColor: withAlpha\(/,
      `${file} must not hand-roll a dark scrim`
    );
  }
});

test('[static] the creation sheet clears the home indicator', () => {
  // emerald D8's band. The sheet's own surfaces were always on the palette —
  // what showed below Cancel was the app's UNPAINTED ground reaching through a
  // 70% scrim, the same platform white emerald(2) found under the nav pill.
  // The source is fixed in navigation/ModeShell.tsx; this is the safe-area
  // handling ActionSheet never had, which ui/primitives/Sheet.tsx has always
  // had — so the sheet ends above the home indicator rather than on it.
  const sheet = stripComments(read('components/ActionSheet.tsx'));
  assert.match(sheet, /const insets = useSafeAreaInsets\(\);/);
  assert.match(sheet, /\{ paddingBottom: insets\.bottom \+ spacing\.lg \}/);
  assert.match(
    stripComments(read('ui/primitives/Sheet.tsx')),
    /paddingBottom: insets\.bottom \+ spacing\.lg/,
    'the two sheets must reserve the inset the same way'
  );
  // The ground that was showing through is painted, in one place, for both trees.
  assert.match(
    stripComments(read('navigation/ModeShell.tsx')),
    /backgroundColor: palette\.background/
  );
});

// ===========================================================================
// emerald D10 — the master-backed small deltas
// ===========================================================================

test('[static] master 26: an EMERALD glyph inside a GOLD ring, not both gold', () => {
  const feed = stripComments(read('screens/NotificationsScreen.tsx'));
  // The ring is gold and constant — read or unread. The dot at the row's end
  // is what marks unread, which is why neither the ring nor the glyph carries
  // read state in dark.
  //
  // 2026-08-24: the ring's WEIGHT moved to the shared style and only its
  // COLOUR still forks, so the two halves are asserted where each now lives.
  // The claim this fence makes is unchanged — a 1pt gold ring in dark — and it
  // got stronger, because the weight is now pinned for BOTH themes: light
  // draws the same ring in the hairline token, which is the parity rule.
  assert.match(feed, /rowGlyph: \{[^}]*borderWidth: 1,/, 'the ring is one weight in both themes');
  assert.match(feed, /rowGlyphDark: \{\s*borderColor: colors\.gold,/, 'and gold in dark');
  assert.doesNotMatch(
    feed,
    /rowGlyphDark: \{[^}]*borderWidth/,
    'the ring\'s weight belongs to both themes — a dark-only borderWidth is the fork this closed'
  );
  // The glyph inside it is emerald. Both being gold flattened the ring and its
  // contents into one shape.
  assert.match(
    feed,
    /isDark\s*\?\s*colors\.emerald\s*:\s*!n\.read_at\s*\?\s*colors\.emerald\s*:\s*colors\.textSubtle/,
    'the dark glyph must be emerald; light keeps its read/unread dimming'
  );
});

test('[static] master 22 and master 18 were already built', () => {
  // Both D10 sub-items are CONDITIONAL — "only if the action already exists",
  // "only if the screen genuinely lacks it". Neither condition holds: the work
  // is already there, so the correct action was to confirm it rather than add
  // a second copy. Pinned so a future run does not "restore" a duplicate.

  // Master 22 — each saved-worker row carries its bookmark affordance, and it
  // is wired to the unsave action that already existed in lib/savedWorkers.ts.
  const saved = stripComments(read('screens/SavedWorkersScreen.tsx'));
  assert.match(saved, /import \{ fetchSavedWorkers, unsaveWorker \}/);
  assert.match(saved, /onPress=\{\(\) => removeSaved\(profile\.id\)\}/);
  assert.match(saved, /<Ionicons name="bookmark"/);
  assert.match(saved, /accessibilityLabel="Remove from saved"/);

  // Master 18 — the worker profile draws "Send an offer" WITH its explanation,
  // and it dispatches the existing offer flow (PostJob with hireWorkerId), not
  // a new path.
  const profile = stripComments(read('screens/WorkerProfileScreen.tsx'));
  assert.match(profile, /title="Send an offer"/);
  assert.match(profile, /styles\.hireText/, 'the explanation master 18 draws must stay');
  assert.match(profile, /hireWorkerId: params\.workerId/);
});
