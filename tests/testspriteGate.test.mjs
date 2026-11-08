import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';

/**
 * The TestSprite gate (lean E6): contract tests of the nine server functions,
 * run from outside against staging, and the workflow that runs them. Offline:
 * reads files as text, never calls TestSprite or Supabase.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8').replace(/\r\n/g, '\n');
const WORKFLOW = '.github/workflows/testsprite.yml';
const SUITE = 'tests/testsprite';

const functionNames = readdirSync(join(root, 'supabase/functions'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort();

const suiteFiles = existsSync(join(root, SUITE))
  ? readdirSync(join(root, SUITE)).filter((name) => name.endsWith('.py')).sort()
  : [];

/** Executable YAML only: a comment may name what it forbids. */
const codeOf = (yaml) =>
  yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n');

test('the TestSprite workflow exists', () => {
  assert.ok(existsSync(join(root, WORKFLOW)), `${WORKFLOW} must exist`);
});

test('it triggers only on a manual dispatch and on server-function pushes to mainexpo', () => {
  const code = codeOf(read(WORKFLOW));
  const onBlock = code.match(/^on:\n((?:[ ].*\n|\n)*)/m)?.[1].trim();
  assert.equal(
    onBlock,
    [
      'workflow_dispatch:',
      '  push:',
      '    branches: [mainexpo]',
      '    paths:',
      "      - 'supabase/functions/**'",
      "      - 'tests/testsprite/**'",
      "      - '.github/workflows/testsprite.yml'",
    ].join('\n')
  );
});

test('every action is pinned to a full commit SHA with a version comment', () => {
  const lines = read(WORKFLOW).split('\n').filter((line) => /^\s*-?\s*uses:/.test(line));
  assert.ok(lines.length > 0, 'the workflow uses no actions at all: check the file');
  const unpinned = lines.filter((line) => !/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\s*$/.test(line));
  assert.deepEqual(unpinned, [], `unpinned action reference(s):\n${unpinned.join('\n')}`);
});

test('it reads exactly one secret, TESTSPRITE_API_KEY, and carries no secret-shaped text', () => {
  const text = read(WORKFLOW);
  const secrets = [...new Set([...codeOf(text).matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))];
  assert.deepEqual(secrets, ['TESTSPRITE_API_KEY']);
  for (const forbidden of ['supabase.co', 'sk_', 'eyJ', 'whsec_']) {
    assert.ok(!text.includes(forbidden), `${WORKFLOW} contains ${forbidden}`);
  }
});

test('it is read-only, bounded, and gates on the pinned CLI with a JUnit report', () => {
  const code = codeOf(read(WORKFLOW));
  assert.match(code, /^permissions:\n {2}contents: read\n/m);
  assert.match(code, /timeout-minutes: 20\b/);
  assert.match(code, /@testsprite\/testsprite-cli@0\.15\.0\b/);
  assert.doesNotMatch(code, /testsprite-cli@latest/);
  // The run line is a folded scalar: take it up to the next step.
  const run = (code.match(/testsprite-cli@0\.15\.0 ci run[\s\S]*?(?=\n\s*- name:)/)?.[0] ?? '').replace(/\s+/g, ' ');
  for (const flag of ['--env staging', '--report junit', '--report-file testsprite-junit.xml', '--fail-on-skipped']) {
    assert.ok(run.includes(flag), `ci run is missing ${flag}: ${run}`);
  }
  assert.match(code, /path: testsprite-junit\.xml/);
});

test('the suite has one contract test per server function, all nine', () => {
  assert.equal(functionNames.length, 9, `expected nine server functions, found ${functionNames.join(', ')}`);
  assert.deepEqual(suiteFiles, functionNames.map((name) => `${name}.py`));
});

test('every contract test targets staging through STAGING_REF and cannot pass vacuously', () => {
  const baseLine = `BASE_URL = "https://${STAGING_REF}.supabase.co/functions/v1"`;
  for (const file of suiteFiles) {
    const code = read(`${SUITE}/${file}`);
    const name = file.replace(/\.py$/, '');
    assert.ok(code.includes(baseLine), `${file} must build its URL from STAGING_REF (${baseLine})`);
    assert.ok(code.includes(`URL = f"{BASE_URL}/${name}"`), `${file} must target its own function`);
    assert.equal(code.split('\n').filter((line) => line.startsWith('BASE_URL =')).length, 1, file);
    // TestSprite runs the file top to bottom; the final assert is what makes a failure visible.
    assert.match(code, /\nassert not failures, "\\n"\.join\(failures\)\n$/, `${file} must end on the failures assert`);
    assert.ok((code.match(/^(\w+ = )?check\(/gm) ?? []).length >= 4, `${file} needs at least four checks`);
  }
});

test('no contract test holds a secret-shaped string or the production ref', () => {
  const shapes = [
    /\b[sr]k_(live|test)_[A-Za-z0-9]{8,}/,
    /whsec_[A-Za-z0-9]{8,}/,
    /\bey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}\./,
    /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/,
  ];
  for (const file of [...suiteFiles, 'README.md']) {
    const text = read(`${SUITE}/${file}`);
    assert.ok(!text.includes(PRODUCTION_REF), `${file} names the production project`);
    for (const shape of shapes) assert.doesNotMatch(text, shape, `${file} holds a secret-shaped string`);
  }
});

test('docs/TESTING.md documents the contract tests', () => {
  assert.match(read('docs/TESTING.md'), /^## \d+\. Server-function contract tests \(TestSprite\)$/m);
});
