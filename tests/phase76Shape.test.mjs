import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// phase76 is authored, hand-applied by the operator, and never executed by
// any agent run — so its load-bearing shape is pinned as TEXT, the same way
// the other .sql fences work. The paired group in scripts/verify-schema.mjs
// is pinned through its exports (import is side-effect free per the F-003
// contract proven in verifySchemaGuards.test.mjs).
import { classifyPostureResponse } from '../scripts/verify-schema.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/phase76_rls_and_search_path_corrections.sql';

/** Comment-and-blank-stripped statement lines, in order. */
function statementLines(sql) {
  return sql
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('--'));
}

test('phase76 is one transaction: opens with begin;, ends with commit;', async () => {
  const lines = statementLines(await read(MIGRATION));
  assert.ok(lines.length > 0, 'the migration must contain statements');
  assert.equal(
    lines[0],
    'begin;',
    'the first statement must open the transaction — phase76 has no pre-transaction section (unlike phase50, it adds no enum values)'
  );
  assert.equal(
    lines[lines.length - 1],
    'commit;',
    'the last statement must be the commit — the self-check and sentinel live INSIDE the transaction so a failed assertion aborts the whole file'
  );
  // Exactly one transaction, not several stacked ones.
  assert.equal(lines.filter((l) => l === 'begin;').length, 1);
  assert.equal(lines.filter((l) => l === 'commit;').length, 1);
});

test('phase76 declares its sentinel, and the verify-schema group watches the same name', async () => {
  const sql = await read(MIGRATION);
  const sentinelDecl = sql.indexOf(
    'create or replace function public.phase76_corrections_enabled()'
  );
  assert.ok(sentinelDecl > -1, 'the sentinel function must be declared');

  // Created LAST: the sentinel declaration must sit after the self-check, so
  // its existence on staging proves the assertions passed.
  const selfCheck = sql.indexOf('PHASE76 SELF-CHECK FAIL');
  assert.ok(selfCheck > -1, 'the in-transaction self-check must exist');
  assert.ok(
    sentinelDecl > selfCheck,
    'the sentinel must be created after the self-check, not before it'
  );

  const verify = await read('scripts/verify-schema.mjs');
  const group = verify.indexOf("file: 'phase76_rls_and_search_path_corrections.sql'");
  assert.ok(group > -1, 'verify-schema.mjs must carry a phase76 group');
  const groupSlice = verify.slice(group, group + 800);
  assert.match(
    groupSlice,
    /sentinel: \['rpc phase76_corrections_enabled\(\)', \(\) =>\s*checkRpc\('phase76_corrections_enabled', \{\}\)\]/,
    'the group sentinel must probe the same function name the migration declares'
  );
});

test('phase76 re-pins pg_temp on job_request_parties_ok (F-004)', async () => {
  const sql = await read(MIGRATION);
  assert.ok(
    sql.indexOf(
      'alter function public.job_request_parties_ok(uuid, uuid) set search_path = public, pg_temp;'
    ) > -1,
    'the exact one-line ALTER from the audit (08_security_schema.md E.1) must be present'
  );
});

test('phase76 adds the worker_services price ceiling as a plain constraint (F-049)', async () => {
  const sql = await read(MIGRATION);
  const constraint = sql.indexOf(
    'add constraint worker_services_money_ceiling'
  );
  assert.ok(constraint > -1, 'the named ceiling constraint must be added');
  assert.ok(
    sql.indexOf('check (price_cents >= 0 and price_cents <= 10000000)') > -1,
    'the ceiling is 10,000,000 cents with zero allowed, per the batch decision'
  );
  // The apply must abort loudly on violating rows, so the constraint must
  // not be deferred with NOT VALID (phase75 used NOT VALID deliberately;
  // this file deliberately does not).
  const tail = sql.slice(constraint, sql.indexOf(';', constraint));
  assert.equal(
    tail.includes('not valid'),
    false,
    'the ceiling must validate existing rows at apply time'
  );
});

test('phase76 never turns row-level security off', async () => {
  const sql = (await read(MIGRATION)).toLowerCase();
  assert.equal(
    sql.includes('disable row level security'),
    false,
    'a corrective RLS migration must not contain the off switch, even in prose'
  );
});

test('the posture verdict allows no warning path (phase76 group)', () => {
  // Reachable and covered: the ONLY pass.
  const good = classifyPostureResponse({
    status: 200,
    json: { payments: { rls_enabled: true, select_policy_count: 1 } },
  });
  assert.equal(good.ok, true);
  assert.match(good.note, /1 SELECT policy/);

  // Unreachable fails the group — it must never downgrade to a warning.
  const unreachable = classifyPostureResponse({
    status: 404,
    json: { code: 'PGRST202', message: 'function not found' },
  });
  assert.equal(unreachable.ok, false);
  assert.match(unreachable.detail, /not reachable/);
  assert.match(unreachable.detail, /PGRST202/);

  // A denial is unreachable too: the function is granted to anon precisely
  // so the harness can call it, so a 403 means the grant was lost.
  assert.equal(classifyPostureResponse({ status: 403, json: null }).ok, false);

  // RLS off on the money ledger is the F-002 disaster case.
  const rlsOff = classifyPostureResponse({
    status: 200,
    json: { payments: { rls_enabled: false, select_policy_count: 1 } },
  });
  assert.equal(rlsOff.ok, false);
  assert.match(rlsOff.detail, /rls_enabled/);

  // No SELECT boundary means any signed-in user sees nothing — but nothing
  // is version-controlled either; the check demands at least one policy.
  const noPolicy = classifyPostureResponse({
    status: 200,
    json: { payments: { rls_enabled: true, select_policy_count: 0 } },
  });
  assert.equal(noPolicy.ok, false);
  assert.match(noPolicy.detail, /select_policy_count/);

  // A malformed body (missing table key entirely) is broken, not covered.
  assert.equal(classifyPostureResponse({ status: 200, json: {} }).ok, false);
  assert.equal(classifyPostureResponse({ status: 200, json: null }).ok, false);
});
