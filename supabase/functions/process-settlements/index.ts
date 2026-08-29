// ============================================================================
// Brazos · process-settlements  (Supabase Edge Function, Deno)
//
// Drains the two money queues the database maintains: transfers_due (money out
// to the worker) and refunds_due (money back to the customer). Woken every five
// minutes by pg_cron through public.drain_settlements(), which is its only
// caller.
//
//   Deploy:  npx supabase functions deploy process-settlements
//   Invoke:  curl -X POST "$SUPABASE_URL/functions/v1/process-settlements" \
//              -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//
// ---------------------------------------------------------------------------
// NO EDGE FUNCTION COMPUTES A MONETARY AMOUNT
// ---------------------------------------------------------------------------
// Every number sent to the provider is read VERBATIM from a payments column:
// transfer_cents to transfer, refund_cents to refund. Both were decided by the
// database — release_job_payment, auto_release_due_payments, cancel_job and
// resolve_job_dispute write them. This function adds nothing, rounds nothing
// and derives nothing. A row whose amount is null or not positive is SKIPPED
// and counted as a defect; substituting a computed value would be a defect even
// if the number happened to be right.
//
// ---------------------------------------------------------------------------
// IT RECORDS NOTHING BACK ON THE LEDGER, AND THAT IS THE CONTRACT
// ---------------------------------------------------------------------------
// transfer_ref is written by apply_payment_event() on transfer.created, and
// refund_ref on charge.refunded. attach_provider_ref() is the PaymentIntent's
// entry point and nothing else. So a row STAYS in its queue until its event
// lands, and this function may well see it again on the next tick. That is
// safe, and only because of the idempotency keys below: a repeat inside the
// provider's idempotency window returns the SAME transfer or refund rather than
// creating a second one.
//
// THE TRANSFER MUST CARRY metadata[payment_id]. apply_payment_event() resolves
// an event to a ledger row by metadata.payment_id first, then by provider_ref
// for payment_intent.* and charge.* events — there is no fallback for a
// transfer.*. A transfer sent without it produces a transfer.created that
// matches no row, is marked processed, and leaves the payment held forever.
//
// ---------------------------------------------------------------------------
// SECURITY
// ---------------------------------------------------------------------------
// Service role only, checked before anything else runs. Both queues are views
// granted to service_role alone — authenticated and anon are revoked — so the
// GRANTs are the real defence and the check below is the first line of it,
// exactly as in send-push.
// ============================================================================

const STRIPE_API = 'https://api.stripe.com';

// Bound the work per invocation so a backlog cannot run past the Edge Function
// execution limit — the next five-minute tick picks up the remainder. Each row
// is one sequential provider call; parallelising them would trade rate-limit
// headroom and clean per-row failure isolation for wall clock this queue does
// not need.
const QUEUE_LIMIT = 25;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

type TransferRow = {
  id: string;
  payee_id: string;
  transfer_cents: number | null;
  transfer_attempts: number | null;
};

type RefundRow = {
  id: string;
  provider_ref: string | null;
  refund_cents: number | null;
};

type Tally = {
  attempted: number;
  succeeded: number;
  failed: number;
  /** Amount null or not positive: D1 forbids substituting a computed one. */
  defects: number;
  /** Nothing to send to: no connected account, or no charge to refund. */
  blocked: number;
};

const tally = (): Tally => ({ attempted: 0, succeeded: 0, failed: 0, defects: 0, blocked: 0 });

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serviceHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function getRows<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: serviceHeaders() });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? (rows as T[]) : [];
}

async function stripe(
  path: string,
  fields: Record<string, string>,
  idempotencyKey: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': idempotencyKey,
    },
    body: new URLSearchParams(fields).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

function providerError(body: Record<string, unknown>): string {
  const error = body.error as { message?: string; code?: string } | undefined;
  return error?.message ?? error?.code ?? JSON.stringify(body).slice(0, 200);
}

/** A positive integer number of cents, or null. Never coerced, never defaulted. */
function cents(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Pass one: money out to the worker.
// ---------------------------------------------------------------------------
async function runTransfers(): Promise<Tally> {
  const counts = tally();
  const rows = await getRows<TransferRow>(
    `transfers_due?select=id,payee_id,transfer_cents,transfer_attempts&limit=${QUEUE_LIMIT}`
  );
  if (rows.length === 0) return counts;

  // One lookup for the whole batch rather than one per row. A payee with no
  // connected account yet cannot be paid; that is onboarding's job, not this
  // function's, and the row simply waits.
  const payees = [...new Set(rows.map((r) => r.payee_id).filter(Boolean))];
  const accounts = new Map<string, string>();
  if (payees.length > 0) {
    const list = await getRows<{ user_id: string; stripe_account_id: string | null }>(
      `payment_accounts?select=user_id,stripe_account_id&user_id=in.(${payees.map(encodeURIComponent).join(',')})`
    );
    for (const row of list) {
      if (row.stripe_account_id) accounts.set(row.user_id, row.stripe_account_id);
    }
  }

  for (const row of rows) {
    // FAILURE ISOLATION: one row that throws must not abort this pass, the
    // other pass, or the summary. It is logged and left in the queue.
    try {
      const amount = cents(row.transfer_cents);
      if (amount === null) {
        counts.defects++;
        console.error(`process-settlements: payment ${row.id} is in transfers_due with transfer_cents=${String(row.transfer_cents)} — skipped, nothing computed in its place`);
        continue;
      }

      const destination = accounts.get(row.payee_id);
      if (!destination) {
        counts.blocked++;
        console.error(`process-settlements: payment ${row.id} — payee has no connected account yet, left in the queue`);
        continue;
      }

      counts.attempted++;
      // The counter is part of the key, so a reversed transfer that
      // resolve_job_dispute re-opens gets a NEW key and a real second transfer
      // rather than the reversed one played back.
      const attempts = row.transfer_attempts ?? 0;
      const result = await stripe(
        '/v1/transfers',
        {
          amount: String(amount),
          currency: 'usd',
          destination,
          'metadata[payment_id]': row.id,
        },
        `tr:${row.id}:${attempts}`
      );

      if (result.ok) {
        counts.succeeded++;
      } else {
        counts.failed++;
        console.error(`process-settlements: transfer for payment ${row.id} failed ${result.status}: ${providerError(result.body)}`);
      }
    } catch (err) {
      counts.failed++;
      console.error(`process-settlements: transfer for payment ${row.id} threw:`, err);
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Pass two: money back to the customer.
// ---------------------------------------------------------------------------
async function runRefunds(): Promise<Tally> {
  const counts = tally();
  const rows = await getRows<RefundRow>(
    `refunds_due?select=id,provider_ref,refund_cents&limit=${QUEUE_LIMIT}`
  );

  for (const row of rows) {
    try {
      const amount = cents(row.refund_cents);
      if (amount === null) {
        counts.defects++;
        console.error(`process-settlements: payment ${row.id} is in refunds_due with refund_cents=${String(row.refund_cents)} — skipped, nothing computed in its place`);
        continue;
      }

      if (!row.provider_ref) {
        counts.blocked++;
        console.error(`process-settlements: payment ${row.id} has a refund due but no provider reference to refund against, left in the queue`);
        continue;
      }

      counts.attempted++;
      // There is no refund attempt counter on payments, so the key is the
      // payment id alone — which is exactly right: one refund per ledger row,
      // and a repeat inside the window returns that same refund.
      const result = await stripe(
        '/v1/refunds',
        {
          payment_intent: row.provider_ref,
          amount: String(amount),
          'metadata[payment_id]': row.id,
        },
        `rf:${row.id}`
      );

      if (result.ok) {
        counts.succeeded++;
      } else {
        counts.failed++;
        console.error(`process-settlements: refund for payment ${row.id} failed ${result.status}: ${providerError(result.body)}`);
      }
    } catch (err) {
      counts.failed++;
      console.error(`process-settlements: refund for payment ${row.id} threw:`, err);
    }
  }

  return counts;
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_SECRET_KEY) {
    console.error('process-settlements: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY not set');
    return json({ error: 'not configured' }, 500);
  }

  // Before anything else. Supabase's own verify_jwt would accept any signed-in
  // user's token, so this comparison — not that gate — is what keeps ordinary
  // users out of the money queues.
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_KEY}`) {
    return json({ error: 'forbidden' }, 403);
  }

  // Transfers first, then refunds. Each pass is independent: a pass that throws
  // outright still leaves the other's counts in the summary, because the
  // summary is what the operator reads when something looks wrong.
  let transfers = tally();
  let refunds = tally();
  const errors: string[] = [];

  try {
    transfers = await runTransfers();
  } catch (err) {
    errors.push(`transfers: ${err instanceof Error ? err.message : String(err)}`);
    console.error('process-settlements: transfers pass failed', err);
  }

  try {
    refunds = await runRefunds();
  } catch (err) {
    errors.push(`refunds: ${err instanceof Error ? err.message : String(err)}`);
    console.error('process-settlements: refunds pass failed', err);
  }

  return json({
    ok: errors.length === 0,
    limit: QUEUE_LIMIT,
    transfers,
    refunds,
    ...(errors.length > 0 ? { errors } : {}),
  });
});
