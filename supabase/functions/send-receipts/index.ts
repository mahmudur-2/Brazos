// ============================================================================
// Brazos · send-receipts  (Supabase Edge Function, Deno)
//
// Idea 8 (docs/DECISIONS.md 2026-09-30 entry (4)): after a release, the customer and the worker each
// get a receipt by email. Drains public.receipt_outbox (migration 20260930001100), which the payments
// trigger fills the moment a job payment reaches 'released'. Woken every five minutes by pg_cron
// through public.drain_receipts(), and only when a receipt is waiting.
//
//   Deploy:  the staging pipeline deploys every function (.github/workflows/staging.yml)
//   Invoke:  curl -X POST "$SUPABASE_URL/functions/v1/send-receipts" \
//              -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//
// ---------------------------------------------------------------------------
// THE EMAIL SERVICE, AND ITS KEY
// ---------------------------------------------------------------------------
// Brazos's own email, sent through an email service's HTTP API with plain fetch — no npm package
// (the build run's brief). The service is Resend (POST https://api.resend.com/emails). Its key is a
// secret only the operator places on the project:
//
//   RESEND_API_KEY    the service's key. UNTIL IT EXISTS, every receipt is resolved 'skipped' with
//                     the reason, and logged — nothing waits to go out days later.
//   RECEIPT_FROM      the sender, e.g. "Brazos <receipts@your-domain>". Without a domain the
//                     service's testing sender "Brazos <onboarding@resend.dev>" is used, which only
//                     delivers to the service account's own address — real customers need a domain.
//   RECEIPT_REPLY_TO  where "Reply to this email" goes (the support inbox). Optional; without it a
//                     reply goes to the sender.
//   RECEIPT_TEST_TO   while testing: EVERY receipt goes to this one address instead, its subject
//                     marked [Test]. Remove it for real customers.
//
// ---------------------------------------------------------------------------
// NO EDGE FUNCTION COMPUTES A MONETARY AMOUNT
// ---------------------------------------------------------------------------
// Every amount printed comes from receipt_details(), which reads the payments row verbatim
// (receipt.mjs formats it and nothing more). "Paid with" is the provider's own card brand and last
// four, read from the PaymentIntent; when that read fails the line is left out, never guessed.
//
// ---------------------------------------------------------------------------
// SECURITY
// ---------------------------------------------------------------------------
// Service role only, checked before anything else runs — exactly as send-push and
// process-settlements. The outbox and all three RPCs (claim_receipt_batch, resolve_receipt,
// receipt_details) are granted to service_role alone; the GRANTs are the real defence. The
// recipient's address is read from the auth admin API with the service key and never logged.
// ============================================================================

import { buildReceipt, cardLabel } from './receipt.mjs';

const RESEND_URL = 'https://api.resend.com/emails';
const STRIPE_API = 'https://api.stripe.com';

// Receipts claimed per pass, and passes per invocation — bounded so a backlog never runs past the
// function's limit; the next five-minute tick takes the rest.
const CLAIM_SIZE = 20;
const MAX_PASSES = 5;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RECEIPT_FROM = Deno.env.get('RECEIPT_FROM') || 'Brazos <onboarding@resend.dev>';
const RECEIPT_REPLY_TO = Deno.env.get('RECEIPT_REPLY_TO') ?? '';
const RECEIPT_TEST_TO = Deno.env.get('RECEIPT_TEST_TO') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

type ReceiptRow = {
  id: string;
  payment_id: string;
  job_id: string;
  recipient_id: string;
  role: 'customer' | 'worker';
  attempts: number;
};

type Status = 'pending' | 'sent' | 'skipped' | 'failed';

function serviceHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

function resolve(row: ReceiptRow, status: Status, error: string | null, providerRef: string | null = null) {
  return rpc<null>('resolve_receipt', {
    p_id: row.id,
    p_status: status,
    p_error: error,
    p_provider_ref: providerRef,
  });
}

/** The account's email address, from the auth admin API; null when it has none (a phone sign-up). */
async function recipientEmail(userId: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: serviceHeaders(),
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { email?: string | null };
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return email.includes('@') ? email : null;
}

/** "Visa ···· 4242" from the PaymentIntent's charge; null on any failure — the line is left out. */
async function paidWith(paymentIntentId: string): Promise<string | null> {
  if (!STRIPE_SECRET_KEY || !/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) return null;
  try {
    const res = await fetch(
      `${STRIPE_API}/v1/payment_intents/${paymentIntentId}?expand[]=latest_charge`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    if (!res.ok) return null;
    const intent = (await res.json()) as {
      latest_charge?: { payment_method_details?: { card?: { brand?: string; last4?: string } } };
    };
    const card = intent.latest_charge?.payment_method_details?.card;
    return cardLabel(card?.brand, card?.last4);
  } catch {
    return null;
  }
}

async function sendOne(row: ReceiptRow): Promise<Status> {
  if (!RESEND_API_KEY) {
    // Skipped and logged until the operator places the key (the build run's brief).
    console.log(`[send-receipts] ${row.id}: skipped — RESEND_API_KEY is not set on this project`);
    await resolve(row, 'skipped', 'no email service key on this project yet');
    return 'skipped';
  }

  const details = await rpc<Record<string, unknown> | null>('receipt_details', { p_payment_id: row.payment_id });
  if (!details) {
    await resolve(row, 'failed', 'the payment is gone');
    return 'failed';
  }

  const to = RECEIPT_TEST_TO || (await recipientEmail(row.recipient_id));
  if (!to) {
    await resolve(row, 'skipped', 'no email address on the account');
    return 'skipped';
  }

  const card =
    row.role === 'customer' && details.provider === 'stripe' && typeof details.provider_ref === 'string'
      ? await paidWith(details.provider_ref)
      : null;

  let message: { subject: string; html: string; text: string };
  try {
    message = buildReceipt(details, row.role, { card });
  } catch (err) {
    // A receipt missing what it must say is never sent.
    await resolve(row, 'failed', `receipt could not be built: ${err instanceof Error ? err.message : String(err)}`);
    return 'failed';
  }

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      // One receipt per outbox row, even when a timeout makes this tick send it again.
      'Idempotency-Key': `receipt-${row.id}`,
    },
    body: JSON.stringify({
      from: RECEIPT_FROM,
      to: [to],
      subject: RECEIPT_TEST_TO ? `[Test] ${message.subject}` : message.subject,
      html: message.html,
      text: message.text,
      ...(RECEIPT_REPLY_TO ? { reply_to: [RECEIPT_REPLY_TO] } : {}),
    }),
  });

  if (res.ok) {
    const sent = (await res.json().catch(() => ({}))) as { id?: string };
    await resolve(row, 'sent', null, typeof sent.id === 'string' ? sent.id : null);
    return 'sent';
  }

  const detail = `email service ${res.status}: ${(await res.text()).slice(0, 300)}`;
  // A refusal (4xx, not a rate limit) will be refused again: final. Anything else is retried by the
  // next tick, until the fifth attempt makes it final (resolve_receipt).
  const final = res.status >= 400 && res.status < 500 && res.status !== 429;
  await resolve(row, final ? 'failed' : 'pending', detail);
  return final ? 'failed' : 'pending';
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Only the service role may drain the outbox — verify_jwt alone would admit any signed-in user.
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const totals: Record<Status | 'claimed', number> = { claimed: 0, sent: 0, skipped: 0, failed: 0, pending: 0 };
  try {
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const rows = (await rpc<ReceiptRow[]>('claim_receipt_batch', { p_limit: CLAIM_SIZE })) ?? [];
      totals.claimed += rows.length;
      for (const row of rows) {
        try {
          totals[await sendOne(row)]++;
        } catch (err) {
          // One receipt's trouble never stops the others; it stays pending for the next tick.
          totals.pending++;
          await resolve(row, 'pending', err instanceof Error ? err.message : String(err)).catch(() => {});
        }
      }
      if (rows.length < CLAIM_SIZE) break;
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err), totals }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, ...totals }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
