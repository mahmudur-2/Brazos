// 2026-09-30 (the build run, docs/dispatch/MELT-TAB-BAR.md) — THE MELT-THROUGH TAB BAR.
//
// The bar's arithmetic is pure (lib/meltBarGeometry.ts), so this file EXECUTES it with the
// numbers ui/tokens.ts's `meltBar` block carries — read from the source, so the fence and the tokens
// cannot drift — and then reads the bar's wiring statically.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const geo = await import('../lib/meltBarGeometry.ts');

// The `meltBar` block, as numbers.
const tokens = read('ui/tokens.ts');
const block = tokens.slice(tokens.indexOf('export const meltBar = {'));
const num = (key) => {
  const m = block.match(new RegExp(`\\b${key}: (-?[\\d.]+)`));
  assert.ok(m, `meltBar.${key} must be a number in ui/tokens.ts`);
  return Number(m[1]);
};
const fillet = (() => {
  const m = block.match(/fillet: \{ chain: (\d+), plus: (\d+), over: (\d+) \}/);
  assert.ok(m, 'meltBar.fillet must carry chain, plus and over');
  return { chain: Number(m[1]), plus: Number(m[2]), over: Number(m[3]) };
})();
const bubble = (() => {
  const m = block.match(/bubble: \[(\d+), (\d+), (\d+)\]/);
  assert.ok(m, 'meltBar.bubble must list the three circles');
  return [Number(m[1]), Number(m[2]), Number(m[3])];
})();
const kicks = { join: num('plusJoinKick'), snap: num('plusSnapKick') };
const plusR = num('plus') / 2;

test('[executed] the five slots of a 361pt pill centre where the handoff page puts them', () => {
  const width = 393 - 2 * num('sideInset');
  assert.equal(width, 361);
  const centres = geo.slotCentres(width, 5);
  const expected = [36.1, 108.3, 180.5, 252.7, 324.9];
  centres.forEach((c, i) => assert.ok(Math.abs(c - expected[i]) < 1e-9, `slot ${i} at ${c}, not ${expected[i]}`));
});

test('[executed] the pill sits 24pt up on a 34pt inset, and content clears 96pt', () => {
  const m = { height: num('height'), bottomTuck: num('bottomTuck'), bottomMin: num('bottomMin'), breathing: num('breathing') };
  assert.equal(geo.pillBottomOffset(34, m.bottomTuck, m.bottomMin), 24);
  assert.equal(geo.pillBottomOffset(0, m.bottomTuck, m.bottomMin), 12);
  assert.equal(geo.pillFootprint(34, m), 96);
  assert.equal(geo.pillFootprint(0, m), 84);
});

test('[executed] D13: the fade behind the bar starts at the line content clears and is solid from the pill centre', () => {
  const m = { height: num('height'), bottomTuck: num('bottomTuck'), bottomMin: num('bottomMin'), breathing: num('breathing') };
  for (const inset of [34, 0]) {
    const fade = geo.underBarFade(inset, m);
    // Its clear top edge is exactly where a list's last row stops, so a list scrolled to its end is never washed.
    assert.equal(fade.height, geo.pillFootprint(inset, m));
    // Solid from the pill's centre line: from the strip's top, the breathing room plus half the pill.
    const solidFromTop = (fade.solidAt / 100) * fade.height;
    assert.ok(Math.abs(solidFromTop - (m.breathing + m.height / 2)) < 0.1, `solid ${solidFromTop}pt down on a ${inset}pt inset`);
  }
  assert.deepEqual(geo.underBarFade(34, m), { height: 96, solidAt: 41.7 });
});

test('[executed] the + joint joins at contact and pinches shut between a 15 and a 19pt gap', () => {
  // The moving bubble leaving the +: its trailing 36pt circle is the end facing it.
  const tail = bubble[2] / 2;
  const plusX = 180.5;
  let joined = false;
  let joinedAt = null;
  // Coming in.
  for (let gap = 20; gap >= -2; gap -= 0.25) {
    const neck = geo.neckShape(plusX, plusR, plusX + plusR + tail + gap, tail, geo.plusFillet(gap, joined, fillet, num('plusReach'), num('plusOverlap')));
    const step = geo.stepPlusJoin(joined, gap, neck, kicks);
    if (step.joined && !joined) {
      joinedAt = gap;
      assert.equal(step.kick, kicks.join);
    }
    joined = step.joined;
  }
  assert.ok(joinedAt !== null && joinedAt < 0.5 && joinedAt >= 0, `joined at ${joinedAt}, not at contact`);
  // Going away.
  let snappedAt = null;
  for (let gap = 0; gap <= 30; gap += 0.25) {
    const neck = geo.neckShape(plusX, plusR, plusX + plusR + tail + gap, tail, geo.plusFillet(gap, joined, fillet, num('plusReach'), num('plusOverlap')));
    const step = geo.stepPlusJoin(joined, gap, neck, kicks);
    if (!step.joined && joined) {
      snappedAt = gap;
      assert.equal(step.kick, kicks.snap);
    }
    joined = step.joined;
    if (!joined) break;
  }
  assert.ok(snappedAt !== null && snappedAt >= 15 && snappedAt <= 19, `snapped at ${snappedAt}`);
});

test('[executed] no neck for nested circles, and none without a fillet', () => {
  assert.equal(geo.neckShape(100, 27, 103, 18, fillet.chain), null);
  assert.equal(geo.neckShape(100, 27, 150, 18, 0), null);
  assert.ok(geo.neckShape(100, 27, 140, 22.5, fillet.chain), 'two circles apart on the line must join');
});

test('[executed] the facing-end rule never picks a circle tucked inside the lead', () => {
  const lead = { x: 100, r: bubble[0] / 2 };
  const nestedMid = { x: 102, r: bubble[1] / 2 };
  const nestedTail = { x: 109, r: bubble[2] / 2 };
  assert.equal(geo.facingCircle([lead, nestedMid, nestedTail], 200), lead);
  assert.equal(geo.facingCircle([lead, nestedMid, nestedTail], 0), lead);
  // A trailing circle that reaches further toward the + is the end that joins it.
  const trailingTail = { x: 60, r: bubble[2] / 2 };
  assert.equal(geo.facingCircle([lead, { x: 80, r: bubble[1] / 2 }, trailingTail], 0), trailingTail);
  // The + between the circles' centres: the bubble's own shape carries it, no + joint.
  assert.equal(geo.facingCircle([lead, { x: 150, r: 22.5 }, { x: 180, r: 18 }], 160), null);
});

test('[executed] the stretch is capped and the integrator settles on its target', () => {
  assert.equal(geo.stretchOf(0, num('stretchVelocity'), num('stretchMax')), 0);
  assert.equal(geo.stretchOf(99999, num('stretchVelocity'), num('stretchMax')), num('stretchMax'));
  let x = 0;
  let v = 0;
  for (let i = 0; i < 240; i++) [x, v] = geo.springStep(x, v, 100, 640, 40, 1 / 120, num('substep'));
  assert.ok(Math.abs(x - 100) < 0.01 && Math.abs(v) < 0.1, `settled at ${x}, v ${v}`);
});

test('[static] both trees draw the melt bar, the + opens the same sheet, and hidden routes stay registered', () => {
  const customer = stripComments(read('navigation/CustomerRoot.tsx'));
  const worker = stripComments(read('navigation/WorkerRoot.tsx'));
  assert.match(customer, /tabBar=\{\(props\) => \(\s*<MeltTabBar[\s\S]*?tabs=\{CUSTOMER_BAR_TABS\}[\s\S]*?onCreate=\{\(\) => setCreateOpen\(true\)\}/);
  assert.match(worker, /tabBar=\{\(props\) => <MeltTabBar \{\.\.\.props\} tabs=\{WORKER_BAR_TABS\} \/>\}/);
  assert.ok(!/CenterCreateButton/.test(customer), 'the old centre control is retired');
  for (const hidden of ['Map', 'MyJobs']) {
    assert.match(customer, new RegExp(`name="${hidden}"`), `${hidden} stays registered on the customer tree`);
  }
  // The bar emits tabPress the library's way, so haptics and re-press-to-pop keep working.
  const shared = stripComments(read('components/MeltTabBar.shared.tsx'));
  assert.match(shared, /type: 'tabPress'[\s\S]*canPreventDefault: true/);
  assert.match(shared, /!focused && !event\.defaultPrevented/);
  assert.ok(!/navigate\('Create'/.test(shared), 'Create is an action, never a destination');
});

test('[static] a tap is the platform\'s own press, a drag is a Pan, and nothing stays held (the operator\'s report, 2026-09-30)', () => {
  const flat = (source) => stripComments(source).replace(/\s+/g, ' ');
  const shared = flat(read('components/MeltTabBar.shared.tsx'));
  const fast = flat(read('components/MeltTabBar.motion120.tsx'));
  // Every tab and the + is a Pressable on both paths: a tap never depends on the Pan's release.
  assert.doesNotMatch(shared, /onAccessibilityTap|pressable \?/, 'no touch-less stand-ins for the buttons');
  assert.match(shared, /<Pressable key=\{slot\.key\} \{\.\.\.a11y\} style=\{\[styles\.touch, place\]\} onPressIn=\{onTabPressIn \? \(\) => onTabPressIn\(i\) : undefined\} onPressOut=\{onTabPressOut \? \(\) => onTabPressOut\(i\) : undefined\} onPress=\{\(\) => onTab\(slot\.key, i\)\} >/);
  assert.match(fast, /<MeltTouchLayer slots=\{slots\} centres=\{centres\} focused=\{focused\} onTab=\{onTab\} onTabPressIn=\{onTabPressIn\} onTabPressOut=\{onTabPressOut\} onCreate=\{onCreate\} onCreatePressIn=\{onCreatePressIn\} onCreatePressOut=\{onCreatePressOut\} \/>/);
  // The Pan only drags: it activates after sideways travel, gives way to a vertical move, and reads
  // no tap off a failed state.
  assert.match(fast, /Gesture\.Pan\(\) \.activeOffsetX\(\[-SLOP, SLOP\]\) \.failOffsetY\(\[-DRAG_FAIL_Y, DRAG_FAIL_Y\]\)/);
  assert.doesNotMatch(fast, /minDistance\(0\)|State\.FAILED/);
  assert.ok(num('dragSlop') >= 10, 'a fingertip\'s wobble stays a tap');
  // Nothing stays held: the release, or failing it the finalize, lets go; a stalled drag lets go on
  // its own; a choice that never became the showing tab sends the bubble back.
  assert.match(fast, /\.onEnd\(\(_e, success\) => \{ if \(mode\.value !== 1\) return; letGo\(\);/);
  assert.match(fast, /\.onFinalize\(\(\) => \{ if \(mode\.value !== 1\) return; letGo\(\); runOnJS\(restore\)\(\); \}\)/);
  assert.match(fast, /if \(mode\.value === 1\) \{ stall\.value \+= dt; if \(stall\.value > DRAG_STALL_S\) \{ mode\.value = 0;/);
  assert.match(fast, /if \(mode\.value === 0 && chosenIdx\.value !== restIdx\.value\) restore\(\);/);
  assert.match(fast, /if \(!held\.chose && mode\.value === 0\) restore\(\);/);
  // Everything drawn is clipped to the pill.
  assert.match(fast, /inside: \{ \.\.\.StyleSheet\.absoluteFillObject, borderRadius: meltBar\.radius, overflow: 'hidden' \}/);
  assert.match(fast, /<View pointerEvents="none" style=\{styles\.inside\}>/);
});
