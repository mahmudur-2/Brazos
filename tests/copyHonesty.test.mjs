import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The product has no AI router and no matching engine, so no surface may
// claim one (F-007; CLAUDE.md: AI screens and every LLM dependency are out
// of scope, and marketplace data is never invented). The scan covers file
// text, comments included: a comment describing a "smart-matching mark" is
// exactly how the shipped label drifted in.
const SCAN_DIRS = ['components', 'hooks', 'lib', 'modes', 'navigation', 'screens', 'ui'];

function* walk(dir) {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) {
      yield* walk(rel);
    } else if (/\.tsx?$/.test(entry) && !/\.web\.tsx?$/.test(entry)) {
      yield rel;
    }
  }
}

test('no screen, component, or lib file carries match or AI language', () => {
  const offenders = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      const source = readFileSync(join(root, file), 'utf8');
      if (/smart[\s-]?matching/i.test(source)) offenders.push(`${file}: smart matching`);
      if (/matching is on/i.test(source)) offenders.push(`${file}: matching is on`);
      // Uppercase word "AI" — the acronym, not letters inside a word.
      if (/\bAI\b/.test(source)) offenders.push(`${file}: AI`);
    }
  }
  assert.deepEqual(offenders, []);
});
