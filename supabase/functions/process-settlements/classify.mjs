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
//             not 409, not 429, not an idempotency error, and a COMPLETE
//             answer that says so: a parsed error object with a type (critic
//             A5-01). A 4xx whose body was lost, cut short, empty, not JSON,
//             {} or an error with no type is unknown. The provider saves
//             the first answer under a key and replays it, so a refusal under a
//             key means that key never moved money. The attempt ends and the
//             next tick starts a NEW attempt with a new key, on the five-minute
//             schedule the drain already has (balance_insufficient included).
//             Refunds only: four refusals cannot fix themselves
//             (REFUND_STOP_CODES) and stop the row instead, so it shows in
//             payment_attention. M2-3 (R-E): the database counts the refusals
//             in a run, and a refusal more than 3 days into its run is
//             recorded as a stop (refusal_limit); this verdict is unchanged.
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
// PATHS READ: status, body.id, body.amount, body.status (a refund only: failed
// or canceled stops the row), body.error.code, body.error.type,
// body.error.message, and the thrown value's message. Nothing here is logged.
//
// THE FAILED REFUND (Codex R11-A1). A refund answered 2xx as failed or
// canceled is also handed back whole as a refund.failed event
// (refundFailedEvent), which the drain stores and applies like the webhook.
//
// THE VOIDED ROW'S INTENT (M2-2, R-F). intentReading says what a cancel's or
// a read's answer proves about the intent: canceled or succeeded, read back as
// this intent, each as the fact the drain stores and applies; everything else
// proves nothing. PATHS READ: status, body.object, body.id, body.status,
// body.amount, body.amount_received, body.currency, body.error.code, and the
// thrown value's message.
//
// THE PAYOUT ACCOUNT (M2-3b, R-E). accountReading says whether a read of a
// worker's payout account is that account; the state itself is connect-status's
// rule (classifyAccount). PATHS READ: status, body.object, body.id,
// body.error.code, and the thrown value's message.
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

/** Statuses that never prove anything about the key (nor, for a cancel, about the intent). */
export const KEY_UNKNOWN_STATUSES = Object.freeze([401, 403, 409, 429]);

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
 *   body    the parsed JSON body (A5-01: the drain hands a body it could not read whole,
 *           or could not parse, as threw, never as {})
 *   threw   the thrown value when the call never returned or its answer could not be read
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
      // F2: a refund the provider answered as failed or canceled made no refund: stop, so it shows.
      if (kind === 'refund' && (body.status === 'failed' || body.status === 'canceled')) {
        return verdict('refused', 'stop', false, null, `${http} ${ref} ${body.status}: the provider made no refund`);
      }
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

  // A5-01: a refusal (and so a new key) needs the provider's own error with its type. Without it the
  // answer is incomplete, and a lost answer may hide one that would have stopped the row.
  const refused = http >= 400 && http < 500 && !KEY_UNKNOWN_STATUSES.includes(http) && type !== null && type !== '';
  if (!refused) return verdict('unknown', 'same_key', true, code, message);

  if (kind === 'refund' && REFUND_STOP_CODES.includes(code)) {
    return verdict('refused', 'stop', false, code, message);
  }
  return verdict('refused', 'new_key', DEFERRED_CODES.includes(code), code, message);
}

/**
 * Codex R11-A1: a refund the provider answered 2xx as failed or canceled (the verdict's F2 branch,
 * the only refusal on a 2xx) is a failure the drain has seen. This is the stored event the drain
 * hands to apply_payment_event, so the webhook's refund.failed rule alone records it, at once: one
 * payment_refund_failures row per refund id, refund_failed_at for a new id, refund_ref by the
 * own-refund rule. The provider's Refund is the event's object, unchanged; the id names the drain
 * and the refund, and no Stripe event id has that form (Stripe's begin evt_). null for every other
 * answer. A cancellation is a type of refund failure (docs.stripe.com/refunds): recorded the same way.
 * @returns {{ id: string, type: 'refund.failed', payload: object } | null}
 */
export function refundFailedEvent(kind, outcome) {
  if (kind !== 'refund' || settlementVerdict(kind, outcome).result !== 'refused') return null;
  if (!(outcome.status >= 200 && outcome.status < 300)) return null;
  const id = `process-settlements:${outcome.body.id}`;
  return { id, type: 'refund.failed', payload: { id, type: 'refund.failed', data: { object: outcome.body } } };
}

/**
 * M2-2 (R-F; critic R-A "Intent cancel unknown"): the PaymentIntent statuses in which the intent is
 * still open. None proves the cancel; the drain cancels again next tick (Stripe allows a cancel in each
 * of them; in processing it is usually refused and the next read decides).
 */
export const INTENT_OPEN_STATUSES = Object.freeze([
  'requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture', 'processing',
]);

/**
 * M2-2 (R-F): what one answer about a voided row's PaymentIntent proves: the cancel's answer or the
 * read's (GET /v1/payment_intents/<ref>). Only the intent itself, answered 2xx as an object
 * 'payment_intent' whose id is this ref, proves anything, and only in two states:
 *   canceled   with amount_received 0: the cancel is proven. A payment_intent.canceled fact, then the
 *              final stamp (record_intent_cancel).
 *   succeeded  with an integer amount_received above 0: the intent took money after the row was
 *              voided. A payment_intent.succeeded fact carrying that amount, applied by the existing
 *              funded-after-void rule (apply_payment_event): the whole charge back, or blocked and
 *              listed when the amount differs (payment_money_clear).
 * Everything else is 'unknown': an open status (INTENT_OPEN_STATUSES), an unfamiliar status, another
 * object or id, a canceled intent that received money, a succeeded one without its amount, a 404, any
 * 400 (a parameter mismatch, a refusal because of the intent's state), 401, 403, 409, 429, a 5xx, a
 * throw or a timeout. The row stays queued, at the back (record_intent_check).
 * The fact's id is the re-read form the director accepted (M-M2-go 7, point 5),
 * process-settlements:reread:<object id>:<status>, with the value that can change while the intent and
 * its status are the same (2c, A4-04): amount_received. Stripe's event ids begin evt_. Its object is
 * a projection of the answer (id, object, status, amount, amount_received, currency): never the
 * client secret, nothing apply_payment_event does not read.
 * @param {string} ref  the row's provider_ref
 * @param {{ status?: unknown, body?: unknown, threw?: unknown }} outcome
 * @param {'cancel' | 'read'} via  which call answered (only for the words)
 * @returns {{ state: 'canceled' | 'succeeded' | 'unknown',
 *             event: { id: string, type: string, payload: object } | null,
 *             answer: string }}
 */
export function intentReading(ref, outcome, via) {
  const { status, body, threw } = isObject(outcome) ? outcome : {};
  const unknown = (answer) => ({ state: 'unknown', event: null, answer: `${via} ${answer}`.slice(0, 200) });
  if (threw !== undefined && threw !== null) return unknown(`threw: ${describe(threw, 150)}`);
  const http = Number.isInteger(status) ? status : 0;
  if (!(http >= 200 && http < 300)) {
    const error = isObject(body) && isObject(body.error) ? body.error : null;
    const code = error !== null && typeof error.code === 'string' && error.code !== '' ? error.code : null;
    return unknown(`${http > 0 ? http : 'no status'}${code !== null ? ` ${code}` : ''}`);
  }
  if (!isObject(body) || body.object !== 'payment_intent' || body.id !== ref || typeof ref !== 'string' || ref === '') {
    return unknown(`${http}: not this intent`);
  }
  const state = typeof body.status === 'string' ? body.status : 'no status';
  const received = Number.isInteger(body.amount_received) ? body.amount_received : null;
  const proven = (state === 'canceled' && received === 0) || (state === 'succeeded' && received !== null && received > 0);
  if (!proven) return unknown(`${http} ${state}${received === null ? '' : ` received ${received}`}`);
  const id = `process-settlements:reread:${ref}:${state}:${received}`;
  const type = `payment_intent.${state}`;
  const object = {
    id: ref,
    object: 'payment_intent',
    status: state,
    amount: Number.isInteger(body.amount) ? body.amount : null,
    amount_received: received,
    currency: typeof body.currency === 'string' ? body.currency : null,
  };
  return { state, event: { id, type, payload: { id, type, data: { object } } }, answer: `${via} ${http} ${state}` };
}

/**
 * M2-3b (R-E, the hourly payout re-read): what one read of a worker's payout account proves
 * (GET /v2/core/accounts/<id>, the request connect-status makes). Only this account itself, answered
 * 2xx as an object 'v2.core.account' whose id is this account id, proves anything: it is handed back
 * whole, for connect-status's own rule (classifyAccount) to turn into the payout state. Everything
 * else (another object or id, any 4xx or 5xx, a throw or a timeout) proves nothing: account null, and
 * the stored state stays as it is.
 * @param {string} accountId  payment_accounts.stripe_account_id
 * @param {{ status?: unknown, body?: unknown, threw?: unknown }} outcome
 * @returns {{ account: object | null, answer: string }}
 */
export function accountReading(accountId, outcome) {
  const { status, body, threw } = isObject(outcome) ? outcome : {};
  const nothing = (answer) => ({ account: null, answer: `read ${answer}`.slice(0, 200) });
  if (threw !== undefined && threw !== null) return nothing(`threw: ${describe(threw, 150)}`);
  const http = Number.isInteger(status) ? status : 0;
  if (!(http >= 200 && http < 300)) {
    const error = isObject(body) && isObject(body.error) ? body.error : null;
    const code = error !== null && typeof error.code === 'string' && error.code !== '' ? error.code : null;
    return nothing(`${http > 0 ? http : 'no status'}${code !== null ? ` ${code}` : ''}`);
  }
  if (!isObject(body) || body.object !== 'v2.core.account' || typeof accountId !== 'string' || accountId === ''
      || body.id !== accountId) {
    return nothing(`${http}: not this account`);
  }
  // A9-04: only the known shape is read by connect-status's rule: a payout capability status it knows,
  // and, for any status but active (the only one the rule decides without them), the requirements.
  const transfers = body.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers;
  const capability = isObject(transfers) ? transfers.status : undefined;
  if (!KNOWN_TRANSFER_STATUSES.includes(capability)) {
    return nothing(`${http}: payout capability not read (${typeof capability === 'string' ? describe(capability, 40) : 'no status'})`);
  }
  const requirements = body.requirements;
  if (capability !== 'active' && !(isObject(requirements) && (requirements.entries == null || Array.isArray(requirements.entries)))) {
    return nothing(`${http}: requirements not read`);
  }
  return { account: body, answer: `read ${http}` };
}

/** A9-04: the statuses of a v2 account's stripe_transfers capability that the drain reads. */
const KNOWN_TRANSFER_STATUSES = Object.freeze(['active', 'pending', 'restricted', 'unsupported']);

/**
 * A5-04 (ii), fair turns between runs: the passes in this run's order, the list turned left by
 * turn mod its length, so each pass goes first once every length runs. A turn that is not an integer
 * of 0 or more is turn 0. Never changes the list it is given.
 * @param {number} turn   the run's five-minute slot
 * @param {readonly string[]} names
 * @returns {string[]}
 */
export function turnOrder(turn, names) {
  const list = Array.isArray(names) ? [...names] : [];
  if (list.length === 0) return list;
  const k = (Number.isSafeInteger(turn) && turn >= 0 ? turn : 0) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/**
 * A5-04 (ii): the rows a pass read, tried from an offset that moves by one each time that pass goes
 * first (floor(turn / passes) mod rows), so each row is the first tried once every rows.length such
 * runs. Every row is kept, once each, in the queue's order from the offset. Never changes the list.
 * @param {number} turn    the run's five-minute slot
 * @param {number} passes  how many passes take turns
 * @param {readonly unknown[]} rows
 * @returns {unknown[]}
 */
export function rowOrder(turn, passes, rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  if (list.length === 0) return list;
  const t = Number.isSafeInteger(turn) && turn >= 0 ? turn : 0;
  const n = Number.isSafeInteger(passes) && passes > 0 ? passes : 1;
  const k = Math.floor(t / n) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/**
 * A5 point 10, the event scan: the event types it reads, exactly the webhook's HANDLED_EVENTS
 * (supabase/functions/stripe-webhook/index.ts; tests/settlementRun.test.mjs holds the two equal).
 */
export const SCANNED_EVENT_TYPES = Object.freeze([
  'payment_intent.succeeded',
  'payment_intent.canceled',
  'charge.refunded',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.closed',
  'transfer.created',
  'transfer.reversed',
]);

/**
 * A5 point 10: one page of Stripe's event list (GET /v1/events, newest first), as positive evidence
 * only. A page is a whole 2xx list answer; anything else (a throw, a lost or unreadable body, any
 * other status, not a list, a has_more that is not true or false, more pages with no id on the last
 * item to read them from: A12-02) is no page, and proves nothing. On a page, an item is an event only when
 * it is an event object with an evt_ id, a whole-second created time, one of SCANNED_EVENT_TYPES and
 * a data object; other items are counted unreadable, never applied. An event rendered in another
 * Stripe API version than `version` (the webhook's) is listed with ours false: the webhook's own
 * copy of it is the one in the webhook's shape.
 * @param {{status?: number, body?: unknown, threw?: unknown} | null | undefined} outcome
 * @param {string} version  the Stripe API version the webhook is made with
 * @returns {{ page: null, answer: string } | { page: { events: Array<{event: Record<string, unknown>, ours: boolean}>, unreadable: number, hasMore: boolean, lastId: string | null }, answer: string }}
 */
export function eventListReading(outcome, version) {
  const { status, body, threw } = isObject(outcome) ? outcome : {};
  const nothing = (answer) => ({ page: null, answer: `list ${answer}`.slice(0, 200) });
  if (threw !== undefined && threw !== null) return nothing(`threw: ${describe(threw, 150)}`);
  const http = Number.isInteger(status) ? status : 0;
  if (!(http >= 200 && http < 300)) {
    const error = isObject(body) && isObject(body.error) ? body.error : null;
    const code = error !== null && typeof error.code === 'string' && error.code !== '' ? error.code : null;
    return nothing(`${http > 0 ? http : 'no status'}${code !== null ? ` ${code}` : ''}`);
  }
  if (!isObject(body) || body.object !== 'list' || !Array.isArray(body.data)) return nothing(`${http}: not a list`);
  // A12-02: has_more must be true or false, and more pages need the last item's id as the cursor.
  if (typeof body.has_more !== 'boolean') return nothing(`${http}: has_more is not true or false`);
  const last = body.data.length > 0 ? body.data[body.data.length - 1] : null;
  const lastId = isObject(last) && typeof last.id === 'string' && last.id !== '' ? last.id : null;
  if (body.has_more && lastId === null) return nothing(`${http}: more pages and no last id to read them`);
  const events = [];
  let unreadable = 0;
  for (const item of body.data) {
    if (!isObject(item) || item.object !== 'event' || typeof item.id !== 'string' || !item.id.startsWith('evt_')
        || !Number.isSafeInteger(item.created) || !SCANNED_EVENT_TYPES.includes(item.type)
        || !isObject(item.data) || !isObject(item.data.object)) {
      unreadable++;
      continue;
    }
    events.push({ event: item, ours: typeof version === 'string' && version !== '' && item.api_version === version });
  }
  return { page: { events, unreadable, hasMore: body.has_more, lastId }, answer: `list ${http}` };
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
