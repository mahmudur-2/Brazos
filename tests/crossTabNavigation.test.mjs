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

test('every route Worker Home navigates to is registered in the worker Home stack', async () => {
  const [workerHome, workerRoot] = await Promise.all([
    read('screens/BrowseJobsScreen.tsx'),
    read('navigation/WorkerRoot.tsx'),
  ]);

  const registered = new Set(
    [...workerRoot.matchAll(/<WorkerHomeStack\.Screen name="([^"]+)"/g)].map((m) => m[1])
  );
  const targets = [
    ...stripComments(workerHome).matchAll(/navigation\.navigate\(\s*'([^']+)'/g),
  ].map((m) => m[1]);

  assert.ok(targets.length > 0, 'expected Worker Home to navigate somewhere');
  for (const target of targets) {
    assert.ok(
      registered.has(target),
      `Worker Home dispatches '${target}', which the worker Home stack does not register`
    );
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
  assert.deepEqual(
    firstScreen(workerRoot, 'WorkerHomeStack'),
    { name: 'BrowseJobs', component: 'BrowseJobsScreen' },
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
