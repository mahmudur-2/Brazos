import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * One person, one conversation.
 *
 * A customer and a worker have exactly ONE conversation, ever. Jobs are
 * context inside it, not separate rooms, and the inbox may never show two rows
 * for the same person.
 *
 * This is a PRESENTATION-LAYER collapse: message rows still key on job_id /
 * direct_thread_id underneath (phase66's RLS lock, the offer events and the
 * chat-media storage paths all depend on that). What is asserted here is the
 * collapse itself — the grouping, the send-target resolver, and the surfaces
 * that must read the resolver's answer rather than deciding for themselves.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Executed, not read: the resolver is a pure module with no runtime imports,
// the lib/jobLifecycle.ts precedent.
const resolverUrl = pathToFileURL(join(root, 'lib/conversationResolver.ts')).href;
const { resolveActiveJob, resolveConversation, groupThreadsByPerson } = await import(
  resolverUrl
);

const job = (id, createdAt, lastMessageAt = null) => ({
  id,
  title: `Job ${id}`,
  createdAt,
  lastMessageAt,
});

// ---------------------------------------------------------------------------
// C — the send resolver, executed against the signed-off contract
// ---------------------------------------------------------------------------

test('the resolver picks the active job over the pair thread', () => {
  const active = job('job-a', '2026-08-01T00:00:00Z', '2026-08-10T00:00:00Z');

  const resolved = resolveConversation([active], 'thread-1');
  assert.deepEqual(resolved.target, { jobId: 'job-a' });
  assert.equal(resolved.activeJob?.id, 'job-a');

  // No active job — and only then — the pair thread carries the conversation.
  const pair = resolveConversation([], 'thread-1');
  assert.deepEqual(pair.target, { directThreadId: 'thread-1' });
  assert.equal(pair.activeJob, null);

  // Neither: a pair with no active job and no direct thread is not a
  // conversation yet, and must not be answered with a fabricated target.
  assert.deepEqual(resolveConversation([], null), { target: null, activeJob: null });
});

test('rule 1 — among jobs that both have activity, most recent activity wins', () => {
  const stale = job('job-a', '2026-08-01T00:00:00Z', '2026-08-02T00:00:00Z');
  const lively = job('job-b', '2026-08-01T00:00:00Z', '2026-08-09T00:00:00Z');

  assert.equal(resolveActiveJob([stale, lively])?.id, 'job-b');
  // Order in must not decide the answer.
  assert.equal(resolveActiveJob([lively, stale])?.id, 'job-b');
});

test('rule 2 — a brand-new job with no chat beats an older job still being chatted in', () => {
  // THE case the rule exists for. The old job's last message (Aug 12) is NEWER
  // than the new job's creation (Aug 10), so comparing activity-to-creation
  // would hand the conversation back to the old job and route the first
  // message about the new work into it. The comparison is created_at against
  // created_at, so the newer WORK wins over the older job's chatter.
  const chattyOldJob = job('job-old', '2026-08-01T00:00:00Z', '2026-08-12T00:00:00Z');
  const brandNewJob = job('job-new', '2026-08-10T00:00:00Z', null);

  assert.equal(resolveActiveJob([chattyOldJob, brandNewJob])?.id, 'job-new');
  assert.equal(resolveActiveJob([brandNewJob, chattyOldJob])?.id, 'job-new');
  assert.deepEqual(resolveConversation([chattyOldJob, brandNewJob], 'thread-1').target, {
    jobId: 'job-new',
  });

  // And the converse, which is the same rule and not a special case: a job
  // nobody ever spoke about, created BEFORE the one being chatted in, does
  // not get to take the conversation off it.
  const staleSilentJob = job('job-silent', '2026-07-01T00:00:00Z', null);
  assert.equal(resolveActiveJob([chattyOldJob, staleSilentJob])?.id, 'job-old');

  // Nothing has been said about any of them: newer work still wins.
  assert.equal(resolveActiveJob([staleSilentJob, brandNewJob])?.id, 'job-new');
});

test('rule 3 — ties on the deciding value break by ascending job id', () => {
  // Tie on activity.
  const sameActivityB = job('job-b', '2026-08-01T00:00:00Z', '2026-08-09T00:00:00Z');
  const sameActivityA = job('job-a', '2026-08-02T00:00:00Z', '2026-08-09T00:00:00Z');
  assert.equal(resolveActiveJob([sameActivityB, sameActivityA])?.id, 'job-a');
  assert.equal(resolveActiveJob([sameActivityA, sameActivityB])?.id, 'job-a');

  // Tie on creation, between two jobs nobody has spoken about.
  const silentB = job('job-b', '2026-08-05T00:00:00Z', null);
  const silentA = job('job-a', '2026-08-05T00:00:00Z', null);
  assert.equal(resolveActiveJob([silentB, silentA])?.id, 'job-a');

  // Tie on creation across rule 2's head-to-head: silent job vs chatty job,
  // created at the same instant.
  const chatty = job('job-b', '2026-08-05T00:00:00Z', '2026-08-20T00:00:00Z');
  assert.equal(resolveActiveJob([chatty, silentA])?.id, 'job-a');
});

test('the resolver is total: no candidates, and unparseable timestamps', () => {
  assert.equal(resolveActiveJob([]), null);
  // Junk timestamps sort oldest and fall through to the id tiebreak rather
  // than throwing or returning undefined.
  const broken = [job('job-b', 'not-a-date', null), job('job-a', 'not-a-date', null)];
  assert.equal(resolveActiveJob(broken)?.id, 'job-a');
});

// ---------------------------------------------------------------------------
// A — one row per person
// ---------------------------------------------------------------------------

const thread = (counterpartyId, jobId, directThreadId, lastMessageAt) => ({
  counterpartyId,
  jobId,
  directThreadId,
  lastMessageAt,
});
const describe = (t) => t;

test('every thread with one person folds into exactly one conversation', () => {
  const threads = [
    thread('alice', 'job-1', null, '2026-08-01T00:00:00Z'),
    thread('alice', 'job-2', null, '2026-08-09T00:00:00Z'),
    thread('alice', null, 'thread-alice', '2026-08-05T00:00:00Z'),
    thread('bob', 'job-3', null, '2026-08-07T00:00:00Z'),
  ];

  const people = groupThreadsByPerson(threads, describe);
  assert.equal(people.length, 2);
  assert.deepEqual(
    people.map((p) => p.counterpartyId),
    ['alice', 'bob']
  );

  const alice = people[0];
  assert.equal(alice.threads.length, 3);
  // The preview is the newest message across ALL of them, whichever thread it
  // is in — and the pair thread is carried through for the resolver.
  assert.equal(alice.latest.jobId, 'job-2');
  assert.equal(alice.directThreadId, 'thread-alice');
});

test('grouping never produces two rows for one person, whatever the input order', () => {
  const threads = [
    thread('alice', null, 'thread-alice', '2026-08-05T00:00:00Z'),
    thread('bob', 'job-3', null, '2026-08-07T00:00:00Z'),
    thread('alice', 'job-2', null, '2026-08-09T00:00:00Z'),
    thread('alice', 'job-1', null, '2026-08-01T00:00:00Z'),
  ];

  const people = groupThreadsByPerson(threads, describe);
  const ids = people.map((p) => p.counterpartyId);
  assert.equal(new Set(ids).size, ids.length, 'one row per person, always');
  assert.equal(people.length, 2);
  // Newest activity first, regardless of the order threads arrived in.
  assert.deepEqual(ids, ['alice', 'bob']);
  assert.equal(people[0].latest.jobId, 'job-2');
});

test('the inbox renders one row per person and never counts conversations', async () => {
  const inbox = stripComments(await read('screens/MessagesInboxScreen.tsx'));

  // The row list is built from grouped people, and each row is keyed by the
  // PERSON — two rows for one counterparty is not expressible.
  assert.match(inbox, /groupThreadsByPerson\(conversations,/);
  assert.match(inbox, /key: `person:\$\{otherId\}`/);
  // The per-thread map that produced one row per job is gone.
  assert.doesNotMatch(inbox, /conversations\.map\(/);

  // The neutral summary that existed only because a person could own several
  // rows is gone with the rows.
  assert.doesNotMatch(inbox, /conversations together/);
  assert.doesNotMatch(inbox, /counterpartyJobCounts/);

  // Unread and the waiting-offer badge fold across every thread of that
  // person's, or a conversation could go unanswered with nothing to show it.
  assert.match(inbox, /unread: person\.threads\.some\(unreadInThread\)/);
  assert.match(inbox, /awaitingRequest: person\.threads\.some\(awaitingInThread\)/);
});

test('the inbox subtitle is the resolver’s job, never a second opinion', async () => {
  const inbox = stripComments(await read('screens/MessagesInboxScreen.tsx'));

  // ONE call, feeding both the subtitle and the row's destination — the inbox
  // must never display one job while sends route to another.
  assert.equal(
    (inbox.match(/resolveConversation\(/g) ?? []).length,
    1,
    'the inbox must resolve the conversation exactly once'
  );
  assert.match(inbox, /const \{ target, activeJob \} = resolveConversation\(/);
  assert.match(inbox, /subtitle: isSelf \? null : activeJob\?\.title \?\? null/);

  // The candidate set is the active jobs shared with THAT person, and the
  // canonical activity timestamp comes from the conversation rows themselves.
  assert.match(inbox, /fetchActiveJobs\(user\.id\)/);
  assert.match(inbox, /lastMessageAt: activityByJob\[job\.id\] \?\? null/);

  // No second definition of "still being worked" on this screen.
  assert.doesNotMatch(inbox, /deriveJobLifecycle/);
});

test('the active-job window is stated once, in the data layer', async () => {
  const conversations = stripComments(await read('lib/conversations.ts'));
  assert.match(conversations, /ACTIVE_JOB_STATUSES: string\[\] = \['assigned', 'in_progress'\]/);
  assert.match(conversations, /\.in\('status', ACTIVE_JOB_STATUSES\)/);
  // Both sides of a job, in one round trip.
  assert.match(
    conversations,
    /\.or\(`client_id\.eq\.\$\{userId\},assigned_worker_id\.eq\.\$\{userId\}`\)/
  );
});

test('the resolver stays a pure module the tests can execute', async () => {
  const source = await read('lib/conversationResolver.ts');
  // Only type-only imports, which erase — anything else and this file stops
  // being runnable outside the app (and starts being harder to trust).
  for (const line of source.split('\n')) {
    if (!/^\s*import\b/.test(line)) continue;
    assert.match(line, /^import type /, `lib/conversationResolver.ts must stay pure: ${line}`);
  }
  // The signed-off contract is recorded where an editor will see it.
  assert.match(source, /THE AUTHORITATIVE RESOLVER CONTRACT/);
  assert.match(source, /Ties on the deciding value break by ascending job id/);
});
