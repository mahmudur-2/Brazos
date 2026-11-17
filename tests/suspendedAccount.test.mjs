import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * B1 (production-36h) — THE SUSPENDED ACCOUNT. The server (the access lane, 63f468a) lets a
 * suspended person sign in and refuses everything else but a short list. The app shows one screen in
 * place of the whole app while current_user_is_banned() says yes: the server's sentence, the support
 * address, "Contact Support" (main), "Delete Account" and "Sign Out" (quiet). Between two checks a
 * refused call is a mark that asks for the check at once; only the server's answer switches.
 *
 *   - lib/suspension.ts runs here as written (it has no imports);
 *   - App.tsx's AccountGate and SuspendedGate run as written (their JSX compiled by typescript);
 *   - the rest is pinned in the repo's static style.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const strip = (s) => s.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const flat = (s) => strip(s).replace(/\s+/g, ' ');
const ts = createRequire(import.meta.url)('typescript');

const SENTENCE =
  'This account has been suspended for violating the Brazos community rules. Contact support if you think this is a mistake.';
const s = await import(pathToFileURL(join(root, 'lib/suspension.ts')).href);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------- the answer

test('the sentence is the server\'s own, word for word, and it lives in one app file', () => {
  assert.equal(s.SUSPENDED_SENTENCE, SENTENCE);
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.ts', '*.tsx'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('supabase/') && !f.startsWith('types/'));
  const holders = files.filter((f) => read(f).includes('This account has been suspended'));
  assert.deepEqual(holders, ['lib/suspension.ts']);
  // The sign-in screens' old notice left with the ban sign-out: nothing sets it any more.
  for (const f of ['screens/SignInScreen.tsx', 'screens/EmailSignInScreen.tsx', 'lib/AuthContext.tsx']) {
    assert.doesNotMatch(read(f), /bannedNotice|BannedNotice/, f);
  }
});

test('the answer: per account; a failed first read fails open, a failed later read keeps the last answer', () => {
  const yes = { data: true, error: null };
  const no = { data: false, error: null };
  const down = { data: false, error: { message: 'Request timeout' } };
  let a = s.nextSuspension(null, 'u1', yes);
  assert.deepEqual(a, { userId: 'u1', suspended: true });
  assert.equal(s.suspendedFor(a, 'u1'), true);
  assert.deepEqual(s.nextSuspension(a, 'u1', down), a, 'a failed later read keeps "suspended"');
  a = s.nextSuspension(a, 'u1', no);
  assert.equal(s.suspendedFor(a, 'u1'), false, 'the end of a suspension');
  assert.deepEqual(s.nextSuspension(a, 'u1', down), a, 'a failed later read keeps "not suspended"');
  assert.deepEqual(s.nextSuspension(null, 'u1', down), { userId: 'u1', suspended: false }, 'first read failed: open');
  assert.deepEqual(s.nextSuspension({ userId: 'u0', suspended: true }, 'u1', down), { userId: 'u1', suspended: false }, 'never another account\'s');
  // Unknown until this account's own answer; nobody signed in is unknown too.
  assert.equal(s.suspendedFor(null, 'u1'), null);
  assert.equal(s.suspendedFor({ userId: 'u0', suspended: true }, 'u1'), null);
  assert.equal(s.suspendedFor({ userId: 'u1', suspended: true }, null), null);
});

test('on the way to the front: every time while suspended, else once per ten minutes', () => {
  const TEN = 10 * 60 * 1000;
  assert.equal(s.recheckDue(true, 1000, 1001, TEN), true);
  assert.equal(s.recheckDue(false, 1000, 1000 + TEN - 1, TEN), false);
  assert.equal(s.recheckDue(false, 1000, 1000 + TEN, TEN), true);
  assert.equal(s.recheckDue(null, 1000, 1001, TEN), false);
});

test('one read at a time: a call during a read joins it and asks for one more; a failed read is silent', async () => {
  let runs = 0;
  let release;
  const check = s.coalesce(() => {
    runs += 1;
    return new Promise((resolve) => (release = resolve));
  });
  const first = check();
  await tick();
  assert.equal(runs, 1);
  const second = check();
  const third = check();
  assert.equal(second, first, 'joined');
  assert.equal(third, first, 'joined');
  release();
  await tick();
  assert.equal(runs, 2, 'exactly one more read after it, for the marks that came during it');
  release();
  await first;
  assert.equal(runs, 2);
  // Later calls run again; a run that throws or rejects never reaches the caller.
  const failing = s.coalesce(async () => {
    runs += 1;
    throw new Error('offline');
  });
  await failing();
  await failing();
  assert.equal(runs, 4);
});

// ---------------------------------------------------------------- B7 R6: the checks, run

/** A clock and timers the test moves by hand; each read answers from a queue the test fills. */
function checksRig(answers, start = 1_000_000) {
  let clock = start;
  const pending = new Map();
  let next = 1;
  const published = [];
  const reads = [];
  const checks = s.suspensionChecks({
    userId: 'u1',
    read: async () => {
      reads.push(clock);
      const answer = answers.shift();
      assert.ok(answer, `an answer for read ${reads.length}`);
      if (answer instanceof Error) throw answer;
      return answer;
    },
    publish: (answer) => published.push(answer),
    everyMs: 10 * 60 * 1000,
    now: () => clock,
    timers: {
      set: (run, ms) => {
        const id = next++;
        pending.set(id, { run, ms });
        return id;
      },
      clear: (id) => pending.delete(id),
    },
  });
  return {
    checks,
    published,
    reads,
    /** The one timer waiting, as [ms], or [] for none. */
    waiting: () => [...pending.values()].map((t) => t.ms),
    /** Let the waiting timer fire (the clock moves by its delay), then let the read settle. */
    async fire() {
      const [[id, t]] = [...pending.entries()];
      pending.delete(id);
      clock += t.ms;
      t.run();
      for (let i = 0; i < 5; i += 1) await tick();
    },
    advance: (ms) => (clock += ms),
    settle: async () => {
      for (let i = 0; i < 5; i += 1) await tick();
    },
  };
}
const DOWN = { data: false, error: { message: 'Request timeout' } };
const YES = { data: true, error: null };
const NO = { data: false, error: null };

test('B7 R6: a failed first read opens the app as before, then is asked again after 5 s, 15 s and every 60 s until one answers', async () => {
  assert.deepEqual(s.RETRY_AFTER_MS, [5000, 15000, 60000]);
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((n) => s.nextReadIn(n, false)), [null, 5000, 15000, 60000, 60000, 60000]);
  const rig = checksRig([DOWN, DOWN, DOWN, DOWN, new Error('offline'), YES]);
  await rig.checks.check();
  await rig.settle();
  // Offline at launch: the app opens (not suspended), as today.
  assert.deepEqual(rig.published, [{ userId: 'u1', suspended: false }]);
  assert.deepEqual(rig.waiting(), [5000]);
  await rig.fire();
  assert.deepEqual(rig.waiting(), [15000]);
  await rig.fire();
  assert.deepEqual(rig.waiting(), [60000]);
  await rig.fire();
  assert.deepEqual(rig.waiting(), [60000]);
  await rig.fire();
  assert.deepEqual(rig.waiting(), [60000], 'a read that threw counts as failed');
  await rig.fire();
  // The first answer: the suspended screen comes, 2 min 20 s after launch instead of 10 min.
  assert.deepEqual(rig.published.at(-1), { userId: 'u1', suspended: true });
  assert.deepEqual(rig.reads.map((t) => t - 1_000_000), [0, 5000, 20000, 80000, 140000, 200000]);
  rig.checks.stop();
});

test('B7 R6: a failed read is not a check: the ten-minute clock keeps the last answer\'s time; one answer ends the retries', async () => {
  const TEN = 10 * 60 * 1000;
  const rig = checksRig([NO, DOWN, NO, DOWN, NO]);
  await rig.checks.check();
  await rig.settle();
  assert.deepEqual(rig.waiting(), [], 'an answer: no timer');
  // A mark 1 s later meets a dead network: the last answer is kept, a retry waits.
  rig.advance(1000);
  await rig.checks.check();
  await rig.settle();
  assert.deepEqual(rig.published.at(-1), { userId: 'u1', suspended: false });
  assert.deepEqual(rig.waiting(), [5000]);
  // Ten minutes after the last ANSWER, not after the failed read, the way to the front reads again.
  rig.advance(TEN - 1000 - 1);
  rig.checks.foreground();
  await rig.settle();
  assert.equal(rig.reads.length, 2, 'not yet due');
  rig.advance(1);
  rig.checks.foreground();
  await rig.settle();
  assert.equal(rig.reads.length, 3, 'due: the failed read did not move the clock');
  assert.deepEqual(rig.waiting(), [], 'answered: the waiting retry is gone');
  // A later failure retries until one read answers, then stops.
  await rig.checks.check();
  await rig.settle();
  assert.deepEqual(rig.waiting(), [5000]);
  await rig.fire();
  assert.deepEqual(rig.waiting(), []);
  assert.equal(rig.reads.length, 5);
});

test('B7 R7: while suspended a read every 60 s: a lifted suspension lets the person in without a restart', async () => {
  assert.equal(s.SUSPENDED_POLL_MS, 60000);
  assert.deepEqual([[0, true], [0, false], [1, true], [2, true]].map(([n, yes]) => s.nextReadIn(n, yes)), [60000, null, 5000, 15000]);
  const rig = checksRig([YES, YES, DOWN, YES, NO]);
  await rig.checks.check();
  await rig.settle();
  assert.deepEqual(rig.published, [{ userId: 'u1', suspended: true }]);
  assert.deepEqual(rig.waiting(), [60000], 'the suspended screen shows: a read in a minute');
  await rig.fire();
  assert.deepEqual(rig.waiting(), [60000]);
  // A failed read while suspended: the screen stays, the retries take over.
  await rig.fire();
  assert.deepEqual(rig.published.at(-1), { userId: 'u1', suspended: true });
  assert.deepEqual(rig.waiting(), [5000]);
  await rig.fire();
  assert.deepEqual(rig.waiting(), [60000]);
  // The owner lifts the suspension: the next read lets the person in, and the reads stop.
  await rig.fire();
  assert.deepEqual(rig.published.at(-1), { userId: 'u1', suspended: false });
  assert.deepEqual(rig.waiting(), []);
  assert.deepEqual(rig.reads.map((t) => t - 1_000_000), [0, 60000, 120000, 125000, 185000]);
  // The way to the front still reads every time while suspended (recheckDue, as before).
  const front = checksRig([YES, YES]);
  await front.checks.check();
  await front.settle();
  front.advance(1000);
  front.checks.foreground();
  await front.settle();
  assert.equal(front.reads.length, 2);
  front.checks.stop();
  assert.deepEqual(front.waiting(), []);
});

test('B7 R6: after stop() no read publishes and no timer is left', async () => {
  const rig = checksRig([DOWN, YES]);
  await rig.checks.check();
  await rig.settle();
  assert.deepEqual(rig.waiting(), [5000]);
  rig.checks.stop();
  assert.deepEqual(rig.waiting(), []);
  const before = rig.published.length;
  await rig.checks.check();
  await rig.settle();
  assert.equal(rig.published.length, before);
  assert.equal(rig.reads.length, 1);
});

// ---------------------------------------------------------------- the marks

test('only the two exact marks: rest 400 + hint account_suspended; functions 401 + the sentence', () => {
  const REST = 'http://127.0.0.1:54321/rest/v1/rpc/get_my_active_mode';
  const FN = 'http://127.0.0.1:54321/functions/v1/create-payment';
  assert.equal(s.isSuspensionMark(REST, 400, { code: 'P0001', message: SENTENCE, hint: 'account_suspended', details: null }), true);
  assert.equal(s.isSuspensionMark(FN, 401, { error: SENTENCE }), true);
  // Never a mark:
  assert.equal(s.isSuspensionMark(REST, 400, { code: 'P0001', message: 'This account is no longer active.', hint: 'account_inactive' }), false, 'a deleted account');
  assert.equal(s.isSuspensionMark(FN, 401, { error: 'This account is no longer active.' }), false, 'a deleted account');
  assert.equal(s.isSuspensionMark(FN, 401, { error: 'Sign in to manage your cards.' }), false);
  assert.equal(s.isSuspensionMark(FN, 503, { error: 'Brazos can’t check this account right now. Try again in a minute.' }), false);
  assert.equal(s.isSuspensionMark(FN, 429, { error: 'Too many tries in the last hour. Try again later.' }), false);
  assert.equal(s.isSuspensionMark(REST, 401, { error: SENTENCE }), false, 'the sentence on the wrong route');
  assert.equal(s.isSuspensionMark(FN, 400, { hint: 'account_suspended' }), false, 'the hint on the wrong route');
  assert.equal(s.isSuspensionMark(REST, 403, { hint: 'account_suspended' }), false);
  for (const body of [null, undefined, 'account_suspended', 400, []]) assert.equal(s.isSuspensionMark(REST, 400, body), false);
});

/** A Response stand-in: `json` is what the COPY answers; clone() is counted. */
function answer(status, json, { cloneThrows = false } = {}) {
  const r = {
    status,
    clones: 0,
    clone() {
      r.clones += 1;
      if (cloneThrows) throw new Error('body used');
      return { json };
    },
  };
  return r;
}

test('the watched fetch hands back the same answer at once; a mark asks once; nothing else does', async () => {
  let marks = 0;
  const stop = s.onSuspensionMark(() => (marks += 1));
  try {
    const REST = 'https://p.supabase.co/rest/v1/rpc/register_push_token';
    const FN = 'https://p.supabase.co/functions/v1/payment-methods';

    // The answer is back before its copy is read (a copy that never answers delays nothing).
    const hanging = answer(400, () => new Promise(() => {}));
    const watched = s.watchSuspension(async () => hanging);
    assert.equal(await watched(REST, { method: 'POST' }), hanging);

    // A marked answer: the same object, one mark.
    const marked = answer(400, async () => ({ code: 'P0001', message: SENTENCE, hint: 'account_suspended' }));
    assert.equal(await s.watchSuspension(async () => marked)(REST), marked);
    await tick();
    assert.equal(marks, 1);
    const fn = answer(401, async () => ({ error: SENTENCE }));
    assert.equal(await s.watchSuspension(async () => fn)({ url: FN }), fn, 'a Request-like input');
    await tick();
    assert.equal(marks, 2);

    // Not 400/401, or not a watched route: never even copied.
    for (const [status, url] of [[200, REST], [500, REST], [401, REST], [400, FN], [400, 'https://p.supabase.co/auth/v1/token']]) {
      const plain = answer(status, async () => ({ hint: 'account_suspended', error: SENTENCE }));
      assert.equal(await s.watchSuspension(async () => plain)(url), plain);
      assert.equal(plain.clones, 0, `${status} ${url}`);
    }

    // A body that cannot be read or is not JSON: no throw, no mark, the same answer.
    const notJson = answer(400, async () => {
      throw new SyntaxError('Unexpected token < in JSON');
    });
    assert.equal(await s.watchSuspension(async () => notJson)(REST), notJson);
    const used = answer(401, async () => ({ error: SENTENCE }), { cloneThrows: true });
    assert.equal(await s.watchSuspension(async () => used)(FN), used);
    const odd = { status: 400 };
    assert.equal(await s.watchSuspension(async () => odd)(REST), odd, 'no clone() at all');
    assert.equal(await s.watchSuspension(async () => null)(REST), null);
    await tick();
    assert.equal(marks, 2);

    // A failure goes through unchanged, as the same error.
    const offline = new TypeError('Network request failed');
    await assert.rejects(s.watchSuspension(async () => { throw offline; })(REST), (e) => e === offline);

    // A listener's fault reaches no one; a stopped listener hears nothing.
    const stopBad = s.onSuspensionMark(() => {
      throw new Error('listener fault');
    });
    await s.watchSuspension(async () => answer(400, async () => ({ hint: 'account_suspended' })))(REST);
    await tick();
    assert.equal(marks, 3);
    stopBad();
  } finally {
    stop();
  }
  await s.watchSuspension(async () => answer(400, async () => ({ hint: 'account_suspended' })))('https://p.supabase.co/rest/v1/jobs');
  await tick();
  assert.equal(marks, 3, 'stopped');
});

test('[static] the client\'s one fetch is watched, outside the timeout', () => {
  const client = flat(read('lib/supabase.ts'));
  assert.match(client, /import \{ watchSuspension \} from '\.\/suspension';/);
  assert.match(client, /global: \{ fetch: watchSuspension\(withRequestTimeout\(watchServerClock\(fetch\)\)\) \}/);
});

// ---------------------------------------------------------------- AuthContext

test('[static] AuthContext: the server\'s answer decides, nothing signs a suspended person out, a mark asks for the check', () => {
  const auth = flat(read('lib/AuthContext.tsx'));
  assert.match(auth, /suspended: boolean \| null;/);
  assert.match(auth, /const suspended = suspendedFor\(suspension, session\?\.user\?\.id \?\? null\);/);
  // B7 (R6): the reads run in lib/suspension.ts suspensionChecks (executed below); AuthContext wires them.
  assert.match(auth, /const checks = suspensionChecks\(\{ userId, read: \(\) => fetchCurrentUserBanned\(userId\), publish: setSuspension, everyMs: BAN_RECHECK_MS, \}\); void checks\.check\(\);/);
  assert.match(auth, /AppState\.addEventListener\('change', \(state\) => \{ if \(state === 'active'\) checks\.foreground\(\); \}\);/);
  assert.match(auth, /const stopMarks = onSuspensionMark\(\(\) => void checks\.check\(\)\);/);
  assert.match(auth, /return \(\) => \{ checks\.stop\(\); subscription\.remove\(\); stopMarks\(\);/);
  assert.match(auth, /const BAN_RECHECK_MS = 10 \* 60 \* 1000;/);
  // The one endSession left is the person's own Sign Out.
  assert.equal((auth.match(/endSession\(\)/g) ?? []).length, 1);
  assert.match(auth, /logout: async \(\) => \{ const ended = await endSession\(\);/);
  assert.match(auth, /\[session, loading, suspended\]/);
});

// ---------------------------------------------------------------- the gate

const app = read('App.tsx');
function gateParts(overrides = {}) {
  const start = app.indexOf('function AccountGate() {');
  const end = app.indexOf('function RootNavigator() {');
  assert.ok(start > 0 && end > start, 'AccountGate and SuspendedGate, before RootNavigator');
  const js = ts.transpileModule(app.slice(start, end), {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const log = [];
  const deps = {
    React: { createElement: (type, props) => ({ type, props }) },
    useAuth: () => overrides.auth,
    useUpdateStop: () => overrides.updateStop ?? false,
    useReportLaunchReady: () => () => log.push('launch ready'),
    useEffect: (fn) => fn(),
    RootNavigator: function RootNavigator() {},
    UpdateStopScreen: function UpdateStopScreen() {},
    SuspendedAccountFlow: function SuspendedAccountFlow() {},
  };
  const names = Object.keys(deps);
  const parts = new Function(...names, `${js}\nreturn { AccountGate, SuspendedGate };`)(...names.map((n) => deps[n]));
  return { ...parts, log };
}
const render = (overrides) => {
  const g = gateParts(overrides);
  let el = g.AccountGate();
  const path = [el.type.name];
  if (el.type === g.SuspendedGate) {
    el = g.SuspendedGate();
    path.push(el.type.name);
  }
  return { path, log: g.log };
};
const USER = { id: 'u1' };

test('the gate: suspended = the suspended screen and no main tree; not suspended = the normal app; the end = the normal app', () => {
  assert.deepEqual(render({ auth: { user: USER, suspended: true } }).path, ['SuspendedGate', 'SuspendedAccountFlow']);
  assert.deepEqual(render({ auth: { user: USER, suspended: true } }).log, ['launch ready']);
  assert.deepEqual(render({ auth: { user: USER, suspended: true }, updateStop: true }).path, ['SuspendedGate', 'UpdateStopScreen'], 'the update stop still comes first');
  assert.deepEqual(render({ auth: { user: USER, suspended: false } }).path, ['RootNavigator']);
  // Unknown: RootNavigator, whose loader holds until the answer (below). Signed out: the normal sign-in.
  assert.deepEqual(render({ auth: { user: USER, suspended: null } }).path, ['RootNavigator']);
  assert.deepEqual(render({ auth: { user: null, suspended: null } }).path, ['RootNavigator']);
  // The end of a suspension: the answer flips (nextSuspension above) and RootNavigator is back.
  const ended = s.suspendedFor(s.nextSuspension({ userId: 'u1', suspended: true }, 'u1', { data: false, error: null }), 'u1');
  assert.deepEqual(render({ auth: { user: USER, suspended: ended } }).path, ['RootNavigator']);
});

test('[static] gate order: the suspended gate sits above every other gate; the main tree is reachable only through RootNavigator', () => {
  const code = strip(app);
  assert.match(code, /<AppErrorBoundary>\s*<AccountGate \/>\s*<\/AppErrorBoundary>/);
  assert.equal((code.match(/<RootNavigator \/>/g) ?? []).length, 1, 'only AccountGate renders RootNavigator');
  assert.equal((code.match(/<SuspendedAccountFlow \/>/g) ?? []).length, 1);
  const root = code.slice(code.indexOf('function RootNavigator() {'), code.indexOf('function LaunchGate('));
  for (const gate of ['<MainTabs />', '<LegalGateScreen', '<OnboardingFlow', '<AuthFlow />', '<ResetPasswordScreen />']) {
    assert.equal(code.split(gate).length - 1, root.split(gate).length - 1, `${gate} only inside RootNavigator`);
  }
  assert.doesNotMatch(code.slice(0, code.indexOf('function RootNavigator() {')), /<MainTabs|<LegalGateScreen|<OnboardingFlow|useLegalGate\(|useSetupStatus\(|usePushNotifications\(/);
  // The flow: the suspended screen first, then the existing delete screen.
  const flow = flat(read('screens/SuspendedAccountScreen.tsx'));
  assert.match(flow, /<Stack\.Screen name="SuspendedAccount" component=\{SuspendedAccountScreen\} \/> <Stack\.Screen name="DeleteAccount" component=\{DeleteAccountScreen\} \/>/);
});

test('[static] during the first answer nothing of the app can show: the loader wins over every branch, the legal error included', () => {
  const code = strip(app);
  const root = code.slice(code.indexOf('function RootNavigator() {'), code.indexOf('function LaunchGate('));
  const LOADER = "if (loading || (user && (suspended === null || legal.state === 'loading' || setup.state === 'loading'))) {";
  const at = (needle) => {
    const i = root.indexOf(needle);
    assert.ok(i > 0, needle);
    return i;
  };
  const loader = at(LOADER);
  assert.ok(at('if (updateStop) return <UpdateStopScreen />;') < loader);
  for (const later of ['if (user && recoveryPending)', 'if (!user) return <AuthFlow />;', "if (setup.state === 'incomplete')", "if (legal.state === 'unknown')", "if (legal.state === 'needs_acceptance')", 'return <MainTabs />;']) {
    assert.ok(loader < at(later), `the loader comes before: ${later}`);
  }
  // The launch layer is not lifted onto the loader either.
  assert.match(root, /const holdsLoader = loading \|\| \(!!user && \(suspended === null \|\| legal\.state === 'loading' \|\| setup\.state === 'loading'\)\);/);
  // The reads that run beside the answer open no dialog of their own.
  for (const f of ['hooks/useLegalGate.ts', 'hooks/useSetupStatus.ts', 'hooks/useOnline.ts', 'hooks/useUpdateStop.ts']) {
    assert.doesNotMatch(strip(read(f)), /alertAsync|confirmAsync|Alert\./, f);
  }
  const push = strip(read('hooks/usePushNotifications.ts'));
  assert.doesNotMatch(push, /interactive: true/, 'the push sync never asks');
  assert.doesNotMatch(push, /alertAsync|confirmAsync/);
});

test('[static] the cold-start link is read once per process: RootNavigator mounting again after a suspension never re-reads it', () => {
  const code = strip(app);
  assert.match(code, /^const handledInitialUrl = \{ current: false \};$/m);
  assert.ok(code.indexOf('const handledInitialUrl') < code.indexOf('function RootNavigator() {'));
});

// ---------------------------------------------------------------- the calls

test('the delete flow inside the gate: no row routes, every row names support (executed)', async () => {
  const { formatBlockerList } = await import(pathToFileURL(join(root, 'lib/accountDeletionBlockers.ts')).href);
  const rows = [
    { kind: 'job', ref_id: 'j1', label: 'Move a sofa', detail: 'A worker is assigned to this job.' },
    { kind: 'payment_incoming', ref_id: 'p1', label: 'Payment owed to you', detail: 'Not yet paid out.' },
    { kind: 'dispute', ref_id: 'j2', label: 'Open dispute', detail: 'Not resolved.' },
    { kind: 'payment_outgoing', ref_id: 'p2', label: 'Payment you sent', detail: 'Not settled.' },
  ];
  const gated = formatBlockerList(rows, { routable: false });
  assert.deepEqual(gated.rows.map((r) => [r.route, r.support]), [[null, true], [null, true], [null, true], [null, true]]);
  assert.equal(gated.headline, '4 things have to be settled before this account can be deleted.');
  assert.deepEqual(formatBlockerList(rows).rows.map((r) => r.route), ['Job', 'Earnings', 'Job', null], 'outside the gate: as before');
});

test('[static] every server call reachable from the gate is in the allowed set', () => {
  // The suspended screen's own server call is the card sweep (B7 R5: list and remove, pinned below);
  // its imports are these and no others.
  const screenSrc = read('screens/SuspendedAccountScreen.tsx');
  const imports = [...screenSrc.matchAll(/from '([^']+)';/g)].map((m) => m[1]).sort();
  assert.deepEqual(imports, [
    '../hooks/useAnnounce', '../hooks/useAuth', '../lib/adapters/payments', '../lib/appLinks', '../lib/dialog', '../lib/errorMessage', '../lib/paymentMethods',
    '../lib/suspension', '../lib/theme', '../ui/primitives', '../ui/templates', './DeleteAccountScreen', '@react-navigation/native',
    '@react-navigation/native-stack', 'react', 'react-native',
  ]);
  assert.doesNotMatch(screenSrc, /supabase|\.rpc\(|\.from\(|invoke\(|listSavedCards|removeSavedCard\(|startCardSetup/);
  assert.match(screenSrc, /import \{ cardRemovalMessage, removeEverySavedCard \} from '\.\.\/lib\/paymentMethods';/);
  // The delete screen inside the gate: the blocker read, the card step, the delete, the local sign-out.
  const del = flat(read('screens/DeleteAccountScreen.tsx'));
  assert.match(del, /const \{ user, suspended \} = useAuth\(\); const inGate = suspended === true;/);
  assert.match(del, /const list = formatBlockerList\(data, \{ routable: !inGate \}\);/);
  // fetchJobById and the Earnings route are reached only through a ROUTED row's press.
  assert.match(del, /if \(!row\.route\) return <Card level="well" style=\{styles\.blockerRow\}>\{body\}<\/Card>;/);
  assert.equal((del.match(/openBlocker\(/g) ?? []).length, 2, 'declared once, pressed once');
  assert.equal((del.match(/openBlockingJob\(/g) ?? []).length, 2);
  // lib/accountDeletion.ts: the two exempt functions; the card step: list and remove only.
  const rpcs = [...read('lib/accountDeletion.ts').matchAll(/\.rpc\('(\w+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(rpcs, ['account_deletion_blockers', 'delete_my_account']);
  const cards = read('lib/paymentMethods.ts');
  const sweep = cards.slice(cards.indexOf('export async function removeEverySavedCard('), cards.indexOf('export function cardSweepMessage('));
  assert.deepEqual([...sweep.matchAll(/action: '(\w+)'/g)].map((m) => m[1]), ['list', 'remove']);
  assert.doesNotMatch(sweep, /listSavedCards|startCardSetup|supabase\./);
});

// ---------------------------------------------------------------- the screen

test('[static] the screen: the sentence, the address as selectable text, Contact Support main, Delete Account and Sign Out quiet', () => {
  const src = flat(read('screens/SuspendedAccountScreen.tsx'));
  assert.match(src, /<FormScreen title="Account Suspended" insideTabs=\{false\} submitLabel="Contact Support" onSubmit=\{\(\) => void openSupportMail\(\)\} >/);
  assert.doesNotMatch(src, /onBack|submitVariant|secondaryLabel/, 'no way back into the app; the main button is the default');
  assert.match(src, /<Text style=\{styles\.body\}>\{SUSPENDED_SENTENCE\}<\/Text>/);
  assert.match(src, /<Text selectable style=\{styles\.email\}[^>]*> \{SUPPORT_EMAIL\} <\/Text>/);
  assert.match(src, /<Button title="Delete Account" variant="quiet" onPress=\{\(\) => navigation\.navigate\('DeleteAccount'\)\}/);
  assert.match(src, /<Button title="Sign Out" variant="quiet" onPress=\{\(\) => void handleSignOut\(\)\} loading=\{signingOut\} \/>/);
  // B7 (R5): the third quiet row, only on the card path.
  assert.match(src, /\{paymentsMode === 'stripe' \? \( <Button title="Remove Saved Cards" variant="quiet" onPress=\{\(\) => void handleRemoveCards\(\)\} loading=\{removingCards\} \/> \) : null\}/);
  assert.equal((src.match(/<Button\b/g) ?? []).length, 3);
  assert.doesNotMatch(src, /destructive|danger|canOpenURL|Alert\.|#[0-9a-fA-F]{3,8}\b/);
  // T3: the one opener (lib/appLinks.ts, executed in tests/supportContact.test.mjs).
  assert.match(src, /import \{ openSupportMail, SUPPORT_EMAIL \} from '\.\.\/lib\/appLinks';/);
  // The delete screen inside the gate: outside the tabs, no "Finish or cancel ..." note, no new sentence.
  const del = flat(read('screens/DeleteAccountScreen.tsx'));
  assert.match(del, /submitVariant="destructive" insideTabs=\{!inGate\}/);
  assert.match(del, /\{inGate \? null : \( <Text style=\{styles\.blockedNote\}> Finish or cancel each of these/);
});

test('Sign Out: the person\'s own sign-out; a session not proven gone says so', async () => {
  const src = read('screens/SuspendedAccountScreen.tsx');
  const start = src.indexOf('  async function handleSignOut() {');
  const end = src.indexOf('  return (', start);
  const body = stripTypeScriptTypes(src.slice(start, end), { mode: 'strip' });
  const run = async (error) => {
    const log = [];
    const handle = new Function('signingOut', 'setSigningOut', 'logout', 'alertAsync', 'userMessage', `${body}\nreturn handleSignOut;`)(
      false,
      (v) => log.push(`signing out ${v}`),
      async () => (log.push('logout'), { error }),
      async (title, message) => log.push(`alert ${title}: ${message}`),
      (e) => e.message
    );
    await handle();
    return log;
  };
  assert.deepEqual(await run(null), ['signing out true', 'logout', 'signing out false']);
  assert.deepEqual(await run({ message: 'Brazos could not finish signing you out on this phone. Try again.' }), [
    'signing out true', 'logout', 'signing out false',
    'alert Sign out failed: Brazos could not finish signing you out on this phone. Try again.',
  ]);
});

// ---------------------------------------------------------------- B7 R5: "Remove Saved Cards"

// lib/paymentMethods.ts as written: the client is a stand-in for the payment-methods function, the
// error words are the real lib/errorMessage.ts.
globalThis.__DEV__ = false;
const cards = await (async () => {
  let js = stripTypeScriptTypes(read('lib/paymentMethods.ts'), { mode: 'strip' });
  for (const [from, to] of [
    ["import { supabase } from './supabase';", 'const supabase = { functions: { invoke: (...args) => globalThis.__suspended_cards.invoke(...args) } };'],
    ["import { userMessage } from './errorMessage';", `import { userMessage } from '${pathToFileURL(join(root, 'lib/errorMessage.ts')).href}';`],
  ]) {
    assert.ok(js.includes(from), from);
    js = js.replace(from, () => to);
  }
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));
})();

/** The payment-methods function's answers, in order; each call is logged. */
function cardProvider(answers) {
  const calls = [];
  globalThis.__suspended_cards = {
    invoke: async (name, { body }) => {
      assert.equal(name, 'payment-methods');
      calls.push(body.action === 'remove' ? `remove ${body.paymentMethodId}` : body.action);
      const next = answers.shift();
      assert.ok(next, `an answer for call ${calls.length}`);
      return next;
    },
  };
  return calls;
}
const cardOk = (data) => ({ data, error: null });
const cardRefused = (status, error) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: { status, text: async () => JSON.stringify({ error }) } },
});
const VISA = { id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030 };

/** The suspended screen, its JSX compiled, run with its hooks by call order. */
function suspendedScreen({ mode, confirm }) {
  const js = ts
    .transpileModule(read('screens/SuspendedAccountScreen.tsx'), {
      compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/^import [\s\S]*?;$/gm, '')
    .replace(/^export function /gm, 'function ');
  const slots = [];
  let cursor = 0;
  const log = [];
  const anyKey = new Proxy({}, { get: (_, key) => String(key) });
  const deps = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } }), Fragment: 'Fragment' },
    useState: (init) => {
      const at = cursor++;
      if (!(at in slots)) slots[at] = typeof init === 'function' ? init() : init;
      return [slots[at], (v) => (slots[at] = typeof v === 'function' ? v(slots[at]) : v)];
    },
    useRef: (init) => {
      const at = cursor++;
      if (!(at in slots)) slots[at] = { current: init };
      return slots[at];
    },
    StyleSheet: { create: (x) => x }, Text: 'Text', View: 'View', FormScreen: 'FormScreen', Button: 'Button', Card: 'Card',
    useNavigation: () => ({ navigate: (to) => log.push(`navigate ${to}`) }),
    createNativeStackNavigator: () => ({ Navigator: 'Navigator', Screen: 'Screen' }),
    alertAsync: async (title, message) => log.push(`alert ${title}: ${message}`),
    confirmAsync: async (o) => (log.push(`confirm ${o.title} / ${o.message} / ${o.confirmText}`), confirm(o)),
    userMessage: (e) => e.message,
    openSupportMail: async () => {},
    SUPPORT_EMAIL: 'brazosmvp@gmail.com',
    paymentsMode: mode,
    cardRemovalMessage: cards.cardRemovalMessage,
    removeEverySavedCard: cards.removeEverySavedCard,
    SUSPENDED_SENTENCE: SENTENCE,
    useAuth: () => ({ logout: async () => ({ error: null }) }),
    useAnnounce: (message) => message && log.push(`announce ${message}`),
    spacing: anyKey, textScale: anyKey,
    themedStyles: (factory) => (colors) => factory(colors),
    useThemeColors: () => ({ palette: anyKey }),
    DeleteAccountScreen: function DeleteAccountScreen() {},
  };
  const names = Object.keys(deps);
  const { SuspendedAccountScreen } = new Function(...names, `${js}\nreturn { SuspendedAccountScreen };`)(...names.map((n) => deps[n]));
  const all = (node, out = []) => {
    if (Array.isArray(node)) node.forEach((n) => all(n, out));
    else if (node && typeof node === 'object' && 'type' in node) {
      out.push(node);
      all(node.props.children, out);
    }
    return out;
  };
  const draw = () => {
    cursor = 0;
    const tree = SuspendedAccountScreen();
    const elements = all(tree);
    return {
      buttons: elements.filter((e) => e.type === 'Button'),
      // Every text the screen shows, in order: the sentence, the address, then the card line.
      result: elements.filter((e) => e.type === 'Text').map((e) => e.props.children),
    };
  };
  return { draw, log };
}
const button = (drawn, title) => drawn.buttons.find((b) => b.props.title === title);

test('B7 R5: the suspended screen offers "Remove Saved Cards" on the card path only, behind its confirmation, then says in one line what happened', async () => {
  // Payments off: no card path, no row.
  const off = suspendedScreen({ mode: 'disabled', confirm: () => true });
  assert.deepEqual(off.draw().buttons.map((b) => b.props.title), ['Delete Account', 'Sign Out']);

  // "Cancel": nothing is called, no line.
  let calls = cardProvider([]);
  let screen = suspendedScreen({ mode: 'stripe', confirm: () => false });
  let drawn = screen.draw();
  assert.deepEqual(drawn.buttons.map((b) => [b.props.title, b.props.variant]), [
    ['Remove Saved Cards', 'quiet'], ['Delete Account', 'quiet'], ['Sign Out', 'quiet'],
  ]);
  button(drawn, 'Remove Saved Cards').props.onPress();
  for (let i = 0; i < 5; i += 1) await tick();
  assert.deepEqual(screen.log, ['confirm Remove your saved cards? / This removes every saved card from your account. / Remove']);
  assert.deepEqual(calls, []);
  assert.deepEqual(screen.draw().result, [SENTENCE, 'brazosmvp@gmail.com']);

  // "Remove": list and remove until the list is empty; two fast taps ask once.
  let listed;
  const firstList = new Promise((resolve) => (listed = resolve));
  calls = cardProvider([firstList, cardOk({ removed: true }), cardOk({ cards: [] })]);
  let answer;
  const asked = new Promise((resolve) => (answer = resolve));
  screen = suspendedScreen({ mode: 'stripe', confirm: () => asked });
  drawn = screen.draw();
  button(drawn, 'Remove Saved Cards').props.onPress();
  button(drawn, 'Remove Saved Cards').props.onPress();
  answer(true);
  await tick();
  // While it runs: the row spins and Delete Account waits.
  drawn = screen.draw();
  assert.equal(button(drawn, 'Remove Saved Cards').props.loading, true);
  assert.equal(button(drawn, 'Delete Account').props.disabled, true);
  listed(cardOk({ cards: [VISA] }));
  for (let i = 0; i < 10; i += 1) await tick();
  assert.equal(screen.log.filter((entry) => entry.startsWith('confirm')).length, 1, 'one confirmation');
  assert.deepEqual(calls, ['list', 'remove pm_1', 'list']);
  drawn = screen.draw();
  assert.deepEqual(drawn.result, [SENTENCE, 'brazosmvp@gmail.com', 'Your saved cards are removed.']);
  assert.ok(screen.log.includes('announce Your saved cards are removed.'), 'spoken on iOS');
  assert.equal(button(drawn, 'Remove Saved Cards').props.loading, false);
  assert.equal(button(drawn, 'Delete Account').props.disabled, false);

  // A failure: its one sentence, and nothing is said to be removed.
  const failures = [
    [[cardRefused(502, 'The payment provider is unavailable right now.')], 'Brazos couldn’t check your saved cards. The payment provider is unavailable right now.'],
    [[cardOk({ cards: [VISA] }), cardRefused(502, 'The payment provider is unavailable right now.')], 'A saved card couldn’t be removed from the payment provider. The payment provider is unavailable right now.'],
  ];
  for (const [answers, line] of failures) {
    cardProvider(answers);
    screen = suspendedScreen({ mode: 'stripe', confirm: () => true });
    button(screen.draw(), 'Remove Saved Cards').props.onPress();
    for (let i = 0; i < 10; i += 1) await tick();
    assert.deepEqual(screen.draw().result.slice(2), [line]);
  }
  assert.equal(cards.cardRemovalMessage({ kind: 'rounds' }), 'Some saved cards are still on your account. Try again.');
  assert.equal(cards.cardRemovalMessage(null), 'Your saved cards are removed.');
});

// ---------------------------------------------------------------- the admin entry (for B6)

test('[static] the admin entry is a list of rows inside Account & Safety, each opening its screen directly', () => {
  const profile = flat(read('screens/ProfileScreen.tsx'));
  // T4: the second row opens B6's screen.
  assert.match(
    profile,
    /const ADMIN_ROWS = \[ \{ label: 'Review Reports', route: 'AdminReports' \}, \{ label: 'Needs Attention', route: 'AdminAttention' \}, \] as const;/
  );
  assert.match(profile, /\{profile\?\.is_admin \? ADMIN_ROWS\.map\(\(admin\) => \( <PressScale key=\{admin\.route\}/);
  assert.match(profile, /onPress=\{\(\) => navigation\.navigate\(admin\.route\)\}/);
  assert.doesNotMatch(profile, /navigate\('AdminReports'\)/);
  assert.doesNotMatch(profile, /navigate\('AdminAttention'\)/);
});

test('[static] T4 · the Needs Attention route is registered once each, beside AdminReports, on the shared profile stack', () => {
  const params = flat(read('lib/navigation.ts'));
  assert.match(params, /AdminReports: undefined; AdminAttention: undefined;/);
  assert.equal((params.match(/AdminAttention:/g) ?? []).length, 1);
  const stacks = flat(read('navigation/sharedStacks.tsx'));
  assert.match(stacks, /import \{ AdminAttentionScreen \} from '\.\.\/screens\/AdminAttentionScreen';/);
  assert.match(
    stacks,
    /<ProfileStack\.Screen name="AdminReports" component=\{AdminReportsScreen\} \/> <ProfileStack\.Screen name="AdminAttention" component=\{AdminAttentionScreen\} \/>/
  );
  assert.equal((stacks.match(/name="AdminAttention"/g) ?? []).length, 1);
  // B6 replaced T4's placeholder: the screen keeps the title and the back arrow (tests/adminAttention.test.mjs runs it).
  const screen = flat(read('screens/AdminAttentionScreen.tsx'));
  assert.match(screen, /<TopBar title="Needs Attention" onBack=\{goBackOrHome\} \/>/);
});
