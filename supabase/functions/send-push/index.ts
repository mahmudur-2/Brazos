// ============================================================================
// Brazos · send-push  (Supabase Edge Function, Deno)
//
// Drains public.notification_outbox and delivers each row through Expo's push
// service. Invoked by pg_cron (see phase20 section 8) or manually.
//
//   Deploy:  npx supabase functions deploy send-push
//   Invoke:  curl -X POST "$SUPABASE_URL/functions/v1/send-push" \
//              -H "Authorization: Bearer $SERVICE_ROLE_KEY"
//
// ---------------------------------------------------------------------------
// WHY PLAIN fetch RATHER THAN supabase-js
// ---------------------------------------------------------------------------
// This talks to exactly three RPCs and one external API. Reaching PostgREST
// directly keeps the function dependency-free — no import-map pinning, no
// version drift between the Deno runtime and an npm client — and matches how
// scripts/verify-schema.mjs already speaks to this database.
//
// ---------------------------------------------------------------------------
// SECURITY
// ---------------------------------------------------------------------------
// Every RPC this calls (claim_notification_batch, resolve_notification,
// deactivate_push_token) is granted to service_role ONLY — `authenticated` is
// explicitly revoked in phase20. So even if this endpoint were reachable by a
// signed-in user, their token could not read the outbox. The guard below is
// the first line of defence, the GRANTs are the real one.
// ============================================================================

import { notConfigured, requireServiceRole, SECRET_KEY, serviceHeaders } from '../_shared/serviceAuth.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo's documented ceiling is 100 messages per request.
const EXPO_MAX_BATCH = 100;
// Outbox rows claimed per pass; claim_notification_batch() also caps at 100.
const CLAIM_SIZE = 100;
// Bound the work per invocation so a large backlog can't run past the Edge
// Function execution limit — the next cron tick picks up the remainder.
const MAX_PASSES = 10;

type ClaimedRow = {
  outbox_id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  tokens: string[];
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

function rpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify(args),
  });
}

/**
 * An Expo message per (outbox row × device token), rather than one message
 * with `to` as an array. Expo expands an array `to` into several tickets, and
 * the response is a flat list — keeping the expansion on this side means the
 * ticket at index i provably belongs to pair i, so a DeviceNotRegistered can
 * be attributed to the exact token that caused it.
 */
type Pair = { row: ClaimedRow; token: string };

function buildMessage({ row, token }: Pair) {
  return {
    to: token,
    title: row.title,
    body: row.body,
    // The tap handler reads this to decide where to navigate.
    data: { ...row.data, type: row.type, outboxId: row.outbox_id },
    sound: 'default',
    // Android needs a channel that the client created with the same id.
    channelId: 'default',
    priority: 'high',
    // 2026-09-30 (idea 6): the push's buttons — a category the app registered (the evening-before
    // reminder's Message / Route) — named by the row; absent, a push has none.
    ...(typeof row.data?.categoryId === 'string' ? { categoryId: row.data.categoryId } : {}),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function runPass(): Promise<{ claimed: number; sent: number; failed: number }> {
  const claimRes = await rpc('claim_notification_batch', { p_limit: CLAIM_SIZE });
  if (!claimRes.ok) {
    throw new Error(`claim_notification_batch failed: ${claimRes.status} ${await claimRes.text()}`);
  }

  const rows = (await claimRes.json()) as ClaimedRow[];
  if (rows.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  // A row whose recipient has no live device can never be delivered. should_notify()
  // already filters these at enqueue time; this catches the race where the last
  // token was revoked between enqueue and drain.
  const deliverable: ClaimedRow[] = [];
  for (const row of rows) {
    if (!row.tokens || row.tokens.length === 0) {
      await rpc('resolve_notification', {
        p_outbox_id: row.outbox_id,
        p_status: 'skipped',
        p_error: 'no active push tokens',
      });
    } else {
      deliverable.push(row);
    }
  }
  if (deliverable.length === 0) {
    return { claimed: rows.length, sent: 0, failed: 0 };
  }

  const pairs: Pair[] = deliverable.flatMap((row) =>
    row.tokens.map((token) => ({ row, token }))
  );

  // Per outbox row: did at least one device accept it, and what went wrong.
  const okByRow = new Map<string, boolean>();
  const errByRow = new Map<string, string>();
  const deadTokens = new Set<string>();

  for (const batch of chunk(pairs, EXPO_MAX_BATCH)) {
    let tickets: ExpoTicket[];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
        },
        body: JSON.stringify(batch.map(buildMessage)),
      });

      if (!res.ok) {
        // Whole batch rejected (rate limit, malformed, Expo outage). Leave the
        // rows pending — claim_notification_batch already incremented attempts,
        // so they retry on the next tick and give up after 5.
        const detail = `expo ${res.status}: ${(await res.text()).slice(0, 300)}`;
        for (const p of batch) errByRow.set(p.row.outbox_id, detail);
        continue;
      }

      const payload = (await res.json()) as { data?: ExpoTicket[] };
      tickets = payload.data ?? [];
    } catch (err) {
      const detail = `expo request threw: ${err instanceof Error ? err.message : String(err)}`;
      for (const p of batch) errByRow.set(p.row.outbox_id, detail);
      continue;
    }

    batch.forEach((pair, i) => {
      const ticket = tickets[i];
      if (ticket && ticket.status === 'ok') {
        okByRow.set(pair.row.outbox_id, true);
        return;
      }
      const code = ticket?.details?.error ?? 'Unknown';
      if (code === 'DeviceNotRegistered') deadTokens.add(pair.token);
      if (!okByRow.get(pair.row.outbox_id)) {
        errByRow.set(pair.row.outbox_id, `${code}: ${ticket?.message ?? 'no ticket returned'}`);
      }
    });
  }

  // The app was uninstalled or the token rotated — stop sending to it. Doing
  // this before resolving rows means a retry of a still-pending row won't try
  // the same dead device again.
  for (const token of deadTokens) {
    await rpc('deactivate_push_token', { p_token: token });
  }

  let sent = 0;
  let failed = 0;
  for (const row of deliverable) {
    const delivered = okByRow.get(row.outbox_id) === true;
    if (delivered) sent++;
    else failed++;

    await rpc('resolve_notification', {
      p_outbox_id: row.outbox_id,
      // Only mark 'failed' once retries are exhausted; otherwise leave it
      // pending so the next tick tries again.
      p_status: delivered ? 'sent' : 'pending',
      p_error: delivered ? null : (errByRow.get(row.outbox_id) ?? 'delivery failed'),
    });
  }

  return { claimed: rows.length, sent, failed };
}

Deno.serve(async (req) => {
  const unset = notConfigured('send-push', { SUPABASE_URL, SECRET_KEY });
  if (unset) return unset;

  // Only the service role may drain the outbox. Supabase's own verify_jwt (if
  // left on) would accept any signed-in user's token, so this comparison — not
  // that gate — is what keeps ordinary users out.
  const refused = requireServiceRole(req);
  if (refused) return refused;

  const totals = { claimed: 0, sent: 0, failed: 0, passes: 0 };
  try {
    for (let i = 0; i < MAX_PASSES; i++) {
      const pass = await runPass();
      totals.claimed += pass.claimed;
      totals.sent += pass.sent;
      totals.failed += pass.failed;
      totals.passes++;
      // Fewer than a full batch means the queue is drained.
      if (pass.claimed < CLAIM_SIZE) break;
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err), totals }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({ ok: true, ...totals }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
