import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RETIRED_PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';

// The Production button's shape (.github/workflows/production.yml), pinned as text: no YAML
// library, no new dependency. Its logic lives in scripts/production-deploy.mjs and is tested in
// tests/productionDeploy.test.mjs; this file proves the workflow around it keeps the safety rules.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const PRODUCTION = read('.github/workflows/production.yml');
const STAGING = read('.github/workflows/staging.yml');
const SECRET_JOBS = ['plan', 'apply'];
const SEVEN = [
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_DB_PASSWORD',
  'STRIPE_SECRET_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
];

/** Executable YAML only: whole-line comments and trailing ` # ...` comments removed. */
const code = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n');

/** The top-level block that starts at `name:` (two-space indent under `jobs:`), as text. */
function jobs(text) {
  const lines = code(text).split('\n');
  const start = lines.findIndex((line) => line === 'jobs:');
  assert.ok(start >= 0, 'no jobs: block');
  const out = {};
  let name = null;
  for (const line of lines.slice(start + 1)) {
    const header = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (header) {
      name = header[1];
      out[name] = '';
      continue;
    }
    if (/^\S/.test(line)) break;
    if (name) out[name] += `${line}\n`;
  }
  return out;
}

/** The steps of one job, each as text, in order. */
const steps = (jobText) => jobText.split(/^ {6}- /m).slice(1);
const stepId = (stepText) => stepText.match(/^\s*id:\s*(\S+)/m)?.[1] ?? null;
const runText = (stepText) => {
  const m = stepText.match(/^ {8}run:\s*\|\n((?: {10}.*\n?|\s*\n)*)/m) ?? stepText.match(/^ {8}run:\s*(.+)$/m);
  return m ? m[1] : null;
};

const P = jobs(PRODUCTION);

test('workflow_dispatch is the only trigger', () => {
  const on = code(PRODUCTION).match(/^on:\n((?: .*\n)*)/m)?.[1];
  assert.ok(on, 'no on: block');
  const triggers = [...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(triggers, ['workflow_dispatch']);
  assert.match(on, /allow_destructive:\n(?: {8}.*\n)*? {8}type: boolean/);
  assert.match(on, /default: false/);
});

test('least permissions: read only, nothing writes', () => {
  assert.match(code(PRODUCTION), /^permissions:\n {2}contents: read\n/m);
  assert.doesNotMatch(code(PRODUCTION), /:\s*write\b/, 'no permission may be write');
  for (const name of SECRET_JOBS) {
    assert.match(P[name], /^ {4}permissions:\n {6}contents: read\n {6}actions: read\n/m, `${name} permissions`);
  }
});

test('one run at a time, never cancelled half-way', () => {
  assert.match(code(PRODUCTION), /^concurrency:\n {2}group: production-pipeline\n {2}cancel-in-progress: false/m);
});

test('the jobs and their order: verify, local, plan after verify, apply after plan and local', () => {
  assert.deepEqual(Object.keys(P), ['verify', 'local', 'plan', 'apply']);
  assert.match(P.plan, /^ {4}needs: verify$/m);
  assert.match(P.apply, /^ {4}needs: \[plan, local\]$/m);
  assert.match(P.plan, /^ {4}timeout-minutes: 15$/m);
  assert.match(P.apply, /^ {4}timeout-minutes: 30$/m);
});

test('every job that holds a production secret runs in the production environment', () => {
  for (const [name, text] of Object.entries(P)) {
    const holds = /secrets\./.test(text);
    const inProduction = /^ {4}environment: production$/m.test(text);
    if (SECRET_JOBS.includes(name)) {
      assert.ok(holds && inProduction, `${name} must hold secrets inside environment production`);
    } else {
      assert.equal(holds, false, `${name} holds a secret`);
      assert.equal(inProduction, false, `${name} needs no environment`);
    }
  }
});

test('actions: GitHub’s own only, pinned by full SHA, the same SHAs staging uses', () => {
  const uses = [...code(PRODUCTION).matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 6);
  for (const ref of uses) {
    assert.match(ref, /^actions\/[a-z-]+@[0-9a-f]{40}$/, `${ref} is not a GitHub action pinned by SHA`);
  }
  const stagingPins = new Map(
    [...code(STAGING).matchAll(/uses:\s*(actions\/[a-z-]+)@([0-9a-f]{40})/g)].map((m) => [m[1], m[2]])
  );
  for (const ref of uses) {
    const [action, sha] = ref.split('@');
    if (stagingPins.has(action)) assert.equal(sha, stagingPins.get(action), `${action} differs from staging.yml`);
  }
});

test('secrets reach a step through env only, by their own name, never inside run text', () => {
  const text = code(PRODUCTION);
  for (const line of text.split('\n').filter((l) => l.includes('secrets.'))) {
    const m = line.match(/^ {10}([A-Z_]+): \$\{\{ secrets\.([A-Z_]+) \}\}$/);
    assert.ok(m, `secret outside a step env mapping: ${line.trim()}`);
    assert.equal(m[1], m[2], `${m[2]} is renamed to ${m[1]}`);
    assert.ok(SEVEN.includes(m[2]), `${m[2]} is not one of the seven secrets`);
  }
  for (const name of SEVEN) assert.match(text, new RegExp(`secrets\\.${name}\\b`), `${name} is never used`);
  // No expression is ever expanded into shell text: inputs and outputs arrive through env too.
  for (const [name, job] of Object.entries(P)) {
    for (const step of steps(job)) {
      const run = runText(step);
      if (run !== null) assert.doesNotMatch(run, /\$\{\{/, `${name}: an expression inside run text`);
    }
  }
});

test('every run block starts with set -euo pipefail', () => {
  for (const [name, job] of Object.entries(P)) {
    for (const step of steps(job)) {
      const run = runText(step);
      if (run === null) continue;
      assert.match(run, /^\s*set -euo pipefail\n/, `${name}: a run block without set -euo pipefail`);
    }
  }
});

test('a job holding a secret never installs packages or runs code from node_modules', () => {
  for (const name of SECRET_JOBS) {
    const runs = steps(P[name]).map(runText).filter(Boolean).join('\n');
    assert.doesNotMatch(runs, /\bnpm\b/, `${name} runs npm`);
    assert.doesNotMatch(runs, /node_modules/, `${name} touches node_modules`);
    assert.doesNotMatch(P[name], /cache: npm/, `${name} restores an npm cache`);
    for (const npx of runs.match(/\bnpx\b[^\n]*/g) ?? []) {
      assert.match(npx, /^npx --yes supabase@2\.116\.0 /, `${name}: an unpinned npx call: ${npx}`);
    }
  }
});

test('the local job builds the fingerprint without any secret and hands it over as an artifact', () => {
  const local = P.local;
  assert.match(local, /npm ci/);
  assert.match(local, /npx supabase start/);
  assert.match(local, /npm run db:reset/);
  assert.match(local, /node scripts\/verify-schema\.mjs print local --json > local-fingerprint\.json/);
  assert.match(local, /uses: actions\/upload-artifact@[0-9a-f]{40}\n {8}with:\n {10}name: local-fingerprint\n/);
  assert.match(local, /if-no-files-found: error/);
  assert.match(local, /if: always\(\)\n {8}run: \|\n {10}set -euo pipefail\n {10}npx supabase stop --no-backup/);
  assert.doesNotMatch(local, /--linked|--db-url|--project-ref|SUPABASE_/);
  assert.match(P.apply, /uses: actions\/download-artifact@[0-9a-f]{40}\n {8}with:\n {10}name: local-fingerprint\n/);
});

const ids = (job) => steps(job).map(stepId);

test('plan reads and changes nothing; apply applies only after the plan check', () => {
  assert.deepEqual(ids(P.plan).filter(Boolean), ['guards', 'status', 'keys', 'link', 'list', 'plan', 'summary']);
  assert.doesNotMatch(P.plan, /db push|functions deploy|production-deploy\.mjs (secrets|webhook|vault|auth)\b/);
  assert.deepEqual(ids(P.apply).filter(Boolean), [
    'download',
    'guards',
    'status',
    'keys',
    'link',
    'list_before',
    'check',
    'push',
    'list_after',
    'fingerprint',
    'deploy',
    'functions_list',
    'secrets',
    'webhook',
    'vault',
    'smoke_push',
    'smoke_status',
    'smoke_webhook',
    'timers',
    'auth',
    'summary',
  ]);
  // The schema compare is a hard gate: nothing in apply may continue past a failure.
  assert.doesNotMatch(P.apply, /continue-on-error/);
  // The workflow names no migration file and no count of them: more files land after it.
  assert.doesNotMatch(PRODUCTION, /\d{14}_|migrations\/[\w-]+\.sql/);
  const check = steps(P.apply).find((s) => stepId(s) === 'check');
  assert.match(check, /PLAN_CODE: \$\{\{ needs\.plan\.outputs\.plan_code \}\}/);
  assert.match(P.plan, /^ {4}outputs:\n {6}plan_code: \$\{\{ steps\.plan\.outputs\.plan_code \}\}/m);
  for (const job of [P.plan, P.apply]) {
    const summary = steps(job).find((s) => stepId(s) === 'summary');
    assert.match(summary, /if: always\(\)/);
    assert.match(summary, /STEPS_JSON: \$\{\{ toJSON\(steps\) \}\}/);
  }
  // Guards come first in both jobs (after checkout, Node and the artifact download).
  for (const job of [P.plan, P.apply]) {
    const all = ids(job);
    assert.ok(all.indexOf('guards') < all.indexOf('status'));
  }
});

test('the destructive switch reaches the plan and the check the way staging passes it', () => {
  const expr = "ALLOW_DESTRUCTIVE: ${{ inputs.allow_destructive == true && 'true' || 'false' }}";
  assert.ok(STAGING.includes(expr), 'staging.yml no longer passes the switch this way');
  for (const [job, id] of [
    [P.plan, 'plan'],
    [P.apply, 'check'],
  ]) {
    assert.ok(steps(job).find((s) => stepId(s) === id).includes(expr), `${id} lacks ALLOW_DESTRUCTIVE`);
  }
});

test('no project ref is written into the workflow; it arrives as a secret', () => {
  for (const text of [PRODUCTION, STAGING]) {
    assert.equal(text.includes(RETIRED_PRODUCTION_REF), false);
    assert.equal(text.includes(STAGING_REF), false);
  }
});

const S = jobs(STAGING);

test('staging proves the same tools first: a secretless local job and a prove report', () => {
  assert.deepEqual(Object.keys(S), ['verify', 'migrate', 'deploy', 'local', 'prove']);
  assert.match(S.migrate, /npx --yes supabase@2\.116\.0 db push/, 'the migrate job keeps applying');
  assert.doesNotMatch(S.local, /secrets\.|environment:/);
  assert.match(S.prove, /^ {4}needs: \[migrate, local\]$/m);
  assert.match(S.prove, /^ {4}environment: staging$/m);
  assert.match(S.prove, /^ {4}continue-on-error: true$/m);
  assert.deepEqual(ids(S.prove).filter(Boolean), ['download', 'fingerprint', 'summary']);
  assert.match(S.prove, /node scripts\/production-deploy\.mjs summary prove/);
  assert.doesNotMatch(S.prove, /\bnpm\b|db push|set_drain|production-deploy\.mjs (secrets|webhook|vault|auth|guards|timers)\b/);
});

test('the old one-line rule is gone from the workflow comments', () => {
  assert.doesNotMatch(STAGING, /PRODUCTION IS NEVER AUTOMATED/);
  assert.doesNotMatch(STAGING, /THREE ORDERED JOBS|THREE JOBS, STRICTLY ORDERED/);
  assert.match(read('.github/workflows/pgtap.yml'), /production\.yml/);
});
