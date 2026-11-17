// A4-M5 — the server's two stops. U1: a build below `minimumSupportedVersion` shows 'Update Brazos'
// before sign-in, with one button to the App Store page; a failed or malformed read never stops anyone.
// U3: while `postingEnabled` is false, Post a job shows 'Posting Paused' with the server's own sentence;
// bids, accepts and payments never read the switch. U2: no maintenance lock (nothing reads it).
// lib/remoteConfig.ts and both hooks are executed (tests/loadModule.mjs, every import stubbed; React is a
// small fake that keeps state between renders); the screens' wiring is fenced as source.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { loadModule, read as readRaw, root } from './loadModule.mjs';

const read = (rel) => readRaw(rel).replace(/\r\n/g, '\n');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// --- lib/remoteConfig.ts, executed over a fake table --------------------------------------------
let answer = () => ({ data: [], error: null });
const supabase = {
  from(table) {
    assert.equal(table, 'app_config');
    return { select: async (columns) => (assert.equal(columns, 'key, value'), answer()) };
  },
};
const config = await loadModule('lib/remoteConfig.ts', { './supabase': { supabase } });

async function quietly(run) {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
}

test('U1 · versions compare as numbers, part by part; anything that is not a plain version never stops anyone', () => {
  const below = config.appVersionBelow;
  assert.equal(below('1.2.9', '1.10.0'), true, '1.2.9 is below 1.10.0 (as numbers, not as text)');
  assert.equal(below('1.10.0', '1.2.9'), false);
  assert.equal(below('1.0.0', '1.0.1'), true);
  assert.equal(below('1.0.1', '1.0.0'), false);
  assert.equal(below('2.0.0', '10.0.0'), true);
  assert.equal(below('1.0.0', '1.0.0'), false, 'the minimum itself still runs');
  assert.equal(below('1.2', '1.2.0'), false, 'a missing part is 0: 1.2 equals 1.2.0');
  assert.equal(below('1.2', '1.2.1'), true);
  assert.equal(below(' 1.0.0 ', '1.0.1'), true, 'spaces around a version are not part of it');
  for (const bad of ['abc', '', '1.x', '1..0', '-1.0.0', '1.0.0-beta', null, undefined]) {
    assert.equal(below(bad, '99.0.0'), false, `a running version of ${JSON.stringify(bad)} never stops anyone`);
    assert.equal(below('1.0.0', bad), false, `a minimum of ${JSON.stringify(bad)} never stops anyone`);
  }
});

test('U1 · the stop follows the server minimum, and a failed, empty or malformed read never stops anyone', async () => {
  assert.equal(config.FALLBACK.minimumSupportedVersion, '0.0.0');
  assert.equal(config.mustUpdate(config.FALLBACK, '1.0.0'), false, 'the fallback minimum stops no build');
  assert.equal(config.mustUpdate(config.FALLBACK, null), false);

  answer = () => ({ data: [{ key: 'minimumSupportedVersion', value: '99.0.0' }], error: null });
  const raised = await quietly(() => config.fetchRemoteConfig());
  assert.equal(raised.minimumSupportedVersion, '99.0.0');
  assert.equal(config.mustUpdate(raised, '1.0.0'), true, 'a build below the server minimum stops');
  assert.equal(config.mustUpdate(raised, null), false, 'a build that cannot say its version is never stopped');
  assert.equal(config.mustUpdate({ ...config.FALLBACK, minimumSupportedVersion: '1.0.0' }, '1.0.0'), false);

  const failures = [
    () => {
      throw new Error('Network request failed');
    },
    () => ({ data: null, error: { message: 'relation "app_config" does not exist' } }),
    () => ({ data: null, error: null }),
    () => ({ data: [{ key: 'minimumSupportedVersion', value: 99 }], error: null }),
    () => ({ data: [{ key: 'minimumSupportedVersion', value: { major: 99 } }], error: null }),
  ];
  for (const failure of failures) {
    answer = failure;
    const read = await quietly(() => config.fetchRemoteConfig());
    assert.equal(read.minimumSupportedVersion, '0.0.0', 'every failure keeps the fallback minimum');
    assert.equal(config.mustUpdate(read, '1.0.0'), false, 'and so stops no one');
  }
  answer = () => ({ data: [{ key: 'minimumSupportedVersion', value: '1.x' }], error: null });
  const malformed = await quietly(() => config.fetchRemoteConfig());
  assert.equal(config.mustUpdate(malformed, '1.0.0'), false, 'a malformed minimum string stops no one');
});

test('U3 · postingEnabled follows the server; a failed read or a missing row keeps posting open', async () => {
  assert.equal(config.FALLBACK.postingEnabled, true);
  answer = () => ({ data: [{ key: 'postingEnabled', value: false }], error: null });
  assert.equal((await quietly(() => config.fetchRemoteConfig())).postingEnabled, false);
  for (const failure of [
    () => {
      throw new Error('Network request failed');
    },
    () => ({ data: null, error: { message: 'permission denied' } }),
    () => ({ data: [], error: null }),
  ]) {
    answer = failure;
    assert.equal((await quietly(() => config.fetchRemoteConfig())).postingEnabled, true);
  }
});

test('A4-05 · both pause switches read as the server reads them: a present value that is not exactly true is a pause', async () => {
  for (const key of ['postingEnabled', 'paymentsEnabled']) {
    answer = () => ({ data: [{ key, value: true }], error: null });
    assert.equal((await quietly(() => config.fetchRemoteConfig()))[key], true, `${key}: true is on`);
    for (const value of [false, 'false', 'true', 0, 1, null, {}, []]) {
      answer = () => ({ data: [{ key, value }], error: null });
      assert.equal((await quietly(() => config.fetchRemoteConfig()))[key], false, `${key}: ${JSON.stringify(value)} is a pause`);
    }
    // No row, or a failed read: open, as before.
    answer = () => ({ data: [{ key: 'maintenanceMode', value: false }], error: null });
    assert.equal((await quietly(() => config.fetchRemoteConfig()))[key], true, `${key}: no row is open`);
    answer = () => {
      throw new Error('Network request failed');
    };
    assert.equal((await quietly(() => config.fetchRemoteConfig()))[key], true, `${key}: a failed read is open`);
  }
});

test('U1/U3 · the sentences, word for word; the server sentence reaches the screen unchanged', async () => {
  assert.equal(config.UPDATE_STOP_TITLE, 'Update Brazos');
  assert.equal(config.UPDATE_STOP_BODY, 'This version of Brazos is too old. Update it in the App Store to keep using Brazos.');
  assert.equal(config.UPDATE_STOP_ACTION, 'Open App Store');
  assert.equal(config.POSTING_PAUSED_TITLE, 'Posting Paused');
  assert.equal(config.POSTING_PAUSED_MESSAGE, 'Posting is paused right now. Please try again shortly.');
  assert.equal(config.POSTING_PAUSED_ACTION, 'Try Again');
  // Title Case, one line, short (UI-DIRECTION §4).
  for (const label of [config.UPDATE_STOP_ACTION, config.POSTING_PAUSED_ACTION, config.UPDATE_STOP_TITLE, config.POSTING_PAUSED_TITLE]) {
    assert.match(label, /^([A-Z][a-z]*)( [A-Z][a-z]*)*$/, `${label} is in Title Case`);
  }
  // create_job refuses with this same sentence; the app's one error mapper shows it as written.
  globalThis.__DEV__ = false; // what a user of a release build sees
  const { userMessage } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);
  assert.equal(userMessage({ message: config.POSTING_PAUSED_MESSAGE, code: 'P0001' }), config.POSTING_PAUSED_MESSAGE);
  assert.equal(userMessage(config.POSTING_PAUSED_MESSAGE), config.POSTING_PAUSED_MESSAGE);
});

test('U1 · the App Store page is this app: the id is eas.json submit ascAppId', () => {
  const eas = JSON.parse(read('eas.json'));
  const ids = Object.values(eas.submit).map((profile) => profile.ios.ascAppId);
  assert.ok(ids.length >= 1);
  assert.equal(new Set(ids).size, 1, 'one App Store app');
  assert.equal(config.APP_STORE_URL, `https://apps.apple.com/app/id${ids[0]}`);
});

// --- the hooks, executed with a fake React ------------------------------------------------------
/** Keeps hook state between renders: mount() runs the effects once, render() is a re-render with unchanged deps. */
function hookHarness() {
  const slots = [];
  let cursor = 0;
  let effects = [];
  let cleanups = [];
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      const slot = slots[i];
      return [slot.value, (next) => (slot.value = typeof next === 'function' ? next(slot.value) : next)];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useCallback(fn) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { fn };
      return slots[i].fn;
    },
    useEffect(fn) {
      cursor++;
      effects.push(fn);
    },
  };
  return {
    react,
    mount(hook) {
      cursor = 0;
      effects = [];
      const out = hook();
      cleanups = effects.map((effect) => effect());
      return out;
    },
    render(hook) {
      cursor = 0;
      return hook();
    },
    unmount() {
      for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
    },
  };
}

function readsQueue() {
  const reads = [];
  const fetchRemoteConfig = () => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    reads.push({ resolve });
    return promise;
  };
  return { reads, fetchRemoteConfig };
}
const flush = () => new Promise((r) => setImmediate(r));
const raisedTo = (minimum) => ({ ...config.FALLBACK, minimumSupportedVersion: minimum });

async function loadUpdateStop(version) {
  const h = hookHarness();
  const queue = readsQueue();
  const listeners = [];
  let removed = 0;
  const appState = {
    addEventListener(type, listener) {
      listeners.push({ type, listener });
      return { remove: () => (removed += 1) };
    },
  };
  const hooks = await loadModule('hooks/useUpdateStop.ts', {
    react: h.react,
    'react-native': { AppState: appState },
    'expo-constants': { default: { expoConfig: version === undefined ? undefined : { version } } },
    '../lib/remoteConfig': { fetchRemoteConfig: queue.fetchRemoteConfig, mustUpdate: config.mustUpdate },
  });
  const toFront = (state) => listeners.forEach((l) => l.listener(state));
  return { h, hooks, reads: queue.reads, listeners, toFront, removed: () => removed };
}

test('U1 · useUpdateStop starts open, stops below the minimum, and reads again each time the app comes to the front', async () => {
  const { h, hooks, reads, listeners, toFront, removed } = await loadUpdateStop('1.0.0');
  const stop = () => h.render(hooks.useUpdateStop);
  assert.equal(hooks.runningAppVersion(), '1.0.0');
  assert.equal(h.mount(hooks.useUpdateStop), false, 'it starts at false: the launch never waits for the read');
  assert.equal(reads.length, 1, 'one read at launch');
  assert.deepEqual(listeners.map((l) => l.type), ['change']);

  reads[0].resolve(raisedTo('2.0.0'));
  await flush();
  assert.equal(stop(), true, 'a build below the server minimum stops');

  toFront('background');
  toFront('inactive');
  assert.equal(reads.length, 1, 'only coming to the front reads again');
  toFront('active');
  assert.equal(reads.length, 2);
  reads[1].resolve(config.FALLBACK); // what a failed read resolves to
  await flush();
  assert.equal(stop(), false, 'a failed read lifts the stop: it never holds anyone');

  // Two overlapping reads: only the newest decides, whatever order they answer in.
  toFront('active');
  toFront('active');
  reads[3].resolve(config.FALLBACK);
  await flush();
  reads[2].resolve(raisedTo('2.0.0'));
  await flush();
  assert.equal(stop(), false, 'an older read that answers late does not decide');

  // Leaving: the listener goes, and a read still running sets nothing.
  toFront('active');
  h.unmount();
  assert.equal(removed(), 1, 'the AppState listener is removed');
  reads[4].resolve(raisedTo('2.0.0'));
  await flush();
  assert.equal(stop(), false);
});

test('U1 · a build that cannot say its version is never stopped', async () => {
  const { h, hooks, reads } = await loadUpdateStop(undefined);
  assert.equal(hooks.runningAppVersion(), null);
  h.mount(hooks.useUpdateStop);
  reads[0].resolve(raisedTo('99.0.0'));
  await flush();
  assert.equal(h.render(hooks.useUpdateStop), false);
});

test('U3 · usePostingPaused starts open, pauses only on the server false, and "Try Again" reads again', async () => {
  const h = hookHarness();
  const { reads, fetchRemoteConfig } = readsQueue();
  const hooks = await loadModule('hooks/usePostingPaused.ts', {
    react: h.react,
    '../lib/remoteConfig': { fetchRemoteConfig },
  });
  const state = () => h.render(hooks.usePostingPaused);
  const first = h.mount(hooks.usePostingPaused);
  assert.equal(first.paused, false, 'the form is never held back by a slow read');
  assert.equal(reads.length, 1, 'one read when the screen opens');
  assert.equal(state().checking, true);
  assert.equal(state().paused, false);

  reads[0].resolve({ ...config.FALLBACK, postingEnabled: false });
  await flush();
  assert.deepEqual([state().paused, state().checking], [true, false]);

  state().recheck(); // 'Try Again'
  assert.equal(reads.length, 2);
  assert.deepEqual([state().paused, state().checking], [true, true], 'the notice stays while the button spins');
  reads[1].resolve(config.FALLBACK); // a failed read is FALLBACK: posting open
  await flush();
  assert.deepEqual([state().paused, state().checking], [false, false]);

  // Overlapping reads: the newest decides.
  state().recheck();
  state().recheck();
  reads[3].resolve(config.FALLBACK);
  await flush();
  reads[2].resolve({ ...config.FALLBACK, postingEnabled: false });
  await flush();
  assert.equal(state().paused, false, 'an older read that answers late does not decide');

  // Leaving the screen: a read still running sets nothing.
  state().recheck();
  h.unmount();
  reads[4].resolve({ ...config.FALLBACK, postingEnabled: false });
  await flush();
  assert.equal(state().paused, false);
});

// --- the wiring, as source -----------------------------------------------------------------------
test('[static] U1 · App.tsx: the stop comes before the loader and sign-in, and it reports to the launch layer', () => {
  const app = stripComments(read('App.tsx'));
  assert.match(app, /import \{ useUpdateStop \} from '\.\/hooks\/useUpdateStop';/);
  assert.match(app, /import \{ UpdateStopScreen \} from '\.\/components\/StopNotice';/);
  const body = app.slice(app.indexOf('function RootNavigator'));
  const hook = body.indexOf('const updateStop = useUpdateStop();');
  const stop = body.indexOf('if (updateStop) return <UpdateStopScreen />;');
  const loader = body.indexOf("if (loading || (user && (suspended === null || legal.state === 'loading' || setup.state === 'loading')))");
  const signIn = body.indexOf('if (!user) return <AuthFlow />;');
  for (const [name, at] of Object.entries({ hook, stop, loader, signIn })) assert.ok(at > 0, `${name} is found`);
  assert.ok(hook < stop && stop < loader && loader < signIn, 'the stop comes first, before the loader and sign-in');
  // Every hook of RootNavigator is called before the stop's early return (React's rule of hooks).
  assert.doesNotMatch(body.slice(stop, signIn), /\buse[A-Z]\w*\(/);
  assert.match(body, /const drawsContent = updateStop \|\| \(!holdsLoader && !reachesTabs\);/);
});

test('[static] U1/U3 · StopNotice: built from the foundation parts, one main button, the copy from lib/remoteConfig', () => {
  const src = stripComments(read('components/StopNotice.tsx'));
  assert.match(src, /import \{ Button, Card \} from '\.\.\/ui\/primitives';/);
  assert.equal(src.match(/<Button\b/g)?.length, 1, 'one button per view');
  assert.doesNotMatch(src, /<Button[^>]*variant=/, 'it is the main button');
  assert.match(src, /Linking\.openURL\(APP_STORE_URL\)/);
  assert.doesNotMatch(src, /Alert\.alert|#[0-9a-fA-F]{3,8}\b/);
  // No visible sentence is written here: each comes from lib/remoteConfig.ts.
  for (const copy of [config.UPDATE_STOP_TITLE, config.UPDATE_STOP_BODY, config.POSTING_PAUSED_MESSAGE, 'Try Again', 'Open App Store']) {
    assert.ok(!src.includes(copy), `${copy} is not written in the component`);
  }
});

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

test('[static] U2/U3 · only Post a job may read postingEnabled; nothing reads maintenanceMode', () => {
  const files = ['App.tsx', ...['lib', 'hooks', 'screens', 'components', 'navigation', 'modes', 'ui'].flatMap(sourceFiles)];
  const readers = (word) => files.filter((f) => new RegExp(`\\b${word}\\b`).test(stripComments(read(f))));
  const posting = readers('postingEnabled');
  for (const f of posting) {
    assert.ok(['lib/remoteConfig.ts', 'hooks/usePostingPaused.ts', 'screens/PostJobScreen.tsx'].includes(f), `${f} reads postingEnabled: bids, accepts and payments never do`);
  }
  assert.ok(posting.includes('hooks/usePostingPaused.ts'));
  assert.deepEqual(readers('maintenanceMode'), ['lib/remoteConfig.ts'], 'U2: this version has no maintenance lock');
  assert.deepEqual(readers('maintenanceMessage'), ['lib/remoteConfig.ts']);
});

test('[static] U3 (A4 wiring A3) · Post a job: a post and an offer to a worker wait behind the paused notice, before any upload; an edit never does', () => {
  const post = stripComments(read('screens/PostJobScreen.tsx'));
  assert.match(post, /import \{ usePostingPaused \} from '\.\.\/hooks\/usePostingPaused';/);
  assert.match(post, /import \{ PostingPausedNotice \} from '\.\.\/components\/StopNotice';/);
  // create_job and a direct create_offer refuse while paused; update_job_details does not.
  assert.match(post, /const posting = usePostingPaused\(\);\s*const postingPaused = !isEditing && posting\.paused;/);
  // The notice takes the form's place, so no picker or uploader is on screen while paused.
  assert.match(
    post,
    /\) : postingPaused \? \(\s*<PostingPausedNotice checking=\{posting\.checking\} onRetry=\{posting\.recheck\} \/>\s*\) : \(\s*<KeyboardAvoid/
  );
  const notice = post.indexOf('<PostingPausedNotice');
  assert.ok(notice > 0 && notice < post.indexOf('<MediaUploader'), 'the notice comes before every uploader');
  // The header's step link waits too; the way back stays.
  assert.match(post, /rightLabel=\{postingPaused \? undefined : advanceLabel\}\s*onPressRight=\{postingPaused \? undefined : handleContinue\}/);
  assert.match(post, /onBack=\{handleBack\}/);
});
