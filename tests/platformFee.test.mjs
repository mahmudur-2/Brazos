import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const dir = (path) => readdirSync(new URL(`../${path}`, import.meta.url));

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// One fee, and the ledger decides what it is
// ---------------------------------------------------------------------------
//
// Job details advertised "EST. PAYOUT AFTER FEE $36" on a $40 job from a local
// ESTIMATED_PLATFORM_FEE_RATE = 0.1, while checkout and Earnings both reported
// no fee at all — because the payments RPCs write platform_fee_cents = 0. The
// marketplace was quoting a worker LESS than it pays them.

test('the platform fee has exactly one definition, and it matches the ledger', async () => {
  const payments = await read('lib/payments.ts');
  assert.match(payments, /export const PLATFORM_FEE_RATE: number = 0;/);
  assert.match(payments, /export function platformFeeCents\(/);
  assert.match(payments, /export function workerPayoutCents\(/);
});

test('every payments insert writes the same fee the client derives', async () => {
  // The client constant is only honest while the RPCs agree with it. Each
  // insert into public.payments names platform_fee_cents in its column list
  // and passes a literal 0 in the values.
  for (const file of dir('supabase').filter((f) => f.endsWith('.sql'))) {
    const sql = await read(`supabase/${file}`);
    for (const match of sql.matchAll(
      /insert into public\.payments \(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\);/g
    )) {
      const [, columns, values] = match;
      if (!/platform_fee_cents/.test(columns)) continue;
      const index = columns
        .split(',')
        .map((c) => c.trim())
        .indexOf('platform_fee_cents');
      const written = values.split(',')[index]?.trim();
      assert.equal(
        written,
        '0',
        `supabase/${file} writes platform_fee_cents = ${written}; ` +
          'lib/payments.ts PLATFORM_FEE_RATE must be changed with it'
      );
    }
  }
});

test('no screen carries its own fee rate or fee arithmetic', async () => {
  const offenders = [];
  for (const file of dir('screens').filter((f) => f.endsWith('.tsx'))) {
    const source = stripComments(await read(`screens/${file}`));
    // A second local constant is what caused the contradiction.
    if (/(?:FEE_RATE|PLATFORM_FEE)\s*=\s*[\d.]/.test(source)) {
      offenders.push(`screens/${file} — declares its own fee rate`);
    }
    // ...as is spelling the deduction out by hand.
    if (/\*\s*\(\s*1\s*-\s*[\w.]*FEE/i.test(source)) {
      offenders.push(`screens/${file} — hand-rolls the after-fee arithmetic`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'fee figures must come from PLATFORM_FEE_RATE / platformFeeCents / ' +
      'workerPayoutCents in lib/payments.ts'
  );
});

test('the three fee surfaces all read the shared constant', async () => {
  const [jobDetail, checkout, earnings] = await Promise.all([
    read('screens/JobDetailScreen.tsx'),
    read('screens/CheckoutScreen.tsx'),
    read('screens/EarningsScreen.tsx'),
  ]);

  assert.match(jobDetail, /workerPayoutCents/);
  assert.match(jobDetail, /PLATFORM_FEE_RATE/);
  // Comments stripped: the docblock explains the constant this screen no
  // longer owns, and that history is worth keeping.
  assert.doesNotMatch(stripComments(jobDetail), /ESTIMATED_PLATFORM_FEE_RATE/);
  // R6a (D10): checkout reads its figures off the ledger row / the price
  // quote and computes no fee of its own.
  assert.doesNotMatch(stripComments(checkout), /platformFeeCents|PLATFORM_FEE_RATE|workerPayoutCents/);
  assert.match(checkout, /charge_amount_cents/);
  assert.match(checkout, /payment\.platform_fee_cents/);
  assert.match(earnings, /PLATFORM_FEE_RATE/);
});

test('a worker is never quoted less than the ledger pays them', async () => {
  // Executed, not pattern-matched: the payout helper is pure and the rule is
  // an inequality, so assert the inequality.
  const source = await read('lib/payments.ts');
  const rate = Number(source.match(/PLATFORM_FEE_RATE: number = ([\d.]+);/)[1]);
  const platformFee = (cents) => Math.round(cents * rate);
  const payout = (cents) => cents - platformFee(cents);

  for (const cents of [1, 99, 4000, 4499, 12345, 1_000_000]) {
    assert.ok(
      payout(cents) >= cents - platformFee(cents),
      `quoted payout for ${cents} understates what the ledger releases`
    );
    assert.ok(payout(cents) <= cents, 'a payout may never exceed the amount charged');
  }
  // The specific device-reported case: a $40 job must not quote $36.
  assert.equal(payout(4000), 4000);
});
