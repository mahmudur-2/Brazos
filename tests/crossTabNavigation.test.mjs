import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const dir = (path) => readdirSync(new URL(`../${path}`, import.meta.url));

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// One name for the worker feed, in one place
// ---------------------------------------------------------------------------
//
// The device report was "NAVIGATE {name:'WorkerResults'} ... do you have a
// screen named 'WorkerResults'?". There is no second spelling of that route in
// the repo and there must never be one: the param list DECLARES the name, the
// worker Home stack REGISTERS it under that same name, and every caller uses
// the same string literal. An alias route rendering the same component would
// be the second source of truth this asserts against.

test('the worker feed route has exactly one name, declared and registered once', async () => {
  const [routes, workerRoot] = await Promise.all([
    read('lib/navigation.ts'),
    read('navigation/WorkerRoot.tsx'),
  ]);

  const workerList = routes.slice(
    routes.indexOf('export type WorkerHomeStackParamList'),
    routes.indexOf('export type WorkerHomeStackNavigation')
  );
  assert.match(workerList, /^\s*WorkerResults: \{/m);

  const registrations = [
    ...workerRoot.matchAll(/component=\{WorkerResultsScreen\}/g),
  ];
  assert.equal(
    registrations.length,
    1,
    'WorkerResultsScreen must be registered exactly once — a second alias route ' +
      'rendering the same component is a second source of truth for its name'
  );
  assert.match(
    workerRoot,
    /<WorkerHomeStack\.Screen name="WorkerResults" component=\{WorkerResultsScreen\} \/>/
  );
});

test('every WorkerResults entry point is inside a stack that registers it', async () => {
  // emerald(4). The device report was `NAVIGATE {"name":"WorkerResults",
  // "params":{"mode":…}} was not handled by any navigator`, on modes 'all' and
  // 'skills', with a third expected for the radius chip.
  //
  // WHAT THE REPO ACTUALLY HOLDS: the screen EXISTS (screens/
  // WorkerResultsScreen.tsx) and IS REGISTERED (navigation/WorkerRoot.tsx, one
  // registration, asserted above). Every live dispatch is in WorkerHomeScreen,
  // which is the ROOT of that same stack, so an in-stack navigate resolves. The
  // only other callers go through navigateAcrossTabs(), which asks the mounted
  // navigator first and logs-and-drops rather than throwing. There is no
  // unregistered-route defect at HEAD.
  //
  // The one file that reproduced that error signature exactly — the atlas-48
  // browse screen, four dispatches, the same mode set, registered by NO
  // navigator since 4D-1b — was deleted in Batch F. This test is the general
  // rule that outlives it: a screen may dispatch WorkerResults only if it is
  // unmounted, or if every stack that mounts it also registers WorkerResults.
  const [customerRoot, workerRoot, shared] = await Promise.all([
    read('navigation/CustomerRoot.tsx'),
    read('navigation/WorkerRoot.tsx'),
    read('navigation/sharedStacks.tsx'),
  ]);
  const allNavigators = customerRoot + workerRoot + shared;

  // Which stacks register WorkerResults, by the component they mount.
  const stacksRegisteringIt = new Set(
    [...allNavigators.matchAll(/<(\w+)\.Screen name="WorkerResults"/g)].map((m) => m[1])
  );
  assert.deepEqual(
    [...stacksRegisteringIt],
    ['WorkerHomeStack'],
    'WorkerResults is a worker Home stack route and nothing else may register it'
  );

  for (const file of dir('screens').filter((f) => f.endsWith('.tsx'))) {
    const source = stripComments(await read(`screens/${file}`));
    if (!/navigation\.navigate\(\s*'WorkerResults'/.test(source)) continue;

    const component = file.replace(/\.tsx$/, '');
    const mountedIn = [
      ...allNavigators.matchAll(new RegExp(`<(\\w+)\\.Screen name="[^"]+" component=\\{${component}\\}`, 'g')),
    ].map((m) => m[1]);

    if (mountedIn.length === 0) {
      // Unmounted, so it cannot throw — nothing can render a screen no
      // navigator mounts.
      continue;
    }
    for (const stack of mountedIn) {
      assert.ok(
        stacksRegisteringIt.has(stack),
        `screens/${file} dispatches WorkerResults but is mounted in ${stack}, ` +
          'which does not register it — that is the NAVIGATE-not-handled crash'
      );
    }
  }
});

test('every mode WorkerResults is dispatched with is a mode it handles', async () => {
  // emerald(4)'s "wire all modes". A mode literal the screen does not handle
  // fails silently rather than loudly: MODE_TITLES[mode] is undefined, so the
  // header renders blank and the list falls through whatever branch is last.
  // Three sources have to agree — the callers, the param-list union, and the
  // screen's own title map.
  const [routes, resultsScreen] = await Promise.all([
    read('lib/navigation.ts'),
    read('screens/WorkerResultsScreen.tsx'),
  ]);

  const declared = routes
    .slice(routes.indexOf('  WorkerResults: {'))
    .match(/mode: ((?:'[a-z]+'(?: \| )?)+);/)?.[1]
    .split(' | ')
    .map((m) => m.replace(/'/g, ''));
  assert.ok(declared?.length, 'expected a mode union on the WorkerResults param list');

  const titlesStart = resultsScreen.indexOf('const MODE_TITLES');
  assert.ok(titlesStart >= 0, 'expected a MODE_TITLES map in WorkerResultsScreen');
  const titlesBody = resultsScreen.slice(
    titlesStart,
    resultsScreen.indexOf('};', titlesStart)
  );
  const handled = [...titlesBody.matchAll(/^\s{2}(\w+): /gm)].map((m) => m[1]);
  assert.deepEqual(
    [...handled].sort(),
    [...declared].sort(),
    'MODE_TITLES must handle exactly the modes the param list declares'
  );

  // Every literal any caller actually sends, mounted or not.
  const dispatched = new Set();
  for (const file of dir('screens').filter((f) => f.endsWith('.tsx'))) {
    const source = stripComments(await read(`screens/${file}`));
    // 260-char window: WorkerHomeScreen's 'nearby' dispatch carries
    // lat/lng/label and runs ~190 characters; the old 160 was tuned to the
    // deleted browse screen's compact calls and silently missed it.
    for (const call of source.matchAll(
      /navigate\w*\(\s*(?:'Home',\s*)?'WorkerResults',\s*\{([\s\S]{0,260}?)\}/g
    )) {
      const mode = call[1].match(/mode: '([a-z]+)'/);
      if (mode) dispatched.add(mode[1]);
    }
  }
  assert.ok(dispatched.size >= 4, `expected every mode to have a caller, saw ${[...dispatched]}`);
  for (const mode of dispatched) {
    assert.ok(
      declared.includes(mode),
      `a caller dispatches WorkerResults with mode '${mode}', which the route does not declare`
    );
  }
  // ...and none of the four is orphaned: the two the device pass named ('all',
  // 'skills') and the radius chip's third ('nearby') all have live callers.
  for (const mode of declared) {
    assert.ok(dispatched.has(mode), `no caller ever dispatches WorkerResults mode '${mode}'`);
  }
});

// ---------------------------------------------------------------------------
// Cross-tab jumps go through the one guarded helper
// ---------------------------------------------------------------------------
//
// `Home` is the mode-defining tab: only one of the two trees is mounted, and
// their Home stacks share no route names. A nested navigate into it written
// inside a SHARED screen is therefore correct in one mode and throws "The
// 'state' or 'screen' passed in the params couldn't be applied to the
// navigator with the screens: ..." in the other. tsc cannot see it — the
// tab-level hop is an untyped cast by construction — so the guard is a runtime
// one, and it only works if there is no second, unguarded way to make the hop.

test('no screen dispatches a nested tab target outside navigateAcrossTabs()', async () => {
  const offenders = [];

  for (const file of dir('screens').filter((f) => f.endsWith('.tsx'))) {
    const source = stripComments(await read(`screens/${file}`));
    // `navigate('SomeTab', { screen: 'Something' ... })` — the nested form.
    // navigateAcrossTabs() takes the screen as a positional argument, so it
    // never matches this shape.
    for (const match of source.matchAll(
      /\.navigate\w*\(\s*(?:[^()]*?,\s*)?\{\s*screen:/g
    )) {
      offenders.push(`screens/${file} — ${match[0].replace(/\s+/g, ' ')}`);
    }
    for (const match of source.matchAll(/navigate\w*\(\s*'[^']+'\s*,\s*\{\s*screen:/g)) {
      offenders.push(`screens/${file} — ${match[0].replace(/\s+/g, ' ')}`);
    }
  }

  assert.deepEqual(
    [...new Set(offenders)],
    [],
    'cross-tab jumps must go through navigateAcrossTabs() in lib/navigationRef.ts, ' +
      'which asks the mounted tree before dispatching'
  );
});

// ---------------------------------------------------------------------------
// In-stack targets resolve in every stack the screen is mounted in
// ---------------------------------------------------------------------------
//
// The 2026-08-10 device report was `NAVIGATE {name:'PostJob',params:{}} was not
// handled by any navigator` with NO [nav] line — i.e. a plain in-stack
// navigate, not a cross-tab hop, so none of the guards above could have seen
// it. The generalisation of "every route Worker Home navigates to is registered
// in the worker Home stack" (above, one screen) to every screen in every stack
// it is mounted in: a shared screen is mounted in up to six stacks, and a
// literal that resolves in five of them is still a crash in the sixth.
//
// Scope, stated rather than implied: this reads every in-stack dispatch shape
// that exists in the repo — the plain `navigation.navigate('X')`, the
// object-cast `(navigation as ...).navigate('X')`, and the function-cast
// `(navigation.navigate as ...)('X')`. Tab-level `getParent()` hops are
// deliberately excluded (they target TABS, which are not routes in any stack,
// so they would read as false failures); they are the sibling tests' concern
// and BRAZOS_BUILD_STATE.md's documented latent class. Dispatches that live in
// hooks/ or components/ against a caller-supplied navigation object are
// covered ONLY where INDIRECT_DISPATCHES names the host screen below.
//
// 2026-08-10, later the same day: the user reproduced the crash on device —
// the dispatcher WAS this gap, in the worker tree. PostJob is now registered
// there by explicit user decision (recorded in BRAZOS_BUILD_STATE.md), so the
// rule this test enforces is absolute: no exemptions remain, and a new gap of
// any kind turns it red.

const NAVIGATOR_FILES = [
  'navigation/CustomerRoot.tsx',
  'navigation/WorkerRoot.tsx',
  'navigation/sharedStacks.tsx',
];

// The three dispatch shapes, in match order. A dispatch whose 200-char
// lookback contains `getParent` is a tab hop, not an in-stack navigate.
const DISPATCH_SHAPES = [
  // navigation.navigate('X'  — also matches the object-cast `}).navigate('X'`.
  /\.navigate\(\s*'([^']+)'/g,
  // (navigation.navigate as (...) => void)('X'  — the function-cast form.
  /\.navigate\s+as[\s\S]{0,80}?\)\s*\(\s*'([^']+)'/g,
];

function inStackTargets(source) {
  const targets = new Set();
  for (const shape of DISPATCH_SHAPES) {
    for (const match of source.matchAll(shape)) {
      const lookback = source.slice(Math.max(0, match.index - 200), match.index);
      if (lookback.includes('getParent')) continue;
      targets.add(match[1]);
    }
  }
  return targets;
}

// Dispatches that live OUTSIDE the screen file but run against ITS navigation
// object: useJobOwnerActions (rendered via components/JobOwnerActions) calls
// navigate('PostJob') for own-job Edit, and exactly these two screens render
// it. A dispatch added to a hook or component without a row here is NOT
// covered — that residual is recorded in BRAZOS_BUILD_STATE.md.
const INDIRECT_DISPATCHES = {
  JobDetailScreen: ['PostJob'],
  ClientJobDetailScreen: ['PostJob'],
};

test('every in-stack navigate target is registered in each stack its screen is mounted in', async () => {
  const sources = await Promise.all(NAVIGATOR_FILES.map(read));

  const registered = new Map(); // stack var -> Set(route name)
  const mountedIn = new Map(); // component name -> Set(stack var)

  for (const source of sources) {
    for (const match of stripComments(source).matchAll(
      /<(\w+)\.Screen\s+name="([^"]+)"\s+component=\{(\w+)\}/g
    )) {
      const [, navigator, route, component] = match;
      // `Tab` is the bottom-tab navigator: its children are whole stacks, not
      // routes a screen can navigate to in-stack.
      if (navigator === 'Tab') continue;
      if (!registered.has(navigator)) registered.set(navigator, new Set());
      registered.get(navigator).add(route);
      if (!mountedIn.has(component)) mountedIn.set(component, new Set());
      mountedIn.get(component).add(navigator);
    }
  }

  assert.ok(registered.size >= 6, 'expected all six stacks to be parsed');
  assert.ok(
    mountedIn.get('PostJobScreen')?.size >= 6,
    'expected PostJobScreen to be mounted in all six stacks (2026-08-10 decision)'
  );

  const screenFiles = new Set(dir('screens').filter((f) => f.endsWith('.tsx')));
  const failures = [];
  const targetsByComponent = new Map();

  for (const [component, stacks] of mountedIn) {
    const file = `${component}.tsx`;
    if (!screenFiles.has(file)) continue; // dev-tools catalog etc.

    const source = stripComments(await read(`screens/${file}`));
    const targets = inStackTargets(source);
    for (const extra of INDIRECT_DISPATCHES[component] ?? []) targets.add(extra);
    targetsByComponent.set(component, targets);

    for (const stack of stacks) {
      for (const target of targets) {
        if (!registered.get(stack)?.has(target)) {
          failures.push(
            `${component} is mounted in ${stack} and dispatches '${target}', ` +
              `which ${stack} does not register`
          );
        }
      }
    }
  }

  // Anti-vacuity for the cast shapes: ChatScreen reaches BOTH of its in-stack
  // targets through casts (object-cast to PostJob, function-cast to
  // WorkerProfile), so if the cast matchers rot, this assertion dries up
  // before a silent pass can.
  const chatTargets = targetsByComponent.get('ChatScreen') ?? new Set();
  assert.ok(
    chatTargets.has('PostJob') && chatTargets.has('WorkerProfile'),
    "ChatScreen's cast-form dispatches must be visible to this guard"
  );

  assert.deepEqual(
    failures.sort(),
    [],
    'a screen mounted in several stacks must resolve every in-stack target in ' +
      'ALL of them — resolving in most is still a crash in the rest'
  );
});

// ---------------------------------------------------------------------------
// Tab hops go through the helper too (navigation sweep, 2026-08-10)
// ---------------------------------------------------------------------------
//
// The four hand-cast `getParent()?.navigate(tab)` hops documented in
// BRAZOS_BUILD_STATE.md were all converted to navigateAcrossTabs() this pass —
// except the one in a LOCKED screen, which is allowlisted here by name and
// carries its authorized-ready diff in docs/LOCKED_FILE_PATCHES.md. All four
// targeted SHARED tabs, so none could crash — but they bypassed the single
// guarded dispatch path, and an unguarded pattern is what the next
// mode-fragile hop gets copied from.

const GETPARENT_ALLOWLIST = new Set([
  'screens/HomeScreen.tsx', // LOCKED (screen 07) — patch doc addendum
]);

test('no unguarded getParent() tab hop exists outside the locked allowlist', async () => {
  const offenders = [];
  for (const folder of ['screens', 'hooks', 'components']) {
    for (const file of dir(folder).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const rel = `${folder}/${file}`;
      if (GETPARENT_ALLOWLIST.has(rel)) continue;
      const source = stripComments(await read(rel));
      if (/getParent\(/.test(source)) {
        offenders.push(rel);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'tab hops must go through navigateAcrossTabs() — getParent() bypasses the ' +
      'mounted-tree check and is how the next mode-fragile hop gets written'
  );
});

// ---------------------------------------------------------------------------
// Back goes through the helper too (GO_BACK fix, 2026-08-11)
// ---------------------------------------------------------------------------
//
// navigateAcrossTabs() lands on NESTED screens, and React Navigation mounts an
// unvisited tab's stack with that target as its INITIAL route — nothing
// underneath. A bare goBack() there dispatches an unhandled GO_BACK (the
// device error: cold start via the parked notification replay, and any
// cross-tab jump). goBackOrHome() in lib/navigationRef.ts pops when the
// container can pop and otherwise lands on the mounted tree's Home tab root.

const GOBACK_ALLOWLIST = new Set([
  // LOCKED shared auth flow — each is a pushed-from-Welcome screen, so its
  // stack always has something under it in practice. Authorized-ready diffs:
  // docs/LOCKED_FILE_PATCHES.md §A9.
  'screens/SignInScreen.tsx',
  'screens/EmailSignInScreen.tsx',
  'screens/CreateAccountScreen.tsx',
  'screens/EmailCreateAccountScreen.tsx',
  'screens/VerifyPhoneScreen.tsx',
  // Pre-mode onboarding tree; already carries the guarded form, asserted below.
  'screens/OnboardingFlow.tsx',
]);

test('no bare goBack() dispatch exists outside the helper and the locked allowlist', async () => {
  const offenders = [];
  for (const folder of ['screens', 'hooks', 'components', 'ui']) {
    for (const file of dir(folder).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const rel = `${folder}/${file}`;
      if (GOBACK_ALLOWLIST.has(rel)) continue;
      const source = stripComments(await read(rel));
      if (/\bgoBack\(/.test(source.replace(/goBackOrHome/g, ''))) {
        offenders.push(rel);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'back controls must call goBackOrHome() from lib/navigationRef.ts — a bare ' +
      'goBack() at a stack root dispatches an unhandled GO_BACK'
  );

  // The onboarding exception must stay the GUARDED form, not become bare.
  const onboarding = stripComments(await read('screens/OnboardingFlow.tsx'));
  assert.match(
    onboarding,
    /if \(navigation\.canGoBack\(\)\) navigation\.goBack\(\);/,
    'OnboardingFlow may keep its own guard, but only the canGoBack-checked form'
  );
});

test('back pops when it can, and lands on the mounted mode home when it cannot', async () => {
  const ref = stripComments(await read('lib/navigationRef.ts'));

  // The helper's two branches, in the one module that owns dispatch.
  assert.match(ref, /export function goBackOrHome\(\)/);
  assert.match(ref, /if \(navigationRef\.canGoBack\(\)\) \{\s*navigationRef\.goBack\(\);/);
  assert.match(ref, /navigateAcrossTabs\('Home'\)/);

  // Executed-static composition for BOTH modes: the fallback targets the Home
  // TAB with no screen name, which navigateAcrossTabs dispatches as the tab
  // itself — landing on whatever the mounted tree's Home stack roots at.
  // Exactly one tree is mounted per §F, so proving each tree's Home root IS
  // that mode's home proves the fallback lands correctly in both modes.
  const [customerRoot, workerRoot] = await Promise.all([
    read('navigation/CustomerRoot.tsx'),
    read('navigation/WorkerRoot.tsx'),
  ]);
  const firstScreen = (source, stack) => {
    const match = stripComments(source).match(
      new RegExp(`<${stack}\\.Screen\\s+name="([^"]+)"\\s+component=\\{(\\w+)\\}`)
    );
    return match ? { name: match[1], component: match[2] } : null;
  };
  assert.deepEqual(
    firstScreen(customerRoot, 'CustomerHomeStack'),
    { name: 'HomeMain', component: 'HomeScreen' },
    'customer fallback must land on Customer Home'
  );
  // Stage 4D: the worker stack roots at the WorkerHome dashboard — and since
  // 4D-1b that root is also the stack's explicit initialRouteName.
  assert.deepEqual(
    firstScreen(workerRoot, 'WorkerHomeStack'),
    { name: 'WorkerHome', component: 'WorkerHomeScreen' },
    'worker fallback must land on Worker Home'
  );
});

test('a cross-tab landing never becomes its stack root', async () => {
  const ref = stripComments(await read('lib/navigationRef.ts'));

  // AUD-P1-09: without `initial: false`, React Navigation mounts an unvisited
  // tab's stack with the landing screen as its INITIAL route — the declared
  // root is never underneath it, the tab bar's pop-to-top re-lands on the
  // target, and the tab's root screen (e.g. the Messages inbox after a chat
  // push cold start) is unreachable for the rest of the session.
  const nestedDispatch = ref.match(
    /navigationRef\.navigate\(tab, \{[\s\S]*?\}\);/
  );
  assert.ok(nestedDispatch, 'expected the nested dispatch in navigateAcrossTabs()');
  assert.match(
    nestedDispatch[0],
    /initial: false/,
    'the nested cross-tab payload must carry initial: false so the tab root ' +
      'always sits beneath a cross-tab landing'
  );
});

test('the guarded helper is the only thing that dispatches a nested target', async () => {
  const [ref, routesModule] = await Promise.all([
    read('lib/navigationRef.ts'),
    read('lib/notificationRoutes.ts'),
  ]);

  // The check and the dispatch live together, so no caller can reach one
  // without the other.
  assert.match(ref, /export function navigateAcrossTabs\(/);
  assert.match(stripComments(ref), /if \(canNavigateTo\(tab, screen\)\) \{/);

  // Push routing used to carry its own copy of the rule. Two copies is how one
  // of them ends up unguarded, which is exactly what happened.
  assert.doesNotMatch(stripComments(routesModule), /navigationRef\.navigate\(/);
  assert.match(routesModule, /import \{ navigateAcrossTabs \} from '\.\/navigationRef'/);
});

// ---------------------------------------------------------------------------
// home(27) — EVERY CROSS-TAB TARGET REACHABLE FROM CUSTOMER HOME RESOLVES IN
// THE CUSTOMER TREE, or is gated on the mode that owns it.
//
// The device report was `NAVIGATE {"name":"WorkerResults","params":{"mode":
// "all"}} was not handled by any navigator`, attributed to Customer Home's
// "View all". THE TREE DOES NOT CONTAIN THAT DISPATCH and never has:
// screens/HomeScreen.tsx has never held the string "WorkerResults" in its
// history, its "View all" calls switchMode() — which navigates nothing, it
// swaps which tree is mounted — and the only live dispatcher of that payload
// is Worker Home, inside the stack that registers it. That is asserted above.
//
// WHAT WAS NOT ASSERTED, and is the one way the class could come back: a
// SHARED screen dispatching a mode-specific route across tabs. Map is mounted
// by both trees and offers "See all jobs" and "View list", both aimed at
// WorkerResults, which the customer Home stack does not register. Both are
// gated on worker mode today — one of those gates was already fenced, the
// other was not — and `canNavigateTo()` would only log-and-drop the tap
// anyway, which is a dead control rather than a crash. This closes the gate.
//
// SCOPE, stated rather than implied: screens/ only, literal `tab`/`screen`
// arguments only. lib/notificationRoutes.ts dispatches from a data table and
// is covered by its own tests; a dispatch built from a variable is not visible
// here.
// ---------------------------------------------------------------------------

/** Which stack variable each tab of the CUSTOMER tree mounts. */
const CUSTOMER_TAB_STACKS = {
  Home: 'CustomerHomeStack',
  Discover: 'DiscoverStack',
  Create: null, // the [ + ] slot renders a sheet and never navigates
  Messages: 'MessagesStack',
  Profile: 'ProfileStack',
  Map: 'MapStack',
  MyJobs: 'MyJobsStack',
};

/** A dispatch may name a route the customer tree lacks only behind this. */
const WORKER_GATE = /mode === 'worker'|isWorker/;

test('every cross-tab target reachable from Customer Home resolves in the customer tree', async () => {
  const [customerRoot, shared] = await Promise.all([
    read('navigation/CustomerRoot.tsx'),
    read('navigation/sharedStacks.tsx'),
  ]);

  // The tab list is read, not assumed: a new tab with no entry above turns
  // this red instead of going unchecked.
  const tabs = [...stripComments(customerRoot).matchAll(/<Tab\.Screen\s+name="([^"]+)"/g)].map(
    (m) => m[1]
  );
  assert.deepEqual(
    tabs.sort(),
    Object.keys(CUSTOMER_TAB_STACKS).sort(),
    'the customer tree mounts a tab this test has no stack for'
  );

  const registered = new Map(); // stack var -> Set(route)
  const mountedIn = new Map(); // component -> Set(stack var)
  for (const source of [customerRoot, shared]) {
    for (const m of stripComments(source).matchAll(
      /<(\w+)\.Screen\s+name="([^"]+)"\s+component=\{(\w+)\}/g
    )) {
      const [, navigator, route, component] = m;
      if (navigator === 'Tab') continue;
      if (!registered.has(navigator)) registered.set(navigator, new Set());
      registered.get(navigator).add(route);
      if (!mountedIn.has(component)) mountedIn.set(component, new Set());
      mountedIn.get(component).add(navigator);
    }
  }
  for (const stack of Object.values(CUSTOMER_TAB_STACKS)) {
    if (stack) assert.ok(registered.has(stack), `${stack} must be parsed from the customer tree`);
  }

  const screenFiles = new Set(dir('screens').filter((f) => f.endsWith('.tsx')));
  const failures = [];
  let checked = 0;

  for (const [component] of mountedIn) {
    const file = `${component}.tsx`;
    if (!screenFiles.has(file)) continue;
    const source = stripComments(await read(`screens/${file}`));
    for (const m of source.matchAll(
      /navigateAcrossTabs\(\s*'([^']+)'\s*,\s*'([^']+)'/g
    )) {
      const [, tab, screen] = m;
      checked += 1;
      const stack = CUSTOMER_TAB_STACKS[tab];
      if (stack && registered.get(stack)?.has(screen)) continue;
      const lookback = source.slice(Math.max(0, m.index - 500), m.index);
      if (WORKER_GATE.test(lookback)) continue;
      failures.push(
        `screens/${file} dispatches ${tab}/${screen}, which the customer tree's ` +
          `${stack ?? '(no stack)'} does not register and no worker-mode gate covers`
      );
    }
  }

  // Anti-vacuity: MapScreen's worker-only dispatch MUST be among the calls
  // this walked, or the matcher has rotted and the sweep proves nothing.
  // 2026-08-22: the header's "See all jobs" duplicate became the distance
  // filter (which navigates nothing), so the bottom row's "View list" is the
  // ONE list dispatch left on the map.
  assert.ok(checked >= 7, `expected the sweep to reach every cross-tab call; saw ${checked}`);
  const map = stripComments(await read('screens/MapScreen.tsx'));
  const mapCalls = [...map.matchAll(/navigateAcrossTabs\(\s*'Home'\s*,\s*'WorkerResults'/g)];
  // 2026-08-24: TWO, and both are the same intent reaching the same surface —
  // the bottom row's "View list" (mode: 'all') and the header search pill's
  // submit (mode: 'search'). The map draws hotspot cells, which carry counts
  // and categories and no text, so a query has to resolve where the jobs are;
  // building a second results view inside the map is what this count exists to
  // notice. Each is checked for its worker gate below.
  assert.equal(
    mapCalls.length,
    2,
    "Map reaches the worker list twice — the bottom row's View list and the search pill"
  );
  for (const call of mapCalls) {
    assert.match(
      map.slice(Math.max(0, call.index - 500), call.index),
      WORKER_GATE,
      'both of Map’s worker-list controls must stay behind a worker-mode gate — ' +
        'the customer Home stack does not register WorkerResults'
    );
  }

  assert.deepEqual(failures.sort(), [], 'a customer-mounted screen may not aim at a route the customer tree lacks');
});
