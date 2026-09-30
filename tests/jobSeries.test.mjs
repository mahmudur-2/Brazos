// 2026-09-30 (the build run, idea 14) — REPEAT JOBS: post once; three days before each next visit the
// worker you hired gets it first at the same price for 24 hours; a pass or a lapse opens that visit to
// bids. Every visit is its own job; the money rules do not move. The server is proven on the local
// stack in supabase/tests/180_job_series.sql; these fences hold its shape and the app's side.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CADENCE_LABELS, SERIES_CADENCES, seriesLine, visitDayLabel } from '../lib/repeatJobs.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');
const MIGRATION = 'supabase/migrations/20260930001000_job_series.sql';

test('[executed] the words: three cadences as drawn, and the one line each person reads', () => {
  assert.deepEqual([...SERIES_CADENCES], ['weekly', 'biweekly', 'monthly']);
  assert.equal(CADENCE_LABELS.biweekly, 'Every 2 weeks', 'the drawn "Repeat this job · Every 2 weeks"');
  assert.equal(visitDayLabel('2026-10-20'), 'Tue, Oct 20', 'a plain calendar date, local parts');
  const active = { cadence: 'biweekly', next_visit_date: '2026-10-20', status: 'active' };
  assert.equal(seriesLine(active, 'customer'), 'Repeats every 2 weeks · next visit Tue, Oct 20');
  assert.equal(seriesLine(active, 'worker'), 'Repeats every 2 weeks · you get each visit first');
  assert.equal(
    seriesLine({ ...active, next_visit_date: null }, 'customer'),
    'Repeats every 2 weeks · counts from the day this visit is done',
    'a flexible first visit sets no date yet'
  );
  assert.equal(seriesLine({ ...active, status: 'stopped' }, 'customer'), 'Repeat stopped');
  assert.equal(seriesLine({ ...active, status: 'anything else' }, 'worker'), 'Repeat stopped', 'an allow-list: only active repeats');
});

test('[static] the money rules do not move: offers through create_offer(), posts through create_job(), hires through accept_offer()', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /v_offer := public\.create_offer\(/, 'a first refusal is an ordinary direct offer');
  assert.match(sql, /v_job := public\.create_job\(/, 'a visit to bids is an ordinary post');
  assert.doesNotMatch(sql, /function public\.(accept_offer|create_offer|create_job|transition_job_status)\(/, 'none of them is redefined');
  assert.doesNotMatch(sql, /update public.jobss+set[^;]*(status|assigned_worker_id|accepted_offer_id|final_amount_cents)s*=/, 'no visit is assigned or moved here');
  assert.doesNotMatch(sql, /(insert into|update)s+public.payments|begin_job_payment|payment_intent/i, 'nothing is charged: the customer confirms in Checkout');
  // The customer's push asks them to confirm the all-in total, from the one price arithmetic.
  assert.match(sql, /from public\.quote_job_price\(coalesce\(new\.final_amount_cents, v_offer\.amount_cents\)\) q;/);
  assert.match(sql, /'Confirm ' \|\| public\.money_label\(v_total\)/);
  assert.match(sql, /jsonb_build_object\('screen', 'ClientJobDetail', 'jobId', new\.id::text, 'intent', 'checkout'\)/);
});

test('[static] the visit rules as drawn: three days before, 24 hours, the same worker at the same price, daytime only', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /if v_today < v_visit - 3 then/, 'from three days before the visit');
  assert.match(sql, /update public\.job_offers set expires_at = now\(\) \+ interval '24 hours' where id = v_offer;/);
  assert.match(sql, /and now\(\) < v_root\.created_at \+ interval '24 hours' then/, 'a counter never outlives the 24 hours');
  assert.match(sql, /p_amount_cents => p_series\.price_cents,/);
  assert.match(sql, /p_worker_id => p_series\.worker_id,/);
  assert.match(sql, /if extract\(hour from v_local\) < 9 or extract\(hour from v_local\) >= 21 then\s*return 0;/, 'never at 3 am');
  assert.match(sql, /exit when v_visit >= v_today \+ 2;/, 'a day already too close is skipped, never rushed');
  assert.match(sql, /if exists \(select 1 from public\.jobs j where j\.series_id = v_id and j\.status = 'open'\) then/, 'never two posts waiting');
  assert.match(sql, /perform cron\.schedule\('brazos-job-series', '17 \* \* \* \*',/);
  assert.match(sql, /when 'monthly' then \(p_anchor \+ make_interval\(months => p_visit\)\)::date/, 'from the anchor: no drift');
  // A lapse expires the canonical way; a series' own moments do not double-buzz as "New message".
  assert.match(sql, /perform public\.expire_offer_if_stale\(v_offer\);/);
  assert.match(sql, /if coalesce\(current_setting\('brazos\.series_offer', true\), ''\) = 'on' then/);
  assert.match(sql, /and new\.request_event <> 'countered' then/, 'a counter keeps its push');
});

test('[static] allow-lists, RLS and the ACLs (CLAUDE.md section Supabase)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /constraint job_series_cadence_known check \(cadence in \('weekly', 'biweekly', 'monthly'\)\)/);
  assert.match(sql, /constraint job_series_status_known check \(status in \('active', 'stopped'\)\)/);
  assert.match(sql, /if v_job\.visibility <> 'open_market'\s*or v_job\.status not in \('open', 'assigned', 'in_progress', 'completed'\) then/);
  assert.match(sql, /revoke all on table public\.job_series from public, anon, authenticated, service_role;\s*grant select on table public\.job_series to authenticated, service_role;/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = client_id or \(select auth\.uid\(\)\) = worker_id\);/);
  for (const fn of ['start_job_series(uuid, text)', 'stop_job_series(uuid)', 'drop_series_worker(uuid)']) {
    const name = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name} from public, anon;\\s*grant execute on function public\\.${name} to authenticated;`), fn);
  }
  for (const fn of ['advance_job_series(timestamptz)', 'install_series_schedule()']) {
    const name = fn.replace(/[()]/g, (c) => `\\${c}`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name} from public, anon, authenticated;\\s*grant execute on function public\\.${name} to service_role;`), fn);
  }
  for (const fn of ['series_offer_visit(public.job_series, date)', 'series_open_visit(public.job_series, date, uuid)', 'series_close_offers(uuid, uuid)', 'series_on_visit_change()', 'series_visit_date(date, text, integer)', 'money_label(integer)', 'notify_on_message()']) {
    const name = fn.replace(/[().]/g, (c) => `\\${c}`);
    assert.match(sql, new RegExp(`revoke all on function public\\.${name} from public, anon, authenticated;`), fn);
  }
  assert.match(read('supabase/tests/040_authz.sql'), /drop_series_worker, get_my_active_mode/, 'the authz roster names the three');
  assert.match(read('supabase/tests/180_job_series.sql'), /select plan\(50\);/);
});

test('[static] the app: the Review row, the start after publishing, each visit\'s line, and Confirm opening Checkout', () => {
  const post = flat(read('screens/PostJobScreen.tsx'));
  assert.match(post, /const \[repeatCadence, setRepeatCadence\] = useState<SeriesCadence \| null>\(null\);/, 'off by default');
  assert.match(post, /\{isFreshPost \? \( <View> <Pressable onPress=\{\(\) => setRepeatOpen\(\(open\) => !open\)\}/);
  assert.match(post, /<Text style=\{styles\.todayTitle\}>Repeat this job<\/Text>/);
  assert.match(post, /\{repeatCadence \? CADENCE_LABELS\[repeatCadence\] : 'Off'\}/);
  // The choices open in place as a tick list — Off first, then the three cadences.
  assert.match(post, /\{\[null, \.\.\.SERIES_CADENCES\]\.map\(\(cadence\) => \{/);
  assert.match(post, /\{chosen \? <Ionicons name="checkmark" size=\{18\} color=\{colors\.emerald\} \/> : null\}/);
  assert.match(post, /if \(draftUserId\) void clearPostJobDraft\(draftUserId\); \/\/ Idea 14: the live job becomes the series' first visit\. It is posted whatever happens here\. if \(savedJob && isFreshPost && repeatCadence\) void startRepeat\(savedJob\.id, repeatCadence\);/);
  assert.match(post, /title: 'The repeat didn’t save',/, 'a failed start is said, with Try again');
  const client = flat(read('screens/ClientJobDetailScreen.tsx'));
  assert.match(client, /<RepeatNote series=\{series\} perspective="customer" busy=\{stoppingSeries\} onEnd=\{\(\) => void handleStopSeries\(\)\} \/>/);
  assert.match(client, /if \(params\.intent !== 'checkout' \|\| checkoutIntentRef\.current \|\| !paymentRead\) return; checkoutIntentRef\.current = true; if \(canFundNow && paymentsEnabled\) navigation\.navigate\('Checkout', \{ job \}\);/);
  assert.match(client, /title: 'Stop repeating\?',/);
  const worker = flat(read('screens/WorkerJobScreen.tsx'));
  assert.match(worker, /<RepeatNote series=\{series\} perspective="worker" busy=\{droppingSeries\} onEnd=\{\(\) => void handleDropSeries\(\)\} \/>/);
  assert.match(worker, /title: 'Drop future visits\?',/);
  const routes = read('lib/notificationRoutes.ts');
  assert.match(routes, /const intent = data\.screen === 'ClientJobDetail' && data\.intent === 'checkout' \? \{ intent: 'checkout' as const \} : \{\};/, 'an allow-list of one');
  const jobs = read('lib/jobs.ts');
  assert.match(jobs, /series_id: row\.series_id \?\? null,/);
  assert.match(read('lib/jobSeries.ts'), /supabase\.rpc\('start_job_series', \{ p_job_id: jobId, p_cadence: cadence \}\)/);
  assert.doesNotMatch(read('lib/repeatJobs.ts'), /^import /m, 'the words are pure');
});
