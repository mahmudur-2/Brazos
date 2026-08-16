import test from 'node:test';
import assert from 'node:assert/strict';
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
