# guard.v2.ps1 -- PreToolUse guard for Bash, PowerShell, Edit, Write and
# NotebookEdit.
#
# FAILS CLOSED. Only exit 2 blocks a PreToolUse call. Exit 0 allows, and EVERY
# other exit code -- including 1 -- is non-blocking and lets the call proceed.
# An unhandled PowerShell exception exits 1, so the ENTIRE body of this script
# runs inside a try/catch whose catch exits 2 (GUARD-EXCEPTION). Ambiguity of
# any kind -- unreadable stdin, unparseable JSON, a missing field, an
# undeterminable branch -- is a block, never an allow. This is the single most
# important property of this file.
#
# ONE OF TWO LAYERS, NOT THE ONLY ONE. A hook that fails to start or times out
# does not block anything, so this guard can never be sole enforcement. The
# permissions.deny matrix in .claude/settings.json carries the same
# prohibitions independently.
#
# GATED PUSH. 'git push origin mainexpo', flag-free, is the ONE permitted
# push form (CLAUDE.md "Agent autonomy"). The deny matrix's prefix language
# cannot express a ref-scoped allowance, so the wrong-ref and flagged-push
# blocks live HERE, while force/destructive push prefixes stay denied in
# settings.json as the second layer.
#
# THE SOLE DELIBERATE BYPASS is the exact guard-swap `git mv` excepted in rule
# 9 (GUARD-CLAUDEDIR). That is how this file is promoted over the registered
# guard path, and it is documented rather than hidden.
#
# GUARD-SECRET IS BEST-EFFORT DETECTION, NOT A BOUNDARY. It matches file names
# in command text; a subprocess can open a file without ever naming it.
#
# GUARD-HOOKSPATH governs GIT's own hooks (core.hooksPath), not Claude Code's.
#
# Reason codes go to stderr as a code plus a short rule name. Command text and
# offending paths are NEVER echoed.

$ErrorActionPreference = 'Stop'

try {

    function Write-Deny {
        param([string]$Code, [string]$Rule)
        [Console]::Error.WriteLine("BLOCK $Code $Rule")
        exit 2
    }

    # ---- project directory -------------------------------------------------
    # Resolved from CLAUDE_PROJECT_DIR, falling back to <script>\..\.. exactly
    # as session-context.ps1 does.
    $projectDir = $env:CLAUDE_PROJECT_DIR
    if ([string]::IsNullOrWhiteSpace($projectDir)) {
        $projectDir = (Join-Path $PSScriptRoot '..\..')
        try { $projectDir = (Resolve-Path $projectDir).Path } catch { }
    }

    function Split-NormPath {
        # Backslashes to forward slashes, collapse duplicate slashes, resolve
        # '.' and '..', lowercase. Purely textual: the path need not exist.
        # A '..' that escapes above the start is kept as a marker so the path
        # can never compare as being inside the project directory.
        param([string]$Raw)
        $out = New-Object System.Collections.Generic.List[string]
        foreach ($seg in ($Raw -replace '\\', '/').Split('/')) {
            if ($seg -eq '' -or $seg -eq '.') { continue }
            if ($seg -eq '..') {
                if ($out.Count -gt 0 -and $out[$out.Count - 1] -ne '..') {
                    $out.RemoveAt($out.Count - 1)
                } else {
                    $out.Add('..')
                }
                continue
            }
            $out.Add($seg.ToLowerInvariant())
        }
        # Comma operator: return the array itself rather than letting
        # PowerShell unroll it, so a one-segment result stays indexable.
        return ,($out.ToArray())
    }

    # ---- payload -----------------------------------------------------------
    $raw = [Console]::In.ReadToEnd()
    if ($null -eq $raw -or [string]::IsNullOrWhiteSpace($raw)) {
        Write-Deny 'GUARD-EMPTY' 'no-stdin-payload'
    }

    $payload = $null
    try {
        $payload = $raw | ConvertFrom-Json
    } catch {
        Write-Deny 'GUARD-PAYLOAD' 'unparseable-json'
    }

    if ($null -eq $payload) { Write-Deny 'GUARD-NOTOOL' 'payload-not-an-object' }
    if (($payload -isnot [string]) -and ($payload -is [System.Collections.IEnumerable])) {
        Write-Deny 'GUARD-NOTOOL' 'payload-not-an-object'
    }

    $toolName = $null
    try { $toolName = $payload.tool_name } catch { $toolName = $null }
    if ($null -eq $toolName -or ($toolName -isnot [string]) -or [string]::IsNullOrWhiteSpace($toolName)) {
        Write-Deny 'GUARD-NOTOOL' 'missing-tool-name'
    }

    $toolInput = $null
    try { $toolInput = $payload.tool_input } catch { $toolInput = $null }

    $isCommandTool = ($toolName -eq 'Bash' -or $toolName -eq 'PowerShell')
    $isEditTool    = ($toolName -eq 'Edit' -or $toolName -eq 'Write')
    $isNotebook    = ($toolName -eq 'NotebookEdit')

    if (-not ($isCommandTool -or $isEditTool -or $isNotebook)) { exit 0 }

    # ========================================================================
    # PATH RULES -- Edit, Write, NotebookEdit
    # ========================================================================
    if ($isEditTool -or $isNotebook) {
        $rawPath = $null
        if ($null -ne $toolInput) {
            try {
                if ($isNotebook) { $rawPath = $toolInput.notebook_path }
                else { $rawPath = $toolInput.file_path }
            } catch { $rawPath = $null }
        }
        if ($null -eq $rawPath -or ($rawPath -isnot [string]) -or [string]::IsNullOrWhiteSpace($rawPath)) {
            Write-Deny 'GUARD-NOPATH' 'missing-file-path'
        }

        $slashed = $rawPath -replace '\\', '/'
        $isAbs = ($rawPath -match '^[a-zA-Z]:[\\/]') -or $slashed.StartsWith('/')
        $full = $rawPath
        if (-not $isAbs) { $full = ($projectDir -replace '\\', '/') + '/' + $rawPath }

        $segs = Split-NormPath $full
        $rootSegs = Split-NormPath $projectDir

        # 1. must resolve under the project directory; a '..' escape is never
        #    legitimate here.
        $inside = ($segs.Count -gt $rootSegs.Count)
        if ($inside) {
            for ($i = 0; $i -lt $rootSegs.Count; $i++) {
                if ($segs[$i] -ne $rootSegs[$i]) { $inside = $false; break }
            }
        }
        if (-not $inside) { Write-Deny 'GUARD-PATH-ESCAPE' 'outside-project-dir' }

        # 2. a .claude segment at ANY depth, wherever it resolves.
        foreach ($seg in $segs) {
            if ($seg -eq '.claude') { Write-Deny 'GUARD-PATH-CLAUDEDIR' 'claude-config-tree' }
        }

        $rel = ($segs[$rootSegs.Count..($segs.Count - 1)] -join '/')
        $base = $segs[$segs.Count - 1]

        # 3. frozen and reference trees.
        foreach ($pre in @('design-reference/', 'public/', 'hosting/', 'dist/')) {
            if ($rel.StartsWith($pre)) { Write-Deny 'GUARD-PATH-FROZEN' 'frozen-web-or-reference-tree' }
        }

        # 4. web-specific implementations.
        if ($rel.EndsWith('.web.ts') -or $rel.EndsWith('.web.tsx')) {
            Write-Deny 'GUARD-PATH-FROZEN' 'web-specific-module'
        }

        # 5. secret and frozen basenames.
        if ($base -eq 'web_deployment.md' -or $base -eq 'start.ps1' -or $base -eq '.env' -or $base -match '^\.env\..+$') {
            Write-Deny 'GUARD-PATH-SECRET' 'secret-or-frozen-basename'
        }

        # 6. locked screens: the locked set is EMPTY by operator decision
        #    (2026-08-19, Prestige dark sweep). CLAUDE.md "Locked -- never
        #    modify" is the authority; regression fences, not a path list,
        #    protect screens now. No path rule fires here.

        exit 0
    }

    # ========================================================================
    # COMMAND RULES -- Bash, PowerShell
    # ========================================================================
    $cmd = $null
    if ($null -ne $toolInput) {
        try { $cmd = $toolInput.command } catch { $cmd = $null }
    }
    if ($null -eq $cmd -or ($cmd -isnot [string]) -or [string]::IsNullOrWhiteSpace($cmd)) {
        Write-Deny 'GUARD-NOCMD' 'missing-command-text'
    }

    # Normalise every whitespace run -- spaces, tabs, newlines -- to one space.
    $norm = ($cmd -replace '\s+', ' ').Trim()
    $low = $norm.ToLowerInvariant()
    $tokens = $low.Split(' ')

    function Test-GitVerb {
        param([string]$Token)
        if ($Token -eq 'git' -or $Token -eq 'git.exe') { return $true }
        return ($Token.EndsWith('/git') -or $Token.EndsWith('\git') -or
                $Token.EndsWith('/git.exe') -or $Token.EndsWith('\git.exe'))
    }

    function Test-BareVerb {
        param([string]$Token, [string]$Verb)
        if ($Token -eq $Verb -or $Token -eq "$Verb.exe") { return $true }
        return ($Token.EndsWith("/$Verb") -or $Token.EndsWith("\$Verb") -or
                $Token.EndsWith("/$Verb.exe") -or $Token.EndsWith("\$Verb.exe"))
    }

    $opTokens = @('&&', '||', ';', '|', '|&', '&')

    # Locate every git invocation: the subcommand token after the git verb,
    # skipping -C <path>, -c <cfg>, --git-dir=... and --work-tree=...
    $gitCalls = New-Object System.Collections.Generic.List[object]
    for ($i = 0; $i -lt $tokens.Length; $i++) {
        if (-not (Test-GitVerb $tokens[$i])) { continue }
        $j = $i + 1
        $preFlags = $false
        while ($j -lt $tokens.Length) {
            $t = $tokens[$j]
            if ($t -eq '-c') { $j += 2; $preFlags = $true; continue }
            if ($t.StartsWith('--git-dir=') -or $t.StartsWith('--work-tree=')) { $j += 1; $preFlags = $true; continue }
            break
        }
        $sub = ''
        # Not $args: that is a PowerShell automatic variable.
        $callArgs = New-Object System.Collections.Generic.List[string]
        if ($j -lt $tokens.Length) {
            $sub = $tokens[$j]
            for ($k = $j + 1; $k -lt $tokens.Length; $k++) {
                if ($opTokens -contains $tokens[$k]) { break }
                $callArgs.Add($tokens[$k])
            }
        }
        $gitCalls.Add(@{ Sub = $sub; Args = $callArgs; PreFlags = $preFlags })
    }

    # ---- 1. GUARD-PRODREF --------------------------------------------------
    if ($low.Contains('avkighsiufeefyycbebf')) {
        Write-Deny 'GUARD-PRODREF' 'production-supabase-ref'
    }

    # ---- 2. GUARD-NESTED-CLAUDE -------------------------------------------
    # Token equality is required: a nested session can be launched with hooks
    # disabled, bypassing this entire layer in one command. Matching on
    # substrings would also snag .claude/settings.json, which is legitimate.
    foreach ($t in $tokens) {
        if ($t -eq 'claude' -or $t -eq 'claude.exe' -or
            $t.EndsWith('/claude') -or $t.EndsWith('\claude') -or
            $t.EndsWith('/claude.exe') -or $t.EndsWith('\claude.exe')) {
            Write-Deny 'GUARD-NESTED-CLAUDE' 'nested-claude-session'
        }
    }

    # ---- 3. GUARD-DYNEXEC --------------------------------------------------
    # Whole tokens only. Substring-matching '-enc' would block '-Encoding'.
    foreach ($t in $tokens) {
        if ($t -eq 'iex' -or $t -eq '-enc' -or $t -eq '-encodedcommand' -or
            $t -eq 'invoke-expression' -or $t -eq 'start-process' -or $t -eq 'add-type') {
            Write-Deny 'GUARD-DYNEXEC' 'dynamic-code-execution'
        }
    }
    # Trailing spaces on 'node -e ' and 'node -p ' are deliberate.
    $dynSubstrings = @(
        'cmd /c', 'cmd /k', 'cmd.exe /c', 'powershell -', 'powershell.exe -',
        'pwsh -', '[scriptblock]', 'node -e ', 'node --eval', 'node -p ',
        'node --print', 'node --input-type', 'python -c', 'python3 -c',
        'perl -e', 'ruby -e', 'deno eval', 'bun -e'
    )
    foreach ($s in $dynSubstrings) {
        if ($low.Contains($s)) { Write-Deny 'GUARD-DYNEXEC' 'dynamic-code-execution' }
    }

    # ---- 4. GUARD-GIT ------------------------------------------------------
    $blockedSubs = @(
        'pull', 'fetch', 'reset', 'clean', 'stash', 'checkout',
        'switch', 'restore', 'rebase', 'merge', 'cherry-pick', 'revert',
        'filter-branch', 'filter-repo', 'tag', 'worktree', 'submodule'
    )
    $branchReadFlags = @(
        '-a', '-r', '-v', '-vv', '-l', '--list', '--show-current',
        '--contains', '--merged', '--no-merged'
    )
    $branchValueFlags = @('--contains', '--merged', '--no-merged')

    foreach ($call in $gitCalls) {
        $sub = $call.Sub
        $gargs = $call.Args

        if ($blockedSubs -contains $sub) {
            Write-Deny 'GUARD-GIT' "forbidden-git-subcommand"
        }

        if ($sub -eq 'push') {
            # Gated push (CLAUDE.md "Agent autonomy"): the ONE permitted
            # form is an explicit, flag-free push of mainexpo to origin --
            # 'git push origin mainexpo' (or 'origin mainexpo:mainexpo'),
            # with no -c / --git-dir / --work-tree prefix. Anything else --
            # any flag (--force, -f, --force-with-lease, --delete, --mirror,
            # --tags, --all, -u, ...), any other remote, ref or refspec, or
            # a bare 'git push' -- is blocked. Allow-list, never block-list.
            $pushOk = $false
            $pa = @($call.Args)
            if (-not $call.PreFlags -and $pa.Count -eq 2 -and
                $pa[0] -eq 'origin' -and
                ($pa[1] -eq 'mainexpo' -or $pa[1] -eq 'mainexpo:mainexpo')) {
                $pushOk = $true
            }
            if (-not $pushOk) { Write-Deny 'GUARD-GIT' 'git-push-not-gated-mainexpo' }
        }

        if ($sub -eq 'branch') {
            $ok = $true
            $skipNext = $false
            foreach ($a in $gargs) {
                if ($skipNext) { $skipNext = $false; continue }
                if ($branchReadFlags -contains $a) {
                    if ($branchValueFlags -contains $a) { $skipNext = $true }
                    continue
                }
                $ok = $false
                break
            }
            if (-not $ok) { Write-Deny 'GUARD-GIT' 'git-branch-mutation' }
        }

        if ($sub -eq 'remote') {
            if ($gargs.Count -gt 0 -and $gargs[0] -ne '-v' -and $gargs[0] -ne 'show') {
                Write-Deny 'GUARD-GIT' 'git-remote-mutation'
            }
        }

        if ($sub -eq 'config') {
            $readOnly = $false
            foreach ($a in $gargs) {
                if ($a -eq '--get' -or $a -eq '--get-all' -or $a -eq '--list' -or $a -eq '-l') {
                    $readOnly = $true
                    break
                }
            }
            if (-not $readOnly) { Write-Deny 'GUARD-GIT' 'git-config-write' }
        }

        if ($sub -eq 'commit') {
            foreach ($a in $gargs) {
                if ($a -eq '--amend') { Write-Deny 'GUARD-GIT' 'git-commit-amend' }
            }
        }

        if ($sub -eq 'add') {
            foreach ($a in $gargs) {
                if ($a -eq '.' -or $a -eq '-a' -or $a -eq '--all' -or
                    $a -eq '-u' -or $a -eq '--update' -or
                    $a.Contains('*') -or $a.Contains('?')) {
                    Write-Deny 'GUARD-GIT' 'git-add-wildcard-or-bulk'
                }
            }
        }
    }

    # ---- 5. GUARD-HOOKSPATH ------------------------------------------------
    # GIT's own hook path, not Claude Code's.
    if ($low.Contains('core.hookspath')) {
        Write-Deny 'GUARD-HOOKSPATH' 'git-hooks-path-override'
    }

    # ---- 6. GUARD-DB ---------------------------------------------------
# Bare command verb: first token of the full command, or of any subcommand
# after a split on &&, ||, ; or |.
# The local stack is the run's database: start, stop, db reset, test db,
# gen types and migration new all touch 127.0.0.1 only and are allowed.
# Anything that can reach a REMOTE project is denied below.
$dbVerbs = @('psql', 'pg_dump', 'pg_restore', 'pg_dumpall')
foreach ($segment in ($low -split '\|\||&&|\||;')) {
    $seg = $segment.Trim()
    if ($seg -eq '') { continue }
    $first = $seg.Split(' ')[0]
    foreach ($v in $dbVerbs) {
        if (Test-BareVerb $first $v) { Write-Deny 'GUARD-DB' 'direct-database-contact' }
    }
}
if ($low -match '--linked|--db-url|--project-ref') { Write-Deny 'GUARD-DB' 'remote-database-flag' }
if ($low -match 'supabase\s+(login|logout|link|projects|orgs|branches|secrets)\b') { Write-Deny 'GUARD-DB' 'remote-database-subcommand' }
if ($low -match 'supabase\s+db\s+(push|pull|dump|remote)\b') { Write-Deny 'GUARD-DB' 'remote-database-subcommand' }
if ($low -match 'supabase\s+migration\s+repair\b') { Write-Deny 'GUARD-DB' 'remote-database-subcommand' }
if ($low -match 'supabase\s+functions\s+deploy\b') { Write-Deny 'GUARD-DB' 'remote-database-subcommand' }

    # ---- 7. GUARD-DEPS -----------------------------------------------------
    # Package-manager verb plus mutating subcommand, both as whole tokens, so
    # 'npm i' matches and 'npm init' does not.
    $depMap = @{
        'npm'  = @('install', 'i', 'ci', 'uninstall', 'update', 'add', 'remove')
        'yarn' = @('add', 'remove', 'upgrade')
        'pnpm' = @('add', 'remove', 'update')
        'bun'  = @('add', 'remove')
    }
    for ($i = 0; $i -lt $tokens.Length; $i++) {
        foreach ($pm in $depMap.Keys) {
            if (-not (Test-BareVerb $tokens[$i] $pm)) { continue }
            $j = $i + 1
            while ($j -lt $tokens.Length -and $tokens[$j].StartsWith('-')) { $j++ }
            if ($j -lt $tokens.Length -and ($depMap[$pm] -contains $tokens[$j])) {
                Write-Deny 'GUARD-DEPS' 'dependency-mutation'
            }
        }
        if (Test-BareVerb $tokens[$i] 'npx') {
            $j = $i + 1
            while ($j -lt $tokens.Length -and $tokens[$j].StartsWith('-')) { $j++ }
            if ($j -lt $tokens.Length) {
                $n = $tokens[$j]
                if ($n -eq 'create-expo-app' -or $n.StartsWith('create-expo-app@')) {
                    Write-Deny 'GUARD-DEPS' 'dependency-mutation'
                }
                if ($n -eq 'expo' -and ($j + 1) -lt $tokens.Length -and $tokens[$j + 1] -eq 'install') {
                    Write-Deny 'GUARD-DEPS' 'dependency-mutation'
                }
            }
        }
    }

    # ---- 8. GUARD-SECRET ---------------------------------------------------
    # Best-effort: pure text matching on whitespace- or quote-delimited tokens.
    # Must not fire on process.env, $env:FOO, or a word merely containing the
    # substring, so the comparison is on the resolved basename.
    foreach ($t in (($low -replace '["'']', ' ') -replace '\s+', ' ').Trim().Split(' ')) {
        if ($t -eq '') { continue }
        $c = $t -replace '\\', '/'
        if ($c.StartsWith('./')) { $c = $c.Substring(2) }
        $bn = $c.Split('/')[-1]
        if ($bn -eq 'start.ps1' -or $bn -eq '.env' -or $bn -match '^\.env\..+$') {
            Write-Deny 'GUARD-SECRET' 'credential-bearing-file'
        }
    }

    # ---- 9. GUARD-CLAUDEDIR ------------------------------------------------
    # Redirecting into, moving, copying or removing anything under .claude/.
    # `git add` and `git commit` are excepted -- they write the index and the
    # object store, not the working file -- and so are absent from the
    # mutating-verb set below. The ONLY other exception is the exact guard
    # swap, this layer's one deliberate, documented bypass.
    $claudeText = $low -replace '\\', '/'
    if ($claudeText.Contains('.claude/')) {
        $swapA = 'git mv -f .claude/hooks/guard.v2.ps1 .claude/hooks/guard.ps1'
        $swapB = 'git mv .claude/hooks/guard.v2.ps1 .claude/hooks/guard.ps1'
        if ($claudeText -ne $swapA -and $claudeText -ne $swapB) {
            $mutating = @(
                'set-content', 'out-file', 'add-content', 'new-item', 'mv', 'cp',
                'rm', 'del', 'move-item', 'copy-item', 'remove-item', 'rename-item'
            )
            $hit = $false
            if ($low.Contains('>')) { $hit = $true }
            if (-not $hit) {
                foreach ($t in $tokens) {
                    if ($mutating -contains $t) { $hit = $true; break }
                }
            }
            if (-not $hit) {
                foreach ($call in $gitCalls) {
                    if ($call.Sub -eq 'mv') { $hit = $true; break }
                }
            }
            if ($hit) { Write-Deny 'GUARD-CLAUDEDIR' 'claude-config-mutation' }
        }
    }

    # ---- 10. GUARD-BRANCH --------------------------------------------------
    # Mutating git verbs only. No skip path, no tolerance branch: a branch that
    # cannot be determined for ANY reason is a block.
    $needsBranch = $false
    foreach ($call in $gitCalls) {
        if ($call.Sub -eq 'commit' -or $call.Sub -eq 'add' -or
            $call.Sub -eq 'mv' -or $call.Sub -eq 'push') {
            $needsBranch = $true
            break
        }
    }
    if ($needsBranch) {
        $branch = $null
        $prevEap = $ErrorActionPreference
        $hadLocks = Test-Path 'env:GIT_OPTIONAL_LOCKS'
        $prevLocks = $env:GIT_OPTIONAL_LOCKS
        try {
            $ErrorActionPreference = 'SilentlyContinue'
            $env:GIT_OPTIONAL_LOCKS = '0'
            $out = & git -C $projectDir rev-parse --abbrev-ref HEAD 2>$null
            if ($LASTEXITCODE -eq 0 -and $null -ne $out) {
                $first = @($out)[0]
                if ($null -ne $first) { $branch = ([string]$first).Trim() }
            }
        } catch {
            $branch = $null
        } finally {
            $ErrorActionPreference = $prevEap
            if ($hadLocks) { $env:GIT_OPTIONAL_LOCKS = $prevLocks }
            else { Remove-Item 'env:GIT_OPTIONAL_LOCKS' -ErrorAction SilentlyContinue }
        }
        if ([string]::IsNullOrWhiteSpace($branch) -or $branch -ne 'mainexpo') {
            Write-Deny 'GUARD-BRANCH' 'not-on-mainexpo'
        }
    }

} catch {
    [Console]::Error.WriteLine('BLOCK GUARD-EXCEPTION guard-internal-error')
    exit 2
}

exit 0
