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

/**
 * The inverse of checkColumn: asserts a column is NOT readable with the
 * publishable key. phase29 revokes every direct grant on public.profiles and
 * re-grants only a public column list, so a column that still reads back here
 * means the hardening was never applied (or was rolled back) — the one part of
 * phase29 that an existence probe cannot see.
 */
async function checkColumnRevoked(table, column) {
  const res = await fetch(
    `${BASE}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=0`,
    { headers }
  );
  if (!res.ok) return { ok: true, note: `not readable (responded ${res.status})` };
  return {
    ok: false,
    detail: `${table}.${column} is still readable with the publishable key`,
  };
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
  {
    file: 'phase20_push_notifications.sql',
    checks: [
      ['push_tokens table', () => checkColumn('push_tokens', 'id')],
      ['push_tokens.user_id', () => checkColumn('push_tokens', 'user_id')],
      ['push_tokens.token', () => checkColumn('push_tokens', 'token')],
      ['push_tokens.platform', () => checkColumn('push_tokens', 'platform')],
      ['push_tokens.active', () => checkColumn('push_tokens', 'active')],
      ['notification_prefs table', () => checkColumn('notification_prefs', 'user_id')],
      ['notification_prefs.messages', () => checkColumn('notification_prefs', 'messages')],
      ['notification_prefs.bids', () => checkColumn('notification_prefs', 'bids')],
      ['notification_prefs.job_updates', () =>
        checkColumn('notification_prefs', 'job_updates')],
      ['notification_prefs.hire_requests', () =>
        checkColumn('notification_prefs', 'hire_requests')],
      ['notification_prefs.nearby_jobs', () =>
        checkColumn('notification_prefs', 'nearby_jobs')],
      ['notification_prefs.nearby_radius_miles', () =>
        checkColumn('notification_prefs', 'nearby_radius_miles')],
      ['notification_prefs.home_lat', () => checkColumn('notification_prefs', 'home_lat')],
      ['notification_prefs.home_lng', () => checkColumn('notification_prefs', 'home_lng')],
      ['notification_outbox table', () => checkColumn('notification_outbox', 'id')],
      ['notification_outbox.recipient_id', () =>
        checkColumn('notification_outbox', 'recipient_id')],
      ['notification_outbox.category', () =>
        checkColumn('notification_outbox', 'category')],
      ['notification_outbox.dedupe_key', () =>
        checkColumn('notification_outbox', 'dedupe_key')],
      ['notification_outbox.status', () => checkColumn('notification_outbox', 'status')],
      ['rpc register_push_token()', () =>
        checkRpc('register_push_token', { p_token: '', p_platform: 'unknown' })],
      ['rpc should_notify()', () =>
        checkRpc('should_notify', {
          p_recipient: ZERO_UUID,
          p_actor: ZERO_UUID,
          p_category: 'messages',
        })],
      // service_role-only. A permission-denied answer still proves it exists —
      // only PGRST202 (no such function) counts as missing.
      ['rpc claim_notification_batch()', () =>
        checkRpc('claim_notification_batch', { p_limit: 1 })],
      ['rpc resolve_notification()', () =>
        checkRpc('resolve_notification', {
          p_outbox_id: ZERO_UUID,
          p_status: 'sent',
          p_error: null,
        })],
      ['rpc deactivate_push_token()', () =>
        checkRpc('deactivate_push_token', { p_token: '' })],
      ['rpc push_notifications_enabled()', () =>
        checkRpc('push_notifications_enabled', {})],
    ],
  },
  {
    file: 'phase21_legal_acceptance.sql',
    checks: [
      ['legal_acceptances table', () => checkColumn('legal_acceptances', 'id')],
      ['legal_acceptances.user_id', () => checkColumn('legal_acceptances', 'user_id')],
      ['legal_acceptances.document', () => checkColumn('legal_acceptances', 'document')],
      ['legal_acceptances.version', () => checkColumn('legal_acceptances', 'version')],
      ['legal_acceptances.accepted_at', () =>
        checkColumn('legal_acceptances', 'accepted_at')],
      ['rpc accept_legal_documents()', () =>
        checkRpc('accept_legal_documents', { p_documents: [] })],
      ['rpc legal_acceptance_enabled()', () =>
        checkRpc('legal_acceptance_enabled', {})],
    ],
  },
  {
    file: 'phase23_realistic_job_seed.sql',
    checks: [
      // The enum extension (job_category +4 values) and the job_requests
      // CHECK-constraint widening have no PostgREST-visible shape of their
      // own — same situation as phase19's constraint swap — so this marker
      // function's existence is what confirms the migration actually ran.
      ['rpc job_categories_expanded()', () =>
        checkRpc('job_categories_expanded', {})],
    ],
  },
  {
    file: 'phase25_unsend_messages.sql',
    checks: [
      ['messages.unsent_at', () => checkColumn('messages', 'unsent_at')],
      ['conversations.last_message_unsent_at', () =>
        checkColumn('conversations', 'last_message_unsent_at')],
      ['rpc unsend_message()', () =>
        checkRpc('unsend_message', { p_message_id: ZERO_UUID })],
    ],
  },
  {
    // Every function below is revoked from public and granted only to
    // `authenticated`, so probing them with the publishable (anon) key is
    // rejected at the permission layer before any body runs — nothing here
    // can write. A permission-denied answer still proves existence; only
    // PGRST202 counts as missing.
    file: 'phase29_security_hardening.sql',
    checks: [
      // is_active_user() is deliberately NOT checked here: phase13 creates it
      // too, so it passes whether or not phase29 ran and would be a false green.
      ['rpc is_profile_active()', () =>
        checkRpc('is_profile_active', { p_user: ZERO_UUID })],
      ['rpc current_user_is_admin()', () => checkRpc('current_user_is_admin', {})],
      ['rpc current_user_is_banned()', () => checkRpc('current_user_is_banned', {})],
      ['rpc get_my_profile()', () => checkRpc('get_my_profile', {})],
      ['rpc update_my_profile()', () =>
        checkRpc('update_my_profile', { p_patch: {} })],
      ['rpc create_job()', () =>
        checkRpc('create_job', {
          p_title: '',
          p_description: '',
          p_category: 'other',
          p_location: '',
        })],
      ['rpc update_job_details()', () =>
        checkRpc('update_job_details', {
          p_job_id: ZERO_UUID,
          p_title: '',
          p_description: '',
          p_category: 'other',
          p_location: '',
        })],
      ['rpc create_bid()', () =>
        checkRpc('create_bid', {
          p_job_id: ZERO_UUID,
          p_amount_cents: 1,
          p_message: '',
        })],
      ['rpc create_review()', () =>
        checkRpc('create_review', {
          p_job_id: ZERO_UUID,
          p_reviewee_id: ZERO_UUID,
          p_rating: 5,
          p_comment: null,
        })],
      // The headline property of this migration: the private profile columns
      // must no longer be directly readable. Without these two, the checks
      // above could all pass while phone/is_admin were still world-readable.
      ['profiles.phone revoked', () => checkColumnRevoked('profiles', 'phone')],
      ['profiles.is_admin revoked', () => checkColumnRevoked('profiles', 'is_admin')],
    ],
  },
  {
    // Originally created by phase29; phase30 restores it where production
    // reported it missing. Either file having run satisfies this check.
    file: 'phase30_accept_bid_rpc.sql',
    checks: [
      ['rpc accept_bid()', () =>
        checkRpc('accept_bid', { p_job_id: ZERO_UUID, p_bid_id: ZERO_UUID })],
    ],
  },
  {
    // Same relationship as phase30 — phase29 creates it, phase31 restores it.
    // lib/jobStatusCompatibility.ts only exists to cover its absence.
    file: 'phase31_transition_job_status_rpc.sql',
    checks: [
      ['rpc transition_job_status()', () =>
        checkRpc('transition_job_status', {
          p_job_id: ZERO_UUID,
          p_status: 'in_progress',
          p_completion_photos: null,
        })],
    ],
  },
  // phase33_job_request_categories.sql is deliberately NOT checked here.
  // A CHECK constraint is invisible through PostgREST, and the only way to
  // provoke it — calling create_job_request with one of the four categories
  // phase23 added — needs a signed-in session; with just the publishable key
  // the function raises 'Not signed in' long before the insert, so the probe
  // would report a pass on an unmigrated database. A check that cannot fail
  // is worse than no check. Confirm that one in the SQL editor:
  //   select pg_get_constraintdef(oid) from pg_constraint
  //   where conname = 'job_requests_category_valid';
  {
    file: 'phase34_job_videos.sql',
    checks: [
      ['jobs.videos', () => checkColumn('jobs', 'videos')],
      // The 9-argument signature only resolves once phase34 has replaced the
      // 8-argument one, so this distinguishes the new function from the old.
      ['rpc create_job() takes p_videos', () =>
        checkRpc('create_job', {
          p_title: '',
          p_description: '',
          p_category: 'other',
          p_location: '',
          p_budget_cents: null,
          p_photos: [],
          p_lat: null,
          p_lng: null,
          p_videos: [],
        })],
      ['rpc update_job_details() takes p_videos', () =>
        checkRpc('update_job_details', {
          p_job_id: ZERO_UUID,
          p_title: '',
          p_description: '',
          p_category: 'other',
          p_location: '',
          p_budget_cents: null,
          p_photos: [],
          p_lat: null,
          p_lng: null,
          p_videos: [],
        })],
    ],
  },
  {
    file: 'phase35_completion_videos.sql',
    checks: [
      ['jobs.completion_videos', () => checkColumn('jobs', 'completion_videos')],
      // The 4-argument signature only resolves once phase35 has replaced
      // phase31's 3-argument one, so this distinguishes the new function from
      // the old. (The phase31 check above keeps passing either way: PostgREST
      // still matches a call that omits a defaulted trailing argument.)
      ['rpc transition_job_status() takes p_completion_videos', () =>
        checkRpc('transition_job_status', {
          p_job_id: ZERO_UUID,
          p_status: 'in_progress',
          p_completion_photos: null,
          p_completion_videos: null,
        })],
    ],
  },
  {
    file: 'phase36_direct_offer_threads.sql',
    checks: [
      ['direct_threads table', () => checkColumn('direct_threads', 'id')],
      ['direct_threads.user_a', () => checkColumn('direct_threads', 'user_a')],
      ['direct_threads.user_b', () => checkColumn('direct_threads', 'user_b')],
      ['direct_threads.user_a_read_at', () =>
        checkColumn('direct_threads', 'user_a_read_at')],
      ['messages.direct_thread_id', () => checkColumn('messages', 'direct_thread_id')],
      ['job_requests.direct_thread_id', () =>
        checkColumn('job_requests', 'direct_thread_id')],
      ['job_requests.videos', () => checkColumn('job_requests', 'videos')],
      ['conversations.direct_thread_id', () =>
        checkColumn('conversations', 'direct_thread_id')],
      ['conversations.my_read_at', () => checkColumn('conversations', 'my_read_at')],
      ['rpc mark_direct_thread_read()', () =>
        checkRpc('mark_direct_thread_read', { p_thread_id: ZERO_UUID })],
      // The 11-argument signature only resolves once phase36 has replaced
      // phase18's 10-argument one, so this distinguishes new from old.
      ['rpc create_job_request() takes p_videos', () =>
        checkRpc('create_job_request', {
          p_worker_id: ZERO_UUID,
          p_title: '',
          p_description: '',
          p_category: 'other',
          p_location: '',
          p_amount_cents: 1,
          p_photos: [],
          p_lat: null,
          p_lng: null,
          p_thread_job_id: null,
          p_videos: [],
        })],
    ],
  },
  {
    file: 'phase37_profile_reviews_and_photos.sql',
    checks: [
      ['reviews.photos', () => checkColumn('reviews', 'photos')],
      ['rpc profile_reviews()', () =>
        checkRpc('profile_reviews', { p_user: ZERO_UUID, p_limit: 1, p_offset: 0 })],
      ['rpc profile_review_summary()', () =>
        checkRpc('profile_review_summary', { p_user: ZERO_UUID })],
      // The 5-argument signature only resolves once phase37 has replaced
      // phase29's 4-argument one, so this distinguishes new from old.
      ['rpc create_review() takes p_photos', () =>
        checkRpc('create_review', {
          p_job_id: ZERO_UUID,
          p_reviewee_id: ZERO_UUID,
          p_rating: 5,
          p_comment: null,
          p_photos: [],
        })],
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
