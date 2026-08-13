import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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

test('the notifications feed opens job-detail payloads on the job itself', async () => {
  const screen = stripComments(await read('screens/NotificationsScreen.tsx'));

  assert.match(screen, /screen === 'ClientJobDetail' \|\| screen === 'JobDetail'/);
  // Routed through the canonical push router, which loads the job row those
  // two screens take as a param — rather than a second copy of that logic.
  assert.match(screen, /handleNotificationData\(notification\.data\)/);
  assert.match(
    screen,
    /import \{ handleNotificationData \} from '\.\.\/lib\/notificationRoutes';/
  );

  // Chat still goes to Messages, and the hub stays the fallback for payloads
  // that name no job screen.
  assert.match(screen, /navigateAcrossTabs\('Messages', 'Chat', \{ jobId \}\)/);
  assert.match(screen, /navigateAcrossTabs\('MyJobs', 'MyJobsHub'\)/);
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
  assert.match(copy, /`\$\{senderFirstName\} sent you a Counteroffer`/);
  // The full-name form must not come back.
  assert.doesNotMatch(detail, /\{poster\?\.full_name \?\? 'The customer'\} countered/);
});

test('the My Jobs hub names an incoming counter by first name', async () => {
  const hub = stripComments(await read('screens/MyJobsHubScreen.tsx'));

  assert.match(hub, /const clientFirstName =\s*\n?\s*clientName\.trim\(\)\.split\(\/\\s\+\/\)\[0\] \|\| clientName;/);
  assert.match(hub, /\$\{clientFirstName\} sent you a Counteroffer — respond/);
  assert.doesNotMatch(hub, /\$\{clientName\} countered/);
});

test('phase62 rewrites only the notification copy, keeping phase59’s guards', async () => {
  const sql = await read('supabase/phase62_counter_notification_copy.sql');

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
