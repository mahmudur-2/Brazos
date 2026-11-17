import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * A4 wiring (P2) - A DELETED ACCOUNT TAKES ITS SAVED CARDS WITH IT, PROVEN. On the card path the
 * account is deleted only after the payment-methods function lists no card (an empty list is the
 * only proof); any failure keeps the account and offers Try Again, which runs again from the
 * server's gate with no second confirm. With payments off there is no card path and the step is
 * skipped. lib/paymentMethods.ts runs here with its two imports replaced (a stub for the client,
 * the real lib/errorMessage.ts); the screen's two functions run as written, with their calls stubbed.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const flat = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s+/g, ' ');
globalThis.__DEV__ = false;

let js = stripTypeScriptTypes(read('lib/paymentMethods.ts'), { mode: 'strip' });
for (const [from, to] of [
  // Read at call time, so each test's provider() answers.
  ["import { supabase } from './supabase';", 'const supabase = { functions: { invoke: (...args) => globalThis.__delete_cards_supabase.functions.invoke(...args) } };'],
  ["import { userMessage } from './errorMessage';", `import { userMessage } from '${pathToFileURL(join(root, 'lib/errorMessage.ts')).href}';`],
]) {
  assert.ok(js.includes(from), `expected the import: ${from}`);
  js = js.replace(from, () => to);
}
const cards = await import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64'));
const { MAX_CARD_ROUNDS, cardSweepMessage, listSavedCards, removeEverySavedCard } = cards;

// The function's answers, as supabase.functions.invoke gives them: 2xx data, or a FunctionsHttpError
// whose context is the Response.
const ok = (data) => ({ data, error: null });
const refused = (status, error) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', context: { status, text: async () => JSON.stringify({ error }) } },
});
const card = (id) => ({ id, brand: 'visa', last4: '4242', expMonth: 1, expYear: 2030 });
const NOT_YOURS = refused(404, 'That card is not on your account.');
const PROVIDER_DOWN = refused(502, 'The payment provider is unavailable right now.');

/** Answers in order; every call is logged as "list" or "remove <id>". */
function provider(answers) {
  const calls = [];
  globalThis.__delete_cards_supabase = {
    functions: {
      invoke: async (name, { body }) => {
        assert.equal(name, 'payment-methods');
        calls.push(body.action === 'remove' ? `remove ${body.paymentMethodId}` : body.action);
        const next = answers.shift();
        if (next instanceof Error) throw next;
        assert.ok(next, `an answer for call ${calls.length}`);
        return typeof next === 'function' ? next(body) : next;
      },
    },
  };
  return calls;
}

test('the server answers the app relies on: no customer is an empty list, five a round, 404 not yours, 502 provider down', () => {
  const fn = read('supabase/functions/payment-methods/index.ts');
  assert.match(fn, /return json\(\{ cards: customerId \? await listedCards\(customerId\) : \[\] \}\);/, 'list never creates a customer');
  assert.match(fn, /\/payment_methods\?type=card&limit=5`/);
  assert.match(fn, /const owned = customerId \? \(await listCards\(customerId\)\)\.some\(\(card\) => card\.id === paymentMethodId\) : false;\s*if \(!owned\) return json\(\{ error: 'That card is not on your account\.' \}, 404\);/);
  assert.match(fn, /if \(!detached\.ok\) \{[^]*?return json\(\{ error: 'The payment provider is unavailable right now\.' \}, 502\);\s*\}\s*return json\(\{ removed: true \}\);/);
  assert.match(read('supabase/functions/_shared/serviceAuth.ts'), /return refuse\('not configured', 500\);/, 'the engine text G3-2 names');
  assert.equal(MAX_CARD_ROUNDS, 10);
});

test('every card is removed and an empty list proves it; no customer at all is proven by the first list', async () => {
  let calls = provider([ok({ cards: [] })]);
  assert.deepEqual(await removeEverySavedCard(), { error: null, removed: 0 });
  assert.deepEqual(calls, ['list'], 'nothing to remove');

  calls = provider([ok({ cards: [card('pm_a'), card('pm_b')] }), ok({ removed: true }), ok({ removed: true }), ok({ cards: [] })]);
  assert.deepEqual(await removeEverySavedCard(), { error: null, removed: 2 });
  assert.deepEqual(calls, ['list', 'remove pm_a', 'remove pm_b', 'list'], 'removed, then listed again: the proof');

  // More than five: the next round lists the rest.
  const five = ['pm_1', 'pm_2', 'pm_3', 'pm_4', 'pm_5'];
  calls = provider([ok({ cards: five.map(card) }), ...five.map(() => ok({ removed: true })), ok({ cards: [card('pm_6')] }), ok({ removed: true }), ok({ cards: [] })]);
  assert.deepEqual(await removeEverySavedCard(), { error: null, removed: 6 });
  assert.deepEqual(calls, ['list', ...five.map((id) => `remove ${id}`), 'list', 'remove pm_6', 'list']);
});

test('a 404 on a remove right after a fresh list means the card is already gone: the list again decides', async () => {
  let calls = provider([ok({ cards: [card('pm_a'), card('pm_b')] }), NOT_YOURS, ok({ removed: true }), ok({ cards: [] })]);
  assert.deepEqual(await removeEverySavedCard(), { error: null, removed: 1 }, 'a 404 is not counted as removed');
  assert.deepEqual(calls, ['list', 'remove pm_a', 'remove pm_b', 'list']);
  // Gone by 404 but still listed: not proven, the rounds go on and end in a failure.
  calls = provider(Array.from({ length: MAX_CARD_ROUNDS }, () => [ok({ cards: [card('pm_a')] }), NOT_YOURS]).flat());
  assert.deepEqual(await removeEverySavedCard(), { error: { kind: 'rounds' }, removed: 0 });
  assert.equal(calls.filter((c) => c === 'list').length, MAX_CARD_ROUNDS, 'exactly MAX_CARD_ROUNDS lists, then it gives up');
  assert.equal(cardSweepMessage({ kind: 'rounds' }), 'Some saved cards are still on your account, so it was not deleted.');
});

test('every other failure keeps the account and says why; the raw "not configured" never reaches the screen', async () => {
  // A remove the provider refused: stop there, nothing more is sent.
  let calls = provider([ok({ cards: [card('pm_a'), card('pm_b')] }), PROVIDER_DOWN]);
  const removeFailed = await removeEverySavedCard();
  assert.deepEqual(removeFailed, { error: { kind: 'remove', message: 'The payment provider is unavailable right now.' }, removed: 0 });
  assert.deepEqual(calls, ['list', 'remove pm_a']);
  assert.equal(
    cardSweepMessage(removeFailed.error),
    'A saved card couldn’t be removed from the payment provider, so your account was not deleted. The payment provider is unavailable right now.'
  );
  // The over-the-hour refusal is the server's sentence.
  provider([ok({ cards: [card('pm_a')] }), refused(429, 'Too many tries in the last hour. Try again later.')]);
  assert.deepEqual(await removeEverySavedCard(), { error: { kind: 'remove', message: 'Too many tries in the last hour. Try again later.' }, removed: 0 });

  // G3-2: the unconfigured function's engine text gives the fallback, here and on Payment methods.
  provider([refused(500, 'not configured')]);
  const listFailed = await removeEverySavedCard();
  assert.deepEqual(listFailed, { error: { kind: 'list', message: 'Could not reach your cards right now.' }, removed: 0 });
  assert.equal(
    cardSweepMessage(listFailed.error),
    'Brazos couldn’t check your saved cards, so your account was not deleted. Could not reach your cards right now.'
  );
  provider([refused(500, 'not configured')]);
  assert.deepEqual(await listSavedCards(), { data: [], error: { message: 'Could not reach your cards right now.', status: 500 } });
  provider([refused(401, 'Sign in to manage your cards.')]);
  assert.equal((await listSavedCards()).error.message, 'Sign in to manage your cards.', 'a sentence written for people still shows');

  // No connection: the app's own sentence.
  provider([new Error('Network request failed')]);
  assert.deepEqual(await removeEverySavedCard(), { error: { kind: 'list', message: 'Can’t reach Brazos right now. Check your connection and try again.' }, removed: 0 });

  // A list that cannot be read is never an empty list.
  for (const unreadable of [ok(null), ok({}), ok({ cards: 'none' }), ok({ cards: [{ brand: 'visa' }] }), ok({ cards: [card('pm_a'), null] })]) {
    calls = provider([unreadable]);
    assert.deepEqual(await removeEverySavedCard(), { error: { kind: 'list', message: 'Could not reach your cards right now.' }, removed: 0 });
    assert.deepEqual(calls, ['list'], 'and nothing is removed');
  }
});

// The screen's two functions as written, run with their calls stubbed.
const screen = read('screens/DeleteAccountScreen.tsx');
const start = screen.indexOf('  async function handleDelete() {');
const end = screen.indexOf('  const blocked = blockers.length > 0;');
assert.ok(start > 0 && end > start, 'the two functions');
const source = screen.slice(start, end).replace('async function deleteOnce(): Promise<boolean> {', 'async function deleteOnce() {');
assert.doesNotMatch(source, /\): [A-Z]\w*</, 'no type left in the extracted functions');
const NAMES = ['confirmAsync', 'deletingRef', 'setDeleting', 'fetchAccountDeletionBlockers', 'alertAsync', 'userMessage', 'paymentsMode', 'removeEverySavedCard',
  'cardSweepMessage', 'deleteMyAccount', 'setConfirmText', 'loadBlockers', 'signOutLocally', 'navigation', 'SIGN_OUT_UNFINISHED_MESSAGE'];
const build = new Function(...NAMES, `${source}\nreturn handleDelete;`);

function run({ mode = 'stripe', gates = [], sweeps = [], confirms = [], realCards = false, deletes = [] } = {}) {
  const log = [];
  const alerts = [];
  const deps = {
    confirmAsync: async (o) => {
      log.push(`confirm ${o.title} / ${o.confirmText}${o.title === 'Delete this account?' ? '' : ` / ${o.message}`}`);
      return confirms.shift() ?? false;
    },
    deletingRef: { current: false },
    setDeleting: (v) => log.push(`deleting ${v}`),
    fetchAccountDeletionBlockers: async () => {
      log.push('gate');
      return { data: gates.shift() ?? [], error: null };
    },
    alertAsync: async (title, message) => (alerts.push(message), log.push(`alert ${title}`)),
    userMessage: (e) => e.message,
    paymentsMode: mode,
    removeEverySavedCard: async () => {
      log.push('cards');
      // realCards: the real lib/paymentMethods.ts step, answered by provider().
      return realCards ? removeEverySavedCard() : sweeps.shift() ?? { error: null };
    },
    cardSweepMessage,
    deleteMyAccount: async () => {
      log.push('delete');
      return deletes.shift() ?? { blocked: false, error: null };
    },
    setConfirmText: () => {},
    loadBlockers: async () => log.push('reload list'),
    signOutLocally: async () => (log.push('sign out'), true),
    navigation: { popToTop: () => log.push('popToTop') },
    SIGN_OUT_UNFINISHED_MESSAGE: '(sign-out unfinished)',
  };
  return { handleDelete: build(...NAMES.map((n) => deps[n])), log, deps, alerts };
}
const DELETED = ['delete', 'sign out', 'popToTop', 'alert Account deleted'];
const LIST_DOWN = { error: { kind: 'list', message: 'Could not reach your cards right now.' } };
const ASK_AGAIN = 'confirm Could not delete this account / Try Again / Brazos couldn’t check your saved cards, so your account was not deleted. Could not reach your cards right now.';

test('the account is deleted only after the card step proved every card gone; payments off skips the step', async () => {
  let r = run({ confirms: [true] });
  await r.handleDelete();
  assert.deepEqual(r.log, ['confirm Delete this account? / Delete Account', 'deleting true', 'gate', 'cards', ...DELETED]);

  // Payments off (paymentsMode 'disabled'): no card path, no card step, and the account can be deleted.
  r = run({ mode: 'disabled', confirms: [true] });
  await r.handleDelete();
  assert.deepEqual(r.log, ['confirm Delete this account? / Delete Account', 'deleting true', 'gate', ...DELETED]);

  // A blocked account: no card is touched.
  r = run({ confirms: [true], gates: [[{ kind: 'open_job' }]] });
  await r.handleDelete();
  assert.deepEqual(r.log, ['confirm Delete this account? / Delete Account', 'deleting true', 'gate', 'deleting false', 'reload list', 'alert Not ready yet']);
});

test('a failed card step keeps the account; Try Again runs again from the gate with no second confirm; Cancel leaves it', async () => {
  let r = run({ confirms: [true, true], sweeps: [LIST_DOWN, { error: null }] });
  await r.handleDelete();
  assert.deepEqual(r.log, [
    'confirm Delete this account? / Delete Account',
    'deleting true', 'gate', 'cards', 'deleting false', ASK_AGAIN,
    'deleting true', 'gate', 'cards', ...DELETED,
  ]);
  assert.equal(r.log.filter((l) => l.startsWith('confirm Delete this account?')).length, 1, 'one delete confirm');
  assert.equal(r.deps.deletingRef.current, false);

  r = run({ confirms: [true, false], sweeps: [{ error: { kind: 'rounds' } }] });
  await r.handleDelete();
  assert.deepEqual(r.log, [
    'confirm Delete this account? / Delete Account', 'deleting true', 'gate', 'cards', 'deleting false',
    'confirm Could not delete this account / Try Again / Some saved cards are still on your account, so it was not deleted.',
  ]);
  assert.ok(!r.log.includes('delete'), 'Cancel: the account stays');
  assert.equal(r.deps.deletingRef.current, false, 'and a later tap can start again');
});

test('B5: a failed card removal keeps the account (the real card step under the screen, end to end)', async () => {
  // The provider lists one card and refuses its removal; Cancel on the Try Again dialog.
  const calls = provider([ok({ cards: [card('pm_a')] }), PROVIDER_DOWN]);
  const r = run({ confirms: [true, false], realCards: true });
  await r.handleDelete();
  assert.deepEqual(calls, ['list', 'remove pm_a'], 'the card step stopped at the refused remove');
  assert.deepEqual(r.log, [
    'confirm Delete this account? / Delete Account', 'deleting true', 'gate', 'cards', 'deleting false',
    'confirm Could not delete this account / Try Again / A saved card couldn’t be removed from the payment provider, so your account was not deleted. The payment provider is unavailable right now.',
  ]);
  assert.ok(!r.log.includes('delete'), 'delete_my_account was never called: the account stays');
  assert.ok(!r.log.includes('sign out'), 'and the person stays signed in');

  // Try Again with the provider back: the list again decides, then the account goes.
  const again = provider([ok({ cards: [card('pm_a')] }), PROVIDER_DOWN, ok({ cards: [card('pm_a')] }), ok({ removed: true }), ok({ cards: [] })]);
  const t = run({ confirms: [true, true], realCards: true });
  await t.handleDelete();
  assert.deepEqual(again, ['list', 'remove pm_a', 'list', 'remove pm_a', 'list']);
  assert.ok(t.log.indexOf('delete') > t.log.lastIndexOf('cards'), 'delete only after the empty list');
  assert.deepEqual(t.log.slice(-4), DELETED);
});

test('A4-03: a deletion that fails after a card was really removed says the cards are gone; with no card removed it does not', async () => {
  const BLOCKED_BODY = 'Something on this account still has to be settled first. The list below is up to date.';
  const NOTE = ' Your saved cards were removed.';
  const NETWORK = { blocked: false, error: { message: 'Can’t reach Brazos right now.' } };
  // One card removed (the real card step), then the server refuses: ACCOUNT_DELETION_BLOCKED.
  provider([ok({ cards: [card('pm_a')] }), ok({ removed: true }), ok({ cards: [] })]);
  let r = run({ confirms: [true], realCards: true, deletes: [{ blocked: true, error: null }] });
  await r.handleDelete();
  assert.deepEqual(r.log.slice(-1), ['alert Not ready yet']);
  assert.deepEqual(r.alerts, [BLOCKED_BODY + NOTE]);
  // One card removed, then the network fails.
  provider([ok({ cards: [card('pm_a')] }), ok({ removed: true }), ok({ cards: [] })]);
  r = run({ confirms: [true], realCards: true, deletes: [NETWORK] });
  await r.handleDelete();
  assert.deepEqual(r.alerts, ['Can’t reach Brazos right now.' + NOTE]);
  // No card on the account: both messages stay as they were.
  provider([ok({ cards: [] })]);
  r = run({ confirms: [true], realCards: true, deletes: [{ blocked: true, error: null }] });
  await r.handleDelete();
  assert.deepEqual(r.alerts, [BLOCKED_BODY]);
  provider([ok({ cards: [] })]);
  r = run({ confirms: [true], realCards: true, deletes: [NETWORK] });
  await r.handleDelete();
  assert.deepEqual(r.alerts, ['Can’t reach Brazos right now.']);
  // A card the provider says is already gone (404) was not removed in this attempt.
  provider([ok({ cards: [card('pm_a')] }), NOT_YOURS, ok({ cards: [] })]);
  r = run({ confirms: [true], realCards: true, deletes: [NETWORK] });
  await r.handleDelete();
  assert.deepEqual(r.alerts, ['Can’t reach Brazos right now.']);
  // Payments off: no card step, no sentence.
  r = run({ mode: 'disabled', confirms: [true], deletes: [{ blocked: true, error: null }] });
  await r.handleDelete();
  assert.deepEqual(r.alerts, [BLOCKED_BODY]);
});

test('UA-02: a card step that fails after a card was really removed says some cards were removed; with none removed it does not', async () => {
  const REMOVE_FAILED = 'A saved card couldn’t be removed from the payment provider, so your account was not deleted. The payment provider is unavailable right now.';
  // Two cards: the first is removed, the second answers 502 (the real card step under the screen).
  provider([ok({ cards: [card('pm_a'), card('pm_b')] }), ok({ removed: true }), PROVIDER_DOWN]);
  let r = run({ confirms: [true, false], realCards: true });
  await r.handleDelete();
  assert.equal(r.log.at(-1), `confirm Could not delete this account / Try Again / ${REMOVE_FAILED} Some of your saved cards were removed.`);
  assert.ok(!r.log.includes('delete'), 'the account stays');
  // Every card removed, then the list that proves it fails.
  provider([ok({ cards: [card('pm_a')] }), ok({ removed: true }), { data: null, error: { message: 'Could not reach your cards right now.', status: 500 } }]);
  r = run({ confirms: [true, false], realCards: true });
  await r.handleDelete();
  assert.match(r.log.at(-1), / Some of your saved cards were removed\.$/);
  // Nothing removed before the failure: no sentence.
  provider([ok({ cards: [card('pm_a')] }), PROVIDER_DOWN]);
  r = run({ confirms: [true, false], realCards: true });
  await r.handleDelete();
  assert.equal(r.log.at(-1), `confirm Could not delete this account / Try Again / ${REMOVE_FAILED}`);
});

test('a double tap starts one card step, not two', async () => {
  const r = run({ confirms: [true, true] });
  await Promise.all([r.handleDelete(), r.handleDelete()]);
  assert.equal(r.log.filter((l) => l === 'cards').length, 1);
  assert.equal(r.log.filter((l) => l === 'delete').length, 1);
  // While a run is on (the Try Again dialog included), a tap opens nothing.
  const busy = run({ confirms: [true] });
  busy.deps.deletingRef.current = true;
  await busy.handleDelete();
  assert.deepEqual(busy.log, []);
});

test('[static] the screen: the proven step replaces the best-effort one; the mode is the build’s own setting', () => {
  const code = flat(screen);
  assert.match(code, /import \{ cardSweepMessage, removeEverySavedCard \} from '\.\.\/lib\/paymentMethods';/);
  assert.doesNotMatch(code, /listSavedCards|removeSavedCard\(|catch\(\(\) => null\)/, 'no best-effort removal is left');
  assert.match(code, /if \(gate\.data\.length === 0 && paymentsMode === 'stripe'\) \{ const cards = await removeEverySavedCard\(\); if \(cards\.error\) \{ setDeleting\(false\); return confirmAsync\(\{ title: 'Could not delete this account', message: `\$\{cardSweepMessage\(cards\.error\)\}\$\{cards\.removed > 0 \? ' Some of your saved cards were removed\.' : ''\}`, confirmText: 'Try Again', \}\); \} if \(cards\.removed > 0\) cardsNote = ' Your saved cards were removed\.'; \}/);
  assert.ok(code.indexOf('await removeEverySavedCard()') < code.indexOf('await deleteMyAccount()'));
  // One title style: the screen's own failure title, three times.
  assert.equal((code.match(/'Could not delete this account'/g) ?? []).length, 3);
  // paymentsMode is the build's setting (lib/adapters/payments.ts); the remote pause is not read here.
  assert.match(read('lib/adapters/payments.ts'), /export const paymentsMode: PaymentsMode =\s*env\.EXPO_PUBLIC_PAYMENTS_MODE === 'stripe' && stripePublishableKey\(\) !== null \? 'stripe' : 'disabled';/);
  assert.doesNotMatch(code, /paymentsEnabled|fetchRemoteConfig/);
  // The page's promise is now kept by proof.
  assert.match(code, /It is removed from the payment provider before the account goes\./);
});
