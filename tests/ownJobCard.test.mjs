import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// n5 (2026-09-04) — a customer's own Nearby card opens its job detail.
//
// docs/BACKLOG.md: every Nearby card on Customer Home, the poster's own job
// included, ran browseOpenJobs() and offered the worker-mode switch. The
// decision now lives in lib/ownJobCard.ts and is EXECUTED here with fakes;
// HomeScreen's wiring is pinned as text.
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

// lib/ownJobCard.ts executed for real. Its one runtime import, userMessage, is
// lib/errorMessage.ts — import-free, loaded by its absolute URL the way
// tests/errorMessage.test.mjs loads it; __DEV__ is false so no dev suffix.
globalThis.__DEV__ = false;
const errorMessageUrl = pathToFileURL(join(root, 'lib/errorMessage.ts')).href;
const source = stripTypeScriptTypes(read('lib/ownJobCard.ts'), { mode: 'strip' });
const relativeImport = "from './errorMessage';";
assert.ok(source.includes(relativeImport), 'the one runtime import must be userMessage');
const { openOwnJob, OWN_JOB_ROUTE } = await import(
  toDataUrl(source.replace(relativeImport, () => `from '${errorMessageUrl}';`))
);

const job = { id: 'job-1', client_id: 'me', title: 'Paint one bedroom, walls only', status: 'open' };

function fakes({ data, error }) {
  const calls = { fetched: [], navigate: [], alert: [] };
  return {
    calls,
    deps: {
      fetchJob: async (id) => {
        calls.fetched.push(id);
        return { data, error };
      },
      navigate: (tab, screen, params) => {
        calls.navigate.push({ tab, screen, params });
      },
      alert: async (title, message) => {
        calls.alert.push({ title, message });
      },
    },
  };
}

test('n5 · OWN_JOB_ROUTE names the client job detail inside the My Jobs tab', () => {
  assert.deepEqual(OWN_JOB_ROUTE, { tab: 'MyJobs', screen: 'ClientJobDetail' });
});

test('n5 · a resolving fetch opens ClientJobDetail in MyJobs with the fetched row and reports opened', async () => {
  const { deps, calls } = fakes({ data: job, error: null });
  assert.equal(await openOwnJob(deps, 'job-1'), 'opened');
  assert.deepEqual(calls.fetched, ['job-1']);
  assert.deepEqual(calls.navigate, [{ tab: 'MyJobs', screen: 'ClientJobDetail', params: { job } }]);
  assert.deepEqual(calls.alert, []);
});

test('n5 · a failing fetch alerts through userMessage, does not navigate, and reports failed', async () => {
  const { deps, calls } = fakes({ data: null, error: { message: 'Network request failed' } });
  assert.equal(await openOwnJob(deps, 'job-1'), 'failed');
  assert.deepEqual(calls.navigate, []);
  assert.deepEqual(calls.alert, [
    {
      title: 'Could not open your job',
      // lib/errorMessage.ts's own OFFLINE sentence — the raw text never reaches the dialog.
      message: 'Can’t reach BRAZOS right now. Check your connection and try again.',
    },
  ]);
});

test('n5 · a null row alerts with the existing generic sentence and opens nothing', async () => {
  const { deps, calls } = fakes({ data: null, error: null });
  assert.equal(await openOwnJob(deps, 'job-1'), 'failed');
  assert.deepEqual(calls.navigate, []);
  assert.deepEqual(calls.alert, [
    { title: 'Could not open your job', message: 'This isn’t available anymore.' },
  ]);
});

test('n5 · Home wires the own card to openOwnJob, and the route pair is named once, in OWN_JOB_ROUTE', () => {
  const home = stripComments(read('screens/HomeScreen.tsx'));
  assert.match(home, /import \{ openOwnJob \} from '\.\.\/lib\/ownJobCard';/);
  assert.match(home, /import \{ alertAsync \} from '\.\.\/lib\/dialog';/);
  assert.match(home, /import \{ navigateAcrossTabs \} from '\.\.\/lib\/navigationRef';/);
  assert.match(
    home,
    /openOwnJob\(\s*\{ fetchJob: fetchJobById, navigate: navigateAcrossTabs, alert: alertAsync \},\s*job\.id\s*\)/
  );
  // The own card takes this path; every other card keeps the confirmed switch.
  assert.match(home, /onPress=\{\s*isOwn\s*\?[\s\S]*?openOwnJob[\s\S]*?:\s*browseOpenJobs\s*\}/);
  assert.doesNotMatch(home, /Alert\.alert\(/);

  const own = stripComments(read('lib/ownJobCard.ts'));
  assert.match(own, /export const OWN_JOB_ROUTE = \{ tab: 'MyJobs', screen: 'ClientJobDetail' \} as const;/);
  assert.equal((own.match(/'MyJobs'/g) ?? []).length, 1, "'MyJobs' is named once, in OWN_JOB_ROUTE");
  assert.equal((own.match(/'ClientJobDetail'/g) ?? []).length, 1, "'ClientJobDetail' is named once, in OWN_JOB_ROUTE");
  assert.match(own, /deps\.navigate\(OWN_JOB_ROUTE\.tab, OWN_JOB_ROUTE\.screen, \{ job: data \}\)/);
  // Import-free but for types and the one error mapper.
  const runtimeImports = [...own.matchAll(/^import .*$/gm)]
    .map((match) => match[0])
    .filter((line) => !/^import type/.test(line));
  assert.deepEqual(runtimeImports, ["import { userMessage, type ErrorLike } from './errorMessage';"]);
});
