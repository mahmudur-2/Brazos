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
  //
  // W1 narrowed the UNREAD fold to the threads still in this user's copy: a
  // thread they cleared has no messages left to have missed, so counting it
  // would light the row for something they cannot open. The waiting-offer
  // badge still folds across ALL of them, because an offer waiting on this
  // user is live whatever they did to their own copy of the thread.
  assert.match(inbox, /unread: liveThreads\.some\(unreadInThread\)/);
  assert.match(inbox, /const liveThreads = person\.threads\.filter\(/);
  assert.match(inbox, /awaitingRequest: person\.threads\.some\(awaitingInThread\)/);
});

test('the inbox subtitle is the resolver’s job, never a second opinion', async () => {
  const inbox = stripComments(await read('screens/MessagesInboxScreen.tsx'));

  // The subtitle is the SAME rule the chat screen sends by — one resolver,
  // asked once, so the inbox can never name one job while sends go elsewhere.
  assert.equal(
    (inbox.match(/resolveActiveJob\(/g) ?? []).length,
    1,
    'the inbox must resolve the active job exactly once'
  );
  assert.match(inbox, /const activeJob = resolveActiveJob\(candidates\)/);
  // 2026-09-28 (LUX-LIST-64 #54): the subtitle became the row's JOB CHIP. It
  // names the resolver's active job whenever there is one — the same rule,
  // still asked once — and only when there is none does it name the
  // conversation's most recent job, as context: its title alone once the job
  // is finished (the approved clean list's "a finished job shows the title
  // only"). While a job is active, no other job is ever named.
  assert.match(inbox, /const chipJob = activeJob\s*\? \{ id: activeJob\.id, title: activeJob\.title \}/);
  assert.match(inbox, /job:\s*isSelf \|\| !chipJob\s*\? null/);

  // The candidate set is the active jobs shared with THAT person, and the
  // canonical activity timestamp comes from the conversation rows themselves.
  assert.match(inbox, /fetchActiveJobs\(user\.id\)/);
  assert.match(inbox, /lastMessageAt: activityByJob\[job\.id\] \?\? null/);

  // No second definition of "still being worked" on this screen. The chip's
  // stage is read and derived in the data layer (lib/inboxStages.ts).
  assert.doesNotMatch(inbox, /deriveJobLifecycle/);
  assert.match(inbox, /fetchJobLifecycleStates\(jobIds\)/);
});

test('the active-job window is stated once, in the data layer', async () => {
  const conversations = stripComments(await read('lib/conversations.ts'));
  // F6: the window is lib/jobLifecycle.ts's one live set, spread here, never restated.
  // F7: typed as the database's own enum, so the status filter is compile-checked.
  assert.match(conversations, /ACTIVE_JOB_STATUSES: readonly JobStatusEnum\[\] = LIVE_JOB_STATUSES;/);
  assert.match(conversations, /import \{ LIVE_JOB_STATUSES \} from '\.\/jobLifecycle';/);
  assert.match(
    stripComments(await read('lib/jobLifecycle.ts')),
    /export const LIVE_JOB_STATUSES = \['assigned', 'in_progress'\] as const;/
  );
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

// ---------------------------------------------------------------------------
// B — one merged timeline, chronological, with job dividers
// ---------------------------------------------------------------------------

test('the chat screen renders one merged timeline, never one thread', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  // Every thread with this person is loaded together: their job threads, any
  // stage, plus their pair thread.
  assert.match(chat, /fetchSharedJobs\(user\.id, counterpartyId\)/);
  assert.match(chat, /fetchDirectThreadWith\(user\.id, counterpartyId\)/);
  // F5: the same hook over the same targets, now paged; a legacy jobId anchors the load.
  assert.match(chat, /useConversationChat\(\s*targets,\s*\{ anchorJobId: routeJobId \}\s*\)/);
  // The thread the caller named is always in the conversation, even if the
  // shared-job read is slow or comes back short.
  assert.match(chat, /if \(routeJobId\) add\(\{ jobId: routeJobId \}\)/);
  assert.match(chat, /if \(routeDirectThreadId\) add\(\{ directThreadId: routeDirectThreadId \}\)/);

  // Chronology wins: the merge sorts by created_at and nothing regroups by job.
  // F5: the merge is lib/messages.ts's visibleWindow(), which the hook reads.
  const hook = stripComments(await read('hooks/useConversationChat.ts'));
  const windowFn = stripComments(await read('lib/messages.ts'));
  assert.match(hook, /useMemo\(\(\) => visibleWindow\(byThread, cursor, hasMore\), \[byThread, cursor, hasMore\]\)/);
  assert.match(windowFn, /Date\.parse\(a\.created_at\) - Date\.parse\(b\.created_at\)/);
  assert.doesNotMatch(hook, /job_id\s*===/);
  assert.doesNotMatch(windowFn.slice(windowFn.indexOf('export function visibleWindow')), /job_id\s*===/);
});

test('a job divider marks a CHANGE of context, and never on the pair thread', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  // The divider is emitted on a change from the preceding message, so the same
  // job can head more than one when two conversations interleave.
  assert.match(chat, /if \(messageJobId !== context\)/);
  // A pair-thread message carries no job, so it produces no divider — the
  // guard is on the job id being present, not on it being different.
  assert.match(chat, /if \(messageJobId\) \{/);
  assert.match(chat, /kind: 'divider'/);
  assert.match(chat, /title: jobTitles\[messageJobId\] \?\? 'Job'/);
});

test('the merged store is keyed by thread and never assigned wholesale', async () => {
  const hook = stripComments(await read('hooks/useConversationChat.ts'));

  // THE 16511c9 failure mode, one subject over: N reads and N realtime
  // channels writing one array, last answer winning outright. Every write
  // lands in its own thread slice instead.
  for (const write of [
    /return \{ \.\.\.previous, \[key\]: \[\.\.\.existing, message\] \};/,
    /\[key\]: existing\.map\(\(m\) => \(m\.id === message\.id \? message : m\)\)/,
  ]) {
    assert.match(hook, write);
  }
  // A failed read keeps what that thread already had rather than blanking it.
  assert.match(hook, /next\[key\] = result\.error \? previous\[key\] \?\? \[\] : result\.data;/);
  // And the only full-map write is the one load that owns every thread at
  // once, guarded by a sequence counter.
  assert.match(hook, /if \(load !== loadRef\.current\) return;/);
});

// ---------------------------------------------------------------------------
// B2 — every existing route shape keeps working
// ---------------------------------------------------------------------------

test('counterpartyId is canonical and the legacy shapes stay valid', async () => {
  const nav = await read('lib/navigation.ts');
  assert.match(nav, /export type ChatTargetParams =/);
  // The legacy union is carried through rather than replaced, so no call site
  // has to manufacture a counterparty id.
  assert.match(nav, /\(ChatTarget & \{ counterpartyId\?: undefined \}\)/);
  assert.match(nav, /\{ counterpartyId: string; jobId\?: undefined; directThreadId\?: undefined \}/);
  // Chat is still registered in all four stacks that mount it.
  assert.equal((nav.match(/Chat: ChatTargetParams;/g) ?? []).length, 4);

  const chat = stripComments(await read('screens/ChatScreen.tsx'));
  // The person is derived at the screen boundary from whichever id arrived.
  assert.match(chat, /if \(routeCounterpartyId\) return routeCounterpartyId;/);
  assert.match(chat, /if \(thread\) return otherParticipant\(thread, user\.id\);/);
  assert.match(chat, /return resolveOtherId\(job, user\.id\);/);
});

test('every entry point from the audit still opens Chat with a shape Chat accepts', async () => {
  // The regression surface, enumerated. Each navigates with a jobId, a
  // directThreadId or a counterpartyId — the three shapes ChatTargetParams
  // admits — and tsc proves the params typecheck against the route.
  const expected = [
    ['screens/MessagesInboxScreen.tsx', /navigation\.navigate\('Chat', \{ counterpartyId: item\.otherId \}\)/],
    ['screens/ClientJobDetailScreen.tsx', /navigation\.navigate\('Chat', \{ jobId: job\.id \}\)/],
    ['screens/JobConfirmedScreen.tsx', /navigation\.navigate\('Chat', \{ jobId: job\.id \}\)/],
    ['screens/TrackWorkerScreen.tsx', /navigation\.navigate\('Chat', \{ jobId: job\.id \}\)/],
    ['screens/WorkerJobScreen.tsx', /navigation\.navigate\('Chat', \{ jobId: job\.id \}\)/],
    // Stage 4A: the feed stopped opening Chat itself and delegates to the same
    // router the push tap uses, so its entry point IS the delegation — since
    // Stage 4D carrying ModeContext for the router's cross-mode gate.
    ['screens/NotificationsScreen.tsx', /handleNotificationData\(notification\.data, modeBridge\)/],
    // Both Chat shapes are still built — now as resolved targets rather than
    // at the call site — and dispatched by the single navigateChecked below.
    ['lib/notificationRoutes.ts', /screen: 'Chat',\s*params: \{ directThreadId: data\.directThreadId \}/],
    // 2026-09-30 (idea 6): the worker's job may carry the reminder's Route intent beside the job.
    ['lib/notificationRoutes.ts', /screen: data\.screen, params: \{ jobId: data\.jobId(?:, \.\.\.intent)? \}/],
    ['lib/notificationRoutes.ts', /navigateChecked\(target\.tab, target\.screen, target\.params\)/],
  ];
  for (const [file, pattern] of expected) {
    assert.match(stripComments(await read(file)), pattern, `${file} must still open Chat`);
  }
});

test('a legacy jobId entry opens the merged conversation scrolled to that job', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  // The jobId is NOT a filter — it selects a scroll position in the merged
  // list, at that job's FIRST chronological message.
  assert.match(chat, /const scrollTargetIndex = useMemo\(\(\) => \{/);
  assert.match(chat, /if \(!routeJobId\) return -1;/);
  assert.match(
    chat,
    /items\.findIndex\(\s*\(item\) => item\.kind === 'message' && item\.message\.job_id === routeJobId\s*\)/
  );
  // F4: the list is inverted (newest first), so the chronological index is
  // mirrored — the jump still lands on that job's first message, once.
  assert.match(chat, /inverted\s+data=\{invertedItems\}/);
  assert.match(chat, /const invertedItems = useMemo\(\(\) => \[\.\.\.items\]\.reverse\(\), \[items\]\);/);
  assert.match(chat, /scrollToIndex\(\{\s*index: items\.length - 1 - scrollTargetIndex,/);
  // findIndex returns -1 when that job has nothing in it yet; the screen must
  // fall back to the newest message rather than scrolling to index -1 — an
  // inverted list opens there, so -1 simply does not jump.
  assert.match(chat, /if \(jumpedRef\.current \|\| scrollTargetIndex < 0\) return;\s*jumpedRef\.current = true;/);
  assert.match(chat, /onScrollToIndexFailed/);
  // And nothing may undo the jump: no stick-to-bottom path exists at all.
  assert.doesNotMatch(chat, /scrollToEnd|onContentSizeChange/);
  assert.match(chat, /maintainVisibleContentPosition=\{\{ minIndexForVisible: 1, autoscrollToTopThreshold: 80 \}\}/);
});

// ---------------------------------------------------------------------------
// C/D/E — everything downstream reads the resolver, not the route
// ---------------------------------------------------------------------------

test('the messaging lock is asked about the resolved target and nowhere else', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  assert.equal(
    (chat.match(/fetchMessagingUnlocked\(/g) ?? []).length,
    1,
    'there must be exactly one messaging-lock read'
  );
  assert.match(
    chat,
    /sendJobId \? \{ jobId: sendJobId \} : \{ directThreadId: sendDirectThreadId as string \}/
  );
  // Unknown stays locked: no target yet means no answer, and the state starts
  // null with the composer hidden until it is true.
  assert.match(chat, /if \(!sendJobId && !sendDirectThreadId\) return;/);
  assert.match(chat, /useState<boolean \| null>\(null\)/);
  // No second unlock concept anywhere on this surface.
  assert.doesNotMatch(chat, /deriveJobLifecycle/);
});

test('attachments follow the resolved target, so the pair thread has none', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  // Chat media is stored under {jobId}/{userId}/… — the pair thread has no job
  // id to key a path on, so both controls go rather than fail on upload.
  assert.match(chat, /allowAttachments=\{!!sendJobId\}/);
  assert.doesNotMatch(chat, /allowAttachments=\{!!jobId\}/);
  // And the guards behind them agree with the control, on the same value.
  assert.match(chat, /if \(!user \|\| !clip \|\| !sendTarget \|\| !sendJobId\) return;/);
  assert.match(chat, /if \(!user \|\| !sendTarget \|\| !sendJobId\) return;/);
  assert.match(chat, /uploadChatAudio\(\s*sendJobId,/);
  assert.match(chat, /uploadChatPhoto\(\s*sendJobId,/);
});

// RETIRED 2026-08-23 — 'the en-route quick replies only appear on a live job'.
// The row it fenced (components/QuickReplies.tsx) and the template sets behind
// it (WORKER_CHAT_TEMPLATES / CUSTOMER_CHAT_TEMPLATES / chatTemplatesForMode)
// were deleted with the composer rebuild, so the test asserted the shape of
// something that no longer exists. The half worth keeping — that the row does
// not come back — moved to messagingLock's free-form-entry-point test, which
// already owns "what may render in this column".

test('every send goes to the resolved target, and only there', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));
  // FOUR send paths (text, photo, voice, document), one target between them.
  // It was four until 2026-08-23 when the quick-reply send went with its row,
  // three until 2026-08-25 when DOCUMENTS shipped. The COUNT is bookkeeping;
  // the property is that no send path names anything but the resolved target,
  // so a conversation can never show one job while a message sent from it
  // lands in another. Document is the one path whose target may be a pair
  // thread — that is about which BUCKET authorises it, not about which target
  // it sends to, and it reads the same `sendTarget` as the other three.
  assert.equal(
    (chat.match(/target: sendTarget,/g) ?? []).length,
    4,
    'all four send paths must use the resolved target'
  );
  // Read state is cleared across the WHOLE conversation, or the inbox row it
  // folds into would stay lit with nothing left to open.
  assert.match(chat, /for \(const target of targets\) \{/);
  assert.match(chat, /markConversationRead\(target, uid\)/);
});
