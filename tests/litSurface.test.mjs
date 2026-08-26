import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// lit(2) — THE LIT SURFACE HAS TO BE VISIBLE TO THE INSTRUMENT THAT MEASURES IT.
//
// CATCHES the two ways this feature dies quietly. First, a native-only
// gradient: `experimental_backgroundImage` alone renders nothing on web, and
// the web export is what `node scripts/shots.mjs` captures and what
// `node scripts/master-diff.mjs` then measures — so a native-only surface
// would make every later claim about the wash unmeasured while still looking
// correct in the source. Second, a hex creeping into the one file whose whole
// job is deriving opacities from palette tokens.
//
// WHY NOT VACUOUS: the branch assertion pins the WHOLE ternary, so deleting
// either arm fails; the stop count is an equality, so it fails on zero as
// loudly as on six; and the colour check runs on the raw source rather than
// the stripped code, so a hex parked in a comment fails too.
// ---------------------------------------------------------------------------
test('[static] LitSurface paints on web and native, and writes no colour of its own', () => {
  const source = read('ui/primitives/LitSurface.tsx');
  const code = stripComments(source);
  const flat = flatten(source);

  // 1. BOTH BRANCHES, IN ONE TERNARY, KEYED ON Platform.OS. The web arm is
  //    named first because it is the arm the harness takes.
  assert.match(
    flat,
    /return Platform\.OS === 'web' \? \(\{ backgroundImage: image \} as unknown as ViewStyle\) : \{ experimental_backgroundImage: image \};/,
    'the web branch must set backgroundImage and the native branch experimental_backgroundImage'
  );

  // 2. FLAT COSTS NOTHING. This is what keeps a light render byte-identical
  //    through the change: no style key, so no node and no pixel move.
  assert.match(flat, /if \(fill\.flat\) return undefined;/);

  // 3. THE AXIS AND THE EDGE ARE THE MASTER'S, AND THEY ARE NOT PROPS.
  assert.match(code, /const DIAGONAL = '135deg';/);
  assert.match(code, /const EDGE_PX = 1;/);
  assert.match(code, /linear-gradient\(\$\{DIAGONAL\}, /);
  assert.match(code, /'linear-gradient\(180deg, '/);

  // 4. EVERY COLOUR STOP IS A PALETTE TOKEN THROUGH withAlpha — two on the
  //    diagonal, three on the top edge. An equality, not a floor: adding a
  //    sixth stop is a design decision and has to be made here, on purpose.
  const stops = [...code.matchAll(/\$\{withAlpha\(/g)];
  assert.equal(stops.length, 5, 'the gradient has exactly five stops, all through withAlpha');
  assert.match(code, /import \{ withAlpha \} from '\.\./);

  // 5. NO LITERAL COLOUR ANYWHERE IN THE FILE, comments included.
  assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, 'a hex literal is back in LitSurface');
  assert.doesNotMatch(source, /\brgba?\(/, 'a raw rgb()/rgba() literal is back in LitSurface');
  assert.doesNotMatch(source, /\bhsla?\(/, 'a raw hsl()/hsla() literal is back in LitSurface');

  // 6. ONE IMPLEMENTATION OF THE BRANCH. The component does not carry a second
  //    copy of it — a caller whose container cannot become a View (the
  //    Post-a-job pill is a Pressable) reaches the same function.
  assert.match(flat, /const fill = litFill\(\{ surface, lift, liftAlpha, highlight, highlightAlpha, flat \}\);/);
  const branches = [...code.matchAll(/experimental_backgroundImage/g)];
  assert.equal(branches.length, 1, 'the native key is named once, in litFill');

  // 7. IT IS REACHABLE BY THE §I NAME.
  const barrel = read('ui/primitives/index.ts');
  assert.match(barrel, /export \{ LitSurface, litFill, litGradient \} from '\.\/LitSurface';/);
});
