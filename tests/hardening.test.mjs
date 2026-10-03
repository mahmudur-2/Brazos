import assert from 'node:assert/strict';
import { existsSync as fsExistsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const existsSync = (path) => fsExistsSync(join(root, path));

const migration = read('supabase/archive/phases/phase29_security_hardening.sql');
const executeGrants = read('supabase/archive/phases/phase32_function_execute_privileges.sql');
const profiles = read('lib/profiles.ts');
const jobs = read('lib/jobs.ts');
const offers = read('lib/offers.ts');
const reviews = read('lib/reviews.ts');
const storage = read('lib/storage.ts');
const pushHook = read('hooks/usePushNotifications.ts');
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
  assert.match(offers, /\.rpc\('create_offer'/);
  assert.match(offers, /\.rpc\('accept_offer'/);
  assert.match(offers, /\.rpc\('counter_offer'/);
  assert.match(offers, /\.rpc\('decline_offer'/);
  // Every mutation is an RPC. phase46 grants authenticated SELECT only on
  // job_offers, so a direct write would be rejected by the database — this
  // asserts the client never even tries, and never touches the frozen tables.
  assert.doesNotMatch(offers, /\.from\('job_offers'\)\s*\.(?:insert|update|delete)\(/);
  assert.doesNotMatch(offers, /\.from\('bids'\)/);
  assert.doesNotMatch(offers, /\.from\('job_requests'\)/);
  assert.match(reviews, /\.rpc\('create_review'/);
  assert.doesNotMatch(reviews, /\.from\('reviews'\)\s*\.insert\(/);
});

// The accept_bid compatibility path is deliberately GONE (Phase 3B).
// lib/acceptBidCompatibility.ts was deleted with accept_offer(): there is no
// RPC left for it to fall back from, and its non-atomic read-then-update had a
// real TOCTOU race. This asserts the absence rather than dropping the coverage
// — a reintroduced client-side write path would fail here.
// The frozen `bids` table is kept current by a PROJECTION, not by writes
// scattered through the compatibility shims. phase46 did the latter and it
// drifted on four of the six paths that mutate job_offers; phase47 replaced it.
// These assertions are what stop a future edit from reintroducing a second
// writer, which is the exact shape of the original bug.
test('the bids compatibility mirror is a trigger-driven projection only', async () => {
  const phase47 = read('supabase/archive/phases/phase47_bids_projection_trigger.sql');

  // One projection, driven by the source of truth.
  assert.match(phase47, /create trigger job_offers_mirror_bids\s+after insert or update on public\.job_offers/i);
  assert.match(phase47, /create or replace function public\.project_offer_chain_to_bids\(/i);

  // Marketplace bids only — direct offers never wrote to bids and must not start.
  assert.match(phase47, /offer_type <> 'marketplace_bid'/);

  // Current revision is the chain LEAF, not the newest timestamp: a counter
  // supersedes its parent and inserts the child in one transaction, so both
  // carry an identical now() and a created_at sort is not deterministic.
  assert.match(phase47, /not exists \(\s*select 1 from public\.job_offers c where c\.parent_offer_id = o\.id\s*\)/i);
  assert.doesNotMatch(phase47, /order by .*created_at desc.*limit 1/i);

  // Delete-then-upsert, so a settled chain cannot block a new one on bids'
  // unconditional unique (job_id, worker_id).
  // (A bare "on conflict do nothing" is what silently dropped rows in phase46;
  // the file's header explains that, so this asserts the REPLACEMENT shape
  // rather than the absence of a phrase that legitimately appears in prose.)
  assert.match(phase47, /delete from public\.bids/i);
  // UPDATE-then-INSERT, NOT an upsert: bids_notify is AFTER INSERT, so the
  // branch has to be visible rather than resting on ON CONFLICT trigger
  // semantics. An existing chain updates silently; a new chain inserts once.
  assert.match(phase47, /update public\.bids/i);
  assert.match(phase47, /if not found then\s+insert into public\.bids/i);
  assert.doesNotMatch(phase47, /on conflict \(id\) do update/i);
  // The delete must never reach a row a job still names as its accepted bid.
  assert.match(phase47, /not exists \(select 1 from public\.jobs j where j\.accepted_bid_id = b\.id\)/i);
  // And the migration must verify, not assume, that nothing cascades off bids.
  assert.match(phase47, /confdeltype = 'c'/);

  // The shims must no longer write bids themselves.
  const shims = phase47.slice(phase47.indexOf('4. create_bid()'));
  assert.doesNotMatch(shims, /insert into public\.bids/i);
  assert.doesNotMatch(shims, /update public\.bids/i);
});

test('offer acceptance has no client-side fallback write path', async () => {
  const offersSource = read('lib/offers.ts');

  assert.doesNotMatch(offersSource, /PGRST202/);
  assert.doesNotMatch(offersSource, /acceptBidWithoutRpc/);
  assert.doesNotMatch(offersSource, /\.from\('job_offers'\)\s*\.(?:insert|update|delete)\(/);
  assert.match(offersSource, /\.rpc\('accept_offer'/);
  assert.strictEqual(existsSync('lib/acceptBidCompatibility.ts'), false);
});

test('no client-side jobs.status writer exists anywhere', () => {
  // transition_job_status() is the ONLY status mover (CLAUDE.md). The
  // compatibility module that once wrote jobs.status directly is deleted and
  // stays deleted, and no fallback branch may reintroduce the write path —
  // the RPC being missing is a deployment defect, not something the client
  // may paper over with a direct table write.
  assert.strictEqual(existsSync('lib/jobStatusCompatibility.ts'), false);
  assert.doesNotMatch(jobs, /PGRST202/);
  assert.doesNotMatch(jobs, /transitionJobStatusWithoutRpc/);
  assert.match(jobs, /\.rpc\('transition_job_status'/);

  // The RPC the app depends on still exists and is still transactional.
  const phase31 = read('supabase/archive/phases/phase31_transition_job_status_rpc.sql');
  assert.match(phase31, /create or replace function public\.transition_job_status\(/i);
  assert.match(phase31, /where id = p_job_id\s+for update;/i);
  assert.match(phase31, /v_job\.assigned_worker_id <> v_user/i);
  assert.match(phase31, /notify pgrst, 'reload schema'/i);

  // Sweep: no file under lib/, hooks/, screens/ or components/ chains an
  // update off the jobs table at all — status or any other column; RPCs are
  // the jobs write path. (Posting inserts and the owner's delete are
  // different verbs and stay out of this fence.) The frozen *.web.* files
  // are deliberately included: the invariant is the data layer's, not a
  // styling rule, and no platform is exempt.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(join(root, rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(entry) && /\.from\(['"`]jobs['"`]\)\s*\.update\(/.test(read(rel))) {
        offenders.push(rel);
      }
    }
  };
  for (const dir of ['lib', 'hooks', 'screens', 'components']) walk(dir);
  assert.deepEqual(offenders, []);
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
  assert.match(videoCode, /currentTime = 0\.5/);
  assert.match(videoCode, /nativeControls=\{false\}/);
  assert.match(videoCode, /contentFit="cover"/);
  assert.match(videoCode, /nativeControls/);
  assert.match(videoCode, /fullscreenOptions=\{\{ enable: true \}\}/);
  assert.match(videoCode, /enterFullscreen\(\)/);
  assert.match(videoCode, /Play video fullscreen/);
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
  // Stage 4D-B removed the verification badge outright (it rendered
  // "Not verified" on 100% of workers — no migration ever writes 'verified').
  // The two assertions that pinned its honest wording moved with it: the
  // no-badge-anywhere contract now lives in
  // tests/verificationBadgeRemoved.test.mjs.
  assert.ok(!existsSync('components/VerificationBadge.tsx'));
  assert.doesNotMatch(home, /Nearby open jobs/i);
  assert.doesNotMatch(jobDetail, /Similar jobs nearby/i);
});

test('direct job offers stay private and server-authorised', () => {
  const phase36 = read('supabase/archive/phases/phase36_direct_offer_threads.sql');
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
  const phase37 = read('supabase/archive/phases/phase37_profile_reviews_and_photos.sql');
  const phase6 = read('supabase/archive/phases/phase6_reviews_and_storage.sql');

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

// ---------------------------------------------------------------------------
// REALTIME CHANNEL TOPICS — every subscription is unique per mount.
// ---------------------------------------------------------------------------

test('every realtime channel topic is unique per mount', () => {
  // WHY THIS IS A HARDENING CONCERN rather than a style one. `supabase
  // .channel(topic)` dedupes against the client's existing channels BY TOPIC
  // STRING, and `removeChannel()` tears down asynchronously — it awaits
  // `channel.unsubscribe()` before splicing the old channel out. So a fast
  // unmount/remount on a fixed topic can hand the new effect the OLD,
  // already-subscribed channel object, and `.on()` on it throws
  //   "cannot add postgres_changes callbacks ... after subscribe()".
  //
  // A per-instance `useId()` alone does not fix it: a remount of the SAME
  // instance reuses the same id. The established mitigation, documented at
  // length in hooks/useOpenJobs.ts, is id + a per-effect-run counter, so every
  // mount gets a topic string that has never existed before.
  //
  // hooks/useConversations.ts was the last hook subscribing on a fixed literal
  // ('messages:inbox'), and it was the one that needed the mitigation MOST:
  // it backs a tab screen, where remount is the ordinary gesture.
  const SUFFIX = /\$\{instanceId\}:\$\{runRef\.current\+\+\}`/;

  // No fixed-topic subscription remains. hooks/useReactions.ts was the last
  // one (keyed per job, so a fast remount on the SAME job collided — opening
  // a job's chat twice crashed the app, FIX-RUN A3, 2026-10-03); its suffix
  // is asserted below. The list stays, empty, so a new fixed topic cannot be
  // excused by adding itself here without a reviewer seeing it.
  const KNOWN_FIXED_TOPIC = [];

  const sources = [];
  for (const dir of ['hooks', 'screens', 'components', 'lib']) {
    for (const name of readdirSync(join(root, dir))) {
      if (name.endsWith('.ts') || name.endsWith('.tsx')) sources.push(`${dir}/${name}`);
    }
  }

  // Comments in these files QUOTE the broken form on purpose — useOpenjobs.ts
  // explains the bug with `.channel(sameTopic)` in prose — so the sweep reads
  // code only.
  const stripComments = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  let checked = 0;
  const offenders = [];
  for (const file of sources) {
    const body = stripComments(read(file));
    for (const call of body.matchAll(/\.channel\(([^)]*)\)/g)) {
      checked += 1;
      if (KNOWN_FIXED_TOPIC.includes(file)) continue;
      if (!SUFFIX.test(call[1])) offenders.push(`${file}: .channel(${call[1].trim()})`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'these realtime topics are not unique per mount — see hooks/useOpenJobs.ts:\n' +
      offenders.join('\n'),
  );
  // The sweep must actually be finding call sites; a rename that emptied it
  // would otherwise pass silently.
  assert.ok(checked >= 7, `the channel sweep must stay wired (saw ${checked} call sites)`);

  // The reactions hook specifically (A3): the per-job key stays, so the
  // filter still scopes the subscription, and the per-mount suffix follows.
  const reactions = read('hooks/useReactions.ts');
  assert.match(reactions, /\.channel\(`reactions:job:\$\{jobId\}:\$\{instanceId\}:\$\{runRef\.current\+\+\}`\)/);
  assert.doesNotMatch(reactions, /\.channel\(`reactions:job:\$\{jobId\}`\)/, 'the fixed per-job topic must not come back');

  // And the inbox specifically, since it is the one this run moved: unique
  // topic, debounced refresh, and a teardown that cancels the pending timer
  // before removing the channel.
  const inbox = read('hooks/useConversations.ts');
  assert.match(inbox, /\.channel\(`messages:inbox:\$\{instanceId\}:\$\{runRef\.current\+\+\}`\)/);
  assert.doesNotMatch(inbox, /\.channel\('messages:inbox'\)/, 'the fixed topic must not come back');
  assert.match(inbox, /const REFRESH_DEBOUNCE_MS = (\d+);/);
  const window = Number(/const REFRESH_DEBOUNCE_MS = (\d+);/.exec(inbox)[1]);
  assert.ok(window >= 200 && window <= 300, `a trailing inbox debounce belongs in 200-300ms, not ${window}`);
  assert.match(
    inbox,
    /debounceRef\.current = setTimeout\(refresh, REFRESH_DEBOUNCE_MS\)/,
    'the burst must collapse into one refresh',
  );
  assert.doesNotMatch(
    inbox,
    /table: 'messages' \},\s*\(\) => refresh\(\)/,
    'an INSERT must schedule a refresh, not perform one',
  );
  assert.match(
    inbox,
    /if \(debounceRef\.current\) clearTimeout\(debounceRef\.current\);\s*supabase\.removeChannel\(channel\);/,
    'teardown must cancel the pending refresh before dropping the channel',
  );
});
