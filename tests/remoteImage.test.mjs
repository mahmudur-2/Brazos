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

const BOUNDARY = 'components/RemoteImage.tsx';
const SCAN_DIRS = ['components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];
const ROOT_FILES = ['App.tsx', 'index.ts'];

/**
 * The ONE remote photo left on react-native's Image, with its reason recorded
 * in the file beside it. The full-screen viewer's picture is already in cache
 * when it opens, and its zoom (components/ZoomableImage, fix run F10) scales
 * it to 4x, which wants the picture undecimated rather than downscaled to its
 * 1x box.
 */
const EXCEPTIONS = { 'components/PhotoViewer.tsx': 'the zoomed full-screen picture, already cached' };

function* walk(dir) {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) yield* walk(rel);
    else if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry)) yield rel;
  }
}

// ---------------------------------------------------------------------------
// RUN MOTION1 (C4) — EVERY REMOTE PHOTO GOES THROUGH ONE BOUNDARY.
//
// CATCHES: a new screen reaching for react-native's `<Image source={{ uri }}>`
// and getting the grey-box-then-pop it always gave; a static import of
// expo-image, which takes a whole screen down on a binary without the native
// module rather than degrading one photo; and the boundary losing its
// fallback, which would leave that binary with no picture at all.
//
// WHAT IT DELIBERATELY DOES NOT CATCH: a LOCAL `require`d asset rendered by
// react-native's Image. The hero crops, the gold B drape and the atmosphere
// raster are bundled and have no load state, so a placeholder and a
// cross-fade would fade in something that was never missing.
// ---------------------------------------------------------------------------

test('[static] RemoteImage loads expo-image lazily and falls back to the RN Image', () => {
  const code = stripComments(read(BOUNDARY));
  const flat = flatten(read(BOUNDARY));

  assert.doesNotMatch(code, /import[^;]*from 'expo-image'/);
  assert.equal(
    [...code.matchAll(/expo-image/g)].length,
    1,
    'expo-image must be named once, in the sole load site'
  );
  assert.match(flat, /try \{ const vendor = require\('expo-image'\)/);
  assert.match(flat, /\} catch \{ return null; \}/);

  // With no handle it renders react-native's own Image with the SAME source,
  // so a binary predating the package shows exactly what it shows today.
  assert.match(flat, /if \(!ExpoImage\) \{ return \( <Image source=\{\{ uri \}\}/);
  assert.match(flat, /resizeMode=\{contentFit\}/, 'the fallback must honour the same fit');

  // And the enabled path carries both halves of what C4 is for.
  assert.match(flat, /transition=\{IMAGE_TRANSITION_MS\}/);
  assert.match(flat, /placeholder=\{placeholder\}/);
  // No colour is written here — the palette ban covers this directory.
  assert.doesNotMatch(code, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(code, /\brgba?\(/);
});

test('[static] no remote photo is left on the react-native Image', () => {
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  assert.ok(files.length > 100, `the sweep must enumerate the tree (saw ${files.length})`);

  const offenders = [];
  let routed = 0;
  for (const file of files) {
    if (file === BOUNDARY) continue;
    const code = stripComments(read(file));
    if (/expo-image'/.test(code)) offenders.push(`${file}: imports expo-image directly`);
    // A remote source is `{{ uri` — a local one is `require(...)`.
    const remote = [...code.matchAll(/<(?:Animated\.)?Image[\s\S]{0,80}?source=\{\{\s*uri/g)];
    if (remote.length && !EXCEPTIONS[file]) {
      offenders.push(`${file}: ${remote.length} remote photo(s) still on the RN Image`);
    }
    if (/<RemoteImage/.test(code)) routed += 1;
  }
  assert.deepEqual(offenders, []);
  // ANTI-VACUITY: the boundary is actually carrying the tree's photos.
  assert.ok(routed >= 15, `the boundary must be in real use (saw ${routed} files)`);

  // Every exception is still where it says it is, and still says why.
  for (const [file, why] of Object.entries(EXCEPTIONS)) {
    assert.match(
      read(file),
      /RUN MOTION1 \(C4\)[\s\S]{0,200}EXCEPTION/,
      `${file} must keep its recorded exception (${why})`
    );
  }
});
