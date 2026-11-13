// ============================================================================
// Brazos · connect-return  (Supabase Edge Function, Deno)
//
// The HTTPS bounce at the end of hosted payout onboarding. The provider sends
// the worker's browser here — as return_url when onboarding finishes, as
// refresh_url (?refresh=1) when the single-use link has expired — and this
// function hands the browser straight back to the app.
//
//   Deploy:  the staging pipeline deploys every function directory on push.
//
// ---------------------------------------------------------------------------
// STATELESS, UNAUTHENTICATED, CONSTANT — ON PURPOSE (R5b D4)
// ---------------------------------------------------------------------------
// A bounce cannot authenticate anyone: the browser session that arrives here
// is the provider's, not a BRAZOS session, so config.toml sets
// verify_jwt = false for this function alone. Because nobody is
// authenticated, nothing here may act: the response carries no account id,
// no token, no query from the provider, and NOTHING FROM THE REQUEST is
// interpolated into it — the one request value read, ?refresh, selects
// between two constant destinations by comparison (page.mjs). The answer is
// an HTTP 302 to <scheme>://payouts?from=return|refresh and says nothing
// about the payout state; the app calls connect-status on return for the
// truth, and on ?from=refresh mints a fresh link.
//
// The scheme literal below is copied from app.config.ts (`scheme`);
// tests/connect.test.mjs holds the two equal.
// ============================================================================

import { bounce } from './page.mjs';

/** app.config.ts → scheme. The only value this function carries. */
const APP_SCHEME = 'brazos';

Deno.serve((req) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET' },
    });
  }

  const refresh = new URL(req.url).searchParams.get('refresh');
  // A 302 with no body, not a page: Supabase serves HTML as text/plain, so the page's redirect script never ran (production, 2026-11-13).
  const { status, headers } = bounce(refresh, APP_SCHEME);
  return new Response(null, { status, headers: new Headers(headers) });
});
