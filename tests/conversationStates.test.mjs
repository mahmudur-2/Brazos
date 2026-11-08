import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// lib/conversationStates.ts and lib/conversations.ts import `./supabase`, and
// Node's ESM resolver will not take an extensionless relative specifier, so
// neither can be imported here at all. That is exactly why every RULE lives in
// lib/conversationVisibility.ts, which imports nothing: the arithmetic is RUN
// below, and only the client calls are read as source.
const visibility = await import('../lib/conversationVisibility.ts');
const inbox = await import('../lib/inboxFilters.ts');
const conversations = visibility;
const states = visibility;

const MIGRATION = 'supabase/archive/phases/phase77_conversation_features.sql';
const INBOX = 'screens/MessagesInboxScreen.tsx';
const CHAT = 'screens/ChatScreen.tsx';
const HIDDEN = 'screens/HiddenChatsScreen.tsx';

// ===========================================================================
// RUN W1 — the seven conversation-state features, wired.
//
// What these tests exist to catch, in the order the run's own failure modes
// rank:
//
//   1. A FLIPPED FLAG WITH A DEAD HANDLER. Every one of the seven gates an
//      affordance, and an affordance whose onPress is `() => {}` is worse
//      than no affordance — it teaches a user the feature exists and then
//      breaks their trust. The census below reads the screen source.
//   2. A FEATURE THAT WORKS ON ONE THREAD KIND. A job thread and a direct
//      thread must reach the SAME action; anything else ships two apps. Every
//      action goes through the *ForAll helpers for exactly that reason.
//   3. TWO IMPLEMENTATIONS OF THE WATERMARK. The inbox and the chat timeline
//      both read `cleared_before`, and a second copy of the `<=` is the P3-31
//      bug this run was written to avoid.
//   4. A PARAMETER NAME GUESSED RATHER THAN READ. Every RPC call is checked
//      against the migration file's own text, not against this prompt's.
// ===========================================================================

// ---------------------------------------------------------------------------
// C1 — the visibility rule.
// ---------------------------------------------------------------------------

test('[executed] the clear watermark covers the instant AT it, not merely before it', () => {
  const state = { cleared_before: '2026-08-24T12:00:00.000Z', deleted: false };

  // AT the watermark is CLEARED. `now()` is taken server-side at or after the
  // last message it is meant to clear, so a `<` would leave that message on
  // screen — the one message the user was looking at when they tapped Clear.
  assert.equal(conversations.clearedBy('2026-08-24T12:00:00.000Z', state), true);
  assert.equal(conversations.clearedBy('2026-08-24T11:59:59.999Z', state), true);
  assert.equal(conversations.clearedBy('2026-08-24T12:00:00.001Z', state), false);
});

test('[executed] a missing watermark hides nothing at all', () => {
  const instant = '2020-01-01T00:00:00.000Z';
  assert.equal(conversations.clearedBy(instant, null), false);
  assert.equal(conversations.clearedBy(instant, undefined), false);
  assert.equal(conversations.clearedBy(instant, {}), false);
  assert.equal(conversations.clearedBy(instant, { cleared_before: null }), false);

  // And a conversation nobody cleared keeps every message.
  const messages = [{ created_at: instant }, { created_at: '2026-01-01T00:00:00.000Z' }];
  assert.deepEqual(conversations.visibleMessages(messages, () => null), messages);
  assert.deepEqual(conversations.visibleMessages(messages, () => undefined), messages);
});

test('[executed] a deleted conversation REOPENS by derivation when a newer message lands', () => {
  const state = { cleared_before: '2026-08-24T12:00:00.000Z', deleted: true };

  // Quiet since the delete: out of the inbox.
  assert.equal(
    conversations.conversationHiddenByDelete('2026-08-24T12:00:00.000Z', state),
    true
  );
  // One message newer, and the SAME state row — nothing was un-set — puts it
  // back. This is the whole reason `deleted` is never written false.
  assert.equal(
    conversations.conversationHiddenByDelete('2026-08-24T12:00:00.001Z', state),
    false
  );
  // Cleared but not deleted stays in the inbox however old its last message.
  assert.equal(
    conversations.conversationHiddenByDelete('2020-01-01T00:00:00.000Z', {
      cleared_before: '2026-08-24T12:00:00.000Z',
      deleted: false,
    }),
    false
  );
});

test('[executed] the timeline drops exactly the cleared messages and keeps the rest', () => {
  const messages = [
    { id: 'old', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'edge', created_at: '2026-08-24T12:00:00.000Z' },
    { id: 'new', created_at: '2026-08-25T00:00:00.000Z' },
  ];
  const kept = conversations.visibleMessages(messages, () => ({
    cleared_before: '2026-08-24T12:00:00.000Z',
  }));
  assert.deepEqual(kept.map((m) => m.id), ['new']);

  // THE STATE IS RESOLVED PER MESSAGE, because one conversation is several
  // threads folded into one timeline. Clearing the pair's direct thread must
  // not empty the job thread interleaved with it.
  const mixed = [
    { id: 'job-old', job_id: 'j', created_at: '2026-08-01T00:00:00.000Z' },
    { id: 'direct-old', job_id: null, created_at: '2026-08-02T00:00:00.000Z' },
    { id: 'job-new', job_id: 'j', created_at: '2026-08-30T00:00:00.000Z' },
  ];
  const survivors = conversations.visibleMessages(mixed, (m) =>
    m.job_id ? null : { cleared_before: '2026-08-24T12:00:00.000Z' }
  );
  assert.deepEqual(survivors.map((m) => m.id), ['job-old', 'job-new']);
});

test('[static] the watermark comparison is written ONCE, and both surfaces import it', () => {
  // P3-31. The inbox and the chat timeline must agree to the character, so
  // there is one `<=` and two readings of it. A second literal comparison
  // against cleared_before anywhere else is the defect.
  const owner = stripComments(read('lib/conversationVisibility.ts'));
  const occurrences = [...owner.matchAll(/instant <= mark/g)];
  assert.equal(occurrences.length, 1, 'clearedBy() is the only comparison');
  // And lib/conversations.ts is where both surfaces import it from (D7).
  assert.match(
    stripComments(read('lib/conversations.ts')),
    /export \{\s*clearedBy,\s*conversationHiddenByDelete,\s*visibleMessages,[\s\S]*?\} from '\.\/conversationVisibility';/
  );

  for (const file of [
    'lib/conversationStates.ts',
    'lib/conversations.ts',
    INBOX,
    CHAT,
    HIDDEN,
  ]) {
    const source = stripComments(read(file));
    assert.equal(
      /cleared_before\s*(?:<=|<|>|>=)/.test(source),
      false,
      `${file} must go through the helper, never compare cleared_before itself`
    );
  }

  // Both surfaces read the rule, each through the wrapper that fits it: the
  // chat filters the timeline, the inbox drops the row. The inbox reaches the
  // delete wrapper through foldConversationStates, which is the ONE place a
  // per-thread state becomes a per-person one.
  assert.match(stripComments(read(CHAT)), /visibleMessages\(/);
  assert.match(stripComments(read(INBOX)), /foldConversationStates\(/);
  assert.match(owner, /deleted: seen\.every\(\(t\) => conversationHiddenByDelete\(/);
  assert.match(stripComments(read(INBOX)), /!row\.deleted/);
});

test('[executed] a conversation folds its threads with ALL, never ANY', () => {
  const byKey = {
    'job:a': {
      job_id: 'a',
      direct_thread_id: null,
      hidden: true,
      archived: true,
      cleared_before: null,
      deleted: false,
    },
    'direct:d': {
      job_id: null,
      direct_thread_id: 'd',
      hidden: false,
      archived: false,
      cleared_before: null,
      deleted: false,
    },
  };
  const threads = [
    { key: 'job:a', lastMessageAt: '2026-08-24T00:00:00.000Z' },
    { key: 'direct:d', lastMessageAt: '2026-08-24T00:00:00.000Z' },
  ];

  // One archived thread must NOT take a person's row out of the inbox while
  // their other thread is still live.
  const mixed = states.foldConversationStates(threads, byKey);
  assert.equal(mixed.archived, false);
  assert.equal(mixed.hidden, false);

  // Both archived — which is exactly what the action produces — and it folds.
  const both = states.foldConversationStates(threads, {
    ...byKey,
    'direct:d': { ...byKey['direct:d'], hidden: true, archived: true },
  });
  assert.equal(both.archived, true);
  assert.equal(both.hidden, true);

  // A thread with NO state row behaves exactly as today (C2's contract).
  assert.deepEqual(states.foldConversationStates(threads, {}), {
    hidden: false,
    archived: false,
    cleared: false,
    deleted: false,
  });

  // `[].every()` is true, so a conversation with no threads has to be
  // special-cased or every empty row would read as archived AND deleted.
  assert.deepEqual(states.foldConversationStates([], byKey), {
    hidden: false,
    archived: false,
    cleared: false,
    deleted: false,
  });
});

// ---------------------------------------------------------------------------
// THE RPC CONTRACT — read off the migration, never guessed.
// ---------------------------------------------------------------------------

test('[static] every RPC this run calls uses the migration\'s own parameter names', () => {
  const sql = read(MIGRATION);
  const lib = stripComments(read('lib/conversationStates.ts'));

  // set_conversation_state(p_job_id, p_direct_thread_id, p_hidden, p_archived,
  //                        p_clear, p_delete)
  const declared = sql
    .slice(sql.indexOf('create or replace function public.set_conversation_state('))
    .slice(0, 400);
  for (const param of [
    'p_job_id',
    'p_direct_thread_id',
    'p_hidden',
    'p_archived',
    'p_clear',
    'p_delete',
  ]) {
    assert.ok(declared.includes(param), `the migration declares ${param}`);
    assert.ok(lib.includes(`${param}:`), `the client passes ${param}`);
  }

  // set_block(p_blocked, p_expires_at) — the timed variant only.
  assert.match(sql, /create or replace function public\.set_block\(\s*p_blocked uuid,\s*p_expires_at timestamptz default null\s*\)/);
  assert.match(lib, /rpc\('set_block', \{\s*p_blocked: otherId,\s*p_expires_at: expiresAt,\s*\}\)/);

  // set_direct_thread_read_at(p_thread_id, p_read_at) — NULL means never read.
  assert.match(sql, /create or replace function public\.set_direct_thread_read_at\(\s*p_thread_id uuid,\s*p_read_at timestamptz\s*\)/);
  assert.match(lib, /rpc\('set_direct_thread_read_at', \{\s*p_thread_id: threadId,\s*p_read_at: readAt,\s*\}\)/);
});

test('[static] conversation_states is never written except through its RPC', () => {
  // The table keys on two PARTIAL unique indexes and PostgREST's onConflict
  // cannot name a partial index's predicate — the phase36 message_reads
  // lesson. The migration revokes every write grant to match, so an .upsert()
  // here would fail at runtime and never at build time.
  const lib = stripComments(read('lib/conversationStates.ts'));
  const table = lib.slice(lib.indexOf("from('conversation_states')"));
  assert.match(table.slice(0, 200), /\.select\(/);
  assert.equal(
    /from\('conversation_states'\)[\s\S]{0,120}\.(upsert|insert|update|delete)\(/.test(lib),
    false,
    'conversation_states is SELECT-only from the client'
  );

  const sql = read(MIGRATION);
  assert.match(sql, /revoke all on table public\.conversation_states from authenticated;/);
  assert.match(sql, /grant select on table public\.conversation_states to authenticated;/);
});

test('[static] nothing in this run ever un-sets deleted', () => {
  // The thread reopens BY DERIVATION. A client that wrote deleted = false
  // would be inventing an un-delete the migration deliberately does not have.
  for (const file of ['lib/conversationStates.ts', 'lib/conversations.ts', INBOX, CHAT]) {
    const source = stripComments(read(file));
    assert.equal(
      /deleted:\s*false/.test(source),
      false,
      `${file} must not write deleted = false`
    );
  }
});

// ---------------------------------------------------------------------------
// D8 — mark as unread, both kinds.
// ---------------------------------------------------------------------------

test('[static] mark-as-unread takes the route each thread kind actually allows', () => {
  const lib = stripComments(read('lib/conversationStates.ts'));

  // A DIRECT thread has no INSERT/UPDATE policy at all, so the RPC is the only
  // writer; NULL is how it says "never read".
  assert.match(lib, /setDirectThreadReadAt\(target\.directThreadId as string, null\)/);

  // A JOB thread needs nothing new: message_reads_update_own constrains the
  // ROW and not the VALUE, so the existing upsert may write an earlier
  // watermark. The epoch is "before every message that could exist".
  assert.match(lib, /from\('message_reads'\)\.upsert\(/);
  assert.match(lib, /last_read_at: FULLY_UNREAD_AT/);
  assert.match(lib, /onConflict: 'user_id,job_id'/);
  assert.equal(states.FULLY_UNREAD_AT, '1970-01-01T00:00:00.000Z');
  // It must sort BEFORE any real message, on the string comparison the unread
  // derivation uses.
  assert.ok(states.FULLY_UNREAD_AT < '2020-01-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------
// D1 — the timed block.
// ---------------------------------------------------------------------------

test('[executed] a timed block offers three durations, as absolute instants', () => {
  assert.deepEqual(
    states.BLOCK_DURATIONS.map((d) => d.label),
    ['1 hour', '24 hours', '7 days']
  );
  const now = Date.parse('2026-08-24T00:00:00.000Z');
  assert.deepEqual(
    states.BLOCK_DURATIONS.map((d) => states.blockExpiryFrom(now, d.ms)),
    [
      '2026-08-24T01:00:00.000Z',
      '2026-08-25T00:00:00.000Z',
      '2026-08-31T00:00:00.000Z',
    ]
  );
  // Every one of them is in the future, which is what set_block requires.
  for (const d of states.BLOCK_DURATIONS) {
    assert.ok(Date.parse(states.blockExpiryFrom(now, d.ms)) > now);
  }
});

test('[static] the PERMANENT block and unblock stay exactly where they were', () => {
  // D1: this run adds a timed variant beside them. It does not move, gate or
  // re-route the block that already ships.
  const moderation = stripComments(read('lib/moderation.ts'));
  assert.match(moderation, /export async function blockUser\(userId: string, otherId: string\) \{/);
  assert.match(moderation, /from\('blocks'\)\s*\.insert\(\{ blocker_id: userId, blocked_id: otherId \}\)/);
  assert.match(moderation, /export async function unblockUser\(userId: string, otherId: string\) \{/);
  // And the timed one is NOT in that file — it needs the definer path.
  assert.equal(/set_block/.test(moderation), false);
});

// ---------------------------------------------------------------------------
// C3 — the six handlers, and both thread kinds.
// ---------------------------------------------------------------------------

test('[static] every flagged More row has a real handler, and none is a no-op', () => {
  const screen = stripComments(read(INBOX));

  // THE FAILURE THIS RUN EXISTS TO PREVENT. Before W1 all six rows read
  // `onPress: () => {}` — a flipped flag would have produced a menu that
  // teaches a user the feature exists and then does nothing.
  assert.equal(
    /onPress: \(\) => \{\}/.test(screen),
    false,
    'a flagged row with an empty handler is a dead control'
  );

  // 2026-09-26 (the refresh, audit M-11): "Block…" opens the one chooser,
  // whose first row runs the permanent block.
  // F20: the block row's words are lib/chatMenus.ts's personSafetyItems (shared with
  // the chat header); its handler is still this screen's, wired through onBlock.
  assert.ok(stripComments(read('lib/chatMenus.ts')).includes("key: 'block'"), 'the person menu carries the block row');
  assert.match(screen, /const person = personSafetyItems\(\{/);
  assert.match(screen, /onBlock: \(\) => \{\s*setMenuUserId\(null\);\s*setBlockDurationUserId\(target\.userId\);/, 'block must call its real handler');
  const wired = {
    'block-permanent': /void toggleBlock\(target\)/,
    'mark-unread': /onPress: \(\) => markUnread\(target\)/,
    'clear-chat': /applyConversationState\(target, \{ clear: true \}/,
    hide: /\{ hidden: !target\.hidden \}/,
    archive: /\{ archived: !target\.archived \}/,
    'delete-chat': /applyConversationState\(target, \{ delete: true \}/,
  };
  for (const [key, handler] of Object.entries(wired)) {
    assert.ok(screen.includes(`key: '${key}'`), `the sheet or its choosers must carry the ${key} row`);
    assert.match(screen, handler, `${key} must call its real handler`);
  }

  // Every timed-block duration reaches set_block, and the permanent block is
  // still the first sheet's `blockUser`, untouched.
  assert.match(screen, /blockExpiryFrom\(Date\.now\(\), duration\.ms\)/);
  assert.match(screen, /setBlockUntil\(\s*target\.userId,/);
  assert.match(screen, /await blockUser\(user\.id, target\.userId\)/);
});

test('[static] every conversation action reaches BOTH thread kinds', () => {
  const screen = stripComments(read(INBOX));

  // The row is a PERSON, and a person's conversation is made of job threads
  // and/or a pair thread. Acting on `target.jobId` would work on a pair who
  // share a job and silently no-op on a pair who never have — the half-feature
  // this run forbids. Every action takes the whole thread list instead.
  assert.match(screen, /targets: person\.threads\.map\(conversationTarget\)/);
  assert.match(screen, /setConversationStateForAll\(target\.targets, patch\)/);
  assert.match(screen, /markConversationUnreadForAll\(\s*target\.targets,/);

  // conversationTarget() is what makes a job thread `{ jobId }` and a direct
  // thread `{ directThreadId }`, which is exactly the XOR the RPC takes.
  const lib = stripComments(read('lib/conversations.ts'));
  assert.match(
    lib,
    /return c\.job_id\s*\?\s*\{ jobId: c\.job_id \}\s*:\s*\{ directThreadId: c\.direct_thread_id as string \};/
  );

  // No action may be reachable only through a job.
  assert.equal(
    /setConversationState\(\s*\{ jobId/.test(screen),
    false,
    'no inbox action may target a single job thread'
  );
});

test('[executed] the archived pill filters, and archived rows leave every other pill', () => {
  const rows = [
    { key: 'a', unread: true, awaitingRequest: false, archived: false },
    { key: 'b', unread: false, awaitingRequest: true, archived: false },
    { key: 'c', unread: true, awaitingRequest: true, archived: true },
    { key: 'd', unread: false, awaitingRequest: false, archived: true },
  ];

  assert.deepEqual(inbox.filterRows(rows, 'all').map((r) => r.key), ['a', 'b']);
  assert.deepEqual(inbox.filterRows(rows, 'archived').map((r) => r.key), ['c', 'd']);
  // An archived row that vanished from All and resurfaced under Unread would
  // have been filed nowhere.
  assert.deepEqual(inbox.filterRows(rows, 'unread').map((r) => r.key), ['a']);
  assert.deepEqual(inbox.filterRows(rows, 'requests').map((r) => r.key), ['b']);
  // Support is the one pill with genuinely nothing behind it.
  assert.deepEqual(inbox.filterRows(rows, 'support'), []);

  // Still five pills: HIDDEN_CHATS is deliberately NOT a sixth, because a pill
  // advertises that hidden conversations exist whether or not any do.
  assert.deepEqual(
    inbox.INBOX_FILTERS.map((p) => p.key),
    ['all', 'unread', 'archived', 'requests', 'support']
  );
  assert.equal(/hidden/i.test(JSON.stringify(inbox.INBOX_FILTERS)), false);
});

test('[static] the hidden-chats entry is a foot row, gated on the device being able to ask', () => {
  const screen = stripComments(read(INBOX));

  assert.match(
    screen,
    /const showHiddenChatsRow =\s*HIDDEN_CHATS && deviceAuthReady && hiddenCount > 0 && filter === 'all';/
  );
  assert.match(screen, /ListFooterComponent=\{\s*showHiddenChatsRow \?/);
  assert.match(screen, /accessibilityLabel="Hidden Chats"/);

  // A failed or cancelled prompt does NOTHING and says nothing — an error
  // would confirm to whoever is holding the phone that there is something here.
  assert.match(screen, /if \(!result\.success\) return;/);
  const opener = screen.slice(screen.indexOf('async function openHiddenChats'));
  const body = opener.slice(0, opener.indexOf("navigation.navigate('HiddenChats')"));
  assert.equal(/alertAsync/.test(body), false, 'a refused unlock must not speak');

  // And the list itself exists, in the Messages stack, reusing ConversationRow.
  const hidden = stripComments(read(HIDDEN));
  assert.match(hidden, /import \{ ConversationRow \}/);
  assert.match(hidden, /groupThreadsByPerson\(conversations,/);
  assert.match(hidden, /\.filter\(\(row\) => row\.hidden && !row\.deleted\)/);
  assert.match(
    stripComments(read('navigation/sharedStacks.tsx')),
    /<MessagesStack\.Screen name="HiddenChats" component=\{HiddenChatsScreen\} \/>/
  );
});

test('[static] the chat timeline is the CLEARED timeline, and the send target is not', () => {
  const chat = stripComments(read(CHAT));

  // D7's chat reading, from the same import the inbox uses.
  assert.match(chat, /visibleMessages\(messages, \(message\) => stateByKey\[threadKeyOf\(message\)\]\)/);
  assert.match(chat, /for \(const message of visibleTimeline\)/);

  // WHAT MUST NOT BE FILTERED. activityByJob feeds the resolver that decides
  // where the NEXT message is sent; filtering it would let clearing your own
  // copy of a thread silently reroute your sends into another job.
  assert.match(chat, /const activityByJob = useMemo\(\(\) => \{[\s\S]*?for \(const message of messages\)/);
  assert.match(chat, /useThreadOffers\(messages\)/);
});

// ---------------------------------------------------------------------------
// C5 — the flip, and what it is allowed to mean.
// ---------------------------------------------------------------------------

test('[static] each live flag gates a real affordance, in a real file', () => {
  // THE ACCEPTANCE GATE, stated as a test. A flipped flag whose guarded row
  // does nothing is worse than an unflipped one, so each flag is followed from
  // its constant to the file that imports it to the call that runs.
  //
  // Six on 2026-08-24 (RUN W1) and LIVE_LOCATION on 2026-08-25, whose guard
  // site is the COMPOSER rather than the inbox, because the row it gates lives
  // in the [ + ] menu. (Lean D3a removed READ_TICKS and DOCUMENTS with their
  // features.)
  const flags = read('lib/featureFlags.ts');
  const screen = stripComments(read(INBOX));
  const chat = stripComments(read(CHAT));
  const composer = stripComments(read('components/ChatComposer.tsx'));

  const LIVE = {
    TIMED_BLOCK: [screen, /setBlockUntil\(/],
    MARK_UNREAD: [screen, /markConversationUnreadForAll\(/],
    CLEAR_CHAT: [screen, /\{ clear: true \}/],
    HIDDEN_CHATS: [screen, /LocalAuthentication\.authenticateAsync\(/],
    ARCHIVE: [screen, /archived: !target\.archived/],
    DELETE_CHAT: [screen, /\{ delete: true \}/],
    LIVE_LOCATION: [composer, /onPress: onShareLiveLocation,/],
  };

  for (const [name, [source, call]] of Object.entries(LIVE)) {
    assert.match(
      flags,
      new RegExp(`export const ${name} = true as boolean;`),
      `${name} must be live`
    );
    assert.match(source, new RegExp(`\\b${name}\\b`), `${name} must be imported at its guard site`);
    assert.match(source, call, `${name} must gate a call that actually does something`);
  }

  // The handler behind each row has to reach something too, or the flag would
  // gate a prop nobody passes — the dead-row failure one level up.
  assert.match(chat, /onShareLiveLocation=\{/);
  assert.match(chat, /liveLocation\.start\(durationMs\)/);
});

test('[static] the money vocabulary is untouched by this run', () => {
  // Nothing here is about payment, and nothing here may drift into it. The
  // repo's word is "held in protection"; "escrow" is a claim BRAZOS does not
  // make about itself anywhere outside the terms that disclaim it.
  for (const file of [
    'lib/conversationStates.ts',
    'lib/conversationVisibility.ts',
    'lib/conversations.ts',
    'lib/inboxFilters.ts',
    INBOX,
    CHAT,
    HIDDEN,
  ]) {
    assert.equal(/escrow/i.test(read(file)), false, `${file} must not say escrow`);
  }
});
