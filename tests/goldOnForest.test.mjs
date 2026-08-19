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
// Prestige v2 (0b) — REWRITTEN, superseding the 4D-4 "no gold on forest" scan.
//
// The old scan guarded a premise the v2 palette inverted: under v1's dark
// palette `forest` and `gold` were the same hex (#D9B978, the gold-primary
// experiment), so forest-fill + gold-content was invisible paint. Under v2
// — pixel-derived from the 43 golden masters — `forest` is a deep green
// solid again and gold/cream content ON a forest fill is CORRECT (master 44's
// hero card is exactly that). The old assertion would now reject designs the
// masters demand, so it is replaced, not weakened, by the two truths below:
//
//   1. GOLD IS LINE-WORK, NEVER A FILL. Across every master, gold draws
//      eyebrows, hairlines, icons, rings and borders; no control fills with
//      it (pre-made decision 3: "No gold fills anywhere"). goldSoft is a
//      wash token and legitimately fills warning cards.
//   2. THE PALETTE KEEPS THE INVERSION. dark.forest is the deep green and
//      dark.gold the metal, and they can never silently re-merge.
//
// The HotspotMap per-theme pin assertion is carried over unchanged from the
// 4D-4 suite — it still pins the code as it stands; the 3a map restyle will
// update it when the pin adopts master 33's gold ring.
// ===========================================================================

const SOURCE_DIRS = ['screens', 'components', 'ui'];
const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'))
);

// Decorative shimmer bars over the baked LIGHT transition PNGs — translucent
// glow, not a control fill; migrates with those assets (standing decision,
// HANDOFF "Deliberately left light").
const GOLD_FILL_ALLOWLIST = new Set(['components/ModeTransitionOverlay.tsx']);

test('[static] gold is line-work, never a fill', () => {
  const offenders = [];
  let goldLinework = 0;
  for (const file of sourceFiles) {
    const source = stripComments(read(file));
    goldLinework += (
      source.match(/(?:[{,]\s*color|border(?:Top|Bottom|Left|Right|Start|End)?Color):\s*\w+\.gold\b/g) ?? []
    ).length;
    for (const fill of source.matchAll(/backgroundColor:\s*\w+\.gold\b/g)) {
      if (GOLD_FILL_ALLOWLIST.has(file)) continue;
      offenders.push(`${file}: ${fill[0].trim()}`);
    }
  }
  // The sweep must actually be looking at something: the tree is large and
  // gold line-work is everywhere by design.
  assert.ok(sourceFiles.length > 100, `the sweep must enumerate the tree (saw ${sourceFiles.length})`);
  assert.ok(goldLinework >= 10, `the sweep must see the known gold line-work (saw ${goldLinework})`);
  assert.deepEqual(offenders, [], 'gold may draw lines, text and icons — never fill a control');
});

test('[static] the v2 dark palette keeps forest green and gold metal, distinct', () => {
  const tokens = read('ui/tokens.ts');
  const darkBlock = tokens.slice(tokens.indexOf('export const dark = {'));
  const value = (key) => {
    const hit = darkBlock.match(new RegExp(`${key}: '(#[0-9A-Fa-f]{6})'`));
    assert.ok(hit, `ui/tokens.ts dark is missing ${key}`);
    return hit[1];
  };
  assert.equal(value('forest'), '#1E3A2C');
  assert.equal(value('gold'), '#DCAB60');
  assert.equal(value('bg'), '#08110E');
  assert.notEqual(value('forest'), value('gold'), 'v1 merged these; v2 must never re-merge them');
});

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

test('[static] the HotspotMap pin hairline is per-theme: gold in light, onForest in dark', () => {
  const source = stripComments(read('components/HotspotMap.native.tsx'));
  // The base badge and tail carry the forest fill and border WIDTH only; the
  // border COLOR arrives from exactly one of the two per-theme overrides.
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
