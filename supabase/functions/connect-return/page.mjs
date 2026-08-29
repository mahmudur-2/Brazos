// ============================================================================
// Brazos · connect-return / page.mjs
//
// The two constant pages the hosted-onboarding bounce serves. Pure: no
// imports, no I/O — tests/connect.test.mjs executes it under node and the
// Deno function imports it unchanged.
//
// STATELESS BY DESIGN (R5b D4). The provider sends the worker's browser back
// here when hosted onboarding finishes (return_url) or when its single-use
// link has expired (refresh_url). A bounce cannot authenticate anyone, so it
// carries no account id, no token, no query from the provider, and it
// interpolates NOTHING from the request: every byte of both pages is decided
// by this file plus the app scheme literal the caller passes in. The app then
// calls connect-status for the truth — nothing on this page claims a payout
// state.
//
// The refresh page cannot mint a new link (no session), so it tells the
// worker to reopen BRAZOS and tap Set up payouts again; the app mints a fresh
// one.
// ============================================================================

/** A plain URL scheme (RFC 3986 §3.1), lowercase. The one input this module
 * accepts — and it is a compile-time literal in the caller, never a request
 * value — so anything else is a programming error, refused rather than
 * rendered. */
const SCHEME_SHAPE = /^[a-z][a-z0-9+.-]*$/;

/** Headers for both pages. no-store: a bounce is never worth caching, and a
 * cached copy could outlive a scheme change. */
export const PAGE_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
});

/** The in-app destination both pages send the worker to. */
export function payoutsHref(scheme, from) {
  if (typeof scheme !== 'string' || !SCHEME_SHAPE.test(scheme)) {
    throw new Error('connect-return: the app scheme must be a plain URL scheme');
  }
  return `${scheme}://payouts?from=${from}`;
}

function render(scheme, from, title, body) {
  const href = payoutsHref(scheme, from);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex">',
    `<title>${title}</title>`,
    '<style>',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f5f2ea;color:#1f2a24}',
    'main{max-width:22rem;padding:2rem;text-align:center}',
    'h1{font-size:1.25rem;margin:0 0 .75rem}',
    'p{margin:0 0 1.5rem;line-height:1.5}',
    'a{display:inline-block;padding:.85rem 1.5rem;border-radius:999px;background:#1f5f4a;color:#fff;',
    'text-decoration:none;font-weight:600}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    `<h1>${title}</h1>`,
    `<p>${body}</p>`,
    `<a href="${href}">Open BRAZOS</a>`,
    '</main>',
    `<script>location.href = "${href}";</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** The return bounce: onboarding finished, or the worker left it. */
export function returnPage(scheme) {
  return render(
    scheme,
    'return',
    'Back to BRAZOS',
    'You can close this page and return to the app. Your payout setup continues there.'
  );
}

/** The refresh bounce: the single-use link expired before it was used. */
export function refreshPage(scheme) {
  return render(
    scheme,
    'refresh',
    'That link has expired',
    'Reopen BRAZOS and tap Set up payouts again to get a fresh link.'
  );
}

/**
 * Picks the page from the one request value the function reads — the
 * `refresh` query parameter — by COMPARISON only. The value itself never
 * reaches the page.
 *
 * @param {string | null | undefined} refreshParam  `?refresh=` as received
 * @param {string} scheme  the app scheme literal
 */
export function bouncePage(refreshParam, scheme) {
  return refreshParam === '1' ? refreshPage(scheme) : returnPage(scheme);
}
