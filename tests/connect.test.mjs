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
import {
  EMAIL_INVALID,
  EMAIL_MISSING,
  PROVIDER_UNAVAILABLE,
  contactEmail,
  createRefusal,
  newAccount,
  withoutEmails,
} from '../supabase/functions/connect-onboarding/account.mjs';

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

// ---------------------------------------------------------------------------
// connect-onboarding / account.mjs — the payout account's create body and the
// contact email Stripe requires with the recipient configuration (a phone
// sign-in has no auth email, so the worker types one on Payouts).
// ---------------------------------------------------------------------------

test('12 · the create body is today’s account plus contact_email, exactly the address given', () => {
  assert.deepEqual(newAccount('worker@example.com'), {
    dashboard: 'express',
    defaults: {
      responsibilities: { fees_collector: 'application', losses_collector: 'application' },
    },
    identity: { country: 'us' },
    configuration: {
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
      },
    },
    contact_email: 'worker@example.com',
  });
  assert.equal(newAccount('other@example.org').contact_email, 'other@example.org');
});

test('13 · the contact email: the typed address (trimmed) wins, else the sign-in email; none or a bad one is refused', () => {
  // Typed, with or without a sign-in email: the typed one, trimmed.
  assert.deepEqual(contactEmail({ email: '  worker@example.com ' }, null), { email: 'worker@example.com' });
  assert.deepEqual(contactEmail({ email: 'typed@example.com' }, 'signin@example.com'), { email: 'typed@example.com' });
  // Nothing typed (an older app sends {}): the verified sign-in email.
  for (const body of [{}, null, undefined, 'text', 42, [], { email: '' }, { email: '   ' }, { email: 42 }, { email: null }]) {
    assert.deepEqual(contactEmail(body, 'signin@example.com'), { email: 'signin@example.com' }, `fallback: ${JSON.stringify(body)}`);
    assert.deepEqual(contactEmail(body, null), { error: EMAIL_MISSING }, `missing: ${JSON.stringify(body)}`);
    assert.deepEqual(contactEmail(body, undefined), { error: EMAIL_MISSING }, `missing (no sign-in email): ${JSON.stringify(body)}`);
  }
  // A typed address that fails the rule is refused, never swapped for the sign-in email.
  for (const bad of ['asdf', 'a@b', 'a b@example.com', 'a@exa mple.com', '@example.com', 'a@.', `${'x'.repeat(243)}@example.com`]) {
    assert.deepEqual(contactEmail({ email: bad }, 'signin@example.com'), { error: EMAIL_INVALID }, `invalid: ${bad}`);
  }
  // 254 characters is the longest accepted.
  const longest = `${'x'.repeat(242)}@example.com`;
  assert.equal(longest.length, 254);
  assert.deepEqual(contactEmail({ email: longest }, null), { email: longest });
  // The sentences: plain, one each, never the provider's name or the 502.
  assert.equal(EMAIL_MISSING, 'Payout setup needs an email address — update Brazos, then try again.');
  assert.equal(EMAIL_INVALID, 'That email address doesn’t look right — check it and try again.');
  for (const sentence of [EMAIL_MISSING, EMAIL_INVALID]) {
    assert.doesNotMatch(sentence, /stripe|unavailable/i);
  }
});

test('14 · a refused create: Stripe’s email_invalid is the worker’s address (400); every other refusal is the 502', () => {
  // The sandbox answer for "payout-probe@bad..example" (which passes the app's rule).
  assert.deepEqual(createRefusal({ error: { type: 'invalid_request_error', code: 'email_invalid', message: 'Invalid email.' } }), {
    status: 400,
    error: EMAIL_INVALID,
  });
  assert.equal(PROVIDER_UNAVAILABLE, 'The payment provider is unavailable right now.');
  for (const body of [
    { error: { code: 'account_creation_losses_collector_unavailable' } },
    { error: { code: 'invalid_fields', message: 'If configuration.recipient is supplied, the Account must have a contact email.' } },
    { error: { message: 'Invalid email.' } },
    { code: 'email_invalid' },
    { error: 'email_invalid' },
    { id: 7 },
    {},
    null,
    undefined,
  ]) {
    assert.deepEqual(createRefusal(body), { status: 502, error: PROVIDER_UNAVAILABLE }, `502: ${JSON.stringify(body)}`);
  }
});

test('15 · the log never carries an address, and connect-onboarding is wired through account.mjs', () => {
  assert.equal(withoutEmails('invalid_request_error · email_invalid · Invalid email.'), 'invalid_request_error · email_invalid · Invalid email.');
  assert.equal(withoutEmails('bad: Payout-Probe@bad..example, and a@b.co.'), 'bad: [email] and [email]');

  const fn = readFileSync(new URL('../supabase/functions/connect-onboarding/index.ts', import.meta.url), 'utf8');
  assert.match(fn, /^import \{ contactEmail, createRefusal, newAccount, withoutEmails \} from '\.\/account\.mjs';$/m);
  // The body is read only when no account exists, refused with a 400 before anything reaches Stripe.
  const branch = fn.indexOf('if (!accountId) {');
  const read = fn.indexOf('const contact = contactEmail(await req.json().catch(() => null), caller.email);');
  const refuse = fn.indexOf("if ('error' in contact) return json({ error: contact.error }, 400);");
  const create = fn.indexOf("stripeV2('POST', '/v2/core/accounts', newAccount(contact.email), `brazos-account-${userId}`)");
  for (const [name, at] of Object.entries({ branch, read, refuse, create })) assert.ok(at > -1, `${name} is in index.ts`);
  assert.ok(branch < read && read < refuse && refuse < create, 'no account → read the email → refuse → create');
  assert.equal(fn.split('req.json(').length - 1, 1, 'the body is read once');
  // Only newAccount builds the body: no contact_email of its own in index.ts.
  assert.doesNotMatch(fn, /contact_email/);
  // A refused create: the same log line, then the refusal account.mjs decides.
  const failed = fn.indexOf('connect-onboarding: account create ${created.status}: ${providerError(created.body)}');
  const decided = fn.indexOf('const refused = createRefusal(created.body);');
  const answered = fn.indexOf('return json({ error: refused.error }, refused.status);');
  for (const [name, at] of Object.entries({ failed, decided, answered })) assert.ok(at > -1, `${name} is in index.ts`);
  assert.ok(create < failed && failed < decided && decided < answered);
  // Every provider error line goes through the redaction; nothing logs the email itself.
  assert.match(fn, /return withoutEmails\(/);
  for (const line of fn.split('\n').filter((l) => l.includes('console.'))) {
    assert.doesNotMatch(line, /contact|email/i, `logs no address: ${line.trim()}`);
  }
});
