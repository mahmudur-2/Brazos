import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * THE MODE SWITCH — the glass wipe carrying the capsule (2026-09-21, the
 * operator's pick from six rendered ideas; DECISIONS that date).
 *
 * What these fences hold: the choreography is written ONCE (the shared
 * module's `runSequence` owns every timer; neither driver keeps a clock of its
 * own), the tree swaps under full cover and only once, the reveal waits for
 * the incoming tree's own layout signal with a fail-safe rather than on a
 * timer, ModeShell mounts that signal keyed by the tree, and the retired
 * artwork sheets are required by nothing.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

const base = stripComments(read('components/ModeTransitionOverlay.tsx'));
const fast = stripComments(read('components/ModeTransitionOverlay.motion120.tsx'));
const shared = stripComments(read('components/ModeTransitionOverlay.shared.tsx'));
const shell = stripComments(read('navigation/ModeShell.tsx'));

test('[static] the choreography is written once: only runSequence keeps time', () => {
  assert.match(shared, /export function runSequence\(/);
  assert.doesNotMatch(base, /setTimeout\(/, 'the base file must not keep its own clock');
  assert.doesNotMatch(fast, /setTimeout\(/, 'the fast path must not keep its own clock');
  assert.match(base, /runSequence\(props, \{/);
  assert.match(fast, /runSequence\(props, \{/);
  // Every number the eye can catch is a named constant in the shared module.
  for (const name of ['PANE_IN_MS', 'PANE_OUT_MS', 'REVEAL_FAILSAFE_MS', 'CAPSULE_DELAY_MS', 'CAPSULE_HOLD_UNTIL_MS', 'RUN_FAILSAFE_MS']) {
    assert.match(shared, new RegExp(`export const ${name} = `), `${name} must be a named constant`);
  }
});

test('[static] the tree swaps under full cover, once, with the layout waiter armed first', () => {
  const paneIn = shared.match(/motions\.paneIn\(\(\) => \{([\s\S]*?)\n  \}\);/);
  assert.ok(paneIn, 'the swap must live in the cover callback');
  const body = paneIn[1];
  const armed = body.indexOf('props.waitForTreeLaidOut()');
  const swapped = body.indexOf('runSwitch()');
  assert.ok(armed >= 0 && swapped >= 0, 'the cover callback arms the waiter and runs the switch');
  assert.ok(armed < swapped, 'the waiter must be armed BEFORE the swap, so the incoming tree cannot lay out unobserved');
  assert.match(shared, /if \(switched\) return;\s*switched = true;\s*props\.onSwitch\(\);/, 'onSwitch fires once');
  // The reveal is gated on the signal or the fail-safe, never on a bare timer.
  assert.match(body, /Promise\.race\(\[laidOut, failsafe\]\)/);
  assert.match(body, /at\(REVEAL_FAILSAFE_MS, resolve\)/);
  assert.match(body, /requestAnimationFrame\(\(\) => motions\.paneOut\(reveal\)\)/, 'one frame after layout, then the pane leaves');
});

test('[static] ModeShell mounts the paint signal inside the painted tree, keyed by the tree', () => {
  assert.match(shell, /import \{ ModeTreeLayoutSignal \} from '\.\.\/components\/ModeTransitionOverlay';/);
  assert.match(
    shell.replace(/\s+/g, ' '),
    // (the stripped JSX comment between them leaves an empty `{ }`)
    /\{treeMode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>\} (\{\} )?<ModeTreeLayoutSignal key=\{treeMode\} \/> <\/View>/,
    'the signal sits beside the tree, keyed by treeMode, inside the View that paints the ground'
  );
  assert.match(base, /export function ModeTreeLayoutSignal\(\)/);
  assert.match(base, /onLayout=\{markTreeLaidOut\}/);
});

test('[static] the provider is the one owner, and busy ends when the pane has left', () => {
  const provider = stripComments(read('modes/ModeProvider.tsx'));
  assert.match(provider, /const \{ start: startTransition, busy \} = useModeTransition\(\);/);
  assert.match(base, /const onRevealed = useCallback\(\(\) => \{\s*runningRef\.current = false;\s*setBusy\(false\);/);
  assert.match(base, /const onFinished = useCallback\(\(\) => \{[\s\S]*?setRequest\(null\);/);
});

test('[static] the drivers move transform and opacity only, and reduced motion moves nothing', () => {
  // The two moving properties, nothing else animated.
  assert.match(fast, /transform: \[\{ translateX: paneX\.value \}\]/);
  assert.match(fast, /transform: \[\{ translateY: capsuleY\.value \}\]/);
  assert.doesNotMatch(fast, /blurRadius|shadowOpacity: [a-z]|borderRadius: [a-z]/);
  assert.match(base, /useNativeDriver: USE_NATIVE_DRIVER/);
  const reduced = base.match(/function ReducedRun\(props: ModeTransitionRunProps\) \{([\s\S]*?)\n\}/);
  assert.ok(reduced, 'the reduced-motion run exists');
  assert.doesNotMatch(reduced[1], /translate[XY]/, 'reduced motion fades; it never travels');
  assert.match(base, /if \(reducedMotion === null\) return null;/, 'no run starts on an unknown reduced-motion answer');
});

test('[static] the artwork sheets are retired: required by nothing, their module gone', () => {
  assert.ok(!existsSync(join(root, 'components/modeTransitionAssets.ts')));
  for (const file of ['components/ModeTransitionOverlay.tsx', 'components/ModeTransitionOverlay.motion120.tsx', 'components/ModeTransitionOverlay.shared.tsx']) {
    assert.doesNotMatch(stripComments(read(file)), /transition-(worker|customer)\.png|<Image\b/);
  }
  // The capsule's word is the mode's own label, spelled once here and once in modes/types.
  assert.match(shared, /return destination === 'worker' \? 'Worker' : 'Customer';/);
  assert.match(stripComments(read('modes/types.ts')), /return mode === 'worker' \? 'Worker' : 'Customer';/);
});
