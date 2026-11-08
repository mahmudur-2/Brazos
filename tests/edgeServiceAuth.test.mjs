// lean E4, docs/lean/SECURITY-VERDICT.md B3: the three functions the database wakes check the
// service key through one constant-time gate, supabase/functions/_shared/serviceAuth.ts. Deno cannot
// run here, so the gate's own body is executed under node with its one URL import swapped for
// node's crypto.timingSafeEqual, which THROWS on unequal lengths: a pass also proves the helper never
// hands it two lengths. The wiring is fenced as text.
import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const root = join(import.meta.dirname, '..');
// CRLF folded to LF, so a Windows checkout and CI read the same text.
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const HELPER = 'supabase/functions/_shared/serviceAuth.ts';
const IMPORT = /^import \{ timingSafeEqual \} from 'https:\/\/deno\.land\/std@0\.224\.0\/crypto\/timing_safe_equal\.ts';$/m;

const source = read(HELPER);
globalThis.__e4TimingSafeEqual = (a, b) => timingSafeEqual(a, b);
const js = stripTypeScriptTypes(source.replace(IMPORT, 'const timingSafeEqual = globalThis.__e4TimingSafeEqual;'), { mode: 'strip' });
const { requireServiceRole } = await import(
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64')
);

const KEY = 'service-key-for-the-test';
const call = (method, authorization) =>
  requireServiceRole(new Request('http://edge.test/fn', { method, headers: authorization ? { Authorization: authorization } : {} }), KEY);

test('B3 · the helper exists, exports requireServiceRole and compares with Deno std timingSafeEqual', () => {
  assert.match(source, IMPORT, 'timingSafeEqual comes from the pinned Deno std module');
  assert.match(source, /export function requireServiceRole\(req: Request, serviceKey: string\): Response \| null \{/);
  assert.match(source, /timingSafeEqual\(sameLength \? given : new Uint8Array\(expected\.byteLength\), expected\)/);
  assert.equal(typeof requireServiceRole, 'function');
});

test('B3 · executed: only a POST with exactly the service key passes', async () => {
  assert.equal(call('POST', `Bearer ${KEY}`), null, 'the service key passes');

  for (const [why, method, authorization, status, error] of [
    ['a GET, even with the key', 'GET', `Bearer ${KEY}`, 405, 'method not allowed'],
    ['no Authorization header', 'POST', null, 403, 'forbidden'],
    ['a different key of the same length', 'POST', `Bearer ${KEY.replace(/.$/, 'X')}`, 403, 'forbidden'],
    ['a shorter key', 'POST', `Bearer ${KEY.slice(0, -1)}`, 403, 'forbidden'],
    ['a longer key', 'POST', `Bearer ${KEY}x`, 403, 'forbidden'],
    ['the key without the Bearer scheme', 'POST', KEY, 403, 'forbidden'],
  ]) {
    const res = call(method, authorization);
    assert.ok(res instanceof Response, `${why}: refused`);
    assert.equal(res.status, status, `${why}: ${status}`);
    assert.equal(res.headers.get('Content-Type'), 'application/json', `${why}: JSON`);
    assert.deepEqual(await res.json(), { error }, `${why}: body`);
  }
});

test('B3 · all three service functions use the gate, after their env check', () => {
  for (const name of ['send-push', 'send-receipts', 'process-settlements']) {
    const fn = read(`supabase/functions/${name}/index.ts`);
    assert.match(fn, /^import \{ requireServiceRole \} from '\.\.\/_shared\/serviceAuth\.ts';$/m, `${name} imports the gate`);
    const env = fn.indexOf('if (!SUPABASE_URL || !SERVICE_KEY');
    const gate = fn.indexOf('const refused = requireServiceRole(req, SERVICE_KEY);\n  if (refused) return refused;');
    assert.ok(env > -1, `${name} keeps its env check`);
    assert.ok(gate > env, `${name} runs the gate right after the env check`);
  }
});

test('B3 · no plain string compare of a Bearer header is left under supabase/functions', () => {
  const dir = join(root, 'supabase/functions');
  const files = readdirSync(dir, { recursive: true }).filter((f) => /\.(ts|mjs|js)$/.test(f));
  assert.ok(files.length >= 12, `only ${files.length} files read: check the scan`);
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    assert.doesNotMatch(text, /[!=]==\s*[`'"]Bearer/, `${file} compares a Bearer header with a plain string`);
    assert.doesNotMatch(text, /[`'"]Bearer [^`'"]*[`'"]\s*[!=]==/, `${file} compares a Bearer header with a plain string`);
  }
});
