import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A6 (lean P4) - requests end, sign-out is bounded.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const { withRequestTimeout, isTimeoutExempt, REQUEST_TIMEOUT_MS } = await import(
  pathToFileURL(join(root, 'lib/fetchTimeout.ts')).href
);

const never = (_input, init) =>
  new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));

test('a request that never answers fails with a timeout the app already words as offline', async () => {
  assert.equal(REQUEST_TIMEOUT_MS, 15_000);
  const fetchWithTimeout = withRequestTimeout(never, 20);
  await assert.rejects(fetchWithTimeout('https://x.test/rest/v1/jobs', {}), /Request timeout/);
});

test('a prompt answer passes through untouched, and the caller\'s own abort still aborts', async () => {
  const ok = withRequestTimeout(async () => 'response', 20);
  assert.equal(await ok('https://x.test/rest/v1/jobs'), 'response');
  const controller = new AbortController();
  const wrapped = withRequestTimeout(never, 5000);
  const pending = wrapped('https://x.test/rest/v1/jobs', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/);
});

test('storage transfers are exempt; everything else is bounded', () => {
  assert.equal(isTimeoutExempt('https://p.supabase.co/storage/v1/object/job-photos/a.jpg'), true);
  assert.equal(isTimeoutExempt('https://p.supabase.co/rest/v1/jobs'), false);
  assert.equal(isTimeoutExempt({ url: 'https://p.supabase.co/storage/v1/object/x' }), true);
});

test('the client is created with the wrapper, and logout waits at most 5 s for the push detach', () => {
  assert.match(read('lib/supabase.ts'), /global: \{ fetch: withRequestTimeout\(fetch\) \}/);
  const auth = read('lib/AuthContext.tsx');
  assert.match(auth, /const LOGOUT_PUSH_UNREGISTER_MS = 5000;/);
  assert.match(auth, /Promise\.race\(\[\s*unregisterPushToken\(\)\.catch\(\(\) => undefined\),/);
});
