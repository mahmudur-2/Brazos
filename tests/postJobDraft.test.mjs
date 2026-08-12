import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/postJobDraft.ts EXECUTED, not just pattern-matched — the mode.test.mjs
// arrangement. Its one native dependency (AsyncStorage) is replaced with an
// in-memory Map read through globalThis at call time, so each test can swap
// in a fresh store.
const draftModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/postJobDraft.ts'), { mode: 'strip' });
  const stubbed = js.replace(
    /import AsyncStorage from '@react-native-async-storage\/async-storage';/,
    'const AsyncStorage = {' +
      ' getItem: async (k) => (globalThis.__draftTestStore.has(k) ? globalThis.__draftTestStore.get(k) : null),' +
      ' setItem: async (k, v) => { globalThis.__draftTestStore.set(k, String(v)); },' +
      ' removeItem: async (k) => { globalThis.__draftTestStore.delete(k); },' +
      ' };'
  );
  assert.notEqual(stubbed, js, 'the AsyncStorage import must be found and stubbed');
  return import(toDataUrl(stubbed));
})();

const blankDraft = {
  title: '',
  description: '',
  category: null,
  location: '',
  coords: null,
  budgetMin: '',
  budgetMax: '',
  address: '',
  scheduledDate: null,
  arrivalStartHour: null,
  arrivalEndHour: null,
  photos: [],
  videos: [],
  step: 0,
};

// Phase 4 DoD: "draft persistence across app kill". Previously PostJobScreen's
// draft state was in-memory only (BUILD_STATE's named gap) — these assertions
// guard the AsyncStorage-backed replacement so it can't silently regress back
// to memory-only, and so the fresh-post-only + clear-on-publish/abandon rules
// stay intact.

test('a fresh post survives in AsyncStorage, editing and hiring never touch it', async () => {
  const source = codeOnly(await read('screens/PostJobScreen.tsx'));
  // The persistence itself moved to lib/postJobDraft.ts in Phase 4 so the
  // My Jobs hub can surface the same draft without duplicating the storage
  // key — the invariants are unchanged, just asserted against both files.
  const draftLib = codeOnly(await read('lib/postJobDraft.ts'));

  assert.match(draftLib, /from '@react-native-async-storage\/async-storage'/);
  // AUD-P1-07: the store is keyed per authenticated user; the old device-global
  // key survives only as the legacy constant the loader deletes.
  assert.match(draftLib, /LEGACY_DRAFT_STORAGE_KEY = 'brazos:postJobDraft:v1'/);
  assert.match(draftLib, /export function draftStorageKey\(userId: string\)/);
  assert.match(source, /from '\.\.\/lib\/postJobDraft'/);

  // Fresh post only — never editing (reloads from the saved job) or hiring
  // (a single quick action with nothing worth resuming).
  assert.match(source, /const isFreshPost = !isEditing && !isHiring;/);

  // Restore is gated behind isFreshPost, and an explicit route seed (Home's
  // search box / category chips) wins over a stale draft rather than being
  // silently overridden by it.
  assert.match(source, /await loadPostJobDraft\(draftUserId\)/);
  assert.match(
    source,
    /const hasRouteSeed = !!\(\s*params\?\.initialTitle \|\|\s*params\?\.initialDescription \|\|\s*params\?\.initialCategory\s*\)/
  );

  // Autosave only fires once restore has resolved, so it can never clobber a
  // draft it hasn't read yet with the screen's still-blank initial state.
  assert.match(source, /if \(!isFreshPost \|\| !draftReady \|\| !draftUserId\) return;/);
  assert.match(source, /void savePostJobDraft\(draftUserId, \{/);

  // Restored media is treated as owned by this session (nothing published
  // references it yet), so it is deletable on removal or re-abandonment the
  // same way a freshly-picked photo is.
  assert.match(source, /for \(const url of draft\.photos\) sessionUploadsRef\.current\.add\(url\);/);
  assert.match(source, /for \(const url of draft\.videos\) sessionUploadsRef\.current\.add\(url\);/);
});

test('the draft is cleared exactly on publish and on a graceful abandon, never on app kill', async () => {
  const source = codeOnly(await read('screens/PostJobScreen.tsx'));

  // Cleared after a successful fresh publish (stale record, nothing left to
  // resume) — inside the same `!isEditing` branch createJob's success path
  // already uses, so it can't fire for edit or (via the separate sendOffer
  // path) for a hire request.
  assert.match(
    source,
    /if \(!isEditing\) \{\s*maybePromptForPush\('Get told the moment a worker bids on your job\.'\);\s*if \(savedJob\) setPublishedJob\(savedJob\);\s*if \(draftUserId\) void clearPostJobDraft\(draftUserId\);/
  );

  // Cleared on a graceful unmount (Back out of the wizard) in the same branch
  // that already deletes that session's uploaded media on abandonment — so a
  // later "Post a job" can never restore text pointing at photos that were
  // just deleted from storage.
  assert.match(
    source,
    /if \(!uploadsCommittedRef\.current && !submittingRef\.current\) \{\s*cleanupSessionUploads\(\);[\s\S]{0,400}if \(isFreshPost && draftUserId\) void clearPostJobDraft\(draftUserId\);/
  );

  // The unmount cleanup this piggybacks on only ever runs on a real component
  // unmount — an app kill terminates the process first, so this file contains
  // no separate "on kill" handler. That absence is intentional, not a gap:
  // it's what leaves the persisted draft (and its media) in place to restore.
  assert.doesNotMatch(source, /AppState\.addEventListener\('change'/);
});

// ---------------------------------------------------------------------------
// AUD-P1-07: the draft slot is per account, and the legacy global slot dies
// ---------------------------------------------------------------------------

test('two accounts on one device have separate draft slots', async () => {
  const mod = await draftModule;
  globalThis.__draftTestStore = new Map();

  assert.notEqual(mod.draftStorageKey('user-a'), mod.draftStorageKey('user-b'));
  assert.match(mod.draftStorageKey('user-a'), /^brazos\.postJobDraft\.v2\.user-a$/);

  await mod.savePostJobDraft('user-a', {
    ...blankDraft,
    title: 'Fix the kitchen sink',
    address: '12 Private Way',
    step: 2,
  });

  assert.equal(
    await mod.loadPostJobDraft('user-b'),
    null,
    "user B must never be handed user A's draft — it holds A's exact service address"
  );

  const restored = await mod.loadPostJobDraft('user-a');
  assert.ok(restored, 'the owning account must still be able to resume its own draft');
  assert.equal(restored.title, 'Fix the kitchen sink');
  assert.equal(restored.address, '12 Private Way');
  assert.equal(restored.step, 2);
});

test('the legacy device-global draft is deleted on first authenticated read, never migrated', async () => {
  const mod = await draftModule;
  const store = new Map();
  globalThis.__draftTestStore = store;
  store.set(
    mod.LEGACY_DRAFT_STORAGE_KEY,
    JSON.stringify({ ...blankDraft, title: 'previous account draft', address: '99 Secret St' })
  );

  const restored = await mod.loadPostJobDraft('user-b');
  assert.equal(restored, null, 'the legacy value must not surface for the next account');
  assert.equal(
    store.has(mod.LEGACY_DRAFT_STORAGE_KEY),
    false,
    'the legacy slot must be deleted on the first authenticated read'
  );
  // Deleted means GONE — not parked under some other key to resurface later.
  assert.equal(store.size, 0, 'nothing may be migrated out of the legacy slot');
});

test('clearing one account leaves the other account untouched', async () => {
  const mod = await draftModule;
  globalThis.__draftTestStore = new Map();

  await mod.savePostJobDraft('user-a', { ...blankDraft, title: 'A draft' });
  await mod.savePostJobDraft('user-b', { ...blankDraft, title: 'B draft' });
  await mod.clearPostJobDraft('user-a');

  assert.equal(await mod.loadPostJobDraft('user-a'), null);
  const b = await mod.loadPostJobDraft('user-b');
  assert.equal(b?.title, 'B draft');
});
