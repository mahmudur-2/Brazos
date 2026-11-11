import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { RETIRED_PRODUCTION_REF, STAGING_REF } from '../scripts/supabase-ref.mjs';
import {
  FORMAT,
  RULES,
  SECTIONS,
  compare,
  digest,
  formatCompare,
  formatPrint,
  hostedTarget,
  localTarget,
  normalize,
  parseArgs,
} from '../scripts/verify-schema.mjs';

/**
 * Ledger B7: scripts/verify-schema.mjs, the proof that a database is built as the migrations say.
 * Offline: the pure pieces are imported, the CLI is spawned only on saved files and on refusals,
 * which stop before any request. supabase/tests/332_schema_fingerprint.sql proves the SQL reader.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'scripts', 'verify-schema.mjs');

const BODY_MARKER = 'BODY-MARKER-7f3a';
const COMMAND_MARKER = 'COMMAND-MARKER-91c2';

/** A small raw fingerprint, one or two rows per section, shaped like schema_fingerprint(). */
function rawFixture() {
  return {
    server: [{ version_num: 170006 }],
    extensions: [
      { name: 'pg_cron', version: '1.6.4', schema: 'pg_catalog' },
      { name: 'pg_net', version: '0.20.4', schema: 'extensions' },
      { name: 'pgtap', version: '1.3.3', schema: 'extensions' },
    ],
    enums: [{ schema: 'public', name: 'job_status', labels: ['open', 'assigned', 'in_progress', 'completed'] }],
    tables: [
      { name: 'jobs', kind: 'r', rls: true, forced: false, replica_identity: 'd', owner: 'postgres', extension: false },
      { name: 'job_locations', kind: 'r', rls: true, forced: false, replica_identity: 'd', owner: 'postgres', extension: false },
    ],
    columns: [
      { table: 'jobs', name: 'id', type: 'uuid', not_null: true, default: 'gen_random_uuid()', identity: '', generated: '', extension: false },
      { table: 'jobs', name: 'title', type: 'text', not_null: true, default: null, identity: '', generated: '', extension: false },
    ],
    constraints: [{ table: 'jobs', name: 'jobs_pkey', type: 'p', definition: 'PRIMARY KEY (id)', extension: false }],
    indexes: [{ table: 'jobs', name: 'jobs_pkey', definition: 'CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id)', extension: false }],
    functions: [
      {
        identity: 'public.claim_notification_batch(integer)',
        result: 'TABLE(outbox_id uuid)',
        language: 'plpgsql',
        kind: 'f',
        security_definer: true,
        volatility: 'v',
        strict: false,
        config: ['search_path=public, pg_temp'],
        owner: 'postgres',
        extension: false,
        body: `begin -- ${BODY_MARKER}\r\n  return; end`,
      },
    ],
    function_grants: [
      { function: 'public.claim_notification_batch(integer)', grantee: 'service_role', privilege: 'EXECUTE', extension: false },
      { function: 'public.claim_notification_batch(integer)', grantee: 'postgres', privilege: 'EXECUTE', extension: false },
    ],
    table_grants: [
      { table: 'jobs', column: null, grantee: 'authenticated', privilege: 'SELECT', extension: false },
      { table: 'jobs', column: null, grantee: 'postgres', privilege: 'SELECT', extension: false },
    ],
    default_privileges: [
      { role: 'postgres', schema: 'public', type: 'r', grantee: 'service_role', privilege: 'SELECT' },
      { role: 'supabase_admin', schema: 'public', type: 'r', grantee: 'anon', privilege: 'SELECT' },
    ],
    policies: [
      { table: 'jobs', name: 'jobs_select', permissive: 'PERMISSIVE', roles: ['authenticated', 'anon'], command: 'SELECT', using: 'true', check: null },
    ],
    triggers: [{ schema: 'auth', table: 'users', name: 'on_auth_user_created', definition: 'CREATE TRIGGER …', enabled: 'O' }],
    views: [],
    realtime: [
      { publication: 'supabase_realtime', all_tables: false, insert: true, update: true, delete: true, truncate: true },
      { member: 'public.jobs', columns: ['title', 'id'], row_filter: null },
    ],
    schedules: [{ jobname: 'brazos-drain-push', schedule: '* * * * *', command: `select 1; -- ${COMMAND_MARKER}`, active: true }],
    buckets: [{ id: 'avatars', name: 'avatars', public: true, file_size_limit: 5242880, allowed_mime_types: ['image/png', 'image/jpeg'] }],
    storage_policies: [{ table: 'objects', name: 'avatars_read', permissive: 'PERMISSIVE', roles: ['public'], command: 'SELECT', using: 'true', check: null }],
    migrations: [{ version: '20261112000200' }],
  };
}

/** Every array reversed, nested ones included: the same content in another order. */
const reversedDeep = (value) =>
  Array.isArray(value)
    ? [...value].reverse().map(reversedDeep)
    : value !== null && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, Array.isArray(v) && k !== 'labels' ? reversedDeep(v) : v]))
      : value;

const failedNames = (result) => result.sections.filter((s) => !s.pass).map((s) => s.name);

test('there are 19 sections, each with a rule that says why', () => {
  assert.equal(SECTIONS.length, 19);
  for (const name of SECTIONS) {
    assert.equal(typeof RULES[name].why, 'string', name);
    assert.ok(RULES[name].why.length > 0, name);
  }
});

test('the same lines in any order give the same digest', () => {
  const a = normalize(rawFixture());
  const b = normalize(reversedDeep(rawFixture()));
  for (const name of SECTIONS) assert.equal(digest(a[name]), digest(b[name]), name);
  assert.equal(compare(a, b).pass, true);
  assert.equal(formatPrint(a), formatPrint(b));
});

test('enum labels keep their order: a reorder is a difference', () => {
  const changed = rawFixture();
  changed.enums[0].labels = ['assigned', 'open', 'in_progress', 'completed'];
  assert.deepEqual(failedNames(compare(normalize(rawFixture()), normalize(changed))), ['enums']);
});

test('one changed line fails exactly the section that holds it', () => {
  const changed = rawFixture();
  changed.policies[0].using = 'auth.uid() is not null';
  const result = compare(normalize(rawFixture()), normalize(changed));
  assert.equal(result.pass, false);
  assert.deepEqual(failedNames(result), ['policies']);
  const text = formatCompare(result, 'local', 'hosted');
  assert.match(text, /^FAIL {2}policies {2}\(1 only in local, 1 only in hosted\)$/m);
  assert.match(text, /^PASS {2}tables$/m);
  assert.match(text, /^SCHEMA: FAIL \(policies\)$/m);
});

test('a lost realtime member, a lost timer and a changed body each fail their own section', () => {
  const changed = rawFixture();
  changed.realtime = changed.realtime.filter((r) => r.member === undefined);
  changed.schedules = [];
  changed.functions[0].body = 'begin return; end';
  assert.deepEqual(failedNames(compare(normalize(rawFixture()), normalize(changed))), ['functions', 'realtime', 'schedules']);
});

test('what a correct hosted project always has is removed, and the rule says so', () => {
  const hosted = rawFixture();
  hosted.server[0].version_num = 170004; // minor version
  hosted.extensions = hosted.extensions.map((e) => ({ ...e, version: '9.9', schema: 'public' })); // versions, schemas
  hosted.extensions.push({ name: 'pg_graphql', version: '1.5', schema: 'graphql' }); // platform extension
  hosted.extensions = hosted.extensions.filter((e) => e.name !== 'pgtap'); // local test tooling
  hosted.tables[0].owner = 'supabase_admin'; // owner
  hosted.functions[0].owner = 'supabase_admin';
  hosted.functions[0].body = hosted.functions[0].body.replace(/\r/g, ''); // line endings
  hosted.functions.push({ ...rawFixture().functions[0], identity: 'public.ext_fn()', extension: true }); // extension-owned
  hosted.function_grants.push({ function: 'public.claim_notification_batch(integer)', grantee: 'supabase_admin', privilege: 'EXECUTE', extension: false });
  hosted.table_grants = hosted.table_grants.filter((g) => g.grantee !== 'postgres'); // owner grants
  hosted.default_privileges.push({ role: 'supabase_admin', schema: 'public', type: 'f', grantee: 'anon', privilege: 'EXECUTE' });
  hosted.realtime.push({ member: 'realtime.messages', columns: [], row_filter: null }); // platform member
  hosted.policies[0].roles = ['anon', 'authenticated']; // role order
  const result = compare(normalize(rawFixture()), normalize(hosted));
  assert.deepEqual(failedNames(result), []);
  assert.match(RULES.server.why, /minor/);
  assert.match(RULES.extensions.why, /version/);
  assert.match(RULES.tables.why, /owner/);
  assert.match(RULES.function_grants.why, /platform/);
  assert.match(RULES.realtime.why, /outside public/);
});

test('a difference the app owns is never removed: a grant to anon, an extension the schema needs', () => {
  const hosted = rawFixture();
  hosted.table_grants.push({ table: 'jobs', column: null, grantee: 'anon', privilege: 'DELETE', extension: false });
  hosted.extensions = hosted.extensions.filter((e) => e.name !== 'pg_net');
  hosted.server[0].version_num = 150008; // another major
  assert.deepEqual(failedNames(compare(normalize(rawFixture()), normalize(hosted))), ['server', 'extensions', 'table_grants']);
});

test('no function body and no timer command is ever printed', () => {
  const a = normalize(rawFixture());
  const changed = rawFixture();
  changed.functions[0].body += ` ${BODY_MARKER}-2`;
  changed.schedules[0].command += ` ${COMMAND_MARKER}-2`;
  const b = normalize(changed);
  const text = [formatPrint(a), formatCompare(compare(a, b), 'local', 'hosted'), JSON.stringify({ format: FORMAT, sections: a })].join('\n');
  assert.match(text, /FAIL {2}functions/);
  assert.match(text, /FAIL {2}schedules/);
  assert.doesNotMatch(text, new RegExp(BODY_MARKER));
  assert.doesNotMatch(text, new RegExp(COMMAND_MARKER));
});

test('a missing section is an error, never a pass', () => {
  const raw = rawFixture();
  delete raw.realtime;
  assert.throws(() => normalize(raw), /no "realtime" section/);
});

test('hosted: refused outside GitHub Actions, and for the retired project, before any request', () => {
  const staging = `https://${STAGING_REF}.supabase.co`;
  assert.throws(() => hostedTarget({ FINGERPRINT_URL: staging, FINGERPRINT_KEY: 'test-key-not-real' }), /inside GitHub Actions/);
  assert.throws(
    () => hostedTarget({ GITHUB_ACTIONS: 'true', FINGERPRINT_URL: `https://${RETIRED_PRODUCTION_REF}.supabase.co`, FINGERPRINT_KEY: 'test-key-not-real' }),
    /retired project/
  );
  assert.throws(() => hostedTarget({ GITHUB_ACTIONS: 'true', FINGERPRINT_URL: staging, FINGERPRINT_KEY: '' }), /must both be set/);
  assert.throws(() => hostedTarget({ GITHUB_ACTIONS: 'true', FINGERPRINT_URL: `http://${STAGING_REF}.supabase.co`, FINGERPRINT_KEY: 'k' }), /https/);
  assert.deepEqual(hostedTarget({ GITHUB_ACTIONS: 'true', FINGERPRINT_URL: `${staging}/`, FINGERPRINT_KEY: 'placeholder-never-sent' }), {
    url: staging,
    key: 'placeholder-never-sent',
  });
});

test('local: only the local stack', () => {
  assert.deepEqual(localTarget('API_URL="http://127.0.0.1:54321"\nSERVICE_ROLE_KEY="test-key-not-real"\n'), {
    url: 'http://127.0.0.1:54321',
    key: 'test-key-not-real',
  });
  assert.throws(() => localTarget(`API_URL="https://${STAGING_REF}.supabase.co"\nSERVICE_ROLE_KEY="k"\n`), /local stack/);
  assert.throws(() => localTarget(''), /local stack running/);
});

test('arguments: print one source, compare two', () => {
  assert.deepEqual(parseArgs(['print', 'local']), { command: 'print', sources: ['local'], json: false });
  assert.deepEqual(parseArgs(['print', 'local', '--json']), { command: 'print', sources: ['local'], json: true });
  assert.deepEqual(parseArgs(['compare', 'local', 'hosted']), { command: 'compare', sources: ['local', 'hosted'], json: false });
  for (const bad of [[], ['print'], ['compare', 'local'], ['diff', 'local', 'hosted'], ['print', 'a', 'b']]) {
    assert.throws(() => parseArgs(bad), /usage/, bad.join(' '));
  }
});

// ---- the CLI, spawned: exit codes and what it prints ----------------------

const run = (args, env = {}) => {
  const cleanEnv = { ...process.env, ...env };
  delete cleanEnv.GITHUB_ACTIONS;
  if (env.GITHUB_ACTIONS) cleanEnv.GITHUB_ACTIONS = env.GITHUB_ACTIONS;
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: cleanEnv, cwd: root });
};

test('CLI: compare of two saved files exits 0 on PASS and 1 on FAIL; bad usage exits 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-schema-'));
  try {
    const same = join(dir, 'a.json');
    const copy = join(dir, 'b.json');
    const raw = join(dir, 'raw.json');
    const other = join(dir, 'c.json');
    writeFileSync(same, JSON.stringify({ format: FORMAT, sections: normalize(rawFixture()) }));
    writeFileSync(copy, JSON.stringify({ format: FORMAT, sections: normalize(reversedDeep(rawFixture())) }));
    writeFileSync(raw, JSON.stringify(rawFixture()));
    const changed = rawFixture();
    changed.tables[0].rls = false;
    writeFileSync(other, JSON.stringify({ format: FORMAT, sections: normalize(changed) }));

    const pass = run(['compare', same, copy]);
    assert.equal(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, /^SCHEMA: PASS$/m);

    const passRaw = run(['compare', same, raw]);
    assert.equal(passRaw.status, 0, passRaw.stderr);

    const fail = run(['compare', same, other]);
    assert.equal(fail.status, 1, fail.stderr);
    assert.match(fail.stdout, /^FAIL {2}tables {2}\(1 only in a\.json, 1 only in c\.json\)$/m);
    assert.match(fail.stdout, /^SCHEMA: FAIL \(tables\)$/m);

    const printed = run(['print', same]);
    assert.equal(printed.status, 0, printed.stderr);
    assert.equal(printed.stdout.trim().split('\n').length, 21);
    assert.doesNotMatch(printed.stdout, new RegExp(`${BODY_MARKER}|${COMMAND_MARKER}`));

    assert.equal(run([]).status, 2);
    assert.equal(run(['compare', same]).status, 2);
    assert.equal(run(['print', join(dir, 'missing.json')]).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: hosted is refused with exit 2 outside GitHub Actions and for the retired project, printing neither URL nor key', () => {
  const key = 'placeholder-never-printed';
  const outside = run(['print', 'hosted'], { FINGERPRINT_URL: `https://${STAGING_REF}.supabase.co`, FINGERPRINT_KEY: key });
  assert.equal(outside.status, 2);
  assert.match(outside.stderr, /inside GitHub Actions/);

  const retired = run(['print', 'hosted'], {
    GITHUB_ACTIONS: 'true',
    FINGERPRINT_URL: `https://${RETIRED_PRODUCTION_REF}.supabase.co`,
    FINGERPRINT_KEY: key,
  });
  assert.equal(retired.status, 2);
  assert.match(retired.stderr, /retired project/);

  for (const result of [outside, retired]) {
    const text = result.stdout + result.stderr;
    assert.doesNotMatch(text, new RegExp(key));
    assert.doesNotMatch(text, /supabase\.co/);
  }
});
