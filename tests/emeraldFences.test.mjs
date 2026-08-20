import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
test('home(2) fence: the B drape is 18.3% of screen width, and the copy column follows it', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));
  const flat = flatten(read('screens/HomeScreen.tsx'));

  const ratio = constantOf(home, 'B_DRAPE_WIDTH_RATIO');
  assert.ok(
    Math.abs(ratio - 0.183) <= 0.01,
    `the drape must be 18.3% of screen width (+/- 1%), found ${(ratio * 100).toFixed(1)}%`
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
  const inset = constantOf(home, 'B_DRAPE_RIGHT_INSET');
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
