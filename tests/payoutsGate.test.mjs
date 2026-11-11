import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

/**
 * B11 (docs/critical/job-lifecycle.md): a worker who cannot be paid cannot send, counter or accept
 * an offer (20261112040000_payouts_gate.sql, proven in supabase/tests/390_payouts_gate.sql). Here:
 * the gate card's decision table, EXECUTED from lib/offerCopy.ts; the hook's one refresh; where the
 * screens show the card; and that each server sentence reaches a user as written.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// offerCopy's runtime imports are the import-free lib/time.ts and lib/moneyCopy.ts, pointed at their files.
const { payoutsGateCard, payoutsGateRefreshes } = await import(
  toDataUrl(
    stripTypeScriptTypes(await read('lib/offerCopy.ts'), { mode: 'strip' })
      .replace("from './time'", `from '${new URL('../lib/time.ts', import.meta.url).href}'`)
      .replace("from './moneyCopy'", `from '${new URL('../lib/moneyCopy.ts', import.meta.url).href}'`)
  )
);

globalThis.__DEV__ = false;
const { userMessage } = await import(new URL('../lib/errorMessage.ts', import.meta.url).href);

const SET_UP = {
  title: 'Finish payout set-up first',
  body: 'You need a payout account before you can send offers.',
  cta: 'Set up payouts',
};
const UNDER_REVIEW = {
  title: null,
  body: 'Your payout account is under review. You can send offers once it is on.',
  cta: null,
};

test('the decision table: each payout state to the card or today\'s buttons (null)', () => {
  assert.deepEqual(payoutsGateCard('none'), SET_UP);
  assert.deepEqual(payoutsGateCard('action_needed'), SET_UP);
  assert.deepEqual(payoutsGateCard('under_review'), UNDER_REVIEW);
  assert.equal(payoutsGateCard('enabled'), null, 'enabled: the buttons');
  assert.equal(payoutsGateCard(null), null, 'unknown (not read, a failed read or refresh): the buttons');
});

test('the one refresh runs only for a state the provider can have moved', () => {
  assert.equal(payoutsGateRefreshes('action_needed'), true);
  assert.equal(payoutsGateRefreshes('under_review'), true);
  assert.equal(payoutsGateRefreshes('none'), false, 'no account to ask about');
  assert.equal(payoutsGateRefreshes('enabled'), false);
  assert.equal(payoutsGateRefreshes(null), false);
});

test('the hook: card path only, PayoutsScreen\'s reads, at most one connect-status call per mount, a failed refresh is null', async () => {
  const hook = stripComments(await read('components/PayoutsGateCard.tsx'));
  assert.match(hook, /if \(!active \|\| paymentsMode !== 'stripe'\) return;/);
  assert.match(hook, /const refreshedRef = useRef\(false\);/);
  assert.match(hook, /!refreshedRef\.current && payoutsGateRefreshes\(next\)\) \{\s*refreshedRef\.current = true;/);
  assert.equal(hook.match(/refreshPayoutsStatus\(\)/g)?.length, 1, 'one call site, no loop');
  assert.match(hook, /next = refreshed\.error \? null : \(await fetchMyPayoutsStatus\(\)\)\.data;/);
  assert.doesNotMatch(hook, /\b(while|for)\s*\(/);
  assert.doesNotMatch(hook, /#[0-9a-fA-F]{3,8}\b/, 'colours from the theme only');
});

test('the screens show the card where the worker sends or answers', async () => {
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));
  assert.match(detail, /const payouts = useMyPayoutsGate\(mode === 'worker' && !isOwnJob\);/);
  assert.match(detail, /\{showBidBar && payoutsGateShown \? \(/, 'the card in place of the bid bar buttons');
  assert.match(detail, /\{showBidBar && !payoutsGateShown \? \(/, 'the buttons only without it');
  const chat = stripComments(await read('screens/ChatScreen.tsx'));
  assert.match(chat, /request\.worker_id === user\?\.id &&\s*latestMessageIdByRequest\[offerId\] === item\.id &&\s*isOfferActionableBy\(request, user\?\.id\) \? \(\s*<PayoutsGateCard status=\{payouts\} framed \/>/);
});

test('each server sentence is in the migration word for word and reaches the user as written', async () => {
  const migration = await read('supabase/migrations/20261112040000_payouts_gate.sql');
  for (const sentence of [
    'Finish payout set-up before you send an offer. Open Profile, then Earnings & payouts.',
    'Finish payout set-up before you accept. Open Profile, then Earnings & payouts.',
    'This worker cannot be paid yet, so they cannot be hired. Choose another worker, or try again later.',
  ]) {
    assert.ok(migration.includes(`raise exception '${sentence}'`), `in the migration: ${sentence}`);
    assert.equal(userMessage({ message: sentence, code: 'P0001' }), sentence);
  }
});
