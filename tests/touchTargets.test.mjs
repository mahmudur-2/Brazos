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
  ['screens/WorkerProfileScreen.tsx', 'onPress={() => bookService(service)}', 'Book'],
  ['screens/WorkerHomeScreen.tsx', 'accessibilityLabel="See all in My Jobs"', 'See all (Needs you)'],
  ['components/PriceDropdown.tsx', 'onPress={finishEntry}', 'the price Done pill'],
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

// F12 review — A PRESS WRAPPER CARRIES ITS PRESSABLE'S SLOP. Pinned as the spring wrappers' shape
// (SearchBar's clear, the Toggle, PressScale on both paths; lean D5 removed the mic) — but NOT for the reason first
// given. On the New Architecture a parent whose overflow is visible does not clip a child's
// hitSlop: Yoga folds every child's hitSlop into the parent's overflow inset
// (YogaLayoutableShadowNode.cpp getContentBounds), so RCTViewComponentView's betterHitTest — which
// treats only an EMPTY inset as clipping — lets the touch through to the Pressable's own slop. What
// cuts a slop is an ancestor whose inset is empty by construction, `overflow: scroll` (every
// ScrollView) or `overflow: hidden` — the fence after this one. The wrapper's slop costs nothing;
// every `<Animated.View style={x.style}>` around a slopped Pressable keeps wearing it so the two
// views never disagree.

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
  assert.ok(wrappers >= 2, 'the SearchBar clear and the Toggle are among the wrappers checked');
  // The shared press passes it to both views, on both paths (tests/smoothPass.test.mjs pins the shape).
  for (const file of ['components/PressScale.tsx', 'components/PressScale.motion120.tsx']) {
    assert.match(read(file), /onLayout=\{onLayout\} hitSlop=\{hitSlop\}>/, `${file} wrapper carries the slop`);
  }
});

// E3 review (2026-10-03) — A HORIZONTAL SCROLLER MAKES ROOM FOR ITS PILLS' SLOP. A hitSlop reaches
// through a parent whose overflow is visible (the fence above says why), but a ScrollView is
// `overflow: scroll`: its overflow inset is empty by construction (YogaLayoutableShadowNode.cpp
// computes one only for overflow visible), and iOS rejects any touch outside its frame
// (RCTScrollViewComponentView betterHitTest); an `overflow: hidden` ancestor clips the same way. So
// a slopped pill inside a horizontal ScrollView stayed its drawn height — the Inbox filters and the
// Filters sheet rows, 34pt. Every horizontal ScrollView that holds a `hitSlop={touchSlop(` control —
// lexically, or through the `children` it is handed — wears `slopRoom()` (lib/theme.ts): its
// `.scroller` on the ScrollView's `style`, its `.content` on the `contentContainerStyle`, inline or
// spread into the StyleSheet entries those props name.

/** The JSX opening tag that starts at `start`, braces balanced. */
const tagAt = (source, start, path) => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0 && source[i - 1] !== '=') return source.slice(start, i + 1);
  }
  throw new Error(`${path}: unterminated tag at ${start}`);
};

/** The text inside the braces of `prop={…}` on a tag, or null when the tag has no such prop. */
const propValue = (tag, prop) => {
  const at = tag.indexOf(`${prop}={`);
  if (at < 0) return null;
  let depth = 0;
  for (let i = at + prop.length + 1; i < tag.length; i += 1) {
    if (tag[i] === '{') depth += 1;
    else if (tag[i] === '}') {
      depth -= 1;
      if (depth === 0) return tag.slice(at + prop.length + 2, i);
    }
  }
  return null;
};

test('[static] E3 review: a horizontal ScrollView holding slopped pills makes room for the slop', () => {
  const files = execFileSync('git', ['ls-files', '--', 'components', 'screens', 'ui'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => /\.tsx$/.test(file) && !/\.web\.tsx$/.test(file));
  let scrollers = 0;
  for (const file of files) {
    const source = read(file);
    if (!/hitSlop=\{touchSlop\(/.test(source)) continue;
    const rooms = [...source.matchAll(/const (\w+) = slopRoom\(/g)].map((match) => match[1]);
    const wears = (tag, prop, key) => {
      const value = propValue(tag, prop);
      if (value === null) return false;
      if (rooms.some((room) => value.includes(`${room}.${key}`))) return true;
      // The prop names StyleSheet entries; one of them spreads the room.
      return [...value.matchAll(/styles\.(\w+)/g)].some(([, name]) => {
        const entry = new RegExp(`\\b${name}: \\{([^}]*)\\}`).exec(source);
        return entry !== null && rooms.some((room) => entry[1].includes(`...${room}.${key}`));
      });
    };
    const open = /<ScrollView\b/g;
    for (let match = open.exec(source); match; match = open.exec(source)) {
      const tag = tagAt(source, match.index, file);
      if (!/\bhorizontal\b/.test(tag)) continue;
      const close = source.indexOf('</ScrollView>', match.index + tag.length);
      const inner = source.slice(match.index + tag.length, close < 0 ? source.length : close);
      if (!/hitSlop=\{touchSlop\(/.test(inner) && !/\bchildren\b/.test(inner)) continue;
      scrollers += 1;
      assert.ok(wears(tag, 'style', 'scroller'), `${file}: the horizontal ScrollView at ${match.index} holds slopped controls but its style carries no slopRoom().scroller`);
      assert.ok(wears(tag, 'contentContainerStyle', 'content'), `${file}: the horizontal ScrollView at ${match.index} holds slopped controls but its contentContainerStyle carries no slopRoom().content`);
    }
  }
  assert.ok(scrollers >= 2, 'the Inbox filter row and the Filters sheet rows are among the scrollers checked');
});
