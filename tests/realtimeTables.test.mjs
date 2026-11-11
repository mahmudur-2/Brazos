import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/**
 * Ledger B6. The tables the app subscribes to with `postgres_changes` must be exactly the tables a
 * migration adds to the supabase_realtime publication. A database built from the files had none, so
 * every live list was silent on a fresh project; a new subscription to a table no migration publishes
 * would be silent the same way. supabase/tests/330_realtime_publication.sql proves the database side.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

/** Every app source file: the repo's .ts/.tsx outside tooling, tests, types and the edge functions. */
const SKIP_DIRS = new Set(['node_modules', '_archive', 'supabase', 'types', 'tests', 'scripts', 'ios', 'android', 'dist', 'build', 'docs']);
function appSources(dir = '') {
  const files = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const relativePath = dir === '' ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      files.push(...appSources(relativePath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(relativePath);
    }
  }
  return files;
}

const stripTsComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const stripSqlComments = (source) => source.replace(/--[^\n]*/g, '');

function appSubscriptions() {
  const tables = new Set();
  const sites = [];
  let literals = 0;
  for (const file of appSources()) {
    const code = stripTsComments(read(file));
    literals += [...code.matchAll(/['"]postgres_changes['"]/g)].length;
    for (const call of code.matchAll(/['"]postgres_changes['"]\s*,\s*\{([^}]*)\}/g)) {
      const table = call[1].match(/\btable:\s*['"](\w+)['"]/)?.[1];
      const schema = call[1].match(/\bschema:\s*['"](\w+)['"]/)?.[1];
      if (table && schema === 'public') {
        tables.add(table);
        sites.push(`${file}: ${table}`);
      }
    }
  }
  return { tables, sites, literals };
}

const MIGRATIONS = 'supabase/migrations';
function publishedByMigrations() {
  const tables = new Set();
  for (const name of readdirSync(join(root, MIGRATIONS)).filter((n) => n.endsWith('.sql')).sort()) {
    const sql = stripSqlComments(read(`${MIGRATIONS}/${name}`));
    for (const m of sql.matchAll(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+(?:only\s+)?public\.(\w+)/gi)) {
      tables.add(m[1].toLowerCase());
    }
  }
  return tables;
}

test('every postgres_changes subscription names a public table literally', () => {
  const { sites, literals } = appSubscriptions();
  // The sweep must be finding the call sites; a rename that emptied it would pass silently.
  assert.ok(sites.length >= 13, `expected the 13 known subscriptions, saw ${sites.length}`);
  assert.equal(
    sites.length,
    literals,
    'a postgres_changes subscription whose table is not a literal public table cannot be checked against the publication'
  );
});

test('the app subscribes to exactly the tables a migration publishes', () => {
  const app = [...appSubscriptions().tables].sort();
  const published = [...publishedByMigrations()].sort();
  assert.deepEqual(app, ['job_offers', 'jobs', 'messages']);
  assert.deepEqual(
    published,
    app,
    'a table the app listens to must be added to supabase_realtime by a migration, and nothing else may be'
  );
});

test('the exact address is never published or subscribed to', () => {
  assert.ok(!appSubscriptions().tables.has('job_locations'));
  assert.ok(!publishedByMigrations().has('job_locations'));
});

test('the publication migration is safe to run twice: each add sits behind its own check', () => {
  const sql = stripSqlComments(read(`${MIGRATIONS}/20261112000000_realtime_publication.sql`));
  const adds = [...sql.matchAll(/alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.(\w+)/gi)];
  assert.equal(adds.length, 3);
  let from = 0;
  for (const add of adds) {
    const guard = sql.slice(from, add.index);
    assert.match(guard, /if\s+not\s+exists\s*\(/i, `${add[1]}: no not-exists check before the add`);
    assert.match(guard, /pg_publication_tables/i, `${add[1]}: the check does not read pg_publication_tables`);
    assert.match(guard, new RegExp(`tablename\\s*=\\s*'${add[1]}'`, 'i'), `${add[1]}: the check names another table`);
    from = add.index + add[0].length;
  }
  assert.doesNotMatch(sql, /replica\s+identity/i, 'B6 changes no replica identity');
  assert.doesNotMatch(sql, /\bdrop\s+table\b/i);
});
