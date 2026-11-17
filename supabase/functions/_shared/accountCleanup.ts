// production-36h S1, M3 (plan section 4B): the account cleanup pass. After delete_my_account, one
// account_cleanups row records what still has to go: the account's Stripe customer (every saved card
// goes with it). This pass makes no other request: it removes no file and never touches a payout
// account, which stays in payment_accounts so a payment still owed to the person reaches it.
// process-settlements calls this pass once per run (S1 decision 12), after its money passes and
// before its report, and only while the claim, two Stripe requests and the record fit in the run
// (fits(run, 4)); it is never one of the passes that take turns. One import, the plain-JavaScript test
// of a deleted customer that payment-methods' list action shares (stripeCustomer.mjs, A4-02), so
// tests/accountCleanup.test.mjs runs it under node.
//
// Per run: one claim (claim_account_cleanups, at most 1 row, leased for 10 minutes), then per
// row the customer step if it is not done yet, then one record (record_account_cleanup, which keeps a
// done step done).
//   - customer (A11-10, the 404 rule): DELETE /v1/customers/<id>. The step is done only when
//     (i) the DELETE answers success with deleted: true and the same id, or
//     (ii) the DELETE answers an error, and a READ (GET /v1/customers/<id>) with the same key answers
//     deleted: true and the same id (Stripe returns a deleted customer on a read, with deleted: true;
//     what a second DELETE of a deleted customer answers is not documented, so it decides nothing).
//     Every other answer leaves the step open, with its error text and the normal retry. "Not found"
//     on both calls means this Stripe key does not know this customer (another account or another
//     mode): the step stays open and the saved error says exactly that.
// Owner step: the cleanup queue is empty before the Stripe keys change from sandbox to live.
// A row that can never finish (its customer is not known to any key the app holds) is closed by a
// developer through record_account_cleanup(<row id>, true, null), with the service role, once the
// customer is known to be gone or never to have held a card.
// The answer rule is process-settlements' own: a request that throws, is cut short, or answers with
// an empty or non-JSON body is "no answer", never a success and never a refusal; the step stays not
// done and is tried again. The error recorded is a step, a status and a Stripe error code only: never a
// key, a body, a phone number or a link. A failed claim, a result that was not saved and a fault each
// log one fixed line with a status at most: no secret, no Stripe id. A14-F (F2): the pass also hands
// those same lines back, and process-settlements adds them to its run's errors, so the run's report
// (record_timer_run) and the timer line on the owner's list show them. A Stripe refusal is not one
// of them: its row records it, and account_cleanup_attention lists the row after 1 hour (the
// service role's view only; not part of payment_attention, so the owner's payment list does not show
// it). A14-F (F5), the speed: at most one row a run, only in a quiet run; none while the money
// passes use the run (account_deletion_process, section 5, names the limit).
//
// It never throws and never waits past the run: every request goes through the run's own fetch (each
// bounded by the run's timeout). mayStart ("may a chain of 2 calls start") is asked before the claim,
// before each row and before each Stripe request, so there is always room for that request and the
// row's one write-back; a request it refuses leaves its step not done ("out of time"). A row it leaves
// is claimed again when its lease ends.

import { isDeletedCustomer } from './stripeCustomer.mjs';

type CleanupFetch = (url: string, init: RequestInit) => Promise<Response>;

interface CleanupRun {
  fetch: CleanupFetch;
  mayStart: () => boolean;
  supabaseUrl: string;
  serviceHeaders: Record<string, string>;
  stripeKey: string;
}

interface ClaimedRow {
  id: string;
  stripe_customer_id: string | null;
  customer_done: boolean;
}

type Answer = { status: number; body: unknown } | null;
type Fields = Record<string, unknown>;

const STRIPE_API = 'https://api.stripe.com';

/** The whole body parsed, or null: no answer. */
async function answerOf(run: CleanupRun, url: string, init: RequestInit): Promise<Answer> {
  try {
    const res = await run.fetch(url, init);
    return { status: res.status, body: JSON.parse(await res.text()) };
  } catch {
    return null;
  }
}

/** The status of a write whose answer has no body (record_account_cleanup returns void), or null. */
async function statusOf(run: CleanupRun, url: string, init: RequestInit): Promise<number | null> {
  try {
    const res = await run.fetch(url, init);
    await res.text();
    return res.status;
  } catch {
    return null;
  }
}

/** A Stripe request: sent only while the run has room for it and one write-back. */
async function ask(run: CleanupRun, url: string, init: RequestInit): Promise<Answer | 'late'> {
  return run.mayStart() ? answerOf(run, url, init) : 'late';
}

/** A Stripe answer must be an object; anything else is no answer. */
async function stripeAnswer(run: CleanupRun, url: string, init: RequestInit): Promise<{ status: number; body: Fields } | null | 'late'> {
  const a = await ask(run, url, init);
  if (a === 'late') return a;
  if (a === null || a.body === null || typeof a.body !== 'object' || Array.isArray(a.body)) return null;
  return { status: a.status, body: a.body as Fields };
}

function codeOf(body: Fields): string {
  const error = body.error as Fields | undefined;
  return error && typeof error === 'object' && typeof error.code === 'string' ? error.code : 'no code';
}

async function deleteCustomer(run: CleanupRun, id: string): Promise<string | null> {
  const url = `${STRIPE_API}/v1/customers/${encodeURIComponent(id)}`;
  const headers = { Authorization: `Bearer ${run.stripeKey}` };
  const del = await stripeAnswer(run, url, { method: 'DELETE', headers });
  if (del === 'late') return 'customer: out of time';
  if (del === null) return 'customer: no answer';
  if (isDeletedCustomer(del.status, del.body, id)) return null;
  const said = `customer: ${del.status} ${codeOf(del.body)}`;
  if (del.status < 400) return said;
  // (ii) the DELETE answered an error: a read with the same key decides.
  const read = await stripeAnswer(run, url, { method: 'GET', headers });
  if (read === 'late') return `${said}; read: out of time`;
  if (read === null) return `${said}; read: no answer`;
  if (isDeletedCustomer(read.status, read.body, id)) return null;
  if (del.status === 404 && read.status === 404) {
    return 'customer: this Stripe key does not know this customer (another account or another mode)';
  }
  return `${said}; read: ${read.status} ${read.status === 200 ? 'not deleted' : codeOf(read.body)}`;
}

/**
 * The pass. Resolves when done or out of time, with the pass's own failures, each one fixed line (a
 * failed claim, a result that was not saved, a fault; none when there was none); never rejects.
 */
export async function runAccountCleanups(run: CleanupRun): Promise<string[]> {
  const failures: string[] = [];
  const failed = (line: string): void => {
    console.error(line);
    failures.push(line);
  };
  try {
    if (!run.mayStart()) return failures;
    const rpc = (args: Fields): RequestInit => ({
      method: 'POST',
      headers: { ...run.serviceHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const claim = await answerOf(run, `${run.supabaseUrl}/rest/v1/rpc/claim_account_cleanups`, rpc({ p_limit: 1 }));
    if (claim === null || claim.status !== 200 || !Array.isArray(claim.body)) {
      failed(`account cleanup: the claim failed (${claim === null ? 'no answer' : claim.status})`);
      return failures;
    }

    for (const row of claim.body as ClaimedRow[]) {
      if (!run.mayStart()) return failures;
      const customer = row.customer_done || row.stripe_customer_id === null
        ? null : await deleteCustomer(run, row.stripe_customer_id);
      const saved = await statusOf(run, `${run.supabaseUrl}/rest/v1/rpc/record_account_cleanup`, rpc({
        p_id: row.id,
        p_customer: customer === null,
        p_error: customer,
      }));
      if (saved === null || saved < 200 || saved > 299) {
        failed(`account cleanup: a row's result was not saved (${saved ?? 'no answer'})`);
      }
    }
  } catch {
    // A fault in this pass ends it; the money passes never see it, the run's report does (A14-F F2).
    failed('account cleanup: the pass stopped on a fault');
  }
  return failures;
}
