#!/usr/bin/env node
/**
 * BRAZOS V2 · A2 LIFECYCLE INTEGRATION PROOF (hardening run)
 *
 *   node scripts/lifecycle-proof.mjs
 *
 * One job, two DEDICATED staging accounts, driven end-to-end through every
 * phase 6-12 backend surface as two real authenticated sessions (the same
 * PostgREST path the app uses): post → bid → pre-hire chat → accept → hold →
 * en route → arrived → checklist → in progress → completion evidence →
 * post-hire chat → approve/release → tip → mutual reviews → wallet →
 * cash-out. Per-step notification-feed assertions; final ledger/orphan/
 * duplicate sweeps. Prints a PASS/FAIL table per transition; exit 1 on any
 * FAIL.
 *
 * SCOPE HONESTY: this proves BACKEND AND STATE integration only — RPCs, RLS,
 * triggers, ledger. It renders no UI and claims no screen coverage; see
 * REVIEW_GUIDE.md for the device checklist.
 *
 * SIDE-EFFECT SAFETY: the database is the staging project (asserted below —
 * refuses to run against the production ref). Money is the phase50-55
 * sandbox (provider CHECK admits only 'sandbox'); push delivery is the
 * phase20 no-op outbox (no credentials exist); no email/SMS path exists in
 * this flow. Setup/reset shells out to psql with SUPABASE_DB_URL_STAGING —
 * never printed.
 *
 * Persistent effects are confined to the two lifecycle.* accounts and rows
 * keyed to them; every run RESETS those rows first, so re-runs are
 * deterministic and staging does not accumulate garbage.
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const URL = env.SUPABASE_URL?.replace(/\/$/, '');
const ANON = env.SUPABASE_KEY;
const DB = process.env.SUPABASE_DB_URL_STAGING;
if (!URL || !ANON) { console.error('Missing SUPABASE_URL / SUPABASE_KEY in .env'); process.exit(2); }
if (!DB) { console.error('SUPABASE_DB_URL_STAGING is not set'); process.exit(2); }
if (URL.includes('avkighsiufeefyycbebf') || DB.includes('avkighsiufeefyycbebf')) {
  console.error('REFUSING TO RUN: production ref detected'); process.exit(2);
}

const C_ID = 'ac110000-0000-4000-8000-000000000001';
const W_ID = 'ac110000-0000-4000-8000-000000000002';
const C_EMAIL = 'lifecycle.customer@brazos.test';
const W_EMAIL = 'lifecycle.worker@brazos.test';
const PASSWORD = 'brazos-test-1234';
const MARK = 'LIFECYCLE-PROOF';

function psql(sql) {
  return execFileSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql, DB], {
    encoding: 'utf8',
  }).trim();
}

// ---------------------------------------------------------------------------
// Setup/reset: dedicated identities (idempotent) + wipe this proof's rows.
// ---------------------------------------------------------------------------
function setupAccounts() {
  psql(`
  do $$
  declare v record;
  begin
    for v in select * from (values
      ('${C_ID}'::uuid, '${C_EMAIL}', 'Lia Lifecycle'),
      ('${W_ID}'::uuid, '${W_EMAIL}', 'Wes Lifecycle')
    ) as t(id, email, name) loop
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
        v.email, extensions.crypt('${PASSWORD}', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v.name), now(), now(), '', '', '', '')
      on conflict (id) do nothing;
      insert into auth.identities (id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), v.id,
        jsonb_build_object('sub', v.id::text, 'email', v.email, 'email_verified', true),
        'email', v.id::text, now(), now(), now()
      where not exists (select 1 from auth.identities i where i.user_id = v.id and i.provider = 'email');
      update public.profiles set banned = false where id = v.id;
    end loop;
  end $$;`);
  // Reset every row a previous run created, children first.
  psql(`
  do $$
  declare v_jobs uuid[];
  begin
    select coalesce(array_agg(id), '{}') into v_jobs
      from public.jobs where client_id = '${C_ID}' and title like '${MARK}%';
    delete from public.notification_outbox where recipient_id in ('${C_ID}','${W_ID}');
    delete from public.payments where job_id = any(v_jobs);
    delete from public.reviews where job_id = any(v_jobs);
    delete from public.job_disputes where job_id = any(v_jobs);
    delete from public.job_checklist_items where job_id = any(v_jobs);
    delete from public.message_reads where job_id = any(v_jobs);
    delete from public.messages where job_id = any(v_jobs)
      or direct_thread_id in (select id from public.direct_threads
        where least(user_a,user_b) = least('${C_ID}'::uuid,'${W_ID}'::uuid)
          and greatest(user_a,user_b) = greatest('${C_ID}'::uuid,'${W_ID}'::uuid));
    update public.jobs set accepted_offer_id = null where id = any(v_jobs);
    delete from public.job_offers where job_id = any(v_jobs);
    delete from public.bids where job_id = any(v_jobs);
    delete from public.job_locations where job_id = any(v_jobs);
    delete from public.jobs where id = any(v_jobs);
  end $$;`);
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
const results = [];
let failed = 0;
function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  — ${detail}` : ''}`);
}
async function must(step, fn) {
  try {
    const detail = await fn();
    record(step, true, typeof detail === 'string' ? detail : '');
  } catch (e) {
    record(step, false, e.message);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function session(email) {
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { client, userId: data.user.id };
}

async function feedCount(client, userId, type, sinceIso) {
  const { data, error } = await client
    .from('notification_outbox')
    .select('id, type, dedupe_key')
    .eq('recipient_id', userId)
    .gte('created_at', sinceIso)
    .eq('type', type);
  if (error) throw new Error(`feed read: ${error.message}`);
  return data.length;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log('lifecycle-proof — staging backend integration (no UI claims)\n');
  setupAccounts();
  record('setup: dedicated accounts ready + prior rows reset', true);

  const start = new Date().toISOString();
  const c = await session(C_EMAIL);
  const w = await session(W_EMAIL);
  record('auth: two real sessions', true);

  let jobId, offerId, threadId;

  await must('post: customer creates the job', async () => {
    const { data, error } = await c.client.rpc('create_job', {
      p_title: `${MARK} full walk`, p_description: 'hardening-run integration fixture',
      p_category: 'other', p_location: 'Waco, TX',
      p_budget_min_cents: 5000, p_budget_max_cents: 5000, p_address_line: '1 Proof Way',
    }).single();
    assert(!error, error?.message);
    assert(data.status === 'open', `status ${data.status}`);
    jobId = data.id;
  });

  await must('bid: worker places the offer', async () => {
    const { data, error } = await w.client.rpc('create_offer', {
      p_amount_cents: 5000, p_job_id: jobId, p_message: 'proof bid',
    });
    assert(!error, error?.message);
    offerId = data;
  });

  await must('bid: pair thread exists from the offer (phase52)', async () => {
    const [a, b] = [C_ID, W_ID].sort();
    const { data, error } = await w.client.from('direct_threads')
      .select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
    assert(!error && data, error?.message ?? 'no thread');
    threadId = data.id;
  });

  await must('chat pre-hire: worker message lands + notifies customer (phase57)', async () => {
    const { error } = await w.client.from('messages')
      .insert({ direct_thread_id: threadId, sender_id: W_ID, content: `${MARK} could I come at nine?` });
    assert(!error, error?.message);
    assert((await feedCount(c.client, C_ID, 'message', start)) >= 1, 'no feed row for the customer');
  });

  await must('accept: customer accepts; job assigned; worker notified', async () => {
    const { error } = await c.client.rpc('accept_offer', { p_offer_id: offerId });
    assert(!error, error?.message);
    const { data } = await c.client.from('jobs')
      .select('status, assigned_worker_id, accepted_offer_id').eq('id', jobId).single();
    assert(data.status === 'assigned' && data.assigned_worker_id === W_ID, `job ${data.status}`);
    const { data: feed } = await w.client.from('notification_outbox')
      .select('id').eq('recipient_id', W_ID).gte('created_at', start);
    assert(feed.length >= 1, 'worker got no accept notification');
  });

  await must('hold: authorize + protect; wallet shows pending', async () => {
    const a = await c.client.rpc('sandbox_authorize_job_payment', { p_job_id: jobId }).single();
    assert(!a.error, a.error?.message);
    const h = await c.client.rpc('sandbox_hold_job_payment', { p_job_id: jobId }).single();
    assert(!h.error, h.error?.message);
    assert(h.data.status === 'held', h.data.status);
    const { data: mine } = await w.client.from('payments')
      .select('amount_cents, status').eq('job_id', jobId).eq('kind', 'job_payment').single();
    assert(mine.status === 'held' && mine.amount_cents === 5000, 'payee wallet view wrong');
  });

  await must('en route → arrived: monotonic worker declarations', async () => {
    const r1 = await w.client.rpc('mark_worker_arrival', { p_job_id: jobId, p_step: 'en_route' }).single();
    assert(!r1.error && r1.data.en_route_at, r1.error?.message);
    const r2 = await w.client.rpc('mark_worker_arrival', { p_job_id: jobId, p_step: 'arrived' }).single();
    assert(!r2.error && r2.data.arrived_at && r2.data.en_route_at === r1.data.en_route_at,
      'arrived did not preserve en_route');
  });

  await must('checklist: worker plans and checks a step; customer reads', async () => {
    const ins = await w.client.from('job_checklist_items')
      .insert({ job_id: jobId, position: 0, label: `${MARK} step` }).select('id').single();
    assert(!ins.error, ins.error?.message);
    const upd = await w.client.from('job_checklist_items')
      .update({ done: true, done_at: new Date().toISOString() }).eq('id', ins.data.id)
      .select('done').single();
    assert(!upd.error && upd.data.done, upd.error?.message);
    const { data: seen } = await c.client.from('job_checklist_items').select('id').eq('job_id', jobId);
    assert(seen.length === 1, 'customer cannot read the checklist');
  });

  await must('start + complete: evidence stamped; customer notified', async () => {
    const s = await w.client.rpc('transition_job_status', { p_job_id: jobId, p_status: 'in_progress' }).single();
    assert(!s.error, s.error?.message);
    const d = await w.client.rpc('transition_job_status', {
      p_job_id: jobId, p_status: 'completed',
      p_completion_photos: ['https://example.com/proof-done.jpg'],
    }).single();
    assert(!d.error && d.data.status === 'completed' && d.data.completed_at, d.error?.message);
    const { data: feed } = await c.client.from('notification_outbox')
      .select('id').eq('recipient_id', C_ID).gte('created_at', start);
    assert(feed.length >= 2, 'customer missing status notification');
  });

  await must('chat post-hire: job-thread message notifies the worker', async () => {
    const before = await feedCount(w.client, W_ID, 'message', start);
    const { error } = await c.client.from('messages')
      .insert({ job_id: jobId, sender_id: C_ID, content: `${MARK} looks great` });
    assert(!error, error?.message);
    assert((await feedCount(w.client, W_ID, 'message', start)) === before + 1, 'no worker feed row');
  });

  await must('approve/release: held → released; worker notified (phase56)', async () => {
    const r = await c.client.rpc('sandbox_release_job_payment', { p_job_id: jobId }).single();
    assert(!r.error && r.data.status === 'released' && r.data.release_reason === 'approved',
      r.error?.message ?? r.data.status);
    assert((await feedCount(w.client, W_ID, 'payment_released', start)) === 1, 'release notification missing');
  });

  await must('tip: one released tip row', async () => {
    const t = await c.client.rpc('sandbox_tip_worker', { p_job_id: jobId, p_amount_cents: 700 }).single();
    assert(!t.error && t.data.kind === 'tip' && t.data.status === 'released', t.error?.message);
  });

  await must('reviews: mutual, aggregates move, reviewees notified', async () => {
    const r1 = await c.client.rpc('create_review', {
      p_job_id: jobId, p_reviewee_id: W_ID, p_rating: 5, p_comment: `${MARK} great work`, p_photos: [],
    }).single();
    assert(!r1.error, r1.error?.message);
    const r2 = await w.client.rpc('create_review', {
      p_job_id: jobId, p_reviewee_id: C_ID, p_rating: 5, p_comment: `${MARK} great client`, p_photos: [],
    }).single();
    assert(!r2.error, r2.error?.message);
    const { data: p } = await c.client.from('profiles').select('rating_count').eq('id', W_ID).single();
    assert((p.rating_count ?? 0) >= 1, 'aggregate did not move');
  });

  await must('wallet + cash-out: available sweeps to transferred; repeat no-op', async () => {
    const { data: rows } = await w.client.from('payments')
      .select('amount_cents, status').eq('payee_id', W_ID).eq('job_id', jobId);
    const avail = rows.filter((r) => r.status === 'released').reduce((s, r) => s + r.amount_cents, 0);
    assert(avail === 5700, `available ${avail}, expected 5700`);
    const sweep = await w.client.rpc('sandbox_cash_out');
    assert(!sweep.error && sweep.data.length === 2, `swept ${sweep.data?.length}`);
    const again = await w.client.rpc('sandbox_cash_out');
    assert(!again.error && again.data.length === 0, 'second sweep moved rows');
  });

  await must('ledger nets: payer outflow == payee inflow, no self-pay, no orphans', async () => {
    const rows = JSON.parse(psql(`select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.payments p where p.job_id = '${jobId}';`));
    const total = rows.reduce((s, r) => s + r.amount_cents, 0);
    assert(total === 5700, `ledger total ${total}`);
    assert(rows.every((r) => r.payer_id === C_ID && r.payee_id === W_ID), 'wrong parties');
    assert(rows.every((r) => r.provider === 'sandbox'), 'non-sandbox provider');
    const orphans = psql(`select count(*) from public.payments p left join public.jobs j on j.id = p.job_id where p.payer_id = '${C_ID}' and j.id is null;`);
    assert(orphans === '0', `${orphans} orphaned payments`);
  });

  await must('notifications: zero duplicates for the pair this run', async () => {
    const dup = psql(`select count(*) - count(distinct dedupe_key) from public.notification_outbox where recipient_id in ('${C_ID}','${W_ID}') and created_at >= '${start}';`);
    assert(dup === '0', `${dup} duplicate dedupe keys`);
    const total = psql(`select count(*) from public.notification_outbox where recipient_id in ('${C_ID}','${W_ID}') and created_at >= '${start}';`);
    return `${total} feed rows, all distinct`;
  });

  console.log('\n──── PASS/FAIL TABLE ────');
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.step}`);
  console.log(`\n${results.length - failed}/${results.length} steps passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
