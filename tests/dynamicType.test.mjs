import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Fix run E5 — DYNAMIC TYPE. A box that holds text takes a FLOOR (minHeight),
// never a fixed height, so a label set large in iOS Settings grows its box
// instead of clipping; and no text opts out of scaling outright. The inbox
// filter pills keep their measured `height` on purpose (tests/chatComposer).
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('E5: the auth buttons are floors, and their label may take a second line', () => {
  const button = stripComments(read('components/AuthButton.tsx'));
  assert.doesNotMatch(button, /\bheight: authSizes\./, 'an auth button never fixes its height');
  assert.match(button, /minHeight: authSizes\.button,/);
  assert.match(button, /minHeight: authSizes\.heroButton,/);
  assert.match(button, /minHeight: authSizes\.heroLink,/);
  assert.match(button, /numberOfLines=\{2\}/);
});

test('E5: the inbox row chips and badge, and the Filters pill, are floors', () => {
  const row = stripComments(read('components/ConversationRow.tsx'));
  for (const style of ['line', 'badge', 'more', 'chip']) {
    const block = new RegExp(`\\n\\s+${style}: \\{([^}]*)\\}`).exec(row)?.[1] ?? '';
    assert.doesNotMatch(block, /\bheight:/, `ConversationRow ${style} must not fix its height`);
    assert.match(block, /minHeight:/, `ConversationRow ${style} carries a floor`);
  }
  assert.match(stripComments(read('components/JobFilterSheet.tsx')), /minHeight: PILL_HEIGHT,/);
});

test('E5: no text in the app refuses to scale (maxFontSizeMultiplier={1})', () => {
  const offenders = ['screens', 'components', 'ui']
    .flatMap((dir) =>
      readdirSync(join(root, dir), { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
        .map((entry) => relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/')),
    )
    .filter((path) => /maxFontSizeMultiplier=\{1\}/.test(read(path)));
  assert.deepEqual(offenders, []);
});
