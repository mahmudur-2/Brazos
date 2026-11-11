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
      /import \{ resolveChatMediaUrl, resolveChatMediaUrls \} from '\.\/storage';/,
      // F5: the batch signer beside the single one, both identity stubs.
      'const resolveChatMediaUrl = async (_b, v) => v; const resolveChatMediaUrls = async (_b, vs) => vs.map((v) => v ?? null);'
    );
  assert.match(stubbed, /const supabase = null;/, 'the supabase import must be stubbed');
  assert.doesNotMatch(stubbed, /from '\.\/storage'/, 'the storage import must be stubbed');
  return import(toDataUrl(stubbed));
})();

const baseline = () => read('supabase/migrations/20260901000000_baseline.sql');

/** One function's dump block in the baseline. */
async function baselineFunction(name) {
  const sql = await baseline();
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION "public"."${name}"(`);
  const end = sql.indexOf(`ALTER FUNCTION "public"."${name}"(`, start);
  assert.ok(start > 0 && end > start, `the baseline must define ${name}()`);
  return sql.slice(start, end);
}

/** The `with check (...)` body of the INSERT policy, as B14 restated it (the newest definition). */
async function insertPolicyBody() {
  const sql = await read('supabase/migrations/20261112031500_message_cards_server_only.sql');
  const start = sql.indexOf('alter policy messages_insert_party on public.messages with check (');
  assert.ok(start > 0, 'B14 must restate messages_insert_party');
  const end = sql.indexOf('\n);', start);
  assert.ok(end > start, 'the policy must be bounded by its closing parenthesis');
  return sql.slice(start, end);
}

// ---------------------------------------------------------------------------
// 12 (FIRST, because it is the one that must not break) — the negotiation
// still works before confirmation
// ---------------------------------------------------------------------------

test('offer, counteroffer, accept and decline all still succeed pre-confirmation', async () => {
  const policy = await insertPolicyBody();

  // B14: the policy no longer exempts a structured negotiation row. A client
  // row is plain — the three card columns stay null — so nobody can post a
  // card for an offer, a counter or an acceptance that never happened.
  assert.match(policy, /and job_offer_id is null\s+and request_event is null\s+and request_amount_cents is null/);
  assert.doesNotMatch(policy, /job_offer_id is not null/, 'no exemption for a card-shaped row is left');

  // Why the negotiation cannot break: every writer of a negotiation event
  // is SECURITY DEFINER, so it does not meet this policy at all.
  for (const fn of ['offer_post_event', 'create_offer']) {
    const head = (await baselineFunction(fn)).slice(0, 1200);
    assert.match(head, /SECURITY DEFINER/, `${fn} must stay SECURITY DEFINER`);
  }
});

// ---------------------------------------------------------------------------
// 9, 10 — a pre-confirmation message is rejected BELOW the UI
// ---------------------------------------------------------------------------

test('a pre-confirmation free-form message is rejected by the database', async () => {
  const policy = await insertPolicyBody();
  // Every free-form insert must satisfy the gate; there is no other branch.
  assert.match(policy, /public\.messaging_unlocked\(job_id, direct_thread_id\)/);

  const sql = await baselineFunction('messaging_unlocked');
  // The gate is a real predicate over real state, not a flag.
  assert.match(sql, /j\.assigned_worker_id is not null/);
  assert.match(sql, /j\.status in \('assigned', 'in_progress', 'completed'\)/);
  // It answers only about the caller's own conversations.
  assert.match(sql, /j\.client_id = auth\.uid\(\) or j\.assigned_worker_id = auth\.uid\(\)/);
  assert.match(sql, /t\.user_a = auth\.uid\(\) or t\.user_b = auth\.uid\(\)/);
  // Reachable from the app (phase32 revoked the default EXECUTE).
  assert.ok(
    (await baseline()).includes(
      'GRANT ALL ON FUNCTION "public"."messaging_unlocked"("p_job_id" "uuid", "p_direct_thread_id" "uuid") TO "authenticated";'
    )
  );
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
  // TWO since lean D3a (text and photo): voice and documents went with their
  // features. Both are the SAME insert underneath, so they meet the same
  // policy and owe the same words on a refusal.
  for (const handler of ['handleSendText', 'sendPhoto']) {
    assert.match(chat, new RegExp(`function ${handler}`), `${handler} must exist`);
  }
  assert.doesNotMatch(chat, /handleTemplate/, 'the quick-reply send is retired with its row');
  // Every one of them reports a refused send through the one mapper, so a
  // stale screen gets the rule in words and never a raw database error.
  assert.equal(
    (chat.match(/await reportSendFailure\(/g) ?? []).length,
    2,
    'both send paths must route failures through reportSendFailure()'
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
  const body = await baselineFunction('messaging_unlocked');

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
  // SELECT is not gated by the lock, so no historical row disappears for
  // either party: the read policy never consults messaging_unlocked().
  const sql = await baseline();
  const start = sql.indexOf('CREATE POLICY "messages_select_party" ON "public"."messages" FOR SELECT');
  assert.ok(start > 0, 'the baseline must create messages_select_party');
  assert.doesNotMatch(sql.slice(start, sql.indexOf(';\n', start)), /messaging_unlocked/);
  const lean = await read('supabase/migrations/20261108000000_lean_v1.sql');
  assert.doesNotMatch(lean, /policy "?messages_select_party"?/i, 'lean_v1 must not rewrite the read policy');
});
