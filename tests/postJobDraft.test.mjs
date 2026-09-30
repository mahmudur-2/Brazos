import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
// RUN a4 (2026-09-05): lib/pricingMode.ts's own URL. Unlike the three imports
// stubbed below it is a REAL module here — it is import-free, so the data-URL
// module can load it for real once the relative specifier is made absolute
// (the tests/ownJobCard.test.mjs rewrite).
const pricingModeUrl = new URL('../lib/pricingMode.ts', import.meta.url).href;

function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/postJobDraft.ts EXECUTED, not just pattern-matched — the mode.test.mjs
// arrangement. Its native dependencies (AsyncStorage, and since Batch H the
// dialog used to surface a persistently failing save) are replaced with
// in-memory doubles read through globalThis at call time, so each test can
// swap in a fresh store and count the alerts a failure produced.
globalThis.__draftTestAlerts = [];
const draftModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/postJobDraft.ts'), { mode: 'strip' });
  let stubbed = js.replace(
    /import AsyncStorage from '@react-native-async-storage\/async-storage';/,
    'const AsyncStorage = {' +
      ' getItem: async (k) => (globalThis.__draftTestStore.has(k) ? globalThis.__draftTestStore.get(k) : null),' +
      ' setItem: async (k, v) => {' +
      '   if (globalThis.__draftTestStoreFailWrites > 0) { globalThis.__draftTestStoreFailWrites--; throw new Error("disk full"); }' +
      '   globalThis.__draftTestStore.set(k, String(v));' +
      ' },' +
      ' removeItem: async (k) => { globalThis.__draftTestStore.delete(k); },' +
      ' };'
  );
  assert.notEqual(stubbed, js, 'the AsyncStorage import must be found and stubbed');
  const withDialog = stubbed.replace(
    /import \{ alertAsync \} from '\.\/dialog';/,
    'const alertAsync = async (title, message) => { globalThis.__draftTestAlerts.push({ title, message }); };'
  );
  assert.notEqual(withDialog, stubbed, 'the dialog import must be found and stubbed');
  stubbed = withDialog;
  // n9: the crash reporter is a nullable seam in the app (a caught require that
  // resolves to null off-device) and null here, so the capture beside each
  // console.error is a no-op.
  const withSentry = stubbed.replace(
    /import \{ Sentry \} from '\.\/observability\/sentry';/,
    'const Sentry = null;'
  );
  assert.notEqual(withSentry, stubbed, 'the Sentry import must be found and stubbed');
  stubbed = withSentry;
  // RUN a4: the mode read is REAL, not a stub — lib/pricingMode.ts is
  // import-free, so only its specifier needs making absolute for a data URL to
  // resolve it. Rewritten, never replaced: the allow-list this file depends on
  // must be the shipped one.
  const withPricingMode = stubbed.replace(
    "from './pricingMode';",
    () => `from '${pricingModeUrl}';`
  );
  assert.notEqual(withPricingMode, stubbed, 'the pricingMode import must be found');
  stubbed = withPricingMode;
  assert.ok(
    !stubbed.includes("'./dialog'") &&
      !stubbed.includes("'./observability/sentry'") &&
      !stubbed.includes("'./pricingMode'"),
    'no unresolvable relative import may survive stubbing'
  );
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
  // RUN a4 (2026-09-05): the posting choice, blank-draft value = the default.
  pricingMode: 'open_bids',
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
    // 2026-09-30 (idea 2): a reused past job is a route seed too — an explicit fresh start that a
    // stale draft must not override.
    /const hasRouteSeed = !!\(\s*params\?\.initialTitle \|\|\s*params\?\.initialDescription \|\|\s*params\?\.initialCategory \|\|\s*reuseJobId\s*\)/
  );

  // Autosave only fires once restore has resolved, so it can never clobber a
  // draft it hasn't read yet with the screen's still-blank initial state.
  assert.match(source, /if \(!isFreshPost \|\| !draftReady \|\| !draftUserId\) return;/);
  // M-7: the object is built once, so the keep-on-Back check reads the
  // same record the autosave writes.
  assert.match(source, /const draft = \{\s*title,\s*description,\s*category,/);
  assert.match(source, /draftHasContentRef\.current = draftHasContent\(draft\);\s*void savePostJobDraft\(draftUserId, draft\);/);

  // Restored media is treated as owned by this session (nothing published
  // references it yet), so it is deletable on removal or re-abandonment the
  // same way a freshly-picked photo is.
  assert.match(source, /for \(const url of draft\.photos\) sessionUploadsRef\.current\.add\(url\);/);
  assert.match(source, /for \(const url of draft\.videos\) sessionUploadsRef\.current\.add\(url\);/);
});

test('the draft is cleared on publish and on an empty abandon, kept on Back with content, never cleared on app kill', async () => {
  const source = codeOnly(await read('screens/PostJobScreen.tsx'));

  // Cleared after a successful fresh publish (stale record, nothing left to
  // resume) — inside the same `!isEditing` branch createJob's success path
  // already uses, so it can't fire for edit or (via the separate sendOffer
  // path) for a hire request.
  assert.match(
    source,
    /if \(!isEditing\) \{\s*maybePromptForPush\('Get told the moment a worker bids on your job\.'\);\s*if \(savedJob\) setPublishedJob\(savedJob\);\s*if \(draftUserId\) void clearPostJobDraft\(draftUserId\);/
  );

  // 2026-09-26 (the refresh, audit M-7): a graceful unmount (Back out of the
  // wizard) KEEPS a fresh post that has content — draft and media together,
  // so a later "Post a job" never restores text pointing at deleted photos —
  // and abandons everything else exactly as before: the session's uploads
  // deleted and an empty fresh draft cleared, in the same branch.
  assert.match(
    source,
    /if \(!uploadsCommittedRef\.current && !submittingRef\.current\) \{\s*const keepDraft = isFreshPost && !!draftUserId && draftHasContentRef\.current;\s*if \(!keepDraft\) \{\s*cleanupSessionUploads\(\);\s*if \(isFreshPost && draftUserId\) void clearPostJobDraft\(draftUserId\);\s*\}/
  );
  // …and a kept draft has its one explicit delete on the My Jobs card, which
  // takes the draft's never-published media with it.
  const hub = codeOnly(await read('screens/MyJobsHubScreen.tsx'));
  assert.match(hub, /accessibilityLabel="Discard draft"/);
  assert.match(
    hub,
    /await Promise\.all\(\[\.\.\.draft\.photos, \.\.\.draft\.videos\]\.map\(\(url\) => deleteJobPhoto\(url\)\)\);\s*await clearPostJobDraft\(userId\);/
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

// ---------------------------------------------------------------------------
// RUN a4 (2026-09-05): the posting choice survives the same kill the rest of
// the draft survives, and a draft written before a4 reads as the default.
// ---------------------------------------------------------------------------

test('the posting choice round-trips, and a pre-a4 draft reads as open bids', async () => {
  const mod = await draftModule;
  globalThis.__draftTestStore = new Map();

  await mod.savePostJobDraft('user-a', { ...blankDraft, pricingMode: 'posted_price' });
  assert.equal((await mod.loadPostJobDraft('user-a'))?.pricingMode, 'posted_price');

  // A draft stored before this run carries no mode at all. The allow-list
  // reads that as open bids — the same answer jobs.pricing_mode's own default
  // gives — rather than leaving it undefined for the wizard to seed from.
  const { pricingMode, ...withoutMode } = blankDraft;
  globalThis.__draftTestStore.set(
    mod.draftStorageKey('user-b'),
    JSON.stringify({ ...withoutMode, title: 'saved before a4' })
  );
  const legacy = await mod.loadPostJobDraft('user-b');
  assert.equal(legacy?.title, 'saved before a4');
  assert.equal(legacy?.pricingMode, 'open_bids');
});

// ---------------------------------------------------------------------------
// Batch H (F-042): a failing save retries once, then surfaces — never a
// console line as the only handling, never an alert per keystroke.
// ---------------------------------------------------------------------------

test('a transient write failure is absorbed by the retry, with no alert', async () => {
  const mod = await draftModule;
  globalThis.__draftTestStore = new Map();
  globalThis.__draftTestAlerts = [];
  globalThis.__draftTestStoreFailWrites = 1;

  await mod.savePostJobDraft('user-a', { ...blankDraft, title: 'kept' });

  assert.equal((await mod.loadPostJobDraft('user-a'))?.title, 'kept');
  assert.equal(globalThis.__draftTestAlerts.length, 0, 'a recovered save must not nag');
});

test('a persistent write failure alerts once per streak and re-arms on success', async () => {
  const mod = await draftModule;
  globalThis.__draftTestStore = new Map();
  globalThis.__draftTestAlerts = [];

  // Two autosaves during a dead-storage streak: both attempts of each fail.
  globalThis.__draftTestStoreFailWrites = 4;
  await mod.savePostJobDraft('user-a', { ...blankDraft, title: 'lost 1' });
  await mod.savePostJobDraft('user-a', { ...blankDraft, title: 'lost 2' });
  assert.equal(globalThis.__draftTestAlerts.length, 1, 'one streak, one alert');
  assert.equal(globalThis.__draftTestAlerts[0].title, 'Draft not saving');

  // Storage recovers, then dies again: the warning must re-arm.
  globalThis.__draftTestStoreFailWrites = 0;
  await mod.savePostJobDraft('user-a', { ...blankDraft, title: 'saved' });
  globalThis.__draftTestStoreFailWrites = 2;
  await mod.savePostJobDraft('user-a', { ...blankDraft, title: 'lost 3' });
  assert.equal(globalThis.__draftTestAlerts.length, 2, 'a new streak alerts again');
});
