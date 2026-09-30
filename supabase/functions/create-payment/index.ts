// ============================================================================
// Brazos · create-payment  (Supabase Edge Function, Deno)
//
// The customer taps "protect this payment". This function starts the provider
// side of a job payment that is already held in protection by the database,
// and hands the client the three short-lived strings its payment sheet needs.
//
//   Deploy:  npx supabase functions deploy create-payment
//
// ---------------------------------------------------------------------------
// NO EDGE FUNCTION COMPUTES A MONETARY AMOUNT
// ---------------------------------------------------------------------------
// The one number this function sends to the provider is charge_amount_cents,
// read VERBATIM from the payments row begin_job_payment() returned. That column
// is GENERATED in the database as amount_cents + customer_fee_cents +
// tax_cents, so it cannot drift from the ledger. If it is null or not a
// positive integer this function refuses — it never substitutes a computed one.
// A cent derived in this file would be a defect even if it produced the right
// answer.
//
// ---------------------------------------------------------------------------
// WHO IS ALLOWED — TWO DIFFERENT CREDENTIALS, ON PURPOSE
// ---------------------------------------------------------------------------
// begin_job_payment() runs AS THE CALLER: the caller's own Authorization
// header is forwarded to PostgREST with the ANON key as apikey, so the database
// sees the real user and its own checks decide whether this person may pay for
// this job. This function holds no authority over that and must not: it never
// calls that RPC with the service key.
//
// attach_provider_ref() and the customer reference are service_role, because
// they are writes no client may make. config.toml keeps verify_jwt = true here,
// so the platform has already rejected an unauthenticated caller before this
// code runs — but the RPC grants are the real defence, as always.
//
// ---------------------------------------------------------------------------
// WHY A STORED CUSTOMER REFERENCE AND NOT AN IDEMPOTENCY KEY
// ---------------------------------------------------------------------------
// A provider idempotency key expires after roughly 24 hours. Keyed on the user
// id it would return the same customer for a day and then silently mint a new
// one — a fresh customer, and every saved card gone, every day. Only a stored
// reference gives durable reuse, so the id lives on
// payment_accounts.stripe_customer_id (RLS on, no policies, no client grants)
// and is reached through get_payment_customer / set_payment_customer. The
// idempotency key below is still sent, but only as a short-window guard
// against a double tap.
//
// WHY plain fetch: same reason as send-push. No SDK, no import map, no version
// drift. Every provider call here is form-encoded.
//
// ---------------------------------------------------------------------------
// THE TIP (R6c, D4) — the same function, one extra body field
// ---------------------------------------------------------------------------
// A body carrying tipAmountCents (or tip_amount_cents), an integer number of
// cents greater than zero, starts a TIP instead of the job payment: the one
// difference is which RPC the database decides with — begin_tip_payment(),
// called AS THE CALLER exactly as begin_job_payment() is, with the caller's
// own token and the anon key. begin_tip_payment() enforces the kill switch,
// ownership, that the job is completed, that the job payment released first,
// one tip per job and both tip ceilings — and its refusals are passed through
// verbatim, as the job path's are. Everything after step 1 is shared and
// unchanged: the customer, the ephemeral key, the intent for the tip row's
// own charge_amount_cents under brazos-intent-<its own id>, the provider ref,
// and the same four-string response. A body without the field is the job
// path, byte for byte. A malformed tip amount is a 400 before any RPC call.
//
// ---------------------------------------------------------------------------
// IDEA 20 (2026-09-30) — THE SAVED CARD, two more body fields on the job path
// ---------------------------------------------------------------------------
// `saveCard: true` is the customer's own opt-in at Checkout ("Save this card
// for one-tap hiring", off by default): the intent carries
// setup_future_usage=off_session, so the card the sheet takes is kept on the
// provider's customer for later. `saveCard: false` clears it again on an
// intent that already carries it.
//
// `useSavedCard: true` is Confirm on a one-tap hire: the same intent the sheet
// would have used (created or reused under the same idempotency key, with the
// same fields, so Checkout can still take the job over afterwards), confirmed
// off-session with the customer's most recently saved card — no sheet. The
// ledger decides nothing new: begin_job_payment() still decides, as the
// caller, and the webhook still marks the row held. A decline — or a card that
// needs the customer present — answers 402 with `declined: true` and sends the
// customer the push that opens Checkout (enqueue_payment_declined).
// ============================================================================

const STRIPE_API = 'https://api.stripe.com';

// The account's configured API version, taken from the registered webhook
// destination. It is pinned on the ephemeral key ONLY: that key is handed to
// the mobile SDK, which refuses one minted under a version it does not speak.
// R6 NOTE: if the payment sheet rejects the key, this single line is the fix —
// the SDK publishes the version string it expects.
const STRIPE_VERSION = '2026-08-26.dahlia';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

type PaymentRow = {
  id?: string;
  payer_id?: string;
  charge_amount_cents?: number | null;
  provider_ref?: string | null;
};

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

/** A service_role RPC: writes no client may make. */
async function serviceRpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
}

/** A provider call. Form-encoded, always; an idempotency key when one is given. */
async function stripe(
  path: string,
  fields: Record<string, string>,
  idempotencyKey?: string,
  version?: string
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (version) headers['Stripe-Version'] = version;

  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(fields).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

/** A provider read (idea 20): the customer's saved cards. */
async function stripeGet(path: string): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

/** The customer's most recently saved card, or null (idea 20). */
async function latestSavedCard(customerId: string): Promise<string | null> {
  const listed = await stripeGet(`/v1/customers/${encodeURIComponent(customerId)}/payment_methods?type=card&limit=1`);
  const data = listed.ok && Array.isArray(listed.body.data) ? (listed.body.data as Array<{ id?: unknown }>) : [];
  return typeof data[0]?.id === 'string' ? data[0].id : null;
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !STRIPE_SECRET_KEY) {
    console.error('create-payment: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / STRIPE_SECRET_KEY not set');
    return json({ error: 'not configured' }, 500);
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return json({ error: 'Sign in to protect a payment.' }, 401);
  }

  let jobId = '';
  // R6c (D4): present → a tip; absent → the job payment. Validated before any
  // RPC call; the database, not this function, decides everything else.
  let tipAmountCents: number | null = null;
  // Idea 20: the opt-in (true / false / absent = leave the intent as it is) and Confirm.
  let saveCard: boolean | null = null;
  let useSavedCard = false;
  try {
    const body = (await req.json()) as {
      jobId?: string;
      job_id?: string;
      tipAmountCents?: unknown;
      tip_amount_cents?: unknown;
      saveCard?: unknown;
      useSavedCard?: unknown;
    };
    jobId = body.jobId ?? body.job_id ?? '';
    saveCard = typeof body.saveCard === 'boolean' ? body.saveCard : null;
    useSavedCard = body.useSavedCard === true;
    const rawTip = body.tipAmountCents ?? body.tip_amount_cents;
    if (rawTip !== undefined && rawTip !== null) {
      if (typeof rawTip !== 'number' || !Number.isInteger(rawTip) || rawTip <= 0) {
        return json({ error: 'A tip must be a whole number of cents greater than zero.' }, 400);
      }
      tipAmountCents = rawTip;
    }
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }
  if (!jobId) return json({ error: 'A job is required.' }, 400);
  if (tipAmountCents != null && (saveCard != null || useSavedCard)) {
    return json({ error: 'A tip is paid in the sheet.' }, 400);
  }

  try {
    // --- 1. The database decides, as the caller ------------------------------
    // The caller's own token, the anon key as apikey. begin_job_payment()
    // enforces the paymentsEnabled kill switch, that this user owns this job,
    // that a worker is assigned, and that an agreed amount exists — and it
    // returns the unfunded row, creating it if this is the first attempt.
    // With a tip amount, begin_tip_payment() decides instead — same token,
    // same key — and returns the unfunded TIP row (R6c, D4).
    const begun = tipAmountCents != null
      ? await fetch(`${SUPABASE_URL}/rest/v1/rpc/begin_tip_payment`, {
          method: 'POST',
          headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_job_id: jobId, p_amount_cents: tipAmountCents }),
        })
      : await fetch(`${SUPABASE_URL}/rest/v1/rpc/begin_job_payment`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_job_id: jobId }),
    });

    if (!begun.ok) {
      // Its refusals were written in R4 to be read by a person. Pass the
      // message through rather than inventing one on top of it.
      const detail = (await begun.json().catch(() => ({}))) as { message?: string };
      const message = detail.message ?? 'Could not start this payment.';
      const status = begun.status >= 400 && begun.status < 500 ? begun.status : 500;
      console.error(`create-payment: ${tipAmountCents != null ? 'begin_tip_payment' : 'begin_job_payment'} ${begun.status}: ${message}`);
      return json({ error: message }, status);
    }

    const payment = (await begun.json()) as PaymentRow;
    const paymentId = payment.id ?? '';
    const userId = payment.payer_id ?? '';
    const amount = payment.charge_amount_cents;

    if (!paymentId || !userId) {
      throw new Error('begin_job_payment returned no payment row');
    }
    // D1's sanity check. Not a fallback — a refusal.
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      console.error(`create-payment: payment ${paymentId} has no usable charge_amount_cents (${String(amount)})`);
      return json({ error: 'This payment has no amount to charge yet.' }, 409);
    }

    // --- 2. The customer, created once and reused forever --------------------
    const stored = await serviceRpc('get_payment_customer', { p_user_id: userId });
    if (!stored.ok) {
      throw new Error(`get_payment_customer failed: ${stored.status} ${(await stored.text()).slice(0, 200)}`);
    }
    let customerId = (await stored.json()) as string | null;

    if (!customerId) {
      // No email lookup: that would drag in the auth admin surface for a field
      // the provider does not need. The user id is the only metadata sent, and
      // no monetary field is sent at all.
      const created = await stripe(
        '/v1/customers',
        { 'metadata[user_id]': userId },
        `brazos-customer-${userId}`
      );
      if (!created.ok || typeof created.body.id !== 'string') {
        console.error(`create-payment: customer create ${created.status}: ${JSON.stringify(created.body).slice(0, 300)}`);
        return json({ error: 'The payment provider is unavailable right now.' }, 502);
      }
      // set_payment_customer returns the EFFECTIVE id: if another request
      // stored one first, that one comes back and this one is abandoned rather
      // than overwriting it.
      const persisted = await serviceRpc('set_payment_customer', {
        p_user_id: userId,
        p_customer_id: created.body.id,
      });
      if (!persisted.ok) {
        throw new Error(`set_payment_customer failed: ${persisted.status} ${(await persisted.text()).slice(0, 200)}`);
      }
      customerId = (await persisted.json()) as string;
    }

    // --- 3. The ephemeral key ------------------------------------------------
    // No idempotency key here on purpose: this key is short-lived and a replay
    // must mint a fresh one, not return an expired one.
    const ephemeral = await stripe(
      '/v1/ephemeral_keys',
      { customer: customerId },
      undefined,
      STRIPE_VERSION
    );
    if (!ephemeral.ok || typeof ephemeral.body.secret !== 'string') {
      console.error(`create-payment: ephemeral key ${ephemeral.status}: ${JSON.stringify(ephemeral.body).slice(0, 300)}`);
      return json({ error: 'The payment provider is unavailable right now.' }, 502);
    }

    // --- 4. The intent, for exactly what the ledger says ---------------------
    // metadata[payment_id] is load-bearing, not decoration: apply_payment_event
    // resolves an event to a ledger row by metadata.payment_id FIRST, and it is
    // what makes every later event for this charge findable.
    const intent = await stripe(
      '/v1/payment_intents',
      {
        amount: String(amount),
        currency: 'usd',
        customer: customerId,
        'metadata[payment_id]': paymentId,
      },
      `brazos-intent-${paymentId}`
    );
    if (!intent.ok || typeof intent.body.id !== 'string' || typeof intent.body.client_secret !== 'string') {
      console.error(`create-payment: intent ${intent.status}: ${JSON.stringify(intent.body).slice(0, 300)}`);
      return json({ error: 'The payment provider is unavailable right now.' }, 502);
    }

    // --- 5. Record the intent on the ledger row ------------------------------
    // attach_provider_ref only writes where provider_ref is still null, so a
    // retried call that got the same intent back cannot overwrite anything.
    const attached = await serviceRpc('attach_provider_ref', {
      p_payment_id: paymentId,
      p_ref: intent.body.id,
    });
    if (!attached.ok) {
      throw new Error(`attach_provider_ref failed: ${attached.status} ${(await attached.text()).slice(0, 200)}`);
    }
    // The ledger's own intent when it already names one (attach_provider_ref never overwrites).
    const intentId = typeof payment.provider_ref === 'string' && payment.provider_ref ? payment.provider_ref : intent.body.id;

    // --- 6. Idea 20: the opt-in, and Confirm with the saved card -------------
    if (saveCard !== null && !useSavedCard) {
      const wanted = saveCard ? 'off_session' : '';
      const current = typeof intent.body.setup_future_usage === 'string' ? intent.body.setup_future_usage : '';
      if (current !== wanted) {
        // An empty string clears it: the customer turned the opt-in off again.
        const updated = await stripe(`/v1/payment_intents/${encodeURIComponent(intentId)}`, { setup_future_usage: wanted });
        if (!updated.ok) {
          console.error(`create-payment: setup_future_usage ${updated.status}: ${JSON.stringify(updated.body).slice(0, 300)}`);
          return json({ error: 'The payment provider is unavailable right now.' }, 502);
        }
      }
    }
    if (useSavedCard) {
      const card = await latestSavedCard(customerId);
      if (!card) {
        return json({ error: 'No saved card. Protect the payment in Checkout.', code: 'no_saved_card' }, 409);
      }
      const confirmed = await stripe(
        `/v1/payment_intents/${encodeURIComponent(intentId)}/confirm`,
        { payment_method: card, off_session: 'true' },
        `brazos-offsession-${paymentId}-${card}`
      );
      const status = confirmed.body.status;
      if (confirmed.ok && (status === 'succeeded' || status === 'processing' || status === 'requires_capture')) {
        // The webhook marks the row held, exactly as after the sheet; the app watches the ledger.
        return json({ paymentId, confirmed: true });
      }
      // Declined, or the bank wants the customer present: Checkout takes it from here, and the push
      // that opens it goes out in case the customer has already left the app.
      const failure = confirmed.body.error as { code?: string; decline_code?: string } | undefined;
      console.error(`create-payment: off-session confirm ${confirmed.status}: ${failure?.code ?? String(status)}`);
      await serviceRpc('enqueue_payment_declined', { p_payment_id: paymentId }).catch(() => null);
      return json({ error: 'Your card was declined. Protect the payment in Checkout.', declined: true }, 402);
    }

    // Only what the client needs. Never the API key, never the whole intent,
    // and never an amount — the client reads that from the database.
    return json({
      paymentId,
      customerId,
      clientSecret: intent.body.client_secret,
      ephemeralKeySecret: ephemeral.body.secret,
    });
  } catch (err) {
    console.error('create-payment: unhandled', err);
    return json({ error: 'Could not start this payment.' }, 500);
  }
});
