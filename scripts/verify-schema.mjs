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
import { refFromRestUrl, refFromPgUrl, refFromJwt } from './supabase-ref.mjs';

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

// ---------------------------------------------------------------------------
// ENV PARITY (added after the device found four "column does not exist"
// screens against a green verify run).
//
// This script probes over PostgREST with the app's own .env values, while the
// SQL proofs and every migration go through SUPABASE_DB_URL_STAGING on a
// direct Postgres connection. If those two point at DIFFERENT projects, every
// gate can be green about a database the app never touches. Refs only are
// compared and printed — never a URL, key, or connection string. The parsers
// live in supabase-ref.mjs, shared with the EAS production pre-install gate.
// ---------------------------------------------------------------------------

{
  const appRef = refFromRestUrl(BASE);
  const keyRef = refFromJwt(KEY);
  const toolingRef = refFromPgUrl(process.env.SUPABASE_DB_URL_STAGING);

  console.log('env parity');
  console.log(`  app .env SUPABASE_URL ref : ${appRef ?? 'UNRESOLVED'}`);
  console.log(`  app .env SUPABASE_KEY ref : ${keyRef ?? 'UNRESOLVED'}`);
  console.log(`  SUPABASE_DB_URL_STAGING   : ${toolingRef ?? 'NOT SET'}`);

  const problems = [];
  if (!appRef) problems.push('SUPABASE_URL in .env does not look like a Supabase project URL');
  if (keyRef && appRef && keyRef !== appRef) {
    problems.push(`the anon key belongs to ${keyRef} but SUPABASE_URL points at ${appRef}`);
  }
  if (toolingRef && appRef && toolingRef !== appRef) {
    problems.push(
      `the app targets ${appRef} but the SQL proofs/migrations target ${toolingRef} — ` +
        'every gate below would be green about a database the app never touches'
    );
  }
  if (!toolingRef) {
    console.log('  WARNING: SUPABASE_DB_URL_STAGING is not set in this shell, so the');
    console.log('           app-vs-tooling comparison could not be made. The SQL proofs');
    console.log('           cannot run without it either.');
  }
  if (problems.length > 0) {
    console.error('\nENV PARITY FAILED:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nRefusing to report on a database the app does not use.');
    process.exit(3);
  }
  console.log(`  parity: OK${toolingRef ? '' : ' (app side only)'}\n`);
}

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

/**
 * The positive counterpart to checkRpc. checkRpc proves a function EXISTS and
 * deliberately accepts a permission refusal; this one proves the publishable
 * key can actually EXECUTE it. Used where a migration must PRESERVE anon access
 * rather than remove it, so that a fumbled grant reads as a failure instead of
 * passing quietly.
 */
async function checkRpcAllowed(fn, args) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (res.ok) return { ok: true, note: `executable (responded ${res.status})` };
  const body = await res.json().catch(() => ({}));
  return {
    ok: false,
    detail: `${res.status} ${body.code ?? ''} ${body.message ?? ''}`.trim(),
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

/**
 * The inverse of checkRpcAllowed: proves the publishable key is REFUSED.
 * checkRpc tolerates a refusal to prove existence; checkRpcAllowed demands a
 * 2xx to prove access; this one demands the refusal itself, which is the only
 * shape that can verify a revoke. ok solely for a permission denial - HTTP
 * 403, or body code 42501 ("permission denied for function"). A 2xx means the
 * revoke did not land, so it fails. PGRST202 fails too: a MISSING function is
 * broken, not denied. Anything else fails with the status and code in the
 * detail rather than being guessed at.
 *
 * Safe to call against unsend_message with ZERO_UUID: on a database where
 * phase70 is applied, the revoke answers 403 before anything runs - and even
 * if only the body had landed, its null-uid guard raises 'Authentication
 * required' before the SELECT. On an unapplied database the ZERO_UUID lookup
 * finds no row and raises 'Message not found' before the UPDATE. Neither
 * path writes.
 */
async function checkRpcDenied(fn, args) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 403 || body.code === '42501') {
    return { ok: true, note: `denied (responded ${res.status})` };
  }
  if (res.ok) {
    return {
      ok: false,
      detail: `still executable with the publishable key (responded ${res.status})`,
    };
  }
  if (body.code === 'PGRST202') {
    return {
      ok: false,
      detail: `${res.status} ${body.code} ${body.message ?? ''} - missing, not denied`.trim(),
    };
  }
  return {
    ok: false,
    detail: `neither denied nor missing: ${res.status} ${body.code ?? ''} ${body.message ?? ''}`.trim(),
  };
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
      // phase56 sealed the outbox to anon (it became the recipient-scoped
      // in-app feed), so these five flipped from open-probe to sealed-probe:
      // existence is proven transitively by this group's own RPC checks plus
      // the phase56 sentinel; what a publishable key must see is a refusal.
      ['notification_outbox sealed to anon', () =>
        checkColumnRevoked('notification_outbox', 'id')],
      ['notification_outbox.recipient_id sealed', () =>
        checkColumnRevoked('notification_outbox', 'recipient_id')],
      ['notification_outbox.category sealed', () =>
        checkColumnRevoked('notification_outbox', 'category')],
      ['notification_outbox.dedupe_key sealed', () =>
        checkColumnRevoked('notification_outbox', 'dedupe_key')],
      ['notification_outbox.status sealed', () =>
        checkColumnRevoked('notification_outbox', 'status')],
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
  {
    file: 'phase38_job_bid_counts_batch.sql',
    checks: [
      ['rpc job_bid_counts()', () => checkRpc('job_bid_counts', { p_job_ids: [ZERO_UUID] })],
    ],
  },
  {
    // phase39 applies as a single transaction, so any one of these objects
    // existing proves the whole migration landed. They are listed separately
    // because a later hand-edit could drop one on its own.
    file: 'phase39_worker_semantic_matching.sql',
    checks: [
      ['rpc match_workers_semantic()', () =>
        checkRpc('match_workers_semantic', { p_query_embedding: [] })],
      ['rpc build_worker_semantic_source()', () =>
        checkRpc('build_worker_semantic_source', { p_worker: ZERO_UUID })],
      ['rpc refresh_worker_semantic_doc()', () =>
        checkRpc('refresh_worker_semantic_doc', { p_worker: ZERO_UUID })],
      ['rpc worker_semantic_refresh_queue()', () =>
        checkRpc('worker_semantic_refresh_queue', { p_limit: 1 })],
      ['rpc apply_worker_embeddings()', () =>
        checkRpc('apply_worker_embeddings', { p_rows: [], p_model: 'gte-small' })],
      ['rpc worker_semantic_coverage()', () => checkRpc('worker_semantic_coverage', {})],
      // The embedding store must be unreachable with the publishable key. This
      // is the half of phase39 an existence probe cannot see: a table that
      // reads back here would be handing out raw vectors and the text they
      // were built from.
      ['worker_semantic_docs revoked', () =>
        checkColumnRevoked('worker_semantic_docs', 'worker_id')],
      ['worker_semantic_docs.embedding revoked', () =>
        checkColumnRevoked('worker_semantic_docs', 'embedding')],
      ['worker_semantic_docs.source_text revoked', () =>
        checkColumnRevoked('worker_semantic_docs', 'source_text')],
    ],
  },
  {
    file: 'phase42_active_mode.sql',
    checks: [
      // get_my_active_mode() is `language sql` and selects profiles.active_mode
      // directly, so Postgres refuses to create it unless that column exists.
      // The function being here is therefore proof the COLUMN landed too —
      // which matters, because active_mode is deliberately not publicly
      // readable and so cannot be probed with checkColumn().
      ['rpc get_my_active_mode()', () => checkRpc('get_my_active_mode', {})],
      ['rpc set_active_mode()', () => checkRpc('set_active_mode', { p_mode: 'customer' })],
      // The privacy half: which mode someone is in is nobody else's business,
      // so active_mode must NOT be in phase29's public column grant. A column
      // that reads back here means the grant was widened.
      ['profiles.active_mode not publicly readable', () =>
        checkColumnRevoked('profiles', 'active_mode')],
    ],
  },
  {
    // ---------------------------------------------------------------------
    // PHASE 3A. Unlike every group above, this one is NOT expected to be
    // applied yet: the migration files are written and reviewed but have not
    // been run against the remote database. The `sentinel` below is what
    // makes that distinction honest rather than a weakened check.
    //
    //   sentinel MISSING -> the migration has not been applied. Every check
    //                       in this group reports PENDING and none of them
    //                       counts toward the failure total. Nothing is
    //                       marked as passing.
    //   sentinel PRESENT -> the migration HAS been applied. Every check
    //                       becomes mandatory, exactly like the groups above,
    //                       and a missing object fails the run.
    //
    // The flip is automatic and cannot be gamed by editing a flag: the only
    // way to reach the mandatory state is for phase43 to actually have run.
    // job_offers_enabled() is created as the LAST object inside phase43's
    // single transaction, so its presence proves the whole file committed —
    // which is also why the parts of phase43 that no PostgREST probe can see
    // (the two enums, every constraint, the widened messages CHECK, and the
    // visibility predicate added to the three discovery RPCs) need no probe
    // of their own. Probing those RPCs for mere existence would be worse than
    // useless here: they all exist BEFORE the migration, so such a check
    // would report green against an unmigrated database.
    // ---------------------------------------------------------------------
    file: 'phase43_job_offers_foundation.sql',
    sentinel: ['rpc job_offers_enabled()', () => checkRpc('job_offers_enabled', {})],
    checks: [
      ['jobs.visibility', () => checkColumn('jobs', 'visibility')],
      ['jobs.accepted_offer_id', () => checkColumn('jobs', 'accepted_offer_id')],
      ['job_locations.address_line', () => checkColumn('job_locations', 'address_line')],
      ['job_locations.access_notes', () => checkColumn('job_locations', 'access_notes')],
      // phase43 enables RLS on job_offers with zero policies and revokes every
      // grant, so the table must be unreachable with the publishable key.
      // Phase 3B grants deliberately; until then a readable job_offers would
      // mean both sides' private negotiation amounts were world-readable.
      ['job_offers not readable', () => checkColumnRevoked('job_offers', 'id')],
    ],
  },
  // phase44_backfill_bids_to_job_offers.sql and
  // phase45_job_requests_to_job_offers.sql are deliberately NOT given groups of
  // their own. Both are essentially data migrations: they add no probeable
  // schema object, and row counts are not visible through RLS with the
  // publishable key. Each file verifies itself instead — it recounts source and
  // destination rows at the end and raises, rolling the whole transaction back,
  // if they disagree.
  //
  // phase45's one piece of schema is the `draft` value it adds to the
  // job_status enum, which no PostgREST probe can see either. It is covered
  // transitively and reliably: phase46 REFUSES TO INSTALL if that value is
  // missing (its section 1 raises), so the phase46 sentinel below existing is
  // proof that phase45 ran first.
  {
    // ---------------------------------------------------------------------
    // PHASE 3B. Same sentinel mechanism as phase43 above: PENDING while
    // unapplied, mandatory the moment it lands, never a false PASS.
    //
    // The six legacy shims (create_bid, accept_bid, create_job_request,
    // respond_job_request, job_bid_count, job_bid_counts) are deliberately NOT
    // listed here as new checks. They keep their existing names and are still
    // covered by the phase18/29/30/36/38 groups above, which continue to
    // require them — which is the correct contract, because phase46 keeps them
    // present and working rather than dropping them. When the deprecation
    // trigger fires and they are finally removed, those groups are what has to
    // be updated, deliberately, in that phase.
    // ---------------------------------------------------------------------
    file: 'phase46_offer_rpcs_and_rls.sql',
    sentinel: ['rpc job_offer_rpcs_enabled()', () => checkRpc('job_offer_rpcs_enabled', {})],
    checks: [
      ['rpc create_offer()', () => checkRpc('create_offer', { p_amount_cents: 1 })],
      ['rpc counter_offer()', () =>
        checkRpc('counter_offer', { p_offer_id: ZERO_UUID, p_amount_cents: 1 })],
      ['rpc decline_offer()', () => checkRpc('decline_offer', { p_offer_id: ZERO_UUID })],
      ['rpc accept_offer()', () => checkRpc('accept_offer', { p_offer_id: ZERO_UUID })],
      ['rpc my_pending_offers()', () => checkRpc('my_pending_offers', {})],
      ['rpc job_offer_count()', () => checkRpc('job_offer_count', { p_job_id: ZERO_UUID })],
      ['rpc job_offer_counts()', () =>
        checkRpc('job_offer_counts', { p_job_ids: [ZERO_UUID] })],
      ['messages.job_offer_id', () => checkColumn('messages', 'job_offer_id')],
      // Still unreachable with the publishable key after phase46: the SELECT
      // policy and grant are for `authenticated` only, so anon must stay shut
      // out. This is the check that would catch a grant widened by mistake.
      ['job_offers still not readable by anon', () =>
        checkColumnRevoked('job_offers', 'id')],
    ],
  },
  {
    // phase47 replaces phase46's two-call-site `bids` mirror with a trigger on
    // job_offers. Neither the trigger nor the superseded function BODIES are
    // visible to a PostgREST probe — create_bid/accept_bid already existed and
    // would answer identically before and after — so the sentinel is doing the
    // real work here, as it does for phase43. It is created last inside
    // phase47's single transaction, including after the repair pass, so its
    // presence proves the reprojection ran and found zero remaining drift
    // (section 6 raises and rolls back otherwise).
    file: 'phase47_bids_projection_trigger.sql',
    sentinel: ['rpc bids_projection_enabled()', () => checkRpc('bids_projection_enabled', {})],
    checks: [
      // The drift view joins across every user's offers, so it must not be
      // reachable with the publishable key. Supabase's default privileges
      // would otherwise hand a new view in `public` to anon.
      ['v_bids_projection_drift not readable', () =>
        checkColumnRevoked('v_bids_projection_drift', 'root_offer_id')],
    ],
  },
  {
    // phase48 rewrites v_bids_projection_drift. A view replacement is invisible
    // to a PostgREST probe — the view existed before and is revoked from anon
    // either way — so the sentinel carries this one entirely. It is created
    // last inside phase48's transaction, AFTER the reprojection and its
    // zero-repairable-drift assertion, so its presence proves both ran and
    // agreed.
    file: 'phase48_bids_drift_view_rewrite.sql',
    sentinel: ['rpc bids_projection_v2_enabled()', () => checkRpc('bids_projection_v2_enabled', {})],
    checks: [
      ['v_bids_projection_drift still not readable', () =>
        checkColumnRevoked('v_bids_projection_drift', 'root_offer_id')],
    ],
  },
  {
    // phase49 adds the post-wizard fields (budget range, scheduling window,
    // address-capable job_locations) and recreates create_job /
    // update_job_details with the widened parameter list. The two RPC checks
    // call with the NEW named parameters, so they only pass once the widened
    // signatures are live — the pre-phase49 functions answer PGRST202 to
    // these argument names. Both RPCs raise on auth before touching any row,
    // so probing them with the publishable key writes nothing.
    file: 'phase49_post_wizard_fields.sql',
    sentinel: ['rpc post_wizard_fields_enabled()', () =>
      checkRpc('post_wizard_fields_enabled', {})],
    checks: [
      ['jobs.budget_min_cents', () => checkColumn('jobs', 'budget_min_cents')],
      ['jobs.budget_max_cents', () => checkColumn('jobs', 'budget_max_cents')],
      ['jobs.scheduled_date', () => checkColumn('jobs', 'scheduled_date')],
      ['jobs.arrival_start_hour', () => checkColumn('jobs', 'arrival_start_hour')],
      ['jobs.arrival_end_hour', () => checkColumn('jobs', 'arrival_end_hour')],
      ['rpc create_job() widened signature', () =>
        checkRpc('create_job', {
          p_title: 'probe',
          p_description: 'probe',
          p_category: 'other',
          p_location: 'probe',
          p_budget_min_cents: 100,
          p_budget_max_cents: 200,
          p_scheduled_date: '2026-01-01',
          p_arrival_start_hour: 8,
          p_arrival_end_hour: 11,
          p_address_line: 'probe',
        })],
      ['rpc update_job_details() widened signature', () =>
        checkRpc('update_job_details', {
          p_job_id: ZERO_UUID,
          p_title: 'probe',
          p_description: 'probe',
          p_category: 'other',
          p_location: 'probe',
          p_budget_min_cents: 100,
          p_budget_max_cents: 200,
          p_scheduled_date: '2026-01-01',
          p_arrival_start_hour: 8,
          p_arrival_end_hour: 11,
          p_address_line: 'probe',
        })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 50. Sandbox payments + withdraw/expiry. Same sentinel mechanism
    // as phase43/46/47/49: PENDING while unapplied, mandatory once applied.
    //
    // The four superseded RPC bodies (create_offer, counter_offer,
    // decline_offer, accept_offer) and my_pending_offers() keep their names
    // and signatures, so the phase46 group above continues to cover their
    // existence; body behaviour (expiry gates) has no probeable shape, which
    // is what the sentinel is for. The `payments` table predates the repo's
    // migrations — phase50 extends it, so its new columns are probed here.
    // -----------------------------------------------------------------------
    file: 'phase50_sandbox_payments_and_offer_lifecycle.sql',
    sentinel: ['rpc sandbox_payments_enabled()', () =>
      checkRpc('sandbox_payments_enabled', {})],
    checks: [
      // payments and job_offers are anon-revoked, so their new columns have no
      // publishable-key probe (the phase43/46 situation exactly). Existence is
      // proven transitively by the sentinel — created last in the same
      // transaction as the columns — while the probes below assert the parts a
      // client key CAN see: the RPCs exist, and the money table stays sealed.
      ['payments not readable with publishable key', () =>
        checkColumnRevoked('payments', 'id')],
      ['payments.amount_cents not readable either', () =>
        checkColumnRevoked('payments', 'amount_cents')],
      ['rpc sandbox_authorize_job_payment()', () =>
        checkRpc('sandbox_authorize_job_payment', { p_job_id: ZERO_UUID })],
      ['rpc sandbox_hold_job_payment()', () =>
        checkRpc('sandbox_hold_job_payment', { p_job_id: ZERO_UUID })],
      ['rpc withdraw_offer()', () =>
        checkRpc('withdraw_offer', { p_offer_id: ZERO_UUID })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 51. Active-work lifecycle: arrival timestamps, checklist,
    // disputes, and the release path (the first function past `held`).
    // Every RPC below raises on auth before touching a row, so probing with
    // the publishable key writes nothing. The two new tables are sealed to
    // anon (checklist carries authenticated grants under RLS; disputes are
    // read-only + RPC-written), so their probes assert the seal.
    // -----------------------------------------------------------------------
    file: 'phase51_active_work_lifecycle.sql',
    sentinel: ['rpc active_work_lifecycle_enabled()', () =>
      checkRpc('active_work_lifecycle_enabled', {})],
    checks: [
      ['jobs.en_route_at', () => checkColumn('jobs', 'en_route_at')],
      ['jobs.arrived_at', () => checkColumn('jobs', 'arrived_at')],
      ['jobs.completed_at', () => checkColumn('jobs', 'completed_at')],
      ['job_checklist_items not readable by anon', () =>
        checkColumnRevoked('job_checklist_items', 'id')],
      ['job_disputes not readable by anon', () =>
        checkColumnRevoked('job_disputes', 'id')],
      ['rpc mark_worker_arrival()', () =>
        checkRpc('mark_worker_arrival', { p_job_id: ZERO_UUID, p_step: 'en_route' })],
      ['rpc sandbox_release_job_payment()', () =>
        checkRpc('sandbox_release_job_payment', { p_job_id: ZERO_UUID })],
      ['rpc job_payment_state()', () =>
        checkRpc('job_payment_state', { p_job_id: ZERO_UUID })],
      ['rpc open_job_dispute()', () =>
        checkRpc('open_job_dispute', { p_job_id: ZERO_UUID, p_reason: 'other' })],
      ['rpc withdraw_job_dispute()', () =>
        checkRpc('withdraw_job_dispute', { p_dispute_id: ZERO_UUID })],
      ['rpc sandbox_tip_worker()', () =>
        checkRpc('sandbox_tip_worker', { p_job_id: ZERO_UUID, p_amount_cents: 100 })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 52. Offer-scoped pre-hire chat: an AFTER INSERT trigger on
    // job_offers guarantees the pair's direct thread from the first offer.
    // A trigger has no PostgREST-probeable shape (the phase48 situation), so
    // the sentinel — created last in the same transaction as the trigger and
    // its backfill — carries the group.
    // -----------------------------------------------------------------------
    file: 'phase52_offer_scoped_chat.sql',
    sentinel: ['rpc offer_scoped_chat_enabled()', () =>
      checkRpc('offer_scoped_chat_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 53. Worker self-service: worker_services, saved_workers,
    // portfolio drafts, availability columns. profiles/portfolio columns are
    // behind auth (column grants / RLS), so — the phase50 situation — the
    // sentinel proves them transitively while the probes assert what the
    // publishable key CAN see: the new tables stay sealed to anon.
    // -----------------------------------------------------------------------
    file: 'phase53_worker_self_service.sql',
    sentinel: ['rpc worker_self_service_enabled()', () =>
      checkRpc('worker_self_service_enabled', {})],
    checks: [
      ['worker_services not readable by anon', () =>
        checkColumnRevoked('worker_services', 'id')],
      ['saved_workers not readable by anon', () =>
        checkColumnRevoked('saved_workers', 'user_id')],
      ['rpc update_my_profile() still callable shape', () =>
        checkRpc('update_my_profile', { p_patch: {} })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 54. Review integrity — a policy swap has no PostgREST-probeable
    // shape (the phase19 situation), so the sentinel carries the group; it is
    // created last in the same transaction as the policy.
    // -----------------------------------------------------------------------
    file: 'phase54_review_integrity.sql',
    sentinel: ['rpc review_integrity_enabled()', () =>
      checkRpc('review_integrity_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 55. Simulated cash-out. payments stays sealed to anon (phase50
    // checks keep asserting that); the RPC raises on auth before any row.
    // -----------------------------------------------------------------------
    file: 'phase55_sandbox_cash_out.sql',
    sentinel: ['rpc sandbox_cash_out_enabled()', () =>
      checkRpc('sandbox_cash_out_enabled', {})],
    checks: [
      ['rpc sandbox_cash_out()', () => checkRpc('sandbox_cash_out', {})],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 56. The notification feed over the phase20 outbox. The table is
    // recipient-scoped behind auth, so anon probes assert the seal; the
    // trigger/policy work rides the sentinel.
    // -----------------------------------------------------------------------
    file: 'phase56_notification_feed.sql',
    sentinel: ['rpc notification_feed_enabled()', () =>
      checkRpc('notification_feed_enabled', {})],
    checks: [
      ['notification_outbox not readable by anon', () =>
        checkColumnRevoked('notification_outbox', 'id')],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 57 (hardening run). notify_on_message gains the direct-thread
    // branch — a trigger-function body change with no probeable shape, so
    // the sentinel carries it (the phase48 situation).
    // -----------------------------------------------------------------------
    file: 'phase57_direct_thread_message_notifications.sql',
    sentinel: ['rpc direct_thread_notifications_enabled()', () =>
      checkRpc('direct_thread_notifications_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 58 (hardening run). Policy drop + two function-body fixes have
    // no probeable shape; the sentinel carries them. client_job_stats is the
    // one new callable surface.
    // -----------------------------------------------------------------------
    file: 'phase58_hardening_fixes.sql',
    sentinel: ['rpc hardening_fixes_enabled()', () =>
      checkRpc('hardening_fixes_enabled', {})],
    checks: [
      ['rpc client_job_stats()', () =>
        checkRpc('client_job_stats', { p_client_id: ZERO_UUID })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 59 (core-transactions run). Marketplace counter-offer
    // notification — one trigger through the phase20/56 outbox pipeline. A
    // trigger has no PostgREST-probeable shape (the phase52 situation), so
    // the sentinel carries the group. STAGING deliverable: additive
    // convenience — the AUD-P1-01 client fixes stand without it.
    // -----------------------------------------------------------------------
    file: 'phase59_staging_counter_notification.sql',
    sentinel: ['rpc counter_notification_enabled()', () =>
      checkRpc('counter_notification_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 60 (core-transactions run). The jobs DELETE policy stopped
    // recursing (42P17) by moving its whole condition into one STABLE
    // SECURITY DEFINER helper, so the policy holds no inline subquery on
    // bids/job_offers left to policy-expand.
    //
    // A policy has no PostgREST-probeable shape (the phase54 situation) — but
    // the helper it now calls does, and the helper is created inside the SAME
    // transaction as the policy, so its presence proves the group committed.
    // STAGING deliverable.
    // -----------------------------------------------------------------------
    file: 'phase60_jobs_delete_policy_recursion.sql',
    sentinel: ['rpc can_delete_own_job()', () =>
      checkRpc('can_delete_own_job', { p_job_id: ZERO_UUID })],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 61 (core-transactions run). Marketplace-bid chains get a thread
    // identity: create_offer posts the chain's ROOT MESSAGE for both offer
    // kinds (it was direct-only), notify_on_message gains a marketplace guard
    // so the new rows do not double-notify, and live chains are backfilled.
    //
    // Two function-body changes and a backfill — none of which has a
    // probeable shape (the phase57 situation) — so the sentinel, created last
    // inside the same transaction, carries the group. STAGING deliverable.
    // -----------------------------------------------------------------------
    file: 'phase61_marketplace_thread_identity.sql',
    sentinel: ['rpc marketplace_thread_identity_enabled()', () =>
      checkRpc('marketplace_thread_identity_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 62 (core-transactions run). Counter-offer notification copy:
    // first name, and the action named ("<First> sent you a Counteroffer for
    // $X"). It replaces phase59's trigger-function body and restates the
    // trigger — neither of which PostgREST can see, and the function itself is
    // revoked from every client role.
    //
    // Its sentinel was ADDED ON 2026-08-13, after the original staging apply,
    // for exactly that reason; the file was then re-applied. See the
    // amendment note at the foot of the SQL. The production apply must use the
    // amended file.
    // -----------------------------------------------------------------------
    file: 'phase62_counter_notification_copy.sql',
    sentinel: ['rpc counter_notification_copy_enabled()', () =>
      checkRpc('counter_notification_copy_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 63 (core-transactions run). Counter-offers capped at 10 per side,
    // per negotiation chain.
    //
    // This migration only REPLACES counter_offer(), which phase46 already
    // registers above — so probing that RPC passes whether or not phase63 ran,
    // which is the false green this script exists to prevent. The sentinel is
    // the only thing that distinguishes them. Added 2026-08-13 after the
    // original staging apply; file re-applied. The production apply must use
    // the amended file.
    // -----------------------------------------------------------------------
    file: 'phase63_counteroffer_cap_ten_per_side.sql',
    sentinel: ['rpc counteroffer_cap_enabled()', () =>
      checkRpc('counteroffer_cap_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 64 (core-transactions run, security hardening). Pins pg_temp LAST
    // in the search_path of the 28 SECURITY DEFINER functions that named only
    // `public`, closing the temp-table shadowing route.
    //
    // ALTER FUNCTION … SET creates no object at all, so there was nothing to
    // probe. The sentinel is created after that file's post-condition, so a
    // green line here also means "no SECURITY DEFINER function in public was
    // left without pg_temp" — on a partial sweep the transaction aborts and
    // this reports PENDING instead. Added 2026-08-13 after the original
    // staging apply; file re-applied. The production apply must use the
    // amended file.
    // -----------------------------------------------------------------------
    file: 'phase64_security_definer_search_path.sql',
    sentinel: ['rpc security_definer_search_path_enabled()', () =>
      checkRpc('security_definer_search_path_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 65 (core-transactions run, security hardening). security_invoker
    // on v_bids_projection_drift, the one view in public still running with
    // owner rights. (public.conversations already had it — phase36 — and is
    // deliberately untouched.)
    //
    // ALTER VIEW … SET creates no object, and phase47/48 above already assert
    // that view is unreadable by the publishable key — which it is on BOTH
    // sides of this change, so no column probe can tell them apart. As with
    // phase64 the sentinel follows the post-condition, so a green line means
    // no view in public was left on owner rights. Added 2026-08-13 after the
    // original staging apply; file re-applied. The production apply must use
    // the amended file.
    // -----------------------------------------------------------------------
    file: 'phase65_view_security_invoker.sql',
    sentinel: ['rpc view_security_invoker_enabled()', () =>
      checkRpc('view_security_invoker_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 66 (core-transactions run). Free-form messaging is locked until
    // the pair share a job that reached assignment: messaging_unlocked() is
    // the one definition of that, consulted by BOTH the messages INSERT
    // policy and the chat screen.
    //
    // A policy is invisible to a PostgREST existence probe, so the sentinel is
    // what makes "applied" mean "the lock is live" — it is created after the
    // file's own post-condition, which fails the transaction if
    // messages_insert_party did not pick up the gate.
    //
    // messaging_unlocked() IS probeable and is checked directly: with both
    // arguments null it must return false for any caller, which also proves
    // the grant phase32 revoked was restored.
    // -----------------------------------------------------------------------
    file: 'phase66_messaging_locked_until_confirmed.sql',
    sentinel: ['rpc messaging_lock_enabled()', () =>
      checkRpc('messaging_lock_enabled', {})],
    checks: [
      ['rpc messaging_unlocked() — reachable and closed by default', () =>
        checkRpc('messaging_unlocked', {
          p_job_id: null,
          p_direct_thread_id: null,
        })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 67. In-app account deletion.
    //
    // Most of what this migration does is invisible from here. This script
    // probes over PostgREST with the publishable key, so it cannot see a
    // DROPPED CONSTRAINT (the auth.users foreign keys), cannot see a function
    // BODY (is_profile_active gaining the deleted_at term), and cannot see a
    // column it has no SELECT grant on — phase29 narrowed profiles to a public
    // column list, so probing profiles.deleted_at positively would report
    // "missing" for a permission error. A constraint/FK sentinel is not
    // expressible in this mode at all. The sentinel carries all of it: it is
    // created in the same transaction as everything above it in the file.
    //
    // The two real RPCs ARE probeable and are checked directly, which is also
    // what proves the grants phase32 revoked were restored. Calling
    // delete_my_account with the publishable key is safe by construction: it
    // is revoked from anon, and its first statement raises when auth.uid() is
    // null, which it always is for this key.
    //
    // profiles.deleted_at is asserted NOT readable rather than readable. That
    // is the honest direction for this harness — it is a privacy assertion
    // that can genuinely fail if a later migration grants the column, not an
    // existence check dressed up as one.
    // -----------------------------------------------------------------------
    file: 'phase67_account_deletion.sql',
    sentinel: ['rpc account_deletion_enabled()', () =>
      checkRpc('account_deletion_enabled', {})],
    checks: [
      ['rpc account_deletion_blockers()', () =>
        checkRpc('account_deletion_blockers', {})],
      ['rpc delete_my_account()', () => checkRpc('delete_my_account', {})],
      ['profiles.deleted_at not readable by anon', () =>
        checkColumnRevoked('profiles', 'deleted_at')],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 68. Ban checks routed through is_profile_active(uuid).
    //
    // phase67 built the tombstone (profiles.deleted_at) and made
    // is_profile_active() the one lifecycle predicate, but left five SECURITY
    // DEFINER bodies still reading profiles.banned inline - so a deleted
    // account was tombstoned yet still treated as valid by all five. phase68
    // repoints them.
    //
    // What this harness CAN see: that each patched function still resolves
    // over PostgREST. What it CANNOT see is the part that matters - a function
    // BODY. The proof that the predicate actually changed is the self-check DO
    // block at the end of the migration, which reads pg_get_functiondef,
    // pg_get_function_identity_arguments, prosecdef, provolatile, proconfig
    // and proacl for all five and raises on any mismatch. It runs inside the
    // same transaction as the replacements, so the sentinel cannot exist
    // unless every one of those assertions passed. That is what the sentinel
    // carries here.
    //
    // The checks below are reachability only, and are deliberately the same
    // probes phase20 / phase31 / phase35 / phase39 already run against four of
    // these five functions - if a phase68 body failed to create, the signature
    // it replaced would stop resolving and those probes would go red too.
    // job_request_parties_ok is the one addition; it is an internal helper,
    // revoked from anon, and a permission-denied answer still proves it exists.
    // Only PGRST202 (no such function) counts as missing.
    //
    // notify_nearby_for_job is NOT probed here, because phase68 deliberately
    // did not patch it. See docs/audits/PHASE68_DIAGNOSTIC.md.
    // -----------------------------------------------------------------------
    file: 'phase68_deleted_at_authorization.sql',
    sentinel: ['rpc phase68_deleted_at_authorization_enabled()', () =>
      checkRpc('phase68_deleted_at_authorization_enabled', {})],
    checks: [
      ['rpc job_request_parties_ok()', () =>
        checkRpc('job_request_parties_ok', { p_a: ZERO_UUID, p_b: ZERO_UUID })],
      ['rpc should_notify() still resolves after phase68', () =>
        checkRpc('should_notify', {
          p_recipient: ZERO_UUID,
          p_actor: ZERO_UUID,
          p_category: 'messages',
        })],
      ['rpc transition_job_status() still resolves after phase68', () =>
        checkRpc('transition_job_status', {
          p_job_id: ZERO_UUID,
          p_status: 'in_progress',
          p_completion_photos: null,
          p_completion_videos: null,
        })],
      ['rpc match_workers_semantic() still resolves after phase68', () =>
        checkRpc('match_workers_semantic', { p_query_embedding: [] })],
      ['rpc worker_semantic_refresh_queue() still resolves after phase68', () =>
        checkRpc('worker_semantic_refresh_queue', { p_limit: 1 })],
      ['rpc is_profile_active() - the predicate all five now route through', () =>
        checkRpc('is_profile_active', { p_user: ZERO_UUID })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 69. Execute privileges in schema public.
    //
    // Sixteen functions still carried the CREATE-time default ACL, which for a
    // function grants EXECUTE to PUBLIC. Four of them formed an unauthenticated
    // notification chain, and one of them - job_request_parties_ok - is what
    // aborted phase68 at its own self-check (d). phase69 must be applied BEFORE
    // phase68; phase68 itself needs no change.
    //
    // WHAT THIS HARNESS CANNOT SEE: an ACL. PostgREST returns SQL results, not
    // pg_proc.proacl, so nothing here can prove EXECUTE was revoked from PUBLIC
    // or from anon. The real proof is the in-database self-check at the end of
    // phase69_execute_privilege_lockdown.sql: it reads proacl and
    // has_function_privilege for all sixteen, compares the five already-correct
    // functions against a before/after snapshot taken in the same transaction,
    // and refuses to commit on any mismatch. It runs in the same transaction as
    // every revoke, so the sentinel below cannot exist unless all of it passed.
    // That is what the sentinel carries.
    //
    // The two reachability probes below are the same tolerant shape used for
    // the service_role-only functions in the phase20 group: a function anon may
    // not execute answers 403 permission-denied, which still proves it exists,
    // and only PGRST202 counts as missing.
    //
    // job_categories_expanded is different, and is checked in the POSITIVE
    // direction with checkRpcAllowed. It is SECURITY INVOKER, it respects RLS,
    // and phase69 re-grants it to anon explicitly to replace the PUBLIC default
    // it used to lean on. A refusal there would mean that grant was fumbled and
    // a pre-auth catalog read had been locked out - the one way this migration
    // could take something away that it meant to keep.
    // -----------------------------------------------------------------------
    file: 'phase69_execute_privilege_lockdown.sql',
    sentinel: ['rpc phase69_execute_lockdown_enabled()', () =>
      checkRpc('phase69_execute_lockdown_enabled', {})],
    checks: [
      ['rpc job_categories_expanded() still executable by the publishable key', () =>
        checkRpcAllowed('job_categories_expanded', {})],
      ['rpc job_request_parties_ok() still resolves after phase69', () =>
        checkRpc('job_request_parties_ok', { p_a: ZERO_UUID, p_b: ZERO_UUID })],
      ['rpc is_blocked_between() still resolves after phase69', () =>
        checkRpc('is_blocked_between', { a: ZERO_UUID, b: ZERO_UUID })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 70. unsend_message: null-uid guard first in the body, EXECUTE
    // revoked from PUBLIC and anon.
    //
    // The BODY half (the guard) is invisible here - PostgREST returns
    // results, not pg_get_functiondef - and is proven by the migration's own
    // in-transaction self-check, which the sentinel carries (the phase69
    // situation). The ACL half IS visible to this probe and is asserted in
    // the refusing direction with checkRpcDenied: the publishable key must be
    // turned away at the permission layer. The phase25 group above keeps
    // probing the same RPC with tolerant checkRpc, which reads a 403 as
    // existence - both stay green on an applied database.
    // -----------------------------------------------------------------------
    file: 'phase70_unsend_message_authz.sql',
    sentinel: ['rpc phase70_unsend_message_authz_enabled()', () =>
      checkRpc('phase70_unsend_message_authz_enabled', {})],
    checks: [
      ['rpc unsend_message() denied to the publishable key', () =>
        checkRpcDenied('unsend_message', { p_message_id: ZERO_UUID })],
    ],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 71. The world-readable "reviews are viewable by everyone" SELECT
    // policy is dropped; reviews_select_party becomes the only row filter.
    //
    // A policy drop has no PostgREST-probeable shape (the phase54 situation),
    // so the sentinel carries the group - and there is deliberately no
    // row-level probe beside it. reviews.photos must STAY readable for the
    // phase37 group's checkColumn above: phase71 keeps anon's table-level
    // SELECT GRANT for exactly that probe and drops only the POLICY, so the
    // publishable key still resolves the column while reading zero rows. A
    // zero-row assertion is not expressible here without mistaking RLS
    // row-visibility for absence, which this script's design rules out (see
    // the header).
    // -----------------------------------------------------------------------
    file: 'phase71_reviews_read_lockdown.sql',
    sentinel: ['rpc phase71_reviews_read_lockdown_enabled()', () =>
      checkRpc('phase71_reviews_read_lockdown_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 72. avatars_read and job_photos_read on storage.objects move from
    // role public to authenticated, closing anonymous bucket ENUMERATION.
    //
    // Storage policies are invisible to this probe - it speaks to /rest/v1,
    // and pg_policies has no PostgREST surface - so the sentinel carries the
    // group entirely. It installs only after the migration's positive
    // self-check proved both policies still exist, serve SELECT to exactly
    // {authenticated}, and kept their bucket-scoped USING clauses. Note what
    // the sentinel does NOT claim: fetching an already-known public-bucket
    // URL still works signed out, because Supabase serves public buckets
    // outside RLS. Full closure is deferred to private buckets + signed URLs.
    // -----------------------------------------------------------------------
    file: 'phase72_storage_read_lockdown.sql',
    sentinel: ['rpc phase72_storage_read_lockdown_enabled()', () =>
      checkRpc('phase72_storage_read_lockdown_enabled', {})],
    checks: [],
  },
  {
    // -----------------------------------------------------------------------
    // PHASE 73. Two SECURITY DEFINER body fixes: transition_job_status()'s
    // owner guard becomes NULL-safe (IS DISTINCT FROM), so an unassigned job
    // no longer falls through to the idempotent return branch and hands its
    // full row to any authenticated caller; unsend_message() gains the
    // is_active_user() lifecycle gate its sibling write RPCs carry.
    //
    // A function BODY is invisible to a PostgREST probe (the phase70
    // situation), so the sentinel carries both halves - it installs only
    // after the migration's own in-transaction self-check proved the live
    // definitions contain the new guards, kept SECURITY DEFINER and their
    // pinned search_path, and are executable by authenticated but not anon.
    // The two checks beside it assert only that both RPCs still RESOLVE with
    // their existing signatures, which is what a body replace could break.
    // -----------------------------------------------------------------------
    file: 'phase73_null_safe_owner_guard_and_unsend_gate.sql',
    sentinel: ['rpc phase73_null_safe_guards_enabled()', () =>
      checkRpc('phase73_null_safe_guards_enabled', {})],
    checks: [
      ['rpc transition_job_status() still resolves after phase73', () =>
        checkRpc('transition_job_status', {
          p_job_id: ZERO_UUID,
          p_status: 'in_progress',
          p_completion_photos: null,
          p_completion_videos: null,
        })],
      ['rpc unsend_message() still resolves after phase73', () =>
        checkRpc('unsend_message', { p_message_id: ZERO_UUID })],
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
let pending = 0;
for (const migration of MIGRATIONS) {
  console.log(migration.file);

  // A group with a sentinel is one whose migration may legitimately not be
  // applied yet. Ask the sentinel first; it decides whether this group's
  // checks are mandatory or merely expected-missing. A group without one is
  // mandatory, exactly as it always was.
  let applied = true;
  if (migration.sentinel) {
    const [sentinelLabel, runSentinel] = migration.sentinel;
    const s = await runSentinel();
    applied = s.ok;
    if (applied) {
      console.log(`  OK       ${sentinelLabel}${s.note ? `  [${s.note}]` : ''}`);
    } else {
      pending++;
      console.log(`  PENDING  ${sentinelLabel}  — NOT APPLIED (${s.detail})`);
    }
  }

  for (const [label, run] of migration.checks) {
    if (!applied) {
      // Reported, counted as pending, never counted as passing.
      pending++;
      console.log(`  PENDING  ${label}  — EXPECTED MISSING until the migration is applied`);
      continue;
    }
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
  console.log('All REQUIRED objects exist in the live database.');
} else {
  console.log(`${missing} object(s) missing — run the SQL file(s) listed above.`);
}
if (pending > 0) {
  console.log(
    `${pending} check(s) PENDING — their migration is not applied yet. This is ` +
      'not a failure; the checks become mandatory automatically once the ' +
      'migration lands.'
  );
}
process.exit(missing === 0 ? 0 : 1);
