import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, read } from './loadModule.mjs';

/**
 * C7 (A4-M2) — a failed block-list read never shows blocked people again, and
 * a chat can tell "the read failed" from "blocked" and from "not blocked" (2d).
 */

function blocksClient(answer) {
  const client = {
    reads: 0,
    from: () => {
      const b = {
        select: () => b,
        or: () => b,
        then: (ok, bad) => Promise.resolve().then(() => ((client.reads += 1), answer())).then(ok, bad),
      };
      return b;
    },
  };
  return client;
}
const load = (client) => loadModule('lib/moderation.ts', { './supabase': { supabase: client } });

test('2d: fetchRelation tells a failed read from blocked and from not blocked', async () => {
  let answer = () => ({ data: null, error: { message: 'network down' } });
  const moderation = await load(blocksClient(() => answer()));
  const failed = await moderation.fetchRelation('me', 'them');
  assert.equal(moderation.relationStatus(failed), 'unknown', 'a failed read is not "not blocked"');
  answer = () => ({ data: [{ blocker_id: 'them', blocked_id: 'me' }], error: null });
  assert.equal(moderation.relationStatus(await moderation.fetchRelation('me', 'them')), 'blocked');
  answer = () => ({ data: [], error: null });
  const clear = await moderation.fetchRelation('me', 'them');
  assert.equal(moderation.relationStatus(clear), 'clear');
  assert.deepEqual(moderation.EMPTY_RELATION, { blocking: false, blockedBy: false, readFailed: false });
});

test('C7: a failed block-list read keeps the hidden people hidden, and the next ensure reads again', async () => {
  let fail = false;
  const client = blocksClient(() => (fail ? { data: null, error: { message: 'down' } } : { data: [{ blocker_id: 'me', blocked_id: 'x' }], error: null }));
  const moderation = await load(client);
  await moderation.loadHiddenUsers('me');
  assert.deepEqual([...moderation.hiddenUserIds()], ['x']);
  fail = true;
  await moderation.loadHiddenUsers('me');
  assert.deepEqual([...moderation.hiddenUserIds()], ['x'], 'a failed read is not "nobody is blocked"');
  const before = client.reads;
  fail = false;
  await moderation.ensureHiddenUsers('me');
  assert.equal(client.reads, before + 1, 'a failed load is not shared for the rest of the session');
});

test('C7: fetchMyModerationLists returns its error, and the inbox keeps the last good lists or shows no rows', async () => {
  const moderation = await load(blocksClient(() => ({ data: null, error: { message: 'down' } })));
  const lists = await moderation.fetchMyModerationLists('me');
  assert.deepEqual(lists.error, { message: 'down' });
  const good = { blocking: new Set(['x']), blockedBy: new Set() };
  assert.equal(moderation.moderationAfterRead(good, lists), good, 'a failed read keeps the last good lists');
  assert.equal(moderation.moderationAfterRead(null, lists), null, 'with none yet, nothing is known');
  const fresh = moderation.moderationAfterRead(good, { blocking: new Set(), blockedBy: new Set(['y']), error: null });
  assert.deepEqual([...fresh.blockedBy], ['y']);

  const hook = read('hooks/useConversations.ts');
  assert.match(hook, /const known = moderationAfterRead\(kept, moderationLists\);/);
  assert.match(hook, /if \(known\) \{\s*setModeration\(known\);\s*\} else \{\s*setConversations\(\[\]\);/);
});


test('C7 (A4 wiring A2): a chat whose block read failed shows its load-error state with a retry and no composer', () => {
  const chat = read('screens/ChatScreen.tsx').replace(/\r\n/g, '\n');
  assert.match(chat, /const relationUnknown = relationStatus\(relation\) === 'unknown';/);
  // The shared error state in place of the messages; its retry reads the relation again.
  assert.match(
    chat,
    /\) : relationUnknown \? \(\s*<ScreenStateView\s*state=\{\{ kind: 'error', title: loadErrorTitle\('this conversation'\), onRetry: \(\) => void rereadRelation\(\) \}\}\s*\/>\s*\) : \(\s*<FlatList/
  );
  // Neither the composer nor the blocked notice: an unknown answer says nothing about the person.
  assert.match(chat, /\{relationUnknown \? null : isBlocked \? \(\s*<View style=\{styles\.blockedNotice\}>/);
});
