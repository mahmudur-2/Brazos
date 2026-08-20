import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { decode, inkBounds, luminance, tonePatches } from './pngGeometry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
/** JSX wraps freely; the assertions below are about tokens, not line breaks. */
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// ===========================================================================
// REGRESSION FENCES for the emerald correction pass (2026-08-19).
//
// WHY THIS FILE EXISTS. Eleven deliberate decisions landed unreviewed and
// unpushed, and several of them REVERSE an earlier run — which means a future
// run reading the older instruction will "correct" them straight back unless
// something red stops it. That has already happened once on this project.
//
// WHAT IS NOT HERE, AND WHY. Most of the pass is already fenced, and
// re-asserting a green assertion adds no protection while manufacturing the
// impression of coverage. The customer slot roster, My Jobs reachability,
// Discover's label and glyph, the state-blind toggle track, the shared
// availability store, the seven scrims, the selection helper, the disabled
// rule, the nav glyph sizes, the derived clearance, the bar row painting only
// the pill, and the absent verification badge are all pinned already — in
// tests/mode.test.mjs, tests/layout.test.mjs, tests/goldOnForest.test.mjs,
// tests/workerHome.test.mjs, tests/themeResolution.test.mjs and
// tests/verificationBadgeRemoved.test.mjs. Each fence below closes a hole
// those leave, and names the reversion it catches.
//
// See docs/audits/EMERALD_VERIFICATION_2026-08-19.md for the audit that
// established each hole.
// ===========================================================================

const SOURCE_DIRS = ['screens', 'components', 'ui', 'hooks', 'lib', 'navigation', 'modes'];
const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'))
);

/** Every `<Tab.Screen name="…">` in a tree file — the tab navigator's roster.
 *  The nested stacks in the same file use their own `<XStack.Screen>` tags, so
 *  this cannot pick them up. */
const tabRoster = (source) =>
  [...source.matchAll(/<Tab\.Screen\s+name="(\w+)"/g)].map((m) => m[1]);

// ---------------------------------------------------------------------------
// F1 — the customer bar draws exactly five slots, DERIVED from the source.
//
// CATCHES: a future run adding a sixth destination to the customer bar, or
// restoring the My Jobs item emerald(1) removed.
//
// WHY NOT VACUOUS: the roster is parsed OUT of ui/primitives/BottomNav.tsx and
// the count computed from it. Deleting or renaming CUSTOMER_BAR_TABS makes the
// parse fail, not pass. tests/mode.test.mjs:338 derives its five from a
// hardcoded copy of the same array; this derives what that one duplicates, so
// a change to the constant cannot slip past a stale literal.
// ---------------------------------------------------------------------------
test('emerald D1 fence: the customer bar draws five slots, derived from the roster', () => {
  const bottomNav = stripComments(read('ui/primitives/BottomNav.tsx'));

  const rosterMatch = /export const CUSTOMER_BAR_TABS: BottomNavTabKey\[\] = \[([^\]]*)\];/.exec(
    bottomNav
  );
  assert.ok(rosterMatch, 'CUSTOMER_BAR_TABS must be a plain array literal in BottomNav.tsx');
  const roster = [...rosterMatch[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);

  const slotMatch = /export const CUSTOMER_CREATE_SLOT = (\d+);/.exec(bottomNav);
  assert.ok(slotMatch, 'CUSTOMER_CREATE_SLOT must be a plain number in BottomNav.tsx');
  const createSlot = Number(slotMatch[1]);

  // The bar is the destinations with the creation ACTION spliced in — the same
  // arithmetic BottomNavPreview runs, and the same order the tree registers.
  const drawn = [];
  roster.forEach((key, index) => {
    if (index === createSlot) drawn.push('[+]');
    drawn.push(key);
  });

  assert.equal(drawn.length, 5, `the customer bar must draw five slots, saw ${drawn.join(' · ')}`);
  assert.equal(
    drawn[Math.floor(drawn.length / 2)],
    '[+]',
    'the creation action must be the centre of the five'
  );
  assert.ok(
    !roster.includes('MyJobs'),
    'emerald D1 took My Jobs off the CUSTOMER bar — restoring the item reverses it'
  );
  assert.ok(roster.includes('Discover'), 'Discover is the slot Map used to hold');

  // The tree must draw the same five, in the same order, or the pill and the
  // navigator disagree about what the bar is.
  const customerTabs = tabRoster(stripComments(read('navigation/CustomerRoot.tsx')));
  assert.deepEqual(
    customerTabs.slice(0, 5),
    ['Home', 'Discover', 'Create', 'Messages', 'Profile'],
    'registration order IS bar order — the drawn five must come first, in this sequence'
  );
});

// ---------------------------------------------------------------------------
// F2 — every cross-tab TAB name dispatched anywhere is registered in BOTH
// trees (except the one that is deliberately customer-only).
//
// CATCHES: the exact failure class emerald D1 walked past — removing a route
// in order to remove a bar item, which turns a working tap into React
// Navigation's "NAVIGATE … was not handled by any navigator". It is general
// rather than a spot-check: it equally catches a NEW dispatch aimed at a tab
// that does not exist, in either tree.
//
// WHY NOT VACUOUS: the dispatch set is COLLECTED from the tree and asserted
// non-empty and to contain MyJobs before anything is checked against it, so
// deleting every dispatch fails rather than silently passing. And the
// customer-only exemption is not a hole: Discover's single dispatch is pinned
// to its `mode === 'customer'` gate below.
// ---------------------------------------------------------------------------
test('emerald D1 fence: every cross-tab dispatch target is a registered tab', () => {
  const targets = new Map(); // tab name -> where it was found

  for (const file of sourceFiles) {
    const code = stripComments(read(file));
    for (const m of code.matchAll(/navigateAcrossTabs\(\s*'(\w+)'/g)) {
      if (!targets.has(m[1])) targets.set(m[1], file);
    }
  }

  // The notification router builds its tab names in a table rather than at the
  // call site, so they have to be read from there.
  const routes = stripComments(read('lib/notificationRoutes.ts'));
  const tabForScreen = /const TAB_FOR_SCREEN: Record<string, string> = \{([\s\S]*?)\};/.exec(routes);
  assert.ok(tabForScreen, 'TAB_FOR_SCREEN must stay a plain object literal');
  const deepLinkTabs = [...tabForScreen[1].matchAll(/:\s*'(\w+)'/g)].map((m) => m[1]);
  assert.ok(
    deepLinkTabs.length >= 5,
    `every notification destination must own a tab, saw ${deepLinkTabs.length}`
  );
  for (const tab of deepLinkTabs) {
    if (!targets.has(tab)) targets.set(tab, 'lib/notificationRoutes.ts (TAB_FOR_SCREEN)');
  }

  const offerTab = /export const OFFER_JOB_TAB = '(\w+)';/.exec(
    stripComments(read('lib/offerNavigation.ts'))
  );
  assert.ok(offerTab, 'OFFER_JOB_TAB must stay a plain string constant');
  if (!targets.has(offerTab[1])) targets.set(offerTab[1], 'lib/offerNavigation.ts');

  assert.ok(targets.size >= 4, `expected the cross-tab targets, saw ${[...targets.keys()]}`);
  assert.ok(
    targets.has('MyJobs'),
    'MyJobs must still be dispatched — it is the tab D1 took off the customer bar'
  );

  const customerTabs = tabRoster(stripComments(read('navigation/CustomerRoot.tsx')));
  const workerTabs = tabRoster(stripComments(read('navigation/WorkerRoot.tsx')));

  // Discover exists in the customer tree only, by design: worker search is a
  // customer surface. Its ONE dispatch is gated on mode, so it can never fire
  // against the worker tree — asserted, not assumed.
  const CUSTOMER_ONLY = new Set(['Discover']);

  for (const [tab, where] of targets) {
    assert.ok(
      customerTabs.includes(tab),
      `${where} dispatches at tab '${tab}', which the CUSTOMER tree does not register`
    );
    if (CUSTOMER_ONLY.has(tab)) {
      assert.ok(
        !workerTabs.includes(tab),
        `'${tab}' is customer-only; giving the worker tree one changes what this fence means`
      );
      continue;
    }
    assert.ok(
      workerTabs.includes(tab),
      `${where} dispatches at tab '${tab}', which the WORKER tree does not register`
    );
  }

  const savedWorkers = flatten(read('screens/SavedWorkersScreen.tsx'));
  assert.match(
    savedWorkers,
    /mode === 'customer' \? \(\) => navigateAcrossTabs\('Discover'/,
    "the Discover dispatch must stay behind its mode gate — it is the only tab that " +
      'does not exist in both trees'
  );
});

// ---------------------------------------------------------------------------
// F3 — the Discover slot's DESTINATION.
//
// CATCHES: the "two of three changed" reversion. emerald D1 changed the slot's
// label, glyph AND destination together; a future run could keep the Discover
// label and the magnifier while pointing the slot back at the job map, and
// every existing assertion would stay green.
//
// WHY NOT VACUOUS: this is the one attribute of the three that nothing else
// pins. tests/mode.test.mjs pins the label (:319) and the glyph (:347) and that
// Discover is drawn rather than hidden (:320) — the component it renders is
// completely unasserted today, which is precisely the hole.
// ---------------------------------------------------------------------------
test('emerald D1 fence: the Discover slot points at the browse surface, not the map', () => {
  const customerRoot = stripComments(read('navigation/CustomerRoot.tsx'));
  const flat = flatten(read('navigation/CustomerRoot.tsx'));

  assert.match(
    flat,
    /name="Discover" component=\{DiscoverStackNavigator\}/,
    'the Discover slot must render the Discover stack'
  );
  // …and that stack must still be the customer browse surface, not something
  // that merely kept the name.
  assert.match(
    flat,
    /function DiscoverStackNavigator\(\)[\s\S]*?<DiscoverStack\.Screen name="WorkerSearch" component=\{WorkerSearchScreen\}/,
    'the Discover stack must stay rooted at the worker-browse screen'
  );

  // The registration must not have been quietly re-pointed at the job map.
  const discoverBlock = customerRoot.slice(
    customerRoot.indexOf('name="Discover"'),
    customerRoot.indexOf('name="Discover"') + 200
  );
  assert.doesNotMatch(
    discoverBlock,
    /MapStackNavigator/,
    'emerald D1 changed the destination as well as the label and glyph — ' +
      'pointing Discover back at the map reverses two thirds of it silently'
  );
  // Map keeps its own registration, hidden, because Home's "View map" pill
  // dispatches it: the destination moved, it was not deleted.
  assert.match(flat, /name="Map" component=\{MapStackNavigator\}/);
});

// ---------------------------------------------------------------------------
// F4 — money-figure colour immobility.
//
// CATCHES: any recolouring of the money primitive — including the serious
// case, an UNSETTLED amount rendered in the settled colour, which is a payment
// state-machine violation (CLAUDE.md §H.3) rather than a paint change.
//
// WHY NOT VACUOUS: it matches an expression that exists today. Deleting
// `amountColor`, dropping the SETTLED guard or renaming either fails the match
// rather than skipping the check.
//
// DELIBERATELY SCOPED to the money PRIMITIVE and the surfaces that render an
// amount as an amount — not to every string containing a currency figure. The
// audit found two selection chips whose LABELS are amounts (ReviewAndTip's tip
// presets, JobFilterSheet's budget chips) which took emerald D6's gold
// selected state; a fence that treated a chip label and a price as the same
// thing would either be red today or would have to allowlist its way out, and
// an allowlisted fence guards nothing.
// ---------------------------------------------------------------------------
test('emerald fence: the money primitive keeps its colour rule', () => {
  const money = stripComments(read('ui/primitives/MoneyText.tsx'));
  const flat = flatten(read('ui/primitives/MoneyText.tsx'));

  // Settled money takes the accent; anything the ledger has not released stays
  // muted in BOTH themes, so the colour can never outrun the payment state.
  assert.match(
    flat,
    /const SETTLED: PaymentStatus\[\] = \['released', 'paid_out'\];/,
    'the settled set is what separates real money from a claim about it'
  );
  assert.match(
    flat,
    /const amountColor = state && !SETTLED\.includes\(state\) \? colors\.muted : isDark \? colors\.emerald : colors\.ink;/,
    'the amount colour rule is frozen: muted unless settled, then emerald in dark and ink in light'
  );
  // Money is cents through formatBudget() and nothing else (CLAUDE.md).
  assert.match(money, /\{formatBudget\(cents\)\}/);
  assert.doesNotMatch(money, /color\?:\s*string/, 'no caller may pass the money colour in');

  // The surfaces that render an amount AS an amount resolve every colour from
  // the palette. A raw literal here is how a money figure drifts off the rule
  // above without touching this file.
  const MONEY_SURFACES = [
    'ui/primitives/MoneyText.tsx',
    'ui/primitives/JobCard.tsx',
    'components/WorkerJobCard.tsx',
    'components/BrowseJobCard.tsx',
    'components/MarketJobPreview.tsx',
    'components/HubCard.tsx',
  ];
  for (const path of MONEY_SURFACES) {
    const source = stripComments(read(path));
    assert.match(source, /formatBudget\(/, `${path} must still be a money surface`);
    assert.doesNotMatch(
      source,
      /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/,
      `${path} must resolve every colour from the palette`
    );
  }
});

// ---------------------------------------------------------------------------
// F5 — the saturated per-category tile fill stays retired in dark.
//
// CATCHES: a future run "simplifying" one of the seven ternaries back to a
// bare `{ backgroundColor: accent.bg }`, which puts JOB_CATEGORY_COLORS'
// purple, orange or amber tile back on the near-black ground. That table is a
// LIGHT-ONLY table since fidelity(2); nothing says so in the type system, so
// only a test can hold it.
//
// WHY NOT VACUOUS: the consumer list is DERIVED by walking the tree for
// readers of the table and asserted non-empty, and the check runs per file —
// reverting one of them fails on that file by name. It counts the GATED reads
// against the TOTAL reads, so adding an ungated read to a file that already
// has a gated one still fails, and it is deliberately shape-agnostic: the
// contract is "on the false branch of an isDark ternary", not "inside a
// backgroundColor". PostJobScreen passes the accent as a Chip prop rather than
// a style and is just as correct.
// ---------------------------------------------------------------------------
test('emerald fence: the per-category tile fill is unreachable in dark', () => {
  const ACCENT_READ = /(?:\baccent|categoryAccent\([^)]*\))\.(?:bg|icon)\b/g;
  // The same read, but preceded by the FALSE-branch position of an `isDark ?`
  // ternary. The middle group forbids a nested `?`/`:` so the match cannot
  // straddle two ternaries and report a false positive.
  const GATED_READ =
    /isDark \? [^:?]{1,60} : [^;?]{0,40}?(?:\baccent|categoryAccent\([^)]*\))\.(?:bg|icon)\b/g;

  const consumers = sourceFiles.filter((file) => ACCENT_READ.test(stripComments(read(file))));
  assert.ok(
    consumers.length >= 6,
    `expected the per-category accent consumers, saw ${consumers.length}: ${consumers}`
  );

  for (const path of consumers) {
    const flat = flatten(read(path));
    const reads = [...flat.matchAll(ACCENT_READ)].length;
    const gated = [...flat.matchAll(GATED_READ)].length;
    assert.equal(
      gated,
      reads,
      `${path}: every read of the saturated per-category table must sit on the ` +
        `FALSE branch of an isDark ternary, so dark never sees it ` +
        `(${gated} of ${reads} do)`
    );
  }

  // The table itself is not deleted — it is the LIGHT rendering, and light is
  // frozen. Retiring it outright is a light-run decision, not a dark one.
  const jobs = stripComments(read('lib/jobs.ts'));
  assert.match(jobs, /export const JOB_CATEGORY_COLORS: Record<JobCategory, \{ bg: string; icon: string \}>/);
  assert.match(jobs, /export function categoryAccent\(category: JobCategory\)/);
});

// ---------------------------------------------------------------------------
// F6 — the mechanism that hides a tab item without unregistering its route.
//
// CATCHES: a future run swapping `display: 'none'` for another way of hiding
// the item — `tabBarButton: () => null` is the usual one — which leaves the
// route dispatchable and every existing assertion green while the bar keeps a
// phantom sixth flex slot and the customer pill visibly regresses.
//
// WHY NOT VACUOUS: tests/mode.test.mjs:310 asserts that Map and MyJobs CARRY
// HIDDEN_TAB_ITEM_OPTIONS; nothing asserts what those options ARE. This pins
// the value, so the indirection cannot be hollowed out from the inside.
//
// The ground behind the pill is asserted here as well as at
// tests/layout.test.mjs:47, and that duplication is deliberate — the only one
// in this file. emerald D2's instruction says every layer behind the pill
// should be TRANSPARENT; the fix ADDED a painted ground, because nothing of
// ours was painting and the gap fell through to the iOS root view, which is
// white by platform default. That is the assertion a future run is most likely
// to read as a contradiction of the decision it cites and "fix" by deleting.
// Two independent failures make that harder to talk past than one.
// ---------------------------------------------------------------------------
test('emerald D1 fence: hiding a tab item never unregisters its route', () => {
  const bottomNav = flatten(read('ui/primitives/BottomNav.tsx'));

  assert.match(
    bottomNav,
    /export const HIDDEN_TAB_ITEM_OPTIONS: BottomTabNavigationOptions = \{ tabBarItemStyle: \{ display: 'none' \}, \};/,
    "the hidden-item mechanism must stay `display: 'none'` on the item wrapper — " +
      'it removes the slot from layout entirely, where a null tabBarButton leaves ' +
      'a phantom flex column behind'
  );

  // The two routes it hides are still REGISTERED with their real navigators,
  // which is the half that keeps every dispatch in F2 resolving.
  const customerRoot = flatten(read('navigation/CustomerRoot.tsx'));
  assert.match(customerRoot, /name="Map" component=\{MapStackNavigator\} options=\{HIDDEN_TAB_ITEM_OPTIONS\}/);
  assert.match(
    customerRoot,
    /name="MyJobs" component=\{MyJobsStackNavigator\} options=\{HIDDEN_TAB_ITEM_OPTIONS\}/
  );

  // THE GROUND. One View on the single parent of both trees, resolved from the
  // palette so a theme change repaints it. Without it the pill's float gap
  // falls through to the iOS root view and the white band comes back in dark.
  const shell = flatten(read('navigation/ModeShell.tsx'));
  assert.match(
    shell,
    /<View style=\{\[styles\.tree, \{ backgroundColor: palette\.background \}\]\}>/,
    'ModeShell must PAINT the ground behind the bar row — emerald D2 added this ' +
      'paint rather than removing one, and deleting it restores the white band'
  );
  assert.match(
    shell,
    /\{mode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>\}/,
    'the ground must wrap the tree swap so it covers both modes at once'
  );
  // …and it stays the ONLY painted surface in the bar row: the pill's own.
  assert.doesNotMatch(
    flatten(read('ui/primitives/BottomNav.tsx')),
    /tabBarBackground/,
    'no second ground may be introduced through the library’s own hook for one'
  );
});

// ===========================================================================
// HOME RECONSTRUCTION FENCES (home(2), home(7), home(8), home(9)).
//
// Same charter as the emerald fences above: each one names the reversion it
// catches, and each derives its number from the source rather than restating
// it, so deleting the mechanism makes the parse fail instead of the assertion
// pass.
// ===========================================================================

/** The width/height an 8-byte-signature PNG declares in its IHDR. */
const pngSize = (path) => {
  const bytes = readFileSync(join(root, path));
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${path} is not a PNG`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

/** A bare number assigned to `name` at module scope. */
const constantOf = (source, name) => {
  const hit = new RegExp(`const ${name} = ([-0-9./ ]+);`).exec(source);
  assert.ok(hit, `${name} must stay a plain numeric constant`);
  // eslint-disable-next-line no-new-func -- a digits-and-operators literal only.
  return Number(new Function(`return (${hit[1]});`)());
};

// ---------------------------------------------------------------------------
// H2 — the B drape is a FRACTION OF THE SCREEN, and the headline column that
// clears it is computed from the same number.
//
// CATCHES: the fixed 92x75 box coming back (it made the drape ~a fifth to a
// third of the screen depending on the device, and the fixed 96pt reserve it
// needed is what wrapped the promo heading onto three lines); the heading's
// font size being shrunk instead, which was explicitly NOT the problem; and
// the box being given an aspect the artwork does not have.
// ---------------------------------------------------------------------------
test('home(2) fence: the B drape is a fraction of the screen, and the copy column follows it', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));
  const flat = flatten(read('screens/HomeScreen.tsx'));

  const ratio = constantOf(home, 'B_DRAPE_WIDTH_RATIO');

  // home(11) — THIS USED TO PIN THE RATIO AT 0.183 AND THAT WAS THE WRONG
  // QUANTITY. 0.183 is the share of the screen the BOX takes. The drape is a
  // cut-out that covers only 60.7% of its own canvas, so the box drew a mark
  // 11.1% of the screen wide and this assertion never saw it. The pin is
  // replaced by the number the eye actually measures — the INK — derived from
  // the file rather than declared, so a replacement drape with different
  // margins moves the arithmetic instead of silently shrinking the mark.
  // home(15) sets the master's band on the ink; what stays here is the shape of
  // the relationship, and the bound that says a box and its ink are not the
  // same number.
  const ink = inkBounds(join(root, 'assets/prestige/brazos_b_drape.png'));
  assert.ok(ink.hasAlphaChannel, 'the dark mark is a cut-out; a re-bake changes what this measures');
  assert.ok(
    ink.width < 0.95,
    `brazos_b_drape.png covers ${(ink.width * 100).toFixed(1)}% of its canvas — if that reaches ` +
      'the edges the box IS the ink and this fence is measuring the wrong thing'
  );
  const inkShareOfScreen = ratio * ink.width;
  assert.ok(
    inkShareOfScreen < ratio,
    'the ink cannot be wider than the box that draws it; the measurement is wrong'
  );

  // home(15) — THE MASTER'S BAND, on the ink, as a share of the CARD.
  // Measured on docs/mockups/44_customer_home_dark.png: the gold ink spans
  // x 684..843 (160px) inside a card 856px wide, i.e. 18.7%. The screen padding
  // is what turns a share of the card into a share of the screen, so it is read
  // from the design settings rather than restated.
  const padding = /screenPadding: (\d+)/.exec(read('lib/homeDesignStudio.tsx'));
  assert.ok(padding, 'the screen padding must stay a plain number in the design settings');
  const cardShareOfScreen = (393 - 2 * Number(padding[1])) / 393;
  const inkShareOfCard = inkShareOfScreen / cardShareOfScreen;
  assert.ok(
    Math.abs(inkShareOfCard - 0.187) <= 0.02,
    `the drawn mark is ${(inkShareOfCard * 100).toFixed(1)}% of the card's width; master 44 ` +
      'measures 18.7% (+/- 2%)'
  );

  // And the copy stops where the master's does, at the INK's left edge rather
  // than the box's — the box's left fifth is the asset's own empty margin, and
  // reserving it as well is what made the heading's column too narrow.
  const inset = constantOf(home, 'B_DRAPE_RIGHT_INSET');
  const overlap = constantOf(home, 'B_DRAPE_COPY_OVERLAP');
  const boxWidth = Math.round(393 * ratio);
  const reservedForMark = boxWidth + inset - overlap;
  const inkLeftFromBoxRight = boxWidth * (1 - ink.left);
  assert.ok(
    reservedForMark <= Math.round(inkLeftFromBoxRight) + 2,
    `the copy column reserves ${reservedForMark}pt but the mark's ink only starts ` +
      `${inkLeftFromBoxRight.toFixed(1)}pt in — the empty margin is being reserved twice`
  );
  assert.ok(
    reservedForMark > 0,
    'the copy column must still clear the mark; a reserve of zero puts text under the B'
  );

  // The aspect is the ARTWORK's, re-derived from both files on disk — so a
  // replacement drape of a different shape fails here rather than silently
  // letterboxing inside a box the headline column was measured from.
  const declaredAspect = constantOf(home, 'B_DRAPE_ASPECT');
  for (const path of ['assets/brand/brazos_b_drape.png', 'assets/prestige/brazos_b_drape.png']) {
    const { width, height } = pngSize(path);
    assert.ok(
      Math.abs(declaredAspect - width / height) < 0.001,
      `${path} is ${width}x${height}; B_DRAPE_ASPECT says ${declaredAspect}`
    );
  }

  // The mechanism: one width, measured at render, feeding BOTH the art box and
  // the headline's reserve.
  assert.match(
    flat,
    /const width = Math\.round\(screenWidth \* B_DRAPE_WIDTH_RATIO\);/,
    'the drape width must be measured off the live screen width'
  );
  assert.match(
    flat,
    /art: \{ width, height: Math\.round\(width \/ B_DRAPE_ASPECT\) \}/,
    'the drape height must be derived from the artwork aspect, never declared'
  );
  assert.match(
    flat,
    /copyPaddingRight: width \+ B_DRAPE_RIGHT_INSET - B_DRAPE_COPY_OVERLAP/,
    'the headline column must be reserved FROM the drape width, not from a literal'
  );
  assert.match(flat, /style=\{\[styles\.heroMark, isDark && styles\.heroMarkDark, isDark && bDrape\.art\]\}/);
  assert.match(flat, /isDark && \{ paddingRight: bDrape\.copyPaddingRight \}/);

  // The fixed pair must not return, in either place.
  assert.doesNotMatch(
    flat,
    /heroMarkDark: \{[^}]*width:/,
    'heroMarkDark must not declare a fixed width again — a pt value cannot be a share of the screen'
  );
  assert.doesNotMatch(
    flat,
    /heroCopyDark/,
    'the fixed 96pt dark reserve must not come back; it is computed from the drape now'
  );

  // The drape's stylesheet inset and the constant the copy is reserved from
  // are two halves of one number.
  const styleRight = /heroMarkDark: \{ top: \d+, right: (\d+) \}/.exec(flat);
  assert.ok(styleRight, 'heroMarkDark must keep a plain `right` inset');
  assert.equal(
    Number(styleRight[1]),
    inset,
    'heroMarkDark.right and B_DRAPE_RIGHT_INSET must stay the same number'
  );

  // PRE-DECIDED, and fenced because it is the tempting wrong fix: the promo
  // heading's size is correct and the wrap was never a font problem.
  assert.match(
    flat,
    /heroHeadline: \{ fontFamily: fonts\.display, fontSize: 25,/,
    'the promo heading stays at 25pt — shrinking type is not the fix for the wrap'
  );
});

// ---------------------------------------------------------------------------
// H3 — the display serif tracks at -1, in BOTH token surfaces, and NOWHERE
// else on the scale.
//
// CATCHES: the tracking landing in one surface and not the other (ui/tokens.ts
// and lib/theme.ts are two independent scales that screens reach through
// different doors, so a one-sided change is invisible until a device pass);
// and it leaking down onto body/label/caption/sub/eyebrow, where negative
// tracking closes small type up until it smudges and where `eyebrow` needs the
// opposite sign entirely.
// ---------------------------------------------------------------------------
test('home(3) fence: -1 tracking on the serif headings, and only there', () => {
  const surfaces = [
    { path: 'ui/tokens.ts', scale: 'type', spaced: ['display', 'h1', 'h2'], plain: ['title', 'body', 'sub', 'caption', 'eyebrow'] },
    { path: 'lib/theme.ts', scale: 'typography', spaced: ['title', 'heading', 'subheading'], plain: ['body', 'label', 'caption'] },
  ];

  for (const { path, scale, spaced, plain } of surfaces) {
    const source = stripComments(read(path));
    // Sliced rather than regexed: both needles must be FOUND, and -1 from
    // indexOf would otherwise slice from the end of the file and match nothing
    // while looking like a pass.
    const start = source.indexOf(`export const ${scale} = {`);
    assert.notEqual(start, -1, `${path} must keep ${scale} as a plain object literal`);
    const end = source.indexOf('\n} as const', start);
    assert.notEqual(end, -1, `${path}: ${scale} must stay an \`as const\` literal`);
    const block = source.slice(start, end);
    const roles = Object.fromEntries(
      [...block.matchAll(/^\s{2}(\w+): \{([^}]*)\},?$/gm)].map((m) => [m[1], m[2]])
    );

    for (const role of [...spaced, ...plain]) {
      assert.ok(roles[role], `${path}: ${scale}.${role} is no longer a one-line role`);
    }

    for (const role of spaced) {
      assert.match(
        roles[role],
        /fontFamily: fonts\.display/,
        `${path}: ${scale}.${role} must stay a display-serif role`
      );
      assert.match(
        roles[role],
        /letterSpacing: -1(,|\s|$)/,
        `${path}: ${scale}.${role} must carry letterSpacing: -1`
      );
    }

    for (const role of plain) {
      assert.doesNotMatch(
        roles[role],
        /letterSpacing: -/,
        `${path}: ${scale}.${role} must not take negative tracking — it is body/small/eyebrow type`
      );
    }

    // Nothing under 15pt may take it, whatever the role is called.
    for (const [role, decl] of Object.entries(roles)) {
      const size = /fontSize: (\d+)/.exec(decl);
      if (!size || Number(size[1]) >= 15) continue;
      assert.doesNotMatch(
        decl,
        /letterSpacing: -/,
        `${path}: ${scale}.${role} is ${size[1]}pt — negative tracking stops at 15`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// H4 — the atmosphere is a FIXED layer, outside the scroller, on both homes.
//
// CATCHES: the layer being moved inside the ScrollView (where it would travel
// with the page — the one thing a fixed atmosphere must not do); one home
// getting it and the other not; the scroller's own ground being restored on
// top of it; and the gate being dropped, which would drop an opaque 1080x2335
// dark room onto the light palette.
// ---------------------------------------------------------------------------
test('home(4) fence: the atmosphere sits behind both homes and never scrolls', () => {
  const layer = stripComments(read('components/HomeAtmosphere.tsx'));

  // It is the one mount of the raster, and it is gated.
  assert.match(layer, /require\('\.\.\/assets\/prestige\/home-atmosphere-dark\.png'\)/);
  assert.match(
    layer,
    /if \(!isDark\) return null;/,
    'the atmosphere is an OPAQUE dark raster — light must render nothing at all'
  );
  // Fixed, full-bleed, aspect-preserving.
  assert.match(flatten(layer), /layer: \{ position: 'absolute', left: 0, right: 0, bottom: 0, \}/);
  assert.match(flatten(layer), /style=\{\[styles\.layer, \{ top: -insets\.top \}\]\}/,
    'the layer must be pulled up by the safe-area inset or it leaves a band above the notch');
  assert.match(flatten(layer), /resizeMode="cover"/,
    'cover fills without distorting; contain would letterbox the ground');

  for (const path of ['screens/HomeScreen.tsx', 'screens/WorkerHomeScreen.tsx']) {
    const flat = flatten(read(path));
    assert.match(flat, /<HomeAtmosphere \/>/, `${path} must mount the atmosphere`);

    // OUTSIDE the scroller: the mount has to appear before the ScrollView
    // opens, and must not appear again anywhere after it.
    const mount = flat.indexOf('<HomeAtmosphere />');
    const scroller = flat.indexOf('<ScrollView');
    assert.notEqual(scroller, -1, `${path} must still render a ScrollView`);
    assert.ok(
      mount < scroller,
      `${path}: the atmosphere must be a SIBLING before the scroller, not a row inside it`
    );
    assert.equal(
      flat.indexOf('<HomeAtmosphere />', mount + 1),
      -1,
      `${path} must mount the atmosphere exactly once`
    );
  }

  // Customer Home's scroller paints its own ground; in dark it must stand down
  // or the layer beneath it is invisible. (Worker Home's ScrollView has no
  // `style` at all, so there is nothing there to neutralise.)
  const home = flatten(read('screens/HomeScreen.tsx'));
  assert.match(home, /style=\{\[styles\.scroll, isDark && styles\.scrollOverAtmosphere\]\}/);
  assert.match(home, /scrollOverAtmosphere: \{ backgroundColor: 'transparent' \}/);
  assert.doesNotMatch(
    flatten(read('screens/WorkerHomeScreen.tsx')),
    /<ScrollView style=/,
    'Worker Home’s scroller must stay unpainted, or it would cover the layer'
  );

  // home(12) — THE SECOND SURFACE. A ScrollView paints its `style` AND its
  // `contentContainerStyle`, and this fence checked only the first while the
  // second painted an opaque ground over the whole layer. It was green on the
  // exact defect it names ("the scroller's own ground being restored on top of
  // it"). Both surfaces are checked now, on BOTH homes, and derived: the style
  // key each screen hands its content container is parsed out and its own
  // declaration read, so renaming the key cannot walk past this.
  for (const path of ['screens/HomeScreen.tsx', 'screens/WorkerHomeScreen.tsx']) {
    const flat = flatten(read(path));
    const container = /contentContainerStyle=\{\[?([^}\]]*)/.exec(flat);
    assert.ok(container, `${path} must still hand its scroller a content container style`);

    const base = /styles\.(\w+)/.exec(container[1]);
    assert.ok(base, `${path}: the content container must name a stylesheet key`);
    const declaration = new RegExp(`\\b${base[1]}: \\{([^}]*)\\}`).exec(flat);
    assert.ok(declaration, `${path}: styles.${base[1]} must stay a plain style object`);

    const ground = /backgroundColor: ([^,}]+)/.exec(declaration[1]);
    if (!ground) continue; // nothing painted at all — the layer shows through.

    // It paints. Then dark must be given a transparent override at the call
    // site, and that override must actually be transparent.
    const override = new RegExp(`isDark && styles\\.(\\w+),? \\{ paddingHorizontal|isDark && styles\\.(\\w+)`).exec(
      container[1]
    );
    assert.ok(
      override,
      `${path}: styles.${base[1]} paints ${ground[1].trim()} — in dark that covers the atmosphere, ` +
        'so the content container needs an isDark override the way the scroller has one'
    );
    const key = override[1] ?? override[2];
    assert.match(
      flat,
      new RegExp(`${key}: \\{ backgroundColor: 'transparent' \\}`),
      `${path}: styles.${key} must be the transparent ground, not another colour`
    );
  }
});

// ---------------------------------------------------------------------------
// H19 — LIGHT IS FROZEN, and this is the whole of what the master-44 run could
// have moved in it.
//
// CATCHES: any future dark-master correction landing on an ungated value.
// That is not hypothetical — home(16) did exactly this with three of its four
// numbers, and it took a screenshot to notice, because a dark-only intent
// applied to a shared style is invisible in every dark review.
//
// WHY NOT VACUOUS: every value here is one this run actually touched on the
// dark side, so each pair is a real fork that could collapse. The dark half of
// each pair is asserted in its own fence above; this one asserts that light
// still has its own.
//
// Screenshot-checked at the same time: the pre-run tree rendered through the
// same harness gives 0 differing pixels on light Customer Home and 0 on light
// Worker Home. This fence is what keeps that true without a browser.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// H24 — THE SERVICE CHIPS FIT ON TWO ROWS, and the arithmetic says so.
//
// Master 44 draws five pills on two rows. This app drew six-across-THREE, with
// "Other" alone on the last one, because row 2 wanted 359pt of a 353pt content
// width. Nothing about that wrap was visible in a stylesheet: it is a sum.
//
// CATCHES: the dark paddings drifting back up (10pt each side puts row 2 over
// again on the first device that renders it), the row gap going back to
// spacing.sm, and the screen gutter widening without the pills being paid for.
//
// WHY NOT VACUOUS: the three content widths below are MEASURED — icon, gap and
// label, in a real 393pt viewport, from .shots/customer-home-dark.png — and
// every other term is read out of the source. Raise a padding by two and this
// goes red before a screenshot could show it.
// ---------------------------------------------------------------------------
test('home(24) fence: master 44’s five service chips fit on master 44’s two rows', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));
  const padding = Number(/screenPadding: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);

  const chipPad = Number(/compactChipDark: \{ paddingHorizontal: (\d+) \}/.exec(flat)?.[1]);
  const rowGap = Number(/serviceRowDark: \{ gap: (\d+) \}/.exec(flat)?.[1]);
  assert.ok(chipPad > 0 && rowGap > 0, 'the dark chip row keeps its own padding and gap');

  // icon (16) + gap (6) + label at 14pt, measured per pill. Row 2 is
  // "House Cleaning", "TV Mounting" and "Other".
  const ROW_2_CONTENT = [122, 105, 56];
  const wanted =
    ROW_2_CONTENT.reduce((sum, w) => sum + w + 2 * chipPad, 0) + rowGap * (ROW_2_CONTENT.length - 1);
  const available = 393 - 2 * padding;
  assert.ok(
    wanted <= available,
    `row 2 wants ${wanted}pt of ${available}pt, so "Other" wraps to a third row. Master 44 draws two`
  );

  // LIGHT IS UNTOUCHED: it keeps the shared 10pt compact padding and the 8pt
  // gaps, and it is allowed its third row — the Heritage composition is frozen.
  assert.match(flat, /compactServiceChip: \{ paddingHorizontal: 10 \}/);
  assert.match(flat, /serviceRow: \{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing\.sm \}/);
  assert.match(flat, /serviceRows: \{ gap: spacing\.sm \}/);

  // PER-SECTION SPACING, not one global gap. Master 44's own gaps below the
  // hero are five different numbers; `sectionGap` is one. Each dark override
  // below is the difference between them, and each is measured:
  //   search      237.0pt from the content top   (+8 on a 229 flow)
  //   chip row 1  328.0                          (sectionGap, unchanged)
  //   chip row 2  382.6                          (row gap 8 -> 10)
  //   promo card  449.1                          (+3 on a 20pt sectionGap)
  assert.match(flat, /searchFieldDark: \{ marginTop: 8 \}/);
  assert.match(flat, /serviceRowsDark: \{ gap: 10 \}/);
  assert.match(flat, /heroCardDark: \{ marginTop: 3,/);
  assert.ok(
    !/gap: design\.sectionGap \+/.test(flat),
    'the rhythm is per-section; sectionGap stays the one number the studio shows'
  );
});

test('home(19) fence: nothing the master-44 run changed reached the light theme', () => {
  const home = flatten(read('screens/HomeScreen.tsx'));
  const bar = stripComments(read('ui/primitives/BottomNav.tsx'));

  // TYPE — home(16)/home(16b).
  assert.match(home, /headline: \{ maxWidth: '73%', fontFamily: fonts\.display, fontSize: 39, lineHeight: 45,/);
  assert.match(home, /sectionTitle: \{ fontFamily: fonts\.display, fontSize: 22,/);
  assert.match(home, /heroHeadline: \{ fontFamily: fonts\.display, fontSize: 25, lineHeight: 29,/);
  // home(23) forked the subtitle: dark drops to 14 to set on master 44's one
  // line, light keeps the 16/8 the Heritage composition was signed off at.
  assert.match(home, /heroSubtitle: \{ maxWidth: '73%', marginTop: spacing\.sm, fontSize: 16,/);
  assert.match(home, /heroButtonText: \{ fontFamily: fonts\.display, fontSize: 24, fontWeight: '700', color: colors\.forest \}/);

  // ARTWORK — home(14)/home(15). Light keeps the Heritage boxes and `contain`.
  assert.match(home, /homeHeroArt: \{ position: 'absolute', zIndex: 0, width: 112, height: 124, right: -6, top: 47 \}/);
  assert.match(home, /heroMark: \{ position: 'absolute', top: 12, right: 10, width: 79, height: 101 \}/);
  assert.match(home, /resizeMode=\{isDark \? 'cover' : 'contain'\}/);

  // GROUND — home(12). Light's content container still paints its own.
  assert.match(home, /content: \{ flexGrow: 1, backgroundColor: colors\.homeBackground,/);

  // THE MODE SWITCH — home(17).
  assert.match(/modeSwitch: \{([^}]*)\}/.exec(home)[1], /borderWidth: 1\.25, borderColor: colors\.gold/);

  // THE [ + ] — home(18).
  assert.equal(constantOf(bar, 'CREATE_BUTTON_LIGHT_SIZE'), 52);
  assert.equal(constantOf(bar, 'CREATE_BUTTON_LIGHT_RAISE'), 14);
  assert.match(
    flatten(read('ui/primitives/BottomNav.tsx')),
    /backgroundColor: colors\.forest, borderWidth: 1, borderColor: colors\.gold,/,
    "light's control keeps the forest fill and the gold ring decision 3 gave it"
  );

  // THE ATMOSPHERE — home(13). Light renders none of it.
  assert.match(stripComments(read('components/HomeAtmosphere.tsx')), /if \(!isDark\) return null;/);
});

// ---------------------------------------------------------------------------
// H17 — "Switch to Worker" is ringed in the hairline token in dark, and LIGHT
// keeps the gold it has always had.
//
// CATCHES: the ring going back to palette gold, or to any weight above a
// hairline, on the one control that sits highest on the screen and next to the
// artwork; and the dark treatment leaking into light, which is frozen.
//
// WHY NOT VACUOUS: the dark override and the base are read separately and
// compared to each other, so the fence fails if either the override disappears
// or the base picks the dark values up.
// ---------------------------------------------------------------------------
test('home(17) fence: the mode switch wears the hairline in dark, gold in light', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));

  const base = /modeSwitch: \{([^}]*)\}/.exec(flat);
  assert.ok(base, 'modeSwitch must stay a plain style object');
  assert.match(base[1], /borderColor: colors\.gold/, 'LIGHT is frozen on the gold ring');
  assert.match(base[1], /minHeight: 44/, "44 is CLAUDE.md's touch floor; master 44 is under it");

  const dark = /modeSwitchDark: \{([^}]*)\}/.exec(flat);
  assert.ok(dark, 'dark must override the ring rather than repainting it for both themes');
  assert.match(
    dark[1],
    /borderColor: colors\.border/,
    'the dark ring is the hairline token — lib/theme.ts calls it gold at hairline alpha'
  );
  const weight = /borderWidth: ([\d.]+)/.exec(dark[1]);
  assert.ok(weight, 'the dark ring must state its own weight');
  const baseWeight = Number(/borderWidth: ([\d.]+)/.exec(base[1])[1]);
  assert.ok(
    Number(weight[1]) < baseWeight,
    `master 44 rings this at 0.69pt; dark must draw it lighter than light's ${baseWeight}`
  );

  assert.match(
    flat,
    /styles\.modeSwitch, isDark && styles\.modeSwitchDark,/,
    'the override has to reach the control, in that order'
  );
});

// ---------------------------------------------------------------------------
// H16 — the display serif is ONE ladder derived from master 44's cap heights,
// not three sizes chosen one at a time.
//
// CATCHES: a rung being nudged back to a round number; the conversion being
// deleted and the sizes reverting to literals; and — the one that matters most
// — the hero growing back past the width the artwork leaves it, which is what
// puts its second line under the chair or onto a third line.
//
// WHY NOT VACUOUS: the sizes are recomputed here from the caps the screen
// declares, and each is checked against the value actually shipped. Deleting
// MASTER_SERIF_CAPS makes the parse fail rather than the assertion pass. The
// two rungs that deliberately DIVERGE from the ladder are asserted as
// divergences with their reasons, so neither can drift quietly.
// ---------------------------------------------------------------------------
test('home(16) fence: one serif ladder, measured off master 44', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));
  const flat = flatten(read('screens/HomeScreen.tsx'));

  const caps = /const MASTER_SERIF_CAPS = \{([\s\S]*?)\} as const;/.exec(home);
  assert.ok(caps, 'MASTER_SERIF_CAPS must stay a plain object literal');
  const cap = (name) => {
    const hit = new RegExp(`${name}: (\\d+)`).exec(caps[1]);
    assert.ok(hit, `MASTER_SERIF_CAPS must keep a measured cap for ${name}`);
    return Number(hit[1]);
  };
  const toDevice = constantOf(home, 'MASTER_TO_DEVICE');
  const capRatio = constantOf(home, 'GEORGIA_CAP_RATIO');
  const ladder = (name) => Math.round((cap(name) * toDevice) / capRatio);

  // home(20): 393/941 -> 852/1844. The master FILE was replaced (941x1672 ->
  // 853x1844) and a cap height is a vertical measure. The old file's 0.5628
  // aspect meant only its width transferred to a 393x852 device, so the width
  // ratio stood in for both; 853x1844 is 0.46258 against the device's 0.46127,
  // so the vertical conversion is now the honest one for a stem height.
  assert.ok(
    Math.abs(toDevice - 852 / 1844) < 0.0001,
    'the conversion is master 44’s own height against the reference device'
  );

  // "Live Nearby" is the rung that was out by more than a rounding, and it is
  // the one the screen computes rather than states.
  assert.match(
    flat,
    /sectionTitleDark: \{ fontSize: serifSize\(MASTER_SERIF_CAPS\.sectionTitle\) \}/,
    'the section title must be COMPUTED from the ladder, not restated as a number'
  );
  // home(20): 16 -> 20. The replaced master's L measures a 30px cap (13.86pt),
  // where the old file's measured 26px (10.86pt). This REVERSES home(16)'s shrink.
  assert.equal(ladder('sectionTitle'), 20, 'master 44’s "Live Nearby" measures 20pt of Georgia');

  // home(16b) — EVERY RUNG IS DARK-SCOPED. Master 44 is a DARK master; light is
  // the frozen Heritage composition and none of these numbers is its. The
  // ladder reached both themes when it landed, and this is what stops it.
  assert.match(
    flat,
    /sectionTitle: \{ fontFamily: fonts\.display, fontSize: 22,/,
    'light keeps its 22pt section title'
  );
  assert.match(
    flat,
    /styles\.sectionTitle, isDark && styles\.sectionTitleDark/,
    'the dark rung has to reach the control'
  );
  // home(23): the dark leading is no longer light's 45/39 ratio. Master 44 runs
  // 82px = 37.9pt of line pitch, which is an ABSOLUTE measurement; HEADLINE_LEADING
  // is that pitch over the size the column allows, so the studio slider still
  // moves size and leading together.
  assert.match(
    flat,
    /isDark && \{ maxWidth: headlineColumn, fontSize: design\.heroFontSize, lineHeight: Math\.round\(design\.heroFontSize \* HEADLINE_LEADING\),? \}/,
    "the studio's live hero size is a DARK instrument; light keeps styles.headline's own 39/45"
  );
  const leading = constantOf(home, 'HEADLINE_LEADING');
  assert.ok(
    Math.abs(leading * Number(/heroFontSize: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]) - 37.9) < 1.2,
    `the dark headline's leading must resolve to master 44's measured 37.9pt pitch, not ${(leading * 31).toFixed(1)}`
  );
  assert.match(
    flat,
    /headline: \{ maxWidth: '73%', fontFamily: fonts\.display, fontSize: 39, lineHeight: 45,/,
    'light keeps its 39/45 hero'
  );
  assert.match(
    flat,
    /heroHeadlineDark: \{ color: colors\.ink, lineHeight: 27 \}/,
    'the tightened promo leading is dark-only'
  );
  assert.match(
    flat,
    /heroHeadline: \{ fontFamily: fonts\.display, fontSize: 25, lineHeight: 29,/,
    'light keeps its 29pt promo leading'
  );

  // THE HERO IS GOVERNED BY ITS COLUMN, not by its cap — and home(23) makes
  // the column a real geometric statement rather than a subtraction of the
  // artwork's whole box. The box's outer eighth carries no ink (the scene is
  // vignetted), so the copy may run into it; what it may not reach is the ink.
  //
  // 210.0pt is "off your plate." at 30pt of Georgia in a real 393pt viewport,
  // measured on .shots/customer-home-dark.png by scripts/home-diff.mjs.
  // (home(16) recorded 281.6pt at 39pt for a different string, "Take a task
  // off"; that number is void — the string it measured is not the one that
  // sets the widest line.)
  const hero = Number(/heroFontSize: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))?.[1]);
  assert.ok(hero > 0, 'the hero size must stay a plain number in the design settings');
  const padding = Number(/screenPadding: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);
  const artBox = /const HERO_ART_DARK = \{ width: (\d+), height: \d+, right: (-?\d+), top: \d+ \}/.exec(home);
  assert.ok(artBox, 'the dark hero must keep a plain, readable box');
  const artWidth = Number(artBox[1]);
  const artRightEdge = 393 - padding - Number(artBox[2]);
  const artInkLeft = artRightEdge - artWidth * (1 - constantOf(home, 'HERO_ART_INK_LEFT'));

  // The column is COMPUTED from that box at render, so this asserts the
  // arithmetic rather than a percentage someone typed.
  assert.match(
    flat,
    /const artRight = screenWidth - design\.screenPadding - HERO_ART_DARK\.right;/,
    "the dark headline's column has to be derived from the artwork's own box"
  );
  assert.match(
    flat,
    /const artInkLeft = artRight - HERO_ART_DARK\.width \* \(1 - HERO_ART_INK_LEFT\);/,
    'and it has to stop at the INK, not at the box — a vignetted scene is empty at its edges'
  );
  const columnWidth = Math.round(artInkLeft - padding);

  const LONGEST_LINE_AT_30 = 210.0;
  const longest = (LONGEST_LINE_AT_30 * hero) / 30;
  assert.ok(
    longest <= columnWidth,
    `at ${hero}pt "off your plate." sets ${longest.toFixed(1)}pt into ${columnWidth}pt ` +
      'of column, so it wraps to a third line. Master 44 sets the headline on exactly two'
  );
  // And exactly two: the break is the operator's own, and nothing else may add one.
  assert.match(
    flat,
    /Take a task\{'\\n'\}off your plate\./,
    "master 44's headline is two lines, broken after 'task' by the operator"
  );
  assert.ok(
    hero <= ladder('heroHeadline'),
    `the cap height says ${ladder('heroHeadline')}pt; the column says less. The smaller wins`
  );

  // THE TWO DELIBERATE DIVERGENCES, asserted as divergences.
  assert.match(
    flat,
    /heroHeadline: \{ fontFamily: fonts\.display, fontSize: 25,/,
    'the promo heading is pinned at 25 — see the H2 fence; the ladder says 22 and that 3pt is owed'
  );
  assert.equal(ladder('promoHeading'), 22, 'the recorded gap for the promo heading is 3pt');
  assert.match(
    flat,
    /heroButtonText: \{ fontFamily: fonts\.display, fontSize: 24,/,
    'the CTA label is frozen at 24 by operator instruction'
  );
  // home(20): the replaced master moves this rung from 15 to 19, so the frozen
  // value is 5pt off the ladder rather than 9. Still not ours to move.
  assert.equal(ladder('ctaLabel'), 19, 'the CTA label is the furthest rung off the ladder');
});

// ---------------------------------------------------------------------------
// H14 — the dark hero is a SLOT: the art reaches the screen's right edge, and
// the number that says how big it is describes the ART rather than a box.
//
// CATCHES: the box being pushed off-screen with a negative `right` again to
// make a cut-out's ink look less inset (it never worked — the ink stopped
// short by the cut-out's own margin); the mode going back to `contain`, which
// letterboxes a mismatched scene inside the slot and re-opens the gap between
// the declared size and the drawn one; and the slot being given a size that no
// longer matches what master 44 measures.
//
// WHY NOT VACUOUS: the art's share of its own canvas is read out of the PNG at
// run time, so the assertion is about drawn pixels. Swap the asset and the
// number moves; the fence does not have to be told.
// ---------------------------------------------------------------------------
test('home(14) fence: the dark hero fills its slot and bleeds to the screen edge', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));

  const home = stripComments(read('screens/HomeScreen.tsx'));
  const box = /const HERO_ART_DARK = \{ width: (\d+), height: (\d+), right: (-?\d+), top: (\d+) \}/.exec(home);
  assert.ok(box, 'the dark hero must keep a plain, readable box');
  const [width, height, right, top] = [Number(box[1]), Number(box[2]), Number(box[3]), Number(box[4])];
  assert.match(
    flat,
    /homeHeroArtDark: \{ width: HERO_ART_DARK\.width, height: HERO_ART_DARK\.height, right: HERO_ART_DARK\.right, top: HERO_ART_DARK\.top,? \}/,
    'the stylesheet must take the box from the constant, or the headline column and the picture drift'
  );

  // home(20/23): the master FILE was replaced and every number here moved.
  // 151 x 135 at right: 0 came off 941x1672 and is void. The new file puts the
  // scene at 400 x 351 of its own 853x1844 pixels — x 470..870, y 221..572 —
  // which converts at 393/853 and 852/1844 to 184.3 x 162.2 pt at (216.5, 102.1).
  // A band rather than a pin: a point either way is not a design change.
  assert.ok(
    Math.abs(width - 184) <= 4,
    `master 44's scene is 184.3pt wide at 393pt; this slot is ${width}pt`
  );
  assert.ok(
    Math.abs(height - 162) <= 4,
    `master 44's scene is 162.2pt tall at 393pt; this slot is ${height}pt`
  );
  // 34.9pt below the content box's top, and `top` is measured from `intro`,
  // which starts there.
  assert.ok(
    Math.abs(top - 35) <= 3,
    `master 44 starts the scene 34.9pt below the content top; this slot starts at ${top}pt`
  );

  // IT OVERHANGS THE SCREEN, and by a measured amount. `right` is relative to
  // `intro`, inside the content box's own padding, so the drawn box reaches
  // 393 - padding - right. home(14)'s `right: 0` stopped the BOX at the padded
  // column's edge, 20pt short of the screen and 43pt short of where the master
  // puts it.
  const padding = Number(/screenPadding: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);
  const overhang = -right - padding;
  assert.ok(
    Math.abs(overhang - 7.8) <= 3,
    `master 44 runs the scene 7.8pt past the screen's right edge; this one runs ${overhang}pt`
  );

  // A room-baked scene has no alpha to be inset by, so `inkBounds` reports a
  // full canvas — the box IS the art, and that is the correct answer here.
  const ink = inkBounds(join(root, 'assets/prestige/hero_armchair_customer.png'));
  assert.equal(ink.right, 0, 'the baked scene must stay alpha-free, or this box stops describing it');

  // WHERE ITS INK ACTUALLY STARTS, re-derived from the asset rather than
  // restated. The scene is vignetted, so its outer columns carry no structure
  // at all; HERO_ART_INK_LEFT is what the headline's column has to stop at, and
  // it is measured on the rows the headline occupies (the middle band of the
  // scene) rather than over the whole canvas.
  const declaredInk = constantOf(home, 'HERO_ART_INK_LEFT');
  const measuredInk = structuredLeftFraction(
    join(root, 'assets/prestige/hero_armchair_customer.png'),
    0.53,
    0.75,
  );
  assert.ok(
    Math.abs(declaredInk - measuredInk) < 0.03,
    `HERO_ART_INK_LEFT says the scene's ink starts at ${declaredInk} of its box; the file says ` +
      `${measuredInk.toFixed(3)}. Swap the artwork and this number has to move with it`
  );

  assert.match(
    flat,
    /resizeMode=\{isDark \? 'cover' : 'contain'\}/,
    "dark fills and crops; light's Heritage crop is frozen on contain"
  );
});

/**
 * The leftmost column of a raster that carries real detail, as a fraction of
 * its own width, looking only at the rows between `v0` and `v1`.
 *
 * "Detail" is adjacent-column luminance change. A vignetted scene fades to a
 * flat wash at its edges, and a flat wash has none — which is exactly the
 * difference between the box a slot reserves and the picture a reader sees.
 */
function structuredLeftFraction(path, v0, v1) {
  const img = decode(path);
  const y0 = Math.round(v0 * img.height);
  const y1 = Math.round(v1 * img.height);
  for (let x = 0; x < img.width - 1; x += 1) {
    let hits = 0;
    for (let y = y0; y <= y1; y += 1) {
      if (Math.abs(luminance(...img.at(x, y)) - luminance(...img.at(x + 1, y))) > 4) hits += 1;
    }
    if (hits >= (y1 - y0) * 0.05) return x / img.width;
  }
  assert.fail(`${path} carries no structure between ${v0} and ${v1} of its height`);
}

// ---------------------------------------------------------------------------
// H4b — the atmosphere is a VIGNETTE, and the layer crops rather than fits.
//
// CATCHES: the raster being swapped for a flat plate (which is what
// `homeBackground` already is — a second flat ground buys nothing and costs
// 2MB); it being swapped for something bright enough to stop reading as a dark
// room; and `cover` being changed to `contain`, which honours the aspect by
// letterboxing and puts back the bands of bare ground the layer exists to
// remove.
//
// WHY NOT VACUOUS: every number is measured out of the PNGs at run time — the
// raster's own corners against its own middle, and master 44's side gutters
// against each other. Replacing the file changes the measurement; there is no
// hex or literal here to keep in step.
// ---------------------------------------------------------------------------
test('home(13) fence: the atmosphere carries a vignette, and it crops to fill', () => {
  const patches = {
    topLeft: [0, 0, 0.14, 0.07],
    topRight: [0.86, 0, 1, 0.07],
    bottomLeft: [0, 0.93, 0.14, 1],
    bottomRight: [0.86, 0.93, 1, 1],
    middle: [0.3, 0.42, 0.7, 0.62],
  };
  const layer = tonePatches(join(root, 'assets/prestige/home-atmosphere-dark.png'), patches);
  const corners =
    (layer.topLeft + layer.topRight + layer.bottomLeft + layer.bottomRight) / 4;

  assert.ok(
    layer.middle > corners * 2,
    `the atmosphere's middle reads ${layer.middle.toFixed(1)} against corners at ` +
      `${corners.toFixed(1)} — that is a flat plate, not a vignette, and homeBackground is ` +
      'already a flat plate'
  );
  assert.ok(
    layer.middle < 64,
    `the atmosphere's middle reads ${layer.middle.toFixed(1)}/255 — a dark room, not a wash, ` +
      'is what every card and hairline on this screen is drawn to sit on'
  );

  // The reason a vignette is owed at all: master 44's ground is not one value.
  // Its side gutters are the only strip of it with no card, art or chrome in
  // the way, so they are what gets measured.
  const master = tonePatches(join(root, 'docs/mockups/44_customer_home_dark.png'), {
    upperGutter: [0, 0.08, 0.045, 0.3],
    lowerGutter: [0, 0.55, 0.045, 0.85],
  });
  assert.notEqual(
    master.upperGutter.toFixed(1),
    master.lowerGutter.toFixed(1),
    'master 44 is being read as a flat ground; if that is now true the vignette is not owed'
  );

  // Full-bleed wins over fitting: the layer covers both dimensions and crops.
  const flat = flatten(read('components/HomeAtmosphere.tsx'));
  assert.match(flat, /resizeMode="cover"/, 'contain would letterbox the ground back in');
  assert.doesNotMatch(flat, /resizeMode="contain"/);
  assert.match(
    flat,
    /layer: \{ position: 'absolute', left: 0, right: 0, bottom: 0, \}/,
    'the layer must still reach three edges by declaration and the fourth by -insets.top'
  );
});

// ---------------------------------------------------------------------------
// H5 — the dark base ground is ONE value, declared in three places, and the
// light ground did not move with it.
//
// CATCHES: the ground being changed in one surface and not the others (dark
// screens read `bg` from ui/tokens.ts, `background` and `homeBackground` from
// lib/theme.ts, so a partial change shows as a seam between the two homes and
// everything else); and the same edit being applied to the LIGHT palette,
// which is frozen.
// ---------------------------------------------------------------------------
test('home(5) fence: one dark ground in three places, light untouched', () => {
  const DARK_GROUND = '#03110E';

  /** The slice of `source` between one `export const NAME = ` and the next. */
  const paletteBlock = (source, name, next) => {
    const start = source.indexOf(`export const ${name}`);
    assert.notEqual(start, -1, `${name} must stay a named export`);
    const end = source.indexOf(`export const ${next}`, start);
    assert.notEqual(end, -1, `${next} must stay a named export after ${name}`);
    return source.slice(start, end);
  };

  const tokens = read('ui/tokens.ts');
  const theme = read('lib/theme.ts');

  const darkTokens = paletteBlock(tokens, 'dark = {', 'spacing');
  const darkTheme = paletteBlock(theme, 'darkColors', 'spacing');
  const lightTokens = paletteBlock(tokens, 'colors = {', 'dark = {');
  const lightTheme = paletteBlock(theme, 'colors = {', 'emeraldColors');

  const value = (block, key, where) => {
    const hit = new RegExp(`\n  ${key}: '(#[0-9A-Fa-f]{3,8})'`).exec(block);
    assert.ok(hit, `${where} must declare ${key} as a plain hex`);
    return hit[1];
  };

  // The three declarations of the dark ground, and they must agree.
  assert.equal(value(darkTokens, 'bg', 'ui/tokens dark'), DARK_GROUND);
  assert.equal(value(darkTheme, 'background', 'lib/theme darkColors'), DARK_GROUND);
  assert.equal(value(darkTheme, 'homeBackground', 'lib/theme darkColors'), DARK_GROUND);

  // LIGHT IS FROZEN. Not "different from dark" — these exact values.
  assert.equal(value(lightTokens, 'bg', 'ui/tokens light'), '#F6F3EA');
  assert.equal(value(lightTheme, 'background', 'lib/theme light'), '#F4F1E8');
  assert.equal(value(lightTheme, 'homeBackground', 'lib/theme light'), '#FAF5F1');

  // And the retired value is gone from both surfaces entirely, so a half-done
  // revert cannot leave one screen on the old ground.
  for (const [path, source] of [['ui/tokens.ts', tokens], ['lib/theme.ts', theme]]) {
    assert.doesNotMatch(source, /#08110E/i, `${path} still carries the retired dark ground`);
  }
});

// ---------------------------------------------------------------------------
// H6 — the Post a Job seam: the strip above the pinned footer and the footer
// itself resolve to the SAME token.
//
// CATCHES: the photo nudge drifting back onto `mint` (or onto any other
// token), which put a six-level tonal step directly above the footer it shares
// an edge with; and either surface being given a raw hex instead of a token.
//
// WHY NOT VACUOUS: both tokens are PARSED out of the screen and compared to
// each other, so renaming or deleting either style fails the parse rather than
// passing the comparison.
// ---------------------------------------------------------------------------
test('home(6) fence: the strip above the Post a Job footer matches the footer', () => {
  const post = stripComments(read('screens/PostJobScreen.tsx'));

  const backgroundOf = (style) => {
    const block = new RegExp(`\n  ${style}: \{([^}]*)\}`).exec(post);
    assert.ok(block, `PostJobScreen must keep a ${style} style object`);
    const bg = /backgroundColor: colors\.(\w+),/.exec(block[1]);
    assert.ok(bg, `${style} must paint its ground from a palette token`);
    return bg[1];
  };

  const strip = backgroundOf('nudgeRow');
  const footer = backgroundOf('footer');
  assert.equal(
    strip,
    footer,
    `the strip above the pinned footer paints colors.${strip} while the footer paints ` +
      `colors.${footer} — they share an edge and must resolve to one token`
  );
  assert.equal(footer, 'surface', 'that shared token is `surface`, the pinned-chrome ground');

  // It really is the only thing between the scroller and the footer — if
  // something else is introduced there, this fence has to be revisited rather
  // than silently continuing to guard the wrong element.
  const flat = flatten(read('screens/PostJobScreen.tsx'));
  // home(7) took the inline clearance override off this footer, so it is a
  // bare `style={styles.footer}` now. If an inline array comes back, this
  // returns -1 and the assertion below says so rather than silently scanning
  // the wrong region.
  const footerAt = flat.indexOf('<View style={styles.footer');
  assert.ok(footerAt > 0, 'the pinned footer must still follow the scroller');
  // The LAST scroller to close before the footer — the screen nests horizontal
  // scrollers inside its step content, so the first `</ScrollView>` is not the
  // main one.
  const scrollEnd = flat.lastIndexOf('</ScrollView>', footerAt);
  assert.notEqual(scrollEnd, -1, 'the footer must still sit below a scroller');
  const between = flat.slice(scrollEnd, footerAt);
  assert.match(between, /styles\.nudgeRow/, 'the nudge is the strip this fence is about');
  assert.deepEqual(
    [...between.matchAll(/style=\{styles\.(\w+)\}/g)].map((m) => m[1]),
    ['nudgeRow'],
    'a NEW element between the scroller and the footer must be given its own seam decision'
  );
});

// ---------------------------------------------------------------------------
// H8 — the centre [ + ] is a filled gold control at 14.9% of screen width, in
// DARK only, and enlarging it did not move the bar's footprint.
//
// CATCHES: the fill reverting to the deep-green conversion fill (decision 3's
// rule, which home(8) reverses for this one control on operator instruction);
// the size going back to a fixed pt value, which cannot be a share of the
// screen; the reversal leaking into LIGHT, which is frozen on decision 3; the
// glyph staying gold-on-gold, i.e. invisible; and — the constraint that
// matters most — the pill's height or the clearance being re-derived from the
// button, or the static clearance token returning as a side effect.
// ---------------------------------------------------------------------------
test('home(8) fence: the [ + ] is filled gold in dark, and the bar footprint is unmoved', () => {
  const bar = stripComments(read('ui/primitives/BottomNav.tsx'));
  const flat = flatten(read('ui/primitives/BottomNav.tsx'));

  // home(11) — THIS USED TO PIN 0.149 OF THE SCREEN, AND A SHARE OF THE SCREEN
  // IS THE WRONG QUANTITY FOR THIS CONTROL. The pill's height is a constant
  // (layout.floatingNavHeight), so a control sized off the screen changes its
  // relationship to the pill on every device: at 393pt it resolved to 59 in a
  // 70pt pill, and the -14 lift then carried its top edge OUT through the
  // pill's hairline. What the control has to satisfy is containment, and
  // containment is a relationship between the two boxes — so that is what is
  // asserted, arithmetically, from whatever the source declares. home(18) sets
  // the master's share; this catches the control leaving the pill at any value.
  const pillHeight = constantOf(stripComments(read('ui/tokens.ts')), 'FLOATING_NAV_HEIGHT');
  const size = createButtonDarkSize(bar, flat);
  assert.ok(size > 0, 'the dark control must resolve to a positive size');
  assert.match(flat, /\{ width: size, height: size \}/);

  // home(18) — THE MASTER'S SHARE, and a share of the PILL because that is what
  // the control has to fit inside. Master 44 draws no [ + ] at all (its bar is
  // the five classic tabs), so 85-88% is the dispatch's bound rather than a
  // measurement, and it is recorded as such.
  const shareOfPill = size / pillHeight;
  assert.ok(
    shareOfPill >= 0.85 && shareOfPill <= 0.88,
    `the [ + ] is ${(shareOfPill * 100).toFixed(1)}% of the pill's height; it belongs between ` +
      '85% and 88%'
  );

  // LIGHT IS FROZEN and is measured on exactly the same arithmetic, so a change
  // aimed at dark cannot quietly move it.
  assert.equal(constantOf(bar, 'CREATE_BUTTON_LIGHT_SIZE'), 52);

  // FILLED GOLD, dark only. The FILL is the operator reversal this fence
  // exists for; the RING is free to be any dark token — what it may not be is
  // the fill's own colour, which paints a ring that is not there.
  assert.match(
    flat,
    /createButtonDark: \{ backgroundColor: colors\.gold,/,
    'the dark control must be FILLED with palette gold'
  );
  const darkRing = /createButtonDark: \{ backgroundColor: colors\.gold, borderColor: colors\.(\w+),/.exec(flat);
  assert.ok(
    darkRing,
    'the dark control must still declare a ring, and it must come from the palette — a raw hex ' +
      'here would be a new colour, which the Prestige pass does not introduce'
  );
  // home(18) ADDS THE HALF home(11) COULD NOT, because it was red until now.
  assert.notEqual(
    darkRing[1],
    'gold',
    'a gold ring on a gold fill is not a ring; it must be a dark token'
  );
  assert.match(
    flat,
    /color=\{isDark \? colors\.forest : colors\.gold\}/,
    'the glyph must be dark content on the gold fill — gold on gold is invisible'
  );
  // LIGHT IS FROZEN on decision 3: forest fill, gold ring, gold glyph, 52pt.
  assert.match(flat, /backgroundColor: colors\.forest, borderWidth: 1, borderColor: colors\.gold,/);
  assert.equal(constantOf(bar, 'CREATE_BUTTON_LIGHT_SIZE'), 52);

  // THE CONSTRAINT. The pill's height and the clearance are functions of the
  // two declared geometry tokens and nothing else — the control's ratio must
  // not appear in either, and the retired static token must not return.
  assert.match(flat, /export const TAB_BAR_CONTENT_HEIGHT = layout\.floatingNavHeight;/);
  assert.match(flat, /export const TAB_BAR_FLOAT_MARGIN = layout\.floatingNavGap;/);
  const heightFn = /export function bottomNavHeight\(insetBottom: number\): number \{([^}]*)\}/.exec(flat);
  assert.ok(heightFn, 'bottomNavHeight must stay a plain function');
  assert.doesNotMatch(
    heightFn[1],
    /CREATE_/,
    'the bar footprint must not be re-derived from the creation control'
  );
  assert.doesNotMatch(
    flatten(read('ui/tokens.ts')),
    /floatingNavClearance/,
    'the static clearance token must not return as a side effect of home(8)'
  );
  // The control is raised by a TRANSFORM, which Yoga does not lay out — that
  // is WHY the footprint is unmoved, so it must stay a transform, and the
  // pressed state must raise it by the same amount or the control drops on
  // touch-down.
  // ONE LIFT, built once at render, so the pressed state cannot drop the
  // control on touch-down by forgetting it.
  assert.match(
    flat,
    /transform: pressed \? \[\{ translateY: -raise \}, \{ scale: 0\.96 \}\] : \[\{ translateY: -raise \}\]/,
    'resting and pressed must be the same lift with a scale added, not two literals'
  );
  assert.doesNotMatch(
    flat,
    /createButtonPressed: \{[^}]*transform/,
    'the pressed transform must not be restated in the stylesheet where it can drift'
  );

  // CONTAINMENT. The control's laid-out box sits inside a slot of the pill's
  // own height, packed to flex-end with TAB_BOTTOM_GAP under it, then lifted.
  // Both edges are computed here from the source's own numbers rather than
  // eyeballed, so any future size or lift that pushes the control through the
  // pill's hairline fails. home(18) took the ceiling home(11) recorded — a 6pt
  // overhang — to zero.
  const gap = constantOf(bar, 'TAB_BOTTOM_GAP');
  assert.match(
    flat,
    /const raise = isDark \? Math\.round\(\(TAB_BAR_CONTENT_HEIGHT - size\) \/ 2\) - TAB_BOTTOM_GAP : CREATE_BUTTON_LIGHT_RAISE;/,
    'the dark lift must be DERIVED from the slack the pill leaves, never chosen'
  );
  const raise = Math.round((pillHeight - size) / 2) - gap;
  const bottomEdge = pillHeight - gap - raise;   // distance from the pill's top
  const topEdge = bottomEdge - size;
  assert.ok(
    topEdge >= 0,
    `the [ + ] starts ${(-topEdge).toFixed(1)}pt above the pill's top edge — it belongs INSIDE`
  );
  assert.ok(
    bottomEdge <= pillHeight,
    `the [ + ] ends ${(bottomEdge - pillHeight).toFixed(1)}pt below the pill's bottom edge`
  );
  assert.ok(
    Math.abs(topEdge - (pillHeight - bottomEdge)) <= 1,
    `the [ + ] sits ${topEdge}pt from the top and ${pillHeight - bottomEdge}pt from the bottom; ` +
      'centring it in the pill is what "inside" means here'
  );

  // LIGHT IS FROZEN on both of its numbers, and the fence reads them the same
  // way it reads dark's, so a change aimed at dark cannot move either.
  assert.equal(constantOf(bar, 'CREATE_BUTTON_LIGHT_RAISE'), 14);
});

/**
 * The dark control's resolved size at the reference 393pt width, whichever
 * quantity the source derives it from. Kept as one function so the fence above
 * reads as containment arithmetic rather than as a regex.
 */
function createButtonDarkSize(bar, flat) {
  const screen = /Math\.round\(screenWidth \* CREATE_BUTTON_WIDTH_RATIO\)/.test(flat);
  if (screen) return Math.round(393 * constantOf(bar, 'CREATE_BUTTON_WIDTH_RATIO'));
  const ofPill = /Math\.round\(TAB_BAR_CONTENT_HEIGHT \* CREATE_BUTTON_PILL_RATIO\)/.test(flat);
  if (ofPill) {
    const pill = constantOf(stripComments(read('ui/tokens.ts')), 'FLOATING_NAV_HEIGHT');
    return Math.round(pill * constantOf(bar, 'CREATE_BUTTON_PILL_RATIO'));
  }
  assert.fail('the dark control must derive its size from a declared ratio, never a pt literal');
}


// ---------------------------------------------------------------------------
// H9 — NO customer-Home surface links to Map, and the route survived anyway.
//
// CATCHES: the "View map" control (or any other Map link) reappearing on any
// screen the customer Home stack mounts — not just on HomeScreen, which is the
// spot-check a hand-written assertion would settle for; and the far worse
// reflex of un-registering the route now that nothing calls it, which is the
// exact mistake emerald D1 nearly made with MyJobs and which turns the next
// customer-side dispatch into NAVIGATE-not-handled.
//
// WHY NOT VACUOUS: the screen list is DERIVED — the stack's registrations are
// parsed out of CustomerRoot.tsx and resolved to files through that file's own
// import map, and the resolution is asserted non-empty before anything is
// checked. Adding a screen to the customer Home stack puts it under this fence
// automatically.
// ---------------------------------------------------------------------------
test('home(9) fence: nothing on the customer Home stack links to Map', () => {
  const customerRoot = stripComments(read('navigation/CustomerRoot.tsx'));

  const stackStart = customerRoot.indexOf('function CustomerHomeStackNavigator');
  assert.notEqual(stackStart, -1, 'CustomerHomeStackNavigator must stay a named function');
  const stackEnd = customerRoot.indexOf('function DiscoverStackNavigator', stackStart);
  assert.notEqual(stackEnd, -1, 'DiscoverStackNavigator must still follow it');
  const stack = customerRoot.slice(stackStart, stackEnd);

  // What the stack mounts, and where each component actually lives.
  const components = [...stack.matchAll(/component=\{(\w+)\}/g)].map((m) => m[1]);
  assert.ok(components.length >= 4, `the Home stack must mount its screens (saw ${components.length})`);
  const imports = new Map(
    [...customerRoot.matchAll(/import \{ (\w+) \} from '\.\.\/(screens\/\w+)';/g)].map((m) => [
      m[1],
      `${m[2]}.tsx`,
    ])
  );
  const files = components.map((name) => imports.get(name)).filter(Boolean);
  assert.ok(
    files.length >= 4,
    `every Home-stack screen must resolve to a file (resolved ${files.length} of ${components.length})`
  );

  for (const file of files) {
    const source = stripComments(read(file));
    assert.doesNotMatch(
      source,
      /navigate\('Map'\)/,
      `${file} dispatches Map — no customer Home surface may link to the map (home(9))`
    );
    assert.doesNotMatch(
      source,
      /navigateAcrossTabs\('Map'/,
      `${file} dispatches Map across tabs — no customer Home surface may link to the map`
    );
    assert.doesNotMatch(source, /View map/, `${file} still offers a "View map" affordance`);
  }

  // THE ROUTE SURVIVES the affordance. Registered, hidden, on the tab
  // navigator — and the worker tree's visible Map tab is untouched.
  const flatCustomer = flatten(read('navigation/CustomerRoot.tsx'));
  assert.match(
    flatCustomer,
    /name="Map" component=\{MapStackNavigator\} options=\{HIDDEN_TAB_ITEM_OPTIONS\}/,
    'Map must stay REGISTERED on the customer tab navigator — deleting it is the crash'
  );
  assert.match(
    flatten(read('navigation/WorkerRoot.tsx')),
    /name="Map" component=\{MapStackNavigator\} options=\{\{ tabBarLabel: 'Map' \}\}/,
    'the worker Map tab is not part of home(9)'
  );
  assert.match(
    flatten(read('ui/primitives/BottomNav.tsx')),
    /export const WORKER_BAR_TABS: BottomNavTabKey\[\] = \['Home', 'Map', 'MyJobs', 'Messages', 'Profile'\];/,
    'the worker bar still draws Map'
  );
});
