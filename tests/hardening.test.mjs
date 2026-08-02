import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/phase29_security_hardening.sql');
const executeGrants = read('supabase/phase32_function_execute_privileges.sql');
const profiles = read('lib/profiles.ts');
const jobs = read('lib/jobs.ts');
const bids = read('lib/bids.ts');
const reviews = read('lib/reviews.ts');
const storage = read('lib/storage.ts');
const pushHook = read('hooks/usePushNotifications.ts');
const verificationBadge = read('components/VerificationBadge.tsx');
const home = read('screens/HomeScreen.tsx');
const jobDetail = read('screens/JobDetailScreen.tsx');

test('protected profile fields are outside direct authenticated writes and reads', () => {
  assert.match(
    migration,
    /revoke select, insert, update, delete on public\.profiles from authenticated;/i
  );
  assert.match(migration, /create or replace function public\.update_my_profile\(p_patch jsonb\)/i);
  assert.match(
    migration,
    /where k\.key not in \(\s*'full_name', 'phone', 'avatar_url', 'bio', 'language', 'categories'\s*\)/i
  );

  const publicGrant = migration.match(
    /grant select \(([\s\S]*?)\) on public\.profiles to authenticated;/i
  )?.[1];
  assert.ok(publicGrant, 'public profile column grant must exist');
  for (const privateColumn of ['phone', 'is_admin', 'banned']) {
    assert.doesNotMatch(publicGrant, new RegExp(`\\b${privateColumn}\\b`, 'i'));
  }
  for (const publicColumn of ['id', 'full_name', 'avatar_url', 'verification_status']) {
    assert.match(publicGrant, new RegExp(`\\b${publicColumn}\\b`, 'i'));
  }

  assert.doesNotMatch(profiles, /\.select\(['"]\*['"]\)/);
  assert.match(profiles, /\.rpc\('update_my_profile'/);
  assert.match(profiles, /\.rpc\('get_my_profile'/);
});

test('job, bid, and review protected writes use server-validated RPCs', () => {
  assert.match(migration, /revoke insert, update on public\.jobs from authenticated;/i);
  assert.match(migration, /revoke insert, update on public\.bids from authenticated;/i);
  assert.match(migration, /revoke insert, update, delete on public\.reviews from authenticated;/i);
  assert.match(
    migration,
    /create policy "jobs_delete_own"[\s\S]*?client_id = auth\.uid\(\)[\s\S]*?status = 'open'[\s\S]*?not exists/i
  );
  assert.match(migration, /create or replace function public\.create_job\(/i);
  assert.match(migration, /create or replace function public\.update_job_details\(/i);
  assert.match(migration, /create or replace function public\.create_bid\(/i);
  assert.match(migration, /create or replace function public\.accept_bid\(/i);
  assert.match(migration, /create or replace function public\.transition_job_status\(/i);
  assert.match(migration, /create or replace function public\.create_review\(/i);
  assert.match(migration, /where id = p_job_id for update;/i);
  assert.match(migration, /where id = p_bid_id and job_id = p_job_id\s+for update;/i);
  assert.match(
    migration,
    /if not public\.is_profile_active\(v_bid\.worker_id\)[\s\S]*?Worker is not available/i
  );

  assert.match(jobs, /\.rpc\('create_job'/);
  assert.match(jobs, /\.rpc\('update_job_details'/);
  assert.match(jobs, /\.rpc\('transition_job_status'/);
  assert.doesNotMatch(jobs, /\.from\('jobs'\)\s*\.update\(/);
  assert.doesNotMatch(jobs, /\.from\('jobs'\)\s*\.insert\(/);
  assert.doesNotMatch(jobs, /\.select\(['"]\*[,)]/);
  assert.match(bids, /\.rpc\('create_bid'/);
  assert.match(bids, /\.rpc\('accept_bid'/);
  assert.doesNotMatch(bids, /\.from\('bids'\)\s*\.(?:insert|update)\(/);
  assert.match(reviews, /\.rpc\('create_review'/);
  assert.doesNotMatch(reviews, /\.from\('reviews'\)\s*\.insert\(/);
});

test('missing accept_bid deployments have a constrained compatibility path', async () => {
  const [bidsSource, compatibility, phase30] = await Promise.all([
    read('lib/bids.ts'),
    read('lib/acceptBidCompatibility.ts'),
    read('supabase/phase30_accept_bid_rpc.sql'),
  ]);

  assert.match(bidsSource, /error\?\.code === 'PGRST202'/);
  assert.match(bidsSource, /acceptBidWithoutRpc\(params\)/);
  assert.match(compatibility, /\.select\('id, worker_id, amount_cents, status'\)/);
  assert.doesNotMatch(compatibility, /workerId|amountCents/);
  assert.match(compatibility, /\.eq\('status', 'open'\)/);
  assert.match(compatibility, /const rollback = async/);
  assert.match(phase30, /create or replace function public\.accept_bid\(/i);
  assert.match(phase30, /where id = p_job_id\s+for update;/i);
  assert.match(phase30, /notify pgrst, 'reload schema'/i);
});

test('missing transition_job_status deployments have a constrained compatibility path', async () => {
  const [jobsSource, compatibility, phase31] = await Promise.all([
    read('lib/jobs.ts'),
    read('lib/jobStatusCompatibility.ts'),
    read('supabase/phase31_transition_job_status_rpc.sql'),
  ]);

  assert.match(jobsSource, /error\?\.code === 'PGRST202'/);
  assert.match(
    jobsSource,
    /transitionJobStatusWithoutRpc\(\{ jobId, status, photoUrls, videoUrls \}\)/
  );
  assert.match(compatibility, /supabase\.auth\.getUser\(\)/);
  assert.match(compatibility, /\.select\('id, assigned_worker_id, status'\)/);
  assert.match(compatibility, /\.eq\('assigned_worker_id', user\.id\)/);
  assert.match(compatibility, /\.eq\('status', expectedStatus\)/);
  assert.match(compatibility, /photos\.length > 5/);
  // phase35 caps completion evidence at one video; the compatibility path has
  // to refuse a second one for the same reason the RPC does.
  assert.match(compatibility, /videos\.length > 1/);
  assert.doesNotMatch(compatibility, /client_id|accepted_bid_id|final_amount_cents/);
  assert.match(phase31, /create or replace function public\.transition_job_status\(/i);
  assert.match(phase31, /where id = p_job_id\s+for update;/i);
  assert.match(phase31, /v_job\.assigned_worker_id <> v_user/i);
  assert.match(phase31, /notify pgrst, 'reload schema'/i);
});

test('chat media is private, membership-scoped, and stored by caller-owned path', () => {
  assert.match(
    migration,
    /set public = false\s+where id in \('chat-photos', 'chat-audio'\);/i
  );
  assert.match(migration, /create policy "chat_photos_read_party"/i);
  assert.match(migration, /create policy "chat_audio_read_party"/i);
  assert.match(
    migration,
    /\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/i
  );
  assert.match(
    migration,
    /\(j\.client_id = auth\.uid\(\) or j\.assigned_worker_id = auth\.uid\(\)\)/i
  );
  assert.match(storage, /`\$\{jobId\}\/\$\{userId\}\/\$\{Date\.now\(\)\}/);
  assert.match(storage, /createSignedUrl\(path, CHAT_SIGNED_URL_TTL_SECONDS\)/);
  assert.match(storage, /storageReference\(CHAT_AUDIO_BUCKET, path\)/);
});

test('avatar and job-photo writes are path-owned', () => {
  assert.match(migration, /create policy "avatars_insert"/i);
  assert.match(
    migration,
    /bucket_id = 'avatars'[\s\S]*?\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i
  );
  assert.match(migration, /create policy "job_photos_insert"/i);
  assert.match(
    migration,
    /\(storage\.foldername\(name\)\)\[1\] = 'postings'[\s\S]*?\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/i
  );
});

test('web does not register unsupported notification response listeners', () => {
  const guards = pushHook.match(/if \(Platform\.OS === 'web'\) return;/g) ?? [];
  assert.equal(guards.length, 2);
  assert.match(pushHook, /getLastNotificationResponseAsync/);
  assert.match(pushHook, /addNotificationResponseReceivedListener/);
});

test('function EXECUTE is revoked from anon and regranted to intended roles only', () => {
  // Four app RPCs: authenticated + service_role.
  const authenticatedFunctions = [
    'public\\.is_active_user\\(\\)',
    'public\\.create_review\\(uuid, uuid, integer, text\\)',
    'public\\.accept_bid\\(uuid, uuid\\)',
    'public\\.transition_job_status\\(uuid, text, jsonb\\)',
  ];
  for (const signature of authenticatedFunctions) {
    assert.match(
      executeGrants,
      new RegExp(
        `revoke execute on function ${signature}\\s*from public, anon, authenticated, service_role;`,
        'i'
      ),
      `${signature} must be revoked from anon`
    );
    assert.match(
      executeGrants,
      new RegExp(
        `grant execute on function ${signature}\\s*to authenticated, service_role;`,
        'i'
      ),
      `${signature} must be regranted to authenticated and service_role`
    );
  }

  // The outbox drainer mutates notification_outbox.attempts: service_role only.
  const drainer = 'public\\.claim_notification_batch\\(integer\\)';
  assert.match(
    executeGrants,
    new RegExp(
      `revoke execute on function ${drainer}\\s*from public, anon, authenticated, service_role;`,
      'i'
    )
  );
  assert.match(
    executeGrants,
    new RegExp(`grant execute on function ${drainer}\\s*to service_role;`, 'i')
  );
  assert.doesNotMatch(
    executeGrants,
    new RegExp(`grant execute on function ${drainer}\\s*to[^;]*authenticated`, 'i'),
    'claim_notification_batch must never be granted to authenticated'
  );

  // Deny-by-default for future functions, so the anon drift cannot recur.
  for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
    assert.match(
      executeGrants,
      new RegExp(
        `alter default privileges for role postgres in schema public\\s*revoke execute on functions from ${role};`,
        'i'
      ),
      `default privileges must revoke execute from ${role}`
    );
  }

  // Privileges only — this migration must not redefine or drop anything.
  // Comments are stripped first: the header explains the root cause in prose
  // and legitimately mentions the DDL this file must not actually contain.
  const statements = executeGrants.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(statements, /create or replace function/i);
  assert.doesNotMatch(statements, /drop function/i);
  assert.doesNotMatch(statements, /alter function/i);
});

test('job videos reuse the owned posting path and never autoplay', () => {
  const storageSource = read('lib/storage.ts');
  const jobVideo = read('components/JobVideo.tsx');
  const listingCard = read('components/BrowseJobCard.tsx');

  // Same caller-owned prefix the posting's photos use, so phase29's
  // job_photos_insert policy already authorises it and no bucket or policy
  // had to be widened for video.
  const uploads = storageSource.match(/postings\/\$\{userId\}\//g) ?? [];
  assert.equal(uploads.length, 2, 'photo and video uploads share the owned path');

  // Playback is native-controlled and never starts itself.
  const videoCode = jobVideo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(videoCode, /nativeControls/);
  assert.doesNotMatch(videoCode, /\.play\(\)/);
  assert.doesNotMatch(videoCode, /autoPlay|shouldPlay/i);

  // Scrolling feeds stay image-only — no decoder per row.
  assert.doesNotMatch(listingCard, /expo-video|VideoView/);
});

test('worker search ranks on stored evidence and claims nothing more', () => {
  const search = read('lib/workerSearch.ts');
  const screen = read('screens/WorkerSearchScreen.tsx');

  // Comments legitimately discuss the signals that were rejected and why, so
  // they are stripped before asserting on what the code actually does.
  const code = search.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  // Completed-job counts come from the aggregate RPC, not from a client-side
  // read of other people's job rows.
  assert.match(code, /rpc\('worker_job_stats'/);
  assert.match(code, /excludeUserId/);

  // Nothing is ranked on data the schema does not hold.
  assert.doesNotMatch(
    code,
    /\b(distance|proximity|latitude|longitude|availability|response_time)\b/i
  );

  // And the UI does not claim an intelligence the implementation lacks.
  assert.doesNotMatch(screen, /\bAI\b|semantic|machine learning/i);
});

test('unsupported identity and proximity claims are absent', () => {
  assert.doesNotMatch(verificationBadge, /ID-checked/i);
  assert.match(verificationBadge, /Not verified/);
  assert.doesNotMatch(home, /Nearby open jobs/i);
  assert.doesNotMatch(jobDetail, /Similar jobs nearby/i);
});

test('direct job offers stay private and server-authorised', () => {
  const phase36 = read('supabase/phase36_direct_offer_threads.sql');
  const workerProfile = read('screens/WorkerProfileScreen.tsx');

  // The defect the phase exists to fix: eligibility used to require a shared
  // completed job, which is what made one profile offer "Send an offer" and
  // another a "Post a job" consolation.
  assert.doesNotMatch(
    phase36,
    /You can only send a request to a worker who has completed a job for you/i
  );
  assert.doesNotMatch(workerProfile, /Direct offers open up once/i);
  assert.doesNotMatch(workerProfile, /title="Post a job"/i);

  // A private offer must never become a public job row before it is accepted,
  // and on accept must be created already assigned so it cannot reach the
  // open-job feed, job_hotspots() or jobs_in_cell().
  assert.match(phase36, /'assigned', v_req\.worker_id/i);
  assert.doesNotMatch(phase36, /values \([^)]*'open'[^)]*\)\s*returning id into v_job_id/i);

  // Every write still goes through SECURITY DEFINER functions with a fixed
  // search_path, revoked from anon and granted only to authenticated.
  assert.match(phase36, /security definer\s+set search_path = public, pg_temp/i);
  assert.match(
    phase36,
    /revoke all on function public\.create_job_request\([\s\S]*?\) from public, anon;/i
  );
  assert.match(
    phase36,
    /grant execute on function public\.create_job_request\([\s\S]*?\) to authenticated;/i
  );
  assert.match(
    phase36,
    /revoke all on function public\.respond_job_request\(uuid, text, integer\) from public, anon;/i
  );
  // Thread creation is not a client capability — it only happens as part of
  // sending an offer.
  assert.match(
    phase36,
    /revoke all on function public\.ensure_direct_thread\(uuid, uuid\) from public, anon, authenticated;/i
  );

  // A retried accept returns the job it already created rather than making a
  // second one.
  assert.match(phase36, /v_req\.status = 'accepted'[\s\S]*?return v_req\.created_job_id;/i);

  // Reading a direct thread's messages requires being one of its two
  // participants, and sending additionally requires the pair not be blocked.
  assert.match(
    phase36,
    /from public\.direct_threads t[\s\S]*?\(t\.user_a = auth\.uid\(\) or t\.user_b = auth\.uid\(\)\)/i
  );
  assert.match(phase36, /not public\.is_blocked_between\(t\.user_a, t\.user_b\)/i);

  // The inbox view must keep running as the caller, so it can never widen
  // what a user can read.
  assert.match(phase36, /create view public\.conversations\s+with \(security_invoker = true\)/i);
});

test('profile reviews are readable without widening the reviews policy', () => {
  const phase37 = read('supabase/phase37_profile_reviews_and_photos.sql');
  const phase6 = read('supabase/phase6_reviews_and_storage.sql');

  // The party-scoped SELECT policy is the reason a reader needs a function at
  // all; phase37 must not relax it.
  assert.match(
    phase6,
    /create policy "reviews_select_party"[\s\S]*?reviewer_id = auth\.uid\(\) or reviewee_id = auth\.uid\(\)/i
  );
  assert.doesNotMatch(phase37, /create policy "reviews_select/i);
  assert.doesNotMatch(phase37, /grant select on public\.reviews/i);

  // Both readers are security definer with a fixed search_path, require a
  // signed-in caller, and are granted only to authenticated.
  for (const fn of ['profile_reviews', 'profile_review_summary']) {
    const decl = 'create or replace function public\\.' + fn + '\\(';
    assert.match(
      phase37,
      new RegExp(
        decl + '[\\s\\S]*?security definer[\\s\\S]*?set search_path = public, pg_temp',
        'i'
      )
    );
    assert.match(
      phase37,
      new RegExp('revoke all on function public\\.' + fn + '\\([^)]*\\) from public, anon;', 'i')
    );
    assert.match(
      phase37,
      new RegExp('grant execute on function public\\.' + fn + '\\([^)]*\\) to authenticated;', 'i')
    );
  }
  const readerBodies = phase37.match(/where r\.reviewee_id = p_user\s+and auth\.uid\(\) is not null/gi) ?? [];
  assert.equal(readerBodies.length, 2, 'both readers must require a signed-in caller');

  // A private job's title must not leak onto a public reputation page.
  assert.doesNotMatch(phase37, /j\.title/i);

  // create_review keeps every check phase29 gave it, plus a photo cap.
  assert.match(phase37, /v_job\.status <> 'completed'/i);
  assert.match(phase37, /Review parties are invalid/i);
  assert.match(phase37, /p_rating not between 1 and 5/i);
  assert.match(phase37, /jsonb_array_length\(v_photos\) > 5/i);
  assert.match(
    phase37,
    /revoke all on function public\.create_review\(uuid, uuid, integer, text, jsonb\)\s+from public, anon;/i
  );

  // Review photos get their own owner-scoped storage prefix rather than
  // loosening either existing job-photos branch.
  assert.match(
    phase37,
    /create policy "job_photos_insert_review"[\s\S]*?\(storage\.foldername\(name\)\)\[1\] = 'reviews'[\s\S]*?\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/i
  );
  assert.doesNotMatch(phase37, /drop policy if exists "job_photos_insert" on/i);
});
