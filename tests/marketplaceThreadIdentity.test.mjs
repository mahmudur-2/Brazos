import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// phase61 — marketplace-bid chains get a thread identity (AUD-P1-01, server)
// ---------------------------------------------------------------------------
//
// thread_job_id / direct_thread_id are not stored anywhere: both are derived
// at read time from the chain's ROOT MESSAGE. create_offer() posted that root
// only for direct offers, so every marketplace chain read back NULL and the
// inbox keyed it `direct:null`. phase61 posts the root for both kinds.

test('phase61 is one idempotent transaction that grants what it creates', async () => {
  const sql = await read('supabase/archive/phases/phase61_marketplace_thread_identity.sql');

  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
  // Preconditions fail loudly rather than half-applying onto a stale schema.
  assert.match(sql, /raise exception 'phase43_job_offers_foundation\.sql has not been applied/);
  assert.match(sql, /raise exception 'phase36_direct_offer_threads\.sql has not been applied/);
  // phase32 revoked default EXECUTE — anything new must be granted explicitly.
  assert.match(
    sql,
    /grant execute on function public\.marketplace_thread_identity_enabled\(\) to authenticated;/
  );
  assert.match(sql, /notify pgrst, 'reload schema';/);
});

test('phase61 replaces create_offer in place — no signature change', async () => {
  const sql = await read('supabase/archive/phases/phase61_marketplace_thread_identity.sql');

  assert.match(sql, /create or replace function public\.create_offer\(/);
  // A drop would change the RPC contract PostgREST and verify-schema pin.
  assert.doesNotMatch(sql, /drop function[^\n]*create_offer/);
  assert.doesNotMatch(sql, /drop function[^\n]*my_pending_offers/);
  // my_pending_offers() is deliberately untouched: it stops returning NULLs on
  // its own once the root messages exist.
  assert.doesNotMatch(sql, /create or replace function public\.my_pending_offers/);
});

test('phase61 binds a marketplace chain to the PAIR thread, never a job thread', async () => {
  const sql = await read('supabase/archive/phases/phase61_marketplace_thread_identity.sql');

  // The marketplace branch resolves the pair thread…
  assert.match(sql, /v_direct := public\.ensure_direct_thread\(v_customer, v_worker\);/);
  // …and the root-message insert is no longer direct-only.
  assert.doesNotMatch(sql, /if v_type = 'direct_offer' then\s*\n\s*insert into public\.messages/);

  // A job thread would be readable only by the job's client and ASSIGNED
  // worker (phase36), so a bidder could not see their own chain's root. The
  // backfill must therefore write a NULL job_id.
  const backfill = sql.slice(sql.indexOf('-- 4. Backfill'), sql.indexOf('-- 5. Regrants'));
  assert.match(backfill, /null::uuid,\s*\n\s*public\.ensure_direct_thread\(root\.customer_id, root\.worker_id\)/);
});

test('the phase61 backfill is one idempotent statement scoped to live chains', async () => {
  const sql = await read('supabase/archive/phases/phase61_marketplace_thread_identity.sql');
  const backfill = sql.slice(sql.indexOf('-- 4. Backfill'), sql.indexOf('-- 5. Regrants'));

  // Exactly one INSERT — there is no unique index on
  // (job_offer_id, request_event), so the NOT EXISTS predicate is the whole
  // idempotency guarantee and it cannot be split across statements.
  assert.equal((backfill.match(/insert into public\.messages/g) ?? []).length, 1);
  assert.match(backfill, /and not exists \(\s*\n\s*select 1\s*\n\s*from public\.messages m/);

  // Roots only, marketplace only, and only chains that still have a live row —
  // settled chains are terminal, so a root there would resurrect a dead
  // negotiation as a fresh unread inbox row.
  assert.match(backfill, /root\.offer_type = 'marketplace_bid'/);
  assert.match(backfill, /root\.parent_offer_id is null/);
  assert.match(backfill, /live\.status = 'pending'/);
  assert.match(backfill, /live\.expires_at is null or live\.expires_at > now\(\)/);
  // The offer's own timestamp, so a backfilled thread does not jump the inbox.
  assert.match(backfill, /root\.created_at/);
});

test('phase61 suppresses the double-notify it would otherwise introduce', async () => {
  const sql = await read('supabase/archive/phases/phase61_marketplace_thread_identity.sql');

  // phase20 bid_received already covers a marketplace root and phase59
  // offer_countered already covers its counters, so a generic "New message"
  // on the same action would double-buzz.
  assert.match(sql, /create or replace function public\.notify_on_message\(\)/);
  const guard = sql.slice(
    sql.indexOf('if new.job_offer_id is not null'),
    sql.indexOf('if new.job_id is not null then')
  );
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

test('phase61 leaves the conversations view alone', async () => {
  const sql = await read('supabase/archive/phases/phase61_marketplace_thread_identity.sql');

  // The view is defined last by phase36 and already carries
  // security_invoker = true. Redefining it here — in either direction — would
  // silently change who can read what.
  assert.doesNotMatch(sql, /create view public\.conversations/);
  assert.doesNotMatch(sql, /drop view[^\n]*conversations/);
  assert.doesNotMatch(sql, /security_invoker/);
});
