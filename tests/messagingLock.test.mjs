import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

/**
 * Free-form messaging is locked until the job is confirmed (phase66).
 *
 * The rule that matters most here is the one it must NOT break: sending an
 * offer, countering, accepting and declining all still work before
 * confirmation. That is asserted first and from two directions — the policy's
 * own text, and the fact that every structured writer is SECURITY DEFINER and
 * therefore never meets the policy at all.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/messages.ts EXECUTED for its pure helpers; the supabase client and the
// storage helper are stubbed — neither is touched by anything below.
const messagesModule = (async () => {
  const js = stripTypeScriptTypes(await read('lib/messages.ts'), { mode: 'strip' });
  const stubbed = js
    .replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;')
    .replace(
      /import \{ resolveChatMediaUrl \} from '\.\/storage';/,
      'const resolveChatMediaUrl = async (_b, v) => v;'
    );
  assert.match(stubbed, /const supabase = null;/, 'the supabase import must be stubbed');
  return import(toDataUrl(stubbed));
})();

const migration = () => read('supabase/phase66_messaging_locked_until_confirmed.sql');

/** The `with check (...)` body of the new INSERT policy. */
async function insertPolicyBody() {
  const sql = await migration();
  const start = sql.indexOf('create policy "messages_insert_party"');
  assert.ok(start > 0, 'the migration must create messages_insert_party');
  const end = sql.indexOf('comment on policy', start);
  assert.ok(end > start, 'the policy must be bounded by its comment');
  return sql.slice(start, end);
}

// ---------------------------------------------------------------------------
// 12 (FIRST, because it is the one that must not break) — the negotiation
// still works before confirmation
// ---------------------------------------------------------------------------

test('offer, counteroffer, accept and decline all still succeed pre-confirmation', async () => {
  const policy = await insertPolicyBody();

  // The policy exempts a structured negotiation row outright, keyed on the
  // discriminator the app itself reads first.
  assert.match(policy, /messages\.job_offer_id is not null or messages\.job_request_id is not null/);

  // And the exemption cannot be abused as a free-form channel: a client-
  // supplied event row may carry no text, photo or audio — exactly the shape
  // offer_post_event() and create_offer() write.
  assert.match(policy, /coalesce\(btrim\(messages\.content\), ''\) = ''/);
  assert.match(policy, /messages\.image_url is null/);
  assert.match(policy, /messages\.audio_url is null/);

  // The stronger reason it cannot break: every writer of a negotiation event
  // is SECURITY DEFINER, so it does not meet this policy at all.
  const writers = [
    ['supabase/phase46_offer_rpcs_and_rls.sql', 'offer_post_event'],
    ['supabase/phase61_marketplace_thread_identity.sql', 'create_offer'],
  ];
  for (const [file, fn] of writers) {
    const sql = await read(file);
    const start = sql.indexOf(`create or replace function public.${fn}(`);
    assert.ok(start > 0, `${fn} must be defined in ${file}`);
    const head = sql.slice(start, start + 1200);
    assert.match(head, /security definer/, `${fn} must stay SECURITY DEFINER`);
  }

  // The migration must not touch the negotiation RPCs or their grants at all.
  const sql = await migration();
  for (const fn of [
    'create_offer',
    'counter_offer',
    'accept_offer',
    'decline_offer',
    'withdraw_offer',
    'offer_post_event',
  ]) {
    assert.ok(
      !new RegExp(`create or replace function public\\.${fn}\\(`).test(sql),
      `phase66 must not redefine ${fn}()`
    );
  }
});

// ---------------------------------------------------------------------------
// 9, 10 — a pre-confirmation message is rejected BELOW the UI
// ---------------------------------------------------------------------------

test('a pre-confirmation free-form message is rejected by the database', async () => {
  const policy = await insertPolicyBody();
  // Every free-form insert must satisfy the gate; there is no other branch.
  assert.match(policy, /public\.messaging_unlocked\(messages\.job_id, messages\.direct_thread_id\)/);

  const sql = await migration();
  // The gate is a real predicate over real state, not a flag.
  assert.match(sql, /create or replace function public\.messaging_unlocked\(/);
  assert.match(sql, /j\.assigned_worker_id is not null/);
  assert.match(sql, /j\.status in \('assigned', 'in_progress', 'completed'\)/);
  // It answers only about the caller's own conversations.
  assert.match(sql, /j\.client_id = auth\.uid\(\) or j\.assigned_worker_id = auth\.uid\(\)/);
  assert.match(sql, /t\.user_a = auth\.uid\(\) or t\.user_b = auth\.uid\(\)/);
  // Reachable from the app (phase32 revoked the default EXECUTE).
  assert.match(sql, /grant execute on function public\.messaging_unlocked\(uuid, uuid\) to authenticated/);
});

test('every send path is the same rejected mutation', async () => {
  const messages = stripComments(await read('lib/messages.ts'));
  // Text, photo and voice all go through ONE insert, so the policy covers
  // every one of them without a per-path rule. (It was four paths until
  // 2026-08-23: the quick-reply send went with components/QuickReplies.tsx.
  // Removing a CALLER of the one insert cannot weaken this — the property is
  // that there is exactly one insert, and there still is.)
  assert.equal(
    (messages.match(/\.from\('messages'\)\s*\.insert\(/g) ?? []).length,
    1,
    'there must be exactly one client insert into messages'
  );
  // And that insert never sets a discriminator, so it can never take the
  // negotiation exemption.
  const send = messages.slice(
    messages.indexOf('export async function sendMessage'),
    messages.indexOf('export function messagePreviewText')
  );
  assert.ok(send.length > 0);
  assert.doesNotMatch(send, /job_offer_id/);
  assert.doesNotMatch(send, /job_request_id/);

  const chat = stripComments(await read('screens/ChatScreen.tsx'));
  // FOUR since 2026-08-25: sendDocument joined them when DOCUMENTS shipped.
  // It writes a different bucket and is offered on a thread kind the other
  // three are not, but it is the SAME insert underneath, so it meets the same
  // policy and owes the same words on a refusal.
  for (const handler of ['handleSendText', 'sendPhoto', 'handleSendVoice', 'sendDocument']) {
    assert.match(chat, new RegExp(`function ${handler}`), `${handler} must exist`);
  }
  assert.doesNotMatch(chat, /handleTemplate/, 'the quick-reply send is retired with its row');
  // Every one of them reports a refused send through the one mapper, so a
  // stale screen gets the rule in words and never a raw database error.
  assert.equal(
    (chat.match(/await reportSendFailure\(/g) ?? []).length,
    4,
    'all four send paths must route failures through reportSendFailure()'
  );
  assert.match(chat, /isMessagingLockedError\(error\)/);
  assert.match(chat, /MESSAGING_LOCKED_MESSAGE/);
});

test('a refused send is named, never leaked as database text', async () => {
  const { isMessagingLockedError, MESSAGING_LOCKED_MESSAGE } = await messagesModule;

  assert.equal(isMessagingLockedError({ code: '42501' }), true);
  assert.equal(
    isMessagingLockedError({
      message: 'new row violates row-level security policy for table "messages"',
    }),
    true
  );
  assert.equal(isMessagingLockedError({ message: 'Network request failed' }), false);
  assert.equal(isMessagingLockedError(null), false);

  // The sentence a user sees is the product rule, with no engine or schema
  // vocabulary in it — the same bar lib/errorMessage.ts holds every surface to.
  assert.match(MESSAGING_LOCKED_MESSAGE, /once this job is confirmed/);
  assert.doesNotMatch(
    MESSAGING_LOCKED_MESSAGE,
    /\b(policy|row-level|42501|public\.|constraint|relation|column)\b/i
  );
});

// ---------------------------------------------------------------------------
// Invariants 1 & 2 — every free-form entry point, not merely one button
// ---------------------------------------------------------------------------

test('no free-form entry point renders before the conversation opens', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));

  // ONE branch removes the whole composer block — text input, send control,
  // the attachment menu, camera, photo library and voice — rather than
  // disabling them one at a time and leaving the next one to be forgotten.
  // (The quick-reply row was the second element this used to check for; it
  // was deleted on 2026-08-23 with components/QuickReplies.tsx, so there is
  // one entry point left to place rather than two.)
  assert.match(chat, /messagingUnlocked !== true \? \(/);
  const gateStart = chat.indexOf('messagingUnlocked !== true ? (');
  const composerStart = chat.indexOf('<ChatComposer');
  assert.ok(
    gateStart > 0 && composerStart > gateStart,
    'the composer must sit inside the unlocked branch'
  );
  // ...and the retired row must not reappear outside it, which is the half
  // that would otherwise be lost by dropping the second index.
  assert.doesNotMatch(chat, /QuickReplies/, 'the quick-reply row is retired, not relocated');

  // Unknown is treated as closed: a slow read never flashes a composer.
  assert.match(chat, /messagingUnlocked === false \? \(/);
  assert.match(chat, /useState<boolean \| null>\(null\)/);
});

test('the screen asks the database for the rule instead of re-deriving it', async () => {
  const chat = stripComments(await read('screens/ChatScreen.tsx'));
  const messages = stripComments(await read('lib/messages.ts'));

  assert.match(messages, /supabase\.rpc\('messaging_unlocked'/);
  assert.match(chat, /fetchMessagingUnlocked\(/);
  // Re-read on focus and again after an accept, since accepting is what
  // assigns the worker.
  assert.match(chat, /useFocusEffect\(\s*\n?\s*useCallback\(\(\) => \{\s*\n?\s*void refreshMessagingLock\(\);/);
  assert.match(chat, /if \(action === 'accept'\) await refreshMessagingLock\(\);/);

  // No second definition of "confirmed" anywhere in the chat surface.
  assert.doesNotMatch(chat, /deriveJobLifecycle/);
  assert.doesNotMatch(chat, /assigned_worker_id/);
});

test('no Message CTA survives on a pre-confirmation surface', async () => {
  const preConfirmation = [
    'screens/JobDetailScreen.tsx',
    'screens/BidDetailScreen.tsx',
  ];
  for (const file of preConfirmation) {
    const src = stripComments(await read(file));
    assert.doesNotMatch(src, /title=\{`Message /, `${file} must not offer a Message CTA`);
    assert.doesNotMatch(src, /navigate\('Chat'/, `${file} must not open a chat`);
  }
});

// ---------------------------------------------------------------------------
// 11 — a confirmed job permits messaging, and history keeps rendering
// ---------------------------------------------------------------------------

test('a confirmed/assigned job permits messaging', async () => {
  const sql = await migration();
  const start = sql.indexOf('create or replace function public.messaging_unlocked(');
  const end = sql.indexOf('comment on function public.messaging_unlocked', start);
  const body = sql.slice(start, end);

  // Job thread: the client or the hired worker of an assigned job.
  assert.match(body, /when p_job_id is not null then exists \(/);
  // Pair thread: any job between these two people that reached assignment.
  assert.match(body, /when p_direct_thread_id is not null then exists \(/);
  assert.match(
    body,
    /on \(j\.client_id = t\.user_a and j\.assigned_worker_id = t\.user_b\)\s*\n?\s*or \(j\.client_id = t\.user_b and j\.assigned_worker_id = t\.user_a\)/
  );
  // Nothing else opens it.
  assert.match(body, /else false/);
});

test('existing pre-confirmation history still reads', async () => {
  const sql = await migration();
  // SELECT is untouched, so no historical row disappears for either party.
  assert.ok(
    !/create policy "messages_select_party"/.test(sql),
    'phase66 must not rewrite the read policy'
  );
  assert.ok(
    !/\bdelete from public\.messages\b/i.test(sql) && !/\bupdate public\.messages\b/i.test(sql),
    'phase66 must not delete or migrate any message row'
  );
  // And it says so, out loud, in the file.
  assert.match(sql, /messages_select_party \(phase36\) is UNCHANGED/);
});

// ---------------------------------------------------------------------------
// The migration follows the phase-file convention
// ---------------------------------------------------------------------------

test('phase66 is a single idempotent transaction with a registered sentinel', async () => {
  const sql = await migration();

  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
  // Re-runnable: every object is create-or-replace / drop-if-exists.
  assert.match(sql, /drop policy if exists "messages_insert_party" on public\.messages;/);
  assert.match(sql, /create or replace function public\.messaging_lock_enabled\(\)/);
  assert.match(sql, /revoke all on function public\.messaging_lock_enabled\(\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.messaging_lock_enabled\(\) to authenticated;/);
  assert.match(sql, /notify pgrst, 'reload schema';/);

  // The post-condition runs BEFORE the sentinel, so a green verify line can
  // only mean the policy actually carries the gate.
  const guard = sql.indexOf('phase66 post-condition failed');
  const sentinel = sql.indexOf('create or replace function public.messaging_lock_enabled()');
  assert.ok(guard > 0 && guard < sentinel, 'the sentinel must follow the post-condition');

  // Staging only — production is never named anywhere in this run.
  assert.doesNotMatch(sql, /avkighsiufeefyycbebf/);

  // Registered in the verifier, or "applied" would be unprovable.
  const verify = await read('scripts/verify-schema.mjs');
  assert.match(verify, /file: 'phase66_messaging_locked_until_confirmed\.sql'/);
  assert.match(verify, /checkRpc\('messaging_lock_enabled', \{\}\)/);
  assert.match(verify, /checkRpc\('messaging_unlocked', \{/);
});
