import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Ship-blocker guard — raw database text must never reach a user.
 *
 * The hardening run made failures visible instead of silently rendering
 * empty states, which surfaced PostgREST/Postgres strings on four device
 * screens ("column jobs.en_route_at does not exist"). Everything
 * user-visible now routes through lib/errorMessage.userMessage().
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

globalThis.__DEV__ = false; // production behaviour is what must be guarded
const { userMessage } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);

test('the four device errors never reach a user verbatim', () => {
  const observed = [
    { message: 'column jobs.en_route_at does not exist', code: '42703' },
    { message: 'column profiles_1.accepting_work does not exist', code: '42703' },
    { message: "Could not find the table 'public.worker_services' in the schema cache", code: 'PGRST205' },
    { message: 'column payments.released_at does not exist', code: '42703' },
  ];
  for (const error of observed) {
    const shown = userMessage(error);
    assert.ok(!shown.includes(error.message), `raw text leaked: ${shown}`);
    assert.ok(!/column|schema cache|public\./i.test(shown), `db vocabulary leaked: ${shown}`);
    assert.match(shown, /app update/i, 'version skew should tell the user to update');
  }
});

test('classification covers the states a user can act on', () => {
  assert.match(userMessage({ message: 'Network request failed' }), /connection/i);
  assert.match(userMessage({ message: 'permission denied for table payments', code: '42501' }), /access/i);
  assert.match(userMessage({ code: 'PGRST116', message: 'not found' }), /available/i);
  assert.match(userMessage({ code: '23505', message: 'duplicate key value' }), /already/i);
  // Our own RPC sentences ARE for users — they pass through.
  assert.equal(
    userMessage({ message: 'Funds release only after the job is completed' }),
    'Funds release only after the job is completed'
  );
  // …but engine text that merely lacks a code still does not.
  const leak = userMessage({ message: 'null value in column "amount_cents" violates not-null constraint' });
  assert.ok(!leak.includes('amount_cents'), leak);
  // A caller's fallback wins over the generic default.
  assert.equal(userMessage(null, 'Nothing was charged.'), 'Nothing was charged.');
});

// ---------------------------------------------------------------------------
// Whole-surface sweep (raw-error sweep, 2026-08-10). Supersedes the original
// 14-screen list: EVERY screen, component and hook is scanned, and the regex
// catches err/firstError/uploadError-style identifiers the old
// /[Ee]rror\.message/ shape missed.
// ---------------------------------------------------------------------------

// Files that may still carry a raw `.message` and exactly why. Each entry is
// either LOCKED (do-not-patch this session — the exact authorized-ready diff
// lives in docs/LOCKED_FILE_PATCHES.md) or a non-database message field that
// is human-written by our own code.
const RAW_MESSAGE_ALLOWLIST = new Set([
  'screens/EmailSignInScreen.tsx', // LOCKED auth flow — patch doc addendum
  'screens/EmailCreateAccountScreen.tsx', // LOCKED auth flow — patch doc addendum
  'screens/LegalGateScreen.tsx', // LOCKED auth flow — patch doc addendum
  // The superseded chat hook left the list in Batch F: deleted outright, zero
  // importers — ChatScreen reads useConversationChat instead.
  'hooks/useConversations.ts', // LOCKED hook — wrapped at the MessagesInbox render seam
  // hooks/useOpenJobs.ts left the list 2026-08-12: patch doc A7 was applied
  // by owner authorization — the hook now wraps at its own setError.
]);

test('no screen, component, or hook stores or shows raw error text', async () => {
  const { readdirSync } = await import('node:fs');
  const dirs = ['screens', 'components', 'hooks'];
  const offenders = [];

  for (const dir of dirs) {
    for (const file of readdirSync(join(root, dir)).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const rel = `${dir}/${file}`;
      if (RAW_MESSAGE_ALLOWLIST.has(rel)) continue;
      const src = await read(rel);
      for (const line of src.split('\n')) {
        // An identifier containing err/Err (error, firstError, uploadError,
        // err, acceptError…) reaching .message outside a console call. Named
        // non-error fields (activeBid.message, pushState.message,
        // rejection.message, here.message) do not contain 'err' and pass.
        if (!/\b\w*[Ee]rr\w*\??\.message\b/.test(line)) continue;
        if (line.includes('console.')) continue;
        if (line.includes('userMessage(')) continue;
        offenders.push(`${rel}: ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `raw error text reaches state or UI outside lib/errorMessage:\n${offenders.join('\n')}`
  );
});

test('raw-error hooks stay raw only because their render seams wrap', async () => {
  // Hooks that store a raw error object rely on the consumer wrap; the
  // guarantee is asserted here so a vanished wrap fails before a device shows
  // it. ChatScreen's hook is useConversationChat since Batch F deleted its
  // predecessor. (useOpenJobs wraps at its own setError since the A7 patch.)
  const chat = await read('screens/ChatScreen.tsx');
  assert.match(
    chat,
    /\{error \? <Text style=\{styles\.error\}>\{userMessage\(error\)\}<\/Text> : null\}/,
    'ChatScreen must wrap useConversationChat.error with userMessage() at render'
  );
  const inbox = await read('screens/MessagesInboxScreen.tsx');
  assert.match(
    inbox,
    /\{error \? <Text style=\{styles\.error\}>\{userMessage\(error\)\}<\/Text> : null\}/,
    'MessagesInbox must wrap useConversations.error with userMessage() at render'
  );
});
