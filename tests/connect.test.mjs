import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DUE_STATUSES,
  PAYOUT_STATUSES,
  classifyAccount,
} from '../supabase/functions/connect-status/classify.mjs';
import {
  PAGE_HEADERS,
  bouncePage,
  payoutsHref,
  refreshPage,
  returnPage,
} from '../supabase/functions/connect-return/page.mjs';

// ---------------------------------------------------------------------------
// The two parts of the Connect functions a test in this repository can execute
// ---------------------------------------------------------------------------
//
// connect-onboarding, connect-status and connect-return are Deno and nothing
// here runs Deno, so the handlers are unproven by any harness — said so in the
// run report rather than papered over. Two pieces are different: the
// CLASSIFICATION of a provider account into the one app-facing payout state,
// and the BOUNCE PAGES the return function serves. Both are pure, both live in
// their own .mjs files, and both are imported unchanged by the Deno function
// and by this file — the shape stripeWebhookSignature.test.mjs established.
//
// THE LIMIT OF THIS PROOF, stated plainly: the fixtures below are the account
// shape AS THE REFERENCE DOCUMENTS IT (requirements.entries[].minimum_deadline
// .status and requirements.summary.minimum_deadline.status are verified
// against docs.stripe.com; the recipient capability path is the pinned shape).
// The first real test-mode account is what closes that gap.

const SCHEME = 'brazos';

/** A provider account in the shape the retrieve call returns. */
const account = ({ capability, entries, summary, requirements } = {}) => ({
  id: 'acct_1R5bTestOnly',
  object: 'v2.core.account',
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: {
          stripe_transfers: { status: capability, status_details: [] },
        },
      },
    },
  },
  requirements:
    requirements !== undefined
      ? requirements
      : {
          entries: entries ?? [],
          summary: summary ?? { minimum_deadline: null },
        },
});

const entry = (status) => ({
  awaiting_action_from: 'user',
  description: 'representative.verification.document',
  minimum_deadline: { status, time: null },
  errors: [],
});

test('0 · the vocabulary is the database’s: four states, two due deadlines', () => {
  assert.deepEqual([...PAYOUT_STATUSES], ['none', 'action_needed', 'under_review', 'enabled']);
  assert.deepEqual([...DUE_STATUSES], ['currently_due', 'past_due']);
});

test('1 · an active stripe_transfers capability is enabled, whatever else is pending', () => {
  assert.equal(classifyAccount(account({ capability: 'active' })), 'enabled');
  // Requirements that are only eventually due do not un-enable an active account.
  assert.equal(
    classifyAccount(account({ capability: 'active', entries: [entry('eventually_due')] })),
    'enabled'
  );
});

test('2 · a pending capability with nothing due is under_review', () => {
  assert.equal(classifyAccount(account({ capability: 'pending' })), 'under_review');
  assert.equal(
    classifyAccount(account({ capability: 'pending', entries: [entry('eventually_due')] })),
    'under_review'
  );
  // entries absent but requirements present: nothing is due.
  assert.equal(
    classifyAccount(account({ capability: 'pending', requirements: { summary: null } })),
    'under_review'
  );
});

test('3 · a currently_due or past_due requirement, or a restricted capability, is action_needed', () => {
  assert.equal(
    classifyAccount(account({ capability: 'pending', entries: [entry('currently_due')] })),
    'action_needed'
  );
  assert.equal(
    classifyAccount(account({ capability: 'pending', entries: [entry('eventually_due'), entry('past_due')] })),
    'action_needed'
  );
  // The summary alone is enough — it is the strictest status across entries.
  assert.equal(
    classifyAccount(
      account({ capability: 'pending', entries: [], summary: { minimum_deadline: { status: 'past_due', time: null } } })
    ),
    'action_needed'
  );
  // Restricted with an empty requirements list still needs the worker.
  assert.equal(classifyAccount(account({ capability: 'restricted' })), 'action_needed');
  // Paired control on the same fixture with the due entry removed.
  assert.equal(
    classifyAccount(account({ capability: 'pending', entries: [entry('eventually_due')] })),
    'under_review'
  );
});

test('4 · an unrecognised shape is action_needed and never enabled', () => {
  const shapes = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'active'],
    ['an array', []],
    ['an empty object', {}],
    ['no recipient configuration', { configuration: {}, requirements: { entries: [] } }],
    ['a capability with no status', { configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: {} } } } }, requirements: { entries: [] } }],
    ['a non-string capability status', account({ capability: true })],
    ['a pending capability with requirements missing', account({ capability: 'pending', requirements: null })],
    ['a pending capability with entries that are not a list', account({ capability: 'pending', requirements: { entries: 'currently_due' } })],
    ['an unknown capability status with requirements missing', account({ capability: 'unsupported', requirements: null })],
  ];
  for (const [label, shape] of shapes) {
    const result = classifyAccount(shape);
    assert.equal(result, 'action_needed', `${label} must classify as action_needed`);
    assert.notEqual(result, 'enabled', `${label} must never classify as enabled`);
  }
});

test('5 · every result is one of the states the database admits', () => {
  const results = [
    classifyAccount(account({ capability: 'active' })),
    classifyAccount(account({ capability: 'pending' })),
    classifyAccount(account({ capability: 'restricted' })),
    classifyAccount(account({ capability: 'unsupported' })),
    classifyAccount({}),
  ];
  for (const result of results) {
    assert.ok(PAYOUT_STATUSES.includes(result), `${result} is not a payouts_status`);
    assert.notEqual(result, 'none', 'none means no account; an account never classifies as none');
  }
});

test('6 · both pages carry the scheme anchor, and the script sends the browser to the same place', () => {
  const returned = returnPage(SCHEME);
  const refreshed = refreshPage(SCHEME);
  assert.ok(returned.includes('<a href="brazos://payouts?from=return">'), 'the return page links into the app');
  assert.ok(returned.includes('location.href = "brazos://payouts?from=return";'), 'and its script goes there too');
  assert.ok(refreshed.includes('<a href="brazos://payouts?from=refresh">'), 'the refresh page links into the app');
  assert.ok(refreshed.includes('location.href = "brazos://payouts?from=refresh";'), 'and its script goes there too');
  assert.equal(payoutsHref(SCHEME, 'return'), 'brazos://payouts?from=return');
  assert.notEqual(returned, refreshed, 'the two pages differ');
  assert.ok(refreshed.includes('Set up payouts again'), 'the refresh page tells the worker how to get a fresh link');
  for (const page of [returned, refreshed]) {
    assert.ok(page.startsWith('<!doctype html>'), 'a complete document');
    assert.ok(page.includes('<meta charset="utf-8">'), 'declaring its charset');
    assert.ok(!/<(script|link|img|iframe)[^>]*\s(src|href)=["']https?:/i.test(page), 'and no external resource');
  }
});

test('7 · the bounce selects by the refresh flag and never echoes a request value', () => {
  assert.equal(bouncePage('1', SCHEME), refreshPage(SCHEME), '?refresh=1 is the refresh page');
  assert.equal(bouncePage(null, SCHEME), returnPage(SCHEME), 'no flag is the return page');
  assert.equal(bouncePage(undefined, SCHEME), returnPage(SCHEME));
  assert.equal(bouncePage('0', SCHEME), returnPage(SCHEME));
  assert.equal(bouncePage('true', SCHEME), returnPage(SCHEME));

  const hostile = [
    '1<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    '1&account=acct_forged',
    'brazos://payouts?from=attacker',
  ];
  for (const value of hostile) {
    const page = bouncePage(value, SCHEME);
    assert.ok(!page.includes(value), `the page must not contain the request value ${JSON.stringify(value)}`);
    assert.ok(
      page === returnPage(SCHEME) || page === refreshPage(SCHEME),
      'and must be exactly one of the two constant pages'
    );
    // Only the exact string '1' selects the refresh page.
    assert.equal(page, returnPage(SCHEME));
  }
});

test('8 · the headers are text/html; charset=utf-8 and no-store', () => {
  assert.equal(PAGE_HEADERS['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(PAGE_HEADERS['Cache-Control'], 'no-store');
  assert.ok(Object.isFrozen(PAGE_HEADERS), 'and nothing can add to them at runtime');
});

test('9 · a scheme that is not a plain URL scheme is refused, not rendered', () => {
  for (const bad of ['', 'Brazos', 'brazos://', 'javascript:', '"><script>', 'br azos', 42, null, undefined]) {
    assert.throws(() => returnPage(bad), /plain URL scheme/, `${JSON.stringify(bad)} must be refused`);
    assert.throws(() => refreshPage(bad), /plain URL scheme/);
  }
  // Paired control: the real scheme renders.
  assert.ok(returnPage(SCHEME).length > 0);
});

test('10 · the scheme literal in connect-return is the one app.config.ts declares', () => {
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const appConfig = read('../app.config.ts').match(/^\s*scheme:\s*'([^']+)'/m);
  const bounce = read('../supabase/functions/connect-return/index.ts').match(/^const APP_SCHEME = '([^']+)';/m);
  assert.ok(appConfig, 'app.config.ts declares a scheme');
  assert.ok(bounce, 'connect-return declares APP_SCHEME');
  assert.equal(bounce[1], appConfig[1], 'the two literals are equal');
  assert.equal(bounce[1], SCHEME, 'and this file tests that literal');
});

test('11 · the bounce hands PAGE_HEADERS to the Response as a constructed Headers object, and that object still says text/html', () => {
  // R6b D9: the DEPLOYED function was probed on 2026-08-30 serving the
  // correct body as text/plain — Deno's default when no Content-Type reaches
  // the Response — while PAGE_HEADERS in source has said text/html since R5b
  // (test 8). The one code-side variable, a plain-object spread of a frozen
  // object as header init, is replaced by a constructed Headers object.
  // Executed: that construction, under node's Headers.
  const headers = new Headers(PAGE_HEADERS);
  assert.equal(headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(headers.get('cache-control'), 'no-store');
  assert.equal([...headers.keys()].length, 2, 'and nothing else');
  // Raw text: index.ts constructs Headers from PAGE_HEADERS and no longer
  // spreads it.
  const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
  const bounce = read('../supabase/functions/connect-return/index.ts');
  assert.match(bounce, /headers: new Headers\(PAGE_HEADERS\),/, 'index.ts constructs a Headers object from PAGE_HEADERS');
  assert.ok(!/\{\s*\.\.\.PAGE_HEADERS\s*\}/.test(bounce), 'and no longer spreads it into a plain object');
  assert.match(bounce, /text\/plain/, 'and names the live text/plain observation it answers');
});
