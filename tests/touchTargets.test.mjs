import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// ---------------------------------------------------------------------------
// Fix run E3 — 44pt TOUCH TARGETS. The controls the 2026-10-01 review measured
// under the floor keep what they draw and reach 44 through `touchSlop()`
// (lib/theme.ts, executed in tests/themeTokens.test.mjs): hitSlop over drawn
// size, so no layout moves. Each entry names the control by a marker inside
// its own <Pressable> opening tag; the tag must carry `hitSlop={touchSlop(`.
// ---------------------------------------------------------------------------

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** The <Pressable …> opening tag that contains `marker`, braces balanced. A control on the
 *  shared press (components/PressScale, fix run F12) opens as <PressScale and passes every
 *  Pressable prop through, so its tag is the one read. */
const pressableTagWith = (source, marker, path) => {
  const at = source.indexOf(marker);
  assert.ok(at >= 0, `${path}: marker ${marker} not found`);
  const start = Math.max(source.lastIndexOf('<Pressable', at), source.lastIndexOf('<PressScale', at));
  assert.ok(start >= 0, `${path}: no <Pressable before ${marker}`);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0 && source[i - 1] !== '=') return source.slice(start, i + 1);
  }
  throw new Error(`${path}: unterminated <Pressable> at ${marker}`);
};

const NAMED = [
  ['screens/MessagesInboxScreen.tsx', 'onPress={() => setFilter(pill.key)}', 'the Inbox pills'],
  ['components/JobFilterSheet.tsx', 'accessibilityState={{ selected: on }}', 'the Filters pills'],
  ['components/JobFilterSheet.tsx', 'onPress={reset}', 'Reset filters'],
  ['screens/MapScreen.tsx', 'onPress={toggleToday}', 'the Map’s Today chip'],
  ['screens/MapScreen.tsx', 'onPress={() => setSelected(null)}', 'the Map card’s close'],
  ['screens/SavedWorkersScreen.tsx', 'accessibilityLabel={`Hire ${', 'Hire'],
  ['screens/WorkerProfileScreen.tsx', 'onPress={() => bookService(service)}', 'Book'],
  ['screens/WorkerHomeScreen.tsx', 'accessibilityLabel="See all in My Jobs"', 'See all (Needs you)'],
  ['screens/WorkerSearchScreen.tsx', 'accessibilityLabel="See all saved and past workers"', 'See all (Hire again)'],
  ['components/PriceDropdown.tsx', 'onPress={finishEntry}', 'the price Done pill'],
  ['components/PastWork.tsx', 'style={[styles.tab, active', 'the Past work tabs'],
  ['screens/ChatScreen.tsx', 'accessibilityLabel="Cancel reply"', 'Cancel reply'],
  ['ui/primitives/SearchBar.tsx', 'accessibilityLabel="Clear search"', 'Clear search'],
];

test('E3: every control the review measured under 44pt reaches it through touchSlop', () => {
  for (const [path, marker, what] of NAMED) {
    const tag = pressableTagWith(read(path), marker, path);
    assert.match(tag, /hitSlop=\{touchSlop\(/, `${what} (${path}) must lift its touch area with touchSlop()`);
  }
});

test('E3: the Filters pill draws one height and slops from that same constant', () => {
  const sheet = read('components/JobFilterSheet.tsx');
  assert.match(sheet, /const PILL_HEIGHT = 34;/);
  assert.match(sheet, /hitSlop=\{touchSlop\(PILL_HEIGHT\)\}/);
});

// F12 review — A PRESS WRAPPER CARRIES ITS PRESSABLE'S SLOP. On the New Architecture a view whose
// children do not overflow it is hit-tested as if it clipped (RCTViewComponentView betterHitTest:
// overflowInset == {} counts as clipping). A spring wrapper is exactly its Pressable's size, so a
// slop on the Pressable alone dies at the wrapper's edge and the 44pt target shrinks back to the
// glyph. Every `<Animated.View style={x.style}>` that wraps a slopped Pressable wears a slop too.

test('[static] F12 review: a press wrapper around a slopped Pressable carries the slop', () => {
  const files = execFileSync('git', ['ls-files', '--', 'components', 'screens', 'ui'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => /\.tsx$/.test(file) && !/\.web\.tsx$/.test(file));
  let wrappers = 0;
  for (const file of files) {
    const source = read(file);
    const wrapper = /<Animated\.View style=\{\w+\.style\}([^>]*)>\s*<Pressable\b/g;
    for (let match = wrapper.exec(source); match; match = wrapper.exec(source)) {
      const tag = pressableTagWith(source.slice(match.index + match[0].length - '<Pressable'.length), '<Pressable', file);
      if (!/hitSlop=/.test(tag)) continue;
      wrappers += 1;
      assert.match(match[1], /hitSlop=/, `${file}: the press wrapper at ${match.index} drops its Pressable's slop`);
    }
  }
  assert.ok(wrappers >= 3, 'the SearchBar clear and mic and the Toggle are among the wrappers checked');
  // The shared press passes it to both views, on both paths (tests/smoothPass.test.mjs pins the shape).
  for (const file of ['components/PressScale.tsx', 'components/PressScale.motion120.tsx']) {
    assert.match(read(file), /onLayout=\{onLayout\} hitSlop=\{hitSlop\}>/, `${file} wrapper carries the slop`);
  }
});
