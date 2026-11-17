// 2026-09-30 (the build run, idea 12) — "NEED IT TODAY": a toggle on Post a job's Review step, off
// by default; on, nearby workers' alert says so and their job cards show a Today pill — only on the
// day the job was posted. Honest urgency, never fake scarcity.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadModule } from './loadModule.mjs';

// C9 (A4-M4): the day is the market's, from lib/time.ts (import-free).
const { showsTodayPill } = await loadModule('lib/neededToday.ts', { './time': await import('../lib/time.ts') });

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');

test('[executed] the pill shows only for a job needed today, and only on the day it was posted', () => {
  // C9 (A4-M4): fixed instants, read on the market's clock (EDT, UTC-4) whatever zone runs the test.
  const now = new Date('2026-09-30T19:00:00Z'); // 3 pm in New York
  const postedThisMorning = '2026-09-30T12:30:00.000Z'; // 8:30 am in New York
  const postedYesterday = '2026-09-30T03:50:00.000Z'; // 11:50 pm on the 29th in New York
  assert.equal(showsTodayPill({ needed_today: true, created_at: postedThisMorning }, now), true);
  assert.equal(showsTodayPill({ needed_today: true, created_at: postedYesterday }, now), false, 'after midnight "today" has passed');
  assert.equal(showsTodayPill({ needed_today: false, created_at: postedThisMorning }, now), false);
  assert.equal(showsTodayPill({ created_at: postedThisMorning }, now), false, 'an older build\'s row, or a missing column, is not urgent');
  assert.equal(showsTodayPill({ needed_today: true, created_at: 'not a date' }, now), false);
});

test('[static] the migration: additive, defaulted false, the flag LAST on create_job, the alert says so', () => {
  const sql = read('supabase/migrations/20260930000600_needed_today.sql');
  assert.match(sql, /alter table public\.jobs add column if not exists needed_today boolean not null default false;/);
  assert.match(sql, /drop function if exists public\.create_job\(text, text, public\.job_category, text, integer, jsonb, double precision, double precision, jsonb, integer, integer, date, smallint, smallint, text, text\);/);
  assert.match(sql, /p_pricing_mode text default 'open_bids',\s*p_needed_today boolean default false\s*\) returns public\.jobs/);
  assert.match(sql, /revoke all on function public\.create_job\([^)]*boolean\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.create_job\([^)]*boolean\) to authenticated;/);
  assert.match(sql, /case when v_job\.needed_today then 'Needed today near you' else 'New job near you' end,/);
  assert.match(sql, /revoke all on function public\.notify_nearby_for_job\(uuid\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /drop table|drop column|rename to|rename column|truncate|delete from/i, 'additive only');
  assert.match(read('supabase/tests/140_needed_today.sql'), /select plan\(13\);/);
});

test('[static] the app: sent only when on, read on both shapes, a fresh post\'s own toggle', () => {
  const jobs = read('lib/jobs.ts');
  assert.match(jobs, /\.\.\.\(input\.neededToday \? \{ p_needed_today: true \} : \{\}\),/, 'an ordinary post is the call installed builds make');
  assert.match(jobs, /budget_max_cents, pricing_mode, needed_today, scheduled_date,/);
  assert.equal((jobs.match(/needed_today: row\.needed_today === true,/g) ?? []).length, 2, 'mapJobRow and toOpenJob');
  const screen = flat(read('screens/PostJobScreen.tsx'));
  assert.match(screen, /const \[neededToday, setNeededToday\] = useState\(false\);/, 'off by default');
  assert.match(screen, /neededToday: isFreshPost && neededToday,/);
  // The Fable review: the whole row answers a tap.
  assert.match(screen, /<Pressable onPress=\{\(\) => setNeedItToday\(!neededToday\)\} style=\{\(\{ pressed \}\) => \[styles\.todayRow, pressed && styles\.repeatPressed\]\}/);
  assert.match(screen, /<Toggle value=\{neededToday\} onValueChange=\{setNeedItToday\} accessibilityLabel="Need It Today" \/>/);
  // The toggle and the day agree (group 2's review): on sets the day to today; another day turns it off.
  // A4 wiring (A3), C9: "today" is the market's day (lib/time marketDayKey), never the phone's.
  assert.match(screen, /if \(on\) setScheduledDate\(marketDayKey\(\)\);/);
  assert.match(screen, /if \(neededToday && scheduledDate && scheduledDate !== marketDayKey\(\)\) setNeededToday\(false\);/);
  assert.doesNotMatch(screen, /toLocalIsoDate|getFullYear\(\)/, 'no local-calendar day is left in Post a job');
  assert.doesNotMatch(read('lib/postJobDraft.ts'), /neededToday|needed_today/, 'never resumed from a draft: today is the day it goes out');
  // Group 2's review: the radius search's RPC has a fixed column list, so its rows are re-read
  // through the feed's allowlist (the pill survives); and a screen reader hears "needed today" on the
  // card whose label is its title alone.
  assert.match(read('lib/hotspots.ts'), /const \{ data: hydrated, error: hydrateError \} = await fetchOpenJobsByIds\(rows\.map\(\(j\) => j\.id\)\);\s*if \(hydrateError\) return \{ data: rows, error: null \};/);
  assert.match(read('components/WorkerJobCard.tsx'), /accessibilityLabel=\{showsTodayPill\(job\) \? `\$\{job\.title\}, needed today` : job\.title\}/);
  for (const card of ['components/WorkerJobCard.tsx', 'components/BrowseJobCard.tsx']) {
    const source = read(card);
    assert.match(source, /showsTodayPill\(job\)/, `${card} asks the one rule`);
    assert.match(source, /<TodayPill/, `${card} draws the pill`);
  }
});
