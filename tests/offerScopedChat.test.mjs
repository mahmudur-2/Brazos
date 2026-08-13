import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 7 guards — offer-scoped pre-hire chat.
 *
 * What must stay true:
 *   1. The pair thread exists FROM the offer (phase52 trigger + backfill),
 *      is internal plumbing (no client EXECUTE), and can never fail the
 *      offer insert itself.
 *   2. Pre-hire chat is the PAIR thread, never the job thread — the job
 *      thread's client+assigned-worker policies are untouched, and no
 *      client code inserts job-thread messages for a mere bidder.
 *   3. Quick replies are mode-specific through ModeContext, with one source
 *      of the template sets.
 *   4. Chat is registered wherever JobDetail is (the SubmitBid rule), so
 *      the own-bid entry can never hit an unregistered route.
 *   5. Nothing client-side creates direct_threads — the trigger owns that.
 *
 * SUPERSEDED BY phase66: this phase also shipped pre-hire chat ENTRY POINTS
 * ("Message <worker> first" on Bid Detail, "Message the poster" on the worker
 * job detail). Free-form messaging is now locked until the job is confirmed,
 * so those entries are gone and the guard below asserts their absence. The
 * thread itself, the trigger, the backfill and the negotiation cards inside
 * the thread are all unchanged — only free-form content is gated.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

test('phase52: trigger-backed thread creation, sealed and non-fatal', async () => {
  const sql = await read('supabase/phase52_offer_scoped_chat.sql');
  assert.match(sql, /create trigger job_offers_thread_autocreate\s+after insert on public\.job_offers/);
  assert.match(sql, /drop trigger if exists job_offers_thread_autocreate/);
  // The trigger body must swallow its own failure — an offer insert can
  // never be lost to thread plumbing.
  assert.match(sql, /exception when others then[\s\S]*raise warning/);
  // Internal plumbing: no client EXECUTE anywhere on it.
  assert.match(sql, /revoke all on function public\.ensure_thread_for_offer\(\) from public, anon, authenticated/);
  // Backfill for pairs whose offers predate the trigger.
  assert.match(sql, /status = 'pending'/);
  // Sentinel carries the group (a trigger has no PostgREST shape).
  assert.match(sql, /grant execute on function public\.offer_scoped_chat_enabled\(\) to authenticated/);
  // And the job-thread policies are NOT touched here.
  assert.ok(!/create policy|drop policy/.test(sql), 'phase52 must not rewrite message policies');
});

test('quick replies are mode-specific through ModeContext', async () => {
  const messages = await read('lib/messages.ts');
  assert.match(messages, /WORKER_CHAT_TEMPLATES/);
  assert.match(messages, /CUSTOMER_CHAT_TEMPLATES/);
  assert.match(messages, /chatTemplatesForMode/);

  const quickReplies = await read('components/QuickReplies.tsx');
  assert.match(quickReplies, /useMode\(\)/, 'perspective must come from ModeContext');
  assert.match(quickReplies, /chatTemplatesForMode\(mode\)/);
  assert.ok(
    !quickReplies.includes('CHAT_TEMPLATES'),
    'QuickReplies must use the mode-aware source, not a fixed list'
  );
});

test('Chat rides along wherever JobDetail is registered', async () => {
  const nav = await read('lib/navigation.ts');
  // Both param lists that mount JobDetail outside MyJobs now carry Chat.
  const workerHome = nav.slice(nav.indexOf('WorkerHomeStackParamList = {'), nav.indexOf('WorkerHomeStackNavigation'));
  const mapStack = nav.slice(nav.indexOf('MapStackParamList = {'), nav.indexOf('MapStackNavigation'));
  assert.match(workerHome, /Chat: ChatTarget/);
  assert.match(mapStack, /Chat: ChatTarget/);

  const workerRoot = await read('navigation/WorkerRoot.tsx');
  assert.match(workerRoot, /name="Chat" component={ChatScreen}/);
  const shared = await read('navigation/sharedStacks.tsx');
  assert.match(shared, /<MapStack\.Screen name="Chat" component={ChatScreen} \/>/);
});

test('nothing client-side creates a direct thread', async () => {
  const conversations = await read('lib/conversations.ts');
  assert.match(conversations, /fetchDirectThreadWith/);
  // The lookup is a plain select; no insert/rpc-create of threads exists in
  // client code anywhere.
  for (const file of [
    'lib/conversations.ts',
    'lib/messages.ts',
    'screens/BidDetailScreen.tsx',
    'screens/JobDetailScreen.tsx',
    'screens/ChatScreen.tsx',
  ]) {
    const src = await read(file);
    assert.ok(
      !/from\('direct_threads'\)\s*\.\s*insert/.test(src) &&
        !/rpc\(['"]ensure_direct_thread/.test(src),
      `${file} must not create direct threads from the client`
    );
  }
});

test('phase66 supersedes the pre-hire chat ENTRIES, not the thread itself', async () => {
  // phase52's mechanism is untouched: the pair's thread still exists from the
  // first offer, so the negotiation cards still have somewhere to live and the
  // conversation is already there the moment the job is confirmed. What went
  // away is the free-form ENTRY POINTS before that moment.
  const phase52 = await read('supabase/phase52_offer_scoped_chat.sql');
  assert.match(phase52, /create trigger job_offers_thread_autocreate/);

  const bidDetail = await read('screens/BidDetailScreen.tsx');
  const jobDetail = await read('screens/JobDetailScreen.tsx');

  assert.doesNotMatch(bidDetail, /Message \$\{workerName\} first/);
  assert.doesNotMatch(jobDetail, /Message \$\{poster/);
  // The lookups that existed only to open those composers are gone with them.
  for (const [name, src] of [
    ['BidDetailScreen', bidDetail],
    ['JobDetailScreen', jobDetail],
  ]) {
    assert.doesNotMatch(
      src,
      /fetchDirectThreadWith/,
      `${name} must not open a pre-confirmation composer`
    );
  }
});

test('the inbox and chat keep their unread contract', async () => {
  const chat = await read('screens/ChatScreen.tsx');
  // Hardening A8 reshaped the call (narrowed uid + observable failure): the
  // contract is focus/blur still mark the thread read and a failed write is
  // logged, never silently dropped.
  assert.match(chat, /markConversationRead\(target, uid\)/);
  assert.match(chat, /mark-read failed/);
  const inbox = await read('screens/MessagesInboxScreen.tsx');
  assert.match(inbox, /my_read_at/);
});
