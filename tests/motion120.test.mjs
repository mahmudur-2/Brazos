import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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

const VENDOR_PACKAGES = [
  'react-native-reanimated',
  'react-native-gesture-handler',
  'react-native-keyboard-controller',
];
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

/**
 * The exclusivity scan itself, over an INJECTED file list and reader.
 *
 * Extracted from the test below so the same code that guards the real tree can
 * be run against a planted fixture — a fence nobody has ever seen bite is a
 * claim, not a check. `readSource` supplies each file's text, so the fixture
 * plants its violation in memory: nothing is written into the tree, and there
 * is therefore no window in which a crashed run leaves a live vendor import
 * behind for the next one to boot on.
 */
function vendorLoadOffenders(files, readSource) {
  const offenders = [];
  for (const path of files) {
    if (path === BOUNDARY || FAST_PATH.test(path)) continue;
    const source = readSource(path);
    for (const pkg of VENDOR_PACKAGES) {
      // Import/require FORMS only: prose may name the packages (the boundary's
      // own docblocks do, at length), but only these files may LOAD them.
      const loads = new RegExp(`(?:from\\s+['"]|require\\(['"])${pkg}`);
      if (loads.test(source)) offenders.push(`${path}: loads ${pkg}`);
    }
  }
  return offenders;
}

test('[static] nothing outside the boundary and its fast paths loads any vendor package', () => {
  const files = appSources();
  assert.ok(files.length > 100, `the sweep must enumerate the app source (saw ${files.length})`);

  assert.deepEqual(
    vendorLoadOffenders(files, read),
    [],
    'only lib/motion120/vendor.ts and *.motion120 files may load the vendors'
  );

  // ANTI-VACUITY: the scan must be finding the boundary itself, or it is
  // matching nothing anywhere and would pass with the packages loaded freely.
  const boundary = read(BOUNDARY);
  for (const pkg of VENDOR_PACKAGES) {
    assert.match(boundary, new RegExp(`require\\('${pkg}'\\)`), `${BOUNDARY} must be the loader for ${pkg}`);
  }

  // And the roster is pinned, so a fourth vendor cannot slip past the fence by
  // simply never being added to it.
  assert.deepEqual(
    [...VENDOR_PACKAGES].sort(),
    ['react-native-gesture-handler', 'react-native-keyboard-controller', 'react-native-reanimated'],
    'a vendor package joined or left the boundary — bring it into this fence deliberately'
  );
});

test('[static] the exclusivity scan catches a planted vendor import — and does not invent one', () => {
  // THE FENCE, PROVEN TO BITE, and proven for the package that was added
  // today: a static import of react-native-keyboard-controller anywhere on the
  // startup path is precisely the crash RUN W1 root-caused, so a scan that
  // silently stopped matching it would hand back the SIGABRT with a green
  // suite. The plant is injected rather than written to disk — see
  // vendorLoadOffenders — so there is nothing to restore afterwards.
  const planted = new Map([
    // A screen doing the forbidden thing, in the form a person would write it.
    ['screens/ChatScreen.tsx', "import { KeyboardProvider } from 'react-native-keyboard-controller';\n"],
    // The same package, in require form, in a hook.
    ['hooks/useKeyboardOffset.ts', "const kc = require('react-native-keyboard-controller');\n"],
    // ...and the two files that ARE allowed to, which must NOT be flagged: a
    // fence that cries wolf is a fence someone deletes.
    [BOUNDARY, "require('react-native-keyboard-controller');\n"],
    [
      'components/KeyboardRisingColumn.motion120.tsx',
      "import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';\n",
    ],
    // Prose naming the package is not a load and must stay clean.
    ['lib/motion120/types.ts', ' * react-native-keyboard-controller resolved AND registered.\n'],
  ]);

  const offenders = vendorLoadOffenders([...planted.keys()], (path) => planted.get(path));
  assert.deepEqual(
    offenders.sort(),
    [
      'hooks/useKeyboardOffset.ts: loads react-native-keyboard-controller',
      'screens/ChatScreen.tsx: loads react-native-keyboard-controller',
    ],
    'exactly the two planted violations must be caught, and neither exempt file nor the prose flagged'
  );

  // The other two vendors are held to the same fence by the same code — plant
  // one of each so a regex that only ever learned the new package fails here.
  assert.deepEqual(
    vendorLoadOffenders(['modes/ModeProvider.tsx', 'ui/tokens.ts'], (path) =>
      path === 'ui/tokens.ts'
        ? "import Animated from 'react-native-reanimated';\n"
        : "import { Gesture } from 'react-native-gesture-handler';\n"
    ).sort(),
    [
      'modes/ModeProvider.tsx: loads react-native-gesture-handler',
      'ui/tokens.ts: loads react-native-reanimated',
    ]
  );

  // And a clean file set produces nothing, so the scan is not simply
  // returning every path it is handed.
  assert.deepEqual(
    vendorLoadOffenders(['App.tsx'], () => "import { MotionRoot } from './lib/motion120';\n"),
    []
  );
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
  // All three loaders reach the resolver. A loader written and then not wired
  // in leaves its flag permanently false, which looks exactly like a binary
  // without the native module and would never be noticed.
  assert.match(
    source,
    /resolveCapability\(\{\s*loadReanimated,\s*loadGestureHandler,\s*loadKeyboardController,\s*\}\)/,
    'every loader must be handed to the resolver'
  );
});

test('[static] the keyboard probe asks the native registry, not merely the bundler', () => {
  // THE HOLE THIS CLOSES, and it is specific to react-native-keyboard-
  // controller. The boundary's premise for the other two vendors is that a
  // require throws without the native module, so catching it is an honest
  // answer. This package is import-SAFE: its spec ends in
  // `TurboModuleRegistry.get(...)` — the NULLABLE getter — and when the module
  // is missing the binding substitutes a Proxy that throws on first property
  // access. So the require SUCCEEDS on a binary that cannot run it, the
  // capability would read true, KeyboardProvider would mount, and the app
  // would die at render instead of at import: the same SIGABRT, one layer
  // deeper than the boundary was built to catch it.
  const source = stripComments(read(BOUNDARY));
  assert.match(
    source,
    /if \(!TurboModuleRegistry\.get\(KEYBOARD_CONTROLLER_NATIVE_MODULE\)\) return null;/,
    'the keyboard loader must confirm the native module is registered before requiring the package'
  );
  assert.match(
    source,
    /const KEYBOARD_CONTROLLER_NATIVE_MODULE = 'KeyboardController';/,
    'the probed module name must be the one the package registers'
  );
  // The gate must come BEFORE the require, or it gates nothing: the module
  // body that builds the throwing Proxy has already run by then.
  const loader = source.match(/function loadKeyboardController\(\): unknown \{[\s\S]*?\n\}/);
  assert.ok(loader, 'loadKeyboardController must exist as a named function');
  assert.ok(
    loader[0].indexOf('TurboModuleRegistry.get') < loader[0].indexOf("require('react-native-keyboard-controller')"),
    'the registry check must run before the require, not after it'
  );

  // ANTI-VACUITY, read from the VENDOR rather than asserted about our own
  // code: the extra probe is only necessary while the package uses the
  // nullable getter. If a future version switches to getEnforcing the require
  // starts throwing on its own and this fence should be simplified — so it
  // fails here and a human decides, rather than rotting quietly.
  const spec = readFileSync(
    join(root, 'node_modules/react-native-keyboard-controller/src/specs/NativeKeyboardController.ts'),
    'utf8'
  );
  assert.match(
    spec,
    /TurboModuleRegistry\.get</,
    'react-native-keyboard-controller no longer uses the nullable TurboModule getter — re-derive whether ' +
      'the registry probe in lib/motion120/vendor.ts is still the right shape before changing it'
  );
  assert.doesNotMatch(
    spec,
    /getEnforcing/,
    'the package now throws on import without its native module; the registry probe may be redundant'
  );
  assert.match(
    read('node_modules/react-native-keyboard-controller/src/bindings.native.ts'),
    /new Proxy\(/,
    'the throwing-Proxy fallback is the reason a successful require proves nothing here'
  );
});

test('[executed] a binary with no native module resolves to no capability at all', () => {
  const capability = pure.resolveCapability({
    loadReanimated: () => null,
    loadGestureHandler: () => null,
    loadKeyboardController: () => null,
  });
  assert.deepEqual(capability, { reanimated: false, gestures: false, keyboard: false });
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
      loadKeyboardController: () => bogus,
    });
    assert.deepEqual(
      capability,
      { reanimated: false, gestures: false, keyboard: false },
      `a load returning ${JSON.stringify(bogus)} must not read as a capability`
    );
  }
});

test('[executed] a present native turns its capability on, and only its own', () => {
  const probe = (reanimated, gestures, keyboard) => ({
    loadReanimated: () => (reanimated ? {} : null),
    loadGestureHandler: () => (gestures ? {} : null),
    loadKeyboardController: () => (keyboard ? {} : null),
  });

  assert.deepEqual(pure.resolveCapability(probe(true, true, true)), {
    reanimated: true,
    gestures: true,
    keyboard: true,
  });

  // INDEPENDENTLY, and each of the three checked on its own: any package can
  // ship without the others, and a surface that needs worklets must not be
  // enabled by a gesture recogniser — or by a keyboard listener — being
  // present. Every flag is exercised as the ONLY true one, which is what
  // catches a resolver that wired two keys to the same loader.
  const only = { reanimated: false, gestures: false, keyboard: false };
  assert.deepEqual(pure.resolveCapability(probe(true, false, false)), { ...only, reanimated: true });
  assert.deepEqual(pure.resolveCapability(probe(false, true, false)), { ...only, gestures: true });
  assert.deepEqual(pure.resolveCapability(probe(false, false, true)), { ...only, keyboard: true });

  // A module can legitimately be a function (a callable default export).
  assert.equal(
    pure.resolveCapability({
      loadReanimated: () => () => {},
      loadGestureHandler: () => null,
      loadKeyboardController: () => null,
    }).reanimated,
    true
  );
});

test('[executed] the fast-path chooser returns the fallback whenever the fast path cannot run', () => {
  const FALLBACK = { name: 'fallback' };
  const FAST = { name: 'fast' };
  const absent = { reanimated: false, gestures: false, keyboard: false };
  const present = { reanimated: true, gestures: true, keyboard: true };

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

  // The three capabilities are asked for separately: each is checked while the
  // OTHER TWO are true, so a chooser reading the wrong key cannot pass.
  assert.equal(
    pure.resolveMotion120({ ...present, gestures: false }, 'gestures', () => FAST, FALLBACK),
    FALLBACK
  );
  assert.equal(
    pure.resolveMotion120({ ...present, reanimated: false }, 'reanimated', () => FAST, FALLBACK),
    FALLBACK
  );
  assert.equal(
    pure.resolveMotion120({ ...present, keyboard: false }, 'keyboard', () => FAST, FALLBACK),
    FALLBACK
  );
  assert.equal(pure.resolveMotion120(present, 'keyboard', () => FAST, FALLBACK), FAST);
});

test('[static] MotionRoot is a Fragment without its vendors, and App wraps its tree in it', () => {
  const boundaryIndex = stripComments(read('lib/motion120/index.tsx'));
  // A Fragment, NOT a host view: an extra view on one binary and not the
  // other is a layout difference between two builds of the same screen. Both
  // roots take that branch, and each is asserted, because either one quietly
  // rendering a <View> would reintroduce the difference on its own.
  assert.match(
    boundaryIndex,
    /if \(!GestureHandlerRootView\) return createElement\(Fragment, null, tracked\);/,
    'the no-gesture-handler branch must add no host view to the tree'
  );
  assert.match(boundaryIndex, /return createElement\(GestureHandlerRootView, \{ style: styles\.root \}, tracked\)/);
  assert.match(
    boundaryIndex,
    /if \(!KeyboardProvider\) return createElement\(Fragment, null, children\);/,
    'the no-keyboard-controller branch must add no host view to the tree'
  );
  assert.match(boundaryIndex, /return createElement\(KeyboardProvider, null, children\);/);

  // THE PROVIDER IS NATIVE-BACKED, so it may only ever be reached through the
  // boundary's null-able reference — never named as a component in a file that
  // imports it statically. `tracked` is what carries it into MotionRoot, and
  // MotionRoot is what App mounts, so one wrapper in App.tsx decides both.
  assert.match(
    boundaryIndex,
    /const tracked = createElement\(KeyboardTrackingRoot, null, children\);/,
    'keyboard tracking must ride inside MotionRoot, not be a second root App has to remember'
  );
  assert.match(
    boundaryIndex,
    /import \{ GestureHandlerRootView, KeyboardProvider, motionCapability \} from '\.\/vendor';/,
    'both vendor components must come from the seam, which is the only module allowed to load them'
  );

  const app = stripComments(read('App.tsx'));
  assert.match(app, /import \{ MotionRoot \} from '\.\/lib\/motion120';/);
  // Above EVERYTHING: gesture-handler requires its root view over the whole
  // tree, and keyboard-controller's provider has to be over every screen that
  // can hold a text input, so SafeAreaProvider (and therefore all of it) sits
  // inside.
  assert.match(app, /<MotionRoot>\s*<SafeAreaProvider>/);
  assert.match(app, /<\/SafeAreaProvider>\s*<\/MotionRoot>/);
  // App must not have grown a vendor root of its own beside MotionRoot.
  assert.doesNotMatch(app, /KeyboardProvider/, 'App.tsx must reach the provider only through MotionRoot');
});

// ---------------------------------------------------------------------------
// THE JANK SWEEP — 2026-08-23, and the property it locks is a NEGATIVE one.
//
// tests/motionDriver.test.mjs already pins that every driver value in the tree
// is one of lib/motion.ts's two constants and that no call site spells a
// literal. What it does NOT ask is how many animations are on the JS driver
// and WHY, or whether a layout-property animation has crept in by another
// route. Those are the two ways this app can get slow again, so they are the
// two things asserted here — a green re-statement of the driver fence would
// add nothing.
// ---------------------------------------------------------------------------

/**
 * The ONLY animations in the tree permitted off the native driver, and the
 * reason each is there. Both interpolate a COLOUR, which the native animated
 * module cannot drive on ANY platform — that is what `JS_DRIVER` names at the
 * call site (lib/motion.ts's docblock states the rule).
 *
 * A new entry here is a claim that something else cannot be driven natively.
 * Transform and opacity always can, so that claim is almost always wrong.
 */
const JS_DRIVER_SITES = new Map([
  ['components/AuthField.tsx', 'the field hairline interpolating between palette colours on focus'],
  ['components/PhoneNumberInput.tsx', 'the same hairline on the phone field'],
]);

test('[static] JS-driven motion is colour-only, and no layout animation exists at all', () => {
  const files = appSources();
  const jsDriven = [];
  const layoutAnimations = [];
  for (const path of files) {
    const source = stripComments(read(path));
    if (/useNativeDriver:\s*JS_DRIVER/.test(source)) jsDriven.push(path);
    // LayoutAnimation is the other way to animate layout: it is global, it is
    // uninterruptible, and on iOS it takes the whole screen's next relayout
    // with it. There is none in this tree and there must not be one.
    if (/\bLayoutAnimation\b/.test(source)) layoutAnimations.push(path);
  }
  assert.deepEqual(layoutAnimations, [], 'animate a transform, not the layout');
  assert.deepEqual(
    jsDriven.sort(),
    [...JS_DRIVER_SITES.keys()].sort(),
    'a JS-driven animation appeared or moved — record it above with the property that forces it, or drive it natively'
  );
  // Each recorded site must still be interpolating a COLOUR. A JS-driven
  // animation that has stopped being a colour has stopped having its excuse.
  for (const [path] of JS_DRIVER_SITES) {
    const source = stripComments(read(path));
    assert.match(
      source,
      /[Cc]olor\s*=[\s\S]{0,240}?\.interpolate\(/,
      `${path} is on the JS driver but is not interpolating a colour any more`
    );
  }
});

test('[static] the chat composer rises on a native-driven transform, not on padding', () => {
  const chat = stripComments(read('screens/ChatScreen.tsx'));
  const hook = stripComments(read('hooks/useKeyboardOffset.ts'));

  // THE ROOT CAUSE, closed. `behavior="padding"` animates a LAYOUT property:
  // every frame re-runs Yoga over the message list, its cells, the reply chip
  // and the composer, on the JS thread, and none of it can reach the native
  // animated module. It cannot be tuned smooth, so it is gone from this
  // screen — replaced, not merely removed.
  assert.doesNotMatch(chat, /KeyboardAvoidingView/, 'the padding path must not come back to chat');

  // 2026-08-23 — THE RISE MOVED INTO A COMPONENT, because the seam had to. A
  // `.motion120` sibling for the HOOK is impossible: the fallback yields a
  // core `Animated.Value` and the fast path a reanimated shared value, and
  // neither animated view can consume the other's, so a hook seam would hand
  // the caller a value whose type depended on the binary. The swappable unit
  // is therefore the animated view itself. The screen names the clearance and
  // nothing else; the assertions below moved to the component that now owns
  // the transform, and none was dropped.
  assert.match(chat, /<KeyboardRisingColumn/);
  assert.match(chat, /insetBelow=\{navClearance\}/);
  assert.doesNotMatch(
    chat,
    /useKeyboardOffset/,
    'the screen must go through the component seam, not reach past it',
  );

  const column = stripComments(read('components/KeyboardRisingColumn.tsx'));
  assert.match(column, /const keyboardRise = useKeyboardOffset\(insetBelow\);/);
  assert.match(
    column,
    /transform: \[\{ translateY: Animated\.multiply\(keyboardRise, -1\) \}\]/,
    'the column must rise on a transform — the one thing the native driver can carry'
  );
  // ONE padding, on the SAME view that rises, in both paths, or the two
  // binaries lay out differently.
  //
  // It is COLUMN_BOTTOM_PADDING and NOT `insetBelow` — corrected 2026-08-23.
  // Re-applying the clearance the caller handed over counted the floating
  // pill twice: the bar sits in normal flow, so the scene already ends at the
  // pill's top edge, and `riseFor` has already spent the clearance on the
  // rise. That padding held the composer a pill's height above the pill at
  // rest and the same distance above the keyboard risen — one cause, both
  // dead bands.
  const fast = stripComments(read('components/KeyboardRisingColumn.motion120.tsx'));
  for (const [path, source] of [['fallback', column], ['motion120', fast]]) {
    assert.match(
      source,
      /\{ paddingBottom: COLUMN_BOTTOM_PADDING \}/,
      `the ${path} path must carry the shared pinned-column padding on the rising view`,
    );
    assert.doesNotMatch(
      source,
      /paddingBottom: insetBelow/,
      `the ${path} path re-reserves the pill's footprint — the chat clearance double count`,
    );
  }
  // ONE rise arithmetic, shared. A column that stopped at a different height
  // on one binary than the other is the drift the boundary exists to prevent.
  assert.match(
    stripComments(read('components/KeyboardRisingColumn.shared.tsx')),
    /return Math\.max\(0, keyboardHeight - insetBelow\);/,
  );
  // THE DRIVER, and which package supplies it — changed 2026-08-24 and pinned
  // here so it cannot drift back. reanimated's own `useAnimatedKeyboard` does
  // not deliver per-frame values on this version (its native observer walks
  // private UIKit classes to find the keyboard view, and when that walk fails
  // the only signal left is a one-shot snap at keyboardDidShow/DidHide, which
  // iOS posts after the keyboard has already stopped) and the Reanimated team
  // deprecated it in 4.2.0. The frames now come from the package that exists
  // to report them; reanimated keeps the style worklet.
  assert.match(
    fast,
    /const keyboard = useReanimatedKeyboardAnimation\(\);/,
    'the fast path tracks the keyboard, it does not imitate it'
  );
  assert.match(
    fast,
    /import \{ useReanimatedKeyboardAnimation \} from 'react-native-keyboard-controller';/
  );
  assert.doesNotMatch(
    fast,
    /useAnimatedKeyboard/,
    "reanimated's keyboard hook is deprecated and does not report per-frame on this version"
  );
  // THE SIGN, undone exactly once. The vendor reports the keyboard as a
  // NEGATIVE offset so its examples can feed it straight into a translateY;
  // riseFor speaks in positive heights, like the fallback's
  // endCoordinates.height. Getting this wrong does not fail to compile and
  // does not throw — it drives the column the wrong way — so it is asserted.
  assert.match(fast, /const keyboardHeight = -keyboard\.height\.value;/);
  assert.match(fast, /translateY: -riseFor\(keyboardHeight, insetBelow\)/);
  // The clip is load-bearing: a transformed child draws outside its parent's
  // box, and this column is a LATER sibling than the header, so without it
  // the messages paint over the header as they rise.
  assert.match(chat, /keyboardClip:\s*\{\s*flex: 1,\s*overflow: 'hidden',/);
  assert.match(chat, /<View style=\{styles\.keyboardClip\}>/);

  // THE HOOK. Native driver through the shared constant; the SYSTEM's own
  // duration so the column and the keyboard read as one object; the WILL
  // events on iOS, which fire before the keyboard moves; and the inset
  // subtracted and clamped, which is what closes the dead band above the
  // keyboard that the padding version always had.
  assert.match(hook, /useNativeDriver: USE_NATIVE_DRIVER/);
  assert.match(hook, /duration: event\?\.duration && event\.duration > 0 \? event\.duration : KEYBOARD_FALLBACK_MS/);
  assert.match(hook, /Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
  assert.match(hook, /Platform\.OS === 'ios' \? 'keyboardWillHide' : 'keyboardDidHide'/);
  assert.match(hook, /riseFor\(event\.endCoordinates\.height, inset\.current\)/);
  // Listeners are removed. A keyboard listener that outlives its screen drives
  // an Animated.Value nothing is rendering.
  assert.match(hook, /show\.remove\(\);\s*hide\.remove\(\);/);
});

test('[executed] the column takes the fast path only with BOTH vendors, and the fallback otherwise', () => {
  // THE COLUMN IS THE ONE SIBLING THAT NEEDS TWO PACKAGES: keyboard-controller
  // supplies the frames and reanimated runs the style off them. Either missing
  // must route to the fallback — a binary with the keyboard package and no
  // reanimated cannot execute the sibling's useAnimatedStyle at all, and one
  // with reanimated and no keyboard package would mount a hook that reports
  // nothing and leave the composer pinned at zero under a raised keyboard,
  // which is worse than the fallback it replaced.
  const column = stripComments(read('components/KeyboardRisingColumn.tsx'));
  assert.match(
    column,
    /\{ \.\.\.motionCapability, keyboard: canTrackKeyboard\(\) && canWorklet\(\) \}/,
    'the column must ask for both halves, through the boundary questions rather than the raw flags'
  );
  assert.match(column, /'keyboard',/, 'and choose on the key it just computed');
  assert.match(
    column,
    /import \{ canTrackKeyboard, canWorklet, motionCapability, resolveMotion120 \} from '\.\.\/lib\/motion120';/
  );
  // The fallback stays the path taken and is NOT deleted: it is the
  // implementation every build shipped so far runs.
  assert.match(column, /const keyboardRise = useKeyboardOffset\(insetBelow\);/);

  // THE DECISION ITSELF, run over all four combinations. `canTrackKeyboard()
  // && canWorklet()` is modelled here exactly as the source writes it, and the
  // fast path may be reached in ONE of the four.
  const chooseFor = (keyboard, reanimated) =>
    pure.resolveMotion120(
      { reanimated, gestures: false, keyboard: keyboard && reanimated },
      'keyboard',
      () => 'fast',
      'fallback'
    );
  assert.equal(chooseFor(true, true), 'fast', 'both vendors present: the column tracks the keyboard');
  assert.equal(chooseFor(true, false), 'fallback', 'no reanimated: the style worklet could not run');
  assert.equal(chooseFor(false, true), 'fallback', 'no keyboard package: the hook would report nothing');
  assert.equal(chooseFor(false, false), 'fallback', 'the binary shipped today');

  // AND THE GUARANTEE THE WHOLE BOUNDARY EXISTS FOR, stated as one line: a
  // binary reporting no capability at all never even attempts the require.
  let required = 0;
  assert.equal(
    pure.resolveMotion120(
      { reanimated: false, gestures: false, keyboard: false },
      'keyboard',
      () => {
        required += 1;
        return 'fast';
      },
      'fallback'
    ),
    'fallback'
  );
  assert.equal(required, 0, 'a binary with no natives must not load the sibling that imports them');
});

test('[executed] the chat column counts the pill once at rest and the keyboard once risen', () => {
  // THE CHAT CLEARANCE DOUBLE COUNT, closed 2026-08-23, as arithmetic.
  //
  // Every number here is READ from the source, and every step is tied to a
  // line that has to keep saying what the model assumes it says — otherwise
  // this is a story about code rather than a fence on it.
  const tokens = read('ui/tokens.ts');
  const navHeight = Number(tokens.match(/const FLOATING_NAV_HEIGHT = (\d+);/)[1]);
  const navGap = Number(tokens.match(/const FLOATING_NAV_GAP = (\d+);/)[1]);
  const bottomNav = read('ui/primitives/BottomNav.tsx');

  // (1) The pill is in NORMAL FLOW on the route this arithmetic is about.
  //     This is the premise the whole double count turned on: BottomTabView
  //     lays the scene container out as a flex:1 sibling above the bar, so the
  //     scene already ends at the pill's top edge.
  //
  //     RUN GROUND1 (C3) TOOK THE BAR OUT OF FLOW ON TWO ROUTES, and this
  //     block is REDONE rather than adjusted — which is exactly what the note
  //     that used to stand here demanded of whoever did it. The bar is
  //     absolutely positioned on customer Home and worker Home so the
  //     atmosphere raster behind them can reach the screen's bottom edge
  //     instead of stopping at a band above the bar. The chat column does not
  //     live on either, and cannot: the exception is an ALLOW-LIST of two leaf
  //     route names, read out of the source below, and every other route —
  //     Chat included — still gets an in-flow bar that reserves the scene
  //     space this model relies on. A third name appearing there fails here.
  const flatNav = bottomNav.replace(/\/\//g, ' ').replace(/\s+/g, ' ');
  assert.match(
    flatNav,
    /IN FLOW EVERYWHERE EXCEPT THE TWO HOMES/,
    'the bar must still declare where it is in-flow where the next reader will look'
  );
  const tabBarStyle = stripComments(bottomNav).match(/tabBarStyle: \{([\s\S]*?)\n {4}\},/);
  assert.ok(tabBarStyle, 'bottomNavScreenOptions must still declare a tabBarStyle');
  // The pill declares `position` exactly once and never unconditionally: it
  // rides a spread that is gated on the route.
  assert.equal(
    (tabBarStyle[1].match(/position:/g) ?? []).length,
    1,
    'the pill may declare position once, and only behind the route gate'
  );
  assert.match(
    tabBarStyle[1].replace(/\s+/g, ' '),
    /\.\.\.\(isAtmosphereHomeRoute\(route\) \? \(\{ position: 'absolute', left: 0, right: 0, bottom: 0 \} as const\) : null\),/,
    'the absolutely positioned pill must stay gated on the two Home routes'
  );
  const allowList = stripComments(bottomNav).match(
    /const ATMOSPHERE_HOME_ROUTES = new Set\(\[([^\]]*)\]\)/
  );
  assert.ok(allowList, 'the exception must stay a named allow-list of route names');
  const floating = allowList[1]
    .split(',')
    .map((name) => name.trim().replace(/'/g, ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(
    floating,
    ['HomeMain', 'WorkerHome'],
    'only the two screens that mount the atmosphere may take the bar out of flow'
  );
  assert.ok(
    !floating.includes('Chat'),
    'the chat column is modelled against an in-flow bar; Chat must not join the exception'
  );
  // And the gate is the leaf, not the tab: `Home` is a STACK, so scoping to
  // the tab route would take the bar out of flow for Chat itself, which is
  // registered on the worker Home stack.
  assert.match(
    stripComments(bottomNav).replace(/\s+/g, ' '),
    /export function isAtmosphereHomeRoute\(route: \{ name: string \}\): boolean \{ const leaf = getFocusedRouteNameFromRoute\(route\); return route\.name === 'Home' && \(leaf === undefined \|\| ATMOSPHERE_HOME_ROUTES\.has\(leaf\)\); \}/,
    'the gate must read the focused LEAF, or every screen in the Home stack floats too'
  );
  assert.match(
    bottomNav,
    /return TAB_BAR_CONTENT_HEIGHT \+ insetBottom;/,
    'bottomNavHeight is the bar footprint this model uses (attached, PJ1 C9)'
  );
  assert.match(bottomNav, /export const PINNED_FOOTER_BOTTOM_PADDING = layout\.floatingNavGap;/);

  // (2) The column's two inputs, both from the shared module, so the fallback
  //     and the reanimated path cannot land differently.
  const shared = stripComments(read('components/KeyboardRisingColumn.shared.tsx'));
  assert.match(shared, /return Math\.max\(0, keyboardHeight - insetBelow\);/);
  assert.match(shared, /export const COLUMN_BOTTOM_PADDING = PINNED_FOOTER_BOTTOM_PADDING;/);
  for (const path of [
    'components/KeyboardRisingColumn.tsx',
    'components/KeyboardRisingColumn.motion120.tsx',
  ]) {
    assert.match(stripComments(read(path)), /\{ paddingBottom: COLUMN_BOTTOM_PADDING \}/, path);
  }

  const riseFor = (keyboardHeight, insetBelow) => Math.max(0, keyboardHeight - insetBelow);
  const columnPadding = navGap;

  // A notched iPhone, where the double count was worst, and one where the
  // float margin rather than the inset wins.
  for (const insetBottom of [34, 0]) {
    const screenH = 852;
    const keyboard = 336;
    // PJ1 (C9): the attached bar's footprint — content plus the inset it
    // carries inside; the float-margin max() is gone with the float.
    const navClearance = navHeight + insetBottom;
    // The scene the column lives in ALREADY stops at the pill's top edge.
    const sceneBottom = screenH - navClearance;

    // AT REST. The column fills the scene; its padding is all that sits below
    // the composer.
    const restingBottom = sceneBottom - columnPadding - riseFor(0, navClearance);
    assert.equal(
      screenH - restingBottom,
      navClearance + columnPadding,
      `inset ${insetBottom}: the pill must be reserved exactly once — by the scene`
    );
    assert.equal(
      sceneBottom - restingBottom,
      columnPadding,
      `inset ${insetBottom}: the composer keeps a pinned element's breathing room and nothing more`
    );
    // The defect this replaced, stated so it cannot come back unnoticed: the
    // old padding reserved the footprint a second time.
    assert.equal(
      screenH - (sceneBottom - navClearance),
      2 * navClearance,
      `inset ${insetBottom}: paddingBottom: insetBelow counted the pill twice`
    );

    // RISEN. The keyboard covers the pill completely, so the pill drops out of
    // the arithmetic entirely and only the keyboard is counted.
    const risenBottom = sceneBottom - columnPadding - riseFor(keyboard, navClearance);
    assert.equal(
      screenH - risenBottom,
      keyboard + columnPadding,
      `inset ${insetBottom}: the composer must sit on the keyboard, counting it once`
    );
    assert.equal(
      screenH - keyboard - risenBottom,
      columnPadding,
      `inset ${insetBottom}: the same breathing room above the keyboard as above the pill`
    );
    // ...and the old dead band was exactly a pill's footprint, in this state
    // too — one cause, both symptoms.
    assert.equal(
      screenH - keyboard - (sceneBottom - navClearance - riseFor(keyboard, navClearance)),
      navClearance,
      `inset ${insetBottom}: the risen dead band was the same quantity as the resting one`
    );
  }

  // A hardware keyboard whose accessory bar is shorter than the clearance must
  // not drive the column DOWN. riseFor clamps at zero.
  assert.equal(riseFor(40, 104), 0);
});

test("[static] riseFor opens with the 'worklet' directive, so the fast path may call it", () => {
  // THE CFBUNDLEVERSION 3 CRASH, pinned where it lived. The motion120 sibling
  // calls riseFor synchronously inside its useAnimatedStyle callback — a
  // worklet, running on the UI runtime, where an imported function without a
  // 'worklet' directive does not exist. The call threw, reanimated does not
  // catch a throw from a style worklet, and the app aborted the moment
  // ChatScreen mounted on the first binary whose motionCapability.reanimated
  // resolved true. The JS-thread caller (useKeyboardOffset) is indifferent:
  // a worklet is still an ordinary callable over there.
  //
  // POSITION IS THE ASSERTION. A directive is only a directive at the top of
  // the body; 'worklet' below another statement is an inert string and the
  // crash comes back. So the match runs from the function's opening brace to
  // the directive with only whitespace permitted between them (comments are
  // stripped before matching, and comments above a directive are legal
  // anyway).
  const shared = stripComments(read('components/KeyboardRisingColumn.shared.tsx'));
  assert.match(
    shared,
    /export function riseFor\(keyboardHeight: number, insetBelow: number\): number \{\s*'worklet';/,
    "riseFor's FIRST statement must be the 'worklet' directive — the UI runtime calls it every frame the keyboard moves"
  );
});

test('[static] every feature flag carries the dependency it waits on, and only the landed ones are live', () => {
  // M2's contract: the UI behind a flag is BUILT, and the flag is what keeps
  // it from being offered. A flag with no recorded dependency is a flag
  // nobody can ever safely flip, so the WAITS ON line is part of the flag —
  // and it stays part of it after the flip, because a flag that HAS been
  // flipped is still where a later reader looks to find out why it could be.
  const source = read('lib/featureFlags.ts');
  const flags = [...source.matchAll(/export const (\w+) = (false|true) as boolean;/g)];
  assert.equal(flags.length, 12, `the roster is twelve flags (saw ${flags.length})`);
  assert.deepEqual(
    flags.map((f) => f[1]).sort(),
    [
      'ARCHIVE', 'CLEAR_CHAT', 'DELETE_CHAT', 'DELIVERED_TICKS', 'DOCUMENTS',
      'HIDDEN_CHATS', 'LIVE_LOCATION', 'MARK_UNREAD', 'PRICE_GUIDANCE', 'READ_TICKS',
      'TIMED_BLOCK', 'TRANSLATION',
    ],
    'the flag roster changed — say so in HANDOFF.md as well as here'
  );
  // MUTE was REMOVED from this table (2026-08-23) rather than shipped false:
  // it had no unmet dependency to record, because `mutes` and
  // muteUser/unmuteUser already exist and are already wired. A flag with
  // nothing to wait on is a flag nobody can ever safely flip.
  assert.doesNotMatch(source, /export const MUTE\b/);
  assert.match(source, /NOT A FLAG — MUTE WAS RETIRED/);
  // WHICH FLAGS ARE LIVE, named rather than counted. Seven flipped on
  // 2026-08-24 — exactly the ones supabase/archive/phases/phase77_conversation_features.sql
  // supplied a dependency for, wired by RUN W1 on BOTH thread kinds. DOCUMENTS
  // and LIVE_LOCATION joined them on 2026-08-25 (RUN W2), the other two
  // features phase77 declared.
  //
  // LIVE_LOCATION IS THE ONE WORTH READING TWICE. Its recorded dependency was
  // two things: a location-sharing table, which phase77 supplied, AND
  // expo-location's BACKGROUND permission with expo-task-manager. The second
  // was not satisfied — it was REFUSED, and the feature ships foreground-only.
  // That is why this fence also insists every flag keeps its WAITS ON line
  // after the flip: "waits on nothing" with no reason recorded would leave the
  // next run to "finish" the job by asking for the permission this one
  // declined.
  //
  // The two that remain each still have something real to wait on — an
  // edge-function deploy for TRANSLATION, and for DELIVERED_TICKS a
  // per-recipient delivery signal that does not exist in any schema here and
  // is refused rather than pending.
  //
  // Pinning the ROSTER rather than asserting "all false" is what keeps this
  // fence useful now that flipping is a thing that happens: a flag going live
  // without its dependency turns this red exactly as a premature flip used to.
  const LIVE = [
    'ARCHIVE', 'CLEAR_CHAT', 'DELETE_CHAT', 'DOCUMENTS', 'HIDDEN_CHATS',
    'LIVE_LOCATION', 'MARK_UNREAD', 'READ_TICKS', 'TIMED_BLOCK',
  ];
  // PRICE_GUIDANCE (Tier A, 2026-08-30) is dark by the copy sweep's rule: the
  // seeded range table has no attributed source, so the guidance waits on one.
  const DARK = ['DELIVERED_TICKS', 'PRICE_GUIDANCE', 'TRANSLATION'];
  assert.deepEqual(
    [...LIVE, ...DARK].sort(),
    flags.map((f) => f[1]).sort(),
    'every flag must be listed as live or dark — say which in HANDOFF.md too'
  );

  for (const [, name, value] of flags) {
    const expected = LIVE.includes(name) ? 'true' : 'false';
    assert.equal(
      value,
      expected,
      expected === 'false'
        ? `${name} is live — flip it here only once its dependency has landed`
        : `${name} is dark — its dependency landed, so it belongs at true`
    );
    const doc = source.slice(0, source.indexOf(`export const ${name}`));
    const block = doc.slice(doc.lastIndexOf('/**'));
    assert.match(block, /WAITS ON:/, `${name} must record the table, column, policy, deploy or key it waits on`);
  }
});

test('[static] every feature flag either gates something or says plainly that it does not', () => {
  // AUDIT F1. A flag table's implicit contract is "flip this and the feature
  // appears". READ_TICKS and DELIVERED_TICKS broke it: both were named only in
  // PROSE — components/MessageTicks.tsx and lib/messageTicks.ts mention them,
  // neither imports them — so flipping either changed nothing on screen.
  // ChatBubble calls `tickStateFor(delivery ?? {})` and no caller passes
  // `delivery`, so every own message draws one tick whatever the flags say.
  //
  // READ_TICKS IS NO LONGER ONE OF THEM. phase77's message_reads_select_party
  // supplied the half that was missing — the counterparty's read position on a
  // JOB thread — and RUN W1 built the assembly in screens/ChatScreen.tsx, so
  // the flag now guards something and its NO GUARD SITE paragraph came out
  // with the wiring, which is exactly what this fence demands in that
  // direction.
  //
  // DELIVERED_TICKS is the one that remains, and it is the strictly harder
  // half: nothing in the schema distinguishes "the insert succeeded" from "the
  // other device has it", so there is no honest source to wire it to and it
  // stays false permanently rather than being faked from an insert.
  //
  // This fence keeps that honest in BOTH directions: a flag with a guard site
  // is fine, a flag without one must SAY it has none, and the day the wiring
  // lands the declaration has to come back out.
  const source = read('lib/featureFlags.ts');
  const flags = [...source.matchAll(/export const (\w+) = (?:false|true) as boolean;/g)].map(
    (m) => m[1],
  );

  const sources = [];
  for (const dir of ['components', 'screens', 'hooks', 'lib']) {
    for (const name of readdirSync(join(root, dir))) {
      if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
      if (`${dir}/${name}` === 'lib/featureFlags.ts') continue;
      sources.push([`${dir}/${name}`, stripComments(read(`${dir}/${name}`))]);
    }
  }

  let gated = 0;
  let declared = 0;
  for (const name of flags) {
    const pattern = new RegExp(`\\b${name}\\b`);
    const sites = sources.filter(([, body]) => pattern.test(body)).map(([file]) => file);
    const doc = source.slice(0, source.indexOf(`export const ${name}`));
    const block = doc.slice(doc.lastIndexOf('/**'));
    const declaresNoGuard = /NO GUARD SITE/.test(block);

    if (sites.length > 0) {
      gated += 1;
      assert.ok(
        !declaresNoGuard,
        `${name} is guarded at ${sites.join(', ')} but its doc still says NO GUARD SITE — ` +
          'delete that paragraph now the wiring exists',
      );
    } else {
      declared += 1;
      assert.ok(
        declaresNoGuard,
        `${name} gates nothing — no file outside lib/featureFlags.ts references it — so ` +
          'flipping it changes nothing. Say so in its doc block and name what must be built.',
      );
      assert.match(
        block,
        /WHAT MUST BE BUILT/,
        `${name} declares no guard site but does not name the wiring that would give it one`,
      );
    }
  }

  // The sweep must be measuring both halves; an empty `sources` would make
  // every flag look unguarded and still pass the loop above.
  assert.ok(gated >= 10, `most flags do gate something (saw ${gated})`);
  assert.equal(
    declared,
    1,
    `DELIVERED_TICKS is the only flag left with nothing to gate (saw ${declared})`
  );
});

// ===========================================================================
// THE FAST-PATH SIBLINGS — 2026-08-23, once the natives were installed.
//
// Four surfaces gained a `.motion120` sibling. None is reachable on the
// operator's current build: the packages are in package.json and node_modules
// but NOT in the dev build, so both capabilities still resolve false and every
// surface runs its fallback. That is the designed state, not a degraded one.
//
// What these tests can and cannot do. They cannot render a worklet — there is
// no native module here and no renderer under `node --test`. What they CAN do
// is exercise the CHOOSER with the vendor present and absent, which is the
// decision the whole arrangement rests on, and hold each sibling to the same
// contract as its fallback by reading both. A fast path that drifts from its
// fallback fails here rather than on a device nobody has yet.
// ===========================================================================

/** Every fast path, with the fallback it must match and the capability it needs. */
const SIBLINGS = [
  {
    name: 'DropMenu',
    fallback: 'components/DropMenu.tsx',
    fast: 'components/DropMenu.motion120.tsx',
    shared: 'components/DropMenu.shared.tsx',
    needs: 'reanimated',
  },
  {
    name: 'SwipeableRow',
    fallback: 'components/SwipeableRow.tsx',
    fast: 'components/SwipeableRow.motion120.tsx',
    shared: 'components/SwipeableRow.shared.tsx',
    needs: 'gestures',
  },
  {
    name: 'KeyboardRisingColumn',
    fallback: 'components/KeyboardRisingColumn.tsx',
    fast: 'components/KeyboardRisingColumn.motion120.tsx',
    shared: 'components/KeyboardRisingColumn.shared.tsx',
    needs: 'keyboard',
  },
  {
    // RUN P1 — the published-job mark's entrance. The only sibling here that
    // needs worklets ALONE: there is no gesture in it, just a one-second
    // entrance, so a recogniser would buy it nothing.
    name: 'SuccessMark',
    fallback: 'components/SuccessMark.tsx',
    fast: 'components/SuccessMark.motion120.tsx',
    shared: 'components/SuccessMark.shared.tsx',
    needs: 'reanimated',
  },
  {
    // 2026-09-21 — the Customer <-> Worker mode switch: the glass wipe
    // carrying the capsule. Worklets alone, like the mark: there is no
    // gesture, only a timed sweep and a drop, and the fallback runs the same
    // two motions on the native driver from the same shared choreography.
    name: 'ModeTransitionOverlay',
    fallback: 'components/ModeTransitionOverlay.tsx',
    fast: 'components/ModeTransitionOverlay.motion120.tsx',
    shared: 'components/ModeTransitionOverlay.shared.tsx',
    needs: 'reanimated',
  },
  {
    // 2026-09-19 — the map's floating jobs pane, pulled up by a finger. A
    // pull is a swipe by another name, so it asks the swipe row's question:
    // a recogniser AND worklets, and either absent takes the tap-to-open
    // fallback on the same translateY.
    name: 'PeekSheet',
    fallback: 'components/PeekSheet.tsx',
    fast: 'components/PeekSheet.motion120.tsx',
    shared: 'components/PeekSheet.shared.tsx',
    needs: 'gestures',
  },
];

test('[executed] every sibling is taken when its native is present and skipped when it is absent', () => {
  // THE DECISION, run both ways, for each surface.
  for (const { name, needs } of SIBLINGS) {
    const present = { reanimated: true, gestures: true, keyboard: true };
    const absent = { reanimated: false, gestures: false, keyboard: false };

    assert.equal(
      pure.resolveMotion120(present, needs, () => 'fast', 'fallback'),
      'fast',
      `${name} must take its fast path when ${needs} is present`
    );
    assert.equal(
      pure.resolveMotion120(absent, needs, () => 'fast', 'fallback'),
      'fallback',
      `${name} must take its fallback when ${needs} is absent`
    );
    // GUARDED, not merely conditional: a sibling that throws on require — a
    // half-present native module, a bad build — is a fast path this binary
    // does not have, never a crash on the startup path.
    assert.equal(
      pure.resolveMotion120(
        present,
        needs,
        () => {
          throw new Error('native module missing');
        },
        'fallback'
      ),
      'fallback',
      `${name} must survive a throwing sibling`
    );
    // And the loader is not called AT ALL without the capability, which is
    // what keeps an unimportable module unimported.
    let called = false;
    pure.resolveMotion120(
      absent,
      needs,
      () => {
        called = true;
        return 'fast';
      },
      'fallback'
    );
    assert.equal(called, false, `${name} must not even attempt the require without ${needs}`);
  }
});

test('[static] each fast path is paired with a fallback, and neither owns the shared body', () => {
  for (const { name, fallback, fast, shared, needs } of SIBLINGS) {
    const fallbackSource = stripComments(read(fallback));
    const fastSource = stripComments(read(fast));

    // THE PAIRING. The fallback chooses, through the boundary, on the
    // capability it actually needs, with a LITERAL require — Metro resolves
    // requires at bundle time, so a path built from a string would not
    // resolve at all.
    assert.match(
      fallbackSource,
      /resolveMotion120</,
      `${name}'s fallback must choose through the boundary`
    );
    assert.match(
      fallbackSource,
      new RegExp(`'${needs}'`),
      `${name} must ask for the capability it actually needs`
    );
    assert.match(
      fallbackSource,
      /require\('\.\/[\w.]+\.motion120'\)/,
      `${name} must write its require as a literal`
    );

    // ONLY the fast path names a vendor package. A fallback that imported one
    // would take the app down on the startup path of a binary without it.
    for (const pkg of VENDOR_PACKAGES) {
      assert.ok(
        !new RegExp(`from '${pkg}'`).test(fallbackSource),
        `${name}'s fallback must not import ${pkg}`
      );
    }
    assert.ok(
      VENDOR_PACKAGES.some((pkg) => new RegExp(`from '${pkg}'`).test(fastSource)),
      `${name}'s fast path exists to use a vendor package and does not`
    );

    // THE SHARED BODY. Everything a user can name lives in one file both
    // paths import, so the two binaries cannot drift into two components.
    const sharedImport = shared.replace('components/', './').replace('.tsx', '');
    for (const [label, source] of [
      ['fallback', fallbackSource],
      ['fast', fastSource],
    ]) {
      assert.ok(
        source.includes(`from '${sharedImport}'`),
        `${name}'s ${label} must take its body from ${shared}`
      );
    }
  }
});

test('[static] the DropMenu fast path matches its fallback where a user can tell', () => {
  const fast = stripComments(read('components/DropMenu.motion120.tsx'));
  const shared = stripComments(read('components/DropMenu.shared.tsx'));

  // Same items, same backdrop, same dismissal — all from the shared module.
  assert.match(fast, /<DropMenuItems items=\{items\} onClose=\{onClose\} \/>/);
  assert.match(fast, /<DropMenuBackdrop direction=\{direction\} onClose=\{onClose\} closeLabel=\{closeLabel\} \/>/);
  assert.match(fast, /accessibilityViewIsModal/);
  // Same two guards, so an empty or closed menu renders nothing on both.
  assert.match(fast, /if \(!visible \|\| items\.length === 0\) return null;/);
  // Grows FROM the anchor, using the shared travel rather than its own.
  assert.match(fast, /panelTravelFor\(direction\)/);
  assert.match(shared, /export const PANEL_TRAVEL = 8;/);
  assert.match(shared, /export const PANEL_SCALE_FROM = 0\.96;/);
  // Exits faster than it enters, on the boundary's own constant — a dismissal
  // that takes as long as an arrival reads as sluggish.
  assert.match(fast, /withTiming\(0, \{ duration: MENU_MOTION_OUT_MS \}\)/);
  // A real spring on the way in; that is the thing worth having worklets for.
  assert.match(fast, /withSpring\(1, PANEL_SPRING\)/);
  // Reduced motion still APPEARS, it just does not travel — the same
  // concession the fallback makes, by the same rule.
  assert.match(fast, /if \(reducedMotion\) \{/);
  assert.match(fast, /progress\.value = visible \? 1 : 0;/);
});

test('[static] the peek sheet slides by a transform on both drivers, and the fallback can still open', () => {
  // 2026-09-19 — the map's floating jobs pane. THE PROPERTY: the pane is laid
  // out once at its open height and moves by translateY, so nothing is
  // re-laid-out per frame — the fast path follows the finger on the UI
  // thread and the fallback rides the native driver. A `height` in either
  // animated style would be the layout-per-frame this suite forbids above.
  const fallback = stripComments(read('components/PeekSheet.tsx'));
  const fast = stripComments(read('components/PeekSheet.motion120.tsx'));
  const shared = stripComments(read('components/PeekSheet.shared.tsx'));

  // The fallback: core Animated.spring on the shared constants, native driver,
  // a translateY — and the head is a button, so a build without gestures
  // opens the list by a tap rather than not at all.
  assert.match(fallback, /Animated\.spring\(y, \{\s*toValue: target,\s*useNativeDriver: USE_NATIVE_DRIVER,\s*\.\.\.SHEET_SPRING,/);
  assert.match(fallback, /transform: \[\{ translateY: y \}\]/);
  assert.doesNotMatch(fallback, /height: y\b|\bheight: metrics/, 'the fallback must not animate the layout');
  assert.match(fallback, /gestures: canSwipe\(\) && canWorklet\(\), reanimated: canWorklet\(\)/);
  // 2026-09-20 (sitting 2), three stops: the head is a button when there is
  // anything to open onto OR the pane is tucked (a tap restores the peek); a
  // tap never tucks. The pull is offered when there is anywhere to go — the
  // list beyond the peek, or the tuck below it.
  assert.match(
    shared,
    /<Pressable\s+onPress=\{canToggle \? toggle : undefined\}/,
    'the head is a button on both drivers — when there is anything beyond the peek to open onto, or the pane is tucked'
  );
  assert.match(shared, /const canToggle = canOpen \|\| stop === 'mini';/);
  assert.match(fast, /\.enabled\(metrics\.canOpen \|\| metrics\.canMini\)/, 'and the pull is offered wherever there is somewhere to go');
  assert.match(shared, /const toggle = \(\) => onStopChange\(stop === 'peek' \? 'open' : 'peek'\);/);

  // The fast path: the pan is on the HEAD (the shared seam), the update is a
  // worklet clamped between the rubber and the rest position, the release
  // springs on the UI thread and only then reports through runOnJS.
  assert.match(fast, /wrapHead=\{\(head\) => <GestureDetector gesture=\{pan\}>\{head\}<\/GestureDetector>\}/);
  assert.match(fast, /y\.value = Math\.min\(mini\.value, Math\.max\(-OVERDRAG, next\)\);/, 'the finger goes as far as the tuck, a little past open, never further');
  assert.match(fast, /y\.value = withSpring\(offsets\[toIndex\], SPRING\);\s*runOnJS\(settle\)\(next\);/, 'the release springs on the UI thread, then reports');
  // A flick moves ONE stop in its direction from where the pull began; a
  // slower release aims where the finger was heading and takes the nearest.
  assert.match(fast, /if \(event\.velocityY < -FLING_VELOCITY\) \{\s*toIndex = Math\.max\(0, fromIndex - 1\);/);
  assert.match(fast, /else if \(event\.velocityY > FLING_VELOCITY\) \{\s*toIndex = Math\.min\(offsets\.length - 1, fromIndex \+ 1\);/);
  assert.match(fast, /const aim = y\.value \+ event\.velocityY \* RELEASE_PROJECTION_S;/);
  assert.match(fast, /function offsetOf\(stop: PeekStop, closed: number, mini: number\): number \{\s*'worklet';/);
  assert.match(fast, /transform: \[\{ translateY: y\.value \}\]/);
  assert.doesNotMatch(fast, /height: y\.value/, 'the fast path must not animate the layout');
  // A release that already sprang must not be sprung again by the render it
  // causes — the guard exists, and it is consulted before the effect springs.
  assert.match(fast, /if \(settledByGesture\.current\) \{\s*settledByGesture\.current = false;\s*return;\s*\}/);

  // The shared arithmetic: closed is the open height minus the measured
  // peek, the frame clips at the open size and takes no touch of its own.
  assert.match(shared, /const closedOffset = ready \? Math\.max\(0, expandedHeight - peekHeight\) : 0;/);
  assert.match(shared, /const peekHeight = ready \? 1 \+ headHeight \+ firstHeight \+ paneBottom\(\) : 0;/);
  // 2026-09-20: the open height is what the rows need, capped at the room the
  // parent measured — never more than the content, never a fixed height.
  assert.match(
    shared,
    /const expandedHeight = ready \? Math\.max\(peekHeight, Math\.min\(contentHeight, maxHeight\)\) : maxHeight;/
  );
  assert.match(shared, /const canOpen = closedOffset > 0;/);
  // The tuck: the rim, the pane's top padding, the handle, its gap and HALF
  // the measured count line — never below the peek's rest.
  assert.match(
    shared,
    /const miniHeight =\s*ready && titleHeight !== null\s*\? 1 \+ spacing\.md \+ PEEK_GRAB_HEIGHT \+ spacing\.md \+ Math\.round\(titleHeight \/ 2\)\s*: peekHeight;/
  );
  assert.match(shared, /const miniOffset = ready \? Math\.max\(closedOffset, expandedHeight - miniHeight\) : 0;/);
  assert.match(shared, /const canMini = miniOffset > closedOffset;/);
  assert.match(shared, /onLayout=\{onTitleLayout\}/, 'the count line reports its height');
  // The fallback rests at whichever stop it is handed, and reaches only two.
  assert.match(fallback, /const target = stop === 'open' \? 0 : stop === 'peek' \? metrics\.closedOffset : metrics\.miniOffset;/);
  assert.match(shared, /onRowLayout\(index, event\);/, 'every row reports its height');
  assert.match(shared, /pointerEvents="box-none"/);
  assert.match(shared, /frame: \{\s*position: 'absolute',\s*overflow: 'hidden',/);
  // The list is the peek: its first row reports the height the peek shows,
  // and it cannot scroll under a finger until the pane is open.
  assert.match(shared, /if \(index === 0\) onFirstLayout\(event\);/);
  assert.match(shared, /scrollEnabled=\{open\}/);
  // ONE spring for both drivers, spelled once.
  assert.match(shared, /export const SHEET_SPRING = \{ damping: \d+, stiffness: \d+, mass: [\d.]+ \} as const;/);
});

test('[static] the swipe surface needs BOTH natives, which is what consumes canWorklet', () => {
  // AUDIT F3. `canWorklet` was exported and read by nothing, which made it a
  // claim rather than a check. The swipe row is where it belongs: a build with
  // a recogniser but no worklets could swipe, and would swipe BADLY — a JS
  // round trip per frame under exactly the load a list scroll produces —
  // which is worse than not offering the mechanic.
  const row = stripComments(read('components/SwipeableRow.tsx'));
  // The two QUESTIONS must be imported, asserted by name rather than as an
  // exact member list — the list grew a third entry when the boundary did, and
  // pinning the whole line would make every future addition look like a
  // regression here.
  const rowImport = row.match(/import \{([^}]*)\} from '\.\.\/lib\/motion120';/);
  assert.ok(rowImport, 'SwipeableRow must import from the boundary');
  for (const name of ['canSwipe', 'canWorklet', 'resolveMotion120']) {
    assert.ok(
      rowImport[1].split(',').some((member) => member.trim() === name),
      `SwipeableRow must import ${name} from the boundary`
    );
  }
  assert.match(
    row,
    /gestures: canSwipe\(\) && canWorklet\(\), reanimated: canWorklet\(\)/,
    'the swipe needs a recogniser AND worklets; either false takes the fallback'
  );
  // The capability it hands over is the REAL one with those two keys
  // overridden — a swipe row inventing a value for a vendor it does not use
  // would be a claim it has no basis for.
  assert.match(row, /\{ \.\.\.motionCapability, gestures:/);

  // Executed, every combination: neither native alone opens the fast path.
  //
  // The two predicates are read out of lib/motion120/index.tsx rather than
  // imported — that module pulls in react-native and ./vendor, neither of
  // which loads under plain `node --test`. So the test PINS what each one
  // returns and then runs the AND over the pinned meaning; if either
  // definition changes, the pin fails before the table can go stale.
  const boundary = stripComments(read('lib/motion120/index.tsx'));
  assert.match(boundary, /export function canSwipe\([^)]*\): boolean \{\s*return capability\.gestures;/);
  assert.match(boundary, /export function canWorklet\([^)]*\): boolean \{\s*return capability\.reanimated;/);
  const swipeReady = (capability) => capability.gestures && capability.reanimated;
  assert.equal(swipeReady({ gestures: true, reanimated: true }), true);
  assert.equal(swipeReady({ gestures: true, reanimated: false }), false, 'no worklets, no swipe');
  assert.equal(swipeReady({ gestures: false, reanimated: true }), false, 'no recogniser, no swipe');
  assert.equal(swipeReady({ gestures: false, reanimated: false }), false);

  // The FALLBACK is the row itself — not a disabled swipe and not dead tiles.
  // A capability-false device shows no affordance that does nothing.
  assert.match(row, /function SwipeableRowFallback\(\{ children \}: SwipeableRowProps\) \{\s*return <>\{children\}<\/>;/);

  // canWorklet is READ by app code now, not merely exported. This is the
  // assertion that fails if it goes back to being decorative.
  const consumers = [];
  for (const dir of ['components', 'screens', 'hooks', 'ui', 'navigation', 'modes']) {
    for (const entry of readdirSync(join(root, dir))) {
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\bcanWorklet\b/.test(stripComments(read(`${dir}/${entry}`)))) {
        consumers.push(`${dir}/${entry}`);
      }
    }
  }
  assert.ok(consumers.length > 0, 'canWorklet must be consumed or removed — it cannot just exist');
});

test('[static] the inbox swipe and its long press share ONE action model', () => {
  // The rule canSwipe states: a swipe chooses the MECHANIC, never the action
  // set. Both entries read `actionsFor`, so an action cannot exist on one and
  // not the other, and no handler is written twice.
  const screen = stripComments(read('screens/MessagesInboxScreen.tsx'));

  assert.match(screen, /const actionsFor = useCallback\(/, 'the action model is built once');
  assert.match(
    screen,
    /const sheetItems: ActionSheetItem\[\] = sheetTarget[\s\S]{0,40}\.\.\.actionsFor\(sheetTarget\),/,
    'the long-press sheet renders the shared model'
  );
  assert.match(screen, /const model = actionsFor\(target\);/, 'the swipe reads the same model');
  assert.match(
    screen,
    /<SwipeableRow actions=\{swipeActionsFor\(item\.otherId\)\} enabled=\{!item\.isSelf\}>/,
    'every row offers the swipe, except a self-conversation with nobody to act on'
  );

  // The three tiles the dispatch named, and Block deliberately NOT among them:
  // it is the destructive one, it confirms, and a tile a thumb reaches by
  // accident is the wrong home for it. It stays one tap away, inside More.
  assert.match(screen, /byKey\('mute'\)/);
  assert.match(screen, /byKey\('report'\)/);
  assert.doesNotMatch(screen, /byKey\('block'\)/, 'block is not a swipe tile');
  assert.match(screen, /tone: 'gold'/, 'the overflow tile is the gold one');
  assert.match(
    screen,
    /onPress: \(\) => setSheetUserId\(userId\)/,
    'the More tile opens the very sheet the long press opens'
  );

  // Flag-gated rows still do not render, and the swipe inherits that because
  // it renders entries of the same array rather than a list of its own.
  assert.match(screen, /\.\.\.\(moreItems\.length > 0/);
});

// ===========================================================================
// THE RESOLVABILITY FENCE — 2026-08-23, and it is a DIFFERENT question from
// everything above it.
//
// The static-exclusivity scan at the top of this file tests IMPORT SITES: who
// is allowed to name a vendor package. It is correct and nothing here weakens
// it. But it can only ever be as true as the packages themselves, and it never
// opens one. Metro follows require() STATICALLY, so the *.motion120 siblings
// sit in the bundle graph on every build regardless of what motionCapability
// resolves to at runtime — the boundary is a RUNTIME guard, not a bundling
// one. A package the graph reaches and cannot resolve is a red screen at
// bundle time, before a single capability check has run.
//
// That is not hypothetical. A device bundle failed on
// "Unable to resolve module ./ReanimatedModule" — a relative import made by
// reanimated's OWN entry point. The cause was a stale Metro cache rather than
// a broken package, but the shape of the failure is the point: nothing in this
// repository would have caught it, and nothing would catch the real version of
// it either. This repository also lives inside a OneDrive folder, where a file
// can appear in a listing, satisfy statSync, and still fail to deliver bytes.
//
// So these four tests ask, from disk and by READING:
//   a. Do all three vendor packages resolve, and do their entries hand over
//      real bytes rather than merely existing?
//   b. Does reanimated's own entry — whichever file its package.json names —
//      exist, and does every relative import it makes resolve?
//   c. Is reanimated's declared peer on react-native-worklets satisfied by the
//      version installed? Nothing else checks this: there is no postinstall
//      peer validation in this project.
//   d. Does babel.config.js still leave the worklets plugin to the preset?
//
// The whole purpose is converting a red device screen into a red test, so
// every assertion below names the exact path or version that failed.
// ===========================================================================

const requireFromRepo = createRequire(join(root, 'noop.js'));
const repoPath = (file) => relative(root, file).split(sep).join('/');

/** Metro resolves platform-suffixed and extension-less files; node does not,
 *  so the candidate list has to be built rather than delegated. */
const RESOLVE_PLATFORMS = ['', '.ios', '.native', '.android', '.web'];
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'];

/** Bytes, or null. NOT existsSync: on OneDrive a placeholder can pass an
 *  existence check and still throw on read, which is exactly the failure this
 *  fence exists to catch before a device does. */
function readableBytes(file) {
  try {
    if (!statSync(file).isFile()) return null;
    return readFileSync(file);
  } catch {
    return null;
  }
}

/** The one relative resolver, used for both the entry and its imports. */
function resolveRelative(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base];
  for (const platform of RESOLVE_PLATFORMS) {
    for (const extension of RESOLVE_EXTENSIONS) {
      candidates.push(base + platform + extension);
      candidates.push(join(base, 'index' + platform + extension));
    }
  }
  for (const candidate of candidates) {
    const bytes = readableBytes(candidate);
    if (bytes) return { file: candidate, bytes: bytes.length };
  }
  return null;
}

function manifestOf(pkg) {
  const file = join(root, 'node_modules', pkg, 'package.json');
  const bytes = readableBytes(file);
  assert.ok(bytes, repoPath(file) + ' is missing or unreadable — the install is incomplete');
  return JSON.parse(bytes.toString('utf8'));
}

/** Every package the bundle graph reaches through the motion boundary. */
const RESOLVABLE = [...VENDOR_PACKAGES, 'react-native-worklets'];

test('[static] every vendor package resolves and its entry hands over real bytes', () => {
  for (const pkg of RESOLVABLE) {
    let entry;
    try {
      entry = requireFromRepo.resolve(pkg);
    } catch (error) {
      assert.fail(
        'require.resolve(' + pkg + ') failed with ' + (error.code ?? error.message) +
          ' — a partial or interrupted install, not a code defect. Reinstall before debugging further.'
      );
    }
    const bytes = readableBytes(entry);
    assert.ok(
      bytes,
      pkg + ' resolves to ' + repoPath(entry) + ' but that file delivers no bytes — on OneDrive a ' +
        'placeholder can satisfy an existence check and still fail to read'
    );
    assert.ok(
      bytes.length > 0,
      pkg + ' entry ' + repoPath(entry) + ' is zero bytes — a truncated or file-synced-away install'
    );
    // The installed version is read in the same breath, so a resolve that
    // succeeded against a GUTTED package still has something to fail on.
    assert.match(
      manifestOf(pkg).version ?? '',
      /^\d+\.\d+\.\d+/,
      pkg + ' has no usable version in its package.json'
    );
  }
});

test('[static] the reanimated entry resolves, and so does every relative import it makes', () => {
  const manifest = manifestOf('react-native-reanimated');
  // Whichever field the package NAMES — never a hardcoded src/ or lib/. Metro
  // reads react-native first, which is the entry a device actually bundles and
  // therefore the one whose relative imports can break a build.
  const field = ['react-native', 'main', 'module'].find((name) => typeof manifest[name] === 'string');
  assert.ok(field, 'react-native-reanimated declares no entry point at all in its package.json');

  const declared = manifest[field];
  const spec = declared.startsWith('.') ? declared : './' + declared;
  const entry = resolveRelative(join(root, 'node_modules/react-native-reanimated/package.json'), spec);
  assert.ok(
    entry,
    'react-native-reanimated package.json names "' + field + '": "' + declared + '" and no file ' +
      'matching it resolves or reads under node_modules/react-native-reanimated/'
  );

  const source = readFileSync(entry.file, 'utf8');
  const specs = [
    ...new Set([...source.matchAll(/(?:from|require\()\s*['"](\.[^'"]*)['"]/g)].map((match) => match[1])),
  ].sort();
  // ANTI-VACUITY. This entry re-exports the whole library; an extraction that
  // found nothing would pass the loop below with the package gutted.
  assert.ok(
    specs.length > 10,
    'only ' + specs.length + ' relative imports were found in ' + repoPath(entry.file) +
      ' — the scan is not reading the entry'
  );

  const unresolved = [];
  for (const relativeSpec of specs) {
    if (!resolveRelative(entry.file, relativeSpec)) unresolved.push(relativeSpec);
  }
  assert.deepEqual(
    unresolved,
    [],
    repoPath(entry.file) + ' imports ' + unresolved.join(', ') + ' and no file matching them resolves — ' +
      'this is the "Unable to resolve module ./ReanimatedModule" bundle failure, caught off-device'
  );
});

// Minimal range satisfaction. npm resolved this tree, so the job here is to
// NOTICE a mismatch, not to re-implement npm: hyphen ranges, ^, ~ and plain
// comparators cover every shape these packages actually publish, and an
// unrecognised one fails loudly rather than passing quietly.
const versionParts = (value) =>
  value.replace(/^[v=]+/, '').split('+')[0].split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);

const compareVersions = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
};

/** The exclusive upper bound implied by a PARTIAL version: "0.8" means
 *  anything below 0.9.0. A complete version implies no ceiling. */
const partialCeiling = (value) => {
  const parts = versionParts(value);
  const depth = value.replace(/^[v=]+/, '').split('+')[0].split('-')[0].split('.').length;
  if (depth >= 3) return null;
  if (depth === 2) return [parts[0], parts[1] + 1, 0];
  return [parts[0] + 1, 0, 0];
};

/** true, false, or null for a range shape this fence does not understand. */
function satisfiesRange(version, range) {
  const target = versionParts(version);
  for (const alternative of range.split('||')) {
    const clause = alternative.trim();
    if (clause === '' || clause === '*' || clause === 'x') return true;
    const hyphen = clause.match(/^(\S+)\s+-\s+(\S+)$/);
    if (hyphen) {
      const [, low, high] = hyphen;
      const ceiling = partialCeiling(high);
      const withinTop = ceiling
        ? compareVersions(target, ceiling) < 0
        : compareVersions(target, versionParts(high)) <= 0;
      if (compareVersions(target, versionParts(low)) >= 0 && withinTop) return true;
      continue;
    }
    let holds = true;
    for (const term of clause.split(/\s+/)) {
      const parsed = term.match(/^(>=|<=|>|<|\^|~|=)?(.+)$/);
      if (!parsed) return null;
      const [, operator, raw] = parsed;
      const bound = versionParts(raw);
      if (operator === '>=') holds = compareVersions(target, bound) >= 0;
      else if (operator === '<=') holds = compareVersions(target, bound) <= 0;
      else if (operator === '>') holds = compareVersions(target, bound) > 0;
      else if (operator === '<') holds = compareVersions(target, bound) < 0;
      else if (operator === '^') {
        const ceiling =
          bound[0] > 0 ? [bound[0] + 1, 0, 0] : bound[1] > 0 ? [0, bound[1] + 1, 0] : [0, 0, bound[2] + 1];
        holds = compareVersions(target, bound) >= 0 && compareVersions(target, ceiling) < 0;
      } else if (operator === '~') {
        holds =
          compareVersions(target, bound) >= 0 && compareVersions(target, [bound[0], bound[1] + 1, 0]) < 0;
      } else {
        const ceiling = partialCeiling(raw);
        holds = ceiling
          ? compareVersions(target, bound) >= 0 && compareVersions(target, ceiling) < 0
          : compareVersions(target, bound) === 0;
      }
      if (!holds) break;
    }
    if (holds) return true;
  }
  return false;
}

test('[static] the installed worklets version satisfies the reanimated peer declaration', () => {
  // The comparator is pinned FIRST. A satisfiesRange() that answered true to
  // everything would make the real assertion below vacuous.
  for (const [version, range, expected] of [
    ['0.5.1', '0.5 - 0.8', true],
    ['0.4.9', '0.5 - 0.8', false],
    ['0.9.0', '0.5 - 0.8', false],
    ['0.81.5', '0.78 - 0.82', true],
    ['4.1.7', '^4.1.1', true],
    ['5.0.0', '^4.1.1', false],
    ['2.29.0', '~2.28.0', false],
    ['1.2.3', '*', true],
  ]) {
    assert.equal(satisfiesRange(version, range), expected, version + ' vs "' + range + '"');
  }

  const reanimated = manifestOf('react-native-reanimated');
  const worklets = manifestOf('react-native-worklets');
  const range = reanimated.peerDependencies?.['react-native-worklets'];

  if (typeof range !== 'string') {
    // CONTINUE-PATH, recorded rather than skipped: reanimated 4 moved its
    // worklets runtime into this package, so it must at minimum be installed.
    assert.ok(
      worklets.version,
      'react-native-worklets is not installed and reanimated 4 cannot run its worklets runtime without it'
    );
    return;
  }

  const satisfied = satisfiesRange(worklets.version, range);
  assert.notEqual(
    satisfied,
    null,
    'reanimated declares peer react-native-worklets "' + range + '" in a shape this fence cannot ' +
      'read — teach satisfiesRange() that form rather than deleting the check'
  );
  assert.ok(
    satisfied,
    'react-native-worklets ' + worklets.version + ' is installed but reanimated ' + reanimated.version +
      ' declares its peer as "' + range + '" — the worklets runtime and the library are out of step'
  );
});

test('[static] babel.config.js declares no reanimated or worklets plugin — the preset owns it', () => {
  const config = read('babel.config.js');

  // babel-preset-expo checks hasModule('react-native-worklets') and adds
  // 'react-native-worklets/plugin' itself, falling back to reanimated's own
  // when worklets is absent. Naming either by hand declares the same transform
  // twice. Asserted on the RAW source, comments included: a commented-out
  // entry is a line waiting to be uncommented back into a duplicate.
  assert.doesNotMatch(
    config,
    /react-native-(reanimated|worklets)\/plugin/,
    'babel.config.js names a reanimated or worklets Babel plugin. babel-preset-expo already adds it ' +
      'when the package is installed, so a manual entry is a duplicate transform — delete it, and do ' +
      'not swap in the other name'
  );

  // ANTI-VACUITY, both halves. The claim above is only true because the preset
  // is in use, and the file being read is actually the config.
  assert.match(
    config,
    /presets: \['babel-preset-expo'\]/,
    'the assertion above rests on babel-preset-expo being the preset that adds the worklets plugin'
  );
  // The second half used to be "babel.config.js still owns the dotenv
  // plugin", which was true only while a plugin list existed. react-native-
  // dotenv was removed when the app moved to EXPO_PUBLIC_ variables through
  // config/env.ts, leaving no plugin to anchor on and no prospect of one —
  // the whole point of the check above is that this file declares no plugins.
  // So the anchor moves to the OTHER premise the claim rests on: the preset
  // can only own the worklets transform if the package it looks for is
  // actually installed. With neither package present, "the preset owns it"
  // would be a statement about nothing.
  const deps = JSON.parse(read('package.json')).dependencies;
  assert.ok(
    deps['react-native-worklets'] || deps['react-native-reanimated'],
    'neither react-native-worklets nor react-native-reanimated is a dependency, so ' +
      'babel-preset-expo adds no worklets plugin and the assertion above is vacuous'
  );
  // And the removed plugin cannot come back quietly. An '@env' import is a
  // second configuration surface that config/env.ts exists to eliminate.
  assert.doesNotMatch(
    config,
    /react-native-dotenv/,
    'react-native-dotenv is back in babel.config.js — the app reads EXPO_PUBLIC_ ' +
      'variables through config/env.ts and must not regain a virtual @env module'
  );
});

// ===========================================================================
// THE WORKLET-CALLABILITY FENCE — 2026-08-24, and it exists because a green
// suite shipped a crash.
//
// The sibling-parity tests above hold each fast path to its fallback's
// contract, and the resolvability fence proves the packages can be bundled.
// Neither asks the question that took down CFBundleVersion 3: is every
// function CALLED inside a worklet body callable on the UI runtime? riseFor
// was not — imported into KeyboardRisingColumn.motion120's useAnimatedStyle
// callback without a 'worklet' directive — and no test could see it, because
// nothing here can render a worklet. The app aborted the moment ChatScreen
// mounted, on the first binary whose motionCapability.reanimated resolved
// true.
//
// So the property is checked STATICALLY, with the TypeScript parser the repo
// already carries as a devDependency: extract every worklet body, walk every
// call inside it, and classify the callee. Parsing, not pattern-matching —
// a prose mention of a hook in a docblock parses to nothing, and a directive
// hiding below another statement parses as the inert string it is.
//
// WORKLET BODIES are: function arguments (and function-valued properties of
// an object-literal argument) to the vendor APIs in WORKLET_TAKING_APIS,
// when that name is imported from a vendor package; callbacks on a
// Gesture.X() builder chain named in GESTURE_WORKLET_METHODS; and any
// function whose FIRST statement is the 'worklet' directive.
//
// A call inside one is fine if it is (a) a UI-runtime global on the explicit
// allowlist below, (b) a vendor API on the explicit allowlist below, (c)
// declared inside the worklet itself, or (d) a function that itself opens
// with the 'worklet' directive — resolved through same-file declarations or
// one hop through a relative import, by parsing the imported module. A call
// the checker cannot classify CONFIDENTLY is never flagged — a false
// positive teaches people to delete the fence — it is recorded by name and
// pinned at zero, so a new unclassifiable call fails the suite and forces a
// human look instead of vanishing.
// ===========================================================================

/** Vendor APIs whose function arguments run as worklets. Explicit and
 *  closed: an API absent here contributes no worklet bodies, so new
 *  reanimated usage extends this fence knowingly. The withX entries are for
 *  their optional completion callbacks. */
const WORKLET_TAKING_APIS = new Set([
  'useAnimatedStyle',
  'useDerivedValue',
  'useAnimatedReaction',
  'useAnimatedScrollHandler',
  'useAnimatedGestureHandler',
  'runOnUI',
  'withTiming',
  'withSpring',
  'withDecay',
]);

/** Gesture-builder callbacks, workletized when reanimated is present.
 *  Recognised only on a chain rooted at the `Gesture` object imported from
 *  react-native-gesture-handler, so a lookalike method on any other object
 *  cannot produce a false positive. */
const GESTURE_WORKLET_METHODS = new Set([
  'onBegin', 'onStart', 'onUpdate', 'onChange', 'onEnd', 'onFinalize',
  'onTouchesDown', 'onTouchesMove', 'onTouchesUp', 'onTouchesCancelled',
]);

/** (a) UI-runtime globals — Hermes builtins that exist on the worklet
 *  runtime. Explicit and closed: anything else is unresolved, not ignored. */
const UI_RUNTIME_GLOBAL_OBJECTS = new Set([
  'Math', 'Number', 'Object', 'JSON', 'Array', 'String', 'Boolean', 'Date',
  'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol',
  'Reflect', 'console', 'globalThis',
]);
const UI_RUNTIME_GLOBAL_FUNCTIONS = new Set([
  'isNaN', 'isFinite', 'parseInt', 'parseFloat',
  'String', 'Number', 'Boolean', 'Array',
]);

/** (b) vendor APIs callable from inside a worklet. Explicit and closed: a
 *  vendor import called in a worklet that is not on this list counts as
 *  unresolved rather than fine, so it cannot pass silently. */
const UI_CALLABLE_VENDOR_APIS = new Set([
  'withTiming', 'withSpring', 'withDecay', 'withDelay', 'withSequence',
  'withRepeat', 'withClamp', 'cancelAnimation', 'interpolate',
  'interpolateColor', 'clamp', 'runOnJS', 'scheduleOnRN', 'runOnUI',
  'measure', 'scrollTo',
]);

const WORKLET_VENDOR_MODULES = new Set([...VENDOR_PACKAGES, 'react-native-worklets']);

const scriptKindFor = (path) => (path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const unwrapExpression = (node) => {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
};

const isFunctionNode = (node) =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node) ||
  ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node);

/** True only when 'worklet' is the FIRST statement of a block body — the one
 *  position in which it is a directive rather than an inert string. A concise
 *  arrow has nowhere to carry one and is correctly false. */
const hasWorkletDirective = (fn) => {
  if (!fn.body || !ts.isBlock(fn.body)) return false;
  const first = fn.body.statements[0];
  return (
    !!first && ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) && first.expression.text === 'worklet'
  );
};

const bindingNames = (name, into) => {
  if (ts.isIdentifier(name)) into.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) bindingNames(element.name, into);
    }
  }
};

/** All directive verdicts over a candidate set: every candidate marked → a
 *  worklet; none marked → not one; mixed or empty → no confident answer. */
const directiveVerdict = (candidates) => {
  if (!candidates || candidates.length === 0) return null;
  const marked = candidates.filter((fn) => hasWorkletDirective(fn)).length;
  if (marked === candidates.length) return true;
  if (marked === 0) return false;
  return null;
};

/** Function declarations (and function-valued consts) named `wanted` in a
 *  parsed module — the resolver behind both same-file and imported calls. */
const functionCandidatesIn = (sourceFile, wanted) => {
  const candidates = [];
  const collect = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === wanted) candidates.push(node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === wanted && node.initializer) {
      const init = unwrapExpression(node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) candidates.push(init);
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  return candidates;
};

/**
 * The checker. Parses one file, extracts its worklet bodies, and classifies
 * every call inside them. `loadModule(fromPath, spec)` supplies imported
 * relative modules as `{ path, source }` or null — injectable, so the
 * anti-vacuity fixtures below can plant a defect without touching disk.
 * Returns { bodies, violations, unresolved }.
 */
function checkWorkletCalls(filePath, source, loadModule) {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKindFor(filePath));

  const imports = new Map();
  const namespaceImports = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const module = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) imports.set(clause.name.text, { module, imported: 'default' });
    if (clause.namedBindings) {
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imports.set(element.name.text, { module, imported: (element.propertyName ?? element.name).text });
        }
      } else if (ts.isNamespaceImport(clause.namedBindings)) {
        namespaceImports.set(clause.namedBindings.name.text, module);
      }
    }
  }
  const isVendorImport = (name) =>
    imports.has(name) && WORKLET_VENDOR_MODULES.has(imports.get(name).module);

  // Every named function in the file, all candidates kept: a name declared
  // twice passes only if EVERY candidate carries the directive.
  const fileFunctions = new Map();
  const collectFunctions = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      if (!fileFunctions.has(node.name.text)) fileFunctions.set(node.name.text, []);
      fileFunctions.get(node.name.text).push(node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = unwrapExpression(node.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        if (!fileFunctions.has(node.name.text)) fileFunctions.set(node.name.text, []);
        fileFunctions.get(node.name.text).push(init);
      }
    }
    ts.forEachChild(node, collectFunctions);
  };
  collectFunctions(sf);

  const chainRoot = (expr) => {
    let node = unwrapExpression(expr);
    while (
      ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
    ) {
      node = unwrapExpression(node.expression);
    }
    return node;
  };

  const functionArgsOf = (call) => {
    const found = [];
    for (const arg of call.arguments ?? []) {
      const value = unwrapExpression(arg);
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) found.push(value);
      else if (ts.isObjectLiteralExpression(value)) {
        for (const prop of value.properties) {
          if (ts.isPropertyAssignment(prop)) {
            const inner = unwrapExpression(prop.initializer);
            if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) found.push(inner);
          } else if (ts.isMethodDeclaration(prop)) {
            found.push(prop);
          }
        }
      }
    }
    return found;
  };

  const bodies = new Set();
  const findBodies = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrapExpression(node.expression);
      if (ts.isIdentifier(callee) && WORKLET_TAKING_APIS.has(callee.text) && isVendorImport(callee.text)) {
        for (const fn of functionArgsOf(node)) bodies.add(fn);
      }
      if (ts.isPropertyAccessExpression(callee) && GESTURE_WORKLET_METHODS.has(callee.name.text)) {
        const root = chainRoot(callee.expression);
        if (
          ts.isIdentifier(root) && root.text === 'Gesture' &&
          imports.get('Gesture')?.module === 'react-native-gesture-handler'
        ) {
          for (const fn of functionArgsOf(node)) bodies.add(fn);
        }
      }
    }
    if (isFunctionNode(node) && hasWorkletDirective(node)) bodies.add(node);
    ts.forEachChild(node, findBodies);
  };
  findBodies(sf);

  const violations = [];
  const unresolved = [];

  const importedDirectiveVerdict = (entry) => {
    if (!entry.module.startsWith('.')) return null;
    const target = loadModule(filePath, entry.module);
    if (!target) return null;
    const targetSf = ts.createSourceFile(
      target.path, target.source, ts.ScriptTarget.Latest, true, scriptKindFor(target.path)
    );
    return directiveVerdict(functionCandidatesIn(targetSf, entry.imported));
  };

  for (const body of bodies) {
    // Names declared inside this worklet: params, variables, functions and
    // catch bindings — including inside nested plain functions, which run on
    // the UI thread with it. A nested node that is itself a counted body is
    // walked as its own worklet, not twice.
    const locals = new Set();
    const collectLocals = (node) => {
      if (node !== body && bodies.has(node)) return;
      if (isFunctionNode(node)) {
        for (const parameter of node.parameters) bindingNames(parameter.name, locals);
        if (node !== body && ts.isFunctionDeclaration(node) && node.name) locals.add(node.name.text);
      }
      if (ts.isVariableDeclaration(node)) bindingNames(node.name, locals);
      if (ts.isCatchClause(node) && node.variableDeclaration) bindingNames(node.variableDeclaration.name, locals);
      ts.forEachChild(node, collectLocals);
    };
    collectLocals(body);

    const classifyCall = (call) => {
      const isNew = ts.isNewExpression(call);
      const callee = unwrapExpression(call.expression);

      if (ts.isIdentifier(callee)) {
        const name = callee.text;
        if (locals.has(name)) return; // (c) declared inside the worklet
        if (imports.has(name)) {
          const entry = imports.get(name);
          if (WORKLET_VENDOR_MODULES.has(entry.module)) {
            if (UI_CALLABLE_VENDOR_APIS.has(name)) return; // (b)
            unresolved.push(`${filePath}: '${name}' (from ${entry.module}) is not on the UI-callable vendor allowlist`);
            return;
          }
          const verdict = importedDirectiveVerdict(entry);
          if (verdict === true) return; // an imported worklet
          if (verdict === false) {
            violations.push(
              `${filePath}: '${name}' (imported from '${entry.module}') is called inside a worklet body ` +
                "but does not open with the 'worklet' directive"
            );
            return;
          }
          unresolved.push(`${filePath}: '${name}' (imported from '${entry.module}') could not be resolved to a declaration`);
          return;
        }
        const inFile = directiveVerdict(fileFunctions.get(name));
        if (inFile === true) return; // a same-file worklet
        if (inFile === false) {
          violations.push(
            `${filePath}: '${name}' (declared in this file) is called inside a worklet body ` +
              "but does not open with the 'worklet' directive"
          );
          return;
        }
        if (UI_RUNTIME_GLOBAL_FUNCTIONS.has(name)) return; // (a)
        if (isNew && UI_RUNTIME_GLOBAL_OBJECTS.has(name)) return; // (a) new Date(), new Error(), ...
        unresolved.push(`${filePath}: '${name}' could not be classified`);
        return;
      }

      if (ts.isPropertyAccessExpression(callee)) {
        const root = chainRoot(callee.expression);
        if (ts.isIdentifier(root)) {
          const rootName = root.text;
          // A method on a value the worklet declared or was handed as a
          // parameter: prototype methods travel with the value on any runtime.
          if (locals.has(rootName)) return;
          if (namespaceImports.has(rootName)) {
            if (
              WORKLET_VENDOR_MODULES.has(namespaceImports.get(rootName)) &&
              UI_CALLABLE_VENDOR_APIS.has(callee.name.text)
            ) {
              return; // (b) e.g. Reanimated.withSpring via a namespace import
            }
            unresolved.push(`${filePath}: '${rootName}.${callee.name.text}' is not on the UI-callable vendor allowlist`);
            return;
          }
          if (!imports.has(rootName) && !fileFunctions.has(rootName) && UI_RUNTIME_GLOBAL_OBJECTS.has(rootName)) {
            return; // (a) e.g. Math.max — unshadowed global object
          }
          unresolved.push(`${filePath}: '${rootName}.${callee.name.text}' — receiver could not be classified`);
          return;
        }
        if (
          ts.isArrayLiteralExpression(root) || ts.isObjectLiteralExpression(root) ||
          ts.isStringLiteral(root) || ts.isNoSubstitutionTemplateLiteral(root) ||
          ts.isTemplateExpression(root) || ts.isNumericLiteral(root)
        ) {
          return; // (a) a literal owns its prototype methods on any runtime
        }
        unresolved.push(`${filePath}: a computed method call could not be classified`);
        return;
      }

      if (ts.isCallExpression(callee)) {
        const inner = unwrapExpression(callee.expression);
        if (
          ts.isIdentifier(inner) &&
          (inner.text === 'runOnJS' || inner.text === 'scheduleOnRN') &&
          isVendorImport(inner.text)
        ) {
          return; // (b) runOnJS(fn)(args) — the JS hop, not a UI-thread call of fn
        }
        unresolved.push(`${filePath}: a curried call could not be classified`);
        return;
      }

      unresolved.push(`${filePath}: a call through ${ts.SyntaxKind[call.expression.kind]} could not be classified`);
    };

    const walkCalls = (node) => {
      if (node !== body && bodies.has(node)) return;
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) classifyCall(node);
      ts.forEachChild(node, walkCalls);
    };
    walkCalls(body);
  }

  return { bodies: bodies.size, violations, unresolved };
}

/** Disk-backed module loader for the real tree: Metro-style bare, .ts, .tsx
 *  and index resolution, one relative hop from the importing file. */
function loadRelativeModule(fromPath, spec) {
  const base = join(dirname(fromPath), spec).replace(/\\/g, '/');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    try {
      return { path: candidate, source: read(candidate) };
    } catch {
      // not this shape — try the next
    }
  }
  return null;
}

test('[static] the worklet-callability checker detects a planted violation — and does not invent one', () => {
  // ANTI-VACUITY IS THE POINT OF THIS TEST. A checker that answers "no
  // violations" over a fixture that CONTAINS one converts a live crash class
  // into a green line, which is exactly how CFBundleVersion 3 shipped. So the
  // defect is planted twice and must be found both times:
  //   - plainRise: an imported function with no directive at all — riseFor's
  //     defect, reconstructed;
  //   - lateDirective: 'worklet' present but BELOW another statement, where
  //     it is an inert string — position is part of the property.
  // And the clean calls beside them must NOT be flagged, because a fence that
  // cries wolf gets deleted: a directive-carrying import, a UI global, a
  // local helper, and an allowlisted vendor API all classify as fine.
  const fixtureShared = [
    'export function plainRise(height) {',
    '  return height * 2;',
    '}',
    'export function workletRise(height) {',
    "  'worklet';",
    '  return height * 2;',
    '}',
    'export function lateDirective(height) {',
    '  const h = height;',
    "  'worklet';",
    '  return h;',
    '}',
  ].join('\n');
  const fixture = [
    "import { useAnimatedStyle, withSpring } from 'react-native-reanimated';",
    "import { Gesture } from 'react-native-gesture-handler';",
    "import { plainRise, workletRise, lateDirective } from './Fixture.shared';",
    'export function Broken() {',
    '  return useAnimatedStyle(() => ({ transform: [{ translateY: plainRise(1) }] }));',
    '}',
    'export function AlsoBroken() {',
    '  return Gesture.Pan().onUpdate(() => { lateDirective(2); });',
    '}',
    'export function Fine() {',
    '  return useAnimatedStyle(() => {',
    '    const double = (value) => value * 2;',
    '    return { opacity: double(workletRise(Math.max(0, withSpring(1)))) };',
    '  });',
    '}',
  ].join('\n');
  const loadFixtureModule = (fromPath, spec) =>
    spec === './Fixture.shared' ? { path: 'components/Fixture.shared.tsx', source: fixtureShared } : null;

  const result = checkWorkletCalls('components/Fixture.motion120.tsx', fixture, loadFixtureModule);
  assert.equal(result.bodies, 3, 'three worklet bodies are planted: two hook callbacks and one gesture callback');
  assert.equal(
    result.violations.length,
    2,
    `exactly the two planted defects must be flagged (saw ${JSON.stringify(result.violations)})`
  );
  assert.match(result.violations[0], /'plainRise'/, 'the missing directive must be caught');
  assert.match(result.violations[1], /'lateDirective'/, 'a directive below another statement must read as absent');
  assert.deepEqual(result.unresolved, [], 'the clean calls must classify, not pile into unresolved');

  // The unresolved channel is REAL: an identifier from nowhere is recorded by
  // name — and still never flagged as a violation, because a checker that
  // guesses produces false positives and false positives kill fences.
  const murky = [
    "import { useAnimatedStyle } from 'react-native-reanimated';",
    'export function Murky() {',
    '  return useAnimatedStyle(() => ({ width: mysteryFn(1) }));',
    '}',
  ].join('\n');
  const murkyResult = checkWorkletCalls('components/Murky.motion120.tsx', murky, () => null);
  assert.deepEqual(murkyResult.violations, [], 'an unclassifiable call is unresolved, never a violation');
  assert.equal(murkyResult.unresolved.length, 1, 'the unclassifiable call must be counted');
  assert.match(murkyResult.unresolved[0], /mysteryFn/, 'unresolved entries carry the name a human needs');
});

test('[static] every call inside every worklet body is worklet-callable', () => {
  // THE REAL TREE, held to the property CFBundleVersion 3 lacked. The roster
  // is pinned rather than discovered-and-trusted: a new fast path must enter
  // this fence consciously, by failing this line and being added.
  const fastPaths = appSources().filter((path) => FAST_PATH.test(path)).sort();
  assert.deepEqual(
    fastPaths,
    [
      'components/DropMenu.motion120.tsx',
      'components/KeyboardRisingColumn.motion120.tsx',
      // 2026-09-21 — the mode switch's glass wipe, the operator's pick from
      // six rendered ideas; two shared values (the pane's translateX, the
      // capsule's translateY), each ending in a runOnJS hop to the sequence.
      'components/ModeTransitionOverlay.motion120.tsx',
      'components/PeekSheet.motion120.tsx',
      'components/SuccessMark.motion120.tsx',
      'components/SwipeableRow.motion120.tsx',
    ],
    'the fast-path roster changed — bring the new sibling into this fence deliberately'
  );

  // Parse every app source that could hold a worklet body. The prefilter can
  // only over-include (a prose mention parses to zero bodies); it cannot
  // exclude a real one, which necessarily contains one of these names or the
  // directive itself.
  const couldHoldWorklets =
    /'worklet'|useAnimatedStyle|useDerivedValue|useAnimatedReaction|useAnimatedScrollHandler|useAnimatedGestureHandler|runOnUI|Gesture\./;
  const bodiesByFile = new Map();
  const violations = [];
  const unresolved = [];
  for (const path of appSources()) {
    const source = read(path);
    if (!couldHoldWorklets.test(source)) continue;
    const result = checkWorkletCalls(path, source, loadRelativeModule);
    bodiesByFile.set(path, result.bodies);
    violations.push(...result.violations);
    unresolved.push(...result.unresolved);
  }

  // ANTI-VACUITY on the real tree: every fast path must yield at least one
  // extracted worklet body, and riseFor's directive body must be seen where
  // it lives — an extractor gone blind would report "no violations" about
  // nothing at all.
  for (const path of fastPaths) {
    assert.ok(
      (bodiesByFile.get(path) ?? 0) >= 1,
      `${path} is a fast path with no extracted worklet body — the extractor is not seeing it`
    );
  }
  assert.ok(
    (bodiesByFile.get('components/KeyboardRisingColumn.shared.tsx') ?? 0) >= 1,
    "riseFor's 'worklet' directive body must be extracted from the shared module"
  );

  assert.deepEqual(
    violations,
    [],
    'a non-worklet function is called inside a worklet body — the class that SIGABRTed CFBundleVersion 3. ' +
      "Add the 'worklet' directive at the SOURCE function; never inline a copy of its body"
  );

  // Pinned at ZERO unresolved. When a call the checker cannot classify
  // appears, this fails by name and a human decides: extend an allowlist
  // knowingly, resolve it properly, or record it here — never silence.
  assert.deepEqual(
    unresolved,
    [],
    'a call inside a worklet body could not be classified — decide what it is; do not let it pass unexamined'
  );
});

// ---------------------------------------------------------------------------
// THE FILTER SLIDER — 2026-08-24 to 2026-09-19. Built, then retired: the
// map's slider sheet became the approved Filters sheet (components/
// JobFilterSheet.tsx — pills, Custom lists, a checkmark popup), and the
// slider's three files went with it, along with the fences that held its two
// drivers to one arithmetic. Nothing may draw one now: the operator ruled
// the Custom lists over a drag, and a slider with no caller is dead code.
// ---------------------------------------------------------------------------
test('[static] the filter slider is retired and nothing draws one', () => {
  for (const path of appSources()) {
    assert.doesNotMatch(read(path), /FilterSlider/, `${path} still names the retired slider`);
  }
  for (const file of ['components/FilterSlider.tsx', 'components/FilterSlider.shared.tsx', 'components/FilterSlider.motion120.tsx']) {
    assert.equal(readableBytes(join(root, file)), null, `${file} was retired on 2026-09-19 and must not return`);
  }
});
