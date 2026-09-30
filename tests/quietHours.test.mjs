// 2026-09-30 (the build run, idea 7) — QUIET HOURS: midnight to 6 am on the person's own clock, OFF
// until switched on; nearby-job alerts wait until 6 am, their own jobs and money still come through.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { deviceTimeZone, QUIET_HOURS_HINT, QUIET_HOURS_LABEL } from '../lib/quietHours.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

test('[executed] the phone\'s zone: its IANA name, else a whole-hour fixed offset, else none', () => {
  assert.equal(deviceTimeZone(() => 'America/New_York', 240), 'America/New_York');
  assert.equal(deviceTimeZone(() => undefined, 240), 'Etc/GMT+4', 'UTC−4 is Etc/GMT+4 — the Etc names invert the sign');
  assert.equal(deviceTimeZone(() => undefined, -300), 'Etc/GMT-5');
  assert.equal(deviceTimeZone(() => undefined, 0), 'Etc/GMT');
  assert.equal(deviceTimeZone(() => undefined, -330), null, 'a half-hour offset has no Etc zone: no quiet hours rather than a wrong midnight');
  assert.equal(deviceTimeZone(() => { throw new Error('no Intl'); }, 300), 'Etc/GMT+5');
  assert.equal(deviceTimeZone(() => 'not a zone; drop table', 240), 'Etc/GMT+4', 'a malformed name is never sent');
  assert.equal(QUIET_HOURS_LABEL, 'Quiet hours');
  assert.equal(QUIET_HOURS_HINT, 'Midnight to 6 am · nearby alerts wait');
});

test('[static] the server: off by default, only nearby alerts wait, the drain waits with them', () => {
  const sql = read('supabase/migrations/20260930000800_quiet_hours.sql');
  assert.match(sql, /add column if not exists quiet_hours boolean not null default false;/);
  assert.match(sql, /if extract\(hour from v_local\) < 6 then/, 'midnight to 6 am');
  assert.match(sql, /exception when others then\s*-- A zone the server does not know never holds an alert back\.\s*return null;/);
  assert.match(sql, /case when p_category = 'nearby_jobs' then public\.quiet_hours_until\(p_recipient\) end/);
  assert.match(sql, /and \(o\.send_after is null or o\.send_after <= now\(\)\)/);
  assert.match(sql, /revoke all on function public\.quiet_hours_until\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.claim_notification_batch\(integer\) to service_role;/);
  assert.doesNotMatch(sql, /function public\.should_notify/, 'the gate is untouched');
  assert.match(read('supabase/tests/160_quiet_hours.sql'), /select plan\(15\);/);
});

test('[static] the app: the row sits with the nearby alerts, and the phone\'s zone goes with the switch', () => {
  const prefs = read('lib/notificationPrefs.ts');
  assert.match(prefs, /home_lat, home_lng, quiet_hours, quiet_tz';/);
  assert.match(flat(prefs), /quiet_hours: false, quiet_tz: null, \};/, 'the client default mirrors the schema: off');
  const screen = flat(read('screens/NotificationSettingsScreen.tsx'));
  assert.match(screen, /persist\(next \? \{ quiet_hours: true, quiet_tz: deviceTimeZone\(\) \} : \{ quiet_hours: false \}, 'quiet_hours'\)/);
  assert.match(screen, /if \(data\?\.quiet_hours && zone && data\.quiet_tz !== zone\) \{/, 'a changed zone follows the phone');
  assert.match(screen, /<Text style=\{styles\.rowLabel\}>\{QUIET_HOURS_LABEL\}<\/Text> <Text style=\{styles\.rowHint\}>\{QUIET_HOURS_HINT\}<\/Text>/);
});
