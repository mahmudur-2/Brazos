import assert from 'node:assert/strict';
import { existsSync as fsExistsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const existsSync = (path) => fsExistsSync(join(root, path));

// The live schema: the baseline (pg_dump form) and the migrations after it. The
// newest migration that defines an object is its live definition.
const migrationFiles = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const allMigrations = migrationFiles.map((f) => read(`supabase/migrations/${f}`)).join('\n');
const baseline = read('supabase/migrations/20260901000000_baseline.sql');
/** One function's dump block in the baseline. */
const fnBlock = (name) => {
  const start = baseline.indexOf(`CREATE OR REPLACE FUNCTION "public"."${name}"(`);
  const end = baseline.indexOf(`ALTER FUNCTION "public"."${name}"(`, start);
  assert.ok(start > 0 && end > start, `the baseline must define ${name}()`);
  return baseline.slice(start, end);
};
/** One policy's dump statement in the baseline. */
const policy = (name) => {
  const start = baseline.indexOf(`CREATE POLICY "${name}"`);
  assert.ok(start > 0, `the baseline must create policy ${name}`);
  return baseline.slice(start, baseline.indexOf(';\n', start));
};
/** The table-level privileges the baseline grants one role on one table. */
const tableGrant = (table, role) => {
  const line = baseline.match(new RegExp(`^GRANT ([A-Z,]+) ON TABLE "public"\\."${table}" TO "${role}";$`, 'm'));
  assert.ok(line, `the baseline must grant ${role} something on ${table}`);
  return line[1].split(',');
};
const profiles = read('lib/profiles.ts');
const jobs = read('lib/jobs.ts');
const offers = read('lib/offers.ts');
const reviews = read('lib/reviews.ts');
const storage = read('lib/storage.ts');
const pushHook = read('hooks/usePushNotifications.ts');
const home = read('screens/HomeScreen.tsx');
const jobDetail = read('screens/JobDetailScreen.tsx');

test('protected profile fields are outside direct authenticated writes and reads', () => {
  // phase29's revoke, as the baseline holds it: no table-wide read or write.
  const profileTable = tableGrant('profiles', 'authenticated');
  for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    assert.ok(!profileTable.includes(verb), `authenticated must not ${verb} profiles table-wide`);
  }
  const updateMyProfile = fnBlock('update_my_profile');
  assert.match(updateMyProfile, /^CREATE OR REPLACE FUNCTION "public"\."update_my_profile"\("p_patch" "jsonb"\)/);
  // phase29's six keys plus phase53's two availability keys, and nothing else.
  assert.match(
    updateMyProfile,
    /where k\.key not in \(\s*'full_name', 'phone', 'avatar_url', 'bio', 'language', 'categories',\s*'accepting_work', 'availability_note'\s*\)/i
  );

  const publicGrant = [
    ...baseline.matchAll(/^GRANT SELECT\("(\w+)"\) ON TABLE "public"\."profiles" TO "authenticated";$/gm),
  ].map((m) => m[1]);
  assert.ok(publicGrant.length > 0, 'public profile column grant must exist');
  for (const privateColumn of ['phone', 'is_admin', 'banned']) {
    assert.ok(!publicGrant.includes(privateColumn), `${privateColumn} must not be column-granted`);
  }
  for (const publicColumn of ['id', 'full_name', 'avatar_url', 'verification_status']) {
    assert.ok(publicGrant.includes(publicColumn), `${publicColumn} must be column-granted`);
  }

  assert.doesNotMatch(profiles, /\.select\(['"]\*['"]\)/);
  assert.match(profiles, /\.rpc\('update_my_profile'/);
  assert.match(profiles, /\.rpc\('get_my_profile'/);
});

test('job, bid, and review protected writes use server-validated RPCs', () => {
  // phase29's revokes, as the baseline holds them.
  for (const [table, verbs] of [
    ['jobs', ['INSERT', 'UPDATE']],
    ['bids', ['INSERT', 'UPDATE']],
    ['reviews', ['INSERT', 'UPDATE', 'DELETE']],
  ]) {
    const granted = tableGrant(table, 'authenticated');
    for (const verb of verbs) assert.ok(!granted.includes(verb), `authenticated must not ${verb} ${table}`);
  }
  // The owner's delete: open and unengaged, decided by a definer helper
  // (phase60 moved the predicate out of the policy to end its recursion).
  assert.match(policy('jobs_delete_own'), /FOR DELETE TO "authenticated" USING \("public"\."can_delete_own_job"\("id"\)\)/);
  const canDelete = fnBlock('can_delete_own_job');
  assert.match(canDelete, /if v_client_id is distinct from auth\.uid\(\) then\s+return false;/);
  assert.match(canDelete, /if v_status is distinct from 'open'::public\.job_status then\s+return false;/);
  assert.match(canDelete, /if exists \(select 1 from public\.job_offers o where o\.job_id = p_job_id\) then\s+return false;/);
  for (const fn of ['create_job', 'update_job_details', 'transition_job_status', 'create_review']) {
    assert.match(allMigrations, new RegExp(`create (or replace )?function "?public"?\\."?${fn}"?\\(`, 'i'), `${fn}() must exist`);
  }
  // accept_offer() (the only assignment path) locks the job and the offer, and
  // refuses an inactive worker.
  const acceptOffer = fnBlock('accept_offer');
  assert.match(acceptOffer, /from public\.jobs where id = v_job\.id for update;/);
  assert.match(acceptOffer, /from public\.job_offers where id = p_offer_id for update;/);
  assert.match(acceptOffer, /if not public\.is_profile_active\(v_offer\.worker_id\)[\s\S]*?Worker is not available/);

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
  const phase47 = fnBlock('project_offer_chain_to_bids');

  // One projection, driven by the source of truth.
  assert.match(baseline, /CREATE OR REPLACE TRIGGER "job_offers_mirror_bids" AFTER INSERT OR UPDATE ON "public"\."job_offers"/);
  assert.match(phase47, /^CREATE OR REPLACE FUNCTION "public"\."project_offer_chain_to_bids"\(/);

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

  // Nothing else writes bids: the projection holds the only insert, update and
  // delete on the table in the whole live schema.
  for (const write of [/insert into public\.bids\b/gi, /update public\.bids\b/gi, /delete from public\.bids\b/gi]) {
    assert.equal((allMigrations.match(write) ?? []).length, 1, `${write} must appear once, in the projection`);
    assert.equal((phase47.match(write) ?? []).length, 1, `${write} must be the projection's`);
  }
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

  // The RPC the app depends on still exists and is still transactional: its
  // newest definition (job completions) locks the row and checks the caller.
  const completions = read('supabase/migrations/20260925000000_job_completions.sql');
  const transition = completions.slice(completions.indexOf('create or replace function public.transition_job_status('));
  assert.match(transition, /^create or replace function public\.transition_job_status\(/);
  assert.match(transition, /where id = p_job_id\s+for update;/i);
  assert.match(transition, /v_job\.assigned_worker_id is distinct from v_user/i);
  const later = migrationFiles.filter((f) => f > '20260925000000_job_completions.sql');
  for (const f of later) {
    assert.doesNotMatch(read(`supabase/migrations/${f}`), /function public\.transition_job_status\(/i, `${f} redefines it`);
  }

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
  // Buckets are storage data, not schema: the local stack's seed creates the
  // chat bucket private (staging's was created the same way by hand).
  assert.match(read('supabase/seed.sql'), /\('chat-photos',\s+'chat-photos',\s+false\)/);
  assert.match(
    policy('chat_photos_insert_party'),
    /\(\("storage"\."foldername"\("name"\)\)\[2\] = \("auth"\."uid"\(\)\)::"text"\)/
  );
  assert.match(
    policy('chat_photos_read_party'),
    /\(\("j"\."client_id" = "auth"\."uid"\(\)\) OR \("j"\."assigned_worker_id" = "auth"\."uid"\(\)\)\)/
  );
  assert.match(storage, /`\$\{jobId\}\/\$\{userId\}\/\$\{Date\.now\(\)\}/);
  assert.match(storage, /createSignedUrl\(path, CHAT_SIGNED_URL_TTL_SECONDS\)/);
  assert.match(storage, /if \(privateReference\) \{\s*return \{ url: storageReference\(bucket, path\), error: null \};/);
});

test('avatar and job-photo writes are path-owned', () => {
  assert.match(
    policy('avatars_insert'),
    /"bucket_id" = 'avatars'::"text"\) AND \(\("storage"\."foldername"\("name"\)\)\[1\] = \("auth"\."uid"\(\)\)::"text"\)/
  );
  assert.match(
    policy('job_photos_insert'),
    /\(\("storage"\."foldername"\("name"\)\)\[1\] = 'postings'::"text"\) AND \(\("storage"\."foldername"\("name"\)\)\[2\] = \("auth"\."uid"\(\)\)::"text"\)/
  );
});

test('the push hook registers its three native listener effects', () => {
  // The cold-start read, the tap listener, and (F13) the received listener
  // that refreshes the bell's count. (Lean D2 removed their web guards.)
  assert.match(pushHook, /getLastNotificationResponseAsync/);
  assert.match(pushHook, /addNotificationResponseReceivedListener/);
  assert.match(pushHook, /useEffect\(\(\) => \{\s*const subscription = Notifications\.addNotificationReceivedListener\(/);
});

test('function EXECUTE is revoked from anon and regranted to intended roles only', () => {
  // App RPCs, in the baseline's ACL form: PUBLIC revoked, the intended roles
  // granted, anon never. (accept_bid went with the deprecated shims in lean D6.)
  const acl = (signature) => baseline.split('\n').filter((line) => line.includes(` ON FUNCTION "public"."${signature}`));
  for (const [signature, roles] of [
    ['is_active_user"()', ['authenticated', 'service_role']],
    ['transition_job_status"("p_job_id" "uuid", "p_status" "text", "p_completion_photos" "jsonb", "p_completion_videos" "jsonb")', ['authenticated']],
  ]) {
    const lines = acl(signature);
    assert.ok(lines.some((l) => l.startsWith('REVOKE ALL ') && l.endsWith(' FROM PUBLIC;')), `${signature} must be revoked from PUBLIC`);
    for (const role of roles) {
      assert.ok(lines.some((l) => l.startsWith('GRANT ALL ') && l.endsWith(` TO "${role}";`)), `${signature} must be granted to ${role}`);
    }
    assert.ok(!lines.some((l) => l.endsWith(' TO "anon";')), `${signature} must never be granted to anon`);
  }
  // create_review's newest signature (R8a) restates its own ACL.
  const reputation = read('supabase/migrations/20260925000100_r8a_reputation.sql');
  assert.match(reputation, /revoke all on function public\.create_review\(uuid, uuid, integer, text, jsonb, boolean\) from public, anon;/);
  assert.match(reputation, /grant execute on function public\.create_review\(uuid, uuid, integer, text, jsonb, boolean\) to authenticated;/);

  // The outbox drainer mutates notification_outbox.attempts: service_role only,
  // restated by its newest definition (quiet hours).
  const quiet = read('supabase/migrations/20260930000800_quiet_hours.sql');
  assert.match(quiet, /revoke all on function public\.claim_notification_batch\(integer\) from public, anon, authenticated;/);
  assert.match(quiet, /grant execute on function public\.claim_notification_batch\(integer\) to service_role;/);
  const drainer = acl('claim_notification_batch"("p_limit" integer)');
  assert.ok(drainer.some((l) => l.endsWith(' TO "service_role";')));
  assert.ok(!drainer.some((l) => /TO "(anon|authenticated)";$/.test(l)), 'claim_notification_batch must never be granted to authenticated');
  assert.doesNotMatch(
    allMigrations,
    /grant execute on function public\.claim_notification_batch\([^;]*to[^;]*authenticated/i,
    'claim_notification_batch must never be granted to authenticated'
  );

  // Deny-by-default for future functions, so the anon drift cannot recur: the
  // public schema's function defaults grant the owner only.
  assert.match(baseline, /^ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";$/m);
  assert.doesNotMatch(baseline, /^ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT [^;]* ON FUNCTIONS TO (PUBLIC|"anon"|"authenticated"|"service_role");$/m);
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
  const lean = read('supabase/migrations/20261108000000_lean_v1.sql');
  const workerProfile = read('screens/WorkerProfileScreen.tsx');

  // The defect phase36 fixed: eligibility used to require a shared completed
  // job, which is what made one profile offer "Send an offer" and another a
  // "Post a job" consolation. (The job_requests path itself went in lean D6.)
  assert.doesNotMatch(
    allMigrations,
    /You can only send a request to a worker who has completed a job for you/i
  );
  assert.doesNotMatch(workerProfile, /Direct offers open up once/i);
  assert.doesNotMatch(workerProfile, /title="Post a job"/i);

  // Thread creation is not a client capability — it only happens as part of
  // sending an offer.
  const threadAcl = baseline.split('\n').filter((l) => l.includes(' ON FUNCTION "public"."ensure_direct_thread"('));
  assert.ok(threadAcl.some((l) => l.startsWith('REVOKE ALL ') && l.endsWith(' FROM PUBLIC;')));
  assert.ok(!threadAcl.some((l) => l.startsWith('GRANT ')), 'ensure_direct_thread is granted to no client role');

  // Reading a direct thread's messages requires being one of its two
  // participants, and sending (lean_v1's restated policy) additionally
  // requires the pair not be blocked.
  assert.match(
    policy('messages_select_party'),
    /FROM "public"\."direct_threads" "t"[\s\S]*?\(\("t"\."user_a" = "auth"\."uid"\(\)\) OR \("t"\."user_b" = "auth"\."uid"\(\)\)\)/
  );
  const insertPolicy = lean.slice(lean.indexOf('alter policy messages_insert_party on public.messages'));
  assert.match(
    insertPolicy,
    /from public\.direct_threads t[\s\S]*?\(t\.user_a = auth\.uid\(\) or t\.user_b = auth\.uid\(\)\)/i
  );
  assert.match(insertPolicy, /not public\.is_blocked_between\(t\.user_a, t\.user_b\)/i);

  // The inbox view must keep running as the caller, so it can never widen
  // what a user can read (lean_v1 re-created it).
  assert.match(lean, /create view public\.conversations with \(security_invoker = true\)/i);
});

test('profile reviews are readable without widening the reviews policy', () => {
  // R8a holds the newest reviews_select_party, create_review and both readers.
  const phase37 = read('supabase/migrations/20260925000100_r8a_reputation.sql');

  // The party-scoped SELECT policy is the reason a reader needs a function at
  // all; R8a narrowed it further (the reviewee reads only once revealed).
  assert.match(
    phase37,
    /create policy "reviews_select_party" on public\.reviews[\s\S]*?reviewer_id = auth\.uid\(\)\s+or \(\s+reviewee_id = auth\.uid\(\)/i
  );
  assert.doesNotMatch(allMigrations, /grant select on public\.reviews/i);

  // Both readers are security definer with a fixed search_path, require a
  // signed-in caller, and are granted only to authenticated.
  for (const fn of ['profile_reviews', 'profile_review_summary']) {
    const decl = 'create function public\\.' + fn + '\\(';
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
    /revoke all on function public\.create_review\(uuid, uuid, integer, text, jsonb, boolean\)\s+from public, anon;/i
  );

  // Review photos get their own owner-scoped storage prefix rather than
  // loosening either existing job-photos branch.
  assert.match(
    policy('job_photos_insert_review'),
    /\(\("storage"\."foldername"\("name"\)\)\[1\] = 'reviews'::"text"\) AND \(\("storage"\."foldername"\("name"\)\)\[2\] = \("auth"\."uid"\(\)\)::"text"\)/
  );
  assert.doesNotMatch(allMigrations, /drop policy if exists "?job_photos_insert"? on/i);
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
  // a job's chat twice crashed the app, FIX-RUN A3, 2026-10-03); lean D3a
  // deleted it with reactions. The list stays, empty, so a new fixed topic cannot be
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
