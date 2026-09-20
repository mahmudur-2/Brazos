import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// ===========================================================================
// The mode rules, executed rather than restated
// ===========================================================================
// modes/types.ts is deliberately free of React / React Native / Supabase
// imports so the coercion, keying and precedence rules can be run here rather
// than asserted about as text. Same arrangement as lib/setupState.ts.
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const {
  APP_MODES,
  DEFAULT_MODE,
  coerceAppMode,
  isAppMode,
  modeFromLanding,
  modeLabel,
  modeStorageKey,
  otherMode,
  resolveInitialMode,
} = await import(toDataUrl(stripTypeScriptTypes(read('modes/types.ts'), { mode: 'strip' })));

const provider = read('modes/ModeProvider.tsx');
const guard = read('modes/ModeGuard.tsx');
const shell = read('navigation/ModeShell.tsx');
const customerRoot = read('navigation/CustomerRoot.tsx');
const workerRoot = read('navigation/WorkerRoot.tsx');
const routes = read('lib/navigation.ts');
const app = read('App.tsx');
const home = read('screens/HomeScreen.tsx');
const jobCard = read('ui/primitives/JobCard.tsx');
const bottomNav = read('ui/primitives/BottomNav.tsx');
const migration = read('supabase/archive/phases/phase42_active_mode.sql');

// ---------------------------------------------------------------------------
// An invalid mode can never exist
// ---------------------------------------------------------------------------

test('there are exactly two modes', () => {
  assert.deepEqual([...APP_MODES], ['customer', 'worker']);
  assert.equal(DEFAULT_MODE, 'customer');
  assert.equal(otherMode('customer'), 'worker');
  assert.equal(otherMode('worker'), 'customer');
  assert.equal(modeLabel('worker'), 'Worker');
  assert.equal(modeLabel('customer'), 'Customer');
});

test('anything that is not exactly one of the two literals is not a mode', () => {
  for (const value of ['customer', 'worker']) assert.ok(isAppMode(value));
  for (const value of [
    null,
    undefined,
    '',
    'Customer',
    'WORKER',
    'admin',
    'both',
    0,
    1,
    {},
    [],
    ['worker'],
  ]) {
    assert.ok(!isAppMode(value), `${JSON.stringify(value)} must not be a mode`);
  }
});

test('coercion always yields a valid mode, never a passthrough', () => {
  assert.equal(coerceAppMode('worker'), 'worker');
  assert.equal(coerceAppMode('nonsense'), DEFAULT_MODE);
  assert.equal(coerceAppMode(undefined), DEFAULT_MODE);
  assert.equal(coerceAppMode(null), DEFAULT_MODE);
  // An explicit fallback is honoured, and is itself validated by the type.
  assert.equal(coerceAppMode(null, 'worker'), 'worker');
});

// ---------------------------------------------------------------------------
// Where the initial mode comes from
// ---------------------------------------------------------------------------

test('a just-made Setup choice beats every stored answer', () => {
  assert.equal(modeFromLanding('work'), 'worker');
  assert.equal(modeFromLanding('hire'), 'customer');
  assert.equal(
    resolveInitialMode({ landing: 'worker', remote: 'customer', local: 'customer' }),
    'worker'
  );
});

test('the server beats the device cache, so a switch on another device wins', () => {
  assert.equal(resolveInitialMode({ remote: 'worker', local: 'customer' }), 'worker');
  assert.equal(resolveInitialMode({ remote: 'customer', local: 'worker' }), 'customer');
});

test('an unreachable server falls back to the cache, and then to the default', () => {
  // phase42 not applied, offline, or a failed request: fetchMyActiveMode()
  // returns null and the cache carries the answer.
  assert.equal(resolveInitialMode({ remote: null, local: 'worker' }), 'worker');
  assert.equal(resolveInitialMode({ remote: undefined, local: 'worker' }), 'worker');
  // Nothing anywhere, or garbage everywhere.
  assert.equal(resolveInitialMode({}), DEFAULT_MODE);
  assert.equal(
    resolveInitialMode({ landing: 'nope', remote: 'ADMIN', local: 42 }),
    DEFAULT_MODE
  );
});

test('the device cache is scoped per account', () => {
  assert.notEqual(modeStorageKey('user-a'), modeStorageKey('user-b'));
  assert.match(modeStorageKey('user-a'), /^brazos\.mode\.v1\.user-a$/);
});

// ---------------------------------------------------------------------------
// switchMode() is the only way modes change
// ---------------------------------------------------------------------------

test('nothing outside ModeProvider sets a mode', () => {
  // The provider owns the state; no other file may hold or set it.
  assert.match(provider, /const \[mode, setMode\] = useState<AppMode>\(DEFAULT_MODE\)/);
  for (const [path, source] of [
    ['screens/HomeScreen.tsx', home],
    ['navigation/ModeShell.tsx', shell],
    ['navigation/CustomerRoot.tsx', customerRoot],
    ['navigation/WorkerRoot.tsx', workerRoot],
    ['App.tsx', app],
  ]) {
    assert.doesNotMatch(source, /setMode\(/, `${path} must not set the mode`);
    assert.doesNotMatch(source, /setTreeMode\(/, `${path} must not set the tree mode`);
  }
});

test('sign-out disarms resolution so the next account cannot race Setup', () => {
  // AUD-P2-06: `armed` surviving sign-out would resolve the NEXT account's
  // mode the instant its session appears — before that account's Setup runs —
  // consuming a pending landing that is not theirs and stamping resolvedFor
  // before the "Start in" choice exists. The sign-out reset must drop all
  // three pieces of state; ModeShell re-arms on mount, after auth + legal +
  // setup have resolved for the new account.
  const signOutReset = provider.match(/if \(userId\) return;[\s\S]{0,200}?\}, \[userId\]\);/);
  assert.ok(signOutReset, 'expected the sign-out reset effect in ModeProvider');
  assert.match(signOutReset[0], /setArmed\(false\)/);
  assert.match(signOutReset[0], /setResolvedFor\(null\)/);
  assert.match(signOutReset[0], /setMode\(DEFAULT_MODE\)/);
  assert.match(signOutReset[0], /setTreeMode\(DEFAULT_MODE\)/);
});

test('a switch always confirms, and there is no flag to skip it', () => {
  assert.match(provider, /const confirmed = await confirmAsync\(\{/);
  // Stage 4D: switchMode reports its outcome, so a declined confirm returns
  // false — same refusal, now observable by the cross-mode notification gate.
  assert.match(provider, /if \(!confirmed\) return false;/);
  // The options bag deliberately exposes copy, not an opt-out.
  assert.doesNotMatch(provider, /skipConfirm|force\s*[?:]|silent\s*[?:]/);
});

test('an awaited switch resolves only after the target tree is committed', () => {
  // Stage 4D: cross-mode notification routing awaits switchMode() and then
  // dispatches — so the promise must not settle until the TREE for the target
  // mode has committed. Since the two-commit swap, that is the [treeMode]
  // effect: it runs one commit after `mode` flips, after the mounted tree's
  // own effects (children before parents). Resolving on [mode] would hand the
  // caller a promise that settles during the gap commit, when NO tree is
  // mounted and the dispatch would be dropped. A decline or refusal resolves
  // false.
  assert.match(
    provider,
    /switchMode: \(target: AppMode, options\?: SwitchModeOptions\) => Promise<boolean>/
  );
  assert.match(provider, /pendingSwitchResolvers\.current\.push\(\{ target, resolve \}\)/);
  const resolverEffect = provider.match(
    /useEffect\(\(\) => \{\s*if \(pendingSwitchResolvers[\s\S]*?\}, \[treeMode\]\);/
  );
  assert.ok(resolverEffect, 'the resolver must fire from the [treeMode] effect');
  assert.match(resolverEffect[0], /entry\.target !== treeMode/);
  assert.match(resolverEffect[0], /entry\.resolve\(true\)/);
});

test('there is one transition owner', () => {
  // The overlay is started from the provider and nowhere else.
  assert.match(provider, /startTransition\(\{/);
  assert.doesNotMatch(
    home,
    /useModeTransition/,
    'screens/HomeScreen.tsx must go through switchMode(), not drive the overlay itself'
  );
  // And the mode flips inside the overlay's own callback — no timer of ours.
  assert.match(provider, /onSwitch: \(\) => setMode\(target\)/);
  assert.doesNotMatch(provider, /setTimeout\(/);
});

test('the customer switches through switchMode() and nothing else, from the [+] sheet', () => {
  // 2026-09-18: the switch left customer Home for the [+] create sheet's
  // bottom row. The call is the same one and it lives in the customer tree,
  // where the sheet is mounted; Home carries no switch and no navigate that
  // could stand in for one.
  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(customerRoot, /onSwitchMode=\{\(\) => runCreateAction\(\(\) => void switchMode\('worker'\)\)\}/);
  assert.match(customerRoot, /const \{ switchMode, switching \} = useMode\(\);/);
  assert.doesNotMatch(codeOnly(home), /switchMode\(|useMode\(|Switch to Worker/);
  // The sheet's row is the label the confirm dialog is reached from.
  const sheet = codeOnly(read('components/CreateSheet.tsx'));
  assert.match(sheet, /accessibilityLabel="Switch to Worker"/);
  assert.match(sheet, /onPress=\{onSwitchMode\}/);
});

// ---------------------------------------------------------------------------
// The trees are separate, and separately typed
// ---------------------------------------------------------------------------

test('the shared Map tab offers the worker job list only in worker mode', () => {
  // Map is mounted by BOTH trees, so its "See All Jobs" control renders for a
  // customer too — and its destination, WorkerResults, exists only in the
  // worker tree's Home stack. It was both a §F leak (a worker surface offered
  // to a customer) and, when tapped, the "state or screen couldn't be applied"
  // crash. The control is now absent in customer mode rather than redirected:
  // there is no customer equivalent of "all open jobs".
  const map = read('screens/MapScreen.tsx');
  assert.match(map, /const \{ mode \} = useMode\(\)/);
  // 2026-08-24: the gate is asserted, not the slot it used to live in. The
  // 26pt title and its ScreenHeader `right=` prop are gone — the capsule holds
  // a SearchBar now — so the fence pins the DERIVATION and every control that
  // hangs off it, which is what it was ever about. There is exactly one
  // derivation, so a control can be gated or not gated and nothing in between.
  assert.match(map, /const isWorker = mode === 'worker';/);
  assert.equal(
    [...map.matchAll(/mode === 'worker'/g)].length,
    1,
    'the mode question is asked once and read from `isWorker` everywhere else'
  );
  for (const gated of [
    // The distance pill, riding inside the search capsule (its `trailing`).
    /isWorker \? \(\s*<Pressable\s*\n\s*onPress=\{\(\) => setFilterOpen\(true\)\}/,
    // The filter chip row under it.
    /\{isWorker \? \(\s*<View style=\{styles\.chipRow\}>/,
    // The jobs sheet, which lists the worker's open feed.
    /\{isWorker && sheetMaxHeight > 0 \? \(\s*<MapJobsSheet/,
    // The search pill's dispatch, gated at the handler AND at the call site.
    /onSubmit=\{isWorker \? submitSearch : undefined\}/,
    /function submitSearch\(\) \{[\s\S]{0,400}?if \(!isWorker\) return;/,
  ]) {
    assert.match(map, gated, 'a worker-only Map control is not behind the mode gate');
  }
  // Perspective from ModeContext, never a hand-passed prop (CLAUDE.md §V2).
  assert.doesNotMatch(map, /mode[=:]\s*\{?['"](customer|worker)['"]/);
});

test('customer code cannot name a worker route', () => {
  const customerList = routes.slice(
    routes.indexOf('export type CustomerHomeStackParamList'),
    routes.indexOf('export type CustomerHomeStackNavigation')
  );
  for (const workerRoute of ['BrowseJobs', 'JobDetail', 'WorkerResults']) {
    assert.ok(
      !new RegExp(`^\\s*${workerRoute}:`, 'm').test(customerList),
      `${workerRoute} must not be reachable from the customer Home stack`
    );
  }
  // ...and it is not registered there either, so it could not render anyway.
  assert.doesNotMatch(customerRoot, /WorkerResultsScreen|JobDetailScreen/);
});

test('worker code cannot name the customer post/search routes', () => {
  const workerList = routes.slice(
    routes.indexOf('export type WorkerHomeStackParamList'),
    routes.indexOf('export type WorkerHomeStackNavigation')
  );
  // PostJob left this list 2026-08-10: a device-reproduced crash proved the
  // worker tree mounts three screens that dispatch it (WorkerProfile, Chat,
  // JobDetail via useJobOwnerActions) while being the only stack of six not
  // registering it — and it had been registered in all four shared tabs since
  // Phase 5–9, so it was never customer-only in practice. The §F Home-tab
  // boundary is HomeMain/WorkerSearch vs WorkerHome/WorkerResults; those stay.
  for (const customerRoute of ['HomeMain', 'WorkerSearch']) {
    assert.ok(
      !new RegExp(`^\\s*${customerRoute}:`, 'm').test(workerList),
      `${customerRoute} must not be on the worker Home stack`
    );
  }
});

test('the Home tab roots at the home of the mode you are in', () => {
  assert.match(customerRoot, /name="HomeMain" component=\{HomeScreen\}/);
  // Stage 4D: the worker home is the dashboard. 4D-1b unmounted the browse
  // feed (atlas 48); Batch F deleted it. No navigator registers such a route.
  assert.match(workerRoot, /name="WorkerHome" component=\{WorkerHomeScreen\}/);
  assert.doesNotMatch(workerRoot, /name="BrowseJobs"/);
  // The listener that used to infer mode from stack contents is gone, because
  // popping to the root is now correct in both trees. RUN G1 (C4) allows ONE
  // successor: the shared haptics-only tabPress object from BottomNav —
  // pinned to exactly a tap() and nothing else, so it can never navigate,
  // never preventDefault, and never read the stack; the mode-inference
  // listener cannot come back through it. It is the only listener wiring a
  // tree may carry, and App.tsx still carries none at all. (Comments are
  // stripped first — CustomerRoot.tsx explains the history in prose.)
  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(codeOnly(customerRoot), /screenListeners=\{bottomNavScreenListeners\}/);
  assert.match(codeOnly(workerRoot), /screenListeners=\{bottomNavScreenListeners\}/);
  for (const source of [customerRoot, workerRoot]) {
    assert.equal(
      (codeOnly(source).match(/[lL]isteners=/g) ?? []).length,
      1,
      'the shared haptics listener is the ONLY listener wiring a tree may carry'
    );
  }
  assert.match(
    codeOnly(bottomNav).replace(/\s+/g, ' '),
    /export const bottomNavScreenListeners = \{ tabPress: \(\) => \{ tap\(\); \}, \} as const;/,
    'the shared listener is exactly a haptic tap — nothing else'
  );
  assert.doesNotMatch(codeOnly(app), /tabPress|listeners=/);
});

test('exactly one tree is mounted, and swapping them is the stack reset', () => {
  assert.match(shell, /treeMode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>/);
  // No redirect, no reset call, nothing that could loop.
  assert.doesNotMatch(shell, /navigate\(|reset\(|navigationRef/);
});

test('the tree swap is sequenced: unmount commit, then mount commit', () => {
  // The device-reproduced 2026-08-22 defect: swapping the two same-type
  // navigator trees in ONE commit let the incoming tree adopt the outgoing
  // mode's navigation state from the container's single root-state store
  // (React Navigation's adoption check is the router `type` alone, and its
  // route-names fixup preserves route keys), leaving every Home-tab dispatch
  // evaluating against the other mode's routes — "NAVIGATE ... was not
  // handled by any navigator" until a reload. The fix is structural
  // sequencing, and each half is pinned here.
  //
  // 1. The provider owns a `treeMode` that trails `mode` by one commit, and
  //    only its trailing effect moves it after a switch.
  assert.match(provider, /const \[treeMode, setTreeMode\] = useState<AppMode>\(DEFAULT_MODE\)/);
  assert.match(
    provider,
    /useEffect\(\(\) => \{\s*if \(treeMode !== mode\) setTreeMode\(mode\);\s*\}, \[mode, treeMode\]\);/
  );
  // 2. The switch seam flips `mode` ONLY. Setting treeMode there too would
  //    collapse the swap back into a single commit — the defect itself.
  assert.match(provider, /onSwitch: \(\) => setMode\(target\)/);
  assert.doesNotMatch(provider, /onSwitch:[^\n]*setTreeMode/);
  // 3. The initial resolution and sign-out set both in one commit, so the gap
  //    frame exists only during an actual switch.
  assert.match(provider, /setMode\(resolved\);\s*setTreeMode\(resolved\);/);
  // 4. The shell renders NO tree while the two disagree — ground only. The
  //    outgoing tree must be fully unmounted before the incoming one renders.
  assert.match(
    shell,
    /if \(treeMode !== mode\) \{\s*return <View style=\{\[styles\.tree, \{ backgroundColor: palette\.background \}\]\} \/>;\s*\}/
  );
});

test('the shell holds rather than guessing while the mode resolves', () => {
  assert.match(shell, /if \(!ready\) \{/);
  assert.match(shell, /<ActivityIndicator/);
});

test('each tree carries its own tab contract (emerald D1 + D4)', () => {
  const tabs = (source) =>
    [...source.matchAll(/<Tab\.Screen\s+name="(\w+)"/g)].map((m) => m[1]);
  // The WORKER bar is untouched by D1 — decision 4's five, in order. Its Map
  // is a JOB map and is correct.
  assert.deepEqual(tabs(workerRoot), ['Home', 'Map', 'MyJobs', 'Messages', 'Profile']);
  // The CUSTOMER tree, after emerald D1: four destinations and one action
  // drawn, two destinations registered-but-hidden. Registration order IS bar
  // order, so the drawn five must come first and in exactly this sequence —
  // Home · Discover · [ + ] · Messages · Profile.
  assert.deepEqual(tabs(customerRoot), [
    'Home',
    'Discover',
    'Create',
    'Messages',
    'Profile',
    'Map',
    'MyJobs',
  ]);
  // D1 reversal 1: My Jobs left the customer BAR. Not the route — see the
  // reachability test below, which is the half that actually matters.
  // D1 reversal 2: Map → Discover, reversing manifest B-2's "Map, never
  // Discover". Both retired items keep their routes, hidden.
  for (const hidden of ['Map', 'MyJobs']) {
    assert.match(
      customerRoot,
      new RegExp(`name="${hidden}"[\\s\\S]{0,160}?options=\\{HIDDEN_TAB_ITEM_OPTIONS\\}`),
      `${hidden} must stay registered on the customer tab navigator, hidden`
    );
  }
  // ...and Discover is the VISIBLE one now, so the pair cannot be swapped back
  // by accident: it carries a label, never the hidden options.
  assert.match(customerRoot, /name="Discover"[\s\S]{0,160}?tabBarLabel: 'Discover'/);
  assert.doesNotMatch(
    customerRoot,
    /name="Discover"[\s\S]{0,160}?options=\{HIDDEN_TAB_ITEM_OPTIONS\}/,
    'Discover is a drawn tab since D1, not a hidden route'
  );
  // The bar-composition constants agree with the tree, so the pill and the
  // navigator can never draw different sets. CUSTOMER_BAR_TABS holds only the
  // DESTINATIONS; the action is spliced in at CUSTOMER_CREATE_SLOT.
  assert.match(
    bottomNav,
    /export const CUSTOMER_BAR_TABS: BottomNavTabKey\[\] = \['Home', 'Discover', 'Messages', 'Profile'\];/
  );
  assert.match(bottomNav, /export const CUSTOMER_CREATE_SLOT = 2;/);
  assert.match(
    bottomNav,
    /export const WORKER_BAR_TABS: BottomNavTabKey\[\] = \['Home', 'Map', 'MyJobs', 'Messages', 'Profile'\];/
  );
  // Splicing the action in at that index puts it dead centre of five slots.
  const customerBar = ['Home', 'Discover', 'Messages', 'Profile'];
  const drawn = [];
  customerBar.forEach((key, index) => {
    if (index === 2) drawn.push('[+]');
    drawn.push(key);
  });
  assert.deepEqual(drawn, ['Home', 'Discover', '[+]', 'Messages', 'Profile']);
  assert.equal(drawn[Math.floor(drawn.length / 2)], '[+]', 'the [ + ] is the centre slot');
  // D1 names the glyph: a magnifier, not 4D-1a's compass and not Map's pin.
  assert.match(bottomNav, /key: 'Discover'[^}]*icons: \['search', 'search-outline'\]/);
  assert.match(bottomNav, /key: 'Map'[^}]*icons: \['location', 'location-outline'\]/);
  // D4 is CUSTOMER ONLY. The worker bar keeps the five-tab pill with no
  // action slot and no sheet — asserted, not merely left unwritten.
  assert.doesNotMatch(workerRoot, /CenterCreateButton|name="Create"|ActionSheet/);
  // The slot is an ACTION, not a destination: its button replaces the
  // library's pressable outright, so Create never dispatches navigation and
  // never renders focused, and its component draws nothing.
  assert.match(customerRoot, /tabBarButton: \(\) => <CenterCreateButton onPress=/);
  assert.match(customerRoot, /function CreateActionScreen\(\) \{\s*return null;/);
  // 4D-4: the options factory takes the resolved palette so the bar repaints
  // on a theme change — still the ONE implementation, now theme-aware. G1
  // (C4): the first argument is the resolved navBottomPad — the flush
  // formula or the studio dial — from the one hook in hooks/useNavInset.ts.
  assert.match(customerRoot, /const navBottomPad = useNavBottomPad\(\);/);
  assert.match(workerRoot, /const navBottomPad = useNavBottomPad\(\);/);
  assert.match(customerRoot, /bottomNavScreenOptions\(navBottomPad, palette\)/);
  assert.match(workerRoot, /bottomNavScreenOptions\(navBottomPad, palette\)/);
});

test('customer Home no longer links to Map, and the Map route survived anyway', () => {
  // home(9) REPLACES the recorded fact this test used to hold. It asserted
  // that Home's "View map" pill dispatched `getParent()?.navigate('Map')` and
  // that the route was registered to catch it. The pill is gone — the map is a
  // WORKER surface — and the surviving half is the important one: removing an
  // affordance must not remove a destination.
  //
  // React Navigation 7 resolves an untargeted NAVIGATE against the tab
  // navigator and its ancestors only, never child navigators, so the route has
  // to live on the TAB navigator or a future customer-side dispatch throws
  // NAVIGATE-not-handled.
  // Comment-stripped: the docblock that RECORDS the removal necessarily names
  // the thing it removed, and a record of an absence must not read as the
  // absence coming back.
  const homeCode = home.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(
    homeCode,
    /navigate\('Map'\)/,
    'customer Home must not dispatch Map — home(9) removed that control'
  );
  assert.doesNotMatch(homeCode, /View map/, 'the "View map" affordance must not come back');

  // The route is still registered, on the tab navigator, still hidden.
  assert.match(customerRoot, /name="Map"\s+component=\{MapStackNavigator\}/);
  assert.match(
    customerRoot.replace(/\s+/g, ' '),
    /name="Map" component=\{MapStackNavigator\} options=\{HIDDEN_TAB_ITEM_OPTIONS\}/,
    'Map stays registered-but-hidden; un-registering it is what breaks a future dispatch'
  );
  // Registered on the TAB navigator, not smuggled into a child stack.
  const homeStack = customerRoot.slice(
    customerRoot.indexOf('function CustomerHomeStackNavigator'),
    customerRoot.indexOf('function DiscoverStackNavigator')
  );
  assert.doesNotMatch(homeStack, /name="Map"/);

  // THE WORKER MAP IS UNTOUCHED — a visible tab, in the bar roster and in the
  // tree, exactly as before.
  assert.match(
    workerRoot.replace(/\s+/g, ' '),
    /name="Map" component=\{MapStackNavigator\} options=\{\{ tabBarLabel: 'Map' \}\}/,
    'the worker Map tab is not part of this change'
  );
});

test('a customer can still reach My Jobs after D1 took its tab', () => {
  // THE test emerald D1 requires. Removing a bar item must not remove a
  // destination: three independent paths to My Jobs have to survive, and each
  // is pinned here rather than assumed.
  //
  // 1. The route is still registered on the customer tab navigator, so an
  //    untargeted navigate('MyJobs') resolves.
  assert.match(customerRoot, /name="MyJobs"\s+component=\{MyJobsStackNavigator\}/);
  // 2. The [ + ] sheet's "My jobs" action still dispatches it, through the one
  //    guarded cross-tab path.
  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const sheet = codeOnly(customerRoot);
  assert.match(sheet, /key: 'my-jobs'/);
  assert.match(sheet, /label: 'My jobs'/);
  assert.match(sheet, /navigateAcrossTabs\('MyJobs'\)/);
  // 3. Notification routing still lands there in BOTH trees: TAB_FOR_SCREEN
  //    sends all three job destinations through the MyJobs tab, and that only
  //    works because the route above stayed registered.
  const notificationRoutes = read('lib/notificationRoutes.ts');
  for (const screen of ['ClientJobDetail', 'WorkerJob', 'JobDetail']) {
    assert.match(
      notificationRoutes,
      new RegExp(`${screen}: 'MyJobs',`),
      `${screen} notifications must still route through the MyJobs tab`
    );
  }
  // And the hub itself is untouched — D1 removed a tab slot, not a screen.
  assert.match(read('navigation/sharedStacks.tsx'), /name="MyJobsHub" component=\{MyJobsHubScreen\}/);
  // The WORKER tree keeps My Jobs as a drawn tab, so the removal is customer-
  // only exactly as D1 says.
  assert.match(workerRoot, /name="MyJobs"[\s\S]{0,160}?tabBarLabel: 'My Jobs'/);
  assert.doesNotMatch(
    workerRoot,
    /name="MyJobs"[\s\S]{0,160}?HIDDEN_TAB_ITEM_OPTIONS/,
    'the worker My Jobs tab must stay visible'
  );
});

test('the [ + ] sheet is a shortcut: each action also keeps a standing surface', () => {
  // D3 restored the sheet, and the surfaces decision 4 gave those three
  // actions all remain — so the sheet is never the ONLY way to anything and
  // retiring it again would strand nothing.
  // Post a job: Customer Home still navigates to PostJob, and the My Jobs hub
  // carries its own post affordance.
  assert.match(home, /navigate\('PostJob'/);
  assert.match(read('screens/MyJobsHubScreen.tsx'), /navigate\('PostJob'\)/);
  // Hire someone again: SavedWorkers lives on the shared Profile stack.
  assert.match(read('navigation/sharedStacks.tsx'), /name="SavedWorkers"/);
  // My jobs: since emerald D1 the sheet is the customer's PRIMARY way in, not
  // a shortcut past a tab — so its reachability gets its own test above rather
  // than riding on the tab contract.
  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // Exactly those three, and every one dispatched through the ONE guarded
  // cross-tab path rather than a raw navigate.
  const sheet = codeOnly(customerRoot);
  assert.match(sheet, /navigateAcrossTabs\('Home', 'PostJob'\)/);
  assert.match(sheet, /navigateAcrossTabs\('Profile', 'SavedWorkers'\)/);
  assert.match(sheet, /navigateAcrossTabs\('MyJobs'\)/);
  assert.equal((sheet.match(/key: '/g) ?? []).length, 3, 'the sheet carries exactly three actions');
  // Create is a slot, never a destination: nothing navigates to it.
  assert.doesNotMatch(sheet, /navigate\('Create'/);
});

test('there is exactly one bottom nav implementation', () => {
  assert.match(bottomNav, /export function bottomNavScreenOptions/);
  // The trees configure it; they do not re-declare the bar.
  for (const [path, source] of [
    ['navigation/CustomerRoot.tsx', customerRoot],
    ['navigation/WorkerRoot.tsx', workerRoot],
    ['App.tsx', app],
  ]) {
    assert.doesNotMatch(source, /tabBarStyle|tabBarIcon/, `${path} must not restyle the bar`);
  }
});

// ---------------------------------------------------------------------------
// The dev guard
// ---------------------------------------------------------------------------

test('the mode guard logs and never blanks or redirects', () => {
  assert.match(guard, /if \(!__DEV__\) return;/);
  assert.match(guard, /console\.error\(/);
  // Rendering null on a mismatch would turn a wiring mistake into an invisible
  // page, and a redirect could loop. It does neither.
  assert.doesNotMatch(guard, /navigate\(|return null;/);
  // Nothing is asserted while the mode is still resolving.
  assert.match(guard, /if \(!ready\) return;/);
});

// ---------------------------------------------------------------------------
// JobCard's perspective is not a prop
// ---------------------------------------------------------------------------

test('JobCard reads its perspective from ModeContext and offers no override', () => {
  assert.match(jobCard, /const perspective = useModePerspective\(\)/);
  assert.doesNotMatch(
    jobCard,
    /^\s*(mode|perspective|isWorker|isCustomer)\??:/m,
    'JobCard must not accept its perspective as a prop'
  );
  // Both labels exist, and each is bound to the perspective, not to a caller.
  assert.match(jobCard, /isWorker \? 'EST\. PAY' : 'EST\. PRICE'/);
  // Worker-only affordances are gated on the perspective, not on the prop
  // being supplied.
  assert.match(jobCard, /const showBreakTheIce = isWorker &&/);
  assert.match(jobCard, /\{isWorker && onBid && !isOwn \?/);
  assert.match(jobCard, /isWorker && distanceMiles != null/);
});

test('the catalog is the only caller allowed to preview the other perspective', () => {
  const preview = read('modes/perspective.tsx');
  assert.match(preview, /if \(!__DEV__\) return <>\{children\}<\/>;/);
  assert.match(read('dev-tools/ComponentCatalog.tsx'), /<ModePreview mode="worker">/);
  assert.match(read('dev-tools/ComponentCatalog.tsx'), /<ModePreview mode="customer">/);
});

// ---------------------------------------------------------------------------
// The migration
// ---------------------------------------------------------------------------

test('phase42 is idempotent, constrained, and granted', () => {
  assert.match(migration, /add column if not exists active_mode text not null default 'customer'/);
  assert.match(migration, /check \(active_mode in \('customer', 'worker'\)\)/);
  assert.match(migration, /from pg_constraint/, 'the constraint add must be guarded to re-run');
  // The phase32 lesson: a function without an explicit grant is unreachable.
  assert.match(migration, /grant execute on function public\.get_my_active_mode\(\) to authenticated;/);
  assert.match(migration, /grant execute on function public\.set_active_mode\(text\) to authenticated;/);
  // Server-side validation, not just a constraint.
  assert.match(migration, /if p_mode is null or p_mode not in \('customer', 'worker'\) then/);
});

test('phase42 is covered by verify-schema', () => {
  const verify = read('scripts/verify-schema.mjs');
  assert.match(verify, /phase42_active_mode\.sql/);
  assert.match(verify, /checkRpc\('get_my_active_mode', \{\}\)/);
  assert.match(verify, /checkRpc\('set_active_mode', \{ p_mode: 'customer' \}\)/);
  assert.match(verify, /checkColumnRevoked\('profiles', 'active_mode'\)/);
});

test('the client never writes active_mode except through the RPC', () => {
  const profiles = read('lib/profiles.ts');
  assert.match(profiles, /supabase\.rpc\('set_active_mode', \{ p_mode: mode \}\)/);
  assert.match(profiles, /supabase\.rpc\('get_my_active_mode'\)/);
  // A failed persist is reported, never swallowed into a wrong local state.
  assert.match(profiles, /return \{ error \};/);
});
