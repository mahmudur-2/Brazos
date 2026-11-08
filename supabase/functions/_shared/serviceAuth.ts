// The service-role gate for the functions the database wakes (send-push, send-receipts,
// process-settlements). verify_jwt alone would admit any signed-in user's token, so this check is
// what keeps ordinary users out. Constant-time: the lean security verdict B3 (archived: _archive/2026-11-lean/SECURITY-VERDICT.md).
import { timingSafeEqual } from 'https://deno.land/std@0.224.0/crypto/timing_safe_equal.ts';

const encoder = new TextEncoder();

function refuse(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** null when the request is a POST carrying `Bearer <serviceKey>`; otherwise the 405 or 403 to send. */
export function requireServiceRole(req: Request, serviceKey: string): Response | null {
  if (req.method !== 'POST') return refuse('method not allowed', 405);

  const given = encoder.encode(req.headers.get('Authorization') ?? '');
  const expected = encoder.encode(`Bearer ${serviceKey}`);
  // A wrong length still runs one full-length compare (against zeros), so timing never tells.
  const sameLength = given.byteLength === expected.byteLength;
  const equal = timingSafeEqual(sameLength ? given : new Uint8Array(expected.byteLength), expected);
  return sameLength && equal ? null : refuse('forbidden', 403);
}
