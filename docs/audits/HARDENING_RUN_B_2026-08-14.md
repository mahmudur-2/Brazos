# Hardening Run B -- Agent Safety Enforcement Layer

Replaced the repository's agent-safety layer with one that fails CLOSED,
constrains the command language instead of trying to recognise every dangerous
form, covers file-mutation tools, and is proven by synthetic canaries.

Zero product behaviour, SQL, dependency, or documentation changes beyond one
surgical HANDOFF edit and this report. No database was contacted at any point.

This file is pure ASCII by policy. Where a source string contained a non-ASCII
character it is written here as an explicit `\uXXXX` escape and flagged.

## 1. Base snapshot

| Item | Value |
| --- | --- |
| `claude --version` | **2.1.232 (Claude Code)** -- gate required 2.1.228 or later |
| Branch | `mainexpo` |
| HEAD at start | `df93584226b007250b99c353977e06a5edb8b162` |
| Tree at start | clean (`git status --porcelain=v1 -uall` empty) |
| Baseline `npm run verify` | green: 398 tests, 398 pass, 0 fail |

The version gate matters because a build below 2.1.228 consults only
`Edit(path)` rules for some editors, which would leave the Write tool
unguarded and install a layer that silently does less than it claims.

## 2. Hypothesis table

Every claim the dispatch asked to spot-check before writing, how it was
checked, and the result. No claim was contradicted, so the run proceeded.

| # | Claim | How checked | Result |
| --- | --- | --- | --- |
| 1 | Tracked `.claude` files are exactly `settings.json`, `hooks/guard.ps1`, `hooks/session-context.ps1`, `rules/native-ui.md`, `rules/supabase.md` | `git ls-files .claude` | CONFIRMED -- exactly those five |
| 2 | `.claude/settings.local.json` is untracked and ignored by the `.claude/` rule | absent from `git ls-files`; `.gitignore` line 31 was `.claude/` | CONFIRMED |
| 3 | `guard.ps1` exits 0 on unparseable input -- it fails OPEN | read `guard.ps1`; `catch { exit 0 }` at lines 24-26 | CONFIRMED |
| 4 | Its header claim that `settings.json` is the backstop is FALSE | header lines 16-17 assert it; deny list carries no equivalent rule | CONFIRMED false |
| 5 | The production ref `avkighsiufeefyycbebf` appears in NO deny rule, so the hook was the only enforcement | read all 31 deny entries | CONFIRMED |
| 6 | PreToolUse matcher is `Bash\|PowerShell`; the hook never sees Edit, Write, NotebookEdit | `settings.json` line 42 | CONFIRMED |
| 7 | `settings.local.json` allows `Bash(psql:*)` and nothing denies it | allow entry present; no psql deny anywhere | CONFIRMED |
| 8 | `start.ps1` is out of the working tree, gitignored, and its absence does not dirty the tree | `ls start.ps1` -> not found; `.gitignore` line 48 retains it; `git status` empty | CONFIRMED absent |
| 9 | `session-context.ps1` logic is correct as written; verify encoding only | read it; encoding asserted by the suite | CONFIRMED |
| 10 | CLAUDE.md's claim that force checkout, history rewriting, and `commit --amend` are "also mechanically denied" is untrue | no such deny rule existed | CONFIRMED untrue; this run makes the sentence true rather than editing it |
| **L1** | **LOAD-BEARING #1: `settings.json` deny contains NO `.claude/`-scoped rule** -- no `Edit(/.claude/**)`, `Edit(./.claude/**)`, or `Read(` covering that path | read every deny entry; there are no `Read(` rules at all and no entry naming `.claude` | **CONFIRMED ABSENT.** B7c's file-tool write to `.claude/settings.json` was therefore possible |
| **L2** | **LOAD-BEARING #2: no path-scoped `Write(`, `NotebookEdit(`, `MultiEdit(`, or `Glob(` rule in allow, ask, or deny** | deny holds only `Bash(`, `PowerShell(`, `Edit(` prefixes; no allow or ask arrays exist in `settings.json` | **CONFIRMED ABSENT.** Nothing had to be removed during the B7c rewrite |

Platform facts from the dispatch were treated as design inputs and drove the
design directly: only `Edit(path)` rules are consulted for file editors, so
the deny matrix contains no `Write(`/`NotebookEdit(`/`Glob(` path rules; only
exit 2 blocks, so the guard body is wrapped in try/catch exiting 2; a deny
cannot carry an allowlist exception, so there is no blanket `git config` or
`git commit` deny.

## 3. What was built

### `.claude/hooks/guard.v2.ps1` -> `.claude/hooks/guard.ps1`

Fails closed. `$ErrorActionPreference = 'Stop'` and the entire body inside
try/catch whose catch exits 2 (`GUARD-EXCEPTION`). No code path terminates
with any exit code other than 0 or 2. Payload ambiguity of any kind is a
block: `GUARD-EMPTY`, `GUARD-PAYLOAD`, `GUARD-NOTOOL`, `GUARD-NOCMD`,
`GUARD-NOPATH`.

Command rules, evaluated in order against the full normalised text so that
compound commands cannot smuggle a subcommand past a prefix match:

| Rule | Reason code | Scope |
| --- | --- | --- |
| 1 | `GUARD-PRODREF` | literal production Supabase ref, substring |
| 2 | `GUARD-NESTED-CLAUDE` | `claude` as a whole token; a nested session can be launched with hooks disabled |
| 3 | `GUARD-DYNEXEC` | whole tokens `iex`, `-enc`, `-EncodedCommand`, `Invoke-Expression`, `Start-Process`, `Add-Type`; plus 18 substrings including `node -e `, `python -c`, `cmd /c` |
| 4 | `GUARD-GIT` | 18 forbidden subcommands; `branch`/`remote`/`config` allowed only in read-only forms; `commit --amend` at any position; bulk and wildcard `git add` |
| 5 | `GUARD-HOOKSPATH` | `core.hooksPath` -- GIT's own hooks, not Claude Code's |
| 6 | `GUARD-DB` | psql, pg_dump, pg_restore, pg_dumpall, supabase as a bare verb in any subcommand position |
| 7 | `GUARD-DEPS` | package-manager verb plus mutating subcommand, both whole tokens |
| 8 | `GUARD-SECRET` | tokens resolving to `start.ps1`, `.env`, `.env.*` |
| 9 | `GUARD-CLAUDEDIR` | redirect/move/copy/remove under `.claude/`, excepting `git add`, `git commit`, and the one guard swap |
| 10 | `GUARD-BRANCH` | `git commit`/`add`/`mv` resolve the branch; not `mainexpo` or undeterminable is a block, with no skip path |

Path rules for Edit, Write and NotebookEdit normalise backslashes, collapse
duplicate slashes, resolve `.` and `..`, lowercase, then strip the project
prefix. A path is blocked when it escapes the project directory, contains a
`.claude` segment at any depth, lives under `design-reference/`, `public/`,
`hosting/` or `dist/`, matches `*.web.ts`/`*.web.tsx`, has a basename of
`WEB_DEPLOYMENT.md`/`start.ps1`/`.env`/`.env.*`, or names a locked screen.

Reason codes and a short rule name go to stderr. Command text and offending
paths are never echoed.

### Locked-path list, verbatim from CLAUDE.md "Locked -- never modify"

Eleven screens, derived by reading the section rather than assuming a count:

```
screens/LaunchScreen.tsx
screens/WelcomeScreen.tsx
screens/SignInScreen.tsx
screens/EmailSignInScreen.tsx
screens/CreateAccountScreen.tsx
screens/EmailCreateAccountScreen.tsx
screens/VerifyPhoneScreen.tsx
screens/SetupScreen.tsx
screens/LegalGateScreen.tsx
screens/HomeScreen.tsx
screens/BrowseJobsScreen.tsx
```

The suite asserts all eleven are blocked, not just the one named in the
canary list.

## 4. Canary matrix

`tests/safety.test.mjs`, node:test builtins only. Every payload is an inert
string piped to the guard on stdin; no canary executes a real command, and
the assertions read nothing but the exit code.

Totals at the B4 checkpoint (PRE-ARM, resolving `guard.v2.ps1`):

| Direction | Count | Result |
| --- | --- | --- |
| MUST BLOCK (exit 2) | 79 | all blocked |
| MUST ALLOW (exit 0) | 25 | all allowed |
| LIVE-GUARD PRE-ARM block (registered guard) | 5 | all allowed |
| Branch check on `mainexpo` | 3 | all allowed |
| Branch check outside a repository | 3 | all blocked |
| Suite total | 121 tests | 119 pass, 0 fail, 2 skipped |

### MUST BLOCK, 79 canaries

Production ref (1): `echo avkighsiufeefyycbebf`.

Nested session (2): `claude --dangerously-skip-permissions`;
`cd x && claude -p "go"`.

Dynamic execution (8): `Invoke-Expression $c`; `iex $c`;
`powershell -EncodedCommand ABC`; `cmd /c dir`;
`node -e "require('child_process')"`; `node --eval "1"`;
`python -c "import os"`; `Start-Process notepad`.

Git (30): `git push`; `cd x && git push`; `git -C . push`; `git  push`
(doubled space); `git push --force`; `git pull`; `git fetch origin`;
`git checkout -b x`; `git switch x`; `git restore .`; `git rebase main`;
`git merge x`; `git cherry-pick abc`; `git revert HEAD`; `git reset --hard`;
`git clean -fd`; `git stash`; `git tag v1`; `git branch -D x`;
`git branch newthing`; `git worktree add ../wt`; `git submodule add u p`;
`git remote set-url origin y`; `git config user.email a@b.c`;
`git -c core.hooksPath=/dev/null status`; `git commit --amend -m x`;
`git commit -m x --amend`; `git add .`; `git add -A`; `git add src/*`.

Database (3): `psql postgres://synthetic-not-a-real-credential`;
`pg_dump db`; `supabase db push`.

Dependencies (4): `npm install left-pad`; `npm i left-pad`;
`yarn add left-pad`; `npx expo install x`.

`.claude` mutation (6): `echo x > .claude/settings.json`;
`echo x >> .claude/settings.json`; `Remove-Item .claude/hooks/guard.ps1`;
`Copy-Item a .claude/hooks/guard.ps1`; `Set-Content .claude/settings.json y`;
`git mv .claude/rules/supabase.md .claude/rules/x.md`.

Credential-bearing files (4): `cat .env`; `Get-Content start.ps1`;
`type .env.local`; `cat ./.env`.

Paths (7): Edit of `screens/LaunchScreen.tsx`; Write of `public/index.html`;
Write of `.claude/settings.json`; Edit of `start.ps1`; Edit of
`../.claude/settings.json`; Edit of `../../elsewhere/notes.md`; NotebookEdit
with a `.claude/` notebook path.

Malformed payloads (14): malformed JSON; empty stdin; whitespace-only stdin;
the JSON literal `null`; a JSON array; a JSON string; no `tool_name`;
`tool_name` a number; Bash with no `tool_input`; Bash with no `command`;
Bash `command` an object; Bash `command` empty; Edit with no `file_path`;
Edit `file_path` a number.

A separate assertion confirms the PowerShell tool is subject to the same
command rules as Bash.

### MUST ALLOW, 25 canaries

Read-only git (11): `git status`; `git status --porcelain=v1 -uall`;
`git log --oneline -5`; `git diff --cached --name-status`;
`git diff df93584226b007250b99c353977e06a5edb8b162..HEAD --name-only`;
`git show 560ebb4`; `git ls-files .claude`; `git branch --show-current`;
`git branch -a`; `git config --get user.email`; `git remote -v`.

Toolchain (10): `npm test`; `npm run verify`; `npm run typecheck`;
`npm run lint`; `npm init`; `node --version`;
`node --test tests/safety.test.mjs`; `node scripts/verify-schema.mjs`;
`node -v && npm test`; `Get-Content .claude/settings.json -Encoding utf8`.

Paths (3): Edit of `tests/safety.test.mjs`; Write of `HANDOFF.md`; Write of
this report's path, constructed at runtime from the system clock rather than
hardcoded.

Unrecognised tool name (1): allowed through, since the guard only classifies
tools it knows.

Two of these are deliberate false-positive canaries. `npm init` must not
match the `i` subcommand of GUARD-DEPS, and `-Encoding` must not match the
`-enc` token of GUARD-DYNEXEC. Both pass, confirming those rules match whole
tokens rather than substrings.

`git ls-files .claude` is a third: it names the config directory without a
trailing slash, and GUARD-CLAUDEDIR keys on `.claude/`, so read-only
inspection of the tracked config is unaffected.

### Live-guard pre-arm block

Always runs against the guard at its REGISTERED path, whichever guard the
main suite resolved. At B4 it ran against the OLD guard and proved that the
staging command on the very next line, the arming swap, and the arming commit
were all possible before any of them was attempted. All five exited 0:

```
git add .claude/hooks/guard.v2.ps1 tests/safety.test.mjs
git mv -f .claude/hooks/guard.v2.ps1 .claude/hooks/guard.ps1
git add .claude/settings.json .claude/hooks/guard.ps1
git commit -m "feat(safety): arm fail-closed guard and deny matrix"
npm test
```

### Static assertions

Unconditional at both checkpoints, all passing at B4: the resolved guard is
pure ASCII; `session-context.ps1` is pure ASCII; `git ls-files .claude` lists
all five shared config files and no `*.local.json`; `settings.json` parses as
JSON; and `settings.json` carries no path-scoped `Write(`, `NotebookEdit(`,
`MultiEdit(`, or `Glob(` rule in allow, ask, or deny -- their ABSENCE is
asserted, because the platform accepts such rules, never consults them, and
warns at startup.

**Skipped by the phase gate at B4 (2 tests):** "the deny matrix is armed" and
"the PreToolUse matcher covers the file tools". Both are gated on the phase
signal -- `guard.v2.ps1` present means PRE-ARM. At B4 `settings.json` is still
the pre-arming file, in which the production ref appears in no deny rule by
design; asserting otherwise would have turned the suite red at commit 2 with
no legal repair available, since the run order forbids writing `settings.json`
before B7. Both run at B7e.

## 5. ASCII verification

Verified mechanically by byte scan, not by eye, since PowerShell 5.1 reads
UTF-8-without-BOM `.ps1` using the system code page and a corrupted literal in
a guard is a deny pattern that quietly stops matching.

| File | Bytes | Non-ASCII |
| --- | --- | --- |
| `.claude/hooks/guard.v2.ps1` (now `guard.ps1`) | 20023 | **0** |
| `.claude/hooks/session-context.ps1` | unchanged | **0** |
| `tests/safety.test.mjs` | 17323 | **0** |

Both hook scripts also parse cleanly:
`[System.Management.Automation.Language.Parser]::ParseFile` reported 0 errors.

`HANDOFF.md` retains pre-existing em dashes on lines this run was not
permitted to touch. Every character this run ADDED to it is ASCII.

## 6. `.gitignore` narrowing

The single `.claude/` line became four lines so that shared config is
versioned and local-only state is not:

```
# Claude Code: shared config is versioned; local-only state is not.
.claude/settings.local.json
.claude/*.local.json
.claude/_claude_bak/
```

Verified with `git check-ignore -v --no-index`: `settings.local.json` matches
(via `.claude/*.local.json`), `hooks/guard.ps1` does not, and
`hooks/guard.v2.ps1` does not -- the last being required so the staged guard
could be committed at all.

**Stray-path check: no additions were needed.** After narrowing,
`git status --porcelain=v1 -uall` showed only ` M .gitignore`. None of
`.claude/todos/`, `.claude/shell-snapshots/`, `.claude/statsig/`, or
`.claude/ide/` exists in this repository, and `_claude_bak/` was already
covered by the fourth line. Every other `.gitignore` line, including
`start.ps1`, `.env`, and `design-reference/`, is untouched.

## 7. `settings.local.json` reduction

This file is untracked and gitignored, so this report is the only audit trail
that will ever exist for the change.

B5 **ran**. Precondition satisfied: the session is in bypassPermissions /
auto-approve mode, evidenced by `claude --version`, `ls -a .claude/`,
`git ls-files`, `git rev-parse`, and several PowerShell byte scans all
executing without a prompt despite appearing in no allow list.

`permissions.allow` went from **76 entries to 14**; 62 removed, 0 added. The
14 retained are exactly the minimum the dispatch specified -- npm test / npm
run / node / npx tsc forms, read-only git status/log/diff, and
grep / Select-String:

```
Bash(npm test:*)                              Bash(git status:*)
Bash(npm run:*)                               PowerShell(git status:*)
Bash(node:*)                                  Bash(git log:*)
Bash(npx tsc *)                               PowerShell(git log:*)
PowerShell(npx tsc --noEmit 2>&1)             Bash(git diff:*)
PowerShell(node scripts/verify-schema.mjs)    PowerShell(git diff:*)
Bash(grep:*)                                  PowerShell(Select-String:*)
```

Every entry required for removal by the dispatch was removed: all psql
entries, `Bash(rm -rf node_modules)`, `Bash(git add *)`,
`Bash(git commit -m ' *)`, `Bash(npm install *)`, `Bash(npx expo *)`, every
create-expo-app / expo-doctor / expo install entry,
`WebFetch(domain:docs.expo.dev)`, every scratchpad `Read(//c/...)` entry, and
the one-off sed and echo debugging entries.

The 62 removed entries, verbatim:

```
PowerShell(Get-ChildItem -Force | Select-Object Name; "---NODE---"; node --version; "---NPM---"; npm --version; "---NPX---"; \(Get-Command npx\).Source)
PowerShell($env:CI = "1"; npx --yes create-expo-app@latest . --template blank-typescript --no-install)
PowerShell(npm install 2>&1)
PowerShell(npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack react-native-screens react-native-safe-area-context 2>&1)
PowerShell(npm install --save-dev react-native-dotenv 2>&1)
PowerShell("---TSC---")
PowerShell(npx expo install @expo/vector-icons 2>&1)
PowerShell("---DONE---")
PowerShell(npx --yes expo-doctor 2>&1)
PowerShell(npx expo install expo-font 2>&1)
PowerShell("---DOCTOR---")
PowerShell(npx expo export --platform ios --output-dir $out 2>&1)
PowerShell($out = "C:\\Users\\mdmah\\AppData\\Local\\Temp\\claude\\C--Users-mdmah-OneDrive-Documents-BRAZOS\\c8bd5bbb-1e81-4ecf-9a4f-a7376c4b7b27\\scratchpad\\export_test")
PowerShell(npm install --save-dev babel-preset-expo 2>&1)
PowerShell("---EXPORT---")
PowerShell(git check-ignore .env)
PowerShell(if \($?\) { "OK: .env is git-ignored" } else { "WARNING: .env is NOT ignored" })
PowerShell(npx expo start -c)
PowerShell($r = Test-NetConnection -ComputerName localhost -Port 8081 -WarningAction SilentlyContinue; "TcpTestSucceeded: $\($r.TcpTestSucceeded\)"; try { \(Invoke-WebRequest -Uri "http://localhost:8081/status" -UseBasicParsing -TimeoutSec 10\).Content } catch { "status: $\($_.Exception.Message\)" })
PowerShell(npx expo install react-dom react-native-web 2>&1)
PowerShell("react-dom: $\(Test-Path node_modules/react-dom\)"; "react-native-web: $\(Test-Path node_modules/react-native-web\)")
PowerShell(npx expo start --web)
PowerShell(Start-Process "http://localhost:8081")
PowerShell("Opened browser to http://localhost:8081")
PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 40; "---EXIT $LASTEXITCODE---")
PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 20; "---EXIT $LASTEXITCODE---")
PowerShell(npx expo install expo-image-picker 2>&1)
PowerShell("---")
PowerShell(npx expo start --web --tunnel)
PowerShell(npm install --save-dev "@expo/ngrok@^4.1.0" 2>&1)
Bash(git check-ignore *)
Bash(git add *)
Bash(git config *)
PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 30; "---EXIT $LASTEXITCODE---")
PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 60; "---EXIT $LASTEXITCODE---")
PowerShell(npx tsc --noEmit 2>&1 | Select-Object -First 80; "---EXIT $LASTEXITCODE---")
Bash(git commit -m ' *)
PowerShell(npx expo start --web -c)
PowerShell(npx expo start)
Bash(python3 -c "import qrcode; print\('available'\)")
Bash(python -c "import qrcode; print\('available'\)")
Bash(mkdir -p "/c/Users/mdmah/AppData/Local/Temp/claude/C--Users-mdmah-OneDrive-Documents-BRAZOS/c8bd5bbb-1e81-4ecf-9a4f-a7376c4b7b27/scratchpad")
Read(//c/Users/mdmah/AppData/Local/Temp/claude/C--Users-mdmah-OneDrive-Documents-BRAZOS/c8bd5bbb-1e81-4ecf-9a4f-a7376c4b7b27/scratchpad/**)
Bash(npx --yes qrcode "exp://192.168.1.139:8081" -o expo-qr.png -w 500)
Bash(npm view *)
WebFetch(domain:docs.expo.dev)
Bash(npx expo *)
Bash(npx --yes expo-doctor)
Bash(rm -rf node_modules)
Bash(npm install *)
Bash(echo "EXIT_CODE=$?")
Bash(node scripts/verify-schema.mjs)
Bash(psql:*)
Bash(sed -i 's/\u2014/--/g' .claude/hooks/guard.ps1 .claude/hooks/session-context.ps1)
Bash(echo "non-ascii scan exit: $? \(1 = clean\)")
Bash(powershell.exe -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/guard.ps1)
Bash(echo "re-test -> exit=$?")
Bash(CLAUDE_PROJECT_DIR="C:/Users/mdmah/OneDrive/Documents/BRAZOS" powershell.exe -NoProfile -ExecutionPolicy Bypass -File .claude/hooks/session-context.ps1)
Bash(echo "session-context -> exit=$?")
Bash(rm .claude/launch.json)
Bash(node -e "JSON.parse\(require\('fs'\).readFileSync\('.claude/settings.json','utf8'\)\); console.log\('settings.json: valid JSON'\)")
Bash(node -e "JSON.parse\(require\('fs'\).readFileSync\('.claude/settings.local.json','utf8'\)\); console.log\('settings.local.json: valid JSON'\)")
```

Two notes on that list. The `sed` entry contained a literal U+2014 EM DASH,
written above as `\u2014` so this report stays pure ASCII; it was the only
non-ASCII character in the removed set, and removing the entry also removed
the last non-ASCII byte from `settings.local.json`.
`Bash(node scripts/verify-schema.mjs)` was dropped as redundant, not as a
restriction -- the retained `Bash(node:*)` still covers it, and the guard
explicitly permits that command.

No key other than `permissions.allow` was touched, and the file remains valid
JSON.

## 7a. Plugin tool inventory: UNKNOWN

`.claude/settings.json` enables `expo@claude-plugins-official`, but the
plugin's tool list **cannot be determined from local files** and the dispatch
forbids installing, fetching, or reaching the network to find out. Recorded as
UNKNOWN with the reason, rather than guessed at.

What is determinable locally:

- `~/.claude/plugins/installed_plugins.json` is `{"version": 2, "plugins": {}}`
  -- nothing is installed.
- No `expo` directory exists under the marketplace `plugins/` tree, and a
  recursive search of `~/.claude` for any cached expo plugin payload returned
  nothing.
- The marketplace manifest lists `expo` as a `git-subdir` source
  (`github.com/expo/skills`, path `plugins/expo`, pinned sha `948115e`)
  described as "Official Expo skills", which suggests it contributes SKILLS
  rather than tools -- but the manifest carries no tool list, so this is an
  inference from a description, not an inventory.
- Consistent with the payload being absent, no expo skills appear in this
  session's available-skills list.

**The unguarded-surface point stands regardless.** The guard exits 0 on
unrecognised tool names, so ANY write-capable tool contributed by a plugin --
this one or any other -- is currently outside this layer entirely. It is
stated here, not fixed here: closing it needs either an allow-list of known
tool names in the guard or matcher coverage per plugin tool, and both are out
of this run's scope.

## 8. Operational consequences

**`claude --version` is denied to agent runs after arming** (GUARD-NESTED-CLAUDE
plus the `Bash(claude *)` deny family, because a nested session can be started
with hooks disabled). Checking the version therefore becomes an operator
pre-flight step; this run was the last one able to self-check it.

**`start.ps1` is no longer in the working tree.** Every `start.ps1` rule in
the guard and the deny matrix is retained deliberately as defence against
reintroduction -- inert today, correct the moment the file returns -- not as
protection of a live secret.

**Commit messages containing the bare word "Claude" are now blocked.**
GUARD-NESTED-CLAUDE matches `claude` as a whole token wherever it appears,
including inside a `-m` argument. That is the specified behaviour and it is
correct -- the guard cannot tell a commit message from a command -- but it
means the standard `Co-Authored-By: Claude ...` trailer cannot be used on
post-arming commits, and commit 1's own subject line
("version shared Claude config") would be rejected if replayed today.

**No blanket `git config` or `git commit` deny exists**, and this is
deliberate: a deny rule cannot carry an allowlist exception, so a blanket
`Bash(git config *)` would also block `git config --get`, which the canary
suite requires, and a blanket `Bash(git commit *)` would block this run's own
commits. The guard makes the read/write distinction that the permission
matrix cannot express; the matrix catches `*--amend*` at any position.

## 9. CI platform gate

The suite's platform gate is three-way and evaluated inside the suite body,
never at module scope, because a module-level throw would fail the suite
before the gate could run:

1. **Not win32** -- the whole suite SKIPS via node:test's skip mechanism.
   Skipped, never failed, never thrown. `npm test` stays green on
   ubuntu-latest; turning the existing green CI red would itself be a run
   failure.
2. **win32 with no resolvable `powershell.exe`** -- FAIL HARD. On the target
   machine an unresolvable PowerShell means enforcement cannot run at all, and
   that must never present as a green skip.
3. **win32 with `powershell.exe`** -- run every canary.

PowerShell resolution happens in a `before` hook, which never executes for a
skipped suite, so branch 1 cannot be poisoned by branch 2's probe.

## 10. UNPROVEN

Stated plainly, because the value of this layer depends on not overclaiming
it.

- **Hook registration is unproven by this run.** Only a fresh session can
  prove the hook is registered and actually loaded. Spawning the guard
  directly is a unit test of the script: it proves the classifier's logic and
  nothing about the matcher, the permission matrix, hot reload, or PreToolUse
  registration.
- **The guard-swap `git mv` is a deliberate, documented bypass.** This layer
  stops drift and mistakes. It does not stop a determined adversary with shell
  access.
- **GUARD-SECRET is best-effort detection, not a boundary.** It matches file
  names in command text; a subprocess can open a file without ever naming it.
  This is also why arbitrary `node -e` is blocked rather than permitted:
  Read and Edit denies do not reach files opened by a subprocess.
- **A hook that fails to start or times out does not block.** The guard can
  never be sole enforcement, which is why the production ref and the rest of
  the matrix also live in `permissions.deny`.
- **Recovery from a wedged guard is manual**: hand-edit
  `.claude/hooks/guard.ps1` in a plain editor. Nothing can or should prevent
  that, and no automated path to it exists by design.

## 11. POST-ARM RESULTS

To be completed in B8.
