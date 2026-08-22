import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
