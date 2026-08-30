// ============================================================================
// Brazos · process-settlements / classify.mjs
//
// Turns one FAILED provider call — a transfer or a refund that did not return
// 2xx, or threw before returning — into the two decisions the drain must make
// about the ledger row: whether to ROTATE the idempotency key, and whether the
// failure is DEFERRED (not settled yet, nothing wrong) or FAILED (terminal).
// Pure: no imports, no I/O, no clock — tests/settlementRetry.test.mjs executes
// it under node while the Deno function imports it unchanged (the shape of
// connect-status/classify.mjs and stripe-webhook/verify.mjs).
//
// THE ROTATION RULE (R6b D1) — three-way, and 409 sits with 429, not with the
// other 4xx. Stated as one predicate:
//
//   rotate = status >= 400 && status < 500 && status !== 409 && status !== 429
//   a throw is never a rotation
//
// The provider saves the status code and body of the FIRST request made under
// an idempotency key — success or failure alike — and replays it for 24 hours.
// So every branch below is a question about what that cached result means:
//
//   4xx, not 409, not 429   The endpoint executed and DEFINITIVELY refused: no
//                           transfer or refund was created, and the refusal is
//                           cached against the key. Retrying with the same key
//                           replays it verbatim — funding the balance cannot
//                           fix it (the 2026-08-30 money walk: four ticks
//                           against a since-funded balance, every one
//                           replaying the first tick's balance_insufficient).
//                           ROTATE: the row's counter goes up by one and the
//                           next tick sends a genuinely new request.
//   409                     idempotency_key_in_use / lock_timeout: the
//                           ORIGINAL request under this key may STILL BE
//                           EXECUTING and may yet succeed. Rotating would race
//                           it with a second live request — a double-pay path.
//                           KEEP the key; next tick the original has resolved
//                           and the same key returns its true result.
//   5xx                     The endpoint began executing and the operation MAY
//                           have succeeded before the error; that result is
//                           cached. Rotating here can send a second transfer
//                           for money that already moved. KEEP the key. If it
//                           did succeed, transfer.created / charge.refunded
//                           arrives by webhook, apply_payment_event records the
//                           ref and the row leaves its queue — the webhook is
//                           the reconciliation. If it truly failed, the cached
//                           5xx replays until the key expires at 24 hours,
//                           then executes fresh: slow, never double.
//   429                     The rate limiter runs AHEAD of the idempotency
//                           layer: nothing cached, nothing executed. KEEP the
//                           key; the same request simply goes again.
//   thrown                  Network failure, timeout, DNS, abort: the request
//                           may have reached the provider and succeeded. This
//                           is precisely the case idempotency keys exist for.
//                           KEEP the key.
//
// WHY 5xx AND 409 ARE THE DANGEROUS ONES: they are the two outcomes in which
// money may already have moved under this key. Every other branch is at worst
// a wasted call; those two, rotated, are a second payment.
//
// DEFERRED VS FAILED (D7). `deferred` means the settlement has not happened
// yet and nothing is wrong with it: balance_insufficient (in live mode
// ORDINARY TIMING — money from a card charge is not available to transfer
// instantly), a 409, a 429, a 5xx, a throw. `failed` is reserved for a
// terminal 4xx that will refuse again on every retry until a human acts (an
// invalid destination, a charge that cannot be refunded). The drain tallies
// the two apart so the operator summary stops calling timing a defect.
//
// PATHS READ: status, body.error.code, body.error.message, and the thrown
// value's message. Nothing else, and nothing here is logged.
// ============================================================================

/** Provider error codes that mean "not yet", never "wrong". */
export const DEFERRED_CODES = Object.freeze(['balance_insufficient']);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

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
 * @param {{ status?: unknown, body?: unknown, threw?: unknown }} outcome
 *   status  the HTTP status the provider returned; ignored when threw is set
 *   body    the parsed JSON body, or whatever the caller could parse ({} when
 *           the body was not JSON)
 *   threw   the thrown value when the call never returned; null or undefined
 *           when it did
 * @returns {{ rotate: boolean, deferred: boolean, code: string | null, message: string }}
 *   rotate    increment the row's attempt counter so the next key is new
 *   deferred  not settled yet and not wrong (tally deferred); false = failed
 *   code      the provider's error code when the body carried one
 *   message   what to record on the row — bounded, never empty, never throws
 */
export function classifySettlementFailure(outcome) {
  const { status, body, threw } = isObject(outcome) ? outcome : {};

  if (threw !== undefined && threw !== null) {
    return { rotate: false, deferred: true, code: null, message: `threw: ${describe(threw, 300)}` };
  }

  const http = Number.isInteger(status) ? status : 0;
  const error = isObject(body) && isObject(body.error) ? body.error : null;
  const code = error !== null && typeof error.code === 'string' && error.code !== '' ? error.code : null;
  const providerMessage =
    error !== null && typeof error.message === 'string' && error.message !== '' ? error.message : null;

  // THE PREDICATE. Everything that is not a definitive 4xx refusal keeps the
  // key — a status this function does not recognise included.
  const rotate = http >= 400 && http < 500 && http !== 409 && http !== 429;
  const deferred = rotate ? DEFERRED_CODES.includes(code) : true;

  const head = http > 0 ? String(http) : 'no status';
  const tail = providerMessage ?? (code !== null ? null : summarise(body));
  const message = `${head}${code !== null ? ` ${code}` : ''}${tail !== null ? `: ${tail}` : ''}`;
  return { rotate, deferred, code, message };
}
