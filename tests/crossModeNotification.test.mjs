import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Stage 4D batch 1a, commit 4 — cross-mode notification routing, EXECUTED.
 *
 * The contract: a notification whose destination is OWNED by the other mode
 * (ClientJobDetail -> customer; WorkerJob / JobDetail -> worker) prompts the
 * one authoritative switchMode() — mandatory confirmation included, inside
 * ModeProvider — and routes only AFTER the switch resolves true. Declining
 * drops the navigation. A same-tree destination (Chat, ProfileMain) never
 * triggers a switch. While mode resolution is pending (cold start), the gate
 * stands down and the dispatch keeps the both-trees contract.
 *
 * This runs the REAL lib/notificationRoutes.ts: its two runtime imports
 * (fetchJobById, navigateAcrossTabs) are replaced with test doubles before
 * the module is loaded, so what executes is the module's own logic, not a
 * restatement of it.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// --- Load the real module with its effectful imports stubbed ---------------

const calls = { navigate: [], fetch: [] };
let fetchResult = { data: null, error: null };
globalThis.__crossMode_fetchJobById = async (jobId) => {
  calls.fetch.push(jobId);
  return fetchResult;
};
globalThis.__crossMode_navigateAcrossTabs = (...args) => {
  calls.navigate.push(args);
};

let js = stripTypeScriptTypes(read('lib/notificationRoutes.ts'), { mode: 'strip' });
const replacements = [
  [
    "import { fetchJobById } from './jobs';",
    'const fetchJobById = globalThis.__crossMode_fetchJobById;',
  ],
  [
    "import { navigateAcrossTabs } from './navigationRef';",
    'const navigateAcrossTabs = globalThis.__crossMode_navigateAcrossTabs;',
  ],
];
for (const [from, to] of replacements) {
  assert.ok(js.includes(from), `expected the runtime import: ${from}`);
  js = js.replace(from, to);
}
assert.ok(
  !js.includes("'./jobs'") && !js.includes("'./navigationRef'"),
  'both runtime imports must be stubbed before the module loads'
);

const { canRouteNotification, handleNotificationData } = await import(toDataUrl(js));

/** A controllable bridge double: mode is fixed, the switch is scripted. */
function makeBridge(mode, switchScript) {
  const bridge = {
    switchCalls: [],
    getMode: () => mode,
    switchMode: (target, options) => {
      bridge.switchCalls.push({ target, options });
      return switchScript(target, options);
    },
  };
  return bridge;
}

function resetCalls() {
  calls.navigate.length = 0;
  calls.fetch.length = 0;
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------

test('a customer-surface notification in worker mode switches, then routes', async () => {
  resetCalls();
  fetchResult = { data: { id: 'job-1', title: 'Fix sink' }, error: null };

  // The switch resolves only when the test says the tree has swapped, so the
  // ordering — no dispatch before resolution — is observable.
  let resolveSwitch;
  const bridge = makeBridge(
    'worker',
    () => new Promise((resolve) => (resolveSwitch = resolve))
  );

  const done = handleNotificationData(
    { screen: 'ClientJobDetail', jobId: 'job-1' },
    bridge
  );
  await flush();

  // The gate asked for exactly one switch, to the OWNING mode, with confirm
  // copy — and nothing has been fetched or dispatched yet.
  assert.equal(bridge.switchCalls.length, 1);
  assert.equal(bridge.switchCalls[0].target, 'customer');
  assert.ok(bridge.switchCalls[0].options.confirm.title.length > 0);
  assert.equal(calls.fetch.length, 0, 'nothing fetches before the switch resolves');
  assert.equal(calls.navigate.length, 0, 'nothing routes before the switch resolves');

  resolveSwitch(true);
  await done;

  assert.deepEqual(calls.fetch, ['job-1']);
  assert.equal(calls.navigate.length, 1);
  const [tab, screen, params] = calls.navigate[0];
  assert.equal(tab, 'MyJobs');
  assert.equal(screen, 'ClientJobDetail');
  assert.equal(params.job.id, 'job-1');
});

test('a worker-surface notification in customer mode switches the other way', async () => {
  resetCalls();
  const bridge = makeBridge('customer', async () => true);

  await handleNotificationData({ screen: 'WorkerJob', jobId: 'job-2' }, bridge);

  assert.equal(bridge.switchCalls.length, 1);
  assert.equal(bridge.switchCalls[0].target, 'worker');
  assert.deepEqual(calls.navigate, [['MyJobs', 'WorkerJob', { jobId: 'job-2' }]]);
});

test('declining the switch drops the navigation entirely', async () => {
  resetCalls();
  const bridge = makeBridge('worker', async () => false);

  await handleNotificationData({ screen: 'ClientJobDetail', jobId: 'job-3' }, bridge);

  assert.equal(bridge.switchCalls.length, 1, 'the switch was offered');
  assert.equal(calls.fetch.length, 0, 'a declined switch must not fetch');
  assert.equal(calls.navigate.length, 0, 'a declined switch must not navigate');
});

test('a same-tree notification does NOT trigger a switch', async () => {
  resetCalls();
  const bridge = makeBridge('worker', async () => {
    throw new Error('switchMode must not be called for a shared destination');
  });

  await handleNotificationData(
    { screen: 'Chat', directThreadId: 'thread-9' },
    bridge
  );
  assert.equal(bridge.switchCalls.length, 0);
  assert.deepEqual(calls.navigate, [
    ['Messages', 'Chat', { directThreadId: 'thread-9' }],
  ]);

  // Same for a destination already owned by the CURRENT mode.
  resetCalls();
  const workerBridge = makeBridge('worker', async () => {
    throw new Error('switchMode must not be called when already in the owning mode');
  });
  await handleNotificationData({ screen: 'WorkerJob', jobId: 'job-4' }, workerBridge);
  assert.equal(workerBridge.switchCalls.length, 0);
  assert.deepEqual(calls.navigate, [['MyJobs', 'WorkerJob', { jobId: 'job-4' }]]);
});

test('while mode resolution is pending, the gate stands down and routing proceeds', async () => {
  resetCalls();
  const bridge = makeBridge(null, async () => {
    throw new Error('switchMode must not be prompted before the mode has resolved');
  });

  await handleNotificationData({ screen: 'WorkerJob', jobId: 'job-5' }, bridge);
  assert.equal(bridge.switchCalls.length, 0);
  assert.deepEqual(calls.navigate, [['MyJobs', 'WorkerJob', { jobId: 'job-5' }]]);
});

test('routability is mode-independent — the feed’s tappable set is unchanged', () => {
  // canRouteNotification answers reachability, and every destination is
  // mounted in both trees; the mode gate is a perspective prompt on top,
  // never a reason to grey a row out.
  assert.equal(canRouteNotification({ screen: 'ClientJobDetail', jobId: 'x' }), true);
  assert.equal(canRouteNotification({ screen: 'WorkerJob', jobId: 'x' }), true);
  assert.equal(canRouteNotification({ screen: 'Chat', directThreadId: 'x' }), true);
  assert.equal(canRouteNotification({ screen: 'Nope', jobId: 'x' }), false);
});

// --- The wiring: both consumers pass ModeContext through the one bridge ----

test('both tap consumers forward ModeContext through the bridge hook', () => {
  const push = read('hooks/usePushNotifications.ts');
  assert.match(push, /useNotificationModeBridge\(\)/);
  assert.equal(
    [...push.matchAll(/handleNotificationData\([^)]*, modeBridge\)/g)].length,
    2,
    'both the cold-start replay and the warm-tap listener must pass the bridge'
  );

  const feed = read('screens/NotificationsScreen.tsx');
  assert.match(feed, /useNotificationModeBridge\(\)/);
  assert.match(feed, /handleNotificationData\(notification\.data, modeBridge\)/);
});
