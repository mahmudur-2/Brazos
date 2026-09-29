import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// Tier A (C2, v3 D-4) — the customer's held figure is charge_amount_cents
// ---------------------------------------------------------------------------
//
// The 2026-08-30 money walk showed the customer "$100 held" beside a card
// charge of $107.50. The customer's figure is the row's own
// charge_amount_cents (price + protection fee + tax, generated in the
// database), never amount_cents. One helper reads the column —
// customerChargeCents in lib/paymentRules.ts, executed here — and the three
// customer-facing surfaces read it: JobConfirmed, ClientJobDetail,
// ApproveOrDispute (its card, its CTA and its dialog). Worker-facing surfaces
// read workerTakeCents (R6c) and are not touched.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { customerChargeCents } = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);

test('1 · the helper reads charge_amount_cents, falling back to amount_cents only when the column is absent', () => {
  assert.equal(customerChargeCents({ amount_cents: 10000, charge_amount_cents: 10750 }), 10750);
  assert.equal(customerChargeCents({ amount_cents: 10000, charge_amount_cents: 10000 }), 10000, 'a sandbox row: zero fee, zero tax');
  assert.equal(customerChargeCents({ amount_cents: 10000, charge_amount_cents: null }), 10000);
  assert.equal(customerChargeCents({ amount_cents: 10000 }), 10000);
  // Never arithmetic: the helper's body is one column read with a null fallback.
  const rules = stripComments(read('lib/paymentRules.ts'));
  assert.match(rules, /return payment\.charge_amount_cents \?\? payment\.amount_cents;/);
  assert.doesNotMatch(rules, /charge_amount_cents\s*[-+*/]/);
});

test('2 · JobConfirmed, ClientJobDetail and ApproveOrDispute show the customer the charge, never amount_cents', () => {
  for (const file of [
    'screens/JobConfirmedScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/ApproveOrDisputeScreen.tsx',
  ]) {
    const code = stripComments(read(file));
    assert.match(code, /customerChargeCents\(payment\)/, `${file} reads the charge`);
    assert.doesNotMatch(code, /cents=\{payment\.amount_cents\}/, `${file}: no held figure is amount_cents`);
    assert.doesNotMatch(code, /formatBudget\(payment\?\.amount_cents/, `${file}: no CTA or dialog figure is amount_cents`);
  }
  const approve = stripComments(read('screens/ApproveOrDisputeScreen.tsx'));
  // 2026-09-26 (the refresh, audit M-6): the CTA names the act; the dialog names
  // the charge — still the charge, never amount_cents.
  assert.match(approve, /`Approve & release payment`/);
  assert.match(approve, /`Your card was charged \$\{formatBudget\(payment \? customerChargeCents\(payment\) : null\)\} at checkout/);
  const detail = stripComments(read('screens/ClientJobDetailScreen.tsx'));
  assert.equal((detail.match(/customerChargeCents\(payment\)/g) ?? []).length, 3, 'the protected, window-closed and approved cards');
});

test('3 · the worker-facing surfaces are untouched by this rule — they read the take (R6c)', () => {
  for (const file of ['screens/WorkerJobScreen.tsx', 'screens/EarningsScreen.tsx']) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /customerChargeCents/, `${file} is not a customer surface`);
    assert.match(code, /workerTakeCents\(/);
  }
});
