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
  //
  // RUN H3 MADE THE VALUE A VARIABLE, and this fence follows it: the ground is
  // whatever the focused screen declared, falling back to `palette.background`.
  // The CLAIM is untouched — this View must still PAINT — and the fallback is
  // asserted separately below so "declares nothing" can never mean "paints
  // nothing".
  const shell = flatten(read('navigation/ModeShell.tsx'));
  assert.match(
    shell,
    /<View style=\{\[styles\.tree, \{ backgroundColor: treeGround \}\]\}>/,
    'ModeShell must PAINT the ground behind the bar row — emerald D2 added this ' +
      'paint rather than removing one, and deleting it restores the white band'
  );
  assert.match(
    shell,
    /const treeGround = ground \? palette\[ground\] : palette\.background;/,
    'the ground must still resolve off the palette, and must fall back to ' +
      'palette.background when no screen has declared one'
  );
  assert.match(
    shell,
    /\{treeMode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>\}/,
    'the ground must wrap the tree swap so it covers both modes at once'
  );
  // …and the bar row still has exactly ONE painted layer.
  //
  // RUN MOTION1 (C3) put the blur through the library's background hook; RUN
  // G1 (C4) puts the whole chrome MATERIAL through it. The rule is unchanged
  // — no second ground in the bar row — and the one painted layer is now the
  // chrome Surface (solid theme surface in light; scrim + blur + mint
  // hairline in dark, every value from ui/tokens.ts's materials table). The
  // hook renders exactly the NavChrome component, the blur layer itself
  // still paints nothing, and the options declare no background at all.
  const navBar = flatten(read('ui/primitives/BottomNav.tsx'));
  assert.match(
    navBar,
    /tabBarBackground: \(\) => <NavChrome \/>,/,
    'the only thing the bar-background hook may render is the chrome component'
  );
  assert.equal(
    (navBar.match(/tabBarBackground/g) ?? []).length,
    1,
    'the bar-background hook may be named exactly once'
  );
  assert.doesNotMatch(
    flatten(read('lib/blur.tsx')),
    /backgroundColor/,
    'the blur layer must paint no ground of its own'
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
  // Home parity 2026-08-22: ONE mark box and ONE copy reserve, both themes.
  // The dark-only gates (heroMarkDark, the isDark paddingRight) are retired —
  // light renders the same computed geometry with its own artwork file.
  assert.match(flat, /style=\{\[styles\.heroMark, bDrape\.art\]\}/);
  assert.match(flat, /style=\{\[styles\.heroCopy, \{ paddingRight: bDrape\.copyPaddingRight \}\]\}/);
  // home(25)'s row gap rides the shared style now — a gap, not a second
  // fixed reserve.
  assert.match(flat, /heroCopy: \{ gap: \d+ \}/);

  // The fixed pair must not return, in either place.
  assert.doesNotMatch(
    flat,
    /heroMark: \{[^}]*width:/,
    'heroMark must not declare a fixed width again — a pt value cannot be a share of the screen'
  );
  assert.doesNotMatch(
    flat,
    /heroCopyDark|heroMarkDark/,
    'the per-theme mark/reserve styles must not come back; the geometry is one computed pair'
  );

  // The drape's stylesheet inset and the constant the copy is reserved from
  // are two halves of one number.
  const styleRight = /heroMark: \{ position: 'absolute', top: \d+, right: (\d+) \}/.exec(flat);
  assert.ok(styleRight, 'heroMark must keep a plain `right` inset');
  assert.equal(
    Number(styleRight[1]),
    inset,
    'heroMark.right and B_DRAPE_RIGHT_INSET must stay the same number'
  );

  // The promo heading is ONE size in both themes (parity 2026-08-22 retired
  // light's 25pt Heritage setting): the replaced master sets it on TWO lines,
  // the size is the largest that fits two inside the column the drape leaves,
  // and the arithmetic is here rather than in a screenshot.
  const darkSize = Number(
    /heroHeadline: \{ fontFamily: fonts\.display, fontSize: (\d+),/.exec(flat)?.[1]
  );
  assert.ok(darkSize > 0, 'the promo heading must keep a plain size');
  assert.doesNotMatch(
    flat,
    /heroHeadlineDark: \{[^}]*fontSize/,
    'the promo heading must stay one size for both themes — only its colour is per-theme'
  );
  const cardInner = 393 - 2 * Number(/screenPadding: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]) - 2;
  const copyColumn = cardInner - 2 * 16 - (Math.round(393 * ratio) + inset - overlap);
  // "BRAZOS handles the rest." measured at 25pt of Georgia in a real 393pt
  // viewport: 323pt of ink, so 12.92 per point of size.
  const secondLine = 12.92 * darkSize;
  assert.ok(
    secondLine <= copyColumn,
    `at ${darkSize}pt the promo heading's second line sets ${secondLine.toFixed(1)}pt into ` +
      `${copyColumn}pt of column and wraps to a third. Master 44 draws two`
  );
  // AND IT ENDS WHERE THE CANON PUTS IT. Fitting is not the same as matching,
  // and the two answers part company here. Master 44 ran this line to 251.1pt
  // from the card's left edge at 18pt; the operator's tuning pass took the
  // heading to 19/30, which runs it to 262.5 and leaves 2.5pt of the column
  // rather than the master's 18. That is the approved composition. What the
  // fence keeps is the shape of the claim: the line has ONE right edge, it is
  // derived from the size actually shipped, and moving the size moves it here.
  const lineEnd = 1 + 16 + secondLine;
  assert.ok(
    Math.abs(lineEnd - 262.5) <= 6,
    `the promo heading's long line ends ${lineEnd.toFixed(1)}pt from the card's left edge; the ` +
      'approved 19/30 heading ends it at 262.5'
  );

  // home(25b) — AND THE BREAK IS THE MASTER'S, not the column's. Two lines is
  // not the same statement as master 44's two lines: at 19pt the column forced
  // the break after "job." because "Describe the job. BRAZOS" was one point too
  // long for it, and at 18 it fits and the wrap slides a word right. A break
  // that depends on a line being exactly too long is not a break.
  assert.match(
    flat,
    /Describe the job\.\{'\\n'\}BRAZOS handles the rest\./,
    "master 44 breaks the promo heading after 'job.'; a natural wrap cannot be relied on to"
  );
  const firstLine = 8.40 * darkSize;
  assert.ok(
    firstLine <= copyColumn,
    `at ${darkSize}pt "Describe the job." sets ${firstLine.toFixed(1)}pt into ${copyColumn}pt of ` +
      'column, so the explicit break becomes three lines rather than two'
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
// top of it; and the gate being dropped, which would drop an opaque 1290x2796
// dark room onto the light palette. (1080x2335 stood here and in the
// component's docblock until RUN H2 measured the file: see HomeAtmosphere.tsx.)
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

  // Home parity 2026-08-22: one chip geometry for both themes — the dark-only
  // styles are retired and light shares home(24)'s paddings and gaps.
  const chipPad = Number(/compactServiceChip: \{ paddingHorizontal: (\d+) \}/.exec(flat)?.[1]);
  const rowGap = Number(
    /serviceRow: \{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: (\d+) \}/.exec(
      flat
    )?.[1]
  );
  assert.ok(chipPad > 0 && rowGap > 0, 'the chip row keeps its own padding and gap');

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

  // The per-theme chip styles must not come back: one geometry, colour-only
  // theme differences (light's gold outline is a borderColor alone).
  assert.doesNotMatch(flat, /compactChipDark|serviceRowsDark|serviceRowDark|serviceChipDark/);
  assert.match(flat, /goldOutlineChip: \{ borderColor: colors\.gold \}/);
  assert.match(flat, /serviceChip: \{ paddingHorizontal: 12 \}/);

  // PER-SECTION SPACING, not one global gap. Master 44's own gaps below the
  // hero are five different numbers; `sectionGap` is one. Each per-section
  // number below is the difference between them, measured, and shared by both
  // themes since the parity pass:
  //   search      237.0pt from the content top   (+8 on a 229 flow)
  //   chip row 1  328.0                          (sectionGap, unchanged)
  //   chip row 2  382.6                          (row gap 8 -> 10)
  //   promo card  449.1                          (+3 on a 20pt sectionGap)
  assert.match(flat, /searchField: \{ marginTop: 8,/);
  assert.match(flat, /serviceRows: \{ gap: 10 \}/);
  assert.match(flat, /heroCard: \{ marginTop: 3,/);
  assert.ok(
    !/gap: design\.sectionGap \+/.test(flat),
    'the rhythm is per-section; sectionGap stays the one number the studio shows'
  );
});

// ---------------------------------------------------------------------------
// H25 — THE PROMO CARD IS AS TALL AS MASTER 44'S, AND IT IS A SUM.
//
// The card has no declared height: it is two borders, two paddings, four gaps
// and a button, and every one of those is somewhere else in the file. That is
// why it stood 14pt too tall for three commits without anyone being able to
// point at the number — there wasn't one.
//
// CATCHES: the heading's leading being "tidied" back to something rounder (two
// lines of it are 60 of the card's 186); either gap being reverted; the CTA
// height being changed in the studio without the card being re-checked; and
// the gold B sliding back down to where the old master had it.
//
// WHY NOT VACUOUS: every term is read out of the source and the total is
// compared against a MEASURED master, so any one of them moving alone goes red.
// ---------------------------------------------------------------------------
test('home(25) fence: the promo card’s height is master 44’s, term by term', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));

  // Parity 2026-08-22: every term below is ONE number for both themes.
  const copyGap = Number(/heroCopy: \{ gap: (\d+) \}/.exec(flat)?.[1]);
  const bodyGap = Number(/heroBody: \{ padding: 16, gap: (\d+) \}/.exec(flat)?.[1]);
  const leading = Number(
    /heroHeadline: \{ fontFamily: fonts\.display, fontSize: \d+, lineHeight: (\d+),/.exec(flat)?.[1]
  );
  const cta = Number(/ctaHeight: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))?.[1]);
  assert.ok(copyGap && bodyGap && leading && cta, 'every term of the card’s height must stay a plain number');

  // The eyebrow declares no lineHeight, so the platform gives it one: 14pt at
  // its 12pt size, measured in .shots/customer-home-dark.png. It is the only
  // term here that is not written down in the source.
  const EYEBROW_LINE_BOX = 14;
  const height = 2 + 2 * 16 + EYEBROW_LINE_BOX + copyGap + 2 * leading + bodyGap + cta + 2;
  // 180.7 was master 44's own measurement, and it was met at 18/28. The tuning
  // pass took the heading to 19/30, and two lines of 2pt more leading is the
  // whole of the 5.3 between the two totals -- every other term is untouched.
  // 186 is the approved stack; the band stays 2.5, so any ONE term moving on
  // its own still goes red.
  assert.ok(
    Math.abs(height - 186) <= 2.5,
    `the promo card stacks to ${height}pt; the approved 19/30 heading stacks it to 186 (master 44 ` +
      'measured 180.7 at the 18/28 it replaced)'
  );

  // Master 44 ran 60px = 27.7pt of pitch on this heading, against an 18pt
  // size. The tuning pass set 30 against 19 -- 1.58, the master's own ratio.
  assert.ok(
    Math.abs(leading - 30) <= 1.5,
    `the heading's leading is ${leading}; the approved heading runs 30pt of line pitch`
  );

  // THE GOLD B'S TOP. Its ink starts 22.2pt below the card's outer top edge on
  // the master; `top` is measured from the padding box, inside the 1pt border,
  // and the asset carries no empty margin above its ink.
  const markTop = Number(/heroMark: \{ position: 'absolute', top: (\d+), right: \d+ \}/.exec(flat)?.[1]);
  assert.ok(
    Math.abs(markTop + 1 - 22.2) <= 2,
    `the B mark's ink starts ${markTop + 1}pt below the card's top edge; master 44 puts it at 22.2`
  );
});

// ---------------------------------------------------------------------------
// H26 — "LIVE NEARBY" SITS WHERE MASTER 44 PUTS IT, and the gap that does it
// is negative on purpose.
//
// The gap a reader sees is the one to the INK. This app's is 14pt larger than
// its layout gap, because `viewAll` holds the header row at the 44pt touch
// floor and the 20pt title is centred inside it. Master 44 leaves 28.4pt from
// the promo card's bottom edge to the L; 20 + 14 is 34.
//
// CATCHES: the negative margin being "cleaned up" to zero, which puts the row
// 6pt low again; and the header row's height changing without the margin being
// re-derived from it.
//
// WHY NOT VACUOUS: the 14 is measured off a real render, the 28.4 off the
// master, and the margin is read out of the source. Any of the three moving
// alone goes red.
// ---------------------------------------------------------------------------
test('home(26) fence: Live Nearby lands on master 44’s own gap below the card', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));
  const sectionGap = Number(/sectionGap: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);
  // Parity 2026-08-22: the corrective margin is part of the section's one
  // shared style — the dark-only override is retired.
  const margin = Number(/section: \{ gap: 12, marginTop: (-?\d+) \}/.exec(flat)?.[1]);
  assert.ok(Number.isFinite(margin), 'the Live Nearby section keeps its corrective margin');

  // The distance from the section's top to the title's cap, measured in
  // .shots/customer-home-dark.png: the header row is 44pt for the touch floor
  // and the 20pt serif title is centred in it.
  const HEADER_LEAD_TO_CAP = 14;
  const inkGap = sectionGap + margin + HEADER_LEAD_TO_CAP;
  assert.ok(
    Math.abs(inkGap - 28.4) <= 2,
    `the card's bottom edge to the L of Live Nearby is ${inkGap}pt; master 44 measures 28.4`
  );
  assert.doesNotMatch(flat, /sectionDark/, 'one section rhythm for both themes');
});

// home(19) used to freeze the light theme against the master-44 run; the
// 2026-08-22 parity pass DISSOLVED that freeze for the two Home screens on
// operator instruction: light inherits dark's implemented layout exactly, and
// only colours (and artwork files) stay per-theme. The fence now enforces the
// new contract — no mode-conditional LAYOUT value on the Home surfaces.
test('home(19) fence: the Home screens carry no mode-conditional layout — only colours differ', () => {
  const home = flatten(read('screens/HomeScreen.tsx'));
  const bar = stripComments(read('ui/primitives/BottomNav.tsx'));

  // TYPE — one set of metrics, both themes. The retired light-only settings
  // (39/45 headline, 22 section title, 25/29 promo, 16/8 subtitle) must not
  // return as *Dark forks.
  // The hero's FACE is the one serif role (D5 third note — see the
  // themeTokens one-serif fence, which owns that boundary); its geometry is
  // parity's, shared by both themes.
  assert.match(home, /headline: \{ marginTop: 30, fontFamily: fonts\.displayHero,/);
  assert.doesNotMatch(home, /headlineDark|heroSubtitleDark|sectionTitleDark/);
  assert.match(home, /heroSubtitle: \{ maxWidth: '73%', marginTop: 10, fontSize: 14,/);
  assert.match(home, /heroButtonText: \{ fontFamily: fonts\.display, fontSize: 24, fontWeight: '700', color: colors\.onForest \}/);
  // The remaining *Dark styles on the customer Home are colour-only.
  //
  // 2026-08-23: DEPTH joins layout in this list. A theme override that adds or
  // removes a shadow is the same class of fault as one that moves a number —
  // it makes light a different design rather than the same design in a second
  // palette — and it is the fault the device walk found twice outside this
  // screen (the worker Home search field, the composer's band). Neither could
  // have been caught here, so the rule is written down where the pairs are.
  for (const dark of home.matchAll(/(\w+Dark): \{([^}]*)\}/g)) {
    assert.doesNotMatch(
      dark[2],
      /width|height|padding|margin|font|line|gap|radius|top:|right:|left:|bottom:|maxWidth|minHeight|borderWidth/,
      `${dark[1]} must carry colours only — layout is one set of numbers for both themes`
    );
    assert.doesNotMatch(
      dark[2],
      /shadow|elevation/,
      `${dark[1]} changes DEPTH per theme — elevation is one set of numbers for both themes`
    );
  }

  // ARTWORK — one box and one fill rule. 2026-08-23 made it one FILE as well;
  // RUN H2 takes that half back, because the single file it unified onto is a
  // dark room and light was rendering it as a black rectangle. The SOURCE is
  // per-palette again; the box, the fill rule and the ink column are not, and
  // the three assertions that follow are what keep that line drawn. (The
  // per-theme fill rule is what the parity pass was really about, and it is
  // still forbidden — see `resizeMode={isDark` below.)
  assert.match(home, /source=\{isDark \? PRESTIGE_HERO_ART : PRESTIGE_HERO_ART_LIGHT\}/);
  assert.doesNotMatch(home, /HOME_HERO_ART/, "light's retired hero must not come back");
  assert.match(home, /source=\{isDark \? PRESTIGE_B_DRAPE : POST_MARK\}/);
  assert.match(home, /resizeMode="cover"/);
  assert.doesNotMatch(home, /resizeMode=\{isDark/);

  // GROUND — home(12). Light's content container still paints its own; the
  // atmosphere raster stays a dark-only COLOUR treatment (it is absolutely
  // positioned and lays out nothing).
  assert.match(home, /content: \{ flexGrow: 1, backgroundColor: colors\.homeBackground,/);
  assert.match(stripComments(read('components/HomeAtmosphere.tsx')), /if \(!isDark\) return null;/);

  // THE MODE SWITCH — one 1pt ring, per-theme ring colours.
  assert.match(/modeSwitch: \{([^}]*)\}/.exec(home)[1], /borderWidth: 1, borderColor: colors\.gold/);

  // THE [ + ] — one pill-ratio GEOMETRY, which is what this fence is for. The
  // 2026-08-23 unification of its COLOURS is reversed by RUN H2 (dark keeps the
  // gold tile; light fills with the light Post-a-job pill's green), so what is
  // asserted here is the half that never moved: one size, one ring WEIGHT, one
  // radius, one depth — with the fill and the ring COLOUR free to differ, the
  // way every other themed control in the tree is. home(8)'s own fence owns the
  // colours; duplicating them here is what let the two records drift apart.
  assert.doesNotMatch(bar, /CREATE_BUTTON_LIGHT_SIZE|CREATE_BUTTON_LIGHT_RAISE/);
  const barFlat = flatten(read('ui/primitives/BottomNav.tsx'));
  const shared = /createButton: \{([^}]*)\}/.exec(barFlat);
  assert.ok(shared, 'the control must keep a shared style');
  assert.match(
    shared[1],
    /borderRadius: radius\.lg, borderWidth: 1,/,
    'the ring weight and the radius are one set of numbers for both themes'
  );
  for (const key of ['createButtonDark', 'createButtonLight']) {
    const branch = new RegExp(`${key}: \\{([^}]*)\\}`).exec(barFlat);
    assert.ok(branch, `${key} must exist — the control forks on colour, per theme`);
    assert.doesNotMatch(
      branch[1],
      /width|height|padding|margin|radius|borderWidth|shadow|elevation|transform/,
      `${key} must carry colours only — geometry and depth are shared`
    );
  }

  // WORKER HOME — same contract: its *Dark styles are colour-only and the
  // hero column/artwork are one geometry.
  const worker = flatten(read('screens/WorkerHomeScreen.tsx'));
  assert.doesNotMatch(worker, /heroCopyDark/);
  assert.match(worker, /heroCopy: \{ gap: spacing\.sm, maxWidth: '58%' \}/);
  for (const dark of worker.matchAll(/(\w+Dark): \{([^}]*)\}/g)) {
    assert.doesNotMatch(
      dark[2],
      /width|height|padding|margin|font|line|gap|radius|top:|right:|left:|bottom:|maxWidth|minHeight|borderWidth/,
      `WorkerHome ${dark[1]} must carry colours only`
    );
  }
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
  assert.match(base[1], /borderColor: colors\.gold/, 'light keeps the gold ring COLOUR');
  assert.match(base[1], /minHeight: 44/, "44 is CLAUDE.md's touch floor; master 44 is under it");

  const dark = /modeSwitchDark: \{([^}]*)\}/.exec(flat);
  assert.ok(dark, 'dark must override the ring colour rather than repainting it for both themes');
  // home(26) REVERSED THE COLOUR HALF of home(17). `border` was chosen against
  // a ring the OLD master peaked at #A9814B — a warm olive. The replaced
  // master's ring peaks at #AFACA4, a near-neutral light grey at luminance
  // 151..168 against `border`'s 73. It is not a dim gold hairline at all.
  // The tuning pass gave that neutral its OWN token. `homeSlate` is the
  // secondary TEXT colour and other screens read it; the ring is a different
  // role, so it moved to `homeModeRing` and the two can be tuned apart. The
  // invariant is unchanged and is the whole point of this fence: dark overrides
  // the ring with a TOKEN -- never a literal, and never with light's gold.
  assert.match(
    dark[1],
    /borderColor: colors\.homeModeRing/,
    'the dark ring is its own neutral token, not the gold hairline and not a literal'
  );
  // THE WEIGHT: home(17) took dark to 1pt (master 44 rings at 0.92, and 1 is
  // the nearest real weight); the 2026-08-22 parity pass gave light the SAME
  // 1pt — one weight in the base, no per-theme width override.
  assert.match(base[1], /borderWidth: 1,/, 'the ring is one point in both themes');
  assert.doesNotMatch(dark[1], /borderWidth/, 'the dark override carries colour only');

  assert.match(
    flat,
    /styles\.modeSwitch, isDark && styles\.modeSwitchDark,/,
    'the override has to reach the control, in that order'
  );

  // home(26) — THE PILL'S OUTER WIDTH, which the label is the only elastic term
  // of. Master 44 draws it 156.2pt wide; at 15pt this rendered 171. The two
  // paddings, the gap and the glyph are fixed, so the box is
  // `fixed + label`, and the label scales with its size. Parity 2026-08-22:
  // the ladder size lives on the BASE label style, both themes.
  const labelSize = /modeSwitchText: \{ fontSize: sansSize\(MASTER_SANS_CAPS\.switchLabel\), fontWeight: '600', color: colors\.forest,? \}/.test(flat)
    ? sansLadder(read('screens/HomeScreen.tsx'), 'switchLabel')
    : 0;
  assert.ok(labelSize > 0, 'the label size must come off the sans ladder, not a literal');
  assert.match(
    flat,
    /modeSwitchTextDark: \{ color: colors\.emerald \}/,
    'the dark label override carries colour only'
  );
  // "Switch to Worker" measured 116pt of ink at 15pt in a real 393pt viewport,
  // inside a 171pt box -- and that box was measured while the pill padded its
  // label by 13 a side. The tuning pass took the padding to 10, which comes off
  // the FIXED term twice and off the elastic one not at all, so the box the
  // same ink measurement sits in is 165.
  const pillWidth = 165 - 116 + (116 * labelSize) / 15;
  assert.ok(
    Math.abs(pillWidth - 149.5) <= 5,
    `the pill resolves to ${pillWidth.toFixed(1)}pt wide; the approved 10pt padding draws it 149.5 ` +
      '(master 44 drew 156.2 at the 13 it replaced)'
  );
  // RECORDED, NOT MET: its height. Master 44 draws 40.2pt and CLAUDE.md's touch
  // floor is 44, so the floor wins and the 3.8pt stays a difference.
  assert.match(base[1], /minHeight: 44/);
});

/** A rung off `MASTER_SANS_CAPS`, recomputed here rather than trusted. */
function sansLadder(source, name) {
  const home = stripComments(source);
  const caps = /const MASTER_SANS_CAPS = \{([\s\S]*?)\} as const;/.exec(home);
  assert.ok(caps, 'MASTER_SANS_CAPS must stay a plain object literal');
  const hit = new RegExp(`${name}: (\\d+)`).exec(caps[1]);
  assert.ok(hit, `MASTER_SANS_CAPS must keep a measured cap for ${name}`);
  return Math.round(
    (Number(hit[1]) * constantOf(home, 'MASTER_TO_DEVICE')) / constantOf(home, 'SYSTEM_CAP_RATIO')
  );
}

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
  // the one the screen computes rather than states — in BOTH themes since the
  // 2026-08-22 parity pass (light's 22 is retired).
  assert.match(
    flat,
    /sectionTitle: \{ fontFamily: fonts\.display, fontSize: serifSize\(MASTER_SERIF_CAPS\.sectionTitle\),/,
    'the section title must be COMPUTED from the ladder, not restated as a number'
  );
  assert.doesNotMatch(flat, /sectionTitleDark/, 'one rung, both themes');
  // home(20/26): 16 -> 20. The replaced master's L measures a 30px cap
  // (13.86pt) where the old file's measured 26px (10.86pt). This REVERSES
  // home(16)'s shrink, which took the same control from 22 down to 16.
  assert.equal(ladder('sectionTitle'), 20, 'master 44’s "Live Nearby" measures 20pt of Georgia');

  // home(26): "View all" sits beside it and is SANS on the master — checked at
  // 1:1, no serifs and no stroke contrast — so it takes the same measurement
  // through the sans divisor rather than a literal. On the BASE style, both
  // themes; the dark override is colour alone.
  assert.match(
    flat,
    /viewAllText: \{ fontSize: sansSize\(MASTER_SANS_CAPS\.viewAll\), fontWeight: '600', color: colors\.forest,? \}/,
    '"View all" must be COMPUTED from the sans ladder, not restated as a number'
  );
  assert.match(flat, /viewAllTextDark: \{ color: colors\.emerald \}/);
  assert.equal(
    sansLadder(read('screens/HomeScreen.tsx'), 'viewAll'),
    14,
    'master 44’s "View all" measures 14pt of the platform sans'
  );

  // home(23): the leading is no longer light's 45/39 ratio. Master 44 runs
  // 82px = 37.9pt of line pitch; HEADLINE_LEADING is that pitch over the size
  // the column allowed when it was written (38/31), so the studio slider still
  // moves size and leading together. The tuning pass moved the SIZE to 33 and
  // left the ratio alone, which carries the pitch to 40.5. The ratio is the
  // frozen half, the product is what this asserts, and both are read out of the
  // source rather than restated here. Parity 2026-08-22: the studio's live
  // size drives BOTH themes — the isDark gate (home(16b)) is retired with the
  // light 39/45 it protected.
  assert.match(
    flat,
    /\{ maxWidth: headlineColumn, fontSize: design\.heroFontSize, lineHeight: Math\.round\(design\.heroFontSize \* HEADLINE_LEADING\),? \}/,
    "the studio's live hero size must drive the headline"
  );
  assert.doesNotMatch(flat, /isDark && \{ maxWidth: headlineColumn/);
  const leading = constantOf(home, 'HEADLINE_LEADING');
  const heroSize = Number(/heroFontSize: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);
  assert.ok(
    Math.abs(leading * heroSize - 40.5) < 1.2,
    `the headline's leading must resolve to the approved 40.5pt pitch, not ${(leading * heroSize).toFixed(1)}`
  );
  assert.doesNotMatch(
    flat,
    /headline: \{[^}]*fontSize: \d+/,
    'the hero headline takes its size from the studio value, never a stylesheet literal'
  );
  // home(25) took this to 18/28 off the replaced master's 60px = 27.7pt of
  // pitch; the tuning pass took it to 19/30, which keeps that ratio and still
  // sets it on TWO lines -- home(2) asserts both the fit and the line's end.
  // One size for both themes; dark's override is colour alone.
  assert.match(
    flat,
    /heroHeadline: \{ fontFamily: fonts\.display, fontSize: 19, lineHeight: 30,/,
    'the promo heading’s size and leading are both master 44’s'
  );
  assert.match(flat, /heroHeadlineDark: \{ color: colors\.ink \}/);

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
    /heroHeadline: \{ fontFamily: fonts\.display, fontSize: 19,/,
    'the promo heading is pinned at 19 — see the H2 fence; the ladder says 22 and that 3pt is owed'
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
  assert.ok(box, 'the hero must keep a plain, readable box');
  const [width, height, right, top] = [Number(box[1]), Number(box[2]), Number(box[3]), Number(box[4])];
  // Parity 2026-08-22: ONE box for both themes (light's Heritage 112x124 is
  // retired), still taken from the constant the headline column derives from.
  assert.match(
    flat,
    /homeHeroArt: \{ position: 'absolute', zIndex: 0, width: HERO_ART_DARK\.width, height: HERO_ART_DARK\.height, right: HERO_ART_DARK\.right, top: HERO_ART_DARK\.top,? \}/,
    'the stylesheet must take the box from the constant, or the headline column and the picture drift'
  );
  assert.doesNotMatch(flat, /homeHeroArtDark/, 'one hero box, both themes');
  assert.match(flat, /resizeMode="cover"/, 'the slot fills in both themes');

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
  // Master 44 started the scene 34.9pt below the content box's top; the tuning
  // pass dropped it to 70, and `top` is still measured from `intro`, which
  // starts there. The band stays 3, so the slot cannot drift off the approved
  // position either.
  assert.ok(
    Math.abs(top - 70) <= 3,
    `the approved slot starts the scene 70pt below the content top; this one starts at ${top}pt`
  );

  // IT OVERHANGS THE SCREEN, and by a measured amount. `right` is relative to
  // `intro`, inside the content box's own padding, so the drawn box reaches
  // 393 - padding - right. home(14)'s `right: 0` stopped the BOX at the padded
  // column's edge, 20pt short of the screen and 43pt short of where the master
  // puts it.
  const padding = Number(/screenPadding: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);
  const overhang = -right - padding;
  assert.ok(
    Math.abs(overhang - 13) <= 3,
    `the approved slot runs the scene 13pt past the screen's right edge (master 44 ran 7.8); this ` +
      `one runs ${overhang}pt`
  );

  // The replaced scene carries alpha now -- a 9-row trim off its bottom edge --
  // but nothing is cut from its right, so `inkBounds` still reports a
  // full canvas — the box IS the art, and that is the correct answer here.
  const ink = inkBounds(join(root, 'assets/prestige/hero_armchair_customer.png'));
  assert.equal(
    ink.right,
    0,
    'nothing may be trimmed off the scene right edge, or this box stops describing it',
  );

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

  // Parity 2026-08-22: one fill rule. The hero slot fills and crops in both
  // themes.
  //
  // RUN H2 — THE FILE FORKS AGAIN AND THE GEOMETRY STILL DOES NOT, and that
  // distinction is the whole point of this block. 2026-08-23 unified the slot
  // onto the dark scene for both palettes; the scene is a dark room, so light
  // rendered a black rectangle. The mount is per-theme once more. What must NOT
  // come back is a per-theme fill rule, a per-theme box, or a second geometry
  // constant — so the fill rule is asserted on the ternary itself, and the ink
  // boundary below is re-derived from BOTH files against the ONE shared
  // constant.
  const heroImage =
    /<Image source=\{isDark \? PRESTIGE_HERO_ART : PRESTIGE_HERO_ART_LIGHT\}([^>]*)>/.exec(flat);
  assert.ok(heroImage, 'the hero mounts one file per palette, from a single isDark ternary');
  assert.match(heroImage[1], /resizeMode="cover"/, 'the slot fills in both themes');
  assert.doesNotMatch(
    heroImage[1],
    /isDark/,
    'the FILE is the only thing that forks — the fill rule and the box stay shared'
  );
  assert.doesNotMatch(
    flat,
    /HOME_HERO_ART|customer-home-chair/,
    'the light-geometry hero must not be referenced anywhere on this screen again'
  );

  // The light scene has to put its ink where the dark one does, because the
  // headline column is measured off HERO_ART_INK_LEFT and there is only one of
  // those. If a future light export moves the chair, this fails here rather
  // than silently running the headline under the artwork on light devices only.
  const measuredInkLight = structuredLeftFraction(
    join(root, 'assets/prestige/hero_armchair_customer_light.png'),
    0.53,
    0.75,
  );
  assert.ok(
    Math.abs(declaredInk - measuredInkLight) < 0.03,
    `the light hero's ink starts at ${measuredInkLight.toFixed(3)} of its box where the shared ` +
      `HERO_ART_INK_LEFT says ${declaredInk}. One column serves both themes, so the two scenes ` +
      'have to agree on where the artwork begins'
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
  const DARK_GROUND = '#02110D';

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
    // And the ground the tuning pass replaced, for the same reason.
    assert.doesNotMatch(
      source,
      /#03110E/i,
      `${path} still carries the pre-tuning dark ground`,
    );
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

  // Parity 2026-08-22: ONE geometry for both themes — the frozen light square
  // and its lift are retired; light keeps only its colours.
  assert.doesNotMatch(bar, /CREATE_BUTTON_LIGHT_SIZE|CREATE_BUTTON_LIGHT_RAISE/);

  // FILLED GOLD, dark only. The FILL is the operator reversal this fence
  // exists for; the RING is free to be any dark token — what it may not be is
  // the fill's own colour, which paints a ring that is not there.
  assert.match(
    flat,
    /createButtonDark: \{ backgroundColor: colors\.gold,/,
    'the dark control must be FILLED with palette gold'
  );
  // RUN S3 (D14): the ring's hue moved from the palette to ui/tokens.ts's
  // `navBar` — the control's own line-work rather than a role either theme
  // resolves. What this pins is UNCHANGED IN KIND: the ring must still be a
  // TOKEN READ, never a hex spelled at the call site, and never the fill's
  // own colour. Only which token surface it comes from widened.
  const darkRing =
    /createButtonDark: \{ backgroundColor: colors\.gold, borderColor: (colors|navBar)\.(\w+),/.exec(flat);
  assert.ok(
    darkRing,
    'the dark control must still declare a ring, and it must come from a token surface — the ' +
      'palette or ui/tokens.ts navBar — a raw hex here would be a new colour spelled at the call site'
  );
  // home(18) ADDS THE HALF home(11) COULD NOT, because it was red until now.
  assert.notEqual(
    darkRing[2],
    'gold',
    'a gold ring on a gold fill is not a ring; it must be a dark token'
  );
  // RUN H2 — THE COLOURS FORK PER THEME AGAIN AND THE GEOMETRY DOES NOT, which
  // is the split the parity pass was actually protecting. What these
  // assertions pin is unchanged in KIND: the glyph is legible against its own
  // tile in both themes, the ring is never the fill's own colour, and no hue
  // is written as a hex at the call site. Only the values moved.
  // S2 (C6): the glyph colour is its dial, DEFAULTING to the per-theme
  // palette read — the fork and its tokens are pinned exactly as before.
  const glyphColour =
    /<Ionicons name="add" size=\{glyph\} color=\{glyphColorDial \?\? \(isDark \? colors\.(\w+) : colors\.(\w+)\)\}/.exec(flat);
  assert.ok(
    glyphColour,
    'the glyph must read its colour per theme, off the resolved palette — a hex here would be a ' +
      'new colour, which neither the Prestige pass nor the structure pass introduces'
  );
  const [, darkGlyph, lightGlyph] = glyphColour;
  assert.notEqual(
    darkGlyph,
    'gold',
    'the dark glyph must be dark content on the gold fill — gold on gold is invisible'
  );

  // LIGHT NO LONGER SHARES THE TILE. It fills with the light Post-a-job pill's
  // green and rings a slate glyph one shade deeper; the fill and the glyph may
  // never be the same token, which is the light half of "gold on gold is not a
  // ring".
  const lightBody =
    /createButtonLight: \{ backgroundColor: colors\.(\w+), borderColor: colors\.(\w+),/.exec(flat);
  assert.ok(lightBody, 'the light control must declare its own fill and ring, both from the palette');
  const [, lightFill, lightRing] = lightBody;
  assert.notEqual(lightFill, 'gold', 'the gold fill is the DARK reversal and must not spread to light');
  assert.notEqual(lightFill, lightGlyph, 'a glyph the colour of its own tile is invisible');
  assert.notEqual(lightRing, lightFill, 'a ring the colour of its own fill is not a ring');

  // The shared style is the part that really is shared. A fill or a ring
  // reappearing on it would silently paint BOTH themes again.
  const base = /createButton: \{ borderRadius: radius\.lg, borderWidth: 1,([^}]*)\}/.exec(flat);
  assert.ok(base, 'the shared style must keep the geometry it never forked on');
  assert.doesNotMatch(
    base[1],
    /backgroundColor:|borderColor:/,
    'fill and ring are per-theme now; declaring either on the shared style paints both'
  );
  assert.doesNotMatch(
    flat,
    /backgroundColor: colors\.forest, borderWidth: 1, borderColor: colors\.gold,/,
    'the retired light treatment must not return beside the shared one'
  );

  // THE DEPTH. The black drop shadow is replaced by a gold glow built from the
  // SHARED glow shape, with its strength in one named constant so the operator
  // can tune it without touching the style.
  //
  // IT IS DECLARED ONCE, ON THE SHARED STYLE, and that is load-bearing rather
  // than tidy: tests/themeTokens.test.mjs forbids a theme decision from
  // reaching depth at all, so a glow in the dark branch and a drop shadow in
  // the light one would be two designs rather than one design in two palettes.
  // It still resolves per theme without a ternary, because `colors` is the
  // resolved palette. RUN S2 (C6): the glow is built ONCE at render — the
  // same shared shape, the strength now the create.glowAlpha dial defaulting
  // to the ui/tokens.ts navBar token — and applied in the one style array
  // both themes share, so the depth still never forks.
  assert.match(
    flat,
    /const halo = glow\.halo\(withAlpha\(glowColorDial \?\? colors\.gold, glowDial \?\? navBar\.createGlowAlpha\)\);/,
    'the control lifts with a gold glow built from the shared glow shape'
  );
  const glowAlphaMatch = /createGlowAlpha: ([\d.]+),/.exec(stripComments(read('ui/tokens.ts')));
  assert.ok(glowAlphaMatch, 'navBar.createGlowAlpha must be a plain number in ui/tokens.ts');
  const glowAlpha = Number(glowAlphaMatch[1]);
  assert.ok(
    glowAlpha > 0 && glowAlpha < 1,
    `the glow alpha must be a real fraction (saw ${glowAlpha})`
  );
  assert.doesNotMatch(
    flat,
    /createButton(?:Dark|Light)?: \{[^}]*shadowColor: colors\.black/,
    'a black drop shadow under this tile reads as a hole on the Prestige ground'
  );
  assert.doesNotMatch(
    flat,
    /create(?:Button|Slot)[^:]*: \{[^}]*overflow:/,
    'iOS cancels a shadow on a node that clips — the glow and any clipping must not share a node'
  );

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
    /const raise = Math\.round\(\(barHeight - size\) \/ 2\) - TAB_BOTTOM_GAP;/,
    'the lift must be DERIVED from the slack the pill leaves, never chosen — one lift, both themes'
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

  // And the size expression itself is unconditional — the isDark fork must
  // not come back around either the size or the lift. S2 (C6): the size is
  // its dial, defaulting to the token-ratio derivation.
  assert.match(flat, /const size = sizeDial \?\? Math\.round\(barHeight \* navBar\.createSizeRatio\);/);
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
  // RUN S2 (C6): the ratio is a TOKEN (ui/tokens.ts navBar.createSizeRatio)
  // and the size is its dial's default — the derivation is unchanged, only
  // its home moved, and with no dial set barHeight IS the pill height.
  const dialled = /Math\.round\(barHeight \* navBar\.createSizeRatio\)/.test(flat);
  if (dialled) {
    assert.match(
      flat,
      /const barHeight = useOverrideNumber\('nav\.barHeight'\) \?\? TAB_BAR_CONTENT_HEIGHT;/,
      "the [ + ]'s bar height must default to the pill's own token"
    );
    const tokensSource = stripComments(read('ui/tokens.ts'));
    const pill = constantOf(tokensSource, 'FLOATING_NAV_HEIGHT');
    const ratio = /createSizeRatio: ([\d.]+),/.exec(tokensSource);
    assert.ok(ratio, 'navBar.createSizeRatio must be a plain number in ui/tokens.ts');
    return Math.round(pill * Number(ratio[1]));
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

// ---------------------------------------------------------------------------
// THE MAP SCREEN'S CHROME FLOATS — 2026-08-23, operator instruction.
//
// The screen had been three stacked panels: an opaque header slab, the map,
// an opaque bottom band. Two of those are gone. The map is the GROUND, filling
// the screen absolutely, and the title and the count row ride on it as inset,
// rounded, translucent capsules.
//
// WHY IT NEEDS A FENCE. This is the third pass over this screen's chrome
// (2026-08-22 removed the header CARD and the footer CARD; this one removes
// the slabs those left behind), and each pass has been a reduction that a
// later run could plausibly read as a missing background and "fix". The two
// properties that must not silently revert are the LAYERING (the map behind
// both) and the TRANSLUCENCY (no opaque ground behind either).
// ---------------------------------------------------------------------------
test('map(1) fence: the map is the ground and the chrome floats on it, translucent', () => {
  const map = stripComments(read('screens/MapScreen.tsx'));
  const flat = flatten(read('screens/MapScreen.tsx'));

  // THE LAYERING. The map is absolutely positioned — not a `flex: 1` panel
  // between two rows — so its bounds extend behind the header, behind the
  // bottom row and under the status bar. The retired wrapper must not return.
  assert.match(
    flat,
    /mapLayer: \{ \.\.\.StyleSheet\.absoluteFillObject,/,
    'the map must fill the screen absolutely, or the chrome is not floating over anything'
  );
  assert.doesNotMatch(flat, /mapWrap/, 'the flex-panel map wrapper is retired');
  // The map is rendered from the ground layer, and the chrome layer sits over
  // it without swallowing the pans and taps the map needs.
  assert.match(flat, /<View style=\{styles\.mapLayer\}> <HotspotMap/);
  assert.match(
    flat,
    /<SafeAreaView style=\{styles\.safe\} edges=\{\['top'\]\} pointerEvents="box-none">/,
    'the chrome layer must be box-none or the map stops panning'
  );
  assert.match(flat, /<View style=\{styles\.mapSpacer\} pointerEvents="none" \/>/);

  // NO OPAQUE GROUND BEHIND EITHER ELEMENT. Both capsules take the page
  // ground through withAlpha, and neither may name a flat palette fill.
  //
  // 2026-08-24 — TWO ALPHAS NOW, RE-DERIVED, not one lowered. The number was
  // never a taste value: 0.82 was what a 26pt display title needed with
  // nothing between it and an arbitrary tile. The header's title is gone,
  // replaced by a SearchBar, and every child of that capsule now brings its
  // own opaque field — so no type touches the header's ground and it can be
  // glass. The bottom row still sets its count, its subtitle and "View list"
  // directly on its own ground, in SMALLER type than the title the old floor
  // was derived for, so it keeps a real floor and only comes down as far as
  // that allows. The header being MORE transparent than the bottom row is the
  // fence, not an accident: if they ever converge, one of them is wrong.
  const GLASS = [
    ['headerWrap', 'the header', '0\\.55', 'map\\.headerWrap\\.radius'],
    ['footerBar', 'the bottom row', '0\\.72', 'map\\.footerBar\\.radius'],
  ];
  for (const [key, label, alpha, cornerDial] of GLASS) {
    const style = new RegExp(`${key}: \{([^}]*)\}`).exec(flat.replace(/\{ width: 0, height: 3 \}/g, ''));
    assert.ok(style, `${label} must keep a plain, readable style object`);
    assert.match(
      style[1],
      new RegExp(`backgroundColor: withAlpha\\(colors\\.background, ${alpha}\\)`),
      `${label} must let the tiles through at its own derived floor — an opaque fill is a slab`
    );
    assert.match(
      style[1],
      /marginHorizontal: spacing\.md/,
      `${label} must be INSET, or it is a full-width band however transparent it is`
    );
    // RUN T2 (C11) put each capsule's corner on its own screen dial, so the
    // token is named at the WEARER and no longer inside the style block.
    // `radius.xl` is still the value and still the only one — the alias exists
    // because the distance filter's own `radius` state shadows the token
    // inside the component. Only the address moved.
    assert.match(
      flat,
      new RegExp(`useDialNumber\\('${cornerDial}'\\) \\?\\? themeRadius\\.xl`),
      `${label} must be a capsule, not an edge-to-edge strip`,
    );
    assert.match(flat, /const themeRadius = radius;/, 'the alias must stay the token itself');
    assert.match(style[1], /borderWidth: 1, borderColor: colors\.border/, `${label} needs its hairline over busy tiles`);
  }
  // THE ORDERING, as arithmetic rather than as two independent constants: the
  // capsule that still carries bare type must be the less transparent of the
  // two, whatever either number becomes.
  const alphaOf = (key) =>
    Number(
      new RegExp(`${key}: \{[^}]*backgroundColor: withAlpha\\(colors\\.background, ([0-9.]+)\\)`)
        .exec(flat)[1]
    );
  assert.ok(
    alphaOf('footerBar') > alphaOf('headerWrap'),
    'the row that sets type on its own ground must back it more heavily than the row that does not'
  );
  // The chrome layer itself paints nothing: every pixel is the map or a capsule.
  assert.match(flat, /safe: \{ flex: 1, backgroundColor: 'transparent',? \}/);
  // And the screen still has ONE opaque ground, under the map — not behind
  // the chrome — so no frame paints the platform's white before tiles land.
  assert.match(flat, /root: \{ flex: 1, backgroundColor: colors\.background,? \}/);

  // ANTI-VACUITY: the elements this fence is about are still the ones on the
  // screen. The 26pt "Find Jobs Near You" display title is GONE as of
  // 2026-08-24 — it named the screen the user had already chosen to be on, and
  // it was the single largest thing the header capsule had to hold legible
  // over live tiles. The shared SearchBar is what the capsule carries now, and
  // its absence is asserted so the title cannot drift back and quietly put the
  // header's alpha back under a contrast obligation it no longer has.
  assert.doesNotMatch(map, /Find Jobs Near You/, 'the display title is retired, not hidden');
  assert.match(map, /<SearchBar/, 'the header capsule carries the shared search field');
  assert.match(map, /placeholder="Find nearby jobs"/);
  assert.match(map, /\{visibleJobCount\} open \{visibleJobCount === 1 \? 'job' : 'jobs'\}/);
});

// ---------------------------------------------------------------------------
// RUN H2 — THE HOME STRUCTURE PASS.
//
// CATCHES, in the order the run made the changes:
//   - the atmosphere docblock drifting off the file it describes AGAIN. It had
//     claimed 1080x2335 with a 3.7/20.1 vignette; the file is 1290x2796 and its
//     centre reads 21.86, while the numbers it carried turned out to be the
//     HERO's. A prose measurement nobody re-derives goes stale silently, so the
//     two are tied together here.
//   - the greeting name losing its light accent, or dark's gold moving.
//   - the Post-a-job pill's rings re-merging: light's gold outline vanishing,
//     or dark's ring coming back.
//   - "Nearby" and "Inbox" reverting, or the Messages ROUTE KEY being renamed
//     along with its label — which would be a navigation change disguised as a
//     copy change.
//   - the unread marker returning to the live-state green, or the offline dot
//     to `danger`.
//   - the all-services rows losing the fill and hairline that make them cards,
//     or the type and rhythm moving, which this commit promised not to touch.
// ---------------------------------------------------------------------------
test('RUN H2 fence: the atmosphere docblock is re-derived from the file it mounts', () => {
  const layer = read('components/HomeAtmosphere.tsx');
  const img = decode(join(root, 'assets/prestige/home-atmosphere-dark.png'));

  // The dimensions the prose claims must be the dimensions the file has, and
  // EVERY raster-scale size it names must be that one — a second, different
  // WxH is the stale-number failure wearing a new hat. Scoped to widths of
  // 1000 and up so the docblock can still name the 393x852 viewport the
  // harness renders at, which is a screen and not this raster.
  const sizes = [...layer.matchAll(/(\d{4,5})x(\d{3,5})/g)];
  assert.ok(sizes.length > 0, 'the docblock must state the raster it describes');
  for (const hit of sizes) {
    assert.equal(
      `${hit[1]}x${hit[2]}`,
      `${img.width}x${img.height}`,
      `the atmosphere docblock mentions ${hit[0]}, which is not this file — re-measure it, do ` +
        'not carry the old numbers forward'
    );
  }
  // And it is still the opaque RGB raster the roster records, which is WHY the
  // component may never render it under the light palette.
  assert.equal(img.colourType, 2, 'the atmosphere must stay RGB with no alpha channel');
});

test('RUN H2 fence: the greeting name and the Post-a-job pill', () => {
  const home = flatten(read('screens/HomeScreen.tsx'));

  // The name is accented in BOTH themes now — a light branch, not a removed
  // gate. Dark's gold is untouched.
  assert.match(
    home,
    /isDark \? styles\.greetingName : styles\.greetingNameLight/,
    'the greeting name must resolve per theme, not be coloured only in dark'
  );
  assert.match(home, /greetingName: \{ color: colors\.gold \}/, "dark's gold name is untouched");
  assert.match(
    home,
    /greetingNameLight: \{ color: colors\.postPillGreen \}/,
    "light's name is the light Post-a-job pill's own green"
  );

  // THE PILL. Light carries the outline; dark loses its outline entirely and
  // takes light's green as its fill. Text and geometry are untouched, and the
  // ring is dropped by COLOUR so the 1pt border never moves the content box in
  // one theme only.
  //
  // RUN H3 MOVED THE LIGHT RING FROM GOLD TO CREAM, on operator instruction —
  // an expected CONSTANT changing, not this fence's claim. What the fence
  // asserts is unchanged in kind: one ring weight for both themes, a ring
  // colour that comes from a token rather than a hex, and a light ring that is
  // not the light GROUND (which is what `onForest`/`onPrimary` resolve to over
  // there, and an outline in the page's own colour is not an outline).
  const pill = /heroButton: \{([^}]*)\}/.exec(home);
  assert.ok(pill, 'the Post-a-job pill must keep a shared style');
  assert.match(pill[1], /borderWidth: 1,/, 'the ring WEIGHT is one number for both themes');
  assert.match(pill[1], /borderColor: colors\.creamInk,/, "light rings the pill in the app's cream");
  const lightRing = /borderColor: colors\.(\w+),/.exec(pill[1])[1];
  assert.ok(
    !['onForest', 'onPrimary', 'background', 'homeBackground'].includes(lightRing),
    `the light ring is ${lightRing}, which is a GROUND — a ring in the page's own colour is invisible`
  );
  assert.match(pill[1], /minHeight: 48,/, 'the pill geometry is untouched');
  assert.match(
    home,
    /heroButtonDark: \{ backgroundColor: colors\.postPillGreen, borderColor: 'transparent' \}/,
    "dark fills with light's green and shows no ring"
  );
  assert.doesNotMatch(
    home,
    /heroButtonDark: \{[^}]*borderWidth/,
    'a per-theme borderWidth moves the content box in one theme only — drop the ring by colour'
  );
  // Untouched, and asserted so a later edit cannot quietly take it.
  assert.match(
    home,
    /heroButtonText: \{ fontFamily: fonts\.display, fontSize: 24, fontWeight: '700', color: colors\.onForest \}/
  );
});

// ---------------------------------------------------------------------------
// RUN H3 — TWO OPERATOR REVERSALS OF H2, BOTH LIGHT-ONLY.
//
// C1: the centre [ + ]'s glyph goes gold and its ring follows one shade down.
// C2: the Post-a-job pill's ring goes cream. H2 shipped both surfaces correctly
// to the instruction it had, so what this fence protects is not "H2 was wrong"
// but "the reversal is complete and did not leak into dark".
//
// CATCHES: either light hue written as a hex at the call site; a ring that
// resolves to the same value as the thing it rings; `goldDeep` drifting off its
// stated derivation; the retired `greetingSlateDeep` coming back; and — the one
// that matters most — either change reaching the DARK branch.
// ---------------------------------------------------------------------------
test('RUN H3 fence: the light [ + ] goes gold, the light pill goes cream, dark does not move', () => {
  const bar = flatten(read('ui/primitives/BottomNav.tsx'));
  const home = flatten(read('screens/HomeScreen.tsx'));
  const tokens = read('ui/tokens.ts');

  const hex = (key) => {
    const hit = new RegExp(`\\n  ${key}: '(#[0-9A-Fa-f]{6})'`).exec(tokens);
    assert.ok(hit, `${key} must stay a plain hex in ui/tokens.ts`);
    return hit[1];
  };
  const channels = (value) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));

  // ---- C1, the glyph ------------------------------------------------------
  // The ternary still forks on theme and still reads the resolved palette. Only
  // the LIGHT arm moved, and the dark arm is pinned BY NAME so a future edit
  // that "unifies" the two fails here rather than in a screenshot.
  const glyph =
    /<Ionicons name="add" size=\{glyph\} color=\{glyphColorDial \?\? \(isDark \? colors\.(\w+) : colors\.(\w+)\)\}/.exec(bar);
  assert.ok(glyph, 'the [ + ] glyph must still take its colour per theme, off the resolved palette');
  assert.equal(glyph[1], 'postPillGreen', 'C1 is LIGHT ONLY — the dark glyph must not move');
  assert.equal(glyph[2], 'gold', "the light glyph is the LIGHT palette's gold");

  // ---- C1, the ring -------------------------------------------------------
  const lightBranch = /createButtonLight: \{([^}]*)\}/.exec(bar);
  assert.ok(lightBranch, 'the light [ + ] must keep its own branch');
  assert.match(
    lightBranch[1],
    /backgroundColor: colors\.postPillGreen,/,
    'the FILL does not move — this is a glyph and a ring, which is why the gold fence stays quiet'
  );
  assert.match(lightBranch[1], /borderColor: colors\.goldDeep,/, 'the ring follows the glyph, one shade down');
  assert.doesNotMatch(
    bar,
    /greetingSlateDeep/,
    "greetingSlateDeep was H2's value for exactly this ring and has no other call site"
  );
  // The DECLARATION must be gone; the comment recording why it went may stay,
  // and should — it is the only place a reader learns this was a reversal.
  assert.doesNotMatch(
    stripComments(tokens),
    /greetingSlateDeep/,
    'a token with no call site is a hue nobody reviews — delete it rather than leave it standing'
  );

  // The DARK branch is asserted WHOLE, because "light only" is a claim about
  // dark every bit as much as it is a claim about light.
  //
  // RUN S3 (D14) moved the dark RING — and only the ring — to the champagne
  // token `navBar.ringColorDark`. H3's claim is unaffected: the branch is
  // still asserted whole here, and it still says the dark tile keeps its gold
  // FILL, which is the half H3 was about. The slate is what changed.
  assert.match(
    bar,
    /createButtonDark: \{ backgroundColor: colors\.gold, borderColor: navBar\.ringColorDark, \}/,
    "H3 is LIGHT ONLY and the dark tile keeps its gold fill; S3 D14 owns the dark ring's hue"
  );

  // ---- the derivation, so "one shade down" cannot become a taste edit ------
  const gold = hex('gold');
  const goldDeep = hex('goldDeep');
  assert.equal(gold, '#C8A15B', "the first `gold` in this file is the light palette's");
  const expected = channels(gold).map((channel) => Math.round(channel * 0.8));
  assert.deepEqual(
    channels(goldDeep),
    expected,
    `goldDeep must stay every channel of light gold at 80% — expected ${expected.join(',')}`
  );
  assert.notEqual(goldDeep, gold, 'a ring the colour of the glyph inside it is not a ring');

  // ---- C2, the pill's cream ----------------------------------------------
  assert.match(home, /borderColor: colors\.creamInk,/, 'the light pill rings in the app cream');
  // Referenced, not restated: one definition of the hue, and it is the DARK
  // palette's ink because the light palette has no cream of its own.
  assert.match(
    stripComments(tokens),
    /creamInk: dark\.ink,/,
    'creamInk must reference dark.ink rather than restate its hex'
  );
  // Scoped to the dark block on purpose: `ink` is declared in `brand` too
  // (#13201B, the light near-black), and it is the DARK one this reaches for.
  const darkBlock = tokens.slice(tokens.indexOf('export const dark = {'), tokens.indexOf('export const spacing'));
  assert.match(darkBlock, /\n  ink: '#F1EDE1',/, 'the cream the operator named is the dark palette ink');

  // ---- neither hue is written at a call site ------------------------------
  for (const [path, source] of [
    ['ui/primitives/BottomNav.tsx', bar],
    ['screens/HomeScreen.tsx', home],
  ]) {
    assert.doesNotMatch(source, /#A08149|#F1EDE1|#C8A15B/i, `${path} must name the token, never the hex`);
  }
});

test('RUN H2 fence: the renamed sections, the unread marker and the offline dot', () => {
  const home = flatten(read('screens/HomeScreen.tsx'));
  assert.match(home, /<Text style=\{styles\.sectionTitle\}>Nearby<\/Text>/);
  assert.doesNotMatch(home, /Live Nearby<\/Text>/, '"Live Nearby" is retired copy');
  // The live INDICATOR stays — the word went because the pulse already says it.
  assert.match(home, /<View style=\{styles\.liveDot\} \/>/);

  const bar = flatten(read('ui/primitives/BottomNav.tsx'));
  assert.match(
    bar,
    /\{ key: 'Messages', label: 'Inbox', icons: \['chatbubble-ellipses', 'chatbubble-ellipses-outline'\] \}/,
    'the tab is labelled Inbox and drawn as a three-dot bubble'
  );
  // THE KEY IS THE ROUTE. Renaming it would break every cross-tab jump and
  // notification route that resolves against it.
  assert.match(
    bar,
    /CUSTOMER_BAR_TABS: BottomNavTabKey\[\] = \['Home', 'Discover', 'Messages', 'Profile'\]/
  );
  assert.match(
    bar,
    /WORKER_BAR_TABS: BottomNavTabKey\[\] = \['Home', 'Map', 'MyJobs', 'Messages', 'Profile'\]/
  );

  // The unread marker: gold in dark, the reference coral in light. Never the
  // live-state green it used to wear.
  const row = flatten(read('components/ConversationRow.tsx'));
  assert.match(row, /dot: \{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors\.gold, \}/);
  assert.match(row, /dotLight: \{ backgroundColor: colors\.referenceCoral \}/);
  assert.match(row, /<View style=\{\[styles\.dot, !isDark && styles\.dotLight\]\} \/>/);
  assert.doesNotMatch(
    row,
    /dot: \{[^}]*colors\.emerald/,
    'emerald is the live-state hue — an unread marker in it reads as one more status light'
  );

  // The coral is one value in both palettes, and it is the reference's own —
  // docs/mockups/'s manifest measures #D54C2C as the master set's only UI red.
  assert.match(read('ui/tokens.ts'), /referenceCoral: '#D54C2C'/);
});

test('RUN H2 fence: the all-services rows are cards, and the type did not move', () => {
  const sheet = flatten(read('components/ServicePickerSheet.tsx'));

  const row = /row: \{([^}]*)\}/.exec(sheet);
  assert.ok(row, 'the sheet must keep a row style');
  assert.match(row[1], /backgroundColor: colors\.background,/, 'the row gains a card fill');
  assert.match(row[1], /borderWidth: 1, borderColor: colors\.border,/, 'and a hairline');
  // The fill has to be the page ground, NOT `surface`: the row sits ON a
  // `surface` sheet, so `surface` would be a card painted its backdrop's colour.
  assert.doesNotMatch(
    row[1],
    /backgroundColor: colors\.surface/,
    'a surface row on a surface sheet is invisible in both themes'
  );

  const tile = /rowIcon: \{([^}]*)\}/.exec(sheet);
  assert.ok(tile, 'the sheet must keep an icon tile');
  assert.match(tile[1], /borderWidth: 1, borderColor: colors\.mint2,/, 'the tile gains its edge');
  assert.match(
    sheet,
    /<Ionicons name=\{service\.icon\} size=\{19\} color=\{colors\.emerald\} \/>/,
    'the glyph is the brighter green in each palette'
  );

  // TYPE AND RHYTHM ARE UNTOUCHED — this commit promised no size, weight,
  // family or spacing change anywhere on this surface.
  assert.match(sheet, /rowLabel: \{ flex: 1, fontSize: 15, fontWeight: '600', color: colors\.text, \}/);
  assert.match(
    sheet,
    /title: \{ fontFamily: fonts\.display, fontSize: 22, fontWeight: '700', color: colors\.ink, \}/
  );
  assert.match(sheet, /subtitle: \{ fontSize: 13, color: colors\.textMuted, \}/);
  assert.match(
    row[1],
    /gap: spacing\.md, minHeight: 56, paddingHorizontal: spacing\.sm, paddingVertical: spacing\.sm,/
  );
  assert.match(tile[1], /width: 40, height: 40,/);
});
