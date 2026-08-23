import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const pure = await import('../lib/motion120/types.ts');

// ===========================================================================
// THE MOTION BOUNDARY — 2026-08-23.
//
// react-native-reanimated and react-native-gesture-handler are not in the
// operator's dev build. Neither package is import-safe without its native
// module: a static import of either, anywhere on the startup path, takes the
// whole app down before the first frame. So the boundary is the same shape
// lib/voiceSearch uses for expo-speech-recognition — one impure module doing
// a lazy, caught require; pure siblings the tests execute directly; and a
// static scan asserting the exclusivity.
//
// WHAT THIS FILE HAS TO PROVE, and each half is a different question:
//
//   1. EXCLUSIVITY, DERIVED. No file in the app tree names either package in
//      an import or require position except lib/motion120/vendor.ts and the
//      `*.motion120.tsx` fast-path siblings. Found by scanning, not by an
//      enumerated list, so a new offender fails the day it lands.
//   2. THE GUARD IS REAL. vendor.ts's loads are lazy AND caught AND return
//      null — all three, because any one of them missing is a crash on a
//      binary without the native module.
//   3. APP-BOOTS-WITHOUT-NATIVES, EXECUTED. The pure resolver is run with
//      both loads failing and both succeeding, and the fast-path chooser is
//      run with the capability absent, with it present, and with a loader
//      that throws. This is the guarantee the whole arrangement exists for
//      and it is not left to a static read of the source.
//   4. THE ROOT IS CONDITIONAL. App.tsx wraps its tree in MotionRoot, and
//      MotionRoot renders a Fragment — not a host view — when there is no
//      gesture handler, so the two binaries lay out identically.
// ===========================================================================

const VENDOR_PACKAGES = ['react-native-reanimated', 'react-native-gesture-handler'];
/** The one impure module. */
const BOUNDARY = 'lib/motion120/vendor.ts';
/** Fast-path siblings, which use worklets/recognisers directly BY DESIGN and
 *  are only ever reached through the boundary's guarded chooser. */
const FAST_PATH = /\.motion120\.tsx?$/;

function appSources() {
  const dirs = ['lib', 'screens', 'components', 'hooks', 'ui', 'navigation', 'modes', 'dev-tools'];
  const files = ['App.tsx', 'index.ts'];
  for (const dir of dirs) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
    }
  }
  return files;
}

test('[static] nothing outside the boundary and its fast paths loads either vendor package', () => {
  const files = appSources();
  assert.ok(files.length > 100, `the sweep must enumerate the app source (saw ${files.length})`);

  // Import/require FORMS only: prose may name the packages (the boundary's own
  // docblocks do, at length), but only these files may LOAD them.
  const offenders = [];
  for (const path of files) {
    if (path === BOUNDARY || FAST_PATH.test(path)) continue;
    const source = read(path);
    for (const pkg of VENDOR_PACKAGES) {
      const loads = new RegExp(`(?:from\\s+['"]|require\\(['"])${pkg}`);
      if (loads.test(source)) offenders.push(`${path}: loads ${pkg}`);
    }
  }
  assert.deepEqual(offenders, [], 'only lib/motion120/vendor.ts and *.motion120 files may load the vendors');

  // ANTI-VACUITY: the scan must be finding the boundary itself, or it is
  // matching nothing anywhere and would pass with the packages loaded freely.
  const boundary = read(BOUNDARY);
  for (const pkg of VENDOR_PACKAGES) {
    assert.match(boundary, new RegExp(`require\\('${pkg}'\\)`), `${BOUNDARY} must be the loader for ${pkg}`);
  }
});

test('[static] the vendor loads are lazy, caught, and resolve to null', () => {
  const source = read(BOUNDARY);
  for (const pkg of VENDOR_PACKAGES) {
    assert.doesNotMatch(
      source,
      new RegExp(`import[^\\n]*from\\s+['"]${pkg}['"]`),
      `a static import of ${pkg} runs its native initialisation at startup and crashes a binary without it`
    );
    assert.match(
      source,
      new RegExp(`try\\s*\\{[\\s\\S]{0,120}?require\\('${pkg}'\\)[\\s\\S]{0,120}?\\}\\s*catch[\\s\\S]{0,80}?return null;`),
      `${pkg}'s require must sit inside try/catch and resolve to null`
    );
  }
  // The capability is resolved ONCE, not per render: a native module cannot
  // appear mid-session, and a per-frame try/catch during a gesture is a cost
  // for an answer that cannot change.
  assert.match(source, /export const motionCapability: MotionCapability = resolveCapability\(/);
});

test('[executed] a binary with neither native module resolves to no capability at all', () => {
  const capability = pure.resolveCapability({
    loadReanimated: () => null,
    loadGestureHandler: () => null,
  });
  assert.deepEqual(capability, { reanimated: false, gestures: false });
});

test('[executed] a thrown load is absent, not unknown — and never counted as present', () => {
  // The loaders in vendor.ts catch and return null, but the resolver must not
  // depend on that politeness: anything that is not a usable module object is
  // absent. A string, a number and undefined are all "the require resolved to
  // something that is not a module", which is not a capability.
  for (const bogus of [null, undefined, '', 0, false, 'react-native-reanimated']) {
    const capability = pure.resolveCapability({
      loadReanimated: () => bogus,
      loadGestureHandler: () => bogus,
    });
    assert.deepEqual(
      capability,
      { reanimated: false, gestures: false },
      `a load returning ${JSON.stringify(bogus)} must not read as a capability`
    );
  }
});

test('[executed] both natives present turns both capabilities on, independently', () => {
  assert.deepEqual(
    pure.resolveCapability({ loadReanimated: () => ({}), loadGestureHandler: () => ({}) }),
    { reanimated: true, gestures: true }
  );
  // Independently: one package can ship without the other, and a surface that
  // needs worklets must not be enabled by a gesture recogniser being present.
  assert.deepEqual(
    pure.resolveCapability({ loadReanimated: () => ({}), loadGestureHandler: () => null }),
    { reanimated: true, gestures: false }
  );
  assert.deepEqual(
    pure.resolveCapability({ loadReanimated: () => null, loadGestureHandler: () => ({}) }),
    { reanimated: false, gestures: true }
  );
  // A module can legitimately be a function (a callable default export).
  assert.equal(
    pure.resolveCapability({ loadReanimated: () => () => {}, loadGestureHandler: () => null }).reanimated,
    true
  );
});

test('[executed] the fast-path chooser returns the fallback whenever the fast path cannot run', () => {
  const FALLBACK = { name: 'fallback' };
  const FAST = { name: 'fast' };
  const absent = { reanimated: false, gestures: false };
  const present = { reanimated: true, gestures: true };

  // Capability absent: the loader must not even be CALLED — requiring a
  // reanimated sibling on a binary without reanimated is the crash this
  // whole boundary exists to prevent.
  let called = 0;
  assert.equal(
    pure.resolveMotion120(absent, 'reanimated', () => { called += 1; return FAST; }, FALLBACK),
    FALLBACK
  );
  assert.equal(called, 0, 'the fast path must not be loaded when the capability is absent');

  // Capability present: the fast path is taken.
  assert.equal(pure.resolveMotion120(present, 'reanimated', () => FAST, FALLBACK), FAST);

  // Capability present but the load THROWS (a sibling that imports something
  // this binary lacks): the fallback, never a propagated crash.
  assert.equal(
    pure.resolveMotion120(present, 'reanimated', () => { throw new Error('no native module'); }, FALLBACK),
    FALLBACK
  );

  // Capability present and the load returns nothing (a mis-named export):
  // still the fallback, so a typo degrades rather than renders undefined.
  assert.equal(pure.resolveMotion120(present, 'reanimated', () => null, FALLBACK), FALLBACK);

  // The two capabilities are asked for separately.
  assert.equal(
    pure.resolveMotion120({ reanimated: true, gestures: false }, 'gestures', () => FAST, FALLBACK),
    FALLBACK
  );
});

test('[static] MotionRoot is a Fragment without gesture-handler, and App wraps its tree in it', () => {
  const boundaryIndex = stripComments(read('lib/motion120/index.tsx'));
  // A Fragment, NOT a host view: an extra view on one binary and not the
  // other is a layout difference between two builds of the same screen.
  assert.match(
    boundaryIndex,
    /if \(!GestureHandlerRootView\) return createElement\(Fragment, null, children\);/,
    'the no-gesture-handler branch must add no host view to the tree'
  );
  assert.match(boundaryIndex, /return createElement\(GestureHandlerRootView, \{ style: styles\.root \}, children\)/);

  const app = stripComments(read('App.tsx'));
  assert.match(app, /import \{ MotionRoot \} from '\.\/lib\/motion120';/);
  // Above EVERYTHING: gesture-handler requires its root view over the whole
  // tree, so SafeAreaProvider (and therefore all of it) sits inside.
  assert.match(app, /<MotionRoot>\s*<SafeAreaProvider>/);
  assert.match(app, /<\/SafeAreaProvider>\s*<\/MotionRoot>/);
});

test('[static] every feature flag is false and carries the dependency it waits on', () => {
  // M2's contract: the UI behind a flag is BUILT, and the flag is what keeps
  // it from being offered. A flag with no recorded dependency is a flag
  // nobody can ever safely flip, so the WAITS ON line is part of the flag.
  const source = read('lib/featureFlags.ts');
  const flags = [...source.matchAll(/export const (\w+) = (false|true) as boolean;/g)];
  assert.equal(flags.length, 11, `the roster is eleven flags (saw ${flags.length})`);
  assert.deepEqual(
    flags.map((f) => f[1]).sort(),
    [
      'ARCHIVE', 'CLEAR_CHAT', 'DELETE_CHAT', 'DELIVERED_TICKS', 'DOCUMENTS',
      'HIDDEN_CHATS', 'LIVE_LOCATION', 'MARK_UNREAD', 'MUTE', 'TIMED_BLOCK',
      'TRANSLATION',
    ],
    'the flag roster changed — say so in HANDOFF.md as well as here'
  );
  for (const [, name, value] of flags) {
    assert.equal(value, 'false', `${name} is live — flip it here only once its dependency has landed`);
    const doc = source.slice(0, source.indexOf(`export const ${name}`));
    const block = doc.slice(doc.lastIndexOf('/**'));
    assert.match(block, /WAITS ON:/, `${name} must record the table, column, policy, deploy or key it waits on`);
  }
});
