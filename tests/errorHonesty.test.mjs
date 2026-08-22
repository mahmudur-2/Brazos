import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
