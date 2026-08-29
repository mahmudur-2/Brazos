// ============================================================================
// Brazos · stripe-webhook/verify.mjs  (plain JavaScript, no TypeScript)
//
// The provider's webhook signature check, on its own, so it can be EXECUTED by
// a test. Everything else in this directory is Deno and nothing in this
// repository can run it; this file is imported unchanged by both the Deno
// function (`./verify.mjs`) and tests/stripeWebhookSignature.test.mjs, which is
// the entire reason for the .mjs extension. Keep it plain JavaScript: one line
// of TypeScript syntax and `node --test` stops being able to load it.
//
// NO IMPORTS, and none are permitted. It reads no environment, touches no
// Deno.* or process.*, makes no network call, and uses only
// globalThis.crypto.subtle and TextEncoder — both of which Node 18+ and Deno
// have as globals.
//
// ---------------------------------------------------------------------------
// THE SCHEME
// ---------------------------------------------------------------------------
// The Stripe-Signature header is a comma-separated list of `key=value` pairs:
//
//     t=1690000000,v1=<hex>,v1=<hex>,v0=<hex>
//
// `t` is a Unix timestamp in SECONDS. Each signature scheme is the letter `v`
// followed by an integer. The signed payload is the timestamp, a literal `.`,
// and the RAW request body — the bytes as received, never a re-serialisation of
// a parsed object. The expected signature is HMAC-SHA256 of that payload keyed
// with the endpoint secret, as lowercase hex.
//
// ONLY v1 IS ACCEPTED. Stripe sends a deliberately fake `v0` alongside `v1` on
// test events; a verifier that accepted any `v` scheme could be walked down to
// one an attacker can forge, so every non-v1 scheme and every unrecognised key
// is IGNORED SILENTLY — ignored, never an error, because erroring on an
// unknown key would break the moment Stripe adds one.
//
// Several v1 values can be present at once during a secret rotation, and the
// header is accepted if ANY of them matches.
//
// TIMESTAMP: reject when nowSeconds − t is more than TOLERANCE_SECONDS. A
// timestamp in the FUTURE is not rejected and is not an attack vector — the
// timestamp is inside the signed payload, so moving it forward invalidates the
// signature.
//
// COMPARISON: constant-time, hand-rolled below — a length check, then an
// XOR-accumulate across the whole string with no early exit, and no early exit
// across the candidate list either. `===` on the hex would leak how much of a
// forged signature was right through how long the comparison took.
// ============================================================================

/** Stripe's documented default tolerance, in seconds. */
export const TOLERANCE_SECONDS = 300;

/**
 * Does this Stripe-Signature header authenticate this exact body?
 *
 * @param {string} rawBody          the request body exactly as received
 * @param {string|null} signatureHeader  the Stripe-Signature header, or null
 * @param {string} secret           the endpoint signing secret (whsec_…)
 * @param {number} nowSeconds       current Unix time in SECONDS
 * @returns {Promise<boolean>}      true only if a v1 signature matches and the
 *                                  timestamp is inside the tolerance
 */
export async function verifyStripeSignature(rawBody, signatureHeader, secret, nowSeconds) {
  if (typeof rawBody !== 'string') return false;
  if (typeof signatureHeader !== 'string' || signatureHeader.length === 0) return false;
  if (typeof secret !== 'string' || secret.length === 0) return false;
  if (typeof nowSeconds !== 'number' || !Number.isFinite(nowSeconds)) return false;

  // --- parse the header -----------------------------------------------------
  let timestamp = null;
  const candidates = [];

  for (const part of signatureHeader.split(',')) {
    const eq = part.indexOf('=');
    // No '=' at all, or nothing before it: not a pair. Ignore it.
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();

    if (key === 't') {
      // First `t` wins, and only an unsigned integer counts. A second or
      // malformed one cannot move the window.
      if (timestamp === null && value.length > 0 && /^[0-9]+$/.test(value)) {
        timestamp = Number(value);
      }
      continue;
    }
    if (key === 'v1') {
      if (value.length > 0) candidates.push(value);
      continue;
    }
    // v0 and every other scheme or key: silently ignored, on purpose.
  }

  if (timestamp === null) return false;
  if (candidates.length === 0) return false;
  if (nowSeconds - timestamp > TOLERANCE_SECONDS) return false;

  // --- the expected signature ----------------------------------------------
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${rawBody}`)
  );

  const bytes = new Uint8Array(mac);
  let expected = '';
  for (let i = 0; i < bytes.length; i++) {
    expected += bytes[i].toString(16).padStart(2, '0');
  }

  // --- constant-time comparison, no early exit ------------------------------
  let matched = 0;
  for (const candidate of candidates) {
    if (candidate.length !== expected.length) continue;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    matched |= diff === 0 ? 1 : 0;
  }

  return matched === 1;
}
