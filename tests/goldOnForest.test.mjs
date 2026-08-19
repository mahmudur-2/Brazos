import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ===========================================================================
// 4D-4 device pass, commit 3 — no gold on forest.
//
// Under Emerald Prestige, `forest` resolves to the GOLD primary
// (ui/tokens.ts `dark`: forest and gold are both #D9B978), so any style that
// fills with forest and puts a gold-family token on top of that fill renders
// invisible in dark. WorkerHome shipped exactly this (its earnings card), and
// e195012 repaired the same defect on ClientJobDetail's hero.
//
// WHAT A SCAN CAN AND CANNOT EXPRESS RELIABLY: the SAME-OBJECT form — one
// style object that both fills with forest and colors its text or border
// from the gold family — is mechanically checkable, and is checked below
// across all of screens/, components/ and ui/. The CROSS-OBJECT form (fill
// in one style, gold text in a sibling style applied to a child, which is
// how WorkerHome's card failed) needs JSX-tree analysis a text scan cannot
// do honestly, so the surfaces repaired in this stage are pinned
// individually instead: WorkerHome's card in tests/workerHome.test.mjs, the
// HotspotMap pin here.
//
// The matching-border idiom (`borderColor` set to the SAME token as the
// fill, e.g. Chip's chipFilterSelected) is deliberately permitted: an
// invisible border there is the point, in both palettes.
// ===========================================================================

const SOURCE_DIRS = ['screens', 'components', 'ui'];
const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'))
);

/** The innermost balanced `{…}` around `index` — for a style property match,
 *  that is the style object it lives in. */
function enclosingObject(source, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    const ch = source[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return null;
}

test('[static] no style object both fills with forest and colors from the gold family', () => {
  const offenders = [];
  let forestFills = 0;
  for (const file of sourceFiles) {
    const source = stripComments(read(file));
    for (const fill of source.matchAll(/backgroundColor:\s*\w+\.forest\b/g)) {
      forestFills += 1;
      const object = enclosingObject(source, fill.index);
      assert.ok(object, `${file}: a forest fill must sit inside a balanced style object`);
      // Text on the fill: gold, goldSoft AND forest are all invisible on a
      // forest fill (forest-on-forest is the same color by definition).
      const textHits = object.match(/[{,]\s*color:\s*\w+\.(?:gold|goldSoft|forest)\b/g) ?? [];
      // Borders on the fill: gold-family vanishes in dark. A border in the
      // fill's own token is the deliberate matching-border idiom and passes.
      const borderHits =
        object.match(
          /border(?:Top|Bottom|Left|Right|Start|End)?Color:\s*\w+\.(?:gold|goldSoft)\b/g
        ) ?? [];
      for (const hit of [...textHits, ...borderHits]) {
        offenders.push(`${file}: ${hit.trim()} on a forest fill`);
      }
    }
  }
  // The sweep must actually be looking at something: forest fills legitimately
  // exist all over (CTAs with onForest content, the locked screens' frozen
  // light cards) — what may not exist is gold-family paint on one.
  assert.ok(sourceFiles.length > 100, `the sweep must enumerate the tree (saw ${sourceFiles.length})`);
  assert.ok(forestFills >= 10, `the sweep must see the known forest fills (saw ${forestFills})`);
  assert.deepEqual(offenders, []);
});

test('[static] the HotspotMap pin hairline is per-theme: gold in light, onForest in dark', () => {
  const source = stripComments(read('components/HotspotMap.native.tsx'));
  // The base badge and tail carry the forest fill and border WIDTH only; the
  // border COLOR arrives from exactly one of the two per-theme overrides, so
  // light renders byte-identically to the pre-fix gold and dark can never
  // draw gold-on-gold.
  const badge = enclosingObject(source, source.indexOf('minWidth: 40'));
  assert.match(badge, /backgroundColor: colors\.forest/);
  assert.doesNotMatch(badge, /borderColor/);
  assert.match(source, /pinBadgeLight: \{\s*borderColor: colors\.gold,\s*\}/);
  assert.match(source, /pinBadgeDark: \{\s*borderColor: colors\.onForest,\s*\}/);
  assert.match(source, /pinTailLight: \{\s*borderColor: colors\.gold,\s*\}/);
  assert.match(source, /pinTailDark: \{\s*borderColor: colors\.onForest,\s*\}/);
  assert.match(source, /isDark \? styles\.pinBadgeDark : styles\.pinBadgeLight/);
  assert.match(source, /isDark \? styles\.pinTailDark : styles\.pinTailLight/);
  // The count itself already sat on onForest — that stays.
  assert.match(source, /pinCount: \{\s*color: colors\.onForest/);
});
