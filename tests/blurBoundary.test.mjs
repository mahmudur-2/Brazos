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
// every surface it is layered onto; and the web short-circuit being removed,
// which is what keeps the screenshot harness — a web render — from gaining a
// tint for a native effect it cannot show.
// ---------------------------------------------------------------------------

test('[static] lib/blur renders the vendor or nothing, and web never reaches it', () => {
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

  // THE TWO SURFACES C3 NAMES, and no third one added without a decision. The
  // nav pill's fill, and the shared modal/dialog backdrops. Edit Budget is
  // deliberately absent: it is its own dialog surface rather than one of the
  // shared backdrops, and the operator's decision is that it stays opaque dim.
  assert.deepEqual(
    callers.sort(),
    [
      'components/ActionSheet.tsx',
      'components/AmountPrompt.tsx',
      'components/ConfirmDialog.tsx',
      'ui/primitives/BottomNav.tsx',
      'ui/primitives/Sheet.tsx',
    ],
    'the blur is the nav pill fill and the shared backdrops — nothing else'
  );
  assert.doesNotMatch(
    stripComments(read('components/EditBudgetDialog.tsx')),
    /BlurLayer/,
    'Edit Budget stays opaque dim by operator decision'
  );
});

test('[static] every backdrop paints its scrim BEFORE the blur goes over it', () => {
  // The order is what makes the degraded case correct: the scrim is the
  // surface, the blur is a layer on top of it, and a binary without the native
  // module simply loses the layer. A blur rendered under the scrim, or in
  // place of it, would leave nothing behind on such a build.
  for (const path of [
    'components/ActionSheet.tsx',
    'components/AmountPrompt.tsx',
    'components/ConfirmDialog.tsx',
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
