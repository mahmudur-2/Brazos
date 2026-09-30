// ============================================================================
// Brazos · send-live-cards  (Supabase Edge Function, Deno)
//
// Idea 9 (docs/DECISIONS.md 2026-09-30 entry (4)): the customer's lock-screen card follows the
// worker's stage taps even while the app is closed — by Apple's push service, straight to the card
// (a Live Activity push, per card token). Drains public.live_card_outbox (migration
// 20260930001300), which a jobs trigger fills when a job with a card changes stage; woken every
// minute by pg_cron through public.drain_live_cards(), and only when a row waits.
//
// THE PATH IS OFF UNTIL THE OPERATOR PLACES APPLE'S KEY (the build run's brief): without these
// secrets every row is resolved 'skipped' and logged, and the card still follows the job whenever
// the app is open (hooks/useLiveJobCard.ts).
//
//   APNS_KEY_P8    the .p8 key's contents (-----BEGIN PRIVATE KEY----- …), from Apple Developer →
//                  Keys, with Apple Push Notifications enabled.
//   APNS_KEY_ID    that key's ten-character id.
//   APNS_TEAM_ID   the team id.
//   APNS_TOPIC     optional: the app's bundle id + ".push-type.liveactivity"; the preview (Beta)
//                  build's by default.
//   APNS_HOST      optional: api.push.apple.com (the Beta's, and the store's); a development build
//                  would need api.sandbox.push.apple.com.
//
// WHAT IT SENDS: live_card_state() — THE ONE PLACE the card's words are decided — as the card's
// content-state, and "end" once the job is finished. Nothing here derives a stage.
//
// SECURITY: service role only, checked before anything else runs (as send-push). The outbox, the
// tokens and the calls are service_role alone. The key is never logged.
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APNS_KEY_P8 = Deno.env.get('APNS_KEY_P8') ?? '';
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') ?? '';
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') ?? '';
const APNS_TOPIC = Deno.env.get('APNS_TOPIC') || 'app.brazos.mobile.preview.push-type.liveactivity';
const APNS_HOST = Deno.env.get('APNS_HOST') || 'api.push.apple.com';

const CLAIM_SIZE = 50;
/** How long a finished card stays on the lock screen — the app's FINISHED_WINDOW_MS, in seconds. */
const FINISHED_WINDOW_S = 2 * 60 * 60;

type Row = {
  outbox_id: string;
  job_id: string;
  state: { stage?: string; title?: string; subtitle?: string; progress?: number; ended?: boolean } | null;
  tokens: string[];
};

function rpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
}

function resolve(row: Row, status: 'pending' | 'sent' | 'skipped' | 'failed', error: string | null) {
  return rpc('resolve_live_card', { p_outbox_id: row.outbox_id, p_status: status, p_error: error });
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text64 = (value: string) => base64url(new TextEncoder().encode(value));

/** Apple's provider token: ES256 over {iss, iat}, signed with the .p8 key. */
async function providerToken(): Promise<string> {
  const pem = APNS_KEY_P8.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = text64(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }));
  const claims = text64(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${claims}`))
  );
  return `${head}.${claims}.${base64url(signature)}`;
}

Deno.serve(async (req) => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  const claimed = await rpc('claim_live_card_batch', { p_limit: CLAIM_SIZE });
  if (!claimed.ok) {
    return new Response(JSON.stringify({ error: `claim ${claimed.status}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const rows = ((await claimed.json()) ?? []) as Row[];
  const totals = { claimed: rows.length, sent: 0, skipped: 0, failed: 0, pending: 0 };

  if (!APNS_KEY_P8 || !APNS_KEY_ID || !APNS_TEAM_ID) {
    // Off until the operator places Apple's key (the build run's brief): skipped and logged.
    console.log(`[send-live-cards] ${rows.length} skipped — Apple's push key is not set on this project`);
    for (const row of rows) await resolve(row, 'skipped', 'no Apple push key on this project yet');
    totals.skipped = rows.length;
    return new Response(JSON.stringify({ ok: true, ...totals }), { headers: { 'Content-Type': 'application/json' } });
  }

  let token: string;
  try {
    token = await providerToken();
  } catch (err) {
    console.error('[send-live-cards] the key could not be read', err instanceof Error ? err.message : String(err));
    for (const row of rows) await resolve(row, 'pending', 'the Apple key could not be read');
    totals.pending = rows.length;
    return new Response(JSON.stringify({ ok: false, ...totals }), { headers: { 'Content-Type': 'application/json' } });
  }

  for (const row of rows) {
    if (!row.state || row.tokens.length === 0) {
      await resolve(row, 'skipped', row.state ? 'no card token' : 'the job is no longer live');
      totals.skipped++;
      continue;
    }
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({
      aps: {
        timestamp: now,
        event: row.state.ended ? 'end' : 'update',
        'content-state': {
          title: String(row.state.title ?? ''),
          subtitle: String(row.state.subtitle ?? ''),
          progress: Number(row.state.progress ?? 0),
        },
        // A finished card stays two hours on the lock screen, then goes — as the app keeps it
        // (hooks/useLiveJobCard.ts, FINISHED_WINDOW_MS); a cancelled job's goes at once.
        ...(row.state.ended ? { 'dismissal-date': row.state.stage === 'cancelled' ? now : now + FINISHED_WINDOW_S } : {}),
      },
    });
    let delivered = false;
    let lastError = '';
    let retry = false;
    for (const device of row.tokens) {
      try {
        const res = await fetch(`https://${APNS_HOST}/3/device/${device}`, {
          method: 'POST',
          headers: {
            authorization: `bearer ${token}`,
            'apns-topic': APNS_TOPIC,
            'apns-push-type': 'liveactivity',
            'apns-priority': '10',
            'content-type': 'application/json',
          },
          body: payload,
        });
        if (res.ok) {
          delivered = true;
          continue;
        }
        lastError = `apns ${res.status}: ${(await res.text()).slice(0, 200)}`;
        if (res.status === 429 || res.status >= 500) retry = true;
      } catch (err) {
        lastError = `apns request threw: ${err instanceof Error ? err.message : String(err)}`;
        retry = true;
      }
    }
    if (delivered) {
      await resolve(row, 'sent', null);
      totals.sent++;
    } else {
      await resolve(row, retry ? 'pending' : 'failed', lastError || 'not delivered');
      retry ? totals.pending++ : totals.failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, ...totals }), { headers: { 'Content-Type': 'application/json' } });
});
