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
// between two constant pages by comparison (page.mjs). Both pages send the
// worker to <scheme>://payouts and say nothing about the payout state; the
// app calls connect-status on return for the truth.
//
// The refresh page cannot mint a new link (no session), so it tells the
// worker to reopen BRAZOS and tap Set up payouts again.
//
// The scheme literal below is copied from app.config.ts (`scheme`);
// tests/connect.test.mjs holds the two equal.
// ============================================================================

import { bouncePage, PAGE_HEADERS } from './page.mjs';

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
  // A Headers object, not a spread: probed 2026-08-30, the DEPLOYED function served this body as text/plain while PAGE_HEADERS in source says text/html (R6b D9).
  return new Response(bouncePage(refresh, APP_SCHEME), {
    status: 200,
    headers: new Headers(PAGE_HEADERS),
  });
});
