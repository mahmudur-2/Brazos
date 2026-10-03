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
// n5 (2026-09-04): lib/payments.ts imports formatBudget for the take-home
// line; the REAL one is inlined (the tests/conversion pattern) so the module
// stays loadable. Function replacers: the inlined source carries `$$`.
const jobsJs = stripTypeScriptTypes(read('lib/jobs.ts'), { mode: 'strip' });
const fbStart = jobsJs.indexOf('export function formatBudget');
const fbEnd = jobsJs.indexOf('\n}', fbStart);
assert.ok(fbStart > 0 && fbEnd > fbStart, 'formatBudget must exist in lib/jobs.ts');
const formatBudgetSource = jobsJs.slice(fbStart, fbEnd + 2);
const replacements = [
  ["import { supabase } from './supabase';", 'const supabase = globalThis.__payouts_supabase;'],
  ["from './paymentRules';", `from '${rulesUrl}';`],
  ["import { formatBudget } from './jobs';", formatBudgetSource],
];
for (const [from, to] of replacements) {
  assert.ok(js.includes(from), `expected the import: ${from}`);
  js = js.replace(from, () => to);
}
assert.ok(
  !js.includes("'./supabase'") && !js.includes("'./paymentRules'") && !js.includes("'./jobs'"),
  'every runtime import must be stubbed, inlined or made absolute before the module loads'
);

const {
  PAYOUTS_STATUSES,
  PAYOUTS_RESPONSE_MALFORMED,
  PAYOUTS_STATUS_UNREADABLE,
  PAYOUT_SETUP_NOTICE,
  classifyTipPoll,
  isPayoutsStatus,
  payoutSetupNotice,
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
  // review offers "Check again" (fix run E7: a status re-check, not a failed
  // load, so not the retry word); enabled offers nothing.
  assert.match(code, /view\?\.cta \? \(\s*<Button title=\{view\.cta\} onPress=\{\(\) => void openSetup\(\)\}/);
  assert.match(code, /\) : view\?\.refresh \? \(\s*<Button\s*title="Check again"/);
  assert.match(code, /payoutsCta\(status\)/);

  // Outside the card path the screen says why there is nothing here.
  assert.match(src, /PAYOUTS_SANDBOX_BODY =\s*'Test mode: cash out from Earnings is a test, and no payout account exists\.'/);
  assert.match(src, /PAYOUTS_DISABLED_BODY =\s*'Payments aren’t available right now, so there is no payout account to set up\.'/);
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
  assert.match(code, /`Cash out \$\{formatBudget\(s\.availableCents\)\} \(test\)`/);
  assert.match(code, /'Nothing available to cash out'/);
  assert.match(code, /'This is a test cash-out: your released payments move to Transferred\. Test mode — no bank is connected and no real money moves\.'/);
  assert.equal((code.match(/setConfirmCashOut\(true\)/g) ?? []).length, 1, 'cash-out is still offered from the sandbox arm alone');
  assert.equal((code.match(/paymentProvider\.cashOut\(\)/g) ?? []).length, 1);
});

// ---------------------------------------------------------------------------
// R6c (D2) — the deep link, EXECUTED: lib/navigation.ts's resolver and its
// gated dispatcher, with the one runtime import (navigateAcrossTabs) replaced
// by a double before the module loads.
// ---------------------------------------------------------------------------

const navCalls = [];
globalThis.__payouts_navigateAcrossTabs = (...args) => {
  navCalls.push(args);
};
let navJs = stripTypeScriptTypes(read('lib/navigation.ts'), { mode: 'strip' });
const navImport = "import { navigateAcrossTabs } from './navigationRef';";
assert.ok(navJs.includes(navImport), 'the dispatcher reaches the navigator through navigateAcrossTabs alone');
// Forwarded on every call, so a test can re-point the double after the module loads.
navJs = navJs.replace(
  navImport,
  'const navigateAcrossTabs = (...args) => globalThis.__payouts_navigateAcrossTabs(...args);'
);
assert.ok(!navJs.includes("'./navigationRef'"), 'the runtime import is stubbed before the module loads');
const { APP_LINK_SCHEME, PAYOUTS_LINK_CONFIRM, handleAppLink, resolveAppLink } = await import(toDataUrl(navJs));

/** A controllable bridge double: mode fixed, the switch scripted. */
function makeBridge(mode, script) {
  const bridge = {
    switchCalls: [],
    getMode: () => mode,
    switchMode: async (target, options) => {
      bridge.switchCalls.push({ target, options });
      return script();
    },
  };
  return bridge;
}

test('9 · the scheme is app.config.ts’s, and the resolver answers brazos://payouts and nothing else', () => {
  assert.equal(APP_LINK_SCHEME, 'brazos');
  assert.match(read('app.config.ts'), /scheme: 'brazos',/, 'the literal the deep link matches');

  const target = { tab: 'Profile', screen: 'Payouts', mode: 'worker' };
  assert.deepEqual(resolveAppLink('brazos://payouts'), { ...target, params: {} });
  assert.deepEqual(resolveAppLink('brazos://payouts?from=return'), { ...target, params: { from: 'return' } });
  assert.deepEqual(resolveAppLink('brazos://payouts/?from=refresh'), { ...target, params: { from: 'refresh' } });
  assert.deepEqual(resolveAppLink('BRAZOS://payouts?from=Return'), { ...target, params: { from: 'return' } });
  assert.deepEqual(resolveAppLink('brazos://payouts?x=1&from=return'), { ...target, params: { from: 'return' } });
  assert.deepEqual(resolveAppLink('  brazos://payouts?from=refresh  '), { ...target, params: { from: 'refresh' } });
  // A `from` outside the two bounces is dropped, not guessed.
  assert.deepEqual(resolveAppLink('brazos://payouts?from=bogus'), { ...target, params: {} });
  assert.deepEqual(resolveAppLink('brazos://payouts?from='), { ...target, params: {} });
  // Everything else is nothing.
  for (const other of [
    '',
    'brazos://',
    'brazos://jobs/123',
    'brazos://payouts/extra',
    'brazos://payoutsx',
    'https://brazos.app/payouts?from=return',
    'exp://127.0.0.1:8081/--/payouts',
    'mailto:payouts@example.com',
  ]) {
    assert.equal(resolveAppLink(other), null, `ignored: ${JSON.stringify(other)}`);
  }
  // A case-different host and a trailing & (an empty pair) still resolve.
  assert.deepEqual(resolveAppLink('brazos://Payouts?from=return&'), { ...target, params: { from: 'return' } });
});

test('10 · the dispatcher: unknown links are ignored silently; a worker-mode arrival routes; the cross-mode gate asks first and drops on decline', async () => {
  // Unknown: nothing happens — no switch, no navigation, no alert (there is
  // no alert import to stub, by construction).
  navCalls.length = 0;
  const idle = makeBridge('customer', () => true);
  assert.equal(await handleAppLink('brazos://jobs/123', idle), 'ignored');
  assert.equal(await handleAppLink('https://brazos.app/payouts', idle), 'ignored');
  assert.deepEqual(idle.switchCalls, []);
  assert.deepEqual(navCalls, []);

  // Worker mode: straight through, on the Profile tab, with the bounce and an arrival stamp.
  navCalls.length = 0;
  const worker = makeBridge('worker', () => {
    throw new Error('no switch is asked for in worker mode');
  });
  assert.equal(await handleAppLink('brazos://payouts?from=return', worker), 'navigated');
  assert.equal(navCalls.length, 1);
  const [tab, screen, params] = navCalls[0];
  assert.equal(tab, 'Profile');
  assert.equal(screen, 'Payouts');
  assert.equal(params.from, 'return');
  assert.equal(typeof params.at, 'number');
  assert.deepEqual(worker.switchCalls, []);

  // Customer mode, declined: the gate asked with the payouts copy, and nothing routed.
  navCalls.length = 0;
  const declined = makeBridge('customer', () => false);
  assert.equal(await handleAppLink('brazos://payouts?from=refresh', declined), 'declined');
  assert.equal(declined.switchCalls.length, 1);
  assert.equal(declined.switchCalls[0].target, 'worker');
  assert.deepEqual(declined.switchCalls[0].options, { confirm: PAYOUTS_LINK_CONFIRM });
  assert.deepEqual(navCalls, []);

  // Customer mode, accepted: the switch resolves first, then the route.
  navCalls.length = 0;
  const order = [];
  const accepted = makeBridge('customer', () => {
    order.push('switch');
    return true;
  });
  globalThis.__payouts_navigateAcrossTabs = (...args) => {
    order.push('navigate');
    navCalls.push(args);
  };
  assert.equal(await handleAppLink('brazos://payouts?from=refresh', accepted), 'navigated');
  assert.deepEqual(order, ['switch', 'navigate']);
  assert.equal(navCalls[0][2].from, 'refresh');

  // Mode not yet resolved (cold start): the gate stands down; the route
  // resolves in either tree because Profile is mounted in both.
  navCalls.length = 0;
  const pending = makeBridge(null, () => {
    throw new Error('no switch while mode resolution is pending');
  });
  assert.equal(await handleAppLink('brazos://payouts', pending), 'navigated');
  assert.equal(navCalls.length, 1);
  assert.equal(navCalls[0][2].from, undefined);

  // The confirm copy: the same shape notificationRoutes uses, and honest.
  assert.equal(PAYOUTS_LINK_CONFIRM.title, 'Switch to Worker Mode?');
  assert.equal(PAYOUTS_LINK_CONFIRM.confirmText, 'Switch');
  assert.match(PAYOUTS_LINK_CONFIRM.message, /Worker Mode/);
  assert.doesNotMatch(PAYOUTS_LINK_CONFIRM.message, /verif|\bpaid\b/i);
});

test('[static] 11 · App.tsx listens for the URL beside the push listener, reads the cold-start URL once, and carries no linking prop', () => {
  const app = read('App.tsx');
  const code = stripComments(app);
  const rootStart = code.indexOf('function RootNavigator()');
  const rootEnd = code.indexOf('function LaunchGate(');
  const rootNavigator = code.slice(rootStart, rootEnd);
  assert.ok(rootStart > 0 && rootEnd > rootStart);
  // Same seat as the push listener — inside the container, in RootNavigator.
  assert.match(rootNavigator, /usePushNotifications\(\);/);
  assert.match(rootNavigator, /const linkBridge = useNotificationModeBridge\(\);/);
  assert.match(rootNavigator, /Linking\.getInitialURL\(\)/);
  assert.match(rootNavigator, /Linking\.addEventListener\('url', \(\{ url \}\) => dispatch\(url\)\);/);
  assert.match(rootNavigator, /void handleAppLink\(url, linkBridge\);/);
  // The cold-start URL is consumed once per process.
  assert.match(rootNavigator, /const handledInitialUrl = useRef\(false\);/);
  assert.match(rootNavigator, /if \(!handledInitialUrl\.current\) \{\s*handledInitialUrl\.current = true;/);
  // Native only, and the subscription is removed on cleanup.
  assert.match(rootNavigator, /if \(Platform\.OS === 'web'\) return;/);
  assert.match(rootNavigator, /subscription\.remove\(\);/);
  // One dispatch system: no `linking` prop on the container, then or now.
  assert.doesNotMatch(code, /linking=\{/);
  assert.match(app, /import \{ handleAppLink \} from '\.\/lib\/navigation';/);
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

// ---------------------------------------------------------------------------
// n4b (2026-09-05) — the payout setup notice, EXECUTED over the decided cases,
// and the screen's two reads pinned as text.
// ---------------------------------------------------------------------------

test('12 · payoutSetupNotice (n4b): the sentence only when payouts are not enabled AND an approved stripe row is still waiting on its transfer', () => {
  const waiting = { provider: 'stripe', status: 'held', release_requested_at: '2026-09-05T00:40:39Z' };
  const merelyHeld = { provider: 'stripe', status: 'held', release_requested_at: null };
  const sandbox = { ...waiting, provider: 'sandbox' };

  assert.equal(payoutSetupNotice('enabled', [waiting]), null, 'enabled: the drain will send it; nothing to say');
  assert.equal(payoutSetupNotice('none', []), null, 'no rows: nothing is waiting');
  assert.equal(payoutSetupNotice('none', [merelyHeld]), null, 'held without release_requested_at is not yet approved');
  assert.equal(payoutSetupNotice('action_needed', [waiting]), PAYOUT_SETUP_NOTICE, 'action_needed + an approved stripe row: the sentence');
  assert.equal(payoutSetupNotice('action_needed', [sandbox]), null, 'a sandbox row never waits on a payout account');
  assert.equal(payoutSetupNotice(null, [waiting]), null, 'a null status is unknown, and unknown says nothing');
  // The other two not-enabled states say it too, one waiting row among
  // others is enough, and the sentence follows the payment state machine:
  // approved — never paid, never released.
  assert.equal(payoutSetupNotice('none', [merelyHeld, waiting]), PAYOUT_SETUP_NOTICE);
  assert.equal(payoutSetupNotice('under_review', [waiting]), PAYOUT_SETUP_NOTICE);
  assert.equal(
    PAYOUT_SETUP_NOTICE,
    'An approved payment is waiting on your payout setup before it can be sent to you.'
  );
  assert.match(PAYOUT_SETUP_NOTICE, /approved/i);
  assert.doesNotMatch(PAYOUT_SETUP_NOTICE, /\bpaid\b|released|verif|stripe/i);
});

test('[static] 13 · PayoutsScreen (n4b) reads the ledger beside the status read, feeds both to payoutSetupNotice, and renders the sentence in the ready branch only', () => {
  const src = read('screens/PayoutsScreen.tsx');
  const code = stripComments(src);
  assert.match(code, /import \{ payoutSetupNotice, payoutsCta, type PayoutsStatus \} from '\.\.\/lib\/payments';/);
  assert.match(code, /import \{ fetchMyEarnings, type EarningsRow \} from '\.\.\/lib\/earnings';/);
  assert.match(code, /await fetchMyEarnings\(userId\)/);
  // Null is unknown: no status yet, or no rows yet, renders nothing.
  assert.match(code, /status && rows \? payoutSetupNotice\(status, rows\) : null/);
  // One <Text> in the screen's existing body style, directly above the one
  // action button — inside the action bar, so it is in the ready branch only.
  assert.match(code, /\{setupNotice \? <Text style=\{styles\.body\}>\{setupNotice\}<\/Text> : null\}\s*\{actionButton\}/);
  // The ledger read never writes the status: still exactly one setStatus call.
  assert.equal((code.match(/setStatus\(/g) ?? []).length, 1);
});
