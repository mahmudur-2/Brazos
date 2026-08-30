import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// R6c (D1/D2) — payouts: the status → CTA mapping EXECUTED, the two reads
// validated, and the screen, the Earnings entry, the route and the deep link
// pinned as text.
// ---------------------------------------------------------------------------
//
// connect-onboarding / connect-status are Deno and nothing here runs Deno; the
// CLASSIFICATION they rely on is proven in tests/connect.test.mjs. What this
// file executes is the CLIENT's half: lib/payments.ts's payoutsCta() over the
// four contract strings and the two response validators (the cheap read on
// the provider boundary hands its answer to one of them). The module is
// loaded for real — its one effectful
// import (./supabase) replaced with a test double before it loads, the shape
// tests/crossModeNotification.test.mjs established — so what runs is the
// module's own logic, not a restatement of it.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// --- Load the real lib/payments.ts with its one effectful import stubbed ----

// lib/payments.ts calls no RPC on a payout path (tests/sandboxCheckout.test.mjs
// holds that line); the double exists only so the module can load.
globalThis.__payouts_supabase = {
  rpc: () => {
    throw new Error('this test makes no RPC calls');
  },
  from: () => {
    throw new Error('this test makes no table reads');
  },
};

let js = stripTypeScriptTypes(read('lib/payments.ts'), { mode: 'strip' });
const rulesUrl = pathToFileURL(join(root, 'lib/paymentRules.ts')).href;
const replacements = [
  ["import { supabase } from './supabase';", 'const supabase = globalThis.__payouts_supabase;'],
  ["from './paymentRules';", `from '${rulesUrl}';`],
];
for (const [from, to] of replacements) {
  assert.ok(js.includes(from), `expected the import: ${from}`);
  js = js.replace(from, to);
}
assert.ok(
  !js.includes("'./supabase'") && !js.includes("'./paymentRules'"),
  'every runtime import must be stubbed or made absolute before the module loads'
);

const {
  PAYOUTS_STATUSES,
  PAYOUTS_RESPONSE_MALFORMED,
  PAYOUTS_STATUS_UNREADABLE,
  classifyTipPoll,
  isPayoutsStatus,
  payoutsCta,
  validatePayoutsOnboardingResponse,
  validatePayoutsStatusResponse,
} = await import(toDataUrl(js));

const FOUR = ['none', 'action_needed', 'under_review', 'enabled'];

test('1 · the four payout states are exactly the contract’s strings, frozen', () => {
  assert.deepEqual([...PAYOUTS_STATUSES], FOUR);
  assert.ok(Object.isFrozen(PAYOUTS_STATUSES));
  for (const status of FOUR) assert.ok(isPayoutsStatus(status), status);
  for (const bad of ['verified', 'ENABLED', '', null, undefined, 1, {}]) {
    assert.equal(isPayoutsStatus(bad), false, `${String(bad)} is not a payout state`);
  }
});

test('2 · status → CTA, executed over the four strings (R5b “The four status strings and the payouts CTA”)', () => {
  const none = payoutsCta('none');
  assert.equal(none.cta, 'Set up payouts');
  assert.equal(none.refresh, false);

  const actionNeeded = payoutsCta('action_needed');
  assert.equal(actionNeeded.cta, 'Finish setting up payouts');
  assert.equal(actionNeeded.refresh, false);

  const underReview = payoutsCta('under_review');
  assert.equal(underReview.headline, 'Payouts under review');
  assert.equal(underReview.cta, null, 'under review: no call to action');
  assert.equal(underReview.refresh, true, 'under review: a refresh is what is offered');

  const enabled = payoutsCta('enabled');
  assert.equal(enabled.headline, 'Payouts are set up');
  assert.equal(enabled.cta, null, 'enabled: no call to action');
  assert.equal(enabled.refresh, false);

  // D1's copy rule: never "verified", never an identity claim, never "paid".
  for (const status of FOUR) {
    const view = payoutsCta(status);
    assert.ok(view.headline.length > 0 && view.body.length > 0, `${status} has a headline and a body`);
    for (const text of [view.headline, view.body, view.cta ?? '']) {
      assert.doesNotMatch(text, /verif/i, `${status}: never "verified"`);
      assert.doesNotMatch(text, /identity/i, `${status}: no identity claim`);
      assert.doesNotMatch(text, /\bpaid\b/i, `${status}: never "paid"`);
      assert.doesNotMatch(text, /stripe/i, `${status}: no user-facing string names the provider`);
    }
  }
  // The two CTAs are the two setup strings and nothing else.
  assert.deepEqual(
    FOUR.map((s) => payoutsCta(s).cta),
    ['Set up payouts', 'Finish setting up payouts', null, null]
  );
});

test('3 · the cheap read: my_payouts_status() on the provider boundary, validated by the one shape rule — a string outside the four is an error, never a state', () => {
  // The read lives in lib/payments/stripe.ts (lib/payments.ts calls no RPC on
  // a payout path) and hands the RPC's answer to the validator executed in
  // test 4, so what is asserted here is the wiring; the rule itself runs below.
  const boundary = stripComments(read('lib/payments/stripe.ts'));
  assert.match(boundary, /export async function fetchMyPayoutsStatus\(\)/);
  assert.match(boundary, /const \{ data, error \} = await supabase\.rpc\('my_payouts_status'\);/);
  assert.match(boundary, /return validatePayoutsStatusResponse\(\{ status: data \}\);/);
  assert.equal((boundary.match(/\.rpc\(/g) ?? []).length, 1, 'the one RPC the boundary calls is the cheap read');
  // The validator, over what the RPC can answer.
  assert.deepEqual(validatePayoutsStatusResponse({ status: 'enabled' }), { data: 'enabled', error: null });
  assert.deepEqual(validatePayoutsStatusResponse({ status: 'verified' }), {
    data: null,
    error: { message: PAYOUTS_STATUS_UNREADABLE },
  });
  assert.deepEqual(validatePayoutsStatusResponse({ status: null }), {
    data: null,
    error: { message: PAYOUTS_STATUS_UNREADABLE },
  });
  // And the module this file executes keeps its contract: no payout RPC.
  assert.doesNotMatch(js, /\.rpc\(['"][^'"]*(release|payout|cash_out|capture)/i);
});

test('4 · the connect responses are validated field by field — a guessed link or an unknown state is an error', () => {
  const ok = validatePayoutsOnboardingResponse({ status: 'action_needed', url: 'https://connect.example/acct/link' });
  assert.deepEqual(ok, { data: { status: 'action_needed', url: 'https://connect.example/acct/link' }, error: null });
  for (const bad of [
    null,
    [],
    {},
    { status: 'action_needed' },
    { status: 'action_needed', url: 'http://connect.example/plain' },
    { status: 'action_needed', url: '' },
    { status: 'verified', url: 'https://connect.example/x' },
    { url: 'https://connect.example/x' },
  ]) {
    assert.deepEqual(
      validatePayoutsOnboardingResponse(bad),
      { data: null, error: { message: PAYOUTS_RESPONSE_MALFORMED } },
      `refused: ${JSON.stringify(bad)}`
    );
  }
  assert.match(PAYOUTS_RESPONSE_MALFORMED, /Nothing changed/);

  assert.deepEqual(validatePayoutsStatusResponse({ status: 'none' }), { data: 'none', error: null });
  assert.deepEqual(validatePayoutsStatusResponse({ status: 'under_review' }), { data: 'under_review', error: null });
  for (const bad of [null, {}, { status: 'bogus' }, { status: 1 }, ['enabled']]) {
    assert.deepEqual(
      validatePayoutsStatusResponse(bad),
      { data: null, error: { message: PAYOUTS_STATUS_UNREADABLE } },
      `refused: ${JSON.stringify(bad)}`
    );
  }
});

test('5 · the tip poll classifier (R6c D3): released is success, failed / voided / vanished is gone, unfunded is pending', () => {
  assert.equal(classifyTipPoll({ status: 'released', seen: true }), 'released');
  assert.equal(classifyTipPoll({ status: 'paid_out', seen: true }), 'released');
  assert.equal(classifyTipPoll({ status: 'failed', seen: true }), 'gone');
  assert.equal(classifyTipPoll({ status: 'voided', seen: true }), 'gone');
  assert.equal(classifyTipPoll({ status: null, seen: true }), 'gone', 'a seen row that vanished is gone');
  assert.equal(classifyTipPoll({ status: null, seen: false }), 'pending', 'a row not yet there is not gone');
  assert.equal(classifyTipPoll({ status: 'unfunded', seen: true }), 'pending');
  assert.equal(classifyTipPoll({ status: 'held', seen: true }), 'pending', 'a tip never reads held; if one did, keep waiting');
});

// ---------------------------------------------------------------------------
// The screen, the entry, the route — as text.
// ---------------------------------------------------------------------------

test('[static] 6 · PayoutsScreen opens the link in the system browser, refreshes through connect-status then the cheap read, and never claims a state', () => {
  const src = read('screens/PayoutsScreen.tsx');
  const code = stripComments(src);

  // A system browser session, never a WebView, never a new dependency.
  assert.match(code, /Linking\.openURL\(url\)/);
  assert.doesNotMatch(code, /WebView|expo-web-browser/);
  assert.doesNotMatch(read('package.json'), /"expo-web-browser"/, 'expo-web-browser is not installed — Linking.openURL is the house shape here');

  // The cheap read first; the refresh is connect-status THEN the re-read.
  assert.match(code, /fetchMyPayoutsStatus\(\)/);
  const refreshStart = code.indexOf('const refresh = useCallback');
  const refreshBody = code.slice(refreshStart, code.indexOf('}, [stripe, readStatus]);', refreshStart));
  assert.ok(refreshStart > 0 && refreshBody.length > 0);
  const statusCall = refreshBody.indexOf('refreshPayoutsStatus()');
  const reRead = refreshBody.indexOf('readStatus()');
  assert.ok(statusCall > 0 && reRead > statusCall, 'refresh = connect-status, then my_payouts_status() re-read');

  // Every foreground return while focused refreshes.
  const focus = code.indexOf('useFocusEffect(');
  const appState = code.indexOf("AppState.addEventListener('change'");
  assert.ok(focus > 0 && appState > focus, 'the AppState listener is registered inside the focus effect');
  assert.match(code, /if \(next === 'active'\) void refresh\(\);/);

  // The bounce: from=return refreshes; from=refresh requests a fresh link now and says so once.
  assert.match(code, /if \(from === 'return'\) \{\s*void refresh\(\);/);
  assert.match(code, /setNotice\(PAYOUTS_LINK_EXPIRED_NOTICE\);\s*const url = await requestLink\(\);/);
  assert.match(
    src,
    /PAYOUTS_LINK_EXPIRED_NOTICE =\s*'That setup link had expired, so a fresh one was requested — continue below\.'/
  );

  // Nothing here ever sets a state on its own — the only writes to `status`
  // come from the cheap read's answer.
  assert.doesNotMatch(code, /setStatus\('/);
  assert.equal((code.match(/setStatus\(/g) ?? []).length, 1, 'one setStatus call: the read');
  // On the comment-stripped source: the file's own header names the rule.
  assert.doesNotMatch(code, /verif/i, 'never "verified"');
  assert.doesNotMatch(code, /\bpaid\b/i);
  assert.doesNotMatch(code, /'Stripe'|"Stripe"|Stripe /, 'no user-facing string names the provider');

  // Both CTAs are the mapping's string and the one setup action; under
  // review offers Refresh; enabled offers nothing.
  assert.match(code, /view\?\.cta \? \(\s*<Button title=\{view\.cta\} onPress=\{\(\) => void openSetup\(\)\}/);
  assert.match(code, /\) : view\?\.refresh \? \(\s*<Button\s*title="Refresh"/);
  assert.match(code, /payoutsCta\(status\)/);

  // Outside the card path the screen says why there is nothing here.
  assert.match(src, /PAYOUTS_SANDBOX_BODY =\s*'This build runs sandbox payments: cash-out is simulated from Earnings, and no payout account exists\.'/);
  assert.match(src, /PAYOUTS_DISABLED_BODY =\s*'Payments are off in this build, so there is no payout account to set up\.'/);
  assert.match(code, /title: 'Payouts are on the card path only'/);
});

test('[static] 7 · Earnings leads to Payouts in stripe mode only, and the sandbox cash-out slot is unchanged', () => {
  const src = read('screens/EarningsScreen.tsx');
  const code = stripComments(src);
  assert.match(code, /s && paymentsMode === 'stripe' \? \([\s\S]{0,700}navigation\.navigate\('Payouts'\)/);
  assert.match(code, /title=\{payouts \? payoutsCta\(payouts\)\.cta \?\? payoutsCta\(payouts\)\.headline : 'Payouts'\}/);
  assert.match(code, /if \(paymentsMode === 'stripe'\) \{\s*const payoutsRes = await fetchMyPayoutsStatus\(\);/);
  // D16/D19: the sandbox arm is the same text it was.
  assert.match(code, /s && paymentsMode === 'sandbox' \? \(/);
  assert.match(code, /`Cash out \$\{formatBudget\(s\.availableCents\)\} \(simulated\)`/);
  assert.match(code, /'Nothing available to cash out'/);
  assert.match(code, /'This SIMULATES a transfer: your released payments move to Transferred in the sandbox ledger\. No bank is connected and no real money moves in this build\.'/);
  assert.equal((code.match(/setConfirmCashOut\(true\)/g) ?? []).length, 1, 'cash-out is still offered from the sandbox arm alone');
  assert.equal((code.match(/paymentProvider\.cashOut\(\)/g) ?? []).length, 1);
});

test('[static] 8 · the route is registered on the shared profile stack and typed in lib/navigation.ts', () => {
  const stacks = read('navigation/sharedStacks.tsx');
  assert.match(stacks, /import \{ PayoutsScreen \} from '\.\.\/screens\/PayoutsScreen';/);
  assert.match(stacks, /<ProfileStack\.Screen name="Payouts" component=\{PayoutsScreen\} \/>/);
  const nav = read('lib/navigation.ts');
  assert.match(nav, /export type PayoutsLinkFrom = 'return' \| 'refresh';/);
  assert.match(nav, /Payouts: \{ from\?: PayoutsLinkFrom; at\?: number \} \| undefined;/);
  const profileList = nav.slice(nav.indexOf('export type ProfileStackParamList'), nav.indexOf('export type ProfileStackNavigation'));
  assert.ok(profileList.includes('Payouts:'), 'Payouts lives in the ProfileStackParamList, beside Earnings');
});
