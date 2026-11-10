import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

/**
 * The e2e iOS workflow: Maestro flows on a GitHub macOS runner against an EAS
 * simulator build that already exists. It may never start a build (quota),
 * never submit, never reach Supabase, and consume only the five secrets below.
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

test('e2e iOS never builds, submits or reaches Supabase', () => {
  assert.doesNotMatch(code, /supabase\.co/i);
  // build:list and build:view only read; any other EAS build or submit verb is quota or a release.
  assert.doesNotMatch(code, /\beas(?:-cli(?:@\S+)?)?\s+(?:build(?!:(?:list|view)\b)|submit|workflow:run)/);
  assert.doesNotMatch(code, /\bsubmit\b/);
});

test('e2e iOS runs every flow and always keeps the results', () => {
  assert.match(code, /maestro test \.maestro\/ /);
  assert.doesNotMatch(code, /maestro test[^\n]*\|\|\s*true/, 'a failing flow must fail the job');
  assert.match(code, /- name: Upload results\n\s+if: always\(\)\n\s+uses: actions\/upload-artifact@/);
});
