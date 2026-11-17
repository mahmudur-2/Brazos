import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * B3 (production-36h) — THE ACCESS LANE'S REFUSALS REACH THE PERSON AS WRITTEN. The server's own
 * sentences (20261116400500_active_account_rule.sql: begin_tip_payment, begin_job_payment,
 * accept_offer):
 *   - a tip to a suspended worker:            'This worker can no longer receive tips.'
 *   - checkout or accept with an inactive one: 'Worker is not available'
 * A database refusal arrives as the PostgREST error (accept_offer); a payment refusal arrives as
 * create-payment's { error } body with status 400 (begin_job_payment and begin_tip_payment run as
 * the caller inside it). Both shapes end in lib/errorMessage.ts userMessage(), the one mapper every
 * alert below uses, and it passes each sentence through unchanged, in a release build and in
 * development alike.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');

const TIP_REFUSED = 'This worker can no longer receive tips.';
const WORKER_GONE = 'Worker is not available';

const { userMessage } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);
const { extractInvokeError } = await import(pathToFileURL(join(root, 'lib/payments/stripeRules.ts')).href);

for (const dev of [false, true]) {
  test(`the two sentences pass the shared mapper unchanged (__DEV__ ${dev})`, () => {
    globalThis.__DEV__ = dev;
    for (const sentence of [TIP_REFUSED, WORKER_GONE]) {
      // accept_offer: the PostgREST error of a P0001.
      assert.equal(userMessage({ message: sentence, code: 'P0001', details: null }), sentence);
      assert.equal(userMessage({ message: sentence, code: 'P0001' }, 'Check your connection and try again.'), sentence);
      // create-payment: its 400 body, read the way lib/payments/stripe.ts reads it, then mapped twice
      // (once in lib/payments/stripe.ts, once by the screen).
      const invokeError = { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status: 400 } };
      const { message } = extractInvokeError(invokeError, JSON.stringify({ error: sentence }));
      assert.equal(message, sentence);
      assert.equal(userMessage({ message: userMessage(message) }, 'Check your connection and try again.'), sentence);
    }
    globalThis.__DEV__ = false;
  });
}

test('[static] every alert on these paths shows userMessage(the refusal) first', () => {
  const stripe = flat(read('lib/payments/stripe.ts'));
  assert.ok(
    (stripe.match(/const \{ message \} = extractInvokeError\(invoked\.error as InvokeErrorLike, body\);/g) ?? []).length >= 2,
    'create-payment: the card checkout and the saved card read the body sentence'
  );
  const sites = [
    ['screens/CheckoutScreen.tsx', /'Could not start the payment', `\$\{userMessage\(session\.error, 'Check your connection and try again\.'\)\}/],
    ['screens/ReviewAndTipScreen.tsx', /'Could not start the tip', `\$\{userMessage\(session\.error, 'Check your connection and try again\.'\)\}/],
    ['screens/BidDetailScreen.tsx', /'Could not accept this bid', userMessage\(acceptError, 'Check your connection and try again\.'\)/],
    ['screens/JobDetailScreen.tsx', /'Could not accept this offer', userMessage\(error, 'Check your connection and try again\.'\)/],
    ['screens/ClientJobDetailScreen.tsx', /alertAsync\('Could not confirm bid acceptance', userMessage\(error\)\)/],
    ['screens/ChatScreen.tsx', /alertAsync\('Could not update offer', userMessage\(error\)\)/],
  ];
  for (const [file, pattern] of sites) assert.match(flat(read(file)), pattern, file);
});
