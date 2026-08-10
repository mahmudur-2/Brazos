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
// Scope, stated rather than implied: this reads `navigation.navigate('X')` —
// the in-stack form. Tab-level `getParent()` hops are deliberately excluded
// (they target TABS, which are not routes in any stack, so they would read as
// false failures); they are the sibling tests' concern. Dispatches made from
// hooks/ and components/ against a caller-supplied navigation object are NOT
// covered by this test and are recorded as an open gap in BRAZOS_BUILD_STATE.md
// rather than silently counted as verified.

const NAVIGATOR_FILES = [
  'navigation/CustomerRoot.tsx',
  'navigation/WorkerRoot.tsx',
  'navigation/sharedStacks.tsx',
];

// The one deliberate, documented gap (Known issues, BRAZOS_BUILD_STATE.md):
// PostJob is intentionally NOT in WorkerHomeStack, because posting a job is a
// customer action that §F routes through an explicit confirm + switchMode().
// Registering it would let a worker-mode session post without switching mode.
// Exempted by name so the deliberate gap cannot masquerade as an accident, and
// so an ACCIDENTAL new gap still turns this test red.
const DOCUMENTED_GAPS = new Set(['WorkerHomeStack::PostJob']);

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
    mountedIn.get('PostJobScreen')?.size >= 5,
    'expected PostJobScreen to be mounted in at least five stacks'
  );

  const screenFiles = new Set(dir('screens').filter((f) => f.endsWith('.tsx')));
  const failures = [];

  for (const [component, stacks] of mountedIn) {
    const file = `${component}.tsx`;
    if (!screenFiles.has(file)) continue; // dev-tools catalog etc.

    const source = stripComments(await read(`screens/${file}`));
    const targets = new Set(
      [...source.matchAll(/navigation\.navigate\(\s*'([^']+)'/g)].map((m) => m[1])
    );

    for (const stack of stacks) {
      for (const target of targets) {
        if (DOCUMENTED_GAPS.has(`${stack}::${target}`)) continue;
        if (!registered.get(stack)?.has(target)) {
          failures.push(
            `${component} is mounted in ${stack} and dispatches '${target}', ` +
              `which ${stack} does not register`
          );
        }
      }
    }
  }

  assert.deepEqual(
    failures.sort(),
    [],
    'a screen mounted in several stacks must resolve every in-stack target in ' +
      'ALL of them — resolving in most is still a crash in the rest'
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
