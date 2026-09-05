import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// phase77 is authored, hand-applied by the operator, and never executed by
// any agent run - so its load-bearing shape is pinned as TEXT, the same way
// phase76Shape.test.mjs pins phase76. The migration's own proof matrix and
// self-check verify BEHAVIOUR at apply time, inside the transaction; this
// file verifies the SHAPE offline, before the file ever leaves the repo.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const MIGRATION = 'supabase/archive/phases/phase77_conversation_features.sql';

/** Comment-and-blank-stripped statement lines, in order. */
function statementLines(sql) {
  return sql
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('--'));
}

/** The migration slice from a function's declaration to its body's close. */
function functionBlock(sql, decl) {
  const start = sql.indexOf(decl);
  assert.ok(start > -1, `${decl} must be declared`);
  const end = sql.indexOf('$$;', start);
  assert.ok(end > start, `${decl} must have a dollar-quoted body`);
  return sql.slice(start, end + 3);
}

test('phase77 is one transaction: opens with begin;, ends with commit;', async () => {
  const lines = statementLines(await read(MIGRATION));
  assert.ok(lines.length > 0, 'the migration must contain statements');
  assert.equal(lines[0], 'begin;', 'the first statement must open the transaction');
  assert.equal(
    lines[lines.length - 1],
    'commit;',
    'the last statement must be the commit - the matrix, self-check and sentinel live INSIDE the transaction so a failed assertion aborts the whole file'
  );
  assert.equal(lines.filter((l) => l === 'begin;').length, 1);
  assert.equal(lines.filter((l) => l === 'commit;').length, 1);
  // House style: the transaction-scoped default precedes everything else.
  assert.equal(lines[1], 'set local search_path = public, pg_temp;');
});

test('phase77 declares its sentinel last, and the verify-schema group watches the same name', async () => {
  const sql = await read(MIGRATION);
  const sentinelDecl = sql.indexOf(
    'create or replace function public.phase77_conversation_features_enabled()'
  );
  assert.ok(sentinelDecl > -1, 'the sentinel function must be declared');

  const matrix = sql.indexOf('PHASE77 MATRIX FAIL');
  const selfCheck = sql.indexOf('PHASE77 SELF-CHECK FAIL');
  assert.ok(matrix > -1, 'the proof matrix must exist');
  assert.ok(selfCheck > -1, 'the in-transaction self-check must exist');
  assert.ok(matrix < selfCheck, 'the matrix runs before the self-check');
  assert.ok(
    sentinelDecl > selfCheck,
    'the sentinel must be created after the self-check, not before it'
  );
  // The sentinel carries the phase69 ACL discipline like every function here.
  assert.ok(
    sql.includes(
      'revoke all on function public.phase77_conversation_features_enabled() from public, anon;'
    )
  );
  assert.ok(
    sql.includes(
      'grant execute on function public.phase77_conversation_features_enabled() to authenticated;'
    )
  );

  const verify = await read('scripts/verify-schema.mjs');
  const group = verify.indexOf("file: 'phase77_conversation_features.sql'");
  assert.ok(group > -1, 'verify-schema.mjs must carry a phase77 group');
  const groupSlice = verify.slice(group, group + 5000);
  assert.match(
    groupSlice,
    /sentinel: \['rpc phase77_conversation_features_enabled\(\)', \(\) =>\s*checkRpc\('phase77_conversation_features_enabled', \{\}\)\]/,
    'the group sentinel must probe the same function name the migration declares'
  );
});

test('the verify-schema group asserts the seals and the visible columns', async () => {
  const verify = await read('scripts/verify-schema.mjs');
  const group = verify.indexOf("file: 'phase77_conversation_features.sql'");
  const slice = verify.slice(group, group + 5000);
  // Sealed-to-anon probes go through classifyRevokedResponse, so a MISSING
  // table reads as broken rather than secured.
  assert.match(slice, /checkColumnRevoked\('conversation_states', 'user_id'\)/);
  assert.match(slice, /checkColumnRevoked\('live_location_shares', 'id'\)/);
  // The columns a publishable key CAN see are probed positively.
  assert.match(slice, /checkColumn\('messages', 'document_url'\)/);
  assert.match(slice, /checkColumn\('conversations', 'last_message_document_url'\)/);
  assert.match(slice, /checkColumn\('blocks', 'expires_at'\)/);
  // The in-place replacement must not have cost the old signature.
  assert.match(slice, /checkRpc\('is_blocked_between', \{ a: ZERO_UUID, b: ZERO_UUID \}\)/);
});

test('is_blocked_between keeps its exact signature and stays LANGUAGE SQL (S-3)', async () => {
  const sql = await read(MIGRATION);
  const block = functionBlock(
    sql,
    'create or replace function public.is_blocked_between(a uuid, b uuid)'
  );
  assert.match(block, /returns boolean/);
  assert.match(block, /language sql/);
  assert.match(block, /\bstable\b/);
  assert.match(block, /security definer/);
  assert.match(block, /set search_path = public, pg_temp/);
  assert.ok(
    !block.includes('plpgsql'),
    'the predicate must stay LANGUAGE SQL - four RLS policies and five definer bodies call it, and plpgsql would trade the create-time catalog parse away for nothing'
  );
  // The expiry term is what phase77 adds; NULL stays permanent.
  assert.match(block, /bl\.expires_at is null or bl\.expires_at > now\(\)/);

  // Single-SELECT body: the shape that keeps the function as cheap as a
  // non-inlined call can be, and adds no new inlining disqualifier (its
  // SECURITY DEFINER flag and SET clause always disqualified it - see the
  // migration's section 2 note).
  const body = block.slice(block.indexOf('as $$') + 5, block.lastIndexOf('$$;')).trim();
  assert.ok(body.startsWith('select exists'), 'the body is one SELECT expression');
  assert.equal(
    [...body.matchAll(/;/g)].length,
    1,
    'exactly one statement terminator - one statement, no procedural drift'
  );

  // Never a drop-and-recreate: that would cascade onto the four policies.
  assert.ok(
    !/drop function[^;]*is_blocked_between/i.test(sql),
    'the signature is replaced in place, never dropped'
  );

  // A LANGUAGE SQL body is parsed against the catalog at CREATE FUNCTION
  // time, so the column it reads must exist earlier in the file.
  const column = sql.indexOf('add column if not exists expires_at');
  const decl = sql.indexOf(
    'create or replace function public.is_blocked_between(a uuid, b uuid)'
  );
  assert.ok(column > -1 && column < decl, 'blocks.expires_at must be added before the body that reads it');
});

test('the proof matrix is present, both-directional, and rolled back (S-3)', async () => {
  const sql = await read(MIGRATION);
  const save = sql.indexOf('savepoint phase77_proof_matrix;');
  const undo = sql.indexOf('rollback to savepoint phase77_proof_matrix;');
  assert.ok(save > -1, 'the matrix runs on a savepoint');
  assert.ok(undo > save, 'the fixtures are rolled back after the matrix');

  const matrix = sql.slice(save, undo);
  // Every case, in BOTH directions, because the block is symmetric in effect.
  for (const n of [1, 2, 3, 4, 5]) {
    assert.ok(matrix.includes(`(case ${n} forward`), `case ${n} forward is asserted`);
    assert.ok(matrix.includes(`(case ${n} reverse`), `case ${n} reverse is asserted`);
  }
  const forward = [...matrix.matchAll(/is_blocked_between\(v_a, v_b\)/g)].length;
  const reverse = [...matrix.matchAll(/is_blocked_between\(v_b, v_a\)/g)].length;
  assert.ok(forward >= 5, `the forward direction is exercised per case (saw ${forward})`);
  assert.ok(reverse >= 5, `the reverse direction is exercised per case (saw ${reverse})`);
  // Non-vacuous: wrong answers RAISE, which aborts the transaction, so a bad
  // amendment can never commit.
  assert.match(matrix, /raise exception 'PHASE77 MATRIX FAIL/);
  // The one that makes TIMED_BLOCK real: expiry means expiry.
  assert.match(matrix, /an expired block must behave exactly as no block/);
});

test('every new table enables RLS, revokes anon, and keeps writes off the client (S-1, S-7)', async () => {
  const sql = await read(MIGRATION);
  for (const table of ['conversation_states', 'live_location_shares']) {
    assert.ok(sql.includes(`create table if not exists public.${table}`), `${table} is created`);
    assert.ok(
      sql.includes(`alter table public.${table} enable row level security`),
      `${table} enables RLS`
    );
    assert.ok(
      sql.includes(`revoke all on table public.${table} from public, anon;`),
      `${table} revokes anon on the table grant - the standing fragility the prior audit flagged`
    );
    assert.ok(
      sql.includes(`revoke all on table public.${table} from authenticated;`),
      `${table} strips the CREATE-time authenticated grant before re-granting only SELECT`
    );
    assert.ok(
      sql.includes(`grant select on table public.${table} to authenticated;`),
      `${table} grants exactly SELECT back`
    );
  }
  // The one-thread shape both tables share with messages_one_thread.
  assert.match(sql, /constraint conversation_states_one_thread check/);
  assert.match(sql, /constraint live_location_shares_one_thread check/);
  // The partial unique keys the RPC upserts infer (the phase36 trap solved
  // server-side: PostgREST cannot name a partial index, SQL can).
  assert.match(sql, /create unique index if not exists conversation_states_user_job_key/);
  assert.match(sql, /create unique index if not exists conversation_states_user_direct_key/);
  assert.match(sql, /on conflict \(user_id, job_id\) where job_id is not null/);
  assert.match(sql, /on conflict \(user_id, direct_thread_id\) where direct_thread_id is not null/);
});

test('every new function is definer, pinned, and carries its grants (phase69 discipline)', async () => {
  const sql = await read(MIGRATION);
  const clientFacing = [
    'set_block',
    'set_conversation_state',
    'set_direct_thread_read_at',
    'start_live_location',
    'update_live_location',
    'stop_live_location',
  ];
  for (const name of clientFacing) {
    const block = functionBlock(sql, `create or replace function public.${name}(`);
    assert.match(block, /security definer/, `${name} is SECURITY DEFINER`);
    assert.match(block, /set search_path = public, pg_temp/, `${name} pins its search_path`);
    assert.ok(
      new RegExp(`revoke all on function public\\.${name}\\([^;]*\\) from public, anon;`).test(sql),
      `${name} revokes public and anon`
    );
    assert.ok(
      new RegExp(`grant execute on function public\\.${name}\\([^;]*\\) to authenticated;`).test(sql),
      `${name} grants exactly authenticated`
    );
  }
  // The internal helper is revoked from EVERY client role and granted to
  // nobody, the ensure_direct_thread precedent.
  const helper = functionBlock(sql, 'create or replace function public.conversation_parties(');
  assert.match(helper, /security definer/);
  assert.match(helper, /set search_path = public, pg_temp/);
  assert.ok(
    sql.includes(
      'revoke all on function public.conversation_parties(uuid, uuid) from public, anon, authenticated;'
    ),
    'conversation_parties is internal-only'
  );
  assert.ok(
    !sql.includes('grant execute on function public.conversation_parties'),
    'no grant may make the helper client-callable'
  );
});

test('the clear/delete watermark is one mechanism, coupled server-side (S-2)', async () => {
  const sql = await read(MIGRATION);
  const rpc = functionBlock(sql, 'create or replace function public.set_conversation_state(');
  // Delete sets the SAME watermark clear sets - the coupling lives in the
  // RPC, not in client discipline.
  assert.match(rpc, /coalesce\(p_clear, false\) or coalesce\(p_delete, false\)/);
  // The watermark is monotone so a repeated clear cannot resurrect messages.
  assert.match(rpc, /greatest\(coalesce\(cs\.cleared_before, v_mark\), v_mark\)/);
  // deleted is never un-set by the RPC: reopening is derived from a newer
  // message, nothing has to write.
  assert.match(rpc, /deleted = cs\.deleted or coalesce\(p_delete, false\)/);
});

test('message_reads gains exactly the counterparty row, and its own-rows contract survives (S-4)', async () => {
  const sql = await read(MIGRATION);
  assert.ok(sql.includes('create policy "message_reads_select_party"'));
  const policy = sql.slice(
    sql.indexOf('create policy "message_reads_select_party"'),
    sql.indexOf('do $$', sql.indexOf('create policy "message_reads_select_party"'))
  );
  // Scoped to the OTHER party's row on a job the caller is party to - not
  // "any row on the job", so a stray non-party row stays invisible.
  assert.match(policy, /message_reads\.user_id = j\.assigned_worker_id/);
  assert.match(policy, /message_reads\.user_id = j\.client_id/);
  // The three phase9 policies are not touched: the client's
  // onConflict 'user_id,job_id' upsert path must keep working unchanged.
  for (const own of [
    'message_reads_select_own',
    'message_reads_insert_own',
    'message_reads_update_own',
  ]) {
    assert.ok(
      !sql.includes(`drop policy if exists "${own}"`),
      `${own} must not be dropped - phase9's own-rows contract carries the live upsert`
    );
  }
  // Job ticks ride the same realtime shape direct ticks already ride.
  assert.ok(sql.includes('alter publication supabase_realtime add table public.message_reads;'));
  assert.ok(
    sql.includes('alter publication supabase_realtime add table public.live_location_shares;')
  );
});

test('the conversations view survives with every column, invoker security, and the document columns (S-6)', async () => {
  const sql = await read(MIGRATION);
  const drop = sql.indexOf('drop view if exists public.conversations;');
  const create = sql.indexOf('create view public.conversations');
  assert.ok(drop > -1 && create > drop, 'drop-then-create, the phase16/36 pattern');
  const view = sql.slice(create, sql.indexOf('grant select on public.conversations', create));
  assert.match(view, /with \(security_invoker = true\) as/);
  assert.match(view, /union all/);
  for (const col of [
    'job_id',
    'direct_thread_id',
    'job_title',
    'client_id',
    'assigned_worker_id',
    'last_message_id',
    'last_message_sender_id',
    'last_message_content',
    'last_message_image_url',
    'last_message_audio_url',
    'last_message_document_url',
    'last_message_document_name',
    'last_message_unsent_at',
    'last_message_at',
    'my_read_at',
  ]) {
    assert.ok(view.includes(col), `the view carries ${col}`);
  }
  // Both union branches carry the two new columns, so a document previews on
  // both thread kinds or the feature would be the half-shipped shape the run
  // forbids.
  assert.equal([...view.matchAll(/as last_message_document_url/g)].length, 2);
  assert.equal([...view.matchAll(/as last_message_document_name/g)].length, 2);
  // The migration must refuse to recreate over an unexpected live shape
  // rather than silently dropping someone else's column.
  assert.match(sql, /recreating the view would silently drop it/);
  // And the message columns themselves exist for the view to read.
  assert.match(sql, /add column if not exists document_url text/);
  assert.match(sql, /document_name text/);
  assert.match(sql, /document_size_bytes integer/);
});

test('chat-documents mirrors the LIVE chat-media posture, on BOTH thread kinds (S-6)', async () => {
  const sql = await read(MIGRATION);
  // Private from birth - the phase29 posture, not the phase8/16 public one.
  assert.match(sql, /values \('chat-documents', 'chat-documents', false\)/);
  assert.ok(sql.includes('create policy "chat_documents_read_party"'));
  const insertPolicy = sql.slice(
    sql.indexOf('create policy "chat_documents_insert_party"'),
    sql.indexOf('-- ------', sql.indexOf('create policy "chat_documents_insert_party"'))
  );
  // The uploader owns folder two, exactly as chat-photos/chat-audio.
  assert.match(insertPolicy, /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/);
  assert.match(insertPolicy, /public\.is_active_user\(\)/);
  // The block gate rides on BOTH kinds - the job branch and the direct
  // branch each carry it, which is one branch more than chat-audio has
  // (that job-only gap is reported, not copied).
  assert.equal(
    [...insertPolicy.matchAll(/is_blocked_between/g)].length,
    2,
    'both thread-kind branches enforce the block'
  );
  assert.match(insertPolicy, /from public\.jobs j/);
  assert.match(insertPolicy, /from public\.direct_threads t/);
});

test('live location expiry is server-enforced and time-capped (S-7)', async () => {
  const sql = await read(MIGRATION);
  const policy = sql.slice(
    sql.indexOf('create policy "live_location_shares_select_party"'),
    sql.indexOf('revoke all on table public.live_location_shares')
  );
  // An expired share reads as absent for everyone - no client honesty
  // involved.
  assert.match(policy, /expires_at > now\(\)/);
  // The window is capped in the schema and re-checked in the RPC.
  assert.match(sql, /constraint live_location_shares_bounded check/);
  assert.match(sql, /interval '8 hours'/);
  const heartbeat = functionBlock(sql, 'create or replace function public.update_live_location(');
  assert.match(
    heartbeat,
    /expires_at > now\(\)/,
    'the heartbeat refuses to move an ended share'
  );
  assert.match(heartbeat, /No active location share/);
});

test('phase77 never turns row-level security off, and destroys nothing', async () => {
  const sql = await read(MIGRATION);
  assert.equal(
    sql.toLowerCase().includes('disable row level security'),
    false,
    'the off switch must not appear, even in prose'
  );
  const statements = statementLines(sql).join('\n');
  assert.equal(/\bdrop table\b/i.test(statements), false, 'no table is dropped');
  assert.equal(/\bdrop column\b/i.test(statements), false, 'no column is dropped');
  assert.equal(
    /\bdelete from public\./i.test(statements),
    false,
    'no user rows are deleted - everything is additive'
  );
  // Every policy drop is an idempotency guard for a policy this file
  // recreates under the same name, never a removal.
  for (const m of statements.matchAll(/drop policy if exists "([^"]+)"/g)) {
    assert.ok(
      statements.includes(`create policy "${m[1]}"`),
      `policy ${m[1]} is dropped only to be recreated`
    );
  }
});
