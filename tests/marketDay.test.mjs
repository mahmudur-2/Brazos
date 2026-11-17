import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, read } from './loadModule.mjs';

/**
 * C9 (A4-M4) — every "today" in the app is the MARKET's day (America/New_York, as the server decides
 * it), never the phone's. This file runs the phone in Honolulu (UTC-10, no clock change), six hours
 * behind New York in September, so the two calendars disagree every evening. The zone is set before
 * any module loads (each test file is its own process).
 */
process.env.TZ = 'Pacific/Honolulu';

const time = await import('../lib/time.ts');
const stubs = { './time': time };
const filters = await loadModule('lib/jobFilters.ts', stubs);
const { showsTodayPill } = await loadModule('lib/neededToday.ts', stubs);
const { feedDayLabel } = await loadModule('lib/notificationGroups.ts', stubs);
const late = await loadModule('lib/runningLate.ts', stubs);

/** 05:00 UTC on 20 September: 1 am on the 20th in New York, 7 pm on the 19th on this phone. */
const AT = new Date('2026-09-20T05:00:00Z');

test('C9: the phone really is on the 19th while New York is on the 20th (the test is not vacuous)', () => {
  assert.equal(AT.getDate(), 19, 'the test process runs in Honolulu');
  assert.equal(AT.getHours(), 19);
  assert.equal(time.MARKET_TIME_ZONE, 'America/New_York');
  assert.equal(late.MARKET_TIME_ZONE, time.MARKET_TIME_ZONE, 'one zone, re-exported');
});

test('C9: Today, Tomorrow, the When presets and the Custom list follow the market, not the phone', () => {
  assert.equal(time.marketDayKey(AT), '2026-09-20');
  assert.equal(time.marketDayKey(AT, 1), '2026-09-21');
  assert.equal(filters.localDateKey(AT), '2026-09-20');
  assert.equal(filters.localDateKeyAfter(AT, 1), '2026-09-21');
  assert.deepEqual(filters.dateWindowPreset('today', AT), { scheduledOn: '2026-09-20', scheduledUntil: null });
  assert.deepEqual(filters.dateWindowPreset('tomorrow', AT), { scheduledOn: '2026-09-21', scheduledUntil: null });
  assert.deepEqual(filters.dateWindowPreset('week', AT), { scheduledOn: '2026-09-20', scheduledUntil: '2026-09-26' });
  assert.equal(filters.customDateKeys(AT)[0], '2026-09-21');
  assert.equal(filters.scheduledDayLabel('2026-09-20', AT), 'Today');
  assert.equal(filters.scheduledDayLabel('2026-09-21', AT), 'Tmrw');
  assert.notEqual(filters.scheduledDayLabel('2026-09-19', AT), 'Today', 'the phone’s date is not the market’s today');
  // Running late already read the market's day (A20); it still agrees with the rest.
  assert.equal(late.isLateDay('2026-09-20', AT), true);
  assert.equal(late.marketDate(AT), time.marketDayKey(AT));
});

test('C9: the Today pill ends at the market’s midnight', () => {
  // 11:30 pm on the 19th in New York (5:30 pm on the phone, the same phone day as AT): yesterday.
  assert.equal(showsTodayPill({ needed_today: true, created_at: '2026-09-20T03:30:00Z' }, AT), false);
  // 12:30 am on the 20th in New York (6:30 pm on the 19th on the phone): today.
  assert.equal(showsTodayPill({ needed_today: true, created_at: '2026-09-20T04:30:00Z' }, AT), true);
});

test('C9: the feed counts market calendar days, right across the 2026-11-01 clock change (a 25-hour day)', () => {
  assert.equal(feedDayLabel('2026-09-20T03:30:00Z', AT), 'Yesterday', '11:30 pm on the 19th in New York');
  assert.equal(feedDayLabel('2026-09-20T04:30:00Z', AT), 'Today');

  const now = new Date('2026-11-02T17:00:00Z'); // noon EST on Monday 2 November
  const cases = [
    ['2026-11-02T05:00:00Z', 'Today'], // midnight EST, 2 November
    ['2026-11-02T04:59:00Z', 'Yesterday'], // 11:59 pm EST, 1 November
    ['2026-11-01T04:00:00Z', 'Yesterday'], // midnight EDT, 1 November: 25 hours before 2 November began
    ['2026-11-01T03:59:00Z', 'This week'], // 11:59 pm EDT, 31 October
    ['2026-10-27T04:00:00Z', 'This week'], // midnight EDT, 27 October: six days back
    ['2026-10-27T03:59:00Z', 'Earlier'], // 11:59 pm EDT, 26 October: seven days back
  ];
  for (const [iso, label] of cases) assert.equal(feedDayLabel(iso, now), label, iso);
  assert.equal(feedDayLabel('not a date', now), 'Earlier', 'an unreadable time is never Today');
});

test('C9: marketDayKey steps calendar days, so a clock change neither skips nor repeats one', () => {
  // 24 hours after 12:30 am EDT on 1 November is 11:30 pm EST on 1 November — still the 1st.
  const firstOfNovember = new Date('2026-11-01T04:30:00Z');
  assert.equal(time.marketDayKey(new Date(firstOfNovember.getTime() + 24 * 3600e3)), '2026-11-01');
  assert.equal(time.marketDayKey(firstOfNovember, 1), '2026-11-02', 'one calendar day on');
  // Spring forward (14 March 2027, a 23-hour day) and a year's end.
  assert.equal(time.marketDayKey(new Date('2027-03-14T04:30:00Z'), 1), '2027-03-14', '11:30 pm EST on the 13th, plus one day');
  assert.equal(time.marketDayKey(new Date('2026-12-31T17:00:00Z'), 1), '2027-01-01');
  assert.equal(time.marketDaysBetween(firstOfNovember, new Date('2026-11-02T05:00:00Z')), 1);
});

test('C9 (A4-M5b): the cancel rules mirror the one market zone; the copy fails here the day it drifts', async () => {
  // lib/paymentRules.ts imports types only (D24), so its zone is a copy of MARKET_TIME_ZONE, not an import.
  const rules = read('lib/paymentRules.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const copy = /^const CANCEL_MARKET_TIME_ZONE = '([^']+)';$/m.exec(rules);
  assert.ok(copy, 'the copy is found');
  assert.equal(copy[1], time.MARKET_TIME_ZONE, 'the cancel rules read the same zone as every "today" in the app');
  assert.match(rules, /timeZone: CANCEL_MARKET_TIME_ZONE,/, 'the wall clock reads the copy');
  assert.equal(rules.match(/timeZone:/g)?.length, 1, 'no other zone is written in the file');
  // Executed: midnight of 20 September in the market zone is 04:00 UTC (EDT), whatever the phone's zone.
  const { marketWallClockMs } = await import('../lib/paymentRules.ts');
  assert.equal(marketWallClockMs('2026-09-20', 0), Date.parse('2026-09-20T04:00:00Z'));
});

test('C9 (A4 wiring A3): Post a job dates its day chips, "Need It Today" and a resumed draft by the market day', () => {
  const post = read('screens/PostJobScreen.tsx');
  assert.match(post, /import \{ dateOfDayKey, formatDay, marketDayKey \} from '\.\.\/lib\/time';/);
  assert.match(post, /const iso = marketDayKey\(now, i\);\s*const d = dateOfDayKey\(iso\)!;/);
  assert.match(post, /return \{ iso, label \};/);
  assert.match(post, /draft\.scheduledDate && draft\.scheduledDate >= marketDayKey\(\)/);
  assert.equal(post.match(/marketDayKey\(\)/g)?.length, 4, 'the toggle, its guard, the draft and the chips\' key');
  assert.doesNotMatch(post, /function toLocalIsoDate/);
});
