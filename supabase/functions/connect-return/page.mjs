// ============================================================================
// Brazos · connect-return / page.mjs
//
// The constant redirect the hosted-onboarding bounce answers. Pure: no
// imports, no I/O — tests/connect.test.mjs executes it under node and the
// Deno function imports it unchanged.
//
// STATELESS BY DESIGN (R5b D4). The provider sends the worker's browser back
// here when hosted onboarding finishes (return_url) or when its single-use
// link has expired (refresh_url). A bounce cannot authenticate anyone, so it
// carries no account id, no token, no query from the provider, and it
// interpolates NOTHING from the request: every byte of the answer is decided
// by this file plus the app scheme literal the caller passes in. The app then
// calls connect-status for the truth, and on ?from=refresh mints a fresh link.
//
// An HTTP 302, not a page: Supabase serves HTML from *.supabase.co as
// text/plain, so a page's redirect script never ran (seen on production
// 2026-11-13). Safari follows a 302 to the app scheme with no page at all.
// ============================================================================

/** A plain URL scheme (RFC 3986 §3.1), lowercase. The one input this module
 * accepts — and it is a compile-time literal in the caller, never a request
 * value — so anything else is a programming error, refused rather than
 * sent. */
const SCHEME_SHAPE = /^[a-z][a-z0-9+.-]*$/;

/** The in-app destination the bounce sends the worker to. */
export function payoutsHref(scheme, from) {
  if (typeof scheme !== 'string' || !SCHEME_SHAPE.test(scheme)) {
    throw new Error('connect-return: the app scheme must be a plain URL scheme');
  }
  return `${scheme}://payouts?from=${from}`;
}

/**
 * The answer to a GET. Picks the destination from the one request value the
 * function reads — the `refresh` query parameter — by COMPARISON only; the
 * value itself never reaches the answer. no-store: a bounce is never worth
 * caching, and a cached copy could outlive a scheme change.
 *
 * @param {string | null | undefined} refreshParam  `?refresh=` as received
 * @param {string} scheme  the app scheme literal
 */
export function bounce(refreshParam, scheme) {
  return {
    status: 302,
    headers: Object.freeze({
      Location: payoutsHref(scheme, refreshParam === '1' ? 'refresh' : 'return'),
      'Cache-Control': 'no-store',
    }),
  };
}
