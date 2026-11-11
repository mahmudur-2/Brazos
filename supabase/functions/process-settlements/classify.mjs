// ============================================================================
// Brazos · process-settlements / classify.mjs
//
// The drain's two pure decisions about one provider call, a transfer or a
// refund: the IDEMPOTENCY KEY it is sent under, and the VERDICT on what came
// back. Pure: no imports, no I/O, no clock. tests/moneySafety.test.mjs and
// tests/settlementRetry.test.mjs execute it under node while the Deno function
// imports it unchanged (the shape of connect-status/classify.mjs and
// stripe-webhook/verify.mjs).
//
// THE KEY (money rule 1). One attempt = one key = at most one transfer or
// refund. The key is the kind, the payment and the attempt number, nothing
// else: never a clock, never a random part, so a retry of the same attempt is
// the same request at the provider.
//
//   tr:<payment id>:<transfer_attempts>      rf:<payment id>:<refund_attempts>
//
// THE VERDICT (lean B16). Every answer ends the attempt in one of three ways:
//
//   sent      2xx with the object's id and amount. The drain writes it back at
//             once (record_settlement_sent); the webhook confirms it later.
//   refused   A 4xx that proves THIS key created nothing: not 401, not 403,
//             not 409, not 429, not an idempotency error. The provider saves
//             the first answer under a key and replays it, so a refusal under a
//             key means that key never moved money. The attempt ends and the
//             next tick starts a NEW attempt with a new key, on the five-minute
//             schedule the drain already has (balance_insufficient included:
//             a wait for balance never needs the owner). Refunds only: four
//             refusals cannot fix themselves (REFUND_STOP_CODES) and stop the
//             row instead, so it shows in payment_attention.
//   unknown   Everything else: no answer, a throw or timeout, a 5xx, a 401 or
//             403 (answered before the key is looked at), a 409 (the first
//             request may still be running), a 429, a 2xx without the id. The
//             SAME key is sent again while the attempt is younger than 23
//             hours (the database enforces the clock; the provider forgets a
//             key after 24). After that the row stops and shows in
//             payment_attention; only the owner starts a new attempt.
//             A 400 idempotency_error (this key was first used with different
//             parameters) stops the row at once: the same key can only repeat
//             the error, and a new key could pay twice.
//
// DEFERRED VS FAILED is only the operator's tally: deferred = not settled yet
// and nothing is wrong (balance_insufficient, every unknown that keeps its
// key); failed = a refusal that will repeat until a person acts, or a stop.
//
// PATHS READ: status, body.id, body.amount, body.error.code, body.error.type,
// body.error.message, and the thrown value's message. Nothing here is logged.
// ============================================================================

/** Provider error codes that mean "not yet", never "wrong". */
export const DEFERRED_CODES = Object.freeze(['balance_insufficient']);

/** Refund refusals that cannot fix themselves: the row stops and shows. */
export const REFUND_STOP_CODES = Object.freeze([
  'charge_already_refunded',
  'charge_disputed',
  'refund_disputed_payment',
  'amount_too_large',
]);

/** The two kinds, their key prefix and the id prefixes a 2xx must carry. */
const KINDS = Object.freeze({
  transfer: Object.freeze({ key: 'tr', ids: Object.freeze(['tr_']) }),
  refund: Object.freeze({ key: 'rf', ids: Object.freeze(['re_', 'pyr_']) }),
});

/** Statuses that never prove anything about the key. */
const KEY_UNKNOWN_STATUSES = Object.freeze([401, 403, 409, 429]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const knownKind = (kind) => typeof kind === 'string' && Object.prototype.hasOwnProperty.call(KINDS, kind);

/** A bounded, never-throwing description of an arbitrary value. */
function describe(value, limit) {
  let text;
  try {
    if (value instanceof Error) text = value.message || value.name || 'Error';
    else if (typeof value === 'string') text = value;
    else text = JSON.stringify(value);
    if (typeof text !== 'string') text = String(value);
  } catch {
    text = Object.prototype.toString.call(value);
  }
  return text.length > limit ? text.slice(0, limit) : text;
}

/** What to say about a body that carried no provider error. */
function summarise(body) {
  if (body === undefined || body === null) return 'no body';
  if (isObject(body) && Object.keys(body).length === 0) return 'empty body';
  return describe(body, 200);
}

/**
 * The idempotency key of one attempt. Depends on the kind, the payment and the
 * attempt number only.
 * @param {'transfer' | 'refund'} kind
 * @param {string} paymentId  the payments row id (a uuid)
 * @param {number} attempt    transfer_attempts or refund_attempts (an integer >= 0)
 * @returns {string}
 */
export function settlementKey(kind, paymentId, attempt) {
  if (!knownKind(kind)) throw new TypeError(`settlementKey: unknown kind ${String(kind)}; transfer or refund only`);
  if (typeof paymentId !== 'string' || !UUID.test(paymentId)) throw new TypeError('settlementKey: the payment id must be a uuid');
  if (!Number.isInteger(attempt) || attempt < 0) throw new TypeError('settlementKey: the attempt must be an integer of 0 or more');
  return `${KINDS[kind].key}:${paymentId.toLowerCase()}:${attempt}`;
}

/**
 * The verdict on one provider answer.
 * @param {'transfer' | 'refund'} kind
 * @param {{ status?: unknown, body?: unknown, threw?: unknown }} outcome
 *   status  the HTTP status the provider returned; ignored when threw is set
 *   body    the parsed JSON body ({} when it was not JSON)
 *   threw   the thrown value when the call never returned
 * @returns {{
 *   result: 'sent' | 'refused' | 'unknown',
 *   next: 'write_back' | 'new_key' | 'same_key' | 'stop',
 *   deferred: boolean,
 *   code: string | null,
 *   message: string,
 *   ref: string | null,
 *   amount: number | null,
 * }}
 */
export function settlementVerdict(kind, outcome) {
  if (!knownKind(kind)) throw new TypeError(`settlementVerdict: unknown kind ${String(kind)}; transfer or refund only`);
  const { status, body, threw } = isObject(outcome) ? outcome : {};
  const verdict = (result, next, deferred, code, message, ref = null, amount = null) =>
    ({ result, next, deferred, code, message, ref, amount });

  if (threw !== undefined && threw !== null) {
    return verdict('unknown', 'same_key', true, null, `threw: ${describe(threw, 300)}`);
  }

  const http = Number.isInteger(status) ? status : 0;

  if (http >= 200 && http < 300) {
    const ref = isObject(body) && typeof body.id === 'string' ? body.id : null;
    const amount = isObject(body) && Number.isInteger(body.amount) && body.amount > 0 ? body.amount : null;
    if (ref !== null && amount !== null && KINDS[kind].ids.some((prefix) => ref.startsWith(prefix))) {
      return verdict('sent', 'write_back', false, null, `${http} ${ref}`, ref, amount);
    }
    return verdict('unknown', 'same_key', true, null, `${http}: no ${kind} id and amount in the answer`);
  }

  const error = isObject(body) && isObject(body.error) ? body.error : null;
  const code = error !== null && typeof error.code === 'string' && error.code !== '' ? error.code : null;
  const type = error !== null && typeof error.type === 'string' ? error.type : null;
  const providerMessage =
    error !== null && typeof error.message === 'string' && error.message !== '' ? error.message : null;
  const head = http > 0 ? String(http) : 'no status';
  const tail = providerMessage ?? (code !== null ? null : summarise(body));
  const message = `${head}${code !== null ? ` ${code}` : ''}${tail !== null ? `: ${tail}` : ''}`;

  // The key was first used with other parameters: stop now.
  if (type === 'idempotency_error' && http !== 409) {
    return verdict('unknown', 'stop', false, code, message);
  }

  const refused = http >= 400 && http < 500 && !KEY_UNKNOWN_STATUSES.includes(http);
  if (!refused) return verdict('unknown', 'same_key', true, code, message);

  if (kind === 'refund' && REFUND_STOP_CODES.includes(code)) {
    return verdict('refused', 'stop', false, code, message);
  }
  return verdict('refused', 'new_key', DEFERRED_CODES.includes(code), code, message);
}

/**
 * The R6b projection of the verdict, kept for the old tests: rotate means the
 * next attempt gets a new key. The drain itself reads settlementVerdict.
 * @returns {{ rotate: boolean, deferred: boolean, code: string | null, message: string }}
 */
export function classifySettlementFailure(outcome, kind = 'transfer') {
  const v = settlementVerdict(kind, outcome);
  return { rotate: v.next === 'new_key', deferred: v.deferred, code: v.code, message: v.message };
}
