import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  TOLERANCE_SECONDS,
  verifyStripeSignature,
} from '../supabase/functions/stripe-webhook/verify.mjs';

// ---------------------------------------------------------------------------
// The one part of the webhook a test in this repository can execute
// ---------------------------------------------------------------------------
//
// stripe-webhook is Deno and nothing here runs Deno, so the handler around this
// module is unproven by any harness — deliberately, and said so in the run
// report rather than papered over with a test that asserts a file exists. The
// SIGNATURE CHECK is different: it is pure, it takes its clock as an argument,
// and it is the only authentication a public endpoint has. So it lives in its
// own .mjs file, imported unchanged by both the Deno function and this file.
//
// EVERY EXPECTED SIGNATURE BELOW IS COMPUTED HERE, with node:crypto, from the
// scheme as documented. Asking the verifier to produce its own fixtures would
// prove only that it agrees with itself.
//
// THE LIMIT OF THIS PROOF, stated plainly: it proves the implementation matches
// the scheme as read. It does not prove the provider's actual bytes — the first
// real test-mode event is what closes that gap.

const SECRET = 'whsec_brazos_test_endpoint_secret';
const OTHER_SECRET = 'whsec_a_completely_different_secret';
const NOW = 1_760_000_000;

const BODY = JSON.stringify({
  id: 'evt_1PbRaZ0Steqxyz',
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_3PbRaZ', metadata: { payment_id: 'a1b2c3d4' } } },
});

/** HMAC-SHA256 of `<t>.<body>`, lowercase hex — the scheme, written out. */
const sign = (body, timestamp, secret = SECRET) =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');

const header = (...parts) => parts.join(',');

test('1 · a correctly signed header passes', async () => {
  const t = NOW - 5;
  const ok = await verifyStripeSignature(BODY, header(`t=${t}`, `v1=${sign(BODY, t)}`), SECRET, NOW);
  assert.equal(ok, true);
});

test('2 · one changed byte of the body fails the same header', async () => {
  const t = NOW - 5;
  const signature = header(`t=${t}`, `v1=${sign(BODY, t)}`);
  // The signature covers the raw bytes. A single character anywhere in them —
  // here the last digit of the payment id — must break it.
  const tampered = BODY.replace('a1b2c3d4', 'a1b2c3d5');
  assert.notEqual(tampered, BODY, 'the fixture must actually differ');
  assert.equal(await verifyStripeSignature(tampered, signature, SECRET, NOW), false);
  // Paired control: the untampered body still passes with that same header.
  assert.equal(await verifyStripeSignature(BODY, signature, SECRET, NOW), true);
});

test('3 · a valid header verified with a different secret fails', async () => {
  const t = NOW - 5;
  const signature = header(`t=${t}`, `v1=${sign(BODY, t)}`);
  assert.equal(await verifyStripeSignature(BODY, signature, OTHER_SECRET, NOW), false);
  assert.equal(await verifyStripeSignature(BODY, signature, SECRET, NOW), true);
});

test('4 · the timestamp window is exactly 300 seconds of age', async () => {
  const at = async (age) => {
    const t = NOW - age;
    return verifyStripeSignature(BODY, header(`t=${t}`, `v1=${sign(BODY, t)}`), SECRET, NOW);
  };
  assert.equal(TOLERANCE_SECONDS, 300);
  assert.equal(await at(301), false, '301 seconds old is rejected');
  assert.equal(await at(300), true, '300 seconds old is still inside the window');
  assert.equal(await at(299), true, '299 seconds old passes');
});

test('4b · a future timestamp is not an attack vector and is not rejected', async () => {
  // The timestamp is inside the signed payload, so moving it forward
  // invalidates the signature. Rejecting the future would only break on clock
  // skew between the provider and this host.
  const t = NOW + 120;
  const ok = await verifyStripeSignature(BODY, header(`t=${t}`, `v1=${sign(BODY, t)}`), SECRET, NOW);
  assert.equal(ok, true);
});

test('5 · a garbage v0 alongside a valid v1 passes', async () => {
  // Stripe sends a deliberately fake v0 on test events. Ignoring it silently
  // is required; erroring on it would reject every test event.
  const t = NOW - 5;
  const signature = header(`t=${t}`, 'v0=deadbeefdeadbeefdeadbeefdeadbeef', `v1=${sign(BODY, t)}`);
  assert.equal(await verifyStripeSignature(BODY, signature, SECRET, NOW), true);
});

test('6 · a v0 alone fails, and unrecognised keys beside a valid v1 do not', async () => {
  const t = NOW - 5;
  // Accepting a non-v1 scheme would be a downgrade attack: v0 is a value an
  // attacker can supply, so a header carrying ONLY v0 must never authenticate.
  const v0Only = header(`t=${t}`, `v0=${sign(BODY, t)}`);
  assert.equal(await verifyStripeSignature(BODY, v0Only, SECRET, NOW), false);

  // Unknown keys are ignored, never an error — the header must keep verifying
  // the day the provider adds a field.
  const withExtras = header(
    `t=${t}`,
    'scheme=whatever',
    'v99=00',
    `v1=${sign(BODY, t)}`,
    'trailing=value'
  );
  assert.equal(await verifyStripeSignature(BODY, withExtras, SECRET, NOW), true);
});

test('7 · during a rotation, ANY of the v1 values may be the matching one', async () => {
  const t = NOW - 5;
  const good = sign(BODY, t);
  const stale = sign(BODY, t, OTHER_SECRET);
  assert.notEqual(stale, good);
  assert.equal(
    await verifyStripeSignature(BODY, header(`t=${t}`, `v1=${stale}`, `v1=${good}`), SECRET, NOW),
    true,
    'the matching value second'
  );
  assert.equal(
    await verifyStripeSignature(BODY, header(`t=${t}`, `v1=${good}`, `v1=${stale}`), SECRET, NOW),
    true,
    'the matching value first'
  );
  assert.equal(
    await verifyStripeSignature(BODY, header(`t=${t}`, `v1=${stale}`), SECRET, NOW),
    false,
    'and neither matching is still a refusal'
  );
});

test('8 · a missing or malformed header authenticates nothing', async () => {
  const t = NOW - 5;
  const good = sign(BODY, t);
  for (const [label, value] of [
    ['null (the header was absent)', null],
    ['empty', ''],
    ['no timestamp', `v1=${good}`],
    ['no signature at all', `t=${t}`],
    ['a non-numeric timestamp', header('t=not-a-number', `v1=${good}`)],
    ['no pairs at all', 'garbage'],
  ]) {
    assert.equal(
      await verifyStripeSignature(BODY, value, SECRET, NOW),
      false,
      `${label} must not authenticate`
    );
  }
  // Paired control on the same body and clock.
  assert.equal(await verifyStripeSignature(BODY, header(`t=${t}`, `v1=${good}`), SECRET, NOW), true);
});

test('9 · an empty secret never authenticates, even against its own HMAC', async () => {
  // A missing STRIPE_WEBHOOK_SECRET reaches this module as ''. Deriving a real
  // HMAC from an empty key is possible, so the refusal has to be explicit.
  const t = NOW - 5;
  const signature = header(`t=${t}`, `v1=${sign(BODY, t, '')}`);
  assert.equal(await verifyStripeSignature(BODY, signature, '', NOW), false);
});
