import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// The one file allowed to spell an Animated-driver value (F-017/F-041/F-052).
const MOTION = 'lib/motion.ts';

// Every directory that holds app code.
const SCAN_DIRS = ['components', 'dev-tools', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];
const ROOT_FILES = ['App.tsx', 'index.ts'];

function* walk(dir) {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) {
      yield* walk(rel);
    } else if (/\.tsx?$/.test(entry)) {
      yield rel;
    }
  }
}

function appFiles() {
  const files = [...ROOT_FILES];
  for (const dir of SCAN_DIRS) files.push(...walk(dir));
  return files;
}

test('lib/motion.ts is the single Animated-driver authority', () => {
  const motion = read(MOTION);
  assert.match(motion, /export const USE_NATIVE_DRIVER = true;/);
  // JS_DRIVER exists solely for animations of props the native module cannot
  // drive (interpolated colors); it must stay pinned false, never platform-
  // conditional, or a color animation would crash on device.
  assert.match(motion, /export const JS_DRIVER = false;/);
});

test('no driver literal, inline platform check, or private redeclaration outside lib/motion.ts', () => {
  const offenders = [];
  for (const file of appFiles()) {
    if (file === MOTION) continue;
    const source = read(file);
    // A literal true/false hardcodes the platform decision the shared
    // constant exists to make once (a literal true is exactly how the web
    // target broke three times before).
    if (/useNativeDriver:\s*(true|false)\b/.test(source)) offenders.push(`${file}: literal driver value`);
    // An inline Platform read is the same decision made privately.
    if (/useNativeDriver:\s*Platform\./.test(source)) offenders.push(`${file}: inline platform driver`);
    // A private constant is how the duplication drifted in the first place.
    if (/\bUSE_NATIVE_DRIVER\s*=/.test(source)) offenders.push(`${file}: redeclares USE_NATIVE_DRIVER`);
  }
  assert.deepEqual(offenders, []);
});

test('every driver value used in app code is one of the two shared constants', () => {
  for (const file of appFiles()) {
    if (file === MOTION) continue;
    const source = read(file);
    for (const match of source.matchAll(/useNativeDriver:\s*([A-Za-z_$][\w$.]*)/g)) {
      assert.ok(
        match[1] === 'USE_NATIVE_DRIVER' || match[1] === 'JS_DRIVER',
        `${file} drives an animation with ${match[1]}`
      );
    }
  }
});
