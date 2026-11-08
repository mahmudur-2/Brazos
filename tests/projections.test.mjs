import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * Explicit-projection contracts (2026-08-18). The last five runtime
 * `select('*')` calls were replaced with explicit column lists, each provably
 * the module's own declared row type — the rows are cast to that type and
 * every consumer is bound to it by tsc, so the type's keys ARE the consumed
 * set. These tests pin list ⇄ type equality so neither can drift alone, and
 * pin that no runtime `select('*')` creeps back into lib/.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Top-level keys of a flat `export type X = { … }` declaration. */
function typeKeys(source, typeName) {
  const stripped = stripComments(source);
  const start = stripped.indexOf(`export type ${typeName} = {`);
  assert.ok(start >= 0, `type ${typeName} must exist`);
  const end = stripped.indexOf('\n};', start);
  assert.ok(end > start, `type ${typeName} must close`);
  const body = stripped.slice(start, end);
  return [...body.matchAll(/^\s{2}([a-z_]+)\??:/gm)].map((m) => m[1]);
}

/** The string value of `const NAME = '…'` (single- or multi-line concat-free). */
function columnList(source, constName) {
  const match = stripComments(source).match(
    new RegExp(`const ${constName} =\\s*'([^']+)';`)
  );
  assert.ok(match, `${constName} must exist as a single quoted string`);
  return match[1].split(',').map((s) => s.trim());
}

const CONTRACTS = [
  {
    file: 'lib/conversations.ts',
    constName: 'CONVERSATION_COLUMNS',
    typeName: 'Conversation',
    selects: 1,
  },
  // (lib/portfolio.ts's PORTFOLIO_ITEM_COLUMNS left with the portfolio, lean D5.)
  {
    file: 'lib/notificationPrefs.ts',
    constName: 'NOTIFICATION_PREFS_COLUMNS',
    typeName: 'NotificationPrefs',
    selects: 3, // fetch + insert-on-miss returning + update returning
  },
];

for (const { file, constName, typeName, selects } of CONTRACTS) {
  test(`${file}: ${constName} is exactly the ${typeName} type, used at every select`, async () => {
    const src = await read(file);

    const cols = columnList(src, constName);
    const keys = typeKeys(src, typeName);
    assert.deepEqual(
      [...cols].sort(),
      [...keys].sort(),
      `${constName} must list exactly ${typeName}'s keys`
    );
    // Duplicate-free, so a future edit cannot double-select a column.
    assert.equal(new Set(cols).size, cols.length);

    const uses = [...src.matchAll(new RegExp(`\\.select\\(${constName}\\)`, 'g'))];
    assert.equal(uses.length, selects, `every row read in ${file} uses ${constName}`);
  });
}

test('no runtime select(\'*\') remains anywhere in lib/', async () => {
  // The audited inventory (docs/audits/STAGE4D_AUDIT.md) named these five
  // call sites; all were provable and all are now explicit. This sweep keeps
  // the class closed — a new '*' needs a written reason, not a default.
  const files = [
    'lib/conversations.ts',
    'lib/notificationPrefs.ts',
  ];
  for (const file of files) {
    const src = stripComments(await read(file));
    assert.ok(!src.includes(".select('*')"), `${file} must not select('*')`);
    assert.ok(!/\.select\(\)/.test(src), `${file} must not bare-select (implicit '*')`);
  }
});
