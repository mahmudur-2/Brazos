import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migrations = () => readdirSync(new URL('../supabase/migrations', import.meta.url)).filter((f) => f.endsWith('.sql'));

/** create_offer()'s live definition: the baseline's, the only migration that defines it. */
const createOfferSql = async () => {
  const baseline = await read('supabase/migrations/20260901000000_baseline.sql');
  const start = baseline.indexOf('CREATE OR REPLACE FUNCTION "public"."create_offer"(');
  const end = baseline.indexOf('ALTER FUNCTION "public"."create_offer"(', start);
  assert.ok(start > 0 && end > start, 'the baseline must define create_offer()');
  return baseline.slice(start, end);
};

// ---------------------------------------------------------------------------
// phase61 — marketplace-bid chains get a thread identity (AUD-P1-01, server)
// ---------------------------------------------------------------------------
//
// thread_job_id / direct_thread_id are not stored anywhere: both are derived
// at read time from the chain's ROOT MESSAGE. create_offer() posted that root
// only for direct offers, so every marketplace chain read back NULL and the
// inbox keyed it `direct:null`. phase61 posts the root for both kinds.

test('phase61 replaces create_offer in place — no signature change', async () => {
  // A drop would change the RPC contract PostgREST and the app call.
  for (const file of migrations()) {
    const sql = await read(`supabase/migrations/${file}`);
    assert.doesNotMatch(sql, /drop function[^\n]*create_offer/i, file);
    assert.doesNotMatch(sql, /drop function[^\n]*my_pending_offers/i, file);
  }
  assert.match(await createOfferSql(), /^CREATE OR REPLACE FUNCTION "public"\."create_offer"\(/);
});

test('phase61 binds a marketplace chain to the PAIR thread, never a job thread', async () => {
  const sql = await createOfferSql();

  // The marketplace branch resolves the pair thread…
  assert.match(sql, /v_direct := public\.ensure_direct_thread\(v_customer, v_worker\);/);
  // …and the root-message insert is no longer direct-only.
  assert.match(sql, /insert into public\.messages \(/);
  assert.doesNotMatch(sql, /if v_type = 'direct_offer' then\s*\n\s*insert into public\.messages/);
});

test('phase61 suppresses the double-notify it would otherwise introduce', async () => {
  // notify_on_message()'s newest definition is lean_v1's.
  const lean = await read('supabase/migrations/20261108000000_lean_v1.sql');
  const sql = lean.slice(lean.indexOf('create or replace function public.notify_on_message()'));

  // phase20 bid_received already covers a marketplace root and phase59
  // offer_countered already covers its counters, so a generic "New message"
  // on the same action would double-buzz.
  assert.match(sql, /^create or replace function public\.notify_on_message\(\)/);
  const end = sql.indexOf('if new.job_id is not null then');
  const guard = sql.slice(sql.lastIndexOf('if new.job_offer_id is not null', end), end);
  assert.match(guard, /o\.offer_type = 'marketplace_bid'/);
  assert.match(guard, /return new;/);
  // Direct-offer chains keep phase57's behaviour exactly — the guard must be
  // scoped by offer_type, not applied to every offer message.
  assert.doesNotMatch(guard, /direct_offer/);

  // The trigger function stays sealed from client roles.
  assert.match(
    sql,
    /revoke all on function public\.notify_on_message\(\) from public, anon, authenticated;/
  );
});
