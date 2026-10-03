import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Fix run E4 — VOICEOVER. Four claims, each over the whole of screens/,
// components/ and ui/ rather than a list, so a new screen inherits them:
//   1. a control that draws only a glyph or a picture says what it does;
//   2. the shared titles are headings (the rotor's "Headings" walks a screen);
//   3. a one-of-several choice is a radio;
//   4. every live region is spoken on iOS too — `accessibilityLiveRegion` is
//      Android-only, so each file that sets one also calls useAnnounce() or
//      renders <Announce> (hooks/useAnnounce.ts).
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const sources = ['screens', 'components', 'ui'].flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/')),
);

/** End of the JSX opening tag that starts at `from`, braces balanced. */
const openTagEnd = (source, from) => {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0 && source[i - 1] !== '=') return i;
  }
  return -1;
};

test('E4: every Pressable that draws only a glyph or a picture carries an accessibilityLabel', () => {
  const unnamed = [];
  for (const path of sources) {
    const source = read(path);
    for (const match of source.matchAll(/<Pressable\b/g)) {
      const end = openTagEnd(source, match.index + 10);
      const tag = source.slice(match.index, end + 1);
      if (tag.endsWith('/>')) continue;
      const body = source.slice(end + 1, source.indexOf('</Pressable>', end)).trim();
      const pictorial = /<Ionicons\b|<Image\b|<RemoteImage\b|<Avatar\b/.test(body);
      const worded = /<Text\b|<Animated\.Text\b|^\{[a-zA-Z]+\}$/.test(body);
      if (pictorial && !worded && !/accessibilityLabel/.test(tag)) {
        unnamed.push(`${path}:${source.slice(0, match.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(unnamed, [], 'a glyph-only control is silent to VoiceOver without a label');
});

test('E4: the shared titles are headings', () => {
  for (const [path, marker] of [
    ['components/ScreenHeader.tsx', /const titleText = \([\s\S]*?<Text\s+accessibilityRole="header"/],
    ['ui/primitives/SheetHeader.tsx', /<Text accessibilityRole="header" style=\{\[styles\.title, titleStyle\]\}/],
    ['ui/primitives/StepHeader.tsx', /<Text accessibilityRole="header" style=\{styles\.name\}/],
    ['ui/templates/SuccessScreen.tsx', /<Text accessibilityRole="header" style=\{styles\.title\}>\{title\}<\/Text>/],
    ['ui/templates/DetailScreen.tsx', /<Text accessibilityRole="header" style=\{\[styles\.sectionTitle,/],
  ]) {
    assert.match(read(path), marker, `${path}: its title is a heading`);
  }
  // Every section title / label drawn as its own Text heads what follows it.
  const bare = sources.filter((path) =>
    /<Text style=\{\[?styles\.(sectionTitle|sectionLabel)\b/.test(read(path)),
  );
  assert.deepEqual(bare, [], 'a section title without the header role');
});

test('E4: the report reasons are a radio group, one radio each, with its state', () => {
  const dialog = read('components/ReportDialog.tsx');
  assert.match(dialog, /<View style=\{styles\.reasons\} accessibilityRole="radiogroup">/);
  assert.match(dialog, /onPress=\{\(\) => setReason\(r\.value\)\}\s*accessibilityRole="radio"\s*accessibilityState=\{\{ selected \}\}/);
});

test('E4: every live region is also spoken on iOS', () => {
  const silent = sources.filter((path) => {
    const source = read(path);
    return /accessibilityLiveRegion=/.test(source) && !/useAnnounce\(|<Announce\b/.test(source);
  });
  assert.deepEqual(silent, [], 'accessibilityLiveRegion is Android-only; call useAnnounce() or render <Announce>');

  const hook = read('hooks/useAnnounce.ts');
  assert.match(hook, /if \(Platform\.OS !== 'ios' \|\| !message\) return;/, 'iOS only: Android keeps its live region');
  assert.match(hook, /AccessibilityInfo\.announceForAccessibility\(message\)/);
  assert.match(hook, /return \(\) => clearTimeout\(timer\);/, 'a message that changes before it settles is not spoken');
});
