import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The always-read documents stay small for good (2026-10-06, the token diet). HANDOFF.md holds
// Now / Blocked / Next / Revert only; docs/DECISIONS.md is one line per decision still in force.
// Bytes are counted with CRLF folded to LF, so a Windows checkout and CI agree. A budget is raised
// only by a dated docs/DECISIONS.md entry, never to make this pass: move the oldest material to
// its archive instead (docs/README.md says where each one goes).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGETS = [
  ['HANDOFF.md', 12_000],
  ['docs/DECISIONS.md', 40_000],
];

for (const [file, max] of BUDGETS) {
  test(`${file} stays within ${max} bytes`, () => {
    const size = Buffer.byteLength(readFileSync(join(ROOT, file), 'utf8').replace(/\r\n/g, '\n'));
    assert.ok(size <= max, `${file} is ${size} bytes, over its ${max}-byte budget: move the oldest material to its archive, never raise the budget to pass`);
  });
}

// CLAUDE.md is read into every chat, so it stays under 5,000 bytes; a line starting with @ would
// import another file into every chat too.
test('CLAUDE.md stays under 5,000 bytes, with no line starting with @', () => {
  const text = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n');
  const size = Buffer.byteLength(text);
  assert.ok(size < 5_000, `CLAUDE.md is ${size} bytes; it must stay under 5,000, never raise the limit to pass`);
  const imports = text.split('\n').filter((line) => line.startsWith('@'));
  assert.deepEqual(imports, [], `CLAUDE.md has lines starting with @, which import files into every chat: ${imports.join(' | ')}`);
});
