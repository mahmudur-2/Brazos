import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const migration = read('supabase/phase29_security_hardening.sql');
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

test('unsupported identity and proximity claims are absent', () => {
  assert.doesNotMatch(verificationBadge, /ID-checked/i);
  assert.match(verificationBadge, /Not verified/);
  assert.doesNotMatch(home, /Nearby open jobs/i);
  assert.doesNotMatch(jobDetail, /Similar jobs nearby/i);
});
