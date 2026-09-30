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
  // Two texts (the Fable review): what repeats, then what it means for the reader.
  assert.deepEqual(seriesLine(active, 'customer'), { title: 'Repeats every 2 weeks', caption: 'Next visit Tue, Oct 20' });
  assert.deepEqual(seriesLine(active, 'worker'), { title: 'Repeats every 2 weeks', caption: 'You get each visit first' });
  assert.deepEqual(
    seriesLine({ ...active, next_visit_date: null }, 'customer'),
    { title: 'Repeats every 2 weeks', caption: 'Counts from the day this visit is done' },
    'a flexible first visit sets no date yet'
  );
  assert.deepEqual(seriesLine({ ...active, status: 'stopped' }, 'customer'), { title: 'Repeat stopped', caption: null });
  assert.deepEqual(seriesLine({ ...active, status: 'anything else' }, 'worker'), { title: 'Repeat stopped', caption: null }, 'an allow-list: only active repeats');
});

test('[static] the money rules do not move: offers through create_offer(), posts through create_job(), hires through accept_offer()', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /v_offer := public\.create_offer\(/, 'a first refusal is an ordinary direct offer');
  assert.match(sql, /v_job := public\.create_job\(/, 'a visit to bids is an ordinary post');
  assert.doesNotMatch(sql, /function public\.(accept_offer|create_offer|create_job|transition_job_status)\(/, 'none of them is redefined');
  // The group 4 review: these two fences had lost their escapes and could never fail — each now has a
  // positive control proving it catches the shape it forbids.
  const assignsVisit = /update public\.jobs\s+set[^;]*\b(status|assigned_worker_id|accepted_offer_id|final_amount_cents)\s*=/;
  assert.match("update public.jobs set status = 'assigned' where id = x;", assignsVisit, 'control: the fence catches a status write');
  assert.doesNotMatch(sql, assignsVisit, 'no visit is assigned or moved here');
  const chargesCard = /(insert into|update)\s+public\.payments\b|begin_job_payment|payment_intent/i;
  assert.match('update public.payments set status = 1;', chargesCard, 'control: the fence catches a payments write');
  assert.doesNotMatch(sql, chargesCard, 'nothing is charged: the customer confirms in Checkout');
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
  // Only a post for a day still to come holds the next visit back — and never the first refusal (the
  // group 4 review); the customer is told the visit was skipped.
  assert.match(sql, /where j\.series_id = v_id and j\.status = 'open' and j\.scheduled_date >= v_today/, 'a stale post never blocks the series');
  assert.match(sql, /'series_skipped',/);
  assert.match(sql, /perform cron\.schedule\('brazos-job-series', '17 \* \* \* \*',/);
  assert.match(sql, /when 'monthly' then \(p_anchor \+ make_interval\(months => p_visit\)\)::date/, 'from the anchor: no drift');
  // A lapse expires the canonical way; a series' own moments do not double-buzz as "New message".
  assert.match(sql, /perform public\.expire_offer_if_stale\(v_offer\);/);
  assert.match(sql, /if new\.request_event = 'created' and coalesce\(current_setting\('brazos\.series_offer', true\), ''\) = 'on' then/, 'the offer being written: its own created event alone');
  // An allow-list of the events the series says itself (the group 4 review); stop and drop speak in words.
  assert.match(sql, /if new\.request_event in \('created', 'accepted', 'declined'\) then/);
  assert.match(sql, /and \(new\.request_event <> 'declined' or o\.author_id = j\.client_id\);/, 'the customer turning down a counter still tells the worker');
  assert.match(sql, /if coalesce\(current_setting\('brazos\.series_quiet', true\), ''\) = 'on' then/);
  assert.match(sql, /'series_stopped',/, 'the worker is told when the customer stops');
});

test('[static] allow-lists, RLS and the ACLs (CLAUDE.md section Supabase)', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /constraint job_series_cadence_known check \(cadence in \('weekly', 'biweekly', 'monthly'\)\)/);
  assert.match(sql, /constraint job_series_status_known check \(status in \('active', 'stopped'\)\)/);
  assert.match(sql, /if v_job\.visibility <> 'open_market'\s*or v_job\.status not in \('open', 'assigned', 'in_progress', 'completed'\) then/);
  assert.match(sql, /revoke all on table public\.job_series from public, anon, authenticated, service_role;\s*grant select on table public\.job_series to service_role;/);
  // The group 4 review: the two people read the series, not its bookkeeping.
  assert.match(sql, /grant select \(id, client_id, origin_job_id, cadence, anchor_date, next_visit_no, next_visit_date,\s*worker_id, price_cents, pending_job_id, status, stopped_at, created_at, updated_at\)\s*on public\.job_series to authenticated;/);
  assert.match(sql, /dropped_worker_ids uuid\[\] not null default '\{\}',/, 'every worker who ever dropped the series');
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
  assert.match(read('supabase/tests/180_job_series.sql'), /select plan\(58\);/);
});

test('[static] the app: the Review row, the start after publishing, each visit\'s line, and Confirm opening Checkout', () => {
  const post = flat(read('screens/PostJobScreen.tsx'));
  assert.match(post, /const \[repeatCadence, setRepeatCadence\] = useState<SeriesCadence \| null>\(null\);/, 'off by default');
  assert.match(post, /\{isFreshPost \? \( <View> <Pressable onPress=\{\(\) => \{ const opening = !repeatOpen; setRepeatOpen\(opening\); if \(opening\) revealInView\(repeatRef\); \}\}/);
  assert.match(post, /<Text style=\{styles\.todayTitle\}>Repeat this job<\/Text>/);
  assert.match(post, /\{repeatCadence \? CADENCE_LABELS\[repeatCadence\] : 'Off'\}/);
  // The choices open in place as a tick list — Off first, then the three cadences.
  assert.match(post, /\{\[null, \.\.\.SERIES_CADENCES\]\.map\(\(cadence\) => \{/);
  // The tick first, in the row's icon column, as the price list's (the Fable review).
  assert.match(post, /<View style=\{styles\.repeatTick\}> \{chosen \? <Ionicons name="checkmark" size=\{16\} color=\{colors\.emerald\} \/> : null\} <\/View>/);
  assert.match(post, /if \(draftUserId\) void clearPostJobDraft\(draftUserId\); \/\/ Idea 14: the live job becomes the series' first visit\. It is posted whatever happens here\. if \(savedJob && isFreshPost && repeatCadence\) void startRepeat\(savedJob\.id, repeatCadence\);/);
  assert.match(post, /title: 'The repeat didn’t save',/, 'a failed start is said, with Try again');
  const client = flat(read('screens/ClientJobDetailScreen.tsx'));
  assert.match(client, /<RepeatNote series=\{series\} perspective="customer" busy=\{stoppingSeries\} onEnd=\{\(\) => void handleStopSeries\(\)\} \/>/);
  // The group 4 review: the jump waits for the ledger AND the payment settings.
  assert.match(client, /if \(params\.intent !== 'checkout' \|\| checkoutIntentRef\.current \|\| !paymentRead \|\| !configRead\) return; checkoutIntentRef\.current = true; if \(canFundNow && paymentsEnabled\) navigation\.navigate\('Checkout', \{ job \}\);/);
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
