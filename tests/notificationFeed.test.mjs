import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 12 guards — the notification feed.
 *
 * What must stay true:
 *   1. One event log: the feed reads the SAME outbox the push queue uses —
 *      no parallel notifications table exists anywhere.
 *   2. The recipient's write surface is exactly read_at (table-level UPDATE
 *      revoked, one column granted back).
 *   3. should_notify keeps every preference/mute/block/ban gate and drops
 *      only the push-token gate (feed rows exist without a device).
 *   4. Tap-through goes to the SHARED tabs (MyJobs / Messages), which exist
 *      identically in both modes — no silent mode switch.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');
const dir = (rel) => readdirSync(join(root, rel));

// ---------------------------------------------------------------------------
// The outbox inventory, DECLARED ONCE.
//
// Stage 4A-tail (2026-08-16). Every row below is checked in BOTH directions
// against supabase/*.sql, so this list cannot drift from the database:
//   - a (category, type) pair the migrations emit but this list omits FAILS;
//   - a pair this list declares but no migration emits FAILS.
// Everything else in this file's reconciliation test then keys off the list,
// which means the client maps are compared against the migrations by
// construction rather than against a second hand-written copy.
//
// `category` gates delivery in should_notify(); `type` picks the feed icon;
// `screen` is the tap destination in lib/notificationRoutes.ts. They are three
// different keys and conflating them is what let a dead icon key survive.
// ---------------------------------------------------------------------------
const OUTBOX = [
  // category        type                screen(s)                        prefs column
  ['messages',      'message',          ['Chat'],                         'messages'],
  ['bids',          'bid_received',     ['ClientJobDetail'],              'bids'],
  ['bids',          'bid_competition',  ['JobDetail'],                    'bids'],
  ['bids',          'offer_countered',  ['ClientJobDetail', 'JobDetail'], 'bids'],
  ['job_updates',   'job_assigned',     ['WorkerJob'],                    'job_updates'],
  ['job_updates',   'job_completed',    ['ClientJobDetail'],              'job_updates'],
  ['job_updates',   'review_received',  ['ProfileMain'],                  'job_updates'],
  ['hire_requests', 'hire_request',     ['Chat'],                         'hire_requests'],
  ['hire_requests', 'hire_countered',   ['Chat'],                         'hire_requests'],
  ['hire_requests', 'hire_accepted',    ['Chat'],                         'hire_requests'],
  ['hire_requests', 'hire_declined',    ['Chat'],                         'hire_requests'],
  ['nearby_jobs',   'job_nearby',       ['JobDetail'],                    'nearby_jobs'],
  // phase56's two events are the only UNGATED categories: should_notify()'s
  // case has no 'jobs' arm, so they fall to `else true` and cannot be switched
  // off. Deliberate for money and disputes; recorded so it stays deliberate.
  ['jobs',          'payment_released', ['WorkerJob'],                    null],
  ['jobs',          'dispute_opened',   ['WorkerJob'],                    null],
];

/**
 * Every (category, type) the migrations can write, read out of the SQL rather
 * than restated. enqueue_notification() is the ONLY insert into the outbox, so
 * its call sites are the complete emitting surface.
 *
 * One call site passes `v_type` instead of a literal (phase20's
 * notify_on_job_request, which picks one of four). It is resolved from the
 * assignments inside that same function body — file-wide would be wrong,
 * because other migrations reuse `v_type` for an unrelated offer_type.
 */
async function scanEmitted() {
  const pairs = new Set();
  for (const file of dir('supabase').filter((f) => f.endsWith('.sql'))) {
    const sql = await read(`supabase/${file}`);
    const calls = /enqueue_notification\(\s*[^,()]+,\s*[^,]+?,\s*'([a-z_]+)',\s*(?:'([a-z_]+)'|(v_type))/g;
    for (const m of sql.matchAll(calls)) {
      const [category, literalType, variableType] = [m[1], m[2], m[3]];
      if (literalType) {
        pairs.add(`${category}/${literalType}`);
        continue;
      }
      // Resolve the variable within its own function body.
      const fnStart = sql.lastIndexOf('create or replace function ', m.index);
      assert.ok(fnStart >= 0, `${file}: ${variableType} used outside a function body`);
      const body = sql.slice(fnStart, m.index);
      const assigned = [...body.matchAll(/v_type\s*:=\s*'([a-z_]+)'/g)].map((a) => a[1]);
      assert.ok(
        assigned.length > 0,
        `${file}: ${variableType} is never assigned a literal in its function — the inventory is not statically determinable`
      );
      for (const type of assigned) pairs.add(`${category}/${type}`);
    }
  }
  return pairs;
}

test('one event log — no parallel notifications table', async () => {
  const sql = await read('supabase/phase56_notification_feed.sql');
  assert.ok(!/create table/.test(sql), 'phase56 must not create a new table');
  assert.match(sql, /alter table public\.notification_outbox/);
  const lib = await read('lib/notifications.ts');
  assert.match(lib, /from\('notification_outbox'\)/);
});

test('the recipient writes read_at and nothing else', async () => {
  const sql = await read('supabase/phase56_notification_feed.sql');
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger\s+on public\.notification_outbox from authenticated/);
  assert.match(sql, /grant update \(read_at\) on public\.notification_outbox to authenticated/);
  assert.match(sql, /recipient_id = auth\.uid\(\)/);
});

test('should_notify keeps every social gate, loses only the token gate', async () => {
  const sql = await read('supabase/phase56_notification_feed.sql');
  const fn = sql.slice(sql.indexOf('create or replace function public.should_notify'));
  for (const gate of ['is_blocked_between', 'mutes', 'banned', 'notification_prefs', 'nearby_jobs']) {
    assert.ok(fn.includes(gate), `should_notify must keep the ${gate} gate`);
  }
  assert.ok(!fn.includes('push_tokens'), 'the push-token gate must be gone');
});

test('the two Phase-6 events are wired and deduped', async () => {
  const sql = await read('supabase/phase56_notification_feed.sql');
  assert.match(sql, /payments_notify_release\s+after update on public\.payments/);
  assert.match(sql, /job_disputes_notify\s+after insert on public\.job_disputes/);
  assert.match(sql, /'payment_released:' \|\| new\.id::text/);
  assert.match(sql, /'dispute_opened:' \|\| new\.id::text/);
});

test('the outbox inventory and the migrations agree in BOTH directions', async () => {
  const emitted = await scanEmitted();
  // A scan that found nothing would satisfy every subset check below for the
  // wrong reason.
  assert.ok(emitted.size >= 10, `expected the outbox inventory, found ${emitted.size}`);

  const declared = new Set(OUTBOX.map(([category, type]) => `${category}/${type}`));
  assert.deepEqual(
    [...emitted].sort(),
    [...declared].sort(),
    'OUTBOX must list exactly what enqueue_notification() is called with — no more, no less'
  );
});

test('every emitted category is gated by the notification_prefs column it claims', async () => {
  const phase20 = await read('supabase/phase20_push_notifications.sql');

  // The columns the table actually has.
  const table = phase20.slice(
    phase20.indexOf('create table if not exists public.notification_prefs'),
    phase20.indexOf('alter table public.notification_prefs enable row level security')
  );
  assert.ok(table.length > 0, 'the notification_prefs DDL must be findable');
  const columns = new Set(
    [...table.matchAll(/^\s{2}(\w+) boolean not null/gm)].map((m) => m[1])
  );
  assert.deepEqual(
    [...columns].sort(),
    ['bids', 'hire_requests', 'job_updates', 'messages', 'nearby_jobs'],
    'notification_prefs has exactly five category switches'
  );

  // The arms should_notify() actually branches on. phase56 and phase68 both
  // re-issue the function; the newest definition in the repo is the contract.
  const feed = await read('supabase/phase56_notification_feed.sql');
  const deleted = await read('supabase/phase68_deleted_at_authorization.sql');
  const live = deleted.slice(deleted.indexOf('create or replace function public.should_notify'));
  const gated = new Set([...live.matchAll(/when '([a-z_]+)'\s+then v_prefs\./g)].map((m) => m[1]));
  assert.ok(gated.size > 0, 'should_notify must carry a per-category case');
  assert.ok(
    feed.includes('notification_prefs'),
    'phase56 must keep the preference gate it inherited'
  );

  for (const [category, type, , prefsColumn] of OUTBOX) {
    if (prefsColumn === null) {
      assert.ok(
        !gated.has(category),
        `${category} (${type}) is declared ungated but should_notify branches on it`
      );
      continue;
    }
    assert.ok(columns.has(prefsColumn), `${prefsColumn} is not a notification_prefs column`);
    assert.ok(
      gated.has(category),
      `${category} (${type}) claims the ${prefsColumn} switch but should_notify never reads it`
    );
  }

  // The settings screen must offer exactly the switches that gate something.
  const prefsLib = await read('lib/notificationPrefs.ts');
  const toggles = new Set(
    [...prefsLib.matchAll(/^\s{4}key: '(\w+)',$/gm)].map((m) => m[1])
  );
  assert.deepEqual(
    [...toggles].sort(),
    [...gated].sort(),
    'NOTIFICATION_TOGGLES must offer every gated category and no ungated one'
  );
});

test('every client map over the outbox is reconciled against the inventory', async () => {
  const routes = await read('lib/notificationRoutes.ts');
  const feed = await read('screens/NotificationsScreen.tsx');

  const mapStart = routes.indexOf('const TAB_FOR_SCREEN');
  assert.ok(mapStart > 0, 'TAB_FOR_SCREEN must exist');
  const mapBody = routes.slice(mapStart, routes.indexOf('};', mapStart));
  const registered = new Set([...mapBody.matchAll(/^\s{2}(\w+):\s*'/gm)].map((m) => m[1]));

  const resolverStart = routes.indexOf('function resolveTarget');
  const resolver = routes.slice(
    resolverStart,
    routes.indexOf('export function canRouteNotification')
  );
  assert.ok(resolverStart > mapStart, 'resolveTarget must exist');

  const declaredScreens = new Set(OUTBOX.flatMap(([, , screens]) => screens));

  // Direction 1 — everything the database emits reaches a real destination.
  for (const screen of declaredScreens) {
    assert.ok(registered.has(screen), `${screen} is emitted but has no owning tab`);
    assert.ok(
      resolver.includes(`'${screen}'`),
      `${screen} has a tab but resolveTarget never handles it — a dead tap`
    );
  }

  // Direction 2 — nothing in the client survives that the database cannot
  // emit. This is what catches a case kept alive after its trigger changed.
  for (const screen of registered) {
    assert.ok(declaredScreens.has(screen), `${screen} is routed but no migration emits it`);
  }

  // The feed's icon map keys on `type`, and the same rule applies: a key no
  // trigger emits is a glyph that can never render. `review` was exactly that
  // — phase20's notify_on_review() enqueues `review_received`.
  const iconStart = feed.indexOf('const KIND_ICONS');
  assert.ok(iconStart > 0, 'KIND_ICONS must exist');
  const iconBody = feed.slice(iconStart, feed.indexOf('};', iconStart));
  const iconKeys = [...iconBody.matchAll(/^\s{2}(\w+):\s*'/gm)].map((m) => m[1]);
  assert.ok(iconKeys.length > 0, 'KIND_ICONS must not be empty');

  const declaredTypes = new Set(OUTBOX.map(([, type]) => type));
  for (const key of iconKeys) {
    assert.ok(declaredTypes.has(key), `KIND_ICONS.${key} is a type no migration emits`);
  }
  assert.ok(iconKeys.includes('review_received'), 'the review glyph must key on the emitted type');
  assert.ok(!iconKeys.includes('review'), 'no trigger emits the type `review`');

  // A type with no glyph is fine — it falls back deliberately — but the
  // fallback has to exist, or an unlisted type renders no icon at all.
  assert.match(feed, /KIND_ICONS\[n\.type\] \?\? 'notifications-outline'/);
});

test('tap-through stays inside the shared tabs', async () => {
  const screen = await read('screens/NotificationsScreen.tsx');
  const routes = await read('lib/notificationRoutes.ts');

  // Stage 4A: the feed no longer routes at all. It delegates to the resolver
  // the push tap uses, so its destinations ARE TAB_FOR_SCREEN's — the exact
  // set is asserted in tests/offerCopyAndRouting.test.mjs. What must hold
  // here is that the feed kept none of its own cross-tab dispatch.
  assert.match(screen, /handleNotificationData\(notification\.data\)/);
  assert.doesNotMatch(screen, /navigateAcrossTabs\(/);

  // And that nothing on the tap path can reach the mode-defining Home tab,
  // which is the one destination that would require a mode change.
  const start = routes.indexOf('const TAB_FOR_SCREEN');
  assert.ok(start > 0, 'TAB_FOR_SCREEN must exist');
  const map = routes.slice(start, routes.indexOf('};', start));
  assert.ok(!/'Home'/.test(map), 'a notification must never route to the mode-defining Home tab');

  assert.ok(
    !/switchMode|switchToOtherMode/.test(screen + routes),
    'no silent mode switching from a tap'
  );
});
