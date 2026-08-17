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
const workerHome = read('screens/BrowseJobsScreen.tsx');
const jobCard = read('ui/primitives/JobCard.tsx');
const bottomNav = read('ui/primitives/BottomNav.tsx');
const migration = read('supabase/phase42_active_mode.sql');

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
    ['screens/BrowseJobsScreen.tsx', workerHome],
    ['navigation/ModeShell.tsx', shell],
    ['navigation/CustomerRoot.tsx', customerRoot],
    ['navigation/WorkerRoot.tsx', workerRoot],
    ['App.tsx', app],
  ]) {
    assert.doesNotMatch(source, /setMode\(/, `${path} must not set the mode`);
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
});

test('a switch always confirms, and there is no flag to skip it', () => {
  assert.match(provider, /const confirmed = await confirmAsync\(\{/);
  assert.match(provider, /if \(!confirmed\) return;/);
  // The options bag deliberately exposes copy, not an opt-out.
  assert.doesNotMatch(provider, /skipConfirm|force\s*[?:]|silent\s*[?:]/);
});

test('there is one transition owner', () => {
  // The overlay is started from the provider and nowhere else.
  assert.match(provider, /startTransition\(\{/);
  for (const [path, source] of [
    ['screens/HomeScreen.tsx', home],
    ['screens/BrowseJobsScreen.tsx', workerHome],
  ]) {
    assert.doesNotMatch(
      source,
      /useModeTransition/,
      `${path} must go through switchMode(), not drive the overlay itself`
    );
  }
  // And the mode flips inside the overlay's own callback — no timer of ours.
  assert.match(provider, /onSwitch: \(\) => setMode\(target\)/);
  assert.doesNotMatch(provider, /setTimeout\(/);
});

test('the locked homes switch through switchMode() and nothing else', () => {
  assert.match(home, /void switchMode\('worker'\)/);
  assert.match(workerHome, /void switchMode\('customer'\)/);
  assert.doesNotMatch(workerHome, /navigation\.popToTop\(\)/);
});

// ---------------------------------------------------------------------------
// The trees are separate, and separately typed
// ---------------------------------------------------------------------------

test('the shared Map tab offers Worker Home only in worker mode', () => {
  // Map is mounted by BOTH trees, so its "See All Jobs" control renders for a
  // customer too — and its destination, BrowseJobs, exists only in the worker
  // tree's Home stack. It was both a §F leak (a worker surface offered to a
  // customer) and, when tapped, the "state or screen couldn't be applied"
  // crash. The control is now absent in customer mode rather than redirected:
  // there is no customer equivalent of "all open jobs".
  const map = read('screens/MapScreen.tsx');
  assert.match(map, /const \{ mode \} = useMode\(\)/);
  assert.match(map, /right=\{\s*mode === 'worker' \? \(/);
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
  assert.doesNotMatch(customerRoot, /BrowseJobsScreen|WorkerResultsScreen|JobDetailScreen/);
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
  // boundary is HomeMain/WorkerSearch vs BrowseJobs/WorkerResults; those stay.
  for (const customerRoute of ['HomeMain', 'WorkerSearch']) {
    assert.ok(
      !new RegExp(`^\\s*${customerRoute}:`, 'm').test(workerList),
      `${customerRoute} must not be on the worker Home stack`
    );
  }
});

test('the Home tab roots at the home of the mode you are in', () => {
  assert.match(customerRoot, /name="HomeMain" component=\{HomeScreen\}/);
  assert.match(workerRoot, /name="BrowseJobs" component=\{BrowseJobsScreen\}/);
  // The listener that used to infer mode from stack contents is gone, because
  // popping to the root is now correct in both trees. (Comments are stripped
  // first — CustomerRoot.tsx explains the absence in prose.)
  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codeOnly(customerRoot), /tabPress|listeners=/);
  assert.doesNotMatch(codeOnly(workerRoot), /tabPress|listeners=/);
  assert.doesNotMatch(codeOnly(app), /tabPress|listeners=/);
});

test('exactly one tree is mounted, and swapping them is the stack reset', () => {
  assert.match(shell, /mode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>/);
  // No redirect, no reset call, nothing that could loop.
  assert.doesNotMatch(shell, /navigate\(|reset\(|navigationRef/);
});

test('the shell holds rather than guessing while the mode resolves', () => {
  assert.match(shell, /if \(!ready\) \{/);
  assert.match(shell, /<ActivityIndicator/);
});

test('each tree carries its Stage 4D tab contract', () => {
  const tabs = (source) =>
    [...source.matchAll(/<Tab\.Screen\s+name="(\w+)"/g)].map((m) => m[1]);
  // Worker: the five classic tabs, unchanged — LOCKED screen 48 sits above
  // this exact bar.
  assert.deepEqual(tabs(workerRoot), ['Home', 'Map', 'MyJobs', 'Messages', 'Profile']);
  // Customer (4D-1a): four visible tabs with the center [ + ] action between
  // Discover and Messages, then the two HIDDEN routes — Map because the
  // LOCKED Home's "View map" pill dispatches getParent()?.navigate('Map')
  // against this navigator, MyJobs because the hire loop and notification
  // routing live behind that tab name in both modes. Hidden routes are
  // registered last so the visible bar order is the first five.
  assert.deepEqual(tabs(customerRoot), [
    'Home',
    'Discover',
    'Create',
    'Messages',
    'Profile',
    'MyJobs',
    'Map',
  ]);
  // The hidden pair is actually hidden, and the action is actually an action
  // (a sheet opener via tabBarButton), never a navigation destination.
  assert.match(
    customerRoot,
    /name="MyJobs"[\s\S]{0,120}?options=\{HIDDEN_TAB_ITEM_OPTIONS\}/
  );
  assert.match(
    customerRoot,
    /name="Map" component=\{MapStackNavigator\} options=\{HIDDEN_TAB_ITEM_OPTIONS\}/
  );
  assert.match(customerRoot, /tabBarButton: \(\) => <CenterCreateButton/);
  // Same bar configuration in both trees, so the chrome under LOCKED screens
  // 07/48 cannot drift between modes.
  assert.match(customerRoot, /bottomNavScreenOptions\(insets\.bottom\)/);
  assert.match(workerRoot, /bottomNavScreenOptions\(insets\.bottom\)/);
});

test('the locked customer Home "View map" dispatch still resolves on the tab navigator', () => {
  // The LOCKED screen's pill dispatches an untargeted NAVIGATE at the tab
  // navigator (getParent). React Navigation 7 resolves that against the tab
  // navigator and its ancestors only — never child navigators — so the route
  // must stay registered HERE (hidden), not inside the Home stack.
  assert.match(home, /getParent\(\)\?\.navigate\('Map'\)/);
  assert.match(customerRoot, /<Tab\.Screen name="Map" component=\{MapStackNavigator\}/);
});

test('the center action opens the creation sheet with exactly the three 4D-1a actions', () => {
  assert.match(customerRoot, /<ActionSheet/);
  assert.match(customerRoot, /label: 'Post a job'/);
  assert.match(customerRoot, /label: 'Hire someone again'/);
  assert.match(customerRoot, /label: 'My jobs'/);
  // Destinations go through the one guarded cross-tab dispatch path, into
  // existing surfaces — no new picker, no new sheet component.
  assert.match(customerRoot, /navigateAcrossTabs\('Home', 'PostJob'\)/);
  assert.match(customerRoot, /navigateAcrossTabs\('Profile', 'SavedWorkers'\)/);
  assert.match(customerRoot, /navigateAcrossTabs\('MyJobs'\)/);
  // The Create slot itself is never navigated to.
  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codeOnly(customerRoot), /navigate\('Create'/);
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
