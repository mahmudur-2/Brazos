import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Tier A (C1) — formatBudget renders cents as two decimals, whole dollars bare
// ---------------------------------------------------------------------------
//
// The 2026-08-30 money walk printed "$107.5", "$92.5" and "$7.5" beside the
// provider's own "$107.50". Money is integer cents formatted ONLY through
// formatBudget() (CLAUDE.md), so this is the one place the rule lives and the
// one fence that holds it: any amount with non-zero cents renders exactly two
// decimals; a whole-dollar amount renders exactly as it did before this run.
// The REAL function is extracted from lib/jobs.ts at test time — the shape
// tests/moneyCeiling.test.mjs established — so what runs is what users see.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const jobsJs = stripTypeScriptTypes(read('lib/jobs.ts'), { mode: 'strip' });
const start = jobsJs.indexOf('export function formatBudget');
const end = jobsJs.indexOf('\n}', start);
assert.ok(start > 0 && end > start, 'formatBudget must exist in lib/jobs.ts');
const { formatBudget } = await import(toDataUrl(jobsJs.slice(start, end + 2)));

test('1 · the walk’s three figures render two decimals', () => {
  assert.equal(formatBudget(10750), '$107.50');
  assert.equal(formatBudget(9250), '$92.50');
  assert.equal(formatBudget(750), '$7.50');
});

test('2 · any non-zero cents render exactly two decimals, thousands grouped', () => {
  assert.equal(formatBudget(5), '$0.05');
  assert.equal(formatBudget(105), '$1.05');
  assert.equal(formatBudget(10755), '$107.55');
  assert.equal(formatBudget(123456), '$1,234.56');
  assert.equal(formatBudget(100001), '$1,000.01');
});

test('3 · whole dollars keep today’s bare form — byte-identical to before this run', () => {
  assert.equal(formatBudget(100000), '$1,000');
  assert.equal(formatBudget(12500), '$125');
  assert.equal(formatBudget(8000), '$80');
  assert.equal(formatBudget(100), '$1');
  assert.equal(formatBudget(0), '$0');
});

test('4 · null is still "No budget set"', () => {
  assert.equal(formatBudget(null), 'No budget set');
});

test('5 · the rule is written once — no toFixed and no second formatter in the money surfaces', () => {
  const jobs = read('lib/jobs.ts');
  assert.equal((jobs.match(/export function formatBudget/g) ?? []).length, 1);
  assert.doesNotMatch(jobs.slice(jobs.indexOf('export function formatBudget')), /toFixed\(/);
});
