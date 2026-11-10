import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Lean P4 - the small app-side fixes (A5 to A11). Static where the code is a screen, executed where it is pure.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
globalThis.__DEV__ = false;
const { isNetworkError } = await import(pathToFileURL(join(root, 'lib/errorMessage.ts')).href);

test('A5 · a profile response for an account that is no longer signed in is never published', () => {
  const src = read('hooks/useProfile.ts');
  const afterFetch = src.indexOf('await fetchMyProfile(user.id)');
  const guard = src.indexOf('if (snapshot.userId !== user.id) return;');
  assert.ok(afterFetch > 0 && guard > afterFetch, 'the id is re-checked after the await');
  assert.ok(guard < src.indexOf('publish({ profile: data'), 'and before anything is published');
});

test('A7 · a root boundary sits above the providers and its fallback reads no provider', () => {
  const app = read('App.tsx');
  assert.ok(app.indexOf('<AppErrorBoundary scope="root">') < app.indexOf('<MotionRoot>'));
  assert.ok(app.indexOf('<SafeAreaProvider>') < app.indexOf('<ThemeProvider>'));
  const boundary = read('components/AppErrorBoundary.tsx');
  const safe = boundary.slice(boundary.indexOf('function SafeCrashFallback'), boundary.indexOf('function CrashFallbackView'));
  assert.doesNotMatch(safe, /useThemeColors|useTheme\(/);
});

test('A8 · the chat offer response is guarded by a ref, not stale state', () => {
  const src = read('screens/ChatScreen.tsx');
  assert.match(src, /if \(respondingRef\.current\) return;\s*respondingRef\.current = true;/);
  assert.match(src, /respondingRef\.current = false;\s*setRespondingId\(null\);/);
});

test('A9 · no developer words in the profile, a failed photo is not "Saved", the phone is E.164, the form avoids the keyboard', () => {
  const src = read('screens/ProfileScreen.tsx');
  assert.doesNotMatch(src, /phase7|"avatars"|42703/);
  assert.match(src, /photoFailed/);
  assert.match(src, /toE164\(split\.country, split\.national\)/);
  assert.match(src, /<KeyboardAvoid style=\{styles\.flex\}/);
});

test('A10 · the chat composer caps a message at 2000 characters and counts near the cap', () => {
  const src = read('components/ChatComposer.tsx');
  assert.match(src, /export const CHAT_MESSAGE_MAX = 2000;/);
  assert.match(src, /maxLength=\{CHAT_MESSAGE_MAX\}/);
});

test('A11 · a release with no answer is re-read before the screen says where the money is', () => {
  assert.equal(isNetworkError({ message: 'Network request failed' }), true);
  assert.equal(isNetworkError({ message: 'Request timeout' }), true);
  assert.equal(isNetworkError({ message: 'Funds release only after the job is completed' }), false);
  assert.equal(isNetworkError(null), false);
  const src = read('screens/ApproveOrDisputeScreen.tsx');
  const network = src.indexOf('if (isNetworkError(result.error))');
  const reread = src.indexOf('await fetchJobPaymentState(job.id)', network);
  const claim = src.indexOf('nothing was released', network);
  assert.ok(network > 0 && reread > network, 'the network branch re-reads the payment');
  assert.ok(claim > reread, 'the "nothing was released" line only follows a re-read (the generic branch is later)');
});
