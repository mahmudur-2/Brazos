import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** SQL comments, so a header that quotes the OLD rule cannot satisfy — or
 *  break — an assertion about the executable body. */
const stripSqlComments = (sql) => sql.replace(/^\s*--[^\n]*$/gm, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/offers.ts executed for its pure helpers — same stubbing as
// tests/counterResponse.test.mjs.
const offersModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/offers.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;')
    .replace(
      /import \{ PUBLIC_PROFILE_COLUMNS[^}]*\} from '\.\/profiles';/,
      "const PUBLIC_PROFILE_COLUMNS = 'id';"
    )
    // The ceiling only gates the RPC writers, which nothing here calls; its
    // real behavior is executed in tests/moneyCeiling.test.mjs.
    .replace(
      /import \{ moneyCeilingError \} from '\.\/validation';/,
      'const moneyCeilingError = () => null;'
    )
    // Same for the location-shape guard — executed in
    // tests/locationPrivacy.test.mjs.
    .replace(
      /import \{ coordinateLocationError \} from '\.\/locationPrivacy';/,
      'const coordinateLocationError = () => null;'
    )
    // R7C's funnel emitter, on the RPC writers only. Stubbed for the same
    // reason as the rest: the analytics module reaches config/env, which bare
    // Node ESM cannot resolve, and nothing exercised here emits anything.
    .replace(
      /import \{ track \} from '\.\/observability\/analytics';/,
      'const track = () => {};'
    );
  return import(toDataUrl(stubbed));
})();

// ---------------------------------------------------------------------------
// phase63 — 10 counters per side, per negotiation chain
// ---------------------------------------------------------------------------
//
// A chain is one customer and one worker on one job. The two sides count
// independently, nothing bleeds across chains, and the bid or direct offer
// that OPENS a chain is not counted.

test('phase63 caps at 10, per side, per chain', async () => {
  const sql = await read('supabase/archive/phases/phase63_counteroffer_cap_ten_per_side.sql');

  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
  assert.match(sql, /create or replace function public\.counter_offer\(/);
  assert.match(sql, /v_max_per_side constant integer := 10;/);
  assert.match(sql, /if v_used >= v_max_per_side then/);
  // The old literal must not survive in the EXECUTABLE body (the header quotes
  // it deliberately, to say what changed).
  const body = stripSqlComments(sql);
  assert.doesNotMatch(body, /v_used >= 3/);
  assert.doesNotMatch(body, /all 3 counter-offers/);

  // ONE chain (root_offer_id), ONE side (author_id), counters only
  // (parent_offer_id is not null — the chain-opening root is free).
  const capBlock = body.slice(
    body.indexOf('select count(*) into v_used'),
    body.indexOf('update public.job_offers')
  );
  assert.match(capBlock, /o\.root_offer_id = v_parent\.root_offer_id/);
  assert.match(capBlock, /o\.author_id = v_actor/);
  assert.match(capBlock, /o\.parent_offer_id is not null/);
  // No job_id / customer_id / worker_id fallback: deriving the chain from the
  // triple would sum counters across a pair's SEQUENTIAL chains on one job.
  assert.doesNotMatch(capBlock, /o\.job_id/);
});

test('phase63 counts under the job row lock, not as a read-then-write', async () => {
  const sql = await read('supabase/archive/phases/phase63_counteroffer_cap_ten_per_side.sql');

  const lockAt = sql.indexOf('perform 1 from public.jobs where id = v_job_id for update;');
  const parentLockAt = sql.indexOf('for update;\n  if not found');
  const countAt = sql.indexOf('select count(*) into v_used');
  const insertAt = sql.indexOf('insert into public.job_offers (');

  assert.ok(lockAt > 0, 'the job row lock must be taken');
  assert.ok(lockAt < countAt, 'the job lock must precede the cap count');
  assert.ok(parentLockAt > 0 && parentLockAt < countAt, 'the parent must be locked before counting');
  assert.ok(countAt < insertAt, 'the count must precede the insert');
  // The ordering is load-bearing, so it is called out in the body where an
  // editor will see it.
  assert.match(sql, /Do not move the count above it\./);
});

test('phase63 restates the grant phase32 revoked', async () => {
  const sql = await read('supabase/archive/phases/phase63_counteroffer_cap_ten_per_side.sql');
  assert.match(sql, /revoke all on function public\.counter_offer\(uuid, integer\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.counter_offer\(uuid, integer\) to authenticated;/);
  // No signature change — a drop would break the PostgREST contract
  // verify-schema.mjs pins.
  assert.doesNotMatch(sql, /drop function[^\n]*counter_offer/);
});

// ---------------------------------------------------------------------------
// Client: the limit is surfaced, not discovered on submit
// ---------------------------------------------------------------------------

test('the client mirrors the cap and disables the action when it is spent', async () => {
  const { MAX_COUNTERS_PER_SIDE, countersRemaining } = await offersModule;
  assert.equal(MAX_COUNTERS_PER_SIDE, 10);

  // Ten of the caller's OWN counters, plus a root and a counterparty counter
  // that must not be charged to them.
  const chain = [{ author_id: 'other', parent_offer_id: null }];
  for (let i = 0; i < 10; i += 1) {
    chain.push({ author_id: 'me', parent_offer_id: `p${i}` });
    chain.push({ author_id: 'other', parent_offer_id: `q${i}` });
  }
  assert.equal(countersRemaining(chain, 'me'), 0);
  assert.equal(countersRemaining(chain, 'other'), 0);
  // Never negative, even if the server ever accepted more.
  chain.push({ author_id: 'me', parent_offer_id: 'extra' });
  assert.equal(countersRemaining(chain, 'me'), 0);

  // The two surfaces that gate the Counter control on that number.
  const card = stripComments(await read('components/OfferCard.tsx'));
  assert.match(card, /countersRemaining\(chain, currentUserId\) > 0/);
  assert.match(card, /canCounter=\{canCounter\}/);

  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));
  assert.match(detail, /countersLeft === 0 && !showCounterForm/);

  // Both hand that answer to the ONE actionable card, which swaps the counter
  // control for the spent-cap sentence — a single definition of both the gate
  // and the wording, so the two surfaces cannot disagree about either.
  const actions = stripComments(await read('components/OfferResponseActions.tsx'));
  assert.match(actions, /canCounter \? \(/);
  assert.match(actions, /<Text style=\{styles\.capNote\}>\{COUNTERS_SPENT_NOTE\}<\/Text>/);
  assert.match(
    stripComments(await read('lib/offerCopy.ts')),
    /export const COUNTERS_SPENT_NOTE =\s*\n?\s*'No counter-offers left — accept or decline to continue\.';/
  );
});

test('a stale client count gets the cap message, not a generic failure', async () => {
  const { isCounterLimitError, COUNTER_LIMIT_MESSAGE } = await offersModule;

  // The server raises a plain sentence; every RAISE in that function reports
  // P0001, so the match is on shape, not code.
  assert.equal(
    isCounterLimitError({
      message:
        'You have used all 10 counter-offers on this negotiation. Accept or decline to continue.',
    }),
    true
  );
  assert.equal(isCounterLimitError({ message: 'It is not your turn to respond to this offer' }), false);
  assert.equal(isCounterLimitError({ message: 'This offer is no longer open' }), false);
  assert.equal(isCounterLimitError(null), false);
  assert.equal(isCounterLimitError({ message: null }), false);
  assert.match(COUNTER_LIMIT_MESSAGE, /all 10 counter-offers/);

  // Both counter submit paths map it.
  const composer = stripComments(await read('components/OfferComposer.tsx'));
  assert.match(composer, /if \(isCounterLimitError\(error\)\) \{/);
  assert.match(composer, /alertAsync\('No counter-offers left', COUNTER_LIMIT_MESSAGE\)/);

  const chat = stripComments(await read('screens/ChatScreen.tsx'));
  assert.match(chat, /action === 'counter' && isCounterLimitError\(error\)/);
  assert.match(chat, /alertAsync\('No counter-offers left', COUNTER_LIMIT_MESSAGE\)/);
});
