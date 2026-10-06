import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

/**
 * Documentation governance. Guards the source-of-truth hierarchy the way the
 * other suites guard product behaviour: mechanically, offline, and without a
 * dependency.
 *
 * WHAT THIS FILE MAY NEVER DO
 * Never satisfy an assertion by deleting a "do not use X" warning. Those
 * warnings are the point — they are how a future session learns that
 * `advance_job_status` does not exist. Every negative assertion below is
 * therefore NEGATION-AWARE: a line may name a retired thing as long as the
 * same line says it is retired. If one of these fails, fix the document's
 * claim or fix this test; do not strip the warning.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(join(root, relativePath), 'utf8');

/**
 * The documents that must be true right now. Archives are deliberately absent:
 * docs/archive/ is history and is exempt from every content rule here, which
 * is exactly what makes archiving a real option rather than a deletion.
 */
const ACTIVE_DOCS = [
  'CLAUDE.md',
  'AGENTS.md',
  'HANDOFF.md',
  'docs/architecture.md',
  'docs/README.md',
  'docs/PROJECT-CHAT.md',
  'BRAZOS_BUILD_STATE.md',
];

/** A line naming a retired thing is fine when the same line retires it. */
const NEGATION =
  /\b(not|never|no longer|deprecated|does not exist|superseded|historical|renamed|retired)\b/i;

const linesOf = (text) => text.split(/\r?\n/);

test('CLAUDE.md still carries the load-bearing literals', () => {
  // The operator's 2026-08-19 unlock edit re-saved CLAUDE.md through an editor
  // that escapes markdown underscores (`transition\_job\_status`). The literals
  // are still present and still load-bearing; fold the escaping away rather
  // than weakening any assertion. CLAUDE.md itself is committed verbatim.
  const claude = read('CLAUDE.md').replace(/\\_/g, '_');

  // The trunk, named as policy rather than as machine state.
  assert.match(claude, /\bmainexpo\b/);

  // The lifecycle contract. accept_offer() assigns; transition_job_status()
  // moves status. Nothing else may.
  assert.match(claude, /transition_job_status/);
  assert.match(claude, /accept_offer/);

  // Exact location lives here and nowhere else.
  assert.match(claude, /job_locations/);

  // The production project ref is the MECHANICAL DENY SENTINEL: tooling greps
  // for this literal to block commands that would touch production. Deleting
  // it from CLAUDE.md silently disarms that guard, so its presence is a test.
  // It is a project identifier, not a credential.
  assert.match(claude, /avkighsiufeefyycbebf/);
});

test('AGENTS.md derives the SDK from package.json instead of pinning one', () => {
  const agents = read('AGENTS.md');

  assert.match(agents, /package\.json/);
  assert.match(agents, /\bSDK\b/i);

  // A hard-coded version or docs URL is how AGENTS.md went stale before: it
  // named an Expo version the repository did not use.
  assert.doesNotMatch(agents, /docs\.expo\.dev/i);
  assert.doesNotMatch(agents, /\bv?5[0-9]\.\d+\.\d+\b/);
});

test('active docs never present a retired name as current architecture', () => {
  const retired = ['advance_job_status', 'job_private_details'];
  const offenders = [];

  for (const doc of ACTIVE_DOCS) {
    linesOf(read(doc)).forEach((line, index) => {
      for (const term of retired) {
        if (line.includes(term) && !NEGATION.test(line)) {
          offenders.push(`${doc}:${index + 1} — ${line.trim()}`);
        }
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    `A retired name appears with no negation on the same line. Fix the CLAIM, ` +
      `never by deleting the warning:\n${offenders.join('\n')}`
  );
});

test('active docs carry no stale-session or blessed-failure language', () => {
  for (const doc of ACTIVE_DOCS) {
    const text = read(doc);

    // A leftover instruction addressed to a past session.
    assert.doesNotMatch(text, /work on v2/i, `${doc} addresses a past session`);

    // "12/13 is green" and its kin. A failing test is a failure.
    assert.doesNotMatch(
      text,
      /\b12\s*\/\s*13\b/,
      `${doc} blesses a tolerated test failure`
    );
  }
});

test('HANDOFF.md claims no authoritative HEAD — that is Git\u2019s job', () => {
  // Matches `HEAD:` and the bolded `**HEAD:**` form the file used to carry —
  // a stamp is a stamp whatever the markdown around it.
  const offenders = linesOf(read('HANDOFF.md'))
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /^\**HEAD\**\s*:/.test(line));

  assert.deepEqual(
    offenders.map(({ number, line }) => `${number}: ${line}`),
    [],
    'HANDOFF.md must not stamp a HEAD: a commit cannot contain its own SHA, ' +
      'so the field is stale the moment it is written. Read git instead.'
  );
});

/**
 * Tracked-secret scan. High-confidence shapes only — a false positive here
 * would train someone to ignore this test, which is worse than not having it.
 * The production project ref is an identifier, not a secret, and is expected
 * in CLAUDE.md.
 */
test('no credential material is tracked in the repository', () => {
  const patterns = [
    { name: 'Stripe secret key', re: /\bsk_(live|test)_[A-Za-z0-9]{16,}/ },
    { name: 'Stripe restricted key', re: /\brk_(live|test)_[A-Za-z0-9]{16,}/ },
    {
      name: 'credential-bearing Postgres URI',
      re: /\bpostgres(ql)?:\/\/[^\s:/@]+:[^\s:/@]+@/,
    },
    {
      // A Supabase service-role JWT: header.payload.signature where the
      // payload decodes to a service_role claim.
      name: 'service-role key material',
      re: /\bey[A-Za-z0-9_-]{10,}\.(ey[A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{20,}/,
    },
  ];

  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);

  // A scan over an empty list passes for the wrong reason. If git ever stops
  // answering here, that is a broken test, not a clean repository.
  assert.ok(
    tracked.length > 100,
    `expected a populated tracked-file list, got ${tracked.length}`
  );

  const findings = [];

  for (const file of tracked) {
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // Unreadable or removed since ls-files; nothing to scan.
    }
    // Binary files read as text produce NUL bytes; skip rather than match noise.
    if (text.includes('\0')) continue;

    for (const { name, re } of patterns) {
      const hit = re.exec(text);
      if (!hit) continue;

      if (name === 'service-role key material') {
        // Only a payload that actually claims service_role counts. Anything
        // else in JWT shape is a publishable key or an example.
        let decoded = '';
        try {
          decoded = Buffer.from(hit[1], 'base64url').toString('utf8');
        } catch {
          continue;
        }
        if (!/service_role/.test(decoded)) continue;
      }

      // Report the file and the pattern class only. Never the value.
      findings.push(`${file} — ${name}`);
    }
  }

  assert.deepEqual(findings, [], `Credential material is tracked:\n${findings.join('\n')}`);
});

test('CI runs the canonical offline check and nothing that needs a secret', () => {
  const workflow = read('.github/workflows/ci.yml');

  assert.match(workflow, /node-version-file:\s*\.nvmrc/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run verify/);

  // Every third-party action pinned to a full 40-hex commit SHA. A tag is
  // mutable; a SHA is not. The trailing "# v7" comment is documentation.
  const uses = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length > 0, 'the workflow uses no actions at all — check the file');

  const unpinned = uses.filter((ref) => !/@[0-9a-f]{40}$/.test(ref));
  assert.deepEqual(unpinned, [], `unpinned action reference(s): ${unpinned.join(', ')}`);

  // The forbidden-surface checks below run against EXECUTABLE YAML only.
  // A comment that says "no EAS here" documents the rule; failing on it would
  // punish writing the rule down, which is the same mistake as deleting a
  // "do not use X" warning to make a test pass.
  const code = linesOf(workflow)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n');

  assert.doesNotMatch(code, /verify-schema/, 'CI must not touch a live database');
  assert.doesNotMatch(code, /\beas\b/i, 'CI must not build or submit through EAS');
  assert.doesNotMatch(code, /secrets\./, 'CI must consume no secrets');
  assert.doesNotMatch(code, /SUPABASE/i);
  assert.doesNotMatch(code, /STRIPE/i);
});

test('pgTAP CI starts only the local stack and needs no secret', () => {
  // The database proof runs in its own workflow because the ci.yml fence
  // above forbids anything Supabase-shaped there — and that fence is never
  // weakened to make room. This one is pgtap.yml's: the same two commands
  // every schema run proves locally, on a stack the runner starts itself,
  // with nothing in reach that could address a remote project.
  let workflow = null;
  try {
    workflow = read('.github/workflows/pgtap.yml');
  } catch {
    workflow = null;
  }
  assert.ok(
    workflow !== null,
    '.github/workflows/pgtap.yml must exist — the database proof has no other home in CI'
  );

  // Every third-party action pinned to a full 40-hex commit SHA, as in ci.yml.
  const uses = [...workflow.matchAll(/^\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length > 0, 'the workflow uses no actions at all — check the file');
  const unpinned = uses.filter((ref) => !/@[0-9a-f]{40}$/.test(ref));
  assert.deepEqual(unpinned, [], `unpinned action reference(s): ${unpinned.join(', ')}`);

  // Executable YAML only, for the same reason as above: the header comment
  // is allowed to name the things it forbids.
  const code = linesOf(workflow)
    .filter((line) => !/^\s*#/.test(line))
    .map((line) => line.replace(/\s+#.*$/, ''))
    .join('\n');

  assert.match(code, /npm run db:reset/, 'the suite must run against a freshly reset local database');
  assert.match(code, /npm run db:test/, 'the pgTAP suite itself must run');

  assert.doesNotMatch(code, /secrets\./, 'pgTAP CI must consume no secrets');
  assert.doesNotMatch(code, /--linked/, 'pgTAP CI must never address a linked remote project');
  assert.doesNotMatch(code, /--db-url/, 'pgTAP CI must never address a database by URL');
  assert.doesNotMatch(code, /--project-ref/, 'pgTAP CI must never name a remote project');
  assert.doesNotMatch(code, /SUPABASE_/, 'no SUPABASE_* name may appear in executable YAML');
  assert.doesNotMatch(code, /STRIPE/i, 'nothing here touches the payment provider');
});

test('.nvmrc names the Node major the suite actually runs on', () => {
  const declared = read('.nvmrc').trim();

  assert.match(declared, /^\d+$/, '.nvmrc should hold a bare major version');
  assert.equal(
    declared,
    process.versions.node.split('.')[0],
    'the runtime executing this suite disagrees with .nvmrc'
  );
});
