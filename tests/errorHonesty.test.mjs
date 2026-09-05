import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Batch H — error-handling honesty. One lens: can a failure be mistaken for
 * a fact? A failed read must render as "couldn't load", never as "no
 * dispute", "no payment", "accepted", or a normal job quietly progressing
 * to auto-release.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Executed against the real derivation, not its prose.
const { deriveJobLifecycle } = await import(
  pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href
);

// ===========================================================================
// F-026 — a failed dispute read derives ONLY 'unknown'
// ===========================================================================

test('a failed dispute read never yields a lifecycle state other than unknown', () => {
  // Every status the database can hold plus one it cannot, crossed with
  // every payment posture — none of them may outrank a failed dispute read.
  const statuses = [
    'draft',
    'open',
    'assigned',
    'in_progress',
    'completed',
    'cancelled',
    'not-a-status',
  ];
  const payments = [null, { status: 'held' }, { status: 'authorized' }, { status: 'released' }];
  for (const status of statuses) {
    for (const payment of payments) {
      assert.equal(
        deriveJobLifecycle({
          job: {
            status,
            en_route_at: '2026-08-01T00:00:00Z',
            arrived_at: '2026-08-01T01:00:00Z',
            completed_at: '2026-08-01T02:00:00Z',
          },
          payment,
          hasOpenDispute: 'unknown',
        }),
        'unknown',
        `status=${status} payment=${payment?.status ?? 'none'} must derive unknown`
      );
    }
  }
});

test('a settled dispute read still derives normally — unknown is only for failure', () => {
  const done = { status: 'completed', en_route_at: null, arrived_at: null };
  assert.equal(
    deriveJobLifecycle({ job: done, payment: { status: 'held' }, hasOpenDispute: false }),
    'awaiting_approval'
  );
  assert.equal(
    deriveJobLifecycle({ job: done, payment: { status: 'held' }, hasOpenDispute: true }),
    'disputed'
  );
});

// ===========================================================================
// The two dispute-read screens hold the tri-state and pass it through
// ===========================================================================

test('TrackWorkerScreen models a failed dispute read as unknown, not false', () => {
  const src = read('screens/TrackWorkerScreen.tsx');
  assert.match(src, /useState<boolean \| 'unknown'>\(false\)/);
  assert.match(src, /disputeResult\.error \? 'unknown' : !!disputeResult\.data/);
  // The screen-level surface: a failed read renders the shared error state
  // with a retry, never the timeline.
  assert.match(src, /statusReads === 'error'/);
  assert.match(src, /kind: 'error'/);
  assert.match(src, /onRetry: \(\) => setReadAttempt/);
  // The dispute note renders only from a POSITIVE dispute answer.
  assert.match(src, /\{hasOpenDispute === true \? \(/);
});

// ===========================================================================
// F-026 — the discarded-error idiom is extinct
// ===========================================================================

test('no screen, hook, or component silently discards a read error', () => {
  // `if (active && !error) setX(data)` was the audit's signature for a
  // failure indistinguishable from a fact (04_data_binding.md §3). Every
  // read now either stores the failure or surfaces it; the idiom itself is
  // fenced out.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(root, rel)).isDirectory()) {
        walk(rel);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (read(rel).includes('if (active && !error)')) offenders.push(rel);
    }
  };
  for (const dir of ['screens', 'hooks', 'components']) walk(dir);
  assert.deepEqual(offenders, [], 'reads must record or surface their errors');
});

test('the remaining discarded reads each surface with a retry', () => {
  const jobDetail = read('screens/JobDetailScreen.tsx');
  assert.match(jobDetail, /setPosterReadFailed\(!!\(profileResult\.error \|\| statsResult\.error\)\)/);
  assert.match(jobDetail, /Couldn’t load who posted this job/);
  assert.match(jobDetail, /setPosterReadAttempt\(\(attempt\) => attempt \+ 1\)/);

  const profileDetails = read('screens/ProfileDetailsScreen.tsx');
  assert.match(profileDetails, /if \(error\) setStatsReadFailed\(true\);/);
  assert.match(profileDetails, /Job history didn’t load — retry/);

  const clientDetail = read('screens/ClientJobDetailScreen.tsx');
  assert.match(clientDetail, /if \(error\) setAddressReadFailed\(true\);/);
  assert.match(clientDetail, /Couldn’t load the exact address/);

  // The owner-actions eligibility read fails CLOSED and says so.
  const ownerHook = read('hooks/useJobOwnerActions.ts');
  assert.match(ownerHook, /setCountError\(true\);/);
  assert.doesNotMatch(
    ownerHook,
    /error \? 0|: 0\)\s*;?\s*\/\/ guessed/,
    'a failed count must never be guessed to zero'
  );
  const ownerActions = read('components/JobOwnerActions.tsx');
  assert.match(ownerActions, /manageCheckFailed/);
  assert.match(ownerActions, /Couldn’t check this job’s bids/);
  assert.match(ownerActions, /onPress=\{retryManageCheck\}/);
});

// ===========================================================================
// F-027 — TrackWorkerScreen earns its ready state
// ===========================================================================

test('TrackWorkerScreen holds loading until its reads settle, through the shared template', () => {
  const src = read('screens/TrackWorkerScreen.tsx');
  // Configured, not reinvented: the states flow through DetailScreen's
  // ScreenState prop, which renders the shared loading/error variants.
  assert.match(src, /from '\.\.\/ui\/templates\/DetailScreen'/);
  assert.match(src, /statusReads === 'loading' \|\| workerRead === 'pending'/);
  assert.match(src, /\{ kind: 'loading' \}/);
  // Both fetch paths settle the tracker — including the no-worker shortcut.
  assert.match(src, /setWorkerRead\('settled'\)/);
  // Ready is the ternary's LAST resort, after error and loading.
  const ternary = src.slice(src.indexOf('const state: ScreenState'));
  const errorAt = ternary.indexOf("kind: 'error'");
  const loadingAt = ternary.indexOf("kind: 'loading'");
  const readyAt = ternary.indexOf("kind: 'ready'");
  assert.ok(errorAt >= 0 && loadingAt > errorAt && readyAt > loadingAt);
});

test('ClientJobDetailScreen passes unknown to the derivation and gates its money surfaces', () => {
  const src = read('screens/ClientJobDetailScreen.tsx');
  assert.match(src, /hasOpenDispute: statusReadError \? 'unknown' : !!openDispute/);
  // The retry banner exists and the completed fork is held back behind it.
  assert.match(src, /statusReadError \? null : payment \? \(/);
  assert.match(src, /Couldn’t load payment details/);
  assert.match(src, /setStatusReadAttempt\(\(attempt\) => attempt \+ 1\)/);
  // The failed pair is recorded from either read's error.
  assert.match(src, /setStatusReadError\(!!\(paymentResult\.error \|\| disputeResult\.error\)\)/);
});

// ===========================================================================
// F-013 — the legal gate fails CLOSED
// ===========================================================================
// hooks/useLegalGate.ts EXECUTED offline — react, useAuth and the legal read
// replaced with stubs (the postJobDraft.test.mjs arrangement) — so "a failed
// read never admits" is a property this suite proves, not prose it repeats.

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// A micro hook runtime: enough React for this one hook. Effects are captured
// per render and run by the harness; state lives across renders.
globalThis.__legalHarness = { states: [], idx: 0, effects: [] };
const reactStub =
  'const h = () => globalThis.__legalHarness;' +
  'export function useState(init) {' +
  '  const i = h().idx++;' +
  "  if (h().states.length <= i) h().states.push(typeof init === 'function' ? init() : init);" +
  "  const set = (v) => { h().states[i] = typeof v === 'function' ? v(h().states[i]) : v; };" +
  '  return [h().states[i], set];' +
  '}' +
  'export function useCallback(fn) { return fn; }' +
  'export function useEffect(fn) { h().effects.push(fn); }';

const legalGateModule = (async () => {
  let js = stripTypeScriptTypes(read('hooks/useLegalGate.ts'), { mode: 'strip' });
  const replacements = [
    [
      "import { useCallback, useEffect, useState } from 'react';",
      `import { useCallback, useEffect, useState } from '${toDataUrl(reactStub)}';`,
    ],
    [
      "import { fetchLegalStatus } from '../lib/legal';",
      'const fetchLegalStatus = (...args) => globalThis.__legalFetch(...args);',
    ],
    [
      "import { useAuth } from './useAuth';",
      "const useAuth = () => ({ user: { id: 'user-1' } });",
    ],
    // n9: the crash reporter is a nullable seam in the app (a caught require
    // that resolves to null off-device) and null here, so the capture beside
    // the console.error is a no-op.
    ["import { Sentry } from '../lib/observability/sentry';", 'const Sentry = null;'],
    // m1: the render-time derivation (lib/gateAnswer.ts) is pure and real
    // here — it loads by absolute file URL because a data: module cannot
    // resolve a relative specifier. Not a stub: the fail-closed rule below is
    // proven through the same derivation the app uses.
    [
      "import { deriveGateAnswer } from '../lib/gateAnswer';",
      `import { deriveGateAnswer } from '${pathToFileURL(join(root, 'lib/gateAnswer.ts')).href}';`,
    ],
  ];
  for (const [from, to] of replacements) {
    assert.ok(js.includes(from), `expected the runtime import: ${from}`);
    js = js.replace(from, to);
  }
  return import(toDataUrl(js));
})();

/** Mount the hook, run its effect, let the read settle, read the state. */
async function settleGate(useLegalGate) {
  const h = globalThis.__legalHarness;
  h.states = [];
  h.idx = 0;
  h.effects = [];
  useLegalGate();
  const effects = h.effects;
  for (const fn of effects) fn();
  // Two macrotask turns: one for the read to settle, one for the setState.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  h.idx = 0;
  h.effects = [];
  return useLegalGate();
}

test('a REJECTED acceptance read resolves to unknown — never accepted', async () => {
  const { useLegalGate } = await legalGateModule;
  globalThis.__legalFetch = () => Promise.reject(new Error('offline'));
  const gate = await settleGate(useLegalGate);
  assert.equal(gate.state, 'unknown');
  assert.notEqual(gate.state, 'accepted');
});

test('a failed (status unknown) read resolves to unknown — never accepted', async () => {
  const { useLegalGate } = await legalGateModule;
  globalThis.__legalFetch = () =>
    Promise.resolve({ status: 'unknown', error: 'network request failed' });
  const gate = await settleGate(useLegalGate);
  assert.equal(gate.state, 'unknown');
});

test('the gate still admits on a real accepted answer and re-prompts on needs_acceptance', async () => {
  const { useLegalGate } = await legalGateModule;
  globalThis.__legalFetch = () => Promise.resolve({ status: 'accepted' });
  assert.equal((await settleGate(useLegalGate)).state, 'accepted');
  globalThis.__legalFetch = () => Promise.resolve({ status: 'needs_acceptance' });
  assert.equal((await settleGate(useLegalGate)).state, 'needs_acceptance');
});

test('the pure mapping allow-lists: anything unrecognized stays unknown', async () => {
  const { gateStateForStatus } = await legalGateModule;
  assert.equal(gateStateForStatus('accepted'), 'accepted');
  assert.equal(gateStateForStatus('needs_acceptance'), 'needs_acceptance');
  for (const bad of ['unknown', '', 'error', 'ACCEPTED', 'yes', 'null']) {
    assert.equal(gateStateForStatus(bad), 'unknown', `'${bad}' must stay unknown`);
  }
});

test('App.tsx blocks on unknown with the shared error state and a retry', () => {
  const app = read('App.tsx');
  assert.match(app, /legal\.state === 'unknown'/);
  assert.match(app, /ScreenStateView/);
  assert.match(app, /onRetry: legal\.recheck/);
  // The unknown block sits BEFORE the ready fall-through to MainTabs.
  assert.ok(app.indexOf("legal.state === 'unknown'") < app.indexOf('return <MainTabs />'));
});

test("the fail-open log line is extinct in source", () => {
  // The fail-open path's own words, fenced extinct. The needle is assembled
  // so this file never contains it either; docs/ keeps the audit record.
  const needle = 'allowing' + ' through';
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(root, rel)).isDirectory()) {
        walk(rel);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js|json|md)$/.test(entry)) continue;
      if (read(rel).includes(needle)) offenders.push(rel);
    }
  };
  for (const dir of [
    'screens',
    'hooks',
    'components',
    'lib',
    'modes',
    'navigation',
    'ui',
    'dev-tools',
    'tests',
  ]) {
    walk(dir);
  }
  if (read('App.tsx').includes(needle)) offenders.push('App.tsx');
  assert.deepEqual(offenders, [], 'the gate fails closed; nothing allows through');
});

// ===========================================================================
// F-042 — the six user-visible console-only paths recover or surface
// ===========================================================================
// The draft-save and dead-tap paths are EXECUTED in postJobDraft.test.mjs and
// crossModeNotification.test.mjs; the wiring fences here hold the remaining
// best-effort paths to their contract: one retry, then the failure RECORDED
// in state a later moment acts on — never a console line as the only record.

test('sign-out token deactivation retries once and records its debt for the next sign-in', () => {
  const lib = read('lib/pushNotifications.ts');
  // Two deactivation attempts, then the recorded debt.
  assert.match(lib, /if \(error\) \(\{ error \} = await deactivateToken\(token\)\);/);
  assert.match(lib, /PENDING_DEACTIVATION_KEY = 'brazos\.push\.pendingDeactivation'/);
  assert.match(lib, /AsyncStorage\.setItem\(PENDING_DEACTIVATION_KEY, token \?\? '\*'\)/);
  // The settle path exists and clears only on a successful write.
  assert.match(lib, /export async function settlePendingPushDeactivation/);
  assert.match(lib, /AsyncStorage\.removeItem\(PENDING_DEACTIVATION_KEY\)/);
});

test('the launch token sync retries, then re-arms on every app foreground', () => {
  const hook = read('hooks/usePushNotifications.ts');
  // The debt from a failed sign-out settles BEFORE this account registers.
  assert.ok(
    hook.indexOf('settlePendingPushDeactivation()') < hook.indexOf('registerPushToken({ interactive: false })'),
    'settling must precede registration'
  );
  // A failed sync retries once, is held, and re-syncs on foreground.
  assert.match(hook, /result = await registerPushToken\(\{ interactive: false \}\);/);
  assert.match(hook, /syncFailedRef\.current = true;/);
  assert.match(hook, /nextState === 'active' && syncFailedRef\.current/);
  // Terminal answers are not failures: only reason 'error' retries.
  assert.match(hook, /result\.reason === 'error'/);
});

test('a failed server-side mode write is recorded and repaid at the next resolution', () => {
  const provider = read('modes/ModeProvider.tsx');
  // One retry, then the debt.
  assert.match(provider, /if \(error\) \(\{ error \} = await setMyActiveMode\(mode\)\);/);
  assert.match(provider, /await writePendingModeWrite\(userId, mode\);/);
  // Resolution reads the debt, refuses the stale remote, and re-pushes.
  assert.match(provider, /readPendingModeWrite\(userId\)/);
  assert.match(provider, /const remote = pendingWrite \? null : remoteResult\.data;/);
  assert.match(provider, /local: pendingWrite \?\? local/);
  assert.match(provider, /if \(pendingWrite \|\| resolved !== remoteResult\.data\)/);
  // Both write paths go through the one retrying, recording helper.
  assert.match(provider, /void persistModeServerSide\(userId, target\);/);
  assert.doesNotMatch(
    provider,
    /void setMyActiveMode/,
    'no bare fire-and-forget server write may remain'
  );

  const storage = read('modes/modeStorage.ts');
  assert.match(storage, /brazos\.mode\.pendingWrite\.v1\./);
});

test('every ReviewSection storage cleanup goes through the retrying helper', () => {
  const review = read('components/ReviewSection.tsx');
  assert.match(review, /async function deletePhotoWithRetry\(url: string\)/);
  // The helper itself is the only caller of deleteJobPhoto in this file.
  const direct = review.match(/deleteJobPhoto\(/g) ?? [];
  assert.equal(
    direct.length,
    2,
    'exactly the two attempts inside deletePhotoWithRetry may call deleteJobPhoto'
  );
  // A url that still fails stays in draftPhotosRef for the later sweeps.
  assert.match(review, /if \(deleted\) draftPhotosRef\.current\.delete\(url\);/);
});
