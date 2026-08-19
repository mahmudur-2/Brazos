import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Phase 67 guards — in-app account deletion (App Store Guideline 5.1.1(v)).
 *
 * What must stay true:
 *   1. formatBlockerList is EXECUTED, not read: the empty case means
 *      "deletion permitted" and produces no headline, and the populated case
 *      groups, keys and routes every row.
 *   2. A blocker kind with no route in this stack stays non-tappable. The
 *      deletion screen lives in ProfileStack, which registers no job-detail
 *      route, and phase67's scope forbids adding one.
 *   3. Neither RPC wrapper passes a user id. The subject is auth.uid() on the
 *      server; a caller-supplied id would make the blocker list an oracle.
 *   4. The delete flow signs out LOCALLY and swallows the failure. The auth
 *      row is gone while the JWT is still valid, so a server-side sign-out
 *      would 401 — and no error may ever follow a successful deletion.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

// Pure module: its only import is a type, so import it for real (the
// lib/earningsMath.ts pattern).
const blockersUrl = pathToFileURL(join(root, 'lib/accountDeletionBlockers.ts')).href;
const { formatBlockerList, isAccountDeletionBlocked, ROUTABLE_KINDS } = await import(
  blockersUrl
);

test('an empty blocker list means deletion is permitted, with no headline', () => {
  for (const input of [[], null, undefined]) {
    const list = formatBlockerList(input);
    assert.equal(list.total, 0);
    assert.equal(list.headline, '');
    assert.deepEqual(list.rows, []);
  }
});

test('a populated blocker list groups, keys and routes every row', () => {
  const list = formatBlockerList([
    {
      kind: 'job',
      ref_id: '11111111-1111-1111-1111-111111111111',
      label: 'Move a sofa',
      detail: 'This job is still open for offers.',
    },
    {
      kind: 'payment_incoming',
      ref_id: '22222222-2222-2222-2222-222222222222',
      label: 'Payment owed to you',
      detail: 'This payment is being held for a job and has not been released.',
    },
    {
      kind: 'payment_outgoing',
      ref_id: '33333333-3333-3333-3333-333333333333',
      label: 'Payment you sent',
      detail: 'This payment has not settled yet.',
    },
    {
      kind: 'dispute',
      ref_id: '44444444-4444-4444-4444-444444444444',
      label: 'Open dispute',
      detail: 'A dispute on this job has to be resolved first.',
    },
  ]);

  assert.equal(list.total, 4);
  assert.match(list.headline, /4 things have to be settled/);

  assert.deepEqual(
    list.rows.map((r) => r.group),
    ['Job', 'Payment', 'Payment', 'Dispute']
  );

  // Only the payee-side payment has a record in ProfileStack. Everything else
  // renders label-only, because no route exists and none may be created.
  assert.deepEqual(
    list.rows.map((r) => r.route),
    [null, 'Earnings', null, null]
  );

  // Keys are unique even when two rows point at the same record.
  const keys = list.rows.map((r) => r.key);
  assert.equal(new Set(keys).size, keys.length);

  // Labels and details come through untouched — the screen never re-words the
  // database's explanation of why something blocks.
  assert.equal(list.rows[0].label, 'Move a sofa');
  assert.equal(list.rows[0].detail, 'This job is still open for offers.');
  assert.equal(list.rows[0].refId, '11111111-1111-1111-1111-111111111111');
});

test('one blocker reads as one, and an unknown kind is still readable and unroutable', () => {
  const list = formatBlockerList([
    { kind: 'refund_pending', ref_id: null, label: 'A refund', detail: 'Not finished.' },
  ]);

  assert.equal(list.total, 1);
  assert.match(list.headline, /^One thing has to be settled/);
  // No generated database types exist in this app, so a kind added
  // server-side arrives as an unrecognised string. It must degrade to
  // readable text with no route, never to a blank row or a dead tap.
  assert.equal(list.rows[0].group, 'Refund pending');
  assert.equal(list.rows[0].route, null);
  assert.equal(list.rows[0].refId, null);
  assert.ok(!Object.prototype.hasOwnProperty.call(ROUTABLE_KINDS, 'refund_pending'));
});

test('the blocked sentinel is matched across every field PostgREST may use', () => {
  assert.equal(isAccountDeletionBlocked(null), false);
  assert.equal(isAccountDeletionBlocked({ message: 'network error' }), false);
  assert.equal(
    isAccountDeletionBlocked({ message: 'ACCOUNT_DELETION_BLOCKED' }),
    true
  );
  assert.equal(
    isAccountDeletionBlocked({ message: null, details: 'ACCOUNT_DELETION_BLOCKED' }),
    true
  );
  assert.equal(isAccountDeletionBlocked({ hint: 'ACCOUNT_DELETION_BLOCKED' }), true);
});

test('neither RPC wrapper passes a user id', async () => {
  const src = await read('lib/accountDeletion.ts');
  assert.match(src, /supabase\.rpc\('account_deletion_blockers'\)/);
  assert.match(src, /supabase\.rpc\('delete_my_account'\)/);
  // No second argument to either call: the subject is auth.uid() server-side.
  assert.doesNotMatch(src, /rpc\('(account_deletion_blockers|delete_my_account)',/);
  assert.doesNotMatch(src, /p_user|user_id|userId/);
});

test('a successful delete signs out locally and can never surface an error', async () => {
  const src = await read('screens/DeleteAccountScreen.tsx');
  assert.match(src, /signOut\(\{\s*scope:\s*'local'\s*\}\)/);
  // The sign-out is wrapped, and its failure is swallowed on purpose.
  const signOutIndex = src.indexOf("signOut({ scope: 'local' })");
  assert.ok(signOutIndex > -1);
  const tryIndex = src.lastIndexOf('try {', signOutIndex);
  assert.ok(tryIndex > -1, 'the local sign-out must sit inside a try/catch');
  assert.ok(
    src.indexOf('} catch {', signOutIndex) > signOutIndex,
    'the local sign-out must have a catch that swallows the error'
  );
  // And the stack is reset regardless of what sign-out did.
  assert.match(src, /navigation\.popToTop\(\)/);
});

test('the deletion screen says what is kept, not only what is removed', async () => {
  const src = await read('screens/DeleteAccountScreen.tsx');
  assert.match(src, /Deleted user/);
  assert.match(src, /tax and legal/i);
  assert.match(src, /Reviews you wrote and reviews you received stay/);
});

test('the entry point is on the Profile surface and the route is registered once', async () => {
  const [hub, accountSafety, stacks, navTypes] = await Promise.all([
    read('screens/ProfileScreen.tsx'),
    read('screens/AccountSafetyScreen.tsx'),
    read('navigation/sharedStacks.tsx'),
    read('lib/navigation.ts'),
  ]);
  // The Profile SURFACE is three pages since the golden-master split
  // (decision 10): the hub, its details page, and its account & safety page.
  // Deletion lives on the last of those, which the hub's "Account" chip
  // opens — so the guarantee is that the surface reaches it, not that one
  // particular file spells the dispatch.
  assert.match(hub, /navigation\.navigate\('AccountSafety'\)/);
  assert.match(accountSafety, /navigation\.navigate\('DeleteAccount'\)/);
  assert.match(stacks, /name="DeleteAccount" component=\{DeleteAccountScreen\}/);
  assert.match(navTypes, /DeleteAccount: undefined;/);
  // One registration only — the screen belongs to the shared Profile stack,
  // which both mode trees mount.
  assert.equal(stacks.split('name="DeleteAccount"').length - 1, 1);
});
