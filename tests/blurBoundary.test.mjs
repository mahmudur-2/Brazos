import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

const BOUNDARY = 'lib/blur.tsx';
const SCAN_DIRS = ['components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];
const ROOT_FILES = ['App.tsx', 'index.ts'];

function* walk(dir) {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) yield* walk(rel);
    else if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry)) yield rel;
  }
}

// ---------------------------------------------------------------------------
// RUN MOTION1 (C3) — THE BLUR IS A BOUNDARY, THE SAME SHAPE AS THE OTHER TWO.
//
// CATCHES: a static `import { BlurView } from 'expo-blur'` anywhere (which
// runs the vendor's module scope on every platform, web included, and hands a
// binary without ExpoBlurView an unguarded native-module error); the boundary
// growing a fallback COLOUR of its own, which would be a second ground under
// every surface it is layered onto; and the VENDOR's web short-circuit being
// removed — expo-blur's web shim paints a tint of its own, and the screenshot
// harness, a web render, must never gain one. 2026-09-19: web is not
// blur-less any more — the boundary draws a colourless CSS backdrop-filter
// there, so the harness shows the glass the phone shows — but the vendor is
// still never executed on web, and the CSS branch paints no colour either.
// ---------------------------------------------------------------------------

test('[static] lib/blur renders the vendor, a colourless CSS blur on web, or nothing — and the vendor never runs on web', () => {
  const source = read(BOUNDARY);
  const code = stripComments(source);
  const flat = flatten(source);

  // Lazy and caught, never a static import.
  assert.doesNotMatch(code, /import[^;]*from 'expo-blur'/);
  assert.equal(
    [...code.matchAll(/expo-blur/g)].length,
    1,
    'expo-blur must be named once, in the sole load site'
  );
  assert.match(code, /require\('expo-blur'\)/);
  assert.match(flat, /try \{ const vendor = require\('expo-blur'\)/);
  assert.match(flat, /\} catch \{ return null; \}/);

  // The one call site is the non-web arm of a Platform ternary, so the vendor
  // is never executed on web at all.
  assert.equal(
    [...code.matchAll(/(?<!function )\bload\(\)/g)].length,
    1,
    'load() must have exactly one call site'
  );
  assert.match(
    flat,
    /const BlurView: BlurViewComponent \| null = Platform\.OS === 'web' \? null : load\(\);/,
    'the one call site must be the non-web arm of the Platform ternary'
  );

  // With no handle it renders NOTHING, so what shows is whatever opaque colour
  // the caller had underneath. It never paints one itself.
  assert.match(flat, /if \(!BlurView\) return null;/);
  assert.doesNotMatch(code, /backgroundColor/, 'the blur layer must paint no colour of its own');

  // 2026-09-19 — THE WEB BRANCH: a plain View with backdrop-filter, before
  // the vendor check, sized from the same intensity the vendor takes, and
  // nothing at zero. `canBlur` says web can, so Surface uses the real mix.
  assert.match(
    flat,
    /if \(Platform\.OS === 'web'\) \{ const px = Math\.round\(intensity \* WEB_PX_PER_INTENSITY\); if \(px <= 0\) return null; return <View pointerEvents="none" style=\{\[style \?\? StyleSheet\.absoluteFill, webBlurStyle\(px\)\]\} \/>; \}/,
    'web blurs with a colourless CSS view, sized from the intensity',
  );
  // 2026-09-29 (LUX-LIST-2 #9): the web ASKS whether it can draw a backdrop blur (CSS.supports),
  // never assumes — a renderer without it showed see-through pop-ups with the rows readable through them.
  assert.match(flat, /export const canBlur = Platform\.OS === 'web' \? webCanBlur\(\) : BlurView != null;/);
  assert.match(flat, /css\.supports\('backdrop-filter', 'blur\(1px\)'\)/);
  assert.match(flat, /const WEB_PX_PER_INTENSITY = 0\.5;/);
  assert.doesNotMatch(code, /tint[^\n]*backdropFilter|backdropFilter[^\n]*tint/, 'the CSS blur carries no tint');
});

test('[static] the CSS blur is named nowhere but the boundary (2026-09-19)', () => {
  // The web analogue of the BlurView rule below: one implementation of the
  // blur per platform, both inside lib/blur.tsx. A surface reaching for
  // backdrop-filter itself would be inventing its own glass on web.
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  const offenders = [];
  for (const file of files) {
    if (file === BOUNDARY) continue;
    if (/backdropFilter|backdrop-filter/i.test(stripComments(read(file)))) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'backdrop-filter may be named only inside lib/blur.tsx');
});

test('[static] lib/blur is the only file in the tree that names expo-blur', () => {
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  assert.ok(files.length > 100, `the sweep must enumerate the tree (saw ${files.length})`);
  assert.ok(files.includes(BOUNDARY), 'the boundary itself must be inside the swept tree');

  const offenders = [];
  const callers = [];
  for (const file of files) {
    const code = stripComments(read(file));
    if (file !== BOUNDARY && /expo-blur/.test(code)) offenders.push(file);
    if (file !== BOUNDARY && /from '[^']*lib\/blur'/.test(code)) callers.push(file);
  }
  assert.deepEqual(
    offenders,
    [],
    'expo-blur must be reached through lib/blur.tsx, never imported directly'
  );

  // THE SHARED BACKDROPS MOTION1 C3 NAMED, plus RUN G1's Surface primitive —
  // the one wearer of the glass materials, and since C4 how the nav bar's
  // blur arrives too (BottomNav renders Surface, never the blur layer
  // directly). Edit Budget is deliberately absent: it is its own dialog
  // surface rather than one of the shared backdrops, and the operator's
  // decision is that it stays opaque dim.
  assert.deepEqual(
    callers.sort(),
    // 2026-09-30 (the build run, the smoothness pass): the three frosted dialogs present through
    // components/PopModal.tsx, which draws their frost for them (both of its paths), so the blur's
    // callers are PopModal, the docked Sheet and the Surface primitive.
    [
      'components/PopModal.motion120.tsx',
      'components/PopModal.tsx',
      'ui/primitives/Sheet.tsx',
      'ui/primitives/Surface.tsx',
    ],
    'the blur is the shared backdrops and the Surface primitive — nothing else'
  );
  assert.doesNotMatch(
    stripComments(read('components/EditBudgetDialog.tsx')),
    /BlurLayer/,
    'Edit Budget stays opaque dim by operator decision'
  );
});

// ---------------------------------------------------------------------------
// RUN G1 (C7) — THE MATERIALS ARE A BOUNDARY TOO.
//
// The suite above keeps expo-blur behind lib/blur.tsx. These extend it:
//
//   (b) BlurView — the vendor's component NAME — appears nowhere but the
//       boundary, so no file can even hold the handle a direct import would
//       give it. Consumers render <BlurLayer /> or wear a <Surface material>.
//   (c) the materials table is consumed only through Surface: the one
//       production import of `materials` is lib/designOverrides.ts (the live
//       resolver Surface reads), lib/theme.ts does not re-surface it, and
//       the glass scrim ink #071B15 is spelled exactly once, in ui/tokens.ts
//       — a second spelling anywhere is a surface inventing its own glass.
//
// Modal is deliberately NOT banned: the existing dialogs legitimately use it
// this phase.
// ---------------------------------------------------------------------------

test('[static] BlurView is named nowhere but the boundary (G1 C7)', () => {
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  const offenders = [];
  for (const file of files) {
    if (file === BOUNDARY) continue;
    if (/\bBlurView\b/.test(stripComments(read(file)))) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'BlurView may be named only inside lib/blur.tsx');
});

test('[static] the glass is worn only through Surface (G1 C7)', () => {
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));

  const scrimOffenders = [];
  const importOffenders = [];
  let surfaceWearers = 0;
  for (const file of files) {
    const code = stripComments(read(file));
    if (file !== 'ui/tokens.ts' && /#071B15/i.test(code)) scrimOffenders.push(file);
    if (
      file !== 'lib/designOverrides.ts' &&
      /import \{[^}]*\bmaterials\b[^}]*\} from '[^']*tokens'/.test(code)
    ) {
      importOffenders.push(file);
    }
    if (file !== 'ui/primitives/Surface.tsx' && /<Surface material=/.test(code)) {
      surfaceWearers += 1;
    }
  }
  assert.deepEqual(scrimOffenders, [], 'the glass scrim ink is spelled once, in ui/tokens.ts');
  assert.deepEqual(
    importOffenders,
    [],
    'the materials table is read only through lib/designOverrides.ts'
  );
  assert.doesNotMatch(
    stripComments(read('lib/theme.ts')),
    /\bmaterials\b/,
    'lib/theme.ts must not re-surface the materials table — Surface is the wearer'
  );
  assert.ok(surfaceWearers >= 2, `the glass must actually be worn (saw ${surfaceWearers} wearers)`);
});

test('[static] every backdrop paints its scrim BEFORE the blur goes over it', () => {
  // The order is what makes the degraded case correct: the scrim is the
  // surface, the blur is a layer on top of it, and a binary without the native
  // module simply loses the layer. A blur rendered under the scrim, or in
  // place of it, would leave nothing behind on such a build.
  // 2026-09-30: the three frosted dialogs hand their backdrop to PopModal, which paints it and
  // lays the frost over it; the rule is held on both ends below.
  for (const path of ['components/ActionSheet.tsx', 'components/AmountPrompt.tsx', 'components/ConfirmDialog.tsx']) {
    const flat = flatten(read(path));
    assert.match(flat, /<PopModal[\s\S]*?backdropStyle=\{\[\s*styles\.backdrop/, path + ' must hand its backdrop to PopModal');
    assert.match(flat, /backdrop: \{[^}]*backgroundColor|backdropDark: \{ backgroundColor/, path + ': the backdrop must still paint an opaque fallback');
  }
  for (const path of ['components/PopModal.tsx', 'components/PopModal.motion120.tsx']) {
    const flat = flatten(read(path));
    const scrim = flat.indexOf('<View style={[StyleSheet.absoluteFill, backdropStyle]}');
    const frost = flat.indexOf('<BlurLayer />');
    assert.ok(scrim > -1 && frost > scrim, path + ': the scrim is painted, then the frost goes over it');
  }
  for (const path of [
    'ui/primitives/Sheet.tsx',
  ]) {
    const flat = flatten(read(path));
    const backdrop = flat.indexOf('styles.backdrop');
    const layer = flat.indexOf('<BlurLayer />');
    assert.ok(backdrop > -1, `${path} must still declare a backdrop`);
    assert.ok(layer > -1, `${path} must render the shared blur layer`);
    assert.ok(
      backdrop < layer,
      `${path}: the scrim must be declared before the blur that sits on it`
    );
    // And the scrim itself is still a painted colour, not something the blur
    // replaced.
    assert.match(
      flatten(read(path)),
      /backdrop: \{[^}]*backgroundColor|backdropDark: \{ backgroundColor/,
      `${path}: the backdrop must still paint an opaque fallback`
    );
  }
});
