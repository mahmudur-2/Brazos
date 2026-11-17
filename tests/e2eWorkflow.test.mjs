import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { buildLine } from '../scripts/e2e-build.mjs';

/**
 * The e2e iOS workflow: Maestro flows on a GitHub macOS runner against an EAS
 * simulator build. It starts a build (metered quota) only when the dispatch sets
 * build_this_commit, never submits, never reaches Supabase, and consumes only the
 * secrets below. The run summary says whether the app was made from this commit.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(root, '.github/workflows/e2e-ios.yml'), 'utf8');

// Executable YAML only: a comment that states a rule must not trip it.
const code = workflow
  .split(/\r?\n/)
  .filter((line) => !/^\s*#/.test(line))
  .map((line) => line.replace(/\s+#.*$/, ''))
  .join('\n');

test('e2e iOS runs on manual dispatch only', () => {
  assert.match(code, /^on:\n  workflow_dispatch:\n    inputs:\n      build_id:/m);
  // D-v3-10: macOS minutes are metered, so no push trigger of any kind.
  const on = code.match(/^on:\n([\s\S]*?)^permissions:/m);
  assert.ok(on, 'no on: block before permissions:');
  assert.doesNotMatch(on[1], /^  push:/m);
  assert.doesNotMatch(code, /^\s*(push|pull_request|pull_request_target|schedule|workflow_run):/m);
  assert.match(code, /runs-on: macos-15$/m);
});

test('e2e iOS installs Maestro from the pinned GitHub release, with retries', () => {
  assert.match(
    code,
    /curl [^\n]*--retry[^\n]*https:\/\/github\.com\/mobile-dev-inc\/maestro\/releases\/download\/cli-\$\{MAESTRO_VERSION\}\/maestro\.zip/
  );
  assert.doesNotMatch(workflow, /get\.maestro\.mobile\.dev/);
});

test('e2e iOS passes the run id to the flows', () => {
  assert.match(code, /^\s+MAESTRO_RUN_ID: \$\{\{ github\.run_id \}\}$/m);
});

test('e2e iOS pins every action to a full SHA with a version comment', () => {
  const uses = [...workflow.matchAll(/^\s*uses:\s*(.+)$/gm)].map((m) => m[1].trim());
  assert.ok(uses.length > 0, 'the workflow uses no actions at all — check the file');
  const unpinned = uses.filter((ref) => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d/.test(ref));
  assert.deepEqual(unpinned, [], `unpinned action reference(s): ${unpinned.join(', ')}`);
});

test('e2e iOS reads only the Expo token, the four Maestro test-account secrets and the artifact key', () => {
  const names = [...new Set([...code.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(names, [
    'ARTIFACT_KEY',
    'EXPO_TOKEN',
    'MAESTRO_E2E_OTP',
    'MAESTRO_E2E_OTP_2',
    'MAESTRO_E2E_PHONE',
    'MAESTRO_E2E_PHONE_2',
  ]);
  assert.match(code, /^permissions:\n  contents: read\n(?!  )/m, 'permissions must be contents: read only');
});

/** One job's block (two-space indent under jobs:), comments removed. */
const job = (name) => code.match(new RegExp(`^  ${name}:\\n((?: {4}.*\\n|[ \\t]*\\n)*)`, 'm'))?.[1] ?? '';

test('e2e iOS builds only when build_this_commit is set, only the e2e-test app, and never submits or reaches Supabase', () => {
  assert.doesNotMatch(code, /supabase\.co/i);
  // build:list and build:view only read; any other EAS build verb is metered quota.
  const builds = [...code.matchAll(/\beas(?:-cli(?:@\S+)?)?\s+(?:build(?!:(?:list|view)\b)|workflow:run)[^\n]*/g)].map((m) => m[0]);
  assert.deepEqual(builds, ['eas-cli@27.7.0 build --platform ios --profile e2e-test --non-interactive --json > "$RUNNER_TEMP/build.json"']);
  assert.ok(job('build').includes(builds[0]), 'the build runs in the build job');
  assert.match(job('build'), /^ {4}if: inputs\.build_this_commit$/m);
  assert.match(code, /^ {6}build_this_commit:\n(?: {8}.*\n)*? {8}type: boolean\n(?: {8}.*\n)*? {8}default: false\n/m);
  assert.doesNotMatch(code, /\bsubmit\b/);
});

test('e2e iOS tests the build it just made, and runs no flow when that build failed', () => {
  const maestro = job('maestro');
  assert.match(maestro, /^ {4}needs: build$/m);
  assert.match(maestro, /^ {4}if: \$\{\{ !cancelled\(\) && \(needs\.build\.result == 'success' \|\| needs\.build\.result == 'skipped'\) \}\}$/m);
  assert.match(maestro, /^ {10}BUILD_ID: \$\{\{ needs\.build\.outputs\.build_id \|\| inputs\.build_id \}\}$/m);
  assert.match(job('build'), /^ {6}build_id: \$\{\{ steps\.build\.outputs\.build_id \}\}$/m);
  assert.match(maestro, /url=\$\(node scripts\/e2e-build\.mjs "\$meta"\)/);
});

const SHA = '0123456789abcdef0123456789abcdef01234567';
const OLD = 'fedcba9876543210fedcba9876543210fedcba98';

test('the summary line says whether the app under test was made from the commit this run tests', () => {
  assert.equal(
    buildLine({ id: 'b-1', gitCommitHash: SHA }, SHA),
    `App under test: EAS build b-1, made from commit ${SHA}. This run tests commit ${SHA}: the same commit, so this run is release evidence.`
  );
  assert.equal(
    buildLine({ id: 'b-1', gitCommitHash: OLD }, SHA),
    `App under test: EAS build b-1, made from commit ${OLD}. This run tests commit ${SHA}: NOT the same commit, so the flows test an older app: this run is compatibility evidence, not release evidence.`
  );
  // A short hash is not the commit: no guess.
  assert.match(buildLine({ id: 'b-1', gitCommitHash: SHA.slice(0, 7) }, SHA), /: NOT the same commit, /);
  for (const gitCommitHash of [undefined, null, '']) {
    assert.equal(
      buildLine({ id: 'b-1', gitCommitHash }, SHA),
      `App under test: EAS build b-1; EAS did not report the commit it was made from. This run tests commit ${SHA}; the two cannot be compared, so this run is compatibility evidence, not release evidence.`
    );
  }
  // F15: "release evidence" only for a build of this very commit.
  assert.doesNotMatch(buildLine({ id: 'b-1', gitCommitHash: SHA.slice(0, 7) }, SHA), /is release evidence/);
});

test('e2e-build.mjs prints the archive URL, writes the line to the run summary, and stops on an unfinished build', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brazos-e2e-'));
  const summary = join(dir, 'summary');
  writeFileSync(summary, '');
  const build = { id: 'b-1', status: 'FINISHED', isForIosSimulator: true, gitCommitHash: SHA, artifacts: { applicationArchiveUrl: 'https://example.com/app.tar.gz' } };
  const runWith = (answer) => {
    const meta = join(dir, 'build.json');
    writeFileSync(meta, JSON.stringify(answer));
    return spawnSync(process.execPath, [join(root, 'scripts/e2e-build.mjs'), meta], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GITHUB_SHA: SHA, GITHUB_STEP_SUMMARY: summary },
    });
  };
  const listed = runWith([build]);
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout, 'https://example.com/app.tar.gz\n');
  assert.equal(readFileSync(summary, 'utf8'), `${buildLine(build, SHA)}\n\n`);
  assert.equal(runWith({ ...build, status: 'ERRORED' }).status, 1);
  assert.equal(runWith([]).status, 1);
});

test('e2e iOS runs every flow and always keeps the results', () => {
  // Run 37: one maestro invocation per flow, so a dead driver or a red flow never hides the rest.
  assert.match(code, /for flow in \.maestro\/\[0-9\]\[0-9\]-\*\.yml; do/);
  assert.match(code, /maestro test "\$flow" /);
  assert.match(code, /\[ "\$rc" -eq 0 \] \|\| status=1/, 'a red flow must still fail the job');
  assert.doesNotMatch(code, /maestro test[^\n]*\|\|\s*true/, 'a failing flow must fail the job');
  assert.match(code, /- name: Upload results\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@/);
});

test('FLOW-R3b · e2e iOS uploads in plain only the probe pictures, for one day; every other upload is the encrypted bundle', () => {
  const uploads = [...code.matchAll(/uses: actions\/upload-artifact@\S+\n {8}with:\n((?: {10}.*\n)+)/g)].map((m) => m[1]);
  assert.deepEqual(uploads.map((w) => w.match(/^ {10}path: (.+)$/m)?.[1]), ['e2e-results.tar.gpg', '|']);
  const plain = uploads[1];
  // Each plain path ends in the pictures' own name, so no other file can match. Four places, because the folder of a
  // takeScreenshot file depends on Maestro's version: the run folder, the flows folder, the debug tree, ~/.maestro/tests.
  assert.deepEqual(
    plain.split('\n').filter((line) => /^ {12}\S/.test(line)).map((line) => line.trim()),
    ['probe-plain-*.png', '.maestro/**/probe-plain-*.png', 'e2e-debug/**/probe-plain-*.png', '~/.maestro/tests/**/probe-plain-*.png']
  );
  // Two of the four places lie under a dot folder, which the upload action skips unless it is told not to.
  assert.match(plain, /^ {10}include-hidden-files: true$/m);
  assert.match(plain, /^ {10}name: e2e-probe-plain$/m);
  assert.match(plain, /^ {10}if-no-files-found: ignore$/m);
  assert.match(plain, /^ {10}retention-days: 1$/m);
  // Directly after the encrypted upload, with the same pinned action, and it can never fail the job.
  const after = code.slice(code.indexOf('- name: Upload results') + 1);
  assert.match(after.slice(after.indexOf('- name: ')), /^- name: Upload the plain probe pictures\n {8}if: always\(\)\n {8}continue-on-error: true\n {8}uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02\n/);
});
