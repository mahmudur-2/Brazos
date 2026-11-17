import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, read } from './loadModule.mjs';

/**
 * R7-a and R7-d (A4-M2) — sign-out is proven, and the phone forgets what
 * belongs to someone else. lib/signOut.ts runs for real against fakes of
 * AsyncStorage, the cache folder, expo-image and the auth client; the auth
 * client's removal goes through the REAL keychain adapter, so a delete that
 * iOS only claimed reaches the person as a failed sign-out.
 */

const KEY = 'sb-test-auth-token';
const core = await loadModule('lib/secureSessionStorageCore.ts', {});

/** The keychain: `keep` true makes every delete a silent no-op (iOS ignores SecItemDelete's status). */
function keychain({ keep = false } = {}) {
  const map = new Map();
  return {
    map,
    getItemAsync: async (k) => (map.has(k) ? map.get(k) : null),
    setItemAsync: async (k, v) => void map.set(k, String(v)),
    deleteItemAsync: async (k) => void (keep ? null : map.delete(k)),
  };
}
const legacy = () => ({ getItem: async () => null, setItem: async () => {}, removeItem: async () => {} });

/** An auth client shaped like auth-js: signOut() removes the stored session through the storage adapter. */
function authOver(storage, { serverDown = false } = {}) {
  const calls = [];
  const remove = async () => {
    await storage.removeItem(KEY); // auth-js _removeSession: a throw here keeps the session and emits nothing
  };
  return {
    calls,
    async signOut(options) {
      calls.push(options?.scope ?? 'global');
      if (serverDown) return { error: { message: 'Network request failed' } };
      await remove();
      return { error: null };
    },
    async _removeSession() {
      calls.push('_removeSession');
      await remove();
    },
    async getSession() {
      return { data: { session: (await storage.getItem(KEY)) ? { user: {} } : null }, error: null };
    },
  };
}

class FakeAsyncStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.keepOnRemove = false;
  }
  async getAllKeys() { return [...this.map.keys()]; }
  async getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  async setItem(k, v) { this.map.set(k, String(v)); }
  async removeItem(k) { if (!this.keepOnRemove) this.map.delete(k); }
  async multiRemove(keys) { for (const k of keys) await this.removeItem(k); }
  async multiGet(keys) { return keys.map((k) => [k, this.map.has(k) ? this.map.get(k) : null]); }
}

/** The cache folder: a set of paths under 'cache'. */
function fileSystem(paths) {
  const tree = new Set(paths);
  class File {
    constructor(uri) { this.uri = uri; this.name = uri.split('/').pop(); }
    get exists() { return tree.has(this.uri); }
    delete() { tree.delete(this.uri); }
  }
  class Directory {
    constructor(parent, name) { this.uri = name ? `${parent.uri}/${name}` : parent.uri; }
    get exists() { return [...tree].some((p) => p === this.uri || p.startsWith(this.uri + '/')); }
    delete() { for (const p of [...tree]) if (p === this.uri || p.startsWith(this.uri + '/')) tree.delete(p); }
    list() {
      const names = new Set([...tree].filter((p) => p.startsWith(this.uri + '/')).map((p) => p.slice(this.uri.length + 1).split('/')[0]));
      return [...names].map((n) => ([...tree].some((p) => p.startsWith(`${this.uri}/${n}/`)) ? new Directory(this, n) : new File(`${this.uri}/${n}`)));
    }
  }
  return { tree, module: { Directory, File, Paths: { cache: { uri: 'cache' } } } };
}

async function loadSignOut({ auth, storage = new FakeAsyncStorage(), files = fileSystem([]), image = null, unregister }) {
  const state = { unregistered: 0, signedUrlsCleared: 0, order: [] };
  const draft = await loadModule('lib/postJobDraft.ts', {
    '@react-native-async-storage/async-storage': { default: storage },
    './dialog': { alertAsync: async () => {} },
    './observability/sentry': { Sentry: null },
    './pricingMode': { pricingModeFrom: () => 'range' },
  });
  const originalRequire = globalThis.require;
  globalThis.require = (name) => (name === 'expo-image' ? image : null);
  const signOut = await loadModule('lib/signOut.ts', {
    '@react-native-async-storage/async-storage': { default: storage },
    'expo-file-system': files.module,
    './postJobDraft': draft,
    './pushNotifications': {
      unregisterPushToken: unregister ?? (async () => { state.unregistered += 1; state.order.push('unregister'); }),
    },
    './sharing': { SHARE_DIR_NAME: 'share-cache' },
    './storage': { clearSignedUrls: () => { state.signedUrlsCleared += 1; } },
    './supabase': { supabase: { auth } },
  });
  return { signOut, draft, state, restore: () => { globalThis.require = originalRequire; } };
}

// ---------------------------------------------------------------- R7-a
test('R7-a: a sign-out whose keychain delete only claimed success is reported as not finished', async () => {
  const kept = core.createSecureSessionStorage({ loadSecureStore: () => keychain({ keep: true }), legacyStorage: legacy(), isDev: false, warn() {}, info() {} });
  await kept.setItem(KEY, 'session');
  const auth = authOver(kept);
  const { signOut, state, restore } = await loadSignOut({ auth });
  try {
    assert.equal(await signOut.endSession(), false, 'the session is still on the phone: never "signed out"');
    assert.deepEqual(auth.calls, ['global', 'local', '_removeSession'], 'server sign-out, then the device-only removal');
    assert.equal(state.unregistered, 1, 'push is detached first');
    assert.equal(await kept.getItem(KEY), 'session');
    assert.equal(signOut.SIGN_OUT_UNFINISHED_MESSAGE, 'Brazos could not finish signing you out on this phone. Try again.');
  } finally {
    restore();
  }
});

test('R7-a: a normal sign-out and an offline one both end proven', async () => {
  for (const serverDown of [false, true]) {
    const store = keychain();
    const storage = core.createSecureSessionStorage({ loadSecureStore: () => store, legacyStorage: legacy(), isDev: false, warn() {}, info() {} });
    await storage.setItem(KEY, 'session');
    const { signOut, restore } = await loadSignOut({ auth: authOver(storage, { serverDown }) });
    try {
      assert.equal(await signOut.endSession(), true, serverDown ? 'offline: ended on this phone' : 'online');
      // Only the adapter's '.migrated' marker ('1', written by the proof read) may remain.
      assert.deepEqual([...store.map.entries()].filter(([k]) => !k.endsWith('.migrated')), []);
    } finally {
      restore();
    }
  }
});

test('R7-a: a hung push unregister holds sign-out for LOGOUT_PUSH_UNREGISTER_MS at most', async (t) => {
  const store = keychain();
  const storage = core.createSecureSessionStorage({ loadSecureStore: () => store, legacyStorage: legacy(), isDev: false, warn() {}, info() {} });
  const { signOut, restore } = await loadSignOut({ auth: authOver(storage), unregister: () => new Promise(() => {}) });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    assert.equal(signOut.LOGOUT_PUSH_UNREGISTER_MS, 5000);
    let ended = null;
    signOut.endSession().then((v) => (ended = v));
    await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(5000);
    for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
    assert.equal(ended, true);
  } finally {
    restore();
  }
});

test('R7-a: the app asks lib/signOut.ts, and only a proven sign-out reads as one', () => {
  const ctx = read('lib/AuthContext.tsx');
  assert.match(ctx, /const ended = await endSession\(\);\s*return \{ error: ended \? null : \{ message: SIGN_OUT_UNFINISHED_MESSAGE \} \};/);
  // B1: a suspension no longer signs out (the suspended screen shows instead); its Sign Out is this logout.
  assert.doesNotMatch(ctx, /setBannedNotice|bannedNotice/);
  assert.doesNotMatch(ctx, /supabase\.auth\.signOut\(/, 'no sign-out in AuthContext goes around lib/signOut.ts');
});

// ---------------------------------------------------------------- R7-d
const DRAFT = (id) => `brazos.postJobDraft.v2.${id}`;

test('R7-d: at launch the phone removes every job draft but the signed-in person’s, and keeps the push keys', async () => {
  const storage = new FakeAsyncStorage({
    [DRAFT('a')]: '{"location":"12 Elm St"}',
    [DRAFT('b')]: '{"location":"9 Oak Ave"}',
    'brazos:postJobDraft:v1': '{"location":"1 Old Rd"}',
    'brazos.deviceOwner.v1': 'b',
    'brazos.push.pendingDeactivation': 'token',
  });
  const files = fileSystem(['cache/share-cache/photo.jpg']);
  const { signOut, state, restore } = await loadSignOut({ auth: {}, storage, files });
  try {
    assert.equal(await signOut.forgetDevice('b'), true);
    assert.deepEqual([...storage.map.keys()].sort(), ['brazos.deviceOwner.v1', 'brazos.push.pendingDeactivation', DRAFT('b')].sort());
    assert.ok(files.tree.has('cache/share-cache/photo.jpg'), 'the same person: their own caches stay');
    assert.equal(state.signedUrlsCleared, 0);
  } finally {
    restore();
  }
});

test('R7-d: after sign-out every draft and every photo cache is gone, proven', async () => {
  const storage = new FakeAsyncStorage({ [DRAFT('b')]: '{"location":"9 Oak Ave"}', 'brazos.deviceOwner.v1': 'b', 'brazos.theme': 'dark' });
  const picked = 'cache/0B8C4F6E-1D2A-4E3B-9C7D-5A6B7C8D9E0F.jpg';
  const files = fileSystem(['cache/share-cache/photo.jpg', 'cache/ImagePicker/1.heic', picked, 'cache/other-module/keep.bin', 'cache/notes.txt']);
  const image = { Image: { clearDiskCache: async () => ((image.disk = true), true), clearMemoryCache: async () => ((image.memory = true), true) } };
  const { signOut, state, restore } = await loadSignOut({ auth: {}, storage, files, image });
  try {
    assert.equal(await signOut.forgetDevice(null), true);
    assert.equal(storage.map.has(DRAFT('b')), false);
    assert.equal(storage.map.get('brazos.deviceOwner.v1'), '');
    assert.equal(storage.map.get('brazos.theme'), 'dark', 'flags with no personal content stay');
    assert.deepEqual([...files.tree].sort(), ['cache/notes.txt', 'cache/other-module/keep.bin'], 'only the photo caches go');
    assert.deepEqual([image.disk, image.memory], [true, true]);
    assert.equal(state.signedUrlsCleared, 1);
  } finally {
    restore();
  }
});

test('R7-d: a removal that fails says so and runs again at the next launch', async () => {
  const storage = new FakeAsyncStorage({ [DRAFT('b')]: '{"location":"9 Oak Ave"}', 'brazos.deviceOwner.v1': 'b' });
  let refuse = true;
  const image = { Image: { clearDiskCache: async () => !refuse, clearMemoryCache: async () => true } };
  storage.keepOnRemove = true;
  const { signOut, restore } = await loadSignOut({ auth: {}, storage, image });
  try {
    assert.equal(await signOut.forgetDevice(null), false, 'a draft that stays is never reported removed');
    assert.equal(storage.map.get('brazos.deviceOwner.v1'), 'b', 'the caches are not marked done: the next launch clears them again');
    storage.keepOnRemove = false;
    refuse = false;
    assert.equal(await signOut.forgetDevice(null), true);
    assert.equal(storage.map.has(DRAFT('b')), false);
  } finally {
    restore();
  }
});

test('2b: clearPostJobDraft tells its caller when the draft is still there', async () => {
  const storage = new FakeAsyncStorage({ [DRAFT('b')]: '{"location":"9 Oak Ave"}' });
  const { draft, restore } = await loadSignOut({ auth: {}, storage });
  const log = console.error;
  console.error = () => {};
  try {
    storage.keepOnRemove = true;
    assert.equal(await draft.clearPostJobDraft('b'), false);
    storage.keepOnRemove = false;
    assert.equal(await draft.clearPostJobDraft('b'), true);
    assert.equal(storage.map.size, 0);
  } finally {
    console.error = log;
    restore();
  }
});

test('R7-d: AuthContext runs forgetDevice at launch and on every change of person; the share folder name is the real one', () => {
  const ctx = read('lib/AuthContext.tsx');
  assert.match(ctx, /const restoredUserId = loading \? undefined : session\?\.user\?\.id \?\? null;/);
  assert.match(ctx, /void forgetDevice\(restoredUserId\);\s*\}, \[restoredUserId\]\);/);
  assert.match(read('lib/sharing.ts'), /export const SHARE_DIR_NAME = 'share-cache';/);
  assert.match(read('lib/postJobDraft.ts'), /return `brazos\.postJobDraft\.v2\.\$\{userId\}`;/);
});

test('A4 wiring (A2), the draft race: after a sign-out no draft save puts a draft back; the signed-in person still saves', async () => {
  const storage = new FakeAsyncStorage({ [DRAFT('b')]: '{"location":"9 Oak Ave"}' });
  const { signOut, draft, restore } = await loadSignOut({ auth: {}, storage });
  const typed = { title: 'Fix the fence', location: '9 Oak Ave' };
  try {
    // A save that starts after the sweep is refused.
    assert.equal(await signOut.forgetDevice(null), true);
    await draft.savePostJobDraft('b', typed);
    assert.equal(storage.map.has(DRAFT('b')), false, 'a signed-out person’s draft is never written back');

    // The retry of a save whose first write failed while the person signed out is refused too.
    assert.equal(await signOut.forgetDevice('b'), true);
    let sweep = null;
    const setItem = storage.setItem.bind(storage);
    let first = true;
    storage.setItem = async (k, v) => {
      if (first) {
        first = false;
        sweep = signOut.forgetDevice(null);
        throw new Error('storage busy');
      }
      return setItem(k, v);
    };
    await draft.savePostJobDraft('b', typed);
    assert.equal(await sweep, true);
    assert.equal(storage.map.has(DRAFT('b')), false, 'the retry came after the sign-out and wrote nothing');

    // The person signed in here keeps saving.
    storage.setItem = setItem;
    assert.equal(await signOut.forgetDevice('b'), true);
    await draft.savePostJobDraft('b', typed);
    assert.equal(storage.map.get(DRAFT('b')), JSON.stringify(typed));
  } finally {
    restore();
  }
});
