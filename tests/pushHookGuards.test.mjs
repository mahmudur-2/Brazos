import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * B7 (production-36h) — THE PUSH HOOK, run. hooks/usePushNotifications.ts runs here as written: its
 * imports are stand-ins (React's useEffect and useRef from a small hook runtime that mounts,
 * re-renders and unmounts; expo-notifications, the router and the token calls are loggers).
 *
 *   - R8: a cold-start tap is consumed once per PROCESS: RootNavigator (and the hook) mounts again
 *     when a suspension ends, and the old tap must not route a second time;
 *   - R9: the token is registered only once the server answered "not suspended".
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await tick();
};

/** One mount's hooks: refs and effects by call order; an effect runs after render when its deps change. */
function mount() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  return {
    useRef(init) {
      const at = cursor++;
      if (!(at in slots)) slots[at] = { current: init };
      return slots[at];
    },
    useEffect(fn, deps) {
      const at = cursor++;
      const previous = slots[at];
      const changed = !previous || !deps || deps.length !== previous.deps.length || deps.some((d, i) => !Object.is(d, previous.deps[i]));
      if (!changed) return;
      pending.push(() => {
        if (previous?.cleanup) previous.cleanup();
        const cleanup = fn();
        slots[at] = { deps, cleanup };
      });
    },
    render(hook) {
      cursor = 0;
      pending = [];
      hook();
      for (const run of pending) run();
    },
    unmount() {
      for (const slot of slots) if (slot && typeof slot.cleanup === 'function') slot.cleanup();
    },
  };
}

const world = {
  hooks: null,
  auth: { user: { id: 'u1' }, suspended: false },
  lastResponse: null,
  log: [],
};
const NAMES = [
  'dataForAction', 'useEffect', 'useRef', 'AppState', 'Notifications', 'handleNotificationData', 'registerPushToken',
  'settlePendingPushDeactivation', 'Sentry', 'useAuth', 'useNotificationModeBridge', 'invalidateAfterPush',
];
globalThis.__push_hook = {
  dataForAction: (data) => data,
  useEffect: (...args) => world.hooks.useEffect(...args),
  useRef: (...args) => world.hooks.useRef(...args),
  AppState: { addEventListener: () => ({ remove() {} }) },
  Notifications: {
    getLastNotificationResponseAsync: async () => world.lastResponse,
    addNotificationReceivedListener: () => ({ remove() {} }),
    addNotificationResponseReceivedListener: () => ({ remove() {} }),
  },
  handleNotificationData: (data) => world.log.push(`route ${data.screen}`),
  registerPushToken: async () => (world.log.push('register token'), { ok: true }),
  settlePendingPushDeactivation: async () => world.log.push('settle deactivation'),
  Sentry: null,
  useAuth: () => world.auth,
  useNotificationModeBridge: () => world.modeBridge,
  invalidateAfterPush: () => {},
};
world.modeBridge = { current: () => 'customer' };

const source = read('hooks/usePushNotifications.ts');
const imports = source.match(/^import [\s\S]*?;$/gm);
assert.equal(imports.length, NAMES.length - 2, 'the hook\'s imports: react gives two names');
const js = stripTypeScriptTypes(source.replace(/^import [\s\S]*?;$/gm, ''), { mode: 'strip' });
let processes = 0;
/** UB-05: each call is a new app process (a fresh module, so a fresh module-level guard). */
const newProcess = async () =>
  (
    await import(
      'data:text/javascript;charset=utf-8;base64,' +
        Buffer.from(`const { ${NAMES.join(', ')} } = globalThis.__push_hook;\n${js}\n// process ${(processes += 1)}`, 'utf8').toString('base64')
    )
  ).usePushNotifications;
const usePushNotifications = await newProcess();

function mountHook(hook = usePushNotifications) {
  const hooks = mount();
  world.hooks = hooks;
  hooks.render(hook);
  return hooks;
}

test('B7 R8: a cold-start tap routes once per process: the hook mounting again (a suspension ended) does not replay it', async () => {
  world.log.length = 0;
  world.lastResponse = { notification: { request: { content: { data: { screen: 'Job', jobId: 'j1' } } } }, actionIdentifier: 'default' };
  const first = mountHook();
  await settle();
  assert.deepEqual(world.log.filter((entry) => entry.startsWith('route')), ['route Job']);
  // A re-render with the same bridge runs nothing again.
  world.hooks = first;
  first.render(usePushNotifications);
  await settle();
  // The suspended screen replaces RootNavigator, then the suspension ends: a fresh mount.
  first.unmount();
  const second = mountHook();
  await settle();
  // getLastNotificationResponseAsync() still returns the launch tap; it is not routed again.
  assert.deepEqual(world.log.filter((entry) => entry.startsWith('route')), ['route Job']);
  second.unmount();
});

test('UB-05: a start with no tap closes the cold start too: a later mount does not route the last tap of the process', async () => {
  world.log.length = 0;
  const hook = await newProcess();
  world.lastResponse = null;
  const first = mountHook(hook);
  await settle();
  first.unmount();
  // A tap while nothing listened (the suspended screen); then the suspension ends: a fresh mount.
  world.lastResponse = { notification: { request: { content: { data: { screen: 'Job', jobId: 'old' } } } }, actionIdentifier: 'default' };
  const second = mountHook(hook);
  await settle();
  assert.deepEqual(world.log.filter((entry) => entry.startsWith('route')), [], 'the old tap is not routed');
  second.unmount();

  // A failed first read leaves the cold start open, as before: the next mount's read routes the launch tap.
  world.log.length = 0;
  const other = await newProcess();
  const real = globalThis.__push_hook.Notifications.getLastNotificationResponseAsync;
  const error = console.error;
  console.error = () => {};
  globalThis.__push_hook.Notifications.getLastNotificationResponseAsync = async () => {
    throw new Error('read failed');
  };
  try {
    const failed = mountHook(other);
    await settle();
    failed.unmount();
  } finally {
    globalThis.__push_hook.Notifications.getLastNotificationResponseAsync = real;
    console.error = error;
  }
  const again = mountHook(other);
  await settle();
  assert.deepEqual(world.log.filter((entry) => entry.startsWith('route')), ['route Job']);
  again.unmount();
});

test('B7 R9: no push token is registered while the account is suspended or the answer is not known yet', async () => {
  world.log.length = 0;
  world.lastResponse = null;
  // The launch loader: signed in, no answer yet.
  world.auth = { user: { id: 'u1' }, suspended: null };
  const hooks = mountHook();
  await settle();
  assert.deepEqual(world.log, []);
  // Suspended (the hook is normally not mounted then; mounted or not, it registers nothing).
  world.auth = { user: { id: 'u1' }, suspended: true };
  hooks.render(usePushNotifications);
  await settle();
  assert.deepEqual(world.log, []);
  // The server answered "not suspended": the deactivation owed first, then this account's token, once.
  world.auth = { user: { id: 'u1' }, suspended: false };
  hooks.render(usePushNotifications);
  await settle();
  assert.deepEqual(world.log, ['settle deactivation', 'register token']);
  hooks.render(usePushNotifications);
  await settle();
  assert.deepEqual(world.log, ['settle deactivation', 'register token'], 'a re-render registers nothing more');
  hooks.unmount();
  // Signed out: nothing.
  world.log.length = 0;
  world.auth = { user: null, suspended: null };
  mountHook().unmount();
  await settle();
  assert.deepEqual(world.log, []);
  world.auth = { user: { id: 'u1' }, suspended: false };
});

test('[static] B7 R9: the comment on a deleted account says what the code does (no handler of its own)', () => {
  const auth = read('lib/AuthContext.tsx');
  assert.doesNotMatch(auth, /its own flow signs it out/);
  assert.match(auth, /The app has no handler of its own for that hint/);
});

test('[static] B7 R8: the guard is module-level, declared once, above the hook', () => {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(code, /^const handledColdStart = \{ current: false \};$/m);
  assert.ok(code.indexOf('const handledColdStart') < code.indexOf('export function usePushNotifications('));
  assert.doesNotMatch(code, /handledColdStart = useRef/);
});
