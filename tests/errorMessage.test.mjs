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
const { userMessage, authMessage } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);

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
  // C3: the server's own-job refusal says "client"; the user reads the app's word.
  assert.equal(userMessage({ message: 'A client cannot bid on their own job', code: 'P0001' }), 'You can’t bid on your own job.');
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

test('no screen, component, hook, or ui primitive stores or shows raw error text', async () => {
  const { readdirSync } = await import('node:fs');
  // G-001 (docs/audit/2026-08-22/guard_coverage.md) widened this sweep to
  // `ui/`. The leak it missed lived in ui/primitives/MediaUploader.tsx, one
  // directory outside the scan: the component extracted a StorageError's
  // `.message` and handed it to a callback, and by the time it reached
  // PostJobScreen's `alertAsync` it was bound to a parameter named `message`,
  // which the needle below cannot see. A seam is only guarded where it is.
  //
  // `recursive` closes G-006 at the same time: `ui/` HAS subdirectories
  // (primitives/, templates/), and screens/, components/ and hooks/ were one
  // `mkdir` away from the same silent hole.
  const dirs = ['screens', 'components', 'hooks', 'ui'];
  const offenders = [];

  for (const dir of dirs) {
    const entries = readdirSync(join(root, dir), { recursive: true })
      .map((entry) => String(entry).replace(/\\/g, '/'))
      .filter((entry) => /\.(ts|tsx)$/.test(entry));
    for (const file of entries) {
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

// ---------------------------------------------------------------------------
// FIX-RUN B7 — sign-in and sign-up never show the auth server's own text
// ---------------------------------------------------------------------------

test('B7 · authMessage maps each auth error, by code first and then by message', () => {
  const cases = [
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'That email and password don’t match.'],
    [{ message: 'Invalid login credentials' }, 'That email and password don’t match.'],
    [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, 'Confirm your email first — check your inbox for the link.'],
    [{ message: 'Email not confirmed' }, 'Confirm your email first — check your inbox for the link.'],
    [{ code: 'user_already_exists', message: 'User already registered' }, 'There’s already an account with that email. Sign in instead.'],
    [{ message: 'User already registered' }, 'There’s already an account with that email. Sign in instead.'],
    [{ code: 'weak_password', message: 'Password should be at least 6 characters.' }, 'Use a longer password — at least 6 characters.'],
    [{ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 'Too many tries. Wait a minute and try again.'],
    [{ status: 429, message: 'Request rate limit reached' }, 'Too many tries. Wait a minute and try again.'],
    [{ code: 'email_address_invalid', message: 'Email address "x@y" is invalid' }, 'Enter a valid email address.'],
    [{ message: 'Database error saving new user' }, 'We couldn’t create this account. Contact support if you think this is a mistake.'],
    [{ message: 'Failed to fetch' }, 'Can’t reach Brazos right now. Check your connection and try again.'],
  ];
  for (const [error, expected] of cases) {
    assert.equal(authMessage(error), expected, JSON.stringify(error));
  }
});

test('B7 · nothing raw passes through: an unmapped auth sentence becomes the generic line', () => {
  for (const raw of ['Signups not allowed for this instance', 'Anonymous sign-ins are disabled', 'Unexpected failure']) {
    const shown = authMessage({ message: raw });
    assert.notEqual(shown, raw);
    assert.equal(shown, 'Something went wrong. Please try again.');
  }
});

test('B7 · both email screens show authMessage, and the sign-up dialog names where the link went', async () => {
  const signIn = await readFile(join(root, 'screens/EmailSignInScreen.tsx'), 'utf8');
  const signUp = await readFile(join(root, 'screens/EmailCreateAccountScreen.tsx'), 'utf8');
  assert.match(signIn, /if \(error\) setFormError\(authMessage\(error\)\);/);
  assert.match(signUp, /setFormError\(authMessage\(error\)\);/);
  for (const src of [signIn, signUp]) assert.doesNotMatch(src, /setFormError\(error\.message\)/);
  assert.match(signUp, /if \(needsConfirmation\) \{\s*await alertAsync\('Check your email', `We sent a link to \$\{trimmedEmail\}\. Open it to finish signing up\.`\);/);
  assert.doesNotMatch(signUp, /If email confirmation is enabled/);
  const auth = await readFile(join(root, 'lib/AuthContext.tsx'), 'utf8');
  assert.match(auth, /return \{ error, needsConfirmation: !error && !data\.session \};/);
});

test('[static] B7 review · a device or server reason never reaches a share alert or the push notice', async () => {
  // lib/ sits outside the raw-message sweep above, so its two share helpers are fenced here:
  // the native error goes to Sentry, the alert reads a fixed line.
  const sharing = await read('lib/sharing.ts');
  assert.doesNotMatch(sharing, /message:\s*err instanceof Error \? err\.message/);
  assert.match(sharing, /message: 'Could not share this photo\. Try again\.',/);
  assert.match(sharing, /message: 'Could not open this document\. Try again\.',/);
  // registerPushToken()'s 'error' result carries "Could not get a push token: …" or the RPC's own
  // text; Notification settings shows a plain line and a retry, never that message.
  const settings = await read('screens/NotificationSettingsScreen.tsx');
  assert.doesNotMatch(settings, /return \{ tone: 'warn', text: pushState\.message \}/);
  assert.match(settings, /text: 'Brazos couldn’t set up notifications on this phone\. Check your connection and try again\.',\s*retry: true,/);
  assert.match(settings, /notice\.retry \? \(\s*<Pressable onPress=\{checkPush\}/);
});
