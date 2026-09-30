// 2026-09-30 (the build run, idea 20) — HIRE FROM THE PUSH: a bid's push carries View and Accept & pay;
// Accept & pay opens that offer's own confirm (money and hiring keep their confirm), and a card the
// customer chose to save then pays at once, through accept_offer() and the Checkout payment path. A
// repeat visit's push carries Confirm. A declined card sends the push that opens Checkout. The card is
// saved only by the customer's own opt-in, kept by the provider, and removable in Payment methods.
// The database half is supabase/tests/200_hire_from_push.sql.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  ACTION_ACCEPT_PAY,
  ACTION_CONFIRM,
  ACTION_MESSAGE,
  ACTION_VIEW,
  HIRE_CATEGORIES,
  dataForAction,
} from '../lib/notificationActions.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');
const MIGRATION = 'supabase/migrations/20260930001200_hire_from_push.sql';

test('[executed] Accept & pay opens the offer\'s confirm, Confirm pays in Checkout, View is the plain tap', () => {
  const bid = { screen: 'ClientJobDetail', jobId: 'j1', offerId: 'o1', categoryId: HIRE_CATEGORIES.bid };
  assert.deepEqual(dataForAction(bid, ACTION_ACCEPT_PAY), { ...bid, screen: 'ClientJobDetail', intent: 'accept' });
  assert.equal(dataForAction(bid, ACTION_VIEW), bid, 'View is the plain tap');
  assert.equal(dataForAction(bid, 'expo.modules.notifications.actions.DEFAULT'), bid);
  const noOffer = { screen: 'ClientJobDetail', jobId: 'j1' };
  assert.equal(dataForAction(noOffer, ACTION_ACCEPT_PAY), noOffer, 'no offer named, nothing to accept');
  const visit = { screen: 'ClientJobDetail', jobId: 'j2', intent: 'checkout', categoryId: HIRE_CATEGORIES.series };
  assert.deepEqual(dataForAction(visit, ACTION_CONFIRM), { ...visit, screen: 'ClientJobDetail', intent: 'pay' });
  assert.equal(dataForAction(visit, null), visit);
  assert.equal(dataForAction({ screen: 'ProfileMain' }, ACTION_CONFIRM).intent, undefined, 'no job, no Checkout');
  // The reminders' buttons are untouched by the new ones.
  assert.equal(dataForAction(bid, ACTION_MESSAGE).screen, 'Chat');
  assert.deepEqual(HIRE_CATEGORIES, { bid: 'bid_hire', series: 'series_confirm' });
});

test('[static] the server: the bid push names its offer, its buttons and the all-in total; the declined card', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /select q\.total_cents into v_total from public\.quote_job_price\(new\.amount_cents\) q;/, 'the one price arithmetic');
  assert.match(sql, /v_worker_name \|\| ' bid ' \|\| public\.money_label\(new\.amount_cents\)\s*\|\| coalesce\(' · ' \|\| public\.money_label\(v_total\) \|\| ' all-in', ''\),/);
  assert.match(sql, /'offerId', new\.id::text,\s*'categoryId', 'bid_hire'/);
  assert.match(sql, /'bid_received:' \|\| new\.id::text/, 'the dedupe key is the baseline\'s');
  assert.match(sql, /'Someone else bid on ' \|\| left\(v_job\.title, 60\) \|\| '\. Your bid is still pending\.',/, 'the rivals\' push is the baseline\'s');
  assert.match(sql, /revoke all on function public\.notify_on_bid\(\) from public, anon, authenticated;/);
  // The declined card: one push to the payer, a job payment only, service_role only.
  assert.match(sql, /if v_payment\.id is null or v_payment\.kind <> 'job_payment' then\s*return;/);
  assert.match(sql, /'payment_declined',\s*'Your card was declined',/);
  assert.match(sql, /jsonb_build_object\('screen', 'ClientJobDetail', 'jobId', v_payment\.job_id::text, 'intent', 'checkout'\)/);
  assert.match(sql, /revoke all on function public\.enqueue_payment_declined\(uuid\) from public, anon, authenticated;\s*grant execute on function public\.enqueue_payment_declined\(uuid\) to service_role;/);
  // The repeat visit's Confirm names its button set.
  assert.match(sql, /'intent', 'checkout', 'categoryId', 'series_confirm'\)/);
  // No new money rule: the accept and the payment are not restated here.
  assert.doesNotMatch(sql, /create or replace function public\.(accept_offer|begin_job_payment|release_job_payment|transition_job_status)\b/);
  assert.doesNotMatch(sql, /\b(drop table|drop column|rename to|rename column|truncate|delete from)\b/i, 'additive');
});

test('[static] create-payment: the opt-in sets or clears the intent\'s future use; Confirm charges the saved card off-session', () => {
  const fn = read('supabase/functions/create-payment/index.ts');
  // Validated before any call: a tip is paid in the sheet, never with these.
  assert.match(fn, /if \(tipAmountCents != null && \(saveCard != null \|\| useSavedCard\)\) \{\s*return json\(\{ error: 'A tip is paid in the sheet\.' \}, 400\);/);
  assert.match(fn, /saveCard = typeof body\.saveCard === 'boolean' \? body\.saveCard : null;/);
  assert.match(fn, /useSavedCard = body\.useSavedCard === true;/);
  // Both run after begin_job_payment() has decided — the database still says whether a charge may begin.
  const begun = fn.indexOf("'begin_job_payment'");
  assert.ok(begun > 0 && begun < fn.indexOf('if (useSavedCard) {'), 'the database decides first');
  assert.match(fn, /const wanted = saveCard \? 'off_session' : '';/);
  assert.match(fn, /\{ setup_future_usage: wanted \}/);
  // Confirm: the customer's own latest saved card, off-session, one idempotency key per payment and card.
  assert.match(fn, /customers\/\$\{encodeURIComponent\(customerId\)\}\/payment_methods\?type=card&limit=1/);
  assert.match(fn, /\{ payment_method: card, off_session: 'true' \},\s*`brazos-offsession-\$\{paymentId\}-\$\{card\}`/);
  assert.match(fn, /code: 'no_saved_card' \}, 409\)/);
  assert.match(fn, /await serviceRpc\('enqueue_payment_declined', \{ p_payment_id: paymentId \}\)\.catch\(\(\) => null\);\s*return json\(\{ error: 'Your card was declined\. Protect the payment in Checkout\.', declined: true \}, 402\);/);
  // The webhook marks the row held, as after the sheet; the confirm path returns no secret.
  assert.match(fn, /return json\(\{ paymentId, confirmed: true \}\);/);
});

test('[static] payment-methods: only the caller\'s own cards, removal checked for ownership, nothing charged', () => {
  const fn = read('supabase/functions/payment-methods/index.ts');
  assert.match(fn, /fetch\(`\$\{SUPABASE_URL\}\/auth\/v1\/user`, \{ headers: \{ apikey: ANON_KEY, Authorization: auth \} \}\)/);
  assert.match(fn, /if \(!userId\) return json\(\{ error: 'Sign in to manage your cards\.' \}, 401\);/);
  assert.match(fn, /if \(action !== 'list' && action !== 'setup' && action !== 'remove'\) return json\(\{ error: 'Unknown action\.' \}, 400\);/);
  assert.match(
    fn,
    /const owned = customerId \? \(await listCards\(customerId\)\)\.some\(\(card\) => card\.id === paymentMethodId\) : false;\s*if \(!owned\) return json\(\{ error: 'That card is not on your account\.' \}, 404\);\s*const detached =/
  );
  assert.match(fn, /usage: 'off_session',/);
  assert.doesNotMatch(fn, /payment_intents/, 'saving a card never charges');
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.payment-methods\]\n(?:#[^\n]*\n)*verify_jwt = true/);
});

test('[static] the app: the buttons registered, the intents allow-listed, the confirm kept, the saved card first', () => {
  const push = flat(read('lib/pushNotifications.ts'));
  assert.match(
    push,
    /setNotificationCategoryAsync\(HIRE_CATEGORIES\.bid, \[ \{ identifier: ACTION_VIEW, buttonTitle: 'View', options: \{ opensAppToForeground: true \} \}, \{ identifier: ACTION_ACCEPT_PAY, buttonTitle: 'Accept & pay', options: \{ opensAppToForeground: true \} \}, \]\);/
  );
  assert.match(push, /setNotificationCategoryAsync\(HIRE_CATEGORIES\.series, \[ \{ identifier: ACTION_CONFIRM, buttonTitle: 'Confirm', options: \{ opensAppToForeground: true \} \}, \]\);/);
  const routes = read('lib/notificationRoutes.ts');
  assert.match(routes, /offerId: typeof data\.offerId === 'string' \? data\.offerId : undefined,/);
  // Accept & pay opens the offer's OWN confirm — never an accept without it.
  const detail = flat(read('screens/ClientJobDetailScreen.tsx'));
  assert.match(
    detail,
    /if \(params\.intent !== 'accept' \|\| !params\.offerId \|\| acceptIntentRef\.current \|\| loading \|\| !canAccept\) return; acceptIntentRef\.current = true; const bid = bids\.find\(\(offer\) => offer\.id === params\.offerId\); if \(bid\) confirmAccept\(bid\);/
  );
  assert.match(detail, /function proceedToCheckout\(\) \{ \/\/ [^]*?navigation\.navigate\('Checkout', \{ job, oneTap: true \}\);/);
  // Checkout: the opt-in is off by default and only offered while no card is saved.
  const checkout = flat(read('screens/CheckoutScreen.tsx'));
  assert.match(checkout, /const \[saveCard, setSaveCard\] = useState\(false\);/);
  assert.match(checkout, /\.\.\.\(stripe && cardsRead && !savedCard && canFund && !held \?/);
  assert.match(checkout, /paymentProvider\.beginJobCheckout\(job\.id, \{ saveCard: saveCard && !savedCard \}\)/);
  // One-tap: only with oneTap, a saved card, a fundable job, figures, payments on, and nothing in flight —
  // and it watches the ledger reach held exactly as after the sheet.
  assert.match(
    checkout,
    /if \(!params\.oneTap \|\| oneTapRef\.current \|\| !stripe \|\| !cardsRead \|\| !savedCard\) return; if \(!canFund \|\| !figures \|\| !paymentsEnabled \|\| phase !== 'idle' \|\| funding\) return; oneTapRef\.current = true; void fundBySavedCard\(\);/
  );
  assert.match(checkout, /const result = await confirmWithSavedCard\(job\.id\); if \(result\.confirmed\) \{ await confirmPayment\(\); return; \}/);
  // Money is integer cents, through formatBudget, and the button names the card.
  assert.match(checkout, /title=\{`Pay \$\{formatBudget\(figures\.total\)\} with \$\{cardLabel\(savedCard\)\}`\}/);
  assert.match(read('lib/payments/stripe.ts'), /supabase\.functions\.invoke\('create-payment', \{ body: \{ jobId, useSavedCard: true \} \}\)/);
});

test('[static] Payment methods: the saved card listed, removed only after its confirm, added in the provider\'s sheet', () => {
  const screen = flat(read('screens/PaymentMethodsScreen.tsx'));
  assert.match(screen, /const ok = await confirmAsync\(\{ title: `Remove \$\{cardLabel\(card\)\}\?`,[^]*?destructive: true, \}\); if \(!ok\) return;/);
  assert.match(screen, /const session = await startCardSetup\(\);/);
  assert.match(screen, /const sheet = await presentCardSetupSheet\(session\.data\);/);
  assert.match(screen, /\{stripe \? \(/, 'the card path only; sandbox and disabled keep their words');
  const lib = read('lib/paymentMethods.ts');
  assert.match(lib, /supabase\.functions\.invoke\('payment-methods', \{ body \}\)/);
  assert.doesNotMatch(lib, /\bcvc\b|card_?number/i, 'the app never handles a card number');
});
