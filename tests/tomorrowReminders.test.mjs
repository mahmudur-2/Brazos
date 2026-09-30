// 2026-09-30 (the build run, idea 6) — TOMORROW'S JOB REMINDER: the evening before a hired job's
// day, both sides get one push with the job and the time; the worker's carries Message and Route,
// the customer's Message.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ACTION_MESSAGE, ACTION_ROUTE, REMINDER_CATEGORIES, dataForAction } from '../lib/notificationActions.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

test('[executed] a button leads where it says; the plain tap keeps the payload', () => {
  const worker = { screen: 'WorkerJob', jobId: 'j1', categoryId: REMINDER_CATEGORIES.worker };
  assert.deepEqual(dataForAction(worker, ACTION_MESSAGE), { ...worker, screen: 'Chat' });
  assert.deepEqual(dataForAction(worker, ACTION_ROUTE), { ...worker, screen: 'WorkerJob', intent: 'route' });
  assert.equal(dataForAction(worker, 'expo.modules.notifications.actions.DEFAULT'), worker);
  assert.equal(dataForAction(worker, null), worker);
  const noJob = { screen: 'ProfileMain' };
  assert.equal(dataForAction(noJob, ACTION_MESSAGE), noJob, 'a payload with no job has nowhere to message');
  assert.equal(dataForAction(null, ACTION_ROUTE), null);
});

test('[static] the server: tomorrow is the market\'s, only hired jobs, both sides once, the buttons named', () => {
  const sql = read('supabase/migrations/20260930000900_tomorrow_reminders.sql');
  assert.match(sql, /v_tomorrow date := coalesce\(p_today, \(now\(\) at time zone 'America\/New_York'\)::date\) \+ 1;/);
  assert.match(sql, /where j\.status = 'assigned'\s*and j\.scheduled_date = v_tomorrow/);
  assert.match(sql, /'categoryId', 'job_reminder_customer'/);
  assert.match(sql, /'categoryId', 'job_reminder_worker'/);
  assert.match(sql, /'job_reminder:' \|\| v_job\.id::text \|\| ':' \|\| v_job\.client_id::text \|\| ':' \|\| v_tomorrow::text/);
  assert.match(sql, /perform cron\.schedule\('brazos-tomorrow-reminders', '0 22 \* \* \*',/);
  assert.match(sql, /if not public\.pg_function_present\('cron', 'schedule'\) then/);
  assert.match(sql, /revoke all on function public\.enqueue_tomorrow_reminders\(date\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.install_reminder_schedule\(\) to service_role;/);
  assert.match(read('supabase/functions/send-push/index.ts'), /\.\.\.\(typeof row\.data\?\.categoryId === 'string' \? \{ categoryId: row\.data\.categoryId \} : \{\}\),/);
});

test('[static] the app: the buttons registered, both tap paths honour them, Route opens directions once', () => {
  const push = flat(read('lib/pushNotifications.ts'));
  assert.match(push, /setNotificationCategoryAsync\(REMINDER_CATEGORIES\.worker, \[ \{ identifier: ACTION_MESSAGE, buttonTitle: 'Message'/);
  assert.match(push, /\{ identifier: ACTION_ROUTE, buttonTitle: 'Route', options: \{ opensAppToForeground: true \} \}/);
  assert.match(push, /setNotificationCategoryAsync\(REMINDER_CATEGORIES\.customer, \[ \{ identifier: ACTION_MESSAGE/);
  const hook = read('hooks/usePushNotifications.ts');
  assert.equal(
    (hook.match(/handleNotificationData\(dataForAction\(response\.notification\.request\.content\.data, response\.actionIdentifier\), modeBridge\)/g) ?? []).length,
    2,
    'the cold start and the warm tap both read the button'
  );
  const routes = read('lib/notificationRoutes.ts');
  assert.match(routes, /const intent = data\.screen === 'WorkerJob' && data\.intent === 'route' \? \{ intent: 'route' as const \} : \{\};/);
  const screen = flat(read('screens/WorkerJobScreen.tsx'));
  assert.match(screen, /if \(params\.intent !== 'route' \|\| routedRef\.current \|\| !addressLine \|\| job\?\.id !== params\.jobId\) return; routedRef\.current = true; void openDirections\(addressLine\);/);
  // The group 3 review: one screen per job, so tomorrow's Route never reuses today's address.
  const stacks = read('navigation/sharedStacks.tsx');
  assert.match(stacks, /name="WorkerJob" component=\{WorkerJobScreen\} getId=\{\(\{ params \}\) => params\?\.jobId\}/);
  assert.match(stacks, /name="ClientJobDetail" component=\{ClientJobDetailScreen\} getId=\{\(\{ params \}\) => params\?\.job\?\.id\}/);
});
