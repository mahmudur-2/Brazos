import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// ===========================================================================
// REGRESSION FENCES for the SecureStore session move (2026-08-22).
//
// The Supabase auth session lives in the device keychain through ONE path:
// lib/supabase.ts -> lib/secureSessionStorage.ts (the only importer of
// expo-secure-store) -> lib/secureSessionStorageCore.ts (pure, executed by
// tests/secureSessionStorage.test.mjs). These fences pin the wiring, not the
// core's behavior — the core suite already executes that.
//
// CATCHES: a future run "simplifying" auth.storage back to plain
// AsyncStorage, adding a second adapter build with different config, or any
// app code reaching for the session key (supabase-js's default
// `sb-<ref>-auth-token`) around the adapter.
//
// SCOPE, decided in HANDOFF 2026-08-22: `scripts/shots.mjs` (which
// `scripts/home-shots.mjs` now forwards to) seeds a fabricated web session for
// a host that does not exist — it is OUTSIDE this native fence by design, so
// the walk never enters scripts/. (Lean D2 deleted lib/supabase.web.ts and
// every `*.web.ts(x)`, so the walk no longer needs to skip web modules.)
// ===========================================================================

const SOURCE_DIRS = [
  'components',
  'dev-tools',
  'hooks',
  'lib',
  'modes',
  'navigation',
  'screens',
  'ui',
];
const SOURCE_FILES = ['App.tsx', 'index.ts'];
const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'))
)
  .concat(SOURCE_FILES);

test('F-KEYCHAIN-1 · lib/supabase.ts auth storage is the SecureStore adapter, never plain AsyncStorage', () => {
  const source = flatten(read('lib/supabase.ts'));
  const storageEntries = [...source.matchAll(/\bstorage:\s*([A-Za-z0-9_$.]+)/g)];
  assert.equal(
    storageEntries.length,
    1,
    'lib/supabase.ts must configure exactly one auth storage'
  );
  assert.equal(
    storageEntries[0][1],
    'secureSessionStorage',
    `auth.storage points at ${JSON.stringify(storageEntries[0][1])}, not the SecureStore adapter`
  );
  assert.match(
    source,
    /import \{ secureSessionStorage \} from '\.\/secureSessionStorage';/,
    'the adapter must come from lib/secureSessionStorage.ts'
  );
  assert.doesNotMatch(
    source,
    /AsyncStorage/,
    'lib/supabase.ts must not reference AsyncStorage at all — the adapter owns the legacy surface'
  );
});

test('F-KEYCHAIN-2 · the wiring module builds the adapter from the core with the three real surfaces', () => {
  const source = flatten(read('lib/secureSessionStorage.ts'));
  assert.match(
    source,
    /export const secureSessionStorage = createSecureSessionStorage\(\{/,
    'the exported adapter must be built by the core factory'
  );
  assert.match(
    source,
    /from '\.\/secureSessionStorageCore';/,
    'the factory must come from the pure core module'
  );
  assert.match(
    source,
    /try \{ return require\('expo-secure-store'\)/,
    "loadSecureStore must be a try/caught require('expo-secure-store')"
  );
  assert.match(source, /catch \{ return null; \}/, 'a throwing require must read as null');
  assert.match(source, /legacyStorage: AsyncStorage/, 'the migration source is AsyncStorage');
  assert.match(source, /isDev: __DEV__/, 'dev fallback vs hard failure is decided by __DEV__');
});

test('F-KEYCHAIN-3 · one wiring path: only the wiring imports the core, only lib/supabase.ts imports the wiring', () => {
  const coreImporters = sourceFiles.filter((path) =>
    /from '[^']*secureSessionStorageCore'/.test(flatten(read(path)))
  );
  assert.deepEqual(
    coreImporters,
    ['lib/secureSessionStorage.ts'],
    'a second build of the adapter would fork the session storage'
  );
  const wiringImporters = sourceFiles.filter((path) =>
    /(from|require\()\s*'[^']*\/secureSessionStorage'/.test(flatten(read(path)))
  );
  assert.deepEqual(
    wiringImporters,
    ['lib/supabase.ts'],
    'only the Supabase client may consume the session adapter'
  );
});

test('F-KEYCHAIN-4 · no app code names the session key outside the adapter', () => {
  // Non-vacuity: the walk must actually have covered the app surface.
  assert.ok(sourceFiles.length > 50, `walk found only ${sourceFiles.length} files`);
  for (const expected of ['lib/supabase.ts', 'lib/AuthContext.tsx', 'App.tsx']) {
    assert.ok(sourceFiles.includes(expected), `walk missed ${expected}`);
  }
  const offenders = sourceFiles.filter((path) => {
    const code = stripComments(read(path));
    return /auth-token/i.test(code) || /['"`]sb-/.test(code);
  });
  assert.deepEqual(
    offenders,
    [],
    'the session key is reachable only through the adapter — never by literal'
  );
});
