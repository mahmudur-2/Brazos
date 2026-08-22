import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ---------------------------------------------------------------------------
// SecureStore-backed auth session storage — the core EXECUTED as facts, not
// restated as text (the themeResolution.test.mjs arrangement). The core is
// pure and dependency-injected, so nothing needs stubbing by regex: the
// native SecureStore surface, the legacy AsyncStorage surface and `__DEV__`
// are all handed in as fakes.
//
// The fake SecureStore is deliberately STRICTER than the real one: the real
// native module fails SILENTLY on a key containing anything outside
// [A-Za-z0-9._-], so the fake asserts instead — an unsanitized key becomes a
// loud failure here rather than a silent on-device data loss.
// ---------------------------------------------------------------------------

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const core = await import(
  toDataUrl(stripTypeScriptTypes(await read('lib/secureSessionStorageCore.ts'), { mode: 'strip' }))
);
const { chunkValue, createSecureSessionStorage, sanitizeStorageKey } = core;

const LEGAL_KEY = /^[A-Za-z0-9._-]+$/;

class FakeSecureStore {
  constructor() {
    this.map = new Map();
    this.keysSeen = [];
    this.failReadsFor = new Set();
    this.stopAfterWrites = Infinity;
    this.writes = 0;
  }
  assertKey(key) {
    assert.match(
      key,
      LEGAL_KEY,
      `illegal SecureStore key reached the native call: ${JSON.stringify(key)}`
    );
    this.keysSeen.push(key);
  }
  async getItemAsync(key) {
    this.assertKey(key);
    if (this.failReadsFor.has(key)) throw new Error('keychain refused the read');
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async setItemAsync(key, value) {
    this.assertKey(key);
    if (this.writes >= this.stopAfterWrites) throw new Error('interrupted before completion');
    this.writes += 1;
    this.map.set(key, String(value));
  }
  async deleteItemAsync(key) {
    this.assertKey(key);
    this.map.delete(key);
  }
}

class FakeLegacyStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.reads = 0;
  }
  async getItem(key) {
    this.reads += 1;
    return this.map.has(key) ? this.map.get(key) : null;
  }
  async setItem(key, value) {
    this.map.set(key, String(value));
  }
  async removeItem(key) {
    this.map.delete(key);
  }
}

const KEY = 'sb-staging-auth-token';

/** Session-shaped, ~5.5KB, three chunks at the 2000-byte ceiling. Two calls
 *  with different single-character fills produce EQUAL-LENGTH values. */
const bigSession = (fill) =>
  JSON.stringify({
    access_token: fill.repeat(3600),
    refresh_token: fill.repeat(1800),
    user: { id: 'user-1', email: 'someone@example.com' },
  });

const chunkKeysOf = (secure, base) =>
  [...secure.map.keys()].filter((key) => key.startsWith(`${base}.c`));

function makeAdapter({
  secure = new FakeSecureStore(),
  legacy = new FakeLegacyStorage(),
  isDev = false,
  available = true,
} = {}) {
  const warnings = [];
  const infos = [];
  const adapter = createSecureSessionStorage({
    loadSecureStore: () => (available ? secure : null),
    legacyStorage: legacy,
    isDev,
    warn: (message) => warnings.push(message),
    info: (message) => infos.push(message),
  });
  return { adapter, secure, legacy, warnings, infos };
}

// ---------------------------------------------------------------------------

test('a short value round-trips through the keychain in a single chunk', async () => {
  const { adapter, secure } = makeAdapter();
  await adapter.setItem(KEY, 'compact-session');
  assert.equal(await adapter.getItem(KEY), 'compact-session');
  assert.equal(chunkKeysOf(secure, KEY).length, 1);
  assert.ok(secure.map.has(KEY), 'manifest present under the base key');
});

test('a multi-chunk value round-trips byte-identical and every chunk respects the ceiling', async () => {
  // The dispatch constant: split at or under 2000 bytes (Expo's ceiling is ~2048).
  assert.equal(core.MAX_CHUNK_BYTES, 2000);

  const { adapter, secure } = makeAdapter();
  const value = '§π\u{1F642}' + bigSession('a'); // multibyte lead exercises UTF-8 boundaries
  await adapter.setItem(KEY, value);
  const roundTripped = await adapter.getItem(KEY);
  assert.equal(roundTripped, value);
  assert.equal(Buffer.byteLength(roundTripped, 'utf8'), Buffer.byteLength(value, 'utf8'));

  const keys = chunkKeysOf(secure, KEY);
  assert.ok(keys.length >= 3, `expected several chunks, got ${keys.length}`);
  for (const key of keys) {
    assert.ok(
      Buffer.byteLength(secure.map.get(key), 'utf8') <= 2000,
      `chunk over the 2000-byte ceiling: ${key}`
    );
  }

  // Chunking never splits a surrogate pair, whatever the alignment.
  for (const chunk of chunkValue('\u{1F642}'.repeat(3000))) {
    const first = chunk.charCodeAt(0);
    assert.ok(!(first >= 0xdc00 && first <= 0xdfff), 'chunk starts mid-surrogate');
  }
});

test('(i) overwriting a long value with a short one leaves no surplus chunk readable', async () => {
  const { adapter, secure } = makeAdapter();
  await adapter.setItem(KEY, bigSession('a'));
  assert.ok(chunkKeysOf(secure, KEY).length >= 3, 'precondition: several chunks stored');

  await adapter.setItem(KEY, 'tiny');
  assert.equal(await adapter.getItem(KEY), 'tiny'); // the new value exactly — no stale tail
  const remaining = chunkKeysOf(secure, KEY);
  assert.equal(
    remaining.length,
    1,
    `surplus chunks left readable after shrink: ${remaining.join(', ')}`
  );
});

test('(ii) a read concurrent with an interrupted write never returns a mixture of two writes', async () => {
  // v1 and v2 have the SAME length, so a length check alone could not tell a
  // mixture apart — only the generation scheme can.
  const v1 = bigSession('a');
  const v2 = bigSession('b');
  assert.equal(v1.length, v2.length, 'precondition: equal lengths');

  // Overwrite interrupted after one new chunk: the completion mark (the
  // manifest) never moved, so the read returns the ENTIRE old value.
  const { adapter, secure } = makeAdapter();
  await adapter.setItem(KEY, v1);
  secure.stopAfterWrites = secure.writes + 1;
  await assert.rejects(adapter.setItem(KEY, v2));
  assert.equal(await adapter.getItem(KEY), v1);

  // A FRESH write interrupted before its completion mark reads as absent.
  const fresh = makeAdapter();
  fresh.secure.stopAfterWrites = 1;
  await assert.rejects(fresh.adapter.setItem(KEY, v1));
  assert.equal(await fresh.adapter.getItem(KEY), null);
});

test('(iii) a missing or unreadable chunk reads as absent, never as a truncated session', async () => {
  const value = bigSession('a');

  const missing = makeAdapter();
  await missing.adapter.setItem(KEY, value);
  const missingKeys = chunkKeysOf(missing.secure, KEY);
  missing.secure.map.delete(missingKeys[1]); // remove the middle chunk
  assert.equal(await missing.adapter.getItem(KEY), null);

  const unreadable = makeAdapter();
  await unreadable.adapter.setItem(KEY, value);
  const unreadableKeys = chunkKeysOf(unreadable.secure, KEY);
  unreadable.secure.failReadsFor.add(unreadableKeys[1]); // the keychain throws on it
  assert.equal(await unreadable.adapter.getItem(KEY), null);
});

test('(iv) an illegal-character key is sanitized before every native call and still resolves', async () => {
  // Colon, slashes, space and a query — everything SecureStore silently rejects.
  const hostileKey = 'sb:https://staging.example.co/auth token?v=2';
  const { adapter, secure } = makeAdapter();

  await adapter.setItem(hostileKey, 'value-under-hostile-key');
  assert.equal(await adapter.getItem(hostileKey), 'value-under-hostile-key');
  for (const key of secure.keysSeen) assert.match(key, LEGAL_KEY);

  await adapter.removeItem(hostileKey);
  assert.equal(await adapter.getItem(hostileKey), null);

  // Deterministic and idempotent, so a later read always finds an earlier write.
  const sanitized = sanitizeStorageKey(hostileKey);
  assert.match(sanitized, LEGAL_KEY);
  assert.equal(sanitizeStorageKey(hostileKey), sanitized);
  assert.equal(sanitizeStorageKey(sanitized), sanitized);
});

test('removal clears the manifest and every chunk, orphaning none', async () => {
  const { adapter, secure } = makeAdapter();
  await adapter.setItem(KEY, bigSession('a'));
  assert.ok(secure.map.size >= 4, 'precondition: manifest plus several chunks');

  await adapter.removeItem(KEY);
  assert.equal(
    secure.map.size,
    0,
    `orphaned keychain entries after removal: ${[...secure.map.keys()].join(', ')}`
  );
  assert.equal(await adapter.getItem(KEY), null);
});

test('a legacy AsyncStorage session migrates once, silently, without signing the user out', async () => {
  const value = bigSession('a');
  const legacy = new FakeLegacyStorage({ [KEY]: value });
  const { adapter, secure } = makeAdapter({ legacy });

  // The miss-then-hit read returns the previous value — the user stays signed in.
  assert.equal(await adapter.getItem(KEY), value);
  assert.equal(legacy.map.has(KEY), false, 'the source is cleared after the write-through');
  assert.ok(secure.map.has(KEY), 'the session was written through to the keychain');

  const readsAfterMigration = legacy.reads;
  assert.equal(await adapter.getItem(KEY), value); // served from the keychain now
  await adapter.removeItem(KEY); // sign-out empties the keychain…
  assert.equal(await adapter.getItem(KEY), null);
  assert.equal(
    legacy.reads,
    readsAfterMigration,
    'the previous storage must never be consulted again after migration'
  );
});

test('DEV + missing native module falls back to the previous storage with one unmissable warning', async () => {
  const { adapter, secure, legacy, warnings } = makeAdapter({ available: false, isDev: true });

  await adapter.setItem(KEY, 'dev-session');
  assert.equal(await adapter.getItem(KEY), 'dev-session');
  assert.equal(legacy.map.get(KEY), 'dev-session'); // raw key — exactly the old behavior
  assert.equal(secure.map.size, 0);
  await adapter.removeItem(KEY);
  assert.equal(legacy.map.has(KEY), false);

  assert.equal(warnings.length, 1, 'exactly one warning, however many operations follow');
  assert.match(warnings[0], /FALLBACK/i);
  assert.match(warnings[0], /AsyncStorage|plain/i);
});

test('a production build without the native module fails hard rather than silently downgrading', async () => {
  const { adapter, legacy } = makeAdapter({ available: false, isDev: false });

  await assert.rejects(() => adapter.getItem(KEY), /refusing/);
  await assert.rejects(() => adapter.setItem(KEY, 'x'), /refusing/);
  await assert.rejects(() => adapter.removeItem(KEY), /refusing/);
  assert.equal(legacy.reads, 0, 'plain storage must never be touched in this state');
  assert.equal(legacy.map.size, 0);
});
