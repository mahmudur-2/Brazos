#!/usr/bin/env node
/**
 * Asks the LIVE Supabase database what actually exists, instead of trusting
 * the SQL editor's "Success. No rows returned." message.
 *
 *   node scripts/verify-schema.mjs
 *
 * Works through PostgREST with the app's own publishable key from .env, so it
 * needs no extra credentials. It distinguishes:
 *   * missing table   -> 404, code PGRST205 / 42P01
 *   * missing column  -> 400, code 42703 / PGRST204
 *   * missing RPC     -> 404, code PGRST202
 *   * present         -> 2xx (limit=0 keeps it cheap, and means RLS
 *                        row-visibility can't be mistaken for absence)
 *
 * Exits non-zero if anything is missing, so it can gate a release.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const env = Object.fromEntries(
  readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trimStart().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const BASE = env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = env.SUPABASE_KEY;
if (!BASE || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_KEY in .env');
  process.exit(2);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function checkColumn(table, column) {
  const res = await fetch(
    `${BASE}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=0`,
    { headers }
  );
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  return { ok: false, detail: `${res.status} ${body.code ?? ''} ${body.message ?? ''}`.trim() };
}

async function checkRpc(fn, args) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  // A missing function is PGRST202. Anything else (including an RLS/permission
  // response) still proves the function exists.
  if (res.ok) return { ok: true };
  const body = await res.json().catch(() => ({}));
  if (body.code === 'PGRST202') {
    return { ok: false, detail: `${res.status} ${body.code} ${body.message ?? ''}`.trim() };
  }
  return { ok: true, note: `exists (responded ${res.status})` };
}

// Grouped by the migration that introduces them.
const MIGRATIONS = [
  {
    file: 'phase15_job_bid_count.sql',
    checks: [['rpc job_bid_count()', () => checkRpc('job_bid_count', { p_job_id: ZERO_UUID })]],
  },
  {
    file: 'phase16_voice_messages.sql',
    checks: [
      ['messages.audio_url', () => checkColumn('messages', 'audio_url')],
      ['messages.audio_duration_ms', () => checkColumn('messages', 'audio_duration_ms')],
      ['conversations.last_message_audio_url', () =>
        checkColumn('conversations', 'last_message_audio_url')],
    ],
  },
  {
    file: 'phase17_completion_photos_portfolio.sql',
    checks: [
      ['jobs.completion_photos', () => checkColumn('jobs', 'completion_photos')],
      ['portfolio_items table', () => checkColumn('portfolio_items', 'id')],
      ['portfolio_items.worker_id', () => checkColumn('portfolio_items', 'worker_id')],
      ['portfolio_items.source_job_id', () => checkColumn('portfolio_items', 'source_job_id')],
      ['portfolio_items.photo_url', () => checkColumn('portfolio_items', 'photo_url')],
      ['portfolio_items.category', () => checkColumn('portfolio_items', 'category')],
      ['portfolio_items.caption', () => checkColumn('portfolio_items', 'caption')],
      ['portfolio_items.display_order', () => checkColumn('portfolio_items', 'display_order')],
      ['rpc worker_job_stats()', () => checkRpc('worker_job_stats', { p_worker: ZERO_UUID })],
    ],
  },
  {
    file: 'phase18_hire_requests_and_replies.sql',
    checks: [
      ['messages.reply_to_id', () => checkColumn('messages', 'reply_to_id')],
      ['messages.job_request_id', () => checkColumn('messages', 'job_request_id')],
      ['messages.request_event', () => checkColumn('messages', 'request_event')],
      ['messages.request_amount_cents', () =>
        checkColumn('messages', 'request_amount_cents')],
      ['job_requests table', () => checkColumn('job_requests', 'id')],
      ['job_requests.thread_job_id', () => checkColumn('job_requests', 'thread_job_id')],
      ['job_requests.amount_cents', () => checkColumn('job_requests', 'amount_cents')],
      ['job_requests.status', () => checkColumn('job_requests', 'status')],
      ['job_requests.awaiting_id', () => checkColumn('job_requests', 'awaiting_id')],
      ['job_requests.client_counters', () =>
        checkColumn('job_requests', 'client_counters')],
      ['job_requests.worker_counters', () =>
        checkColumn('job_requests', 'worker_counters')],
      ['job_requests.created_job_id', () => checkColumn('job_requests', 'created_job_id')],
      ['rpc create_job_request()', () =>
        checkRpc('create_job_request', {
          p_worker_id: ZERO_UUID,
          p_title: '',
          p_description: '',
          p_category: 'other',
          p_location: '',
          p_amount_cents: 1,
        })],
      ['rpc respond_job_request()', () =>
        checkRpc('respond_job_request', {
          p_request_id: ZERO_UUID,
          p_action: 'decline',
        })],
      ['rpc my_pending_job_requests()', () => checkRpc('my_pending_job_requests', {})],
    ],
  },
  {
    file: 'phase19_portfolio_category_freeform.sql',
    checks: [
      // A CHECK-constraint swap has no shape a PostgREST schema probe can
      // see, so this marker function's existence is what phase19 actually
      // ran registers as — see the SQL file for why.
      ['rpc portfolio_category_freeform_enabled()', () =>
        checkRpc('portfolio_category_freeform_enabled', {})],
    ],
  },
];

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// Proves the probe itself works — if this fails, the credentials or network
// are the problem, not the migration.
const control = await checkColumn('jobs', 'photos');
if (!control.ok) {
  console.error(`Probe is not working (control check failed): ${control.detail}`);
  console.error('Check SUPABASE_URL / SUPABASE_KEY before trusting anything below.');
  process.exit(2);
}
console.log('control check (jobs.photos): OK — probe is working\n');

let missing = 0;
for (const migration of MIGRATIONS) {
  console.log(migration.file);
  for (const [label, run] of migration.checks) {
    const r = await run();
    if (r.ok) {
      console.log(`  OK       ${label}${r.note ? `  [${r.note}]` : ''}`);
    } else {
      missing++;
      console.log(`  MISSING  ${label}  (${r.detail})`);
    }
  }
  console.log('');
}

if (missing === 0) {
  console.log('All checked objects exist in the live database.');
} else {
  console.log(`${missing} object(s) missing — run the SQL file(s) listed above.`);
}
process.exit(missing === 0 ? 0 : 1);
