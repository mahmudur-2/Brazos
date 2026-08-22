// tests/safety.test.mjs -- canary coverage for the agent-safety guard.
//
// NO REAL COMMAND IS EVER EXECUTED HERE. Every payload below is an inert
// string handed to the guard on stdin; the guard is a pure text classifier and
// the assertions look at nothing but its exit code.
//
// PLATFORM GATE, THREE-WAY, evaluated inside the suite body -- never at module
// scope, because a module-level throw would fail the suite before the gate
// could run:
//   1. not win32                   -> the whole suite SKIPS. `npm test` stays
//                                     green on ubuntu-latest.
//   2. win32, no powershell.exe    -> FAIL HARD. On the target machine an
//                                     unresolvable PowerShell means
//                                     enforcement cannot run at all, and that
//                                     must never present as a green skip.
//   3. win32, powershell.exe found -> run every canary.
//
// GUARD RESOLUTION is dynamic: guard.v2.ps1 when it exists, else guard.ps1.
// Arming renames v2 over the registered path, so the same suite proves the
// staged guard before the swap and the ARMED guard after it. v2 present is the
// PRE-ARM phase signal; v2 absent means ARMED.

import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const GUARD_V2 = path.join(REPO, '.claude', 'hooks', 'guard.v2.ps1');
const GUARD_V1 = path.join(REPO, '.claude', 'hooks', 'guard.ps1');
const SESSION_CONTEXT = path.join(REPO, '.claude', 'hooks', 'session-context.ps1');
const SETTINGS = path.join(REPO, '.claude', 'settings.json');

// Phase signal, computed once and reused. fs only -- no PowerShell at module
// scope.
const PRE_ARM = fs.existsSync(GUARD_V2);
const GUARD = PRE_ARM ? GUARD_V2 : GUARD_V1;
const PHASE = PRE_ARM ? 'PRE-ARM' : 'ARMED';
const ARMED_ONLY_SKIP = PRE_ARM
  ? 'armed-state assertion: settings.json is still pre-arming at this checkpoint'
  : false;

const IS_WIN = process.platform === 'win32';
const PLATFORM_SKIP = IS_WIN
  ? false
  : `platform gate: ${process.platform} is not win32, enforcement is Windows-only`;

// Local system-clock date, matching the audit report path built by the run.
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const REPORT_PATH = `docs/audits/HARDENING_RUN_B_${TODAY}.md`;

// Formerly locked screens. CLAUDE.md's "Locked -- never modify" list was
// emptied by the operator 2026-08-19 for the Prestige dark sweep, and the
// guard's locked-screen check was disabled in the same edit. These paths now
// pin the UNLOCK: every one of them must edit freely, and a regression back
// to blocking is a failure of the guard, not of the screen.
const UNLOCKED_SCREENS = [
  'screens/LaunchScreen.tsx',
  'screens/WelcomeScreen.tsx',
  'screens/SignInScreen.tsx',
  'screens/EmailSignInScreen.tsx',
  'screens/CreateAccountScreen.tsx',
  'screens/EmailCreateAccountScreen.tsx',
  'screens/VerifyPhoneScreen.tsx',
  'screens/SetupScreen.tsx',
  'screens/LegalGateScreen.tsx',
  'screens/HomeScreen.tsx',
];

function resolvePowerShell() {
  const candidates = ['powershell.exe'];
  const sysRoot = process.env.SystemRoot || process.env.windir;
  if (sysRoot) {
    candidates.push(
      path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    );
  }
  for (const candidate of candidates) {
    try {
      const probe = spawnSync(candidate, ['-NoProfile', '-Command', 'exit 7'], {
        encoding: 'utf8',
      });
      if (!probe.error && probe.status === 7) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

let PS = null;

// Spawn the guard with a raw stdin string. Returns the exit code.
function runRaw(raw, guardPath = GUARD, projectDir = REPO) {
  const result = spawnSync(
    PS,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', guardPath],
    {
      input: raw,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    },
  );
  assert.equal(result.error, undefined, `guard failed to spawn: ${result.error}`);
  return result.status;
}

const runJson = (payload, guardPath, projectDir) =>
  runRaw(JSON.stringify(payload), guardPath, projectDir);

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const pwsh = (command) => ({ tool_name: 'PowerShell', tool_input: { command } });
const edit = (file_path) => ({ tool_name: 'Edit', tool_input: { file_path } });
const write = (file_path) => ({ tool_name: 'Write', tool_input: { file_path } });
const notebook = (notebook_path) => ({
  tool_name: 'NotebookEdit',
  tool_input: { notebook_path },
});

// ---------------------------------------------------------------------------
// MUST BLOCK -- every one of these must exit 2.
// ---------------------------------------------------------------------------
const MUST_BLOCK_COMMANDS = [
  // production reference
  'echo avkighsiufeefyycbebf',
  // nested session
  'claude --dangerously-skip-permissions',
  'cd x && claude -p "go"',
  // dynamic execution
  'Invoke-Expression $c',
  'iex $c',
  'powershell -EncodedCommand ABC',
  'cmd /c dir',
  'node -e "require(\'child_process\')"',
  'node --eval "1"',
  'python -c "import os"',
  'Start-Process notepad',
  // git
  'git push',
  'cd x && git push',
  'git -C . push',
  'git  push',
  'git push --force',
  'git pull',
  'git fetch origin',
  'git checkout -b x',
  'git switch x',
  'git restore .',
  'git rebase main',
  'git merge x',
  'git cherry-pick abc',
  'git revert HEAD',
  'git reset --hard',
  'git clean -fd',
  'git stash',
  'git tag v1',
  'git branch -D x',
  'git branch newthing',
  'git worktree add ../wt',
  'git submodule add u p',
  'git remote set-url origin y',
  'git config user.email a@b.c',
  'git -c core.hooksPath=/dev/null status',
  'git commit --amend -m x',
  'git commit -m x --amend',
  'git add .',
  'git add -A',
  'git add src/*',
  // database
  'psql postgres://synthetic-not-a-real-credential',
  'pg_dump db',
  'supabase db push',
  // dependencies
  'npm install left-pad',
  'npm i left-pad',
  'yarn add left-pad',
  'npx expo install x',
  // .claude mutation
  'echo x > .claude/settings.json',
  'echo x >> .claude/settings.json',
  'Remove-Item .claude/hooks/guard.ps1',
  'Copy-Item a .claude/hooks/guard.ps1',
  'Set-Content .claude/settings.json y',
  'git mv .claude/rules/supabase.md .claude/rules/x.md',
  // credential-bearing files
  'cat .env',
  'Get-Content start.ps1',
  'type .env.local',
  'cat ./.env',
];

const MUST_BLOCK_PATHS = [
  ['Write frozen web surface', write('public/index.html')],
  ['Write claude config', write('.claude/settings.json')],
  ['Edit launcher secret', edit('start.ps1')],
  ['Edit escaping to claude config', edit('../.claude/settings.json')],
  ['Edit escaping the project', edit('../../elsewhere/notes.md')],
  ['NotebookEdit in claude config', notebook('.claude/notes.ipynb')],
];

const MUST_BLOCK_PAYLOADS = [
  ['malformed JSON', '{ this is not json'],
  ['empty stdin', ''],
  ['whitespace-only stdin', '   \t\r\n  '],
  ['JSON literal null', 'null'],
  ['JSON array', '[1, 2, 3]'],
  ['JSON string', '"just-a-string"'],
  ['no tool_name', '{"tool_input":{"command":"git status"}}'],
  ['tool_name a number', '{"tool_name":42,"tool_input":{"command":"git status"}}'],
  ['Bash with no tool_input', '{"tool_name":"Bash"}'],
  ['Bash with no command', '{"tool_name":"Bash","tool_input":{}}'],
  ['Bash command an object', '{"tool_name":"Bash","tool_input":{"command":{"a":1}}}'],
  ['Bash command empty', '{"tool_name":"Bash","tool_input":{"command":""}}'],
  ['Edit with no file_path', '{"tool_name":"Edit","tool_input":{}}'],
  ['Edit file_path a number', '{"tool_name":"Edit","tool_input":{"file_path":7}}'],
];

// ---------------------------------------------------------------------------
// MUST ALLOW -- every one of these must exit 0.
// ---------------------------------------------------------------------------
const MUST_ALLOW_COMMANDS = [
  'git status',
  'git status --porcelain=v1 -uall',
  'git log --oneline -5',
  'git diff --cached --name-status',
  'git diff df93584226b007250b99c353977e06a5edb8b162..HEAD --name-only',
  'git show 560ebb4',
  'git ls-files .claude',
  'git branch --show-current',
  'git branch -a',
  'git config --get user.email',
  'git remote -v',
  'npm test',
  'npm run verify',
  'npm run typecheck',
  'npm run lint',
  // deliberate false-positive canary for GUARD-DEPS token matching: `init`
  // must not match the `i` subcommand.
  'npm init',
  'node --version',
  'node --test tests/safety.test.mjs',
  'node scripts/verify-schema.mjs',
  'node -v && npm test',
  // deliberate false-positive canary for GUARD-DYNEXEC token matching:
  // `-Encoding` must not match the `-enc` token.
  'Get-Content .claude/settings.json -Encoding utf8',
];

const MUST_ALLOW_PATHS = [
  ['Edit this suite', edit('tests/safety.test.mjs')],
  ['Write handoff', write('HANDOFF.md')],
  ['Write this run audit report', write(REPORT_PATH)],
];

// The live-guard pre-arm block. Always runs against the REGISTERED guard path,
// whichever guard the main suite resolved. At B4 this proves the OLD guard
// permits both the staging command on the next line and the arming swap that
// follows; at B7 it re-proves them against the ARMED guard.
const LIVE_GUARD_MUST_ALLOW = [
  'git add .claude/hooks/guard.v2.ps1 tests/safety.test.mjs',
  'git mv -f .claude/hooks/guard.v2.ps1 .claude/hooks/guard.ps1',
  'git add .claude/settings.json .claude/hooks/guard.ps1',
  'git commit -m "feat(safety): arm fail-closed guard and deny matrix"',
  'npm test',
];

const BRANCH_SENSITIVE = [
  'git add path/to/file.ts',
  'git commit -m "msg"',
  'git mv a b',
];

function assertPureAscii(filePath, label) {
  const bytes = fs.readFileSync(filePath);
  const offenders = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === 0x09 || b === 0x0a || b === 0x0d) continue;
    if (b >= 0x20 && b <= 0x7e) continue;
    offenders.push(`offset ${i} = 0x${b.toString(16)}`);
    if (offenders.length >= 5) break;
  }
  assert.equal(
    offenders.length,
    0,
    `${label} must be pure ASCII; found ${offenders.join(', ')}`,
  );
}

describe('agent safety guard', { skip: PLATFORM_SKIP }, () => {
  before(() => {
    // Branch 2 of the platform gate: on win32 an unresolvable PowerShell is a
    // hard failure, never a green skip.
    PS = resolvePowerShell();
    assert.ok(
      PS,
      'win32 with no resolvable powershell.exe: the guard cannot run, so enforcement is absent',
    );
  });

  test('phase and guard resolution', (t) => {
    t.diagnostic(`phase=${PHASE} guard=${path.relative(REPO, GUARD)}`);
    t.diagnostic(
      `canaries: block=${MUST_BLOCK_COMMANDS.length + MUST_BLOCK_PATHS.length + MUST_BLOCK_PAYLOADS.length}` +
        ` allow=${MUST_ALLOW_COMMANDS.length + MUST_ALLOW_PATHS.length + UNLOCKED_SCREENS.length + 1}` +
        ` live-guard=${LIVE_GUARD_MUST_ALLOW.length}`,
    );
    assert.ok(fs.existsSync(GUARD), `resolved guard is missing: ${GUARD}`);
  });

  describe('MUST BLOCK (exit 2)', () => {
    for (const command of MUST_BLOCK_COMMANDS) {
      test(`bash: ${command}`, () => {
        assert.equal(runJson(bash(command)), 2, 'expected the guard to block');
      });
    }

    test('powershell tool uses the same command rules', () => {
      assert.equal(runJson(pwsh('git push')), 2);
      assert.equal(runJson(pwsh('Remove-Item .claude/hooks/guard.ps1')), 2);
    });

    for (const [label, payload] of MUST_BLOCK_PATHS) {
      test(`path: ${label}`, () => {
        assert.equal(runJson(payload), 2, 'expected the guard to block');
      });
    }

    for (const [label, raw] of MUST_BLOCK_PAYLOADS) {
      test(`payload: ${label}`, () => {
        assert.equal(runRaw(raw), 2, 'malformed payloads must fail closed');
      });
    }
  });

  describe('MUST ALLOW (exit 0)', () => {
    for (const command of MUST_ALLOW_COMMANDS) {
      test(`bash: ${command}`, () => {
        assert.equal(runJson(bash(command)), 0, 'expected the guard to allow');
      });
    }

    for (const [label, payload] of MUST_ALLOW_PATHS) {
      test(`path: ${label}`, () => {
        assert.equal(runJson(payload), 0, 'expected the guard to allow');
      });
    }

    test('an unrecognised tool name is allowed through', () => {
      assert.equal(
        runJson({ tool_name: 'WebFetch', tool_input: { url: 'https://example.com' } }),
        0,
      );
    });

    test('the 2026-08-19 unlock holds: every formerly locked screen edits freely', () => {
      for (const screen of UNLOCKED_SCREENS) {
        assert.equal(runJson(edit(screen)), 0, `unlocked screen still blocked: ${screen}`);
      }
    });
  });

  describe('LIVE-GUARD PRE-ARM BLOCK (registered guard path)', () => {
    for (const command of LIVE_GUARD_MUST_ALLOW) {
      test(`registered guard allows: ${command}`, () => {
        assert.equal(
          runJson(bash(command), GUARD_V1),
          0,
          'the registered guard must permit this run to stage, swap and commit',
        );
      });
    }
  });

  describe('branch check', () => {
    test('mutating git verbs are allowed on mainexpo', () => {
      for (const command of BRANCH_SENSITIVE) {
        assert.equal(runJson(bash(command), GUARD, REPO), 0, `blocked on mainexpo: ${command}`);
      }
    });

    test('mutating git verbs are blocked when the branch is undeterminable', () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brazos-guard-'));
      try {
        for (const command of BRANCH_SENSITIVE) {
          assert.equal(
            runJson(bash(command), GUARD, tmp),
            2,
            `not blocked outside a repository: ${command}`,
          );
        }
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  describe('static assertions (both checkpoints)', () => {
    test('the resolved guard is pure ASCII', () => {
      assertPureAscii(GUARD, 'resolved guard');
    });

    test('session-context.ps1 is pure ASCII', () => {
      assertPureAscii(SESSION_CONTEXT, 'session-context.ps1');
    });

    test('shared claude config is tracked and local state is not', () => {
      const listed = spawnSync('git', ['ls-files', '.claude'], {
        cwd: REPO,
        encoding: 'utf8',
      });
      assert.equal(listed.status, 0, 'git ls-files failed');
      const tracked = listed.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const required of [
        '.claude/settings.json',
        '.claude/hooks/guard.ps1',
        '.claude/hooks/session-context.ps1',
        '.claude/rules/native-ui.md',
        '.claude/rules/supabase.md',
      ]) {
        assert.ok(tracked.includes(required), `not tracked: ${required}`);
      }
      const localState = tracked.filter((p) => p.endsWith('.local.json'));
      assert.deepEqual(localState, [], 'local-only state must never be tracked');
    });

    test('settings.json parses as JSON', () => {
      JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    });

    test('settings.json carries no path rule the platform ignores', () => {
      // File permission checks consult only Edit(path) and Read(path).
      // Write/NotebookEdit/MultiEdit/Glob path rules are accepted, never
      // consulted, and warn at startup. Assert their ABSENCE.
      const parsed = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
      const perms = parsed.permissions ?? {};
      const every = [...(perms.allow ?? []), ...(perms.ask ?? []), ...(perms.deny ?? [])];
      for (const rule of every) {
        for (const ignored of ['Write(', 'NotebookEdit(', 'MultiEdit(', 'Glob(']) {
          assert.ok(
            !rule.startsWith(ignored),
            `settings.json carries an unconsulted path rule: ${rule}`,
          );
        }
      }
    });
  });

  describe('static assertions (ARMED state only)', () => {
    test('the deny matrix is armed', { skip: ARMED_ONLY_SKIP }, () => {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
      const deny = parsed.permissions?.deny ?? [];
      const joined = deny.join('\n');

      assert.ok(
        deny.some((r) => r.includes('avkighsiufeefyycbebf')),
        'no deny rule carries the production Supabase ref',
      );
      assert.ok(deny.includes('Edit(/.claude/**)'), 'missing Edit(/.claude/**)');
      for (const required of [
        'Read(./start.ps1)',
        'Read(./.env)',
        'Edit(./start.ps1)',
        'Edit(./.env)',
      ]) {
        assert.ok(deny.includes(required), `missing deny rule: ${required}`);
      }
      for (const needle of ['psql', 'supabase', '--amend']) {
        assert.ok(joined.includes(needle), `no deny rule names ${needle}`);
      }
    });

    test('the PreToolUse matcher covers the file tools', { skip: ARMED_ONLY_SKIP }, () => {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
      const pre = parsed.hooks?.PreToolUse ?? [];
      assert.equal(pre.length, 1, 'expected exactly one PreToolUse registration');
      assert.equal(pre[0].matcher, 'Bash|PowerShell|Edit|Write|NotebookEdit');
    });
  });
});
