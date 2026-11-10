import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * P2 (lean) - WHAT CANCELLING COSTS IS SAID BEFORE THE MONEY MOVES. One
 * sentence from one constant (lib/moneyCopy.ts), on the accept confirm and on
 * Checkout, carrying the numbers Terms section 4 states and cancel_job() applies.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const { CANCELLATION_DISCLOSURE, PAYMENT_HELD_NOT_INSURANCE } = await import(
  pathToFileURL(join(root, 'lib/moneyCopy.ts')).href
);

test('the disclosure states the same windows as Terms section 4 and the SQL (15 minutes, 24 hours)', () => {
  assert.equal(
    CANCELLATION_DISCLOSURE,
    'Free to cancel within 15 minutes of hiring or more than 24 hours before the visit; after that a cancellation fee may go to the worker.'
  );
  const terms = read('lib/legal/termsOfService.ts').replace(/\s+/g, ' ');
  assert.match(terms, /Cancelling is free more than 24 hours before the arrival window starts, within 15 minutes of hiring/);
  const sql = read('supabase/migrations/20261108000000_lean_v1.sql');
  assert.match(sql, /interval '15 minutes'/);
  assert.match(sql, /v_anchor - interval '24 hours'/);
});

test('the accept confirm and Checkout both show it, from the constant and not a copy of the words', () => {
  assert.match(read('lib/offerCopy.ts'), /\$\{CANCELLATION_DISCLOSURE\}/);
  const checkout = read('screens/CheckoutScreen.tsx');
  assert.match(checkout, /\{CANCELLATION_DISCLOSURE\}/);
  assert.match(checkout, /\{PAYMENT_HELD_NOT_INSURANCE\}/);
  for (const file of ['screens/CheckoutScreen.tsx', 'screens/ClientJobDetailScreen.tsx', 'screens/BidDetailScreen.tsx', 'lib/offerCopy.ts']) {
    assert.doesNotMatch(read(file), /Free to cancel within/, `${file} reads the constant`);
  }
});

test('checkout says the payment is held, and that it is not insurance', () => {
  assert.equal(PAYMENT_HELD_NOT_INSURANCE, 'Your payment is held until you approve the work. It is not insurance.');
});
