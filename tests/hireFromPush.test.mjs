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
  // Applied every time, both ways — never compared with the intent's (replayed) creation response.
  assert.match(fn, /const wanted = saveCard \? 'off_session' : '';\s*const updated = await stripe\(/);
  assert.doesNotMatch(fn, /intent\.body\.setup_future_usage/);
  assert.match(read('lib/payments/stripe.ts'), /typeof options\?\.saveCard === 'boolean'\s*\? \{ jobId, saveCard: options\.saveCard \}/);
  // Confirm: the card the app named, once the provider says it is this caller's; off-session, with
  // the return URL an automatic-payment-methods intent needs; one idempotency key per payment and card.
  assert.match(fn, /if \(useSavedCard && !\/\^pm_\[A-Za-z0-9_\]\+\$\/\.test\(savedCardId\)\) \{/);
  assert.match(fn, /if \(!card\.ok \|\| card\.body\.customer !== customerId \|\| card\.body\.type !== 'card'\) \{/);
  assert.match(fn, /const OFF_SESSION_RETURN_URL = 'brazos:\/\/checkout';/);
  assert.match(fn, /\{ payment_method: savedCardId, off_session: 'true', return_url: OFF_SESSION_RETURN_URL \},\s*`brazos-offsession-\$\{paymentId\}-\$\{savedCardId\}`/);
  assert.doesNotMatch(fn, /latestSavedCard/, 'never "whichever card is newest"');
  // Only a card decline is a decline; the rest is the provider's, and an unknown outcome is the ledger's.
  assert.match(fn, /const declined =\s*confirmed\.status === 402 \|\|\s*failure\?\.type === 'card_error' \|\|/);
  assert.match(fn, /const ambiguous = confirmed\.status >= 500 \|\| failure\?\.code === 'payment_intent_unexpected_state';\s*return json\(\{ error: 'The payment provider is unavailable right now\.', ambiguous \}, 502\);/);
  assert.match(fn, /code: 'no_saved_card' \}, 409\)/);
  assert.match(fn, /if \(declined\) \{\s*await serviceRpc\('enqueue_payment_declined', \{ p_payment_id: paymentId \}\)\.catch\(\(\) => null\);\s*return json\(\{ error: 'Your card was declined\. Protect the payment in Checkout\.', declined: true \}, 402\);/);
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
  assert.match(config, /\[functions\.payment-methods\]\r?\n(?:#[^\r\n]*\r?\n)*verify_jwt = true/);
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
    /if \(params\.intent !== 'accept' \|\| !params\.offerId \|\| acceptIntentRef\.current \|\| loading \|\| !canAccept \|\| !cardsRead\) return; acceptIntentRef\.current = true; \/\/ [^]*?const pending = pendingBids\.find\(\(bid\) => bid\.id === params\.offerId\); if \(pending\) confirmAccept\(pending\.offer\);/
  );
  // Only a confirm that named the saved card pays at once — and it names it.
  assert.match(detail, /const card = oneTapCardRef\.current; navigation\.navigate\('Checkout', card \? \{ job, oneTap: true, oneTapCard: card \} : \{ job \}\);/);
  assert.match(detail, /onConfirm=\{\(\) => \{ \/\/ [^]*?oneTapCardRef\.current = stripe && savedCard && acceptQuote \? savedCard\.id : null; if \(pendingAccept\) void doAccept\(pendingAccept\); \}\}/);
  // A5 (2026-10-03): the confirm's body is the ONE shared text in lib/offerCopy.ts; the job page
  // hands it the card it names, and the sentence that says the card is charged now renders only
  // with a named card AND the quote.
  assert.match(detail, /message=\{acceptOfferConfirmMessage\(\{ quote: acceptQuote \? \{ priceLabel: formatBudget\(acceptQuote\.job_price_cents\), feeLabel: formatBudget\(acceptQuote\.customer_fee_cents\), totalLabel: formatBudget\(acceptQuote\.total_cents\), \} : null, sandbox: paymentsMode === 'sandbox', savedCardLabel: stripe && savedCard \? cardLabel\(savedCard\) : null, \}\)\}/);
  const offerCopy = flat(read('lib/offerCopy.ts'));
  assert.match(offerCopy, /: input\.savedCardLabel && quote \? ` \$\{input\.savedCardLabel\} is charged the total now, and the funds are held in protection until you approve the work\.`/);
  // Checkout: the opt-in is off by default and only offered while no card is saved.
  const checkout = flat(read('screens/CheckoutScreen.tsx'));
  assert.match(checkout, /const \[saveCard, setSaveCard\] = useState\(false\);/);
  assert.match(checkout, /\.\.\.\(stripe && cardsRead && !savedCard && canFund && !held \?/);
  assert.match(checkout, /paymentProvider\.beginJobCheckout\(job\.id, \{ saveCard: saveCard && !savedCard \}\)/);
  // One-tap: only with oneTap, a saved card, a fundable job, figures, payments on, and nothing in flight —
  // and it watches the ledger reach held exactly as after the sheet.
  // A4 (2026-10-03): the saved card pays at once ONLY when the arrival carries the card id an in-app
  // confirm named (`oneTapCard === savedCard.id`). Any other one-tap arrival — a repeat visit's
  // Confirm push, which gave no in-app confirm — opens the Pay & protect confirm on the saved-card
  // path, which names the card and the amount; no charge happens out of sight.
  assert.match(
    checkout,
    /if \(!params\.oneTap \|\| oneTapRef\.current \|\| !stripe \|\| !cardsRead \|\| !savedCard\) return; if \(!canFund \|\| !figures \|\| !paymentsEnabled \|\| phase !== 'idle' \|\| funding\) return; oneTapRef\.current = true; \/\/ [^]*?if \(params\.oneTapCard === savedCard\.id\) \{ void fundBySavedCard\(\); return; \} setDialogPath\('saved'\); setConfirmVisible\(true\);/
  );
  assert.match(checkout, /const result = await confirmWithSavedCard\(job\.id, savedCard\.id\); \/\/ [^]*?if \(result\.confirmed \|\| result\.ambiguous\) \{ await confirmPayment\(\); return; \}/);
  // fundBySavedCard has exactly two callers: the matched-card branch above and the confirm's own
  // onConfirm — never a bare one-tap flag.
  const checkoutCode = read('screens/CheckoutScreen.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const savedCardCalls = checkoutCode.match(/fundBySavedCard\b/g) ?? [];
  assert.equal(savedCardCalls.length, 3, 'one definition and two callers (the named-card branch, the confirm)');
  assert.match(checkout, /onConfirm=\{stripe \? \(dialogPath === 'saved' && savedCard \? fundBySavedCard : fundByCard\) : fundProtection\}/);
  assert.doesNotMatch(checkout, /if \(params\.oneTapCard && params\.oneTapCard !== savedCard\.id\) return;/, 'a missing oneTapCard must not fall through to a charge');
  // The confirm it opens names the card and the total.
  assert.match(checkout, /`Charge \$\{formatBudget\(figures\?\.total \?\? null\)\} to \$\{dialogPath === 'saved' && savedCard \? cardLabel\(savedCard\) : 'your card'\}\?`/);
  // Money is integer cents, through formatBudget, and the button names the card.
  assert.match(checkout, /title=\{`Protect \$\{formatBudget\(figures\.total\)\} with card ···· \$\{savedCard\.last4\}`\}/);
  // The saved card is read before the page paints, and one-tap is one spinner until held.
  assert.match(checkout, /!paymentLoaded \|\| \(stripe && !cardsRead\) \? \{ kind: 'loading', variant: 'spinner' \}/);
  assert.match(checkout, /setPhase\('confirming'\); try \{ const result = await confirmWithSavedCard\(job\.id, savedCard\.id\);/);
  assert.match(checkout, /result\.declined \? 'Nothing was charged\.\\n\\nYour accepted offer is unchanged — pay with another card below\.'/);
  assert.match(read('lib/payments/stripe.ts'), /supabase\.functions\.invoke\('create-payment', \{ body: \{ jobId, useSavedCard: true, paymentMethodId \} \}\)/);
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
