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

test('e2e iOS runs on dispatch and on pushes to mainexpo that touch the flows', () => {
  assert.match(code, /^on:\n  workflow_dispatch:\n    inputs:\n      build_id:/m);
  assert.match(
    code,
    /^  push:\n    branches: \[mainexpo\]\n    paths:\n      - '\.maestro\/\*\*'\n      - '\.github\/workflows\/e2e-ios\.yml'\n(?!      -)/m
  );
  assert.doesNotMatch(code, /^\s*(pull_request|pull_request_target|schedule|workflow_run):/m);
  assert.match(code, /runs-on: macos-15$/m);
});

test('e2e iOS pins every action to a full SHA with a version comment', () => {
  const uses = [...workflow.matchAll(/^\s*uses:\s*(.+)$/gm)].map((m) => m[1].trim());
  assert.ok(uses.length > 0, 'the workflow uses no actions at all — check the file');
  const unpinned = uses.filter((ref) => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d/.test(ref));
  assert.deepEqual(unpinned, [], `unpinned action reference(s): ${unpinned.join(', ')}`);
});

test('e2e iOS reads only the Expo token and the four Maestro test-account secrets', () => {
  const names = [...new Set([...code.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(names, [
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
