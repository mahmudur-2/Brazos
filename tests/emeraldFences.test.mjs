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

// 2026-09-18: `pngSize` — the IHDR reader home(2) used to check the B drape's
// aspect against both files on disk — left with that assertion; nothing else
// read it.

/** A bare number assigned to `name` at module scope. */
const constantOf = (source, name) => {
  const hit = new RegExp(`const ${name} = ([-0-9./ ]+);`).exec(source);
  assert.ok(hit, `${name} must stay a plain numeric constant`);
  // eslint-disable-next-line no-new-func -- a digits-and-operators literal only.
  return Number(new Function(`return (${hit[1]});`)());
};

// ---------------------------------------------------------------------------
// H2 — RETIRED AND RE-POINTED 2026-09-18, on operator instruction (dispatch
// home-task-card, Phase 0.5). This fence pinned the promo card's gold B drape
// — a box that was a fraction of the screen, the copy column reserved from
// it, the promo heading's size, its break and where its long line ended. The
// promo card is GONE: the task card that took its place under the hero
// carries no mark, reserves no column and sets no serif heading, so every one
// of those assertions described a card that no longer exists. In its place
// is the fence for the card that DOES exist.
//
// CATCHES: the promo card coming back — its eyebrow, its heading, the B mark
// or either of its asset requires; the task card losing one of its three
// rows (title, field, pill) or the pill leaving it; the field growing a
// second magnifier; the card's colours written as hexes rather than the three
// palette roles, or those roles leaving either palette; a *Dark fork of the
// card's geometry; the mockup's padding and gap being "tidied"; the tile row
// or the job sections moving above the card.
//
// WHY NOT VACUOUS: every claim is read out of the screen's own source; the
// card's three rows are located INSIDE the card's JSX rather than anywhere in
// the file; the light values of the three roles are compared to the palette's
// own `surface` and `line` rather than restated; and the retired copy is
// asserted ABSENT — so a revert of the change fails here rather than passing
// quietly.
// ---------------------------------------------------------------------------
test('home(2) fence: the task card holds the title, the field and the pill, and the promo card is gone', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));
  const flat = flatten(read('screens/HomeScreen.tsx'));

  // THE PROMO CARD IS GONE — its copy, its mark, its geometry, both requires.
  assert.doesNotMatch(home, /FASTEST WAY TO START|Describe the job\.|BRAZOS handles the rest/);
  assert.doesNotMatch(home, /brazos_b_drape\.png/, 'the B mark is required by nothing on this screen');
  assert.doesNotMatch(home, /PRESTIGE_B_DRAPE|POST_MARK|B_DRAPE_|\bbDrape\b|CARD_LIFT_ALPHA/);
  // The STYLE objects, anchored on their opening brace: `heroHeadline: 52` is
  // the hero's own ladder cap and stays.
  assert.doesNotMatch(
    flat,
    /heroCard: \{|heroCardDark: \{|heroBody: \{|heroCopy: \{|heroEyebrow: \{|heroHeadline: \{|heroHeadlineDark: \{|heroMark: \{/,
    'the promo card’s styles left with it'
  );
  assert.doesNotMatch(home, /promoHeading:/, 'the promo heading’s ladder rung left with the heading');
  assert.doesNotMatch(home, /<LitSurface/, 'the card is not a lifted surface; it is lit between two stops');

  // THE TASK CARD: one node, lit between the two palette stops and flat in
  // light, wearing the entrance the promo card wore, holding three rows.
  const card =
    /<Animated\.View style=\{\[ styles\.taskCard, \{ borderRadius: taskCardRadius \}, litBetween\(\{ top: colors\.taskCardLitTop, bottom: colors\.taskCardLitBottom, flat: !isDark, \}\), cardEntrance, \]\} >([\s\S]*?)<\/Animated\.View>/.exec(
      flat
    );
  assert.ok(card, 'the task card must be one Animated.View lit between the two palette stops');
  const inside = card[1];
  const titleAt = inside.indexOf('What do you need done?');
  const fieldAt = inside.indexOf('<SearchBar');
  const pillAt = inside.indexOf('accessibilityLabel="Post a job"');
  assert.ok(titleAt > -1 && fieldAt > -1 && pillAt > -1, 'the card holds the title, the field and the pill');
  assert.ok(titleAt < fieldAt && fieldAt < pillAt, 'in that order: title, field, pill');
  assert.match(inside, /<Text style=\{styles\.taskCardTitle\} maxFontSizeMultiplier=\{1\.3\}> What do you need done\? <\/Text>/);
  // The field is the SAME instance — the studio's height and radius, the
  // sentence posture, submitSearch — with the mockup's placeholder and no
  // leading glyph, because the magnifier is its trailing submit.
  assert.match(inside, /placeholder="Describe your task\.\.\."/);
  assert.match(inside, /onSubmit=\{submitSearch\}/);
  assert.match(inside, /autoCapitalize="sentences" autoCorrect disableLeadingIcon micBecomesSearch/);
  assert.match(inside, /\{ minHeight: design\.searchHeight, borderRadius: design\.searchRadius \}/);
  // 2026-09-21: the field's ONE trailing control is SearchBar's — the mic,
  // which becomes the magnifier once text is typed (tests/voiceSearch pins
  // its size, colour, press and label). The card draws no magnifier of its
  // own, so the field can never show two.
  assert.equal((inside.match(/name="search"/g) ?? []).length, 0, 'no magnifier drawn by the card itself');
  // The pill is the live one, moved: its style, its recipe, its label.
  assert.match(inside, /styles\.heroButton, isDark && styles\.heroButtonDark,/);
  assert.match(inside, /onPress=\{\(\) => startJobDraft\(\)\}/);
  assert.match(inside, /Post a job ›/);
  const dial = "useDialNumber('home.promoCard.radius') ?? 22";
  assert.ok(home.includes(dial), 'the card’s corner is the dial the promo card wore, at 22');

  // THE CARD'S GEOMETRY is the mockup's (docs/mockups/html/home-redesign.html
  // `.card`: padding 17, gap 14) and its COLOURS are the three palette roles,
  // read in BOTH themes — there is no *Dark fork; the theme gates the
  // gradient alone.
  const cardStyle = /taskCard: \{([^}]*)\}/.exec(flat);
  assert.ok(cardStyle, 'the task card keeps a plain style object');
  assert.match(cardStyle[1], /padding: 17,/, "the mockup's 17pt padding");
  assert.match(cardStyle[1], /gap: 14,/, "the mockup's 14pt row gap");
  assert.match(cardStyle[1], /borderWidth: 1, borderColor: colors\.taskCardEdge,/);
  assert.match(cardStyle[1], /backgroundColor: colors\.taskCardLitBottom,/);
  assert.match(cardStyle[1], /\.\.\.shadows\.card,/, 'the light card shadow, on the shared style');
  assert.doesNotMatch(flat, /taskCardDark/, 'no *Dark fork: the roles resolve per palette');
  assert.match(
    flat,
    /taskCardTitle: \{ fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors\.ink \}/,
    "the mockup's .card-title: 20/24, 700, the ink"
  );
  assert.doesNotMatch(home, /#15362B|#0B2019|#27473A/i, 'the screen names the tokens, never the hexes');

  // THE THREE ROLES: defined once in ui/tokens.ts — the mockup's exact dark
  // shades; light's flat card, i.e. the palette's own surface and line — and
  // reached by lib/theme.ts BY REFERENCE on both sides.
  const tokens = read('ui/tokens.ts');
  const darkBlock = tokens.slice(tokens.indexOf('export const dark = {'), tokens.indexOf('export { withAlpha }'));
  assert.match(darkBlock, /\n  taskCardLitTop: '#15362B',/);
  assert.match(darkBlock, /\n  taskCardLitBottom: '#0B2019',/);
  assert.match(darkBlock, /\n  taskCardEdge: '#27473A',/);
  const lightBlock = tokens.slice(tokens.indexOf('export const colors = {'), tokens.indexOf('export type ColorToken'));
  const lightHex = (key) => {
    const hit = new RegExp(`\\n  ${key}: '(#[0-9A-Fa-f]{6})'`).exec(lightBlock);
    assert.ok(hit, `light ${key} must stay a plain hex in ui/tokens.ts`);
    return hit[1];
  };
  assert.equal(lightHex('taskCardLitTop'), lightHex('surface'), 'light draws the card flat: the top stop IS the surface');
  assert.equal(lightHex('taskCardLitBottom'), lightHex('surface'), 'and so is the bottom stop');
  assert.equal(lightHex('taskCardEdge'), lightHex('line'), 'inside the line hairline');
  const theme = stripComments(read('lib/theme.ts'));
  for (const role of ['taskCardLitTop', 'taskCardLitBottom', 'taskCardEdge']) {
    assert.match(theme, new RegExp(`\\n  ${role}: emeraldLight\\.${role},`), `${role} reaches the light palette by reference`);
    assert.match(theme, new RegExp(`\\n  ${role}: emeraldDark\\.${role},`), `${role} reaches the dark palette by reference`);
  }

  // THE ORDER ON THE SCREEN (dispatch C4): hero -> the task card -> the tile
  // row -> the attention block -> "Your jobs".
  const order = ['Take a task', 'What do you need done?', '<ServiceTileRow', 'Needs your attention', '>Your jobs</Text>'].map(
    (needle) => flat.indexOf(needle)
  );
  assert.ok(order.every((at) => at > -1), 'every landmark is on the screen');
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i] > order[i - 1], `the screen reads hero, card, row, attention, your jobs — landmark ${i} is out of order`);
  }
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
// H24 — FOUR TILES FIT, THE FIFTH IS CUT, and the arithmetic says so.
//
// 2026-09-17 — RE-POINTED, on operator instruction. This fence was written
// about master 44's five service chips on two rows, a layout that no longer
// exists: both Home screens draw ONE sliding row of square tiles now
// (components/ServiceTileRow.tsx, docs/mockups/html/home-redesign.html's
// `.tiles`), and the two-row arithmetic it priced described nothing. What the
// mockup specifies instead is also a sum: four tiles fully visible and the
// fifth cut in half, so the slide is obvious without an affordance.
//
// CATCHES: the tile growing or the gap widening until the fourth tile no
// longer fits; the screen gutter or the tile shrinking until the fifth tile
// is whole and the row reads as a grid that happens to end; and the chip-row
// styles creeping back into the screen's stylesheet.
//
// WHY NOT VACUOUS: the tile, the gap and the gutter are read out of three
// files that do not import each other's numbers — the component, the token
// table and the studio's defaults — and priced against the 393pt viewport
// every render here is taken in.
// ---------------------------------------------------------------------------
// 2026-09-21 — RE-POINTED, on operator instruction (DECISIONS 2026-09-20
// sitting 3, (8)): FOUR WHOLE TILES fill the row and NOTHING peeks — "I
// shouldn't see half of Plumb.. icon". The tile is measured from the row's
// width (components/ServiceTileRow.tsx tileSizeFor), the gap equals the
// gutter, so the fifth tile begins exactly at the screen's edge. The sum is
// priced here at the harness width the way the old cut-in-half sum was.
test('home(24) fence: four whole service tiles fill the row and nothing peeks', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));
  const rowSource = flatten(read('components/ServiceTileRow.tsx'));
  const padding = Number(/screenPadding: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);

  // The tile is the row's width less three gaps, over four — arithmetic in
  // the component, applied at render from the measured row, never a constant.
  assert.match(rowSource, /export const TILES_ACROSS = 4;/);
  assert.match(rowSource, /return \(rowWidth - \(TILES_ACROSS - 1\) \* gap\) \/ TILES_ACROSS;/);
  assert.match(rowSource, /const tile = rowWidth === null \? TILE_FLOOR : tileSizeFor\(rowWidth, gap\);/);
  assert.match(rowSource, /setRowWidth\(event\.nativeEvent\.layout\.width - inset \* 2\)/);
  assert.match(rowSource, /\{ width: tile, height: tile \}/);
  assert.doesNotMatch(rowSource, /TILE_SIZE/, 'the constant square is gone');
  // The gap IS the gutter, by construction — the screen's inset, set at render.
  assert.match(rowSource, /const gap = inset;/);
  assert.match(rowSource, /\{ paddingHorizontal: inset, gap \}/);
  assert.match(rowSource, /row: \{ flexDirection: 'row' \}/);
  const gap = padding;
  assert.match(rowSource, /borderRadius: emeraldRadius\.md,/);
  assert.match(flat, /<ServiceTileRow heading="Popular services" inset=\{design\.screenPadding\}/);

  const SCREEN = 393;
  const tile = (SCREEN - 2 * padding - 3 * gap) / 4;
  const fourth = padding + 4 * tile + 3 * gap;
  assert.equal(fourth, SCREEN - padding, `four tiles end at the gutter: ${fourth} of ${SCREEN}`);
  const fifthStart = padding + 4 * (tile + gap);
  assert.ok(fifthStart >= SCREEN, `the fifth tile starts at ${fifthStart}, on or past the edge — nothing peeks`);

  // The chip-row styles must not come back to the screen — one geometry, in
  // the component, for both Homes.
  assert.doesNotMatch(
    flat,
    /serviceRows:|serviceRow:|serviceChip:|compactServiceChip:|goldOutlineChip:|otherChip:/
  );
  assert.doesNotMatch(flat, /compactChipDark|serviceRowsDark|serviceRowDark|serviceChipDark/);

  // PER-SECTION SPACING, not one global gap. Master 44's own gaps below the
  // hero are five different numbers; `sectionGap` is one. Each per-section
  // number was the difference between them, measured, and shared by both
  // themes since the parity pass:
  //   search      237.0pt from the content top   (+8 on a 229 flow)
  //   promo card  449.1                          (+3 on a 20pt sectionGap)
  // (The chip rows' own 10pt rhythm left with them; the tile row carries its
  // rhythm in the component and the 3 was not re-tuned against it.)
  //
  // 2026-09-18 — BOTH CORRECTIONS LEFT WITH THE SURFACES THEY CORRECTED, on
  // operator instruction (dispatch home-task-card): the field sits INSIDE the
  // task card at the card's own 14pt gap (a marginTop on top of that would be
  // 22 where the mockup draws 14), and the card sits directly under the hero
  // with NO margin of its own — the mockup's 28 is what `sectionGap` (20) plus
  // `intro`'s paddingBottom (spacing.sm, 8) already give. The two pins become
  // absences, so neither number can creep back, and the 28 is re-derived.
  const field = /searchField: \{([^}]*)\}/.exec(flat);
  assert.ok(field, 'the field keeps a plain style object');
  assert.doesNotMatch(field[1], /margin/, 'the field carries no margin inside the card');
  const card = /taskCard: \{([^}]*)\}/.exec(flat);
  assert.ok(card, 'the task card keeps a plain style object');
  assert.doesNotMatch(card[1], /margin/, 'the card carries no margin — sectionGap and the hero’s own padding place it');
  // 2026-09-21: the hero's own padding is gone, so sub-copy to card is
  // `sectionGap` alone — the reference's ONE rhythm of 24 between the blocks
  // (docs/mockups/html/home-redesign.html; DECISIONS 2026-09-20 sitting 3, (8)).
  assert.match(flat, /intro: \{ position: 'relative', minHeight: 160 \}/);
  const sectionGap = Number(/sectionGap: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);
  assert.equal(sectionGap, 24, 'sub-copy to card is the reference’s 24: sectionGap alone');
  // …and the greeting to the headline is the same 24: introCopy's 8 plus the
  // headline's own 16.
  const themeSpacing = /export const THEME_SPACING_DEFAULTS = \{([^}]*)\}/.exec(read('ui/tokens.ts'))[1];
  const introGap = Number(/\bsm: (\d+)/.exec(themeSpacing)[1]);
  const headlineTop = Number(/headline: \{ marginTop: (\d+),/.exec(flat)?.[1]);
  assert.equal(introGap + headlineTop, 24, 'greeting to headline is the same 24');
  assert.ok(
    !/gap: design\.sectionGap \+/.test(flat),
    'the rhythm is per-section; sectionGap stays the one number the studio shows'
  );
});

// ---------------------------------------------------------------------------
// H25 — THE TASK CARD IS AS TALL AS THE MOCKUP'S, AND IT IS A SUM.
//
// RE-POINTED 2026-09-18, on operator instruction (dispatch home-task-card,
// Phase 0.5). This fence priced the promo card term by term against master 44
// — two borders, two paddings, an eyebrow, a two-line heading, two gaps, the
// pill, and the gold B's top. That card is gone; the task card that replaced
// it is a sum of the same kind, and the same lesson applies: it has no
// declared height, every term lives somewhere else in the file, and a card
// that is a sum drifts one term at a time unless the total is watched.
//
// THE TERMS, and where each is read from: the 1pt border twice (the
// stylesheet), the mockup's 17pt padding twice and its 14pt row gap twice
// (the stylesheet), the title's 24pt line box (the stylesheet), the field's
// 44 and the pill's 48 (lib/homeDesignStudio.tsx — the studio's values, which
// the screen reads live). 2 + 34 + 24 + 14 + 44 + 14 + 48 = 180.
// docs/mockups/html/home-redesign.html says "task card — height 174" for a
// 44pt CTA with the border outside the count; the app's pill is 48 by the
// studio's standing value (CLAUDE.md's floor is 44, the operator's is 48), and
// the border is part of the box here, so 174 + 4 + 2 = 180 is the mockup's
// own number in this app's terms.
//
// CATCHES: the padding or the gap being "tidied" to a token step; the title
// growing a taller line box; the field's height moving in the studio without
// the card being re-checked; the CTA height moving likewise.
//
// WHY NOT VACUOUS: every term is read out of the source and the total is
// compared against the mockup's own number, so any one of them moving alone
// goes red.
// ---------------------------------------------------------------------------
test('home(25) fence: the task card’s height is the mockup’s, term by term', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));
  const studio = read('lib/homeDesignStudio.tsx');

  const cardStyle = /taskCard: \{([^}]*)\}/.exec(flat)?.[1] ?? '';
  const padding = Number(/padding: (\d+),/.exec(cardStyle)?.[1]);
  const gap = Number(/gap: (\d+),/.exec(cardStyle)?.[1]);
  const border = Number(/borderWidth: (\d+),/.exec(cardStyle)?.[1]);
  const titleLine = Number(/taskCardTitle: \{ fontSize: \d+, lineHeight: (\d+),/.exec(flat)?.[1]);
  const field = Number(/searchHeight: (\d+)/.exec(studio)?.[1]);
  const cta = Number(/ctaHeight: (\d+)/.exec(studio)?.[1]);
  assert.ok(
    padding && gap && border && titleLine && field && cta,
    'every term of the card’s height must stay a plain number'
  );

  // 2026-09-21: the field is 56 (was 44), so the sum is 192 — the reference's
  // 186 with the pill's 48 for its 44 and the border inside the box.
  const height = 2 * border + 2 * padding + titleLine + gap + field + gap + cta;
  assert.equal(height, 192, `the task card stacks to ${height}pt; the reference's card is 192 in this app's terms`);

  // The two studio terms are the reference's own, and the field is pinned by
  // name — a smaller field is the one move this sum would not catch as a sum.
  assert.equal(field, 56, 'the field is the reference’s 56 — the operator’s pick b');
  assert.equal(Number(/searchRadius: (\d+)/.exec(studio)?.[1]), 20, 'at the reference’s 20 radius, one notch up from 17');
  assert.equal(cta, 48, 'the pill’s 48 did not move');
  assert.equal(Number(/ctaRadius: (\d+)/.exec(studio)?.[1]), 24, 'nor its 24 radius');
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
test('home(26) fence: the first job section lands on master 44’s own gap below the card', () => {
  const flat = flatten(read('screens/HomeScreen.tsx'));
  const sectionGap = Number(/sectionGap: (\d+)/.exec(read('lib/homeDesignStudio.tsx'))[1]);
  // Parity 2026-08-22: the corrective margin is part of the section's one
  // shared style — the dark-only override is retired.
  //
  // 2026-09-17 — RE-POINTED, on operator instruction, and the MEASUREMENT is
  // untouched. This fence was written about "Live Nearby"; Nearby left the
  // customer Home and "Your jobs" took its slot, wearing the same `section`
  // style, the same 44pt header row and the same 20pt serif title. The gap the
  // master measures is the one from the card's bottom edge to the first
  // section heading's cap, and that is still exactly what is computed below.
  //
  // 2026-09-18: what sits above the first job section is the TILE ROW now —
  // the card moved up under the hero and the row came with it (dispatch
  // home-task-card, C4). The corrective margin is the same number on the same
  // header row and was deliberately NOT re-tuned against the row's labels; the
  // arithmetic below is unchanged and still what the source computes.
  const margin = Number(/section: \{ gap: 12, marginTop: (-?\d+) \}/.exec(flat)?.[1]);
  assert.ok(Number.isFinite(margin), 'the section below the card keeps its corrective margin');

  // The distance from the section's top to the title's cap, measured in
  // .shots/customer-home-dark.png: the header row is 44pt for the touch floor
  // and the 20pt serif title is centred in it.
  const HEADER_LEAD_TO_CAP = 14;
  const inkGap = sectionGap + margin + HEADER_LEAD_TO_CAP;
  // 2026-09-21: the reference's rhythm — 24 from the tile labels to the
  // heading's 26pt line box, whose cap sits 5 into it: 29 to the ink. Master
  // 44's 28.4 is history (DECISIONS 2026-09-20 sitting 3, (8)).
  assert.equal(margin, -9, 'the corrective margin, re-tuned to the reference');
  assert.ok(
    Math.abs(inkGap - 29) <= 1,
    `the tile labels to the first section heading is ${inkGap}pt to the ink; the reference measures 29`
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
  // 2026-09-21: 30 -> 16 — with introCopy's 8, the one rhythm of 24.
  assert.match(home, /headline: \{ marginTop: 16, fontFamily: fonts\.displayHero,/);
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
  // 2026-09-18: the per-theme B mark (`isDark ? PRESTIGE_B_DRAPE : POST_MARK`)
  // left with the promo card — RETIRED here, on operator instruction; the
  // hero is the screen's one per-palette raster now, and home(2) holds the
  // mark absent.
  assert.doesNotMatch(home, /PRESTIGE_B_DRAPE|POST_MARK/, 'the promo card’s mark is gone with the card');
  assert.match(home, /resizeMode="cover"/);
  assert.doesNotMatch(home, /resizeMode=\{isDark/);

  // GROUND — home(12). Light's content container still paints its own; the
  // atmosphere raster stays a dark-only COLOUR treatment (it is absolutely
  // positioned and lays out nothing).
  assert.match(home, /content: \{ flexGrow: 1, backgroundColor: colors\.homeBackground,/);
  assert.match(stripComments(read('components/HomeAtmosphere.tsx')), /if \(!isDark\) return null;/);

  // THE MODE SWITCH left this screen on 2026-09-18 (the [+] sheet's bottom
  // row carries it); its ring pin lives on in home(17), re-pointed.
  assert.doesNotMatch(home, /modeSwitch/);

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
  // RUN N3 (2026-09-08): the radius is navBar.createRadius (18) rather than
  // radius.lg (17). WHAT THIS FENCE ASSERTS IS UNCHANGED — that there is ONE
  // radius and ONE ring weight, on the style both themes share, so a
  // light-only corner can never come back. Only the token supplying it moved,
  // and it moved because 18 is not on the radius scale and the scale is not
  // being re-cut for one control.
  assert.match(
    shared[1],
    /borderRadius: navBar\.createRadius, borderWidth: 1,/,
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
// H17 — "Switch to Worker" LIVES IN THE [+] SHEET, NOT ON CUSTOMER HOME.
//
// RE-POINTED 2026-09-18 (operator decision, docs/DECISIONS.md 2026-09-18): the
// pill this fence measured — its 1pt ring, its per-theme ring colour, its
// sans-ladder label and its 149.5pt width — is gone from customer Home. What
// it protected was the customer's one deliberate way into worker mode; that
// row is the create sheet's now, through the same switchMode() with its
// confirm, and this fence follows it.
//
// CATCHES: the pill creeping back onto Home under any style name; the sheet
// losing the row, its exact label (the E2E walk and VoiceOver both read it),
// or its "confirms first" hint; a switch that bypasses switchMode(); Worker
// Home's own pill being dragged along (it stays, untouched).
//
// WHY NOT VACUOUS: the sheet's row, its handler and the tree's dispatch are
// read separately and each pinned; the Home side is a doesNotMatch over the
// code with comments stripped, so a comment that names the pill cannot
// satisfy it and a pill cannot hide in one.
// ---------------------------------------------------------------------------
test('home(17) fence: the mode switch lives in the [+] sheet, not on customer Home', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));
  assert.doesNotMatch(home, /modeSwitch|switchToWorker|Switch to Worker|useMode\(/);
  assert.doesNotMatch(home, /home\.modeSwitch\.paddingX/);

  const sheet = flatten(read('components/CreateSheet.tsx'));
  assert.match(sheet, /accessibilityLabel="Switch to Worker"/);
  assert.match(sheet, /<Text style=\{styles\.rowLabel\}>Switch to Worker<\/Text>/);
  assert.match(sheet, /<Text style=\{\[styles\.hint, isDark && styles\.hintDark\]\}>confirms first<\/Text>/);
  assert.match(sheet, /onPress=\{onSwitchMode\} disabled=\{switching\}/);
  // The row is the last thing on the sheet, set apart under its own hairline.
  assert.match(sheet, /styles\.switchRow/);
  assert.ok(
    sheet.indexOf('styles.switchRow') > sheet.indexOf('accessibilityLabel={item.label}'),
    'the switch row sits below the action rows'
  );

  const tree = stripComments(read('navigation/CustomerRoot.tsx'));
  assert.match(tree, /const \{ switchMode, switching \} = useMode\(\);/);
  assert.match(tree, /onSwitchMode=\{\(\) => runCreateAction\(\(\) => void switchMode\('worker'\)\)\}/);
  assert.match(tree, /switching=\{switching\}/);

  // WORKER HOME IS UNTOUCHED: its pill, its dial and its switch stay.
  const worker = stripComments(read('screens/WorkerHomeScreen.tsx'));
  assert.match(worker, /void switchMode\('customer'\)/);
  assert.match(worker, /useDialNumber\('workerHome\.modeSwitch\.paddingX'\)/);
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
  // home(25) took the promo heading to 18/28 off the replaced master's 60px =
  // 27.7pt of pitch; the tuning pass took it to 19/30. 2026-09-18: RETIRED —
  // the promo card and its heading are gone (dispatch home-task-card); the
  // task card's title is 20/24 sans and takes no rung, and home(2) pins it.
  // What is asserted here now is the absence, so the heading cannot come back
  // under the old name and quietly re-enter the ladder.
  assert.doesNotMatch(flat, /heroHeadline: \{|heroHeadlineDark: \{/, 'the promo heading left with its card');

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
  // 2026-09-21: the period is gone (DECISIONS 2026-09-20 sitting 3, (8)); the
  // measured 210.0 at 30pt was for the line WITH it, so it stays a safe bound.
  assert.match(
    flat,
    /Take a task\{'\\n'\}off your plate\s*<\/Text>/,
    "the headline is two lines, broken after 'task' by the operator, with no period"
  );
  assert.ok(
    hero <= ladder('heroHeadline'),
    `the cap height says ${ladder('heroHeadline')}pt; the column says less. The smaller wins`
  );

  // THE DELIBERATE DIVERGENCE, asserted as a divergence. (There were two: the
  // promo heading's 19 against a 22 rung was the other, and it left the
  // ladder with the promo card on 2026-09-18 — `promoHeading` is asserted
  // absent from MASTER_SERIF_CAPS so a rung nothing reads cannot stand in it.)
  assert.doesNotMatch(caps[1], /promoHeading/, 'the promo heading’s rung left with the heading it sized');
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
  // the five classic tabs), so the band is a dispatch bound rather than a
  // measurement, and it is recorded as such.
  //
  // RUN N3 (2026-09-08) — THE CEILING MOVES, 0.88 → 0.89, AND NOTHING ELSE
  // ABOUT THIS CHECK DOES. The operator dialled the control to 62 in the new
  // 70pt bar; 62 / 70 = 88.6%, which sat one half of a point outside home(18)'s
  // 85-88 bound. The bound was never the constraint — CONTAINMENT is, and it is
  // asserted below from the source's own numbers, unchanged and still passing
  // with 4pt of clearance top and bottom. What moved is the recorded band, to
  // the value the operator chose.
  const shareOfPill = size / pillHeight;
  assert.ok(
    shareOfPill >= 0.85 && shareOfPill <= 0.89,
    `the [ + ] is ${(shareOfPill * 100).toFixed(1)}% of the pill's height; it belongs between ` +
      '85% and 89%'
  );

  // Parity 2026-08-22: ONE geometry for both themes — the frozen light square
  // and its lift are retired; light keeps only its colours.
  assert.doesNotMatch(bar, /CREATE_BUTTON_LIGHT_SIZE|CREATE_BUTTON_LIGHT_RAISE/);

  // FILLED FROM A TOKEN SURFACE, dark only. home(8) made that fill GOLD, which
  // is the operator reversal this fence was built around; 2026-09-17 REVERSES
  // THE GOLD, on operator instruction, and gives the control the dark
  // "Post a job" pill's own recipe instead. What this pins is unchanged in
  // KIND and is the half that has never moved: the control must be FILLED,
  // from a token surface, never from a hex spelled at the call site.
  const darkFill =
    /createButtonDark: \{ backgroundColor: (colors|navBar)\.(\w+),/.exec(flat);
  assert.ok(
    darkFill,
    'the dark control must be FILLED from a token surface — the palette or ui/tokens.ts navBar'
  );
  // AND THE WASH OVER IT IS THE PILL'S, not a second description of it. The
  // recipe is read off the source so "identical by construction" stays a fact
  // about this file rather than a claim in a comment: the same primitive, the
  // same far stop, the same lift, the shared alpha token — and `flat: !isDark`,
  // which is the whole of "dark only" (litFill returns undefined in light, and
  // React Native drops undefined from a style array).
  assert.match(
    flat,
    /const litTile = litFill\(\{ surface: fillDial \?\? colors\.postPillGreen, lift: colors\.emerald, liftAlpha: navBar\.createLiftAlpha, highlight: false, flat: !isDark, \}\);/,
    "the dark tile must be lit with the Post-a-job pill's own recipe, dark only"
  );
  assert.equal(
    `${darkFill[1]}.${darkFill[2]}`,
    'colors.postPillGreen',
    "the flat far stop under the wash must be the pill's green, so the two controls cannot drift"
  );
  // 2026-09-17: THE RING IS GONE IN DARK, and it went by COLOUR rather than by
  // width. `borderWidth: 1` stays on the shared style — RN lays a border inside
  // the box, so zeroing it in one theme moves that theme's content box by a
  // point, which is the geometry fork tests/themeTokens.test.mjs forbids. So
  // what replaces "the ring must be a token, and never the fill's own colour"
  // is the stronger statement that there is no ring at all, spelled the way
  // screens/HomeScreen.tsx already un-rings the dark pill.
  assert.match(
    flat,
    /createButtonDark: \{ backgroundColor: colors\.postPillGreen, borderColor: 'transparent', \}/,
    "the dark control declares NO ring — 'transparent', so no geometry forks with it"
  );
  assert.match(
    flatten(read('screens/HomeScreen.tsx')),
    /heroButtonDark: \{ backgroundColor: colors\.postPillGreen, borderColor: 'transparent' \}/,
    'and it is the same spelling the dark Post-a-job pill uses, which is the control it matches'
  );
  // RUN H2 — THE COLOURS FORK PER THEME AGAIN AND THE GEOMETRY DOES NOT, which
  // is the split the parity pass was actually protecting. What these
  // assertions pin is unchanged in KIND: the glyph is legible against its own
  // tile in both themes, the ring is never the fill's own colour, and no hue
  // is written as a hex at the call site. Only the values moved.
  // S2 (C6): the glyph colour is its dial, DEFAULTING to the per-theme
  // palette read — the fork and its tokens are pinned exactly as before.
  // RUN N3 (2026-09-08): dark's half reads ui/tokens.ts navBar now — the token
  // it took, `postPillGreen`, is THEME-CONSTANT and also fills light's tile,
  // so the dark glyph could not move while it stayed on the palette. The
  // widening is the ring's D14 widening again, and the two assertions under
  // it are untouched: a per-theme read off a token surface, never a hex.
  const glyphColour =
    /<Ionicons name="add" size=\{glyph\} color=\{glyphColorDial \?\? \(isDark \? (?:colors|navBar)\.(\w+) : colors\.(\w+)\)\}/.exec(flat);
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
  // RUN N3 (2026-09-08): the corner is navBar.createRadius (18) rather than
  // radius.lg (17) — the operator dialled 18, which is not on the radius
  // scale, and the scale does not move for one control. What this pins is
  // unchanged: the corner is GEOMETRY, so it stays on the style both themes
  // share, and neither a fill nor a ring may reappear beside it.
  const base = /createButton: \{ borderRadius: navBar\.createRadius, borderWidth: 1,([^}]*)\}/.exec(flat);
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
  // 2026-09-17: the glow follows the FILL, which is what it has always done —
  // it was `colors.gold` when the tile was gold on one side of the palette and
  // light's gold on the other. Dark's tile is the pill's green now, so dark's
  // halo is too, and LIGHT'S ARM IS PINNED UNCHANGED beside it. One shape, one
  // alpha, one declaration: the ternary reaches the COLOUR only, so the depth
  // still does not fork.
  assert.match(
    flat,
    /const halo = glow\.halo\( withAlpha\( glowColorDial \?\? \(isDark \? colors\.postPillGreen : colors\.gold\), glowDial \?\? navBar\.createGlowAlpha \) \);/,
    "the control lifts with a glow the colour of its own fill, built from the shared glow shape"
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
// THE MAP SCREEN'S CHROME FLOATS — 2026-08-23, operator instruction; redrawn
// 2026-09-19 to the approved Map design (docs/mockups/html/map-explore-*).
//
// The screen had been three stacked panels: an opaque header slab, the map,
// an opaque bottom band. Two of those are gone. The map is the GROUND, filling
// the screen absolutely, and the chrome rides on it as inset, rounded panes:
// since 2026-09-19 one glass search pill, one chip and the floating jobs
// sheet, every one of them wearing the `pane` MATERIAL rather than a
// withAlpha slab of its own — liquid glass in dark, and flat white in light
// by the operator's ruling ("no liquid glass on light mode"), which is why
// translucency is asserted through the material and not through a number
// in this file.
//
// WHY IT NEEDS A FENCE. This is the fourth pass over this screen's chrome
// (2026-08-22 removed the header CARD and the footer CARD; 2026-08-23 the
// slabs those left behind; 2026-09-19 the capsules), and each pass has been
// a reduction that a later run could plausibly read as a missing background
// and "fix". The two properties that must not silently revert are the
// LAYERING (the map behind everything) and the GROUND (no pane names a fill
// of its own — the material is the one place a pane's ground is defined).
// ---------------------------------------------------------------------------
test('map(1) fence: the map is the ground and the chrome floats on it, on the pane material', () => {
  const map = stripComments(read('screens/MapScreen.tsx'));
  const flat = flatten(read('screens/MapScreen.tsx'));

  // THE LAYERING. The map is absolutely positioned — not a `flex: 1` panel
  // between two rows — so its bounds extend behind the search pill, behind
  // the sheet and under the status bar. The retired wrapper must not return.
  assert.match(
    flat,
    /mapLayer: \{ \.\.\.StyleSheet\.absoluteFillObject,/,
    'the map must fill the screen absolutely, or the chrome is not floating over anything'
  );
  assert.doesNotMatch(flat, /mapWrap/, 'the flex-panel map wrapper is retired');
  // The map is rendered from the ground layer, and the chrome layer sits over
  // it without swallowing the pans and taps the map needs — the header block
  // included, so a tap between the pill and the chip reaches the tiles.
  assert.match(flat, /<View style=\{styles\.mapLayer\}> <HotspotMap/);
  assert.match(
    flat,
    /<SafeAreaView style=\{styles\.safe\} edges=\{\['top'\]\} pointerEvents="box-none">/,
    'the chrome layer must be box-none or the map stops panning'
  );
  assert.match(flat, /<View style=\{styles\.headerBlock\} pointerEvents="box-none">/);

  // NO PANE NAMES ITS OWN GROUND. The search pill, the chip and the customer
  // count capsule are `pane` Surfaces; the field inside the pill hands its
  // ground to the pill; and the retired slabs — the header wrap, the footer
  // bar and their withAlpha floors — do not come back under any name.
  // 2026-09-20 (sitting 2, item 13): the pill wears its own edge — option C's
  // rim and glow from ui/tokens.ts paneEdges — on the same pane Surface.
  assert.match(
    flat,
    /<View onLayout=\{onPillLayout\}> <Surface material="pane" radius=\{searchRadius\} corners="all" rim=\{paneEdges\.search\.rim\} halo=\{paneEdges\.search\.halo\} style=\{styles\.searchPill\} >/
  );
  // 2026-09-20: the field reads in the ink — the design's bright placeholder,
  // mic and 24pt magnifier — through the SearchBar's own prop.
  assert.match(flat, /emphasis="ink"/);
  assert.match(flat, /<Surface material="pane" radius=\{MAP_CHIP_RADIUS\} corners="all"/);
  assert.match(flat, /<Surface material="pane" radius=\{sheetRadius\} corners="all" style=\{\[styles\.countCapsule,/);
  assert.match(
    flat,
    /searchField: \{ minHeight: MAP_SEARCH_HEIGHT - 2, backgroundColor: 'transparent', borderColor: 'transparent',/,
    'the field inside the pill must paint nothing of its own'
  );
  assert.doesNotMatch(flat, /searchPill: \{[^}]*backgroundColor/, 'the pill takes its ground from the material');
  assert.doesNotMatch(flat, /headerWrap|footerBar|withAlpha\(colors\.background/, 'the slabs stay retired');
  // The sheet is the shared PeekSheet, which wears the same material; this
  // screen hands it the design's corner, padding and inset through dials.
  assert.match(flat, /<PeekSheet/);
  assert.match(flat, /useDialNumber\('map\.sheet\.radius'\) \?\? MAP_SHEET_RADIUS/);
  assert.match(flat, /useDialNumber\('map\.searchPill\.radius'\) \?\? MAP_SEARCH_RADIUS/);
  const sheet = flatten(read('components/PeekSheet.shared.tsx'));
  assert.match(sheet, /<Surface material="pane" radius=\{radius\} corners="all"/);
  // The chrome layer itself paints nothing: every pixel is the map or a pane.
  assert.match(flat, /safe: \{ flex: 1, backgroundColor: 'transparent',? \}/);
  // And the screen still has ONE opaque ground, under the map — not behind
  // the chrome — so no frame paints the platform's white before tiles land.
  assert.match(flat, /root: \{ flex: 1, backgroundColor: colors\.background,? \}/);

  // ANTI-VACUITY: the elements this fence is about are still the ones on the
  // screen. The 26pt "Find Jobs Near You" display title is GONE as of
  // 2026-08-24 — it named the screen the user had already chosen to be on, and
  // it was the single largest thing the header capsule had to hold legible
  // over live tiles. The shared SearchBar is what the pill carries now, under
  // the design's own placeholder, and the count lives in the sheet's head.
  assert.doesNotMatch(map, /Find Jobs Near You/, 'the display title is retired, not hidden');
  assert.match(map, /<SearchBar/, 'the search pill carries the shared search field');
  assert.match(map, /placeholder="Explore nearby jobs"/);
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
  // The ternary still forks on theme and still reads a token surface. Only the
  // LIGHT arm moved in H3, and BOTH arms are pinned BY NAME so a future edit
  // that "unifies" the two fails here rather than in a screenshot.
  //
  // RUN N3 (2026-09-08) — THE DARK ARM MOVED, and H3's own claim is intact:
  // H3 was light-only and this line is not evidence that it drifted. What
  // moved the dark arm is N3, on operator instruction — postPillGreen is
  // theme-CONSTANT and also fills light's tile three lines down, so the dark
  // glyph could not change while it read the palette. The pin follows it to
  // ui/tokens.ts's navBar and stays a pin: light is asserted UNCHANGED just
  // below, which is the half H3 exists to protect.
  const glyph =
    /<Ionicons name="add" size=\{glyph\} color=\{glyphColorDial \?\? \(isDark \? (?:colors|navBar)\.(\w+) : colors\.(\w+)\)\}/.exec(bar);
  assert.ok(glyph, 'the [ + ] glyph must still take its colour per theme, off a token surface');
  // 2026-09-17 MOVES THE DARK ARM AGAIN, and H3's own claim is intact for the
  // same reason it survived N3: H3 was light-only, and light is asserted
  // UNCHANGED on the next line. N3's `navBar.glyphColorDark` was a green for
  // reading against a GOLD tile; the tile is that green now, so the glyph is
  // the content colour a green fill takes — the palette's `onForest`, the app's
  // cream, and the value the dark "Post a job" label is already set in.
  assert.equal(glyph[1], 'onForest', "the dark glyph is the app's cream on the pill's green");
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
  //
  // RUN N3 (2026-09-08) moved the dark FILL to `navBar.gold` — the control's
  // own metal, one step warmer, on operator instruction.
  //
  // 2026-09-17 REVERSES THE GOLD ALTOGETHER, on operator instruction: the dark
  // tile takes the dark "Post a job" pill's green and drops its ring. H3's
  // claim survives in the form that matters, exactly as it survived N3 — the
  // branch is STILL asserted WHOLE, so nothing may move in it unnoticed, and
  // the light branch above is still pinned unchanged, which is what "light
  // only" was ever a claim about. What is gone is the gold, not the fence.
  assert.match(
    bar,
    /createButtonDark: \{ backgroundColor: colors\.postPillGreen, borderColor: 'transparent', \}/,
    "the dark tile takes the Post-a-job pill's green and declares no ring; light is untouched"
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
  // 2026-09-17 — RE-POINTED, on operator instruction. H2 renamed this heading
  // "Live Nearby" -> "Nearby"; the section itself has now LEFT the customer
  // Home and "Your jobs" holds its slot. What this pins is unchanged in kind —
  // the heading is one text node, spelled once, in the shared section style —
  // and the retired copy is still fenced against returning.
  assert.match(home, /<Text style=\{styles\.sectionTitle\}>Your jobs<\/Text>/);
  assert.doesNotMatch(home, /Live Nearby<\/Text>/, '"Live Nearby" is retired copy');
  assert.doesNotMatch(home, />Nearby<\/Text>/, 'Nearby is Discover’s surface and worker mode’s');
  // AND THE LIVE INDICATOR WENT WITH IT. H2 kept the pulsing mark because the
  // pulse was the word's real meaning; there is nothing live about a customer's
  // own postings, so the mark has nothing left to say and is gone from this
  // screen. The two palette hues it drew (homeLive / homeLiveHalo) are
  // untouched — worker mode still draws a feed dot with them.
  assert.doesNotMatch(home, /styles\.liveDot|styles\.liveIndicator/);

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
