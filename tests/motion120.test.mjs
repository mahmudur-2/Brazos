import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
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
  // The clearance is applied on the SAME view that rises, in both paths, or
  // the two binaries lay out differently.
  const fast = stripComments(read('components/KeyboardRisingColumn.motion120.tsx'));
  for (const [path, source] of [['fallback', column], ['motion120', fast]]) {
    assert.match(
      source,
      /\{ paddingBottom: insetBelow \}/,
      `the ${path} path must carry the clearance on the rising view`,
    );
  }
  // ONE rise arithmetic, shared. A column that stopped at a different height
  // on one binary than the other is the drift the boundary exists to prevent.
  assert.match(
    stripComments(read('components/KeyboardRisingColumn.shared.tsx')),
    /return Math\.max\(0, keyboardHeight - insetBelow\);/,
  );
  assert.match(fast, /riseFor\(keyboard\.height\.value, insetBelow\)/);
  assert.match(fast, /useAnimatedKeyboard\(\)/, 'the fast path tracks the keyboard, it does not imitate it');
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
      'HIDDEN_CHATS', 'LIVE_LOCATION', 'MARK_UNREAD', 'READ_TICKS',
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
  for (const [, name, value] of flags) {
    assert.equal(value, 'false', `${name} is live — flip it here only once its dependency has landed`);
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
  // Both are still false and still blocked on schema that does not exist, so
  // the fix is not to wire them — wiring READ_TICKS today would light gold on
  // a pair's direct-thread bubbles and never on their job-thread ones, in the
  // SAME conversation, which is worse than not offering it. The fix is that
  // the table stops implying a switch it does not have.
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
  assert.ok(gated >= 8, `most flags do gate something (saw ${gated})`);
  assert.equal(declared, 2, `exactly the two tick flags gate nothing today (saw ${declared})`);
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
    needs: 'reanimated',
  },
];

test('[executed] every sibling is taken when its native is present and skipped when it is absent', () => {
  // THE DECISION, run both ways, for each surface.
  for (const { name, needs } of SIBLINGS) {
    const present = { reanimated: true, gestures: true };
    const absent = { reanimated: false, gestures: false };

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

test('[static] the swipe surface needs BOTH natives, which is what consumes canWorklet', () => {
  // AUDIT F3. `canWorklet` was exported and read by nothing, which made it a
  // claim rather than a check. The swipe row is where it belongs: a build with
  // a recogniser but no worklets could swipe, and would swipe BADLY — a JS
  // round trip per frame under exactly the load a list scroll produces —
  // which is worse than not offering the mechanic.
  const row = stripComments(read('components/SwipeableRow.tsx'));
  assert.match(row, /import \{ canSwipe, canWorklet, resolveMotion120 \}/);
  assert.match(
    row,
    /\{ gestures: canSwipe\(\) && canWorklet\(\), reanimated: canWorklet\(\) \}/,
    'the swipe needs a recogniser AND worklets; either false takes the fallback'
  );

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
  assert.match(
    config,
    /'module:react-native-dotenv'/,
    'babel.config.js still owns the dotenv plugin — an empty plugin list would pass the check above'
  );
});
