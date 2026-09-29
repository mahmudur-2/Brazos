import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const dir = (path) => readdirSync(new URL(`../${path}`, import.meta.url));

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ---------------------------------------------------------------------------
// 3a — a counter-offer notification opens the JOB, not the hub
// ---------------------------------------------------------------------------
//
// phase59/62 address the payload at the awaiting party's own response surface:
// 'ClientJobDetail' for the job owner, 'JobDetail' for the worker. The in-app
// feed ignored that and dropped every non-Chat job event on MyJobsHub, so the
// notification announcing "your move" led nowhere near the respond card.

test('the notifications feed owns no routing of its own', async () => {
  const screen = stripComments(await read('screens/NotificationsScreen.tsx'));

  // Stage 4A (2026-08-15) rewrote this test. It used to pin the screen's OWN
  // switch — a ClientJobDetail/JobDetail branch, a Chat branch and a
  // MyJobsHub fallback, all behind `typeof jobId === 'string'`. That second
  // copy had drifted from the push router: it dropped every payload carrying
  // no jobId (a pre-hire direct message, a review) and sent WorkerJob to the
  // hub instead of the job, marking the row read on the way. The switch is
  // deleted; what must hold now is that the screen delegates and keeps none
  // of it.
  assert.match(
    screen,
    /import \{ canRouteNotification, handleNotificationData \} from '\.\.\/lib\/notificationRoutes';/
  );
  // Stage 4D: the delegation carries ModeContext through the bridge, for the
  // router's cross-mode gate — still no routing of the screen's own.
  assert.match(screen, /handleNotificationData\(notification\.data, modeBridge\)/);

  // No second routing switch, and no direct cross-tab dispatch of its own.
  assert.doesNotMatch(screen, /navigateAcrossTabs\(/);
  assert.doesNotMatch(screen, /screen === '/);
  assert.doesNotMatch(screen, /MyJobsHub/);

  // A row that resolves to nothing is not tappable — a tap that only marks
  // read is the defect this replaced.
  assert.match(screen, /const routable = canRouteNotification\(n\.data\)/);
  // 2026-09-29 (LUX-LIST-2 #8): a row is a feed ENTRY (bids on one job the same day fold into one),
  // and `n` is its lead notification — the one whose route the entry opens.
  assert.match(screen, /const n = entry\.lead;/);
  assert.match(screen, /onPress=\{routable \? \(\) => open\(entry\) : undefined\}/);
  assert.match(screen, /disabled=\{!routable\}/);
});

test('every notification payload the triggers emit resolves to a destination', async () => {
  // The `screen` strings are a contract between the phase20/56/57/61 triggers
  // and lib/notificationRoutes.ts. A payload naming a screen the resolver does
  // not handle is a dead tap by construction, so the inventory is read from
  // the migrations rather than restated here.
  const emitted = new Set();
  for (const file of dir('supabase/archive/phases').filter((f) => f.endsWith('.sql'))) {
    const sql = await read(`supabase/archive/phases/${file}`);
    for (const m of sql.matchAll(/'screen',\s*'([A-Za-z]+)'/g)) emitted.add(m[1]);
  }
  // A scan that found nothing would pass every loop below for the wrong reason.
  assert.ok(emitted.size >= 5, `expected the trigger payload inventory, found ${emitted.size}`);

  const routes = stripComments(await read('lib/notificationRoutes.ts'));
  const mapStart = routes.indexOf('const TAB_FOR_SCREEN');
  const resolverStart = routes.indexOf('function resolveTarget');
  const predicateStart = routes.indexOf('export function canRouteNotification');
  assert.ok(mapStart > 0, 'TAB_FOR_SCREEN must exist');
  assert.ok(resolverStart > mapStart, 'resolveTarget must exist');
  assert.ok(predicateStart > resolverStart, 'canRouteNotification must exist');

  const mapBody = routes.slice(mapStart, routes.indexOf('};', mapStart));
  const resolver = routes.slice(resolverStart, predicateStart);

  for (const screen of emitted) {
    assert.match(mapBody, new RegExp(`\\b${screen}: '`), `${screen} has no owning tab`);
    assert.ok(
      resolver.includes(`'${screen}'`),
      `${screen} is mapped to a tab but resolveTarget never handles it`
    );
  }

  // The feed's tappability predicate and the dispatcher are the SAME rule, so
  // they cannot disagree about what is reachable.
  assert.match(
    routes,
    /export function canRouteNotification\(raw: unknown\): boolean \{\s*return resolveTarget\(toNotificationData\(raw\)\) !== null;/
  );
  assert.match(routes, /const target = resolveTarget\(data\);/);
  // A screen listed in the map but unhandled by the resolver fails closed:
  // the last statement before the closing brace is a bare `return null`.
  assert.match(resolver, /return null;\s*\}\s*$/);

  // Mode boundary: every destination lives in a tab mounted in BOTH trees, so
  // no feed tap needs switchMode() and none can navigate cross-tree. Home is
  // the mode-defining tab — routing there would require a silent mode change.
  const tabs = new Set([...mapBody.matchAll(/:\s*'(\w+)'/g)].map((m) => m[1]));
  assert.deepEqual([...tabs].sort(), ['Messages', 'MyJobs', 'Profile']);
});

test('notificationRoutes still owns the screen→tab contract', async () => {
  const routes = stripComments(await read('lib/notificationRoutes.ts'));
  // The two screens the feed now delegates must actually be routable there.
  assert.match(routes, /ClientJobDetail: 'MyJobs'/);
  assert.match(routes, /JobDetail: 'MyJobs'/);
  assert.match(routes, /navigateChecked\('MyJobs', 'ClientJobDetail', \{ job \}\)/);
});

// ---------------------------------------------------------------------------
// 3b — incoming counter-offers are addressed by first name
// ---------------------------------------------------------------------------

test('the worker job detail names an incoming counter by first name', async () => {
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));
  const copy = stripComments(await read('lib/offerCopy.ts'));

  assert.match(
    detail,
    /const posterFirstName =\s*\n?\s*poster\?\.full_name\?\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \|\| 'The customer';/
  );
  // The heading moved into the shared actionable card, which the screen hands
  // that same first name — the wording itself now has exactly one definition.
  assert.match(detail, /senderFirstName=\{posterFirstName\}/);
  // 2026-09-28 (#64, M-17): sentence case, the worker's noun.
  assert.match(copy, /`\$\{senderFirstName\} sent you a counter-offer`/);
  // The full-name form must not come back.
  assert.doesNotMatch(detail, /\{poster\?\.full_name \?\? 'The customer'\} countered/);
});

test('the My Jobs hub names an incoming counter by first name', async () => {
  const hub = stripComments(await read('screens/MyJobsHubScreen.tsx'));

  assert.match(hub, /const clientFirstName =\s*\n?\s*clientName\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \|\| clientName;/);
  // 2026-09-28 (#64, M-17): the card's own spelling, sentence case.
  assert.match(hub, /\$\{clientFirstName\} sent you a counter-offer — respond/);
  assert.doesNotMatch(hub, /\$\{clientName\} countered/);
});

test('phase62 rewrites only the notification copy, keeping phase59’s guards', async () => {
  const sql = await read('supabase/archive/phases/phase62_counter_notification_copy.sql');

  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
  assert.match(sql, /create or replace function public\.notify_on_offer_counter\(\)/);

  // First name only, via split_part, with notify_display_name's own fallback
  // preserved for a one-word or missing name.
  assert.match(sql, /split_part\(btrim\(v_author_name\), ' ', 1\)/);
  assert.match(sql, /v_author_first \|\| ' sent you a Counteroffer for \$'/);
  assert.doesNotMatch(sql, /\|\| ' countered \$'/);

  // Everything else phase59 established is still there.
  assert.match(sql, /new\.parent_offer_id is null/);
  assert.match(sql, /new\.offer_type <> 'marketplace_bid'/);
  assert.match(sql, /'offer_countered:' \|\| new\.id::text/);
  assert.match(sql, /'ClientJobDetail'/);
  assert.match(sql, /'JobDetail'/);
  assert.match(
    sql,
    /revoke all on function public\.notify_on_offer_counter\(\) from public, anon, authenticated;/
  );
  // The amount must survive the rewrite — money copy has to stay true.
  assert.match(sql, /to_char\(round\(new\.amount_cents \/ 100\.0, 2\), 'FM999999990\.00'\)/);
});

// ---------------------------------------------------------------------------
// 3c — "Your move" survives a failed refetch
// ---------------------------------------------------------------------------
//
// viewerOwesResponse is derived purely from the canonical row, so a re-render
// cannot lose it. A refetch could: refreshMyOffer() runs on every focus and
// used to write the read's null straight through, so one failed read erased
// the respond card and its badge entirely.

test('a failed offer refetch keeps the last known respond card', async () => {
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));

  const start = detail.indexOf('const refreshMyOffer = useCallback');
  assert.ok(start > 0, 'refreshMyOffer must exist');
  // From its declaration to the focus effect that CALLS it — not the import of
  // useFocusEffect at the top of the file, which sits before it.
  const refresh = detail.slice(start, detail.indexOf('useFocusEffect(', start));
  assert.ok(refresh.length > 0, 'refreshMyOffer body must be bounded by its focus effect');

  // The read's error is inspected, and a failure returns BEFORE any setState.
  assert.match(refresh, /const \{ data, error \} = await fetchMyOfferForJob\(user\.id, job\.id\);/);
  const errorGuard = refresh.indexOf('if (error)');
  const firstWrite = refresh.indexOf('setExistingBid(data)');
  assert.ok(errorGuard > 0, 'the failed read must be handled');
  assert.ok(
    errorGuard < firstWrite,
    'the error guard must precede the write, or a failed read still clears the card'
  );
  assert.match(refresh, /if \(error\) \{[\s\S]*?return;\s*\}/);

  // Same for the chain read, whose [] would silently restore a full counter
  // allowance.
  assert.match(refresh, /const \{ data: chainRows, error: chainError \}/);
  assert.match(refresh, /if \(chainError\) \{[\s\S]*?return;\s*\}/);
});

test('the badge itself is derived, never stored', async () => {
  const detail = stripComments(await read('screens/JobDetailScreen.tsx'));

  // Whose move comes from the row, recomputed on every render — there is no
  // separate piece of state that could drift out of agreement with it.
  assert.match(
    detail,
    /const viewerOwesResponse =\s*\n?\s*!!activeBid && !!user && !viewerAuthoredBid && activeBid\.awaiting_id === user\.id;/
  );
  // The badge is rendered by the shared actionable card, which exists only
  // while the viewer owes the reply — so it still cannot be stored state.
  assert.match(detail, /<OfferResponseActions/);
  const actions = stripComments(await read('components/OfferResponseActions.tsx'));
  assert.match(actions, /<StatusBadge status="pending" label=\{YOUR_MOVE_BADGE_LABEL\} \/>/);
  assert.match(
    stripComments(await read('lib/offerCopy.ts')),
    /export const YOUR_MOVE_BADGE_LABEL = 'Your move';/
  );
  assert.doesNotMatch(detail, /useState[^\n]*viewerOwesResponse/);
});
