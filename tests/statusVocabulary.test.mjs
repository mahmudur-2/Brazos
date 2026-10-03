import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Batch I — the status vocabulary and its labels (F-070, F-012).
 *
 * Two guarantees, asserted offline against source text and executed code —
 * never against a database:
 *
 *   1. F-070 — the raw status literals `deriveJobLifecycle` accepts are
 *      EXACTLY the `public.job_status` values the migrations record, and
 *      every derived state that is NOT a database status is declared in an
 *      explicit allowlist here. A new status or a new derived state fails
 *      this suite until someone declares it on the other side too.
 *
 *   2. The label snapshot — every state → label string that StatusPill,
 *      StatusBadge, jobStage and the canonical lifecycle labels produce,
 *      captured before the Batch I convergence. The convergence is
 *      behavior-preserving BY CONSTRUCTION: if any of these strings moves,
 *      this suite goes red. Label changes are an operator decision, made by
 *      editing the snapshot here in a commit that says so.
 *
 * WHY THE ENUM IS RECONSTRUCTED FROM VALUE REFERENCES
 * `create type public.job_status` appears nowhere under supabase/ — like
 * profiles.verification_status (phase40's header documents the precedent),
 * the enum predates the tracked migration history. Its membership is
 * therefore reconstructed from every kind of value-level reference the
 * migrations make: ALTER TYPE additions, ::job_status casts, literal writes
 * to public.jobs.status, and the transition_job_status graph. Each pattern
 * must individually keep matching something — a regex that rots to zero
 * matches fails loudly instead of silently shrinking the enum.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const lifecycleSource = read('lib/jobLifecycle.ts');

// Executed against the real canonical module, not its prose.
const { JOB_LIFECYCLE_LABELS, STAGE_TRACK, jobPillLabel, paymentBlindStageLabel } = await import(
  pathToFileURL(join(root, 'lib/jobLifecycle.ts')).href
);

// jobStage is executed through the stripTypeScriptTypes harness (the
// errorHonesty.test.mjs arrangement) rather than a direct file import, so its
// body may gain a runtime `from './jobLifecycle'` import — node cannot
// resolve that extensionless specifier itself — without this suite caring.
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
const lifecycleModuleUrl = toDataUrl(stripTypeScriptTypes(lifecycleSource, { mode: 'strip' }));
const jobStageJs = stripTypeScriptTypes(read('lib/jobStage.ts'), { mode: 'strip' }).replace(
  /from '\.\/jobLifecycle'/g,
  `from '${lifecycleModuleUrl}'`
);
const { jobStage } = await import(toDataUrl(jobStageJs));

const sortedSet = (iterable) => [...new Set(iterable)].sort();

// ===========================================================================
// F-070a — raw inputs == the migration-recorded job_status enum, exactly
// ===========================================================================

/** The raw `case '…':` literals inside deriveJobLifecycle's status switch. */
function parseRawStatusInputs() {
  const start = lifecycleSource.indexOf('export function deriveJobLifecycle');
  assert.ok(start >= 0, 'deriveJobLifecycle exists');
  const end = lifecycleSource.indexOf('\nexport ', start + 1);
  assert.ok(end > start, 'deriveJobLifecycle is followed by another export');
  const body = lifecycleSource.slice(start, end);
  const raws = [...body.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]);
  assert.ok(raws.length > 0, 'the status switch has case labels');
  return sortedSet(raws);
}

/** Every job_status value the migrations record, by reference kind. */
function parseMigrationEnum() {
  const files = readdirSync(join(root, 'supabase', 'archive', 'phases')).filter((f) => f.endsWith('.sql'));
  assert.ok(files.length > 50, 'the migration directory is populated');

  const patterns = {
    // phase45: alter type public.job_status add value if not exists 'draft'
    alterType: /alter\s+type\s+public\.job_status\s+add\s+value\s+if\s+not\s+exists\s+'([a-z_]+)'/gi,
    // seeds, accept_offer, delete gates: 'open'::job_status, 'assigned'::public.job_status, …
    casts: /'([a-z_]+)'\s*::\s*(?:public\.)?job_status\b/g,
    // ban_user (phase13) and delete_my_account (phase67/75) write cancelled
    // directly; [^;] keeps the window inside one statement.
    jobsWrites: /update\s+public\.jobs\b[^;]{0,400}?set\s+status\s*=\s*'([a-z_]+)'/gi,
    // transition_job_status's whole graph, every re-issue of it:
    // (v_job.status = 'assigned' and p_status = 'in_progress') or …
    transitions: /v_job\.status\s*=\s*'([a-z_]+)'\s*and\s*p_status\s*=\s*'([a-z_]+)'/g,
  };

  const byPattern = { alterType: new Set(), casts: new Set(), jobsWrites: new Set(), transitions: new Set() };
  for (const file of files) {
    const sql = read(join('supabase', 'archive', 'phases', file));
    for (const [name, pattern] of Object.entries(patterns)) {
      for (const m of sql.matchAll(pattern)) {
        byPattern[name].add(m[1]);
        if (m[2]) byPattern[name].add(m[2]);
      }
    }
  }

  for (const [name, values] of Object.entries(byPattern)) {
    assert.ok(values.size > 0, `the ${name} pattern still matches the migrations`);
  }
  assert.ok(byPattern.alterType.has('draft'), 'phase45 adds draft via ALTER TYPE');
  assert.ok(byPattern.jobsWrites.has('cancelled'), 'the raw cancel writes are found');

  return sortedSet([...byPattern.alterType, ...byPattern.casts, ...byPattern.jobsWrites, ...byPattern.transitions]);
}

const rawInputs = parseRawStatusInputs();
const migrationEnum = parseMigrationEnum();

test('F-070a · the raw statuses the derivation accepts are exactly the migration enum', () => {
  assert.deepEqual(
    rawInputs,
    migrationEnum,
    'lib/jobLifecycle.ts and the migrations disagree on the job_status vocabulary'
  );
  // The concrete set, spelled out so a legitimate widening edits THIS line in
  // the same commit as the migration that justifies it.
  assert.deepEqual(migrationEnum, ['assigned', 'cancelled', 'completed', 'draft', 'in_progress', 'open']);
});

// ===========================================================================
// F-070b — derived states beyond the enum are declared, never accidental
// ===========================================================================

/**
 * The JobLifecycleState union members, walked line by line off the value
 * lines. The terminator is the LINE that ends with ';' — the union's doc
 * comments contain semicolons of their own, so a bare indexOf(';') cuts the
 * union short.
 */
function parseDerivedUnion() {
  const start = lifecycleSource.indexOf('export type JobLifecycleState');
  assert.ok(start >= 0, 'JobLifecycleState exists');
  const states = [];
  let terminated = false;
  for (const line of lifecycleSource.slice(start).split('\n')) {
    const member = line.match(/^\s*(?:\||=)?\s*'([a-z_]+)'/);
    if (member) states.push(member[1]);
    if (/;\s*$/.test(line)) {
      terminated = true;
      break;
    }
  }
  assert.ok(terminated, 'the union terminates');
  assert.ok(states.length > 0, 'the union has members');
  return sortedSet(states);
}

/**
 * Every derived state that is NOT a database status, each with the fact that
 * makes it derivable. Adding a JobLifecycleState member means declaring it
 * here (or adding it to the enum) in the same commit — that is the point.
 */
const DERIVED_BEYOND_ENUM = {
  pending_payment: 'assigned, but no held payment — the ledger fact, never stored on jobs',
  confirmed: 'assigned + payment held (§H.1 "confirmed") — derived from the ledger',
  en_route: 'assigned + jobs.en_route_at (phase51 declaration) — a timestamp, not a status',
  arrived: 'assigned + jobs.arrived_at (phase51 declaration) — a timestamp, not a status',
  awaiting_approval: 'completed + payment still held — the §9 approval gate, never stored',
  disputed: 'completed + held + an open job_disputes row — frozen release, never stored',
  unknown: 'the dispute/payment read FAILED (Batch H) — a client fact no database row holds',
};

test('F-070b · every derived state beyond the enum is declared, and assigned never surfaces', () => {
  const derived = parseDerivedUnion();
  const beyond = derived.filter((state) => !migrationEnum.includes(state));
  assert.deepEqual(
    beyond,
    sortedSet(Object.keys(DERIVED_BEYOND_ENUM)),
    'a derived state exists that neither the enum nor the allowlist declares (or a stale allowlist entry survives)'
  );
  // The one enum value that never comes OUT of the derivation: raw 'assigned'
  // always refines (pending_payment / confirmed / en_route / arrived).
  assert.deepEqual(
    migrationEnum.filter((value) => !derived.includes(value)),
    ['assigned']
  );
});

// ===========================================================================
// Label snapshot — decision 4. Captured 2026-08-22, BEFORE the Batch I
// convergence (commits 3–6). A red assertion here means a user-visible
// string moved; that is an operator decision, not a consolidation side
// effect. Byte-frozen: do not "fix" this test to make a refactor pass.
// ===========================================================================

/** key: 'Label' entries of a named object literal, parsed from source. */
function parseLabelMap(source, name, file) {
  const anchor = source.indexOf(`const ${name}`);
  assert.ok(anchor >= 0, `${file} declares ${name}`);
  const open = source.indexOf('{', anchor);
  const close = source.indexOf('};', open);
  assert.ok(open > anchor && close > open, `${name} is a closed literal`);
  const map = {};
  for (const m of source.slice(open, close).matchAll(/([a-z_]+):\s*'([^']*)'/g)) {
    map[m[1]] = m[2];
  }
  assert.ok(Object.keys(map).length > 0, `${name} has entries`);
  return map;
}

test('label snapshot · StatusPill maps are byte-frozen', () => {
  const pill = read('ui/primitives/StatusPill.tsx');
  // C1 (pick C1b): the shared states read THE lifecycle labels — asserted as
  // references here, and their words are frozen by the lifecycle snapshot below.
  for (const key of ['confirmed', 'en_route', 'arrived', 'in_progress', 'completed']) {
    assert.match(pill, new RegExp(`^  ${key}: JOB_LIFECYCLE_LABELS\\.${key},\\r?$`, 'm'), `StatusPill ${key} reads the lifecycle label`);
  }
  assert.deepEqual(parseLabelMap(pill, 'JOB_LABELS', 'StatusPill'), {
    draft: 'Draft',
    published: 'Published',
    pending_payment: 'Awaiting payment',
    completion_submitted: 'Completion submitted',
    approved: 'Approved',
    expired: 'Expired',
    cancelled_by_customer: 'Cancelled by customer',
    cancelled_by_worker: 'Cancelled by worker',
    disputed: 'Issue reported',
  });
  assert.deepEqual(parseLabelMap(pill, 'OFFER_LABELS', 'StatusPill'), {
    pending: 'Pending',
    accepted: 'Accepted',
    declined: 'Declined',
    withdrawn: 'Withdrawn',
    expired: 'Expired',
    superseded: 'Superseded',
  });
  assert.deepEqual(parseLabelMap(pill, 'PAYMENT_LABELS', 'StatusPill'), {
    unfunded: 'Not funded',
    authorized: 'Payment authorized — not charged yet',
    held: 'Funds held in protection',
    released: 'Released to worker',
    paid_out: 'Paid out',
    failed: 'Payment failed',
    voided: 'Payment voided',
    refunded: 'Refunded',
    partially_refunded: 'Partially refunded',
  });
});

// The exact title-caser both StatusBadge and jobStage render fallback labels
// through. One copy may import the other (Batch I dedupes them), but every
// occurrence must stay THIS chain — an edited chain is a changed label.
const TITLE_CASER_CHAIN = ".replace(/_/g, ' ').replace(/\\b\\w/g, (c) => c.toUpperCase())";
const titleCase = (status) => status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function assertFrozenTitleCaser(source, file) {
  let occurrences = 0;
  for (let idx = source.indexOf('.replace(/_/g'); idx >= 0; idx = source.indexOf('.replace(/_/g', idx + 1)) {
    assert.equal(
      source.slice(idx, idx + TITLE_CASER_CHAIN.length),
      TITLE_CASER_CHAIN,
      `${file}'s title-caser must stay the frozen chain`
    );
    occurrences += 1;
  }
  return occurrences;
}

test('label snapshot · StatusBadge vocabulary and title-caser are byte-frozen', () => {
  const badge = read('components/StatusBadge.tsx');
  const stage = read('lib/jobStage.ts');

  const start = badge.indexOf('const byStatus');
  const end = badge.indexOf('};', start);
  assert.ok(start >= 0 && end > start, 'byStatus exists');
  const keys = sortedSet(
    [...badge.slice(start, end).matchAll(/^\s*([a-z_]+):\s*\{/gm)].map((m) => m[1])
  );

  // What each colour key RENDERS when no label override is passed.
  const expected = {
    open: 'Open',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Rejected',
    declined: 'Declined',
    withdrawn: 'Withdrawn',
    expired: 'Expired',
    superseded: 'Superseded',
    actioned: 'Actioned',
    dismissed: 'Dismissed',
  };
  assert.deepEqual(keys, sortedSet(Object.keys(expected)));
  assert.deepEqual(
    Object.fromEntries(keys.map((key) => [key, titleCase(key)])),
    expected
  );

  // The render pipeline itself: override wins, otherwise the shared caser.
  assert.match(badge, /\{label \?\? formatStatus\(status\)\}/);
  const chainCopies = assertFrozenTitleCaser(badge, 'StatusBadge') + assertFrozenTitleCaser(stage, 'jobStage');
  assert.ok(chainCopies >= 1, 'the title-caser exists in StatusBadge or jobStage');
});

test('label snapshot · jobStage renders exactly the frozen stage labels', () => {
  // The evolving detail-screen badge, executed. Covers the bid overlay, the
  // poster-only In Progress privacy rule, and the title-cased fallback.
  assert.deepEqual(jobStage('open', null, true), { statusKey: 'open', label: 'Open' });
  assert.deepEqual(jobStage('open', 0, false), { statusKey: 'open', label: 'Open' });
  assert.deepEqual(jobStage('open', 3, true), { statusKey: 'pending', label: 'Bids Pending (3)' });
  assert.deepEqual(jobStage('open', 1, false), { statusKey: 'pending', label: 'Bids Pending (1)' });
  // C1 (pick C1b, 2026-10-03): Assigned → Booked, In Progress → Working, Completed → Done.
  assert.deepEqual(jobStage('assigned', null, true), { statusKey: 'assigned', label: 'Booked' });
  assert.deepEqual(jobStage('assigned', null, false), { statusKey: 'assigned', label: 'Booked' });
  assert.deepEqual(jobStage('in_progress', null, true), { statusKey: 'in_progress', label: 'Working' });
  // The privacy rule: everyone but the poster sees a merely-assigned job.
  assert.deepEqual(jobStage('in_progress', null, false), { statusKey: 'assigned', label: 'Booked' });
  assert.deepEqual(jobStage('completed', null, true), { statusKey: 'completed', label: 'Done' });
  assert.deepEqual(jobStage('completed', null, false), { statusKey: 'completed', label: 'Done' });
  assert.deepEqual(jobStage('cancelled', null, true), { statusKey: 'cancelled', label: 'Cancelled' });
  assert.deepEqual(jobStage('draft', null, true), { statusKey: 'draft', label: 'Draft' });
  // A status this client cannot classify keeps the raw-status fallback — it
  // never lands on a confident track position.
  assert.deepEqual(jobStage('mystery_state', null, true), { statusKey: 'mystery_state', label: 'Mystery State' });
});

test('label snapshot · the canonical lifecycle labels are byte-frozen', () => {
  assert.deepEqual(JOB_LIFECYCLE_LABELS, {
    draft: 'Draft',
    open: 'Open',
    // C1 (pick C1b, 2026-10-03): Booked · On the way · Here · Working · Done.
    pending_payment: 'Awaiting payment',
    confirmed: 'Booked',
    en_route: 'On the way',
    arrived: 'Here',
    in_progress: 'Working',
    awaiting_approval: 'Done',
    disputed: 'Issue reported',
    completed: 'Done',
    cancelled: 'Cancelled',
    unknown: 'Unknown',
  });
});

test('C1 · one set of stage words (pick C1b), and a pill says Paid only once the ledger says released', () => {
  assert.deepEqual([...STAGE_TRACK], ['Booked', 'On the way', 'Here', 'Working', 'Done']);
  // Paid: completed AND released / paid_out. Allow-listed, never block-listed.
  assert.equal(jobPillLabel('completed', 'released'), 'Paid');
  assert.equal(jobPillLabel('completed', 'paid_out'), 'Paid');
  for (const status of ['held', 'authorized', 'unfunded', 'failed', 'voided', 'refunded', 'partially_refunded', 'mystery', null, undefined]) {
    assert.equal(jobPillLabel('completed', status), 'Done', `completed + ${status} is Done, never Paid`);
  }
  // A released row on any other state (a stale read) is still never Paid.
  for (const state of Object.keys(JOB_LIFECYCLE_LABELS).filter((s) => s !== 'completed' && s !== 'unknown')) {
    assert.equal(jobPillLabel(state, 'released'), JOB_LIFECYCLE_LABELS[state]);
  }
  // An unclassifiable status claims no stage: the badge keeps its raw fallback.
  assert.equal(jobPillLabel('unknown', 'released'), undefined);
  // The pill list the operator picked, every word reachable.
  const pills = new Set(['open', 'confirmed', 'en_route', 'arrived', 'in_progress', 'completed', 'cancelled'].map((s) => jobPillLabel(s, null)));
  pills.add(jobPillLabel('completed', 'released'));
  assert.deepEqual([...pills].sort(), ['Booked', 'Cancelled', 'Done', 'Here', 'On the way', 'Open', 'Paid', 'Working']);
  // An unfunded hire is never called Booked when the payment was read…
  assert.equal(JOB_LIFECYCLE_LABELS.pending_payment, 'Awaiting payment');
  // …and a payment-blind caller never claims "Awaiting payment" it did not read.
  assert.equal(paymentBlindStageLabel('pending_payment'), 'Booked');
  assert.equal(paymentBlindStageLabel('arrived'), 'Here');
});

test('[static] C1 · every stage surface reads its words from lib/jobLifecycle.ts — no second vocabulary', () => {
  const OLD = /['"`>](Hired|Assigned|In [Pp]rogress|Arrived|Started|Finished|Completed|Confirmed|Review work)['"`<]/;
  for (const file of [
    'lib/liveJobStatus.ts',
    'lib/jobStage.ts',
    'components/JobProgress.tsx',
    'screens/TrackWorkerScreen.tsx',
    'screens/WorkerJobScreen.tsx',
    'screens/RouteArrivalScreen.tsx',
    'ui/primitives/StatusPill.tsx',
  ]) {
    const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(source, OLD, `${file} spells an old stage word`);
    assert.match(source, /from '\.\.?\/(\.\.\/)?lib\/jobLifecycle'|from '\.\/jobLifecycle'/, `${file} reads lib/jobLifecycle`);
  }
  // The job cards' pills: the hub, the Home and the worker's job screen pass the shared label.
  for (const file of ['screens/MyJobsHubScreen.tsx', 'screens/HomeScreen.tsx', 'screens/WorkerJobScreen.tsx', 'screens/ClientJobDetailScreen.tsx']) {
    assert.match(read(file), /jobPillLabel\(/, `${file} labels its job pill through jobPillLabel()`);
  }
});
