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

        # 0. three places outside the project a session may write: the
        #    operator's plans folder (~/.claude/plans), this project's memory
        #    folder (~/.claude/projects/<project>/memory) and this session's
        #    scratchpad (<temp>/claude/<project>/<session_id>/scratchpad).
        #    A whole-segment prefix match on the resolved path, so a '..' can
        #    never reach a sibling; every other ~/.claude path stays blocked
        #    by rules 1 and 2. A missing or odd session_id allows no
        #    scratchpad.
        $slug = (($projectDir -replace '[\\/]+$', '') -replace '[^A-Za-z0-9]', '-')
        $allowedRoots = New-Object System.Collections.Generic.List[string]
        if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
            $allowedRoots.Add((Join-Path $env:USERPROFILE '.claude\plans'))
            $allowedRoots.Add((Join-Path $env:USERPROFILE ('.claude\projects\' + $slug + '\memory')))
        }
        $sessionId = $null
        try { $sessionId = $payload.session_id } catch { $sessionId = $null }
        if (($sessionId -is [string]) -and ($sessionId -match '^[A-Za-z0-9-]+$')) {
            $allowedRoots.Add((Join-Path ([System.IO.Path]::GetTempPath()) ('claude\' + $slug + '\' + $sessionId + '\scratchpad')))
        }
        foreach ($allowedRoot in $allowedRoots) {
            $allowSegs = Split-NormPath $allowedRoot
            if ($segs.Count -le $allowSegs.Count) { continue }
            $under = $true
            for ($i = 0; $i -lt $allowSegs.Count; $i++) {
                if ($segs[$i] -ne $allowSegs[$i]) { $under = $false; break }
            }
            if ($under) { exit 0 }
        }

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

    # ---- command words (rules 2 and 3) -------------------------------------
    # Rules 2 and 3 judge only the COMMAND WORD of each command segment, never
    # its arguments: a commit message, a grep pattern or a here-doc body that
    # merely mentions a trigger is data, not a command (the Co-Authored-By
    # trailer names Claude). A segment ends at ; & | ( ) { } or a newline, and
    # a $( ... ) or Bash backtick substitution is a segment of its own, even
    # inside double quotes, because the shell runs it. A quoted argument is
    # skipped; a quoted command word is unquoted and still judged. The command
    # word looks through assignments (VAR=x, $x = ...), shell keywords (if,
    # then, do, ...) and transparent wrappers (env, sudo, nohup, xargs, ...).
    # Bash here-doc bodies and PowerShell here-strings are skipped, unless the
    # command also runs a shell (bash, sh, zsh, ...) that could execute one;
    # then every body is read as commands. The script of 'bash -c', 'sh -c'
    # and 'eval' is read as commands too.
    $escapeChar = '`'
    if ($toolName -eq 'Bash') { $escapeChar = '\' }
    $shellVerbs = @('bash', 'sh', 'zsh', 'dash', 'ksh', 'fish')
    $wrapperWords = @(
        'env', 'exec', 'command', 'builtin', 'nohup', 'time', 'sudo', 'doas',
        'nice', 'xargs', 'timeout', 'stdbuf', 'setsid', 'start', 'call', '.',
        'if', 'then', 'else', 'elif', 'do', 'while', 'until', '!'
    )

    function Test-ShellVerb {
        param([string]$Token)
        foreach ($s in $shellVerbs) { if (Test-BareVerb $Token $s) { return $true } }
        return $false
    }

    function Remove-HereBodies {
        # Cuts PowerShell here-strings and Bash here-doc bodies out of the
        # text, collecting each body in $Bodies. A here-doc whose closing
        # line never comes is not a here-doc and stays in the text.
        param([string]$Text, $Bodies)
        $hs = New-Object System.Text.RegularExpressions.Regex("(?s)@(['""])[ \t]*\r?\n(.*?)\r?\n\1@")
        while ($true) {
            $m = $hs.Match($Text)
            if (-not $m.Success) { break }
            $Bodies.Add($m.Groups[2].Value)
            $Text = $Text.Substring(0, $m.Index) + "''" + $Text.Substring($m.Index + $m.Length)
        }
        $hd = New-Object System.Text.RegularExpressions.Regex("(?<!<)<<(-?)[ \t]*(['""]?)([A-Za-z_][A-Za-z0-9_]*)\2")
        $from = 0
        while ($from -lt $Text.Length) {
            $m = $hd.Match($Text, $from)
            if (-not $m.Success) { break }
            $from = $m.Index + $m.Length
            $nl = $Text.IndexOf("`n", $from)
            if ($nl -lt 0) { break }
            $pos = $nl + 1
            $stop = -1
            $resume = -1
            while ($pos -lt $Text.Length) {
                $lineEnd = $Text.IndexOf("`n", $pos)
                if ($lineEnd -lt 0) { $lineEnd = $Text.Length }
                $line = $Text.Substring($pos, $lineEnd - $pos).TrimEnd("`r")
                if ($m.Groups[1].Value -eq '-') { $line = $line.TrimStart("`t") }
                if ($line -ceq $m.Groups[3].Value) {
                    $stop = $pos
                    $resume = [Math]::Min($lineEnd + 1, $Text.Length)
                    break
                }
                $pos = $lineEnd + 1
            }
            if ($stop -lt 0) { continue }
            $Bodies.Add($Text.Substring($nl + 1, $stop - $nl - 1))
            $Text = $Text.Substring(0, $nl + 1) + $Text.Substring($resume)
        }
        return $Text
    }

    function Add-Segments {
        # Splits command text into segments of unquoted, lower-case words.
        # Bash escapes with a backslash, PowerShell with a backtick.
        param([string]$Text, [string]$Esc, $Sink)
        $isBash = ($Esc -eq '\')
        $st = @{
            Cur = (New-Object System.Collections.Generic.List[string])
            Word = (New-Object System.Text.StringBuilder)
            InWord = $false
        }
        $endWord = {
            if ($st.InWord) {
                $st.Cur.Add($st.Word.ToString().ToLowerInvariant())
                [void]$st.Word.Clear()
                $st.InWord = $false
            }
        }
        $endSegment = {
            & $endWord
            if ($st.Cur.Count -gt 0) {
                $Sink.Add($st.Cur)
                $st.Cur = New-Object System.Collections.Generic.List[string]
            }
        }
        $frames = New-Object System.Collections.Generic.Stack[object]
        $ctx = New-Object System.Collections.Generic.Stack[string]
        $depth = 0
        $i = 0
        $n = $Text.Length
        while ($i -lt $n) {
            $c = [string]$Text[$i]
            $nx = ''
            if (($i + 1) -lt $n) { $nx = [string]$Text[$i + 1] }
            $top = ''
            if ($ctx.Count -gt 0) { $top = $ctx.Peek() }
            $opens = (($c -eq '$') -and ($nx -eq '(')) -or ($isBash -and ($c -eq '`') -and ($top -ne 'bt'))
            if ($top -eq 'dq') {
                if ($c -eq '"') { [void]$ctx.Pop(); $i++; continue }
                if (($c -eq $Esc) -and ($nx -ne '')) {
                    if ((-not $isBash) -or (@('$', '`', '"', '\', "`n") -contains $nx)) {
                        [void]$st.Word.Append($nx)
                        $i += 2
                        continue
                    }
                }
                if (-not $opens) { [void]$st.Word.Append($c); $i++; continue }
            } else {
                if (($c -eq $Esc) -and ($nx -ne '')) {
                    [void]$st.Word.Append($nx)
                    $st.InWord = $true
                    $i += 2
                    continue
                }
                if ($c -eq "'") {
                    $close = $Text.IndexOf("'", $i + 1)
                    if ($close -lt 0) { $close = $n }
                    [void]$st.Word.Append($Text.Substring($i + 1, $close - $i - 1))
                    $st.InWord = $true
                    $i = $close + 1
                    continue
                }
                if ($c -eq '"') { $ctx.Push('dq'); $st.InWord = $true; $i++; continue }
            }
            if ($opens) {
                $frames.Push(@{ Cur = $st.Cur; Word = $st.Word; InWord = $st.InWord; Depth = $depth })
                $st.Cur = New-Object System.Collections.Generic.List[string]
                $st.Word = New-Object System.Text.StringBuilder
                $st.InWord = $false
                $depth = 0
                if ($c -eq '$') { $ctx.Push('sub'); $i += 2 } else { $ctx.Push('bt'); $i++ }
                continue
            }
            $closes = (($top -eq 'sub') -and ($c -eq ')') -and ($depth -eq 0)) -or (($top -eq 'bt') -and ($c -eq '`'))
            if ($closes) {
                & $endSegment
                [void]$ctx.Pop()
                $f = $frames.Pop()
                $st.Cur = $f.Cur
                $st.Word = $f.Word
                $st.InWord = $f.InWord
                $depth = $f.Depth
                $i++
                continue
            }
            if ($c -eq '(') { if ($top -eq 'sub') { $depth++ }; & $endSegment; $i++; continue }
            if ($c -eq ')') { if ($top -eq 'sub') { $depth-- }; & $endSegment; $i++; continue }
            if (@(';', '|', '&', '{', '}', "`n", "`r") -contains $c) { & $endSegment; $i++; continue }
            if (($c -eq ' ') -or ($c -eq "`t")) { & $endWord; $i++; continue }
            [void]$st.Word.Append($c)
            $st.InWord = $true
            $i++
        }
        & $endSegment
        while ($frames.Count -gt 0) {
            $f = $frames.Pop()
            $st.Cur = $f.Cur
            $st.Word = $f.Word
            $st.InWord = $f.InWord
            & $endSegment
        }
    }

    function Add-CommandWords {
        # One entry per segment: its command word (Head) and the words after
        # it (Args).
        param([string]$Text, [int]$Depth, $Sink)
        if ($Depth -gt 4) { return }
        $bodies = New-Object System.Collections.Generic.List[string]
        $kept = Remove-HereBodies $Text $bodies
        $segments = New-Object System.Collections.Generic.List[object]
        $null = Add-Segments $kept $escapeChar $segments
        $runsShell = $false
        foreach ($words in $segments) {
            $k = 0
            while ($k -lt $words.Count) {
                $w = $words[$k]
                if ($w -match '^[a-z_][a-z0-9_]*=') { $k++; continue }
                if ($w.StartsWith('$')) {
                    $eq = $w.IndexOf('=')
                    if ($eq -ge 0) {
                        if ($eq -lt ($w.Length - 1)) { $words[$k] = $w.Substring($eq + 1); continue }
                        $k++
                        continue
                    }
                    if ((($k + 1) -lt $words.Count) -and ($words[$k + 1] -match '^[-+*/]?=$')) { $k += 2; continue }
                    break
                }
                if ($wrapperWords -contains $w) {
                    $k++
                    while (($k -lt $words.Count) -and ($words[$k].StartsWith('-') -or $words[$k].Contains('=') -or ($words[$k] -match '^\d+(\.\d+)?[smhd]?$'))) { $k++ }
                    continue
                }
                break
            }
            if ($k -ge $words.Count) { continue }
            $after = New-Object System.Collections.Generic.List[string]
            for ($r = $k + 1; $r -lt $words.Count; $r++) { $after.Add($words[$r]) }
            $Sink.Add(@{ Head = $words[$k]; Args = $after })
            if (Test-ShellVerb $words[$k]) {
                $runsShell = $true
                for ($r = 0; $r -lt ($after.Count - 1); $r++) {
                    if ($after[$r] -match '^-[a-z]*c[a-z]*$') {
                        $null = Add-CommandWords $after[$r + 1] ($Depth + 1) $Sink
                        break
                    }
                }
            }
            if (($words[$k] -eq 'eval') -and ($after.Count -gt 0)) {
                $null = Add-CommandWords ($after -join ' ') ($Depth + 1) $Sink
            }
        }
        if ($runsShell) {
            foreach ($b in $bodies) { $null = Add-CommandWords $b ($Depth + 1) $Sink }
        }
    }

    $commandWords = New-Object System.Collections.Generic.List[object]
    $null = Add-CommandWords $cmd 0 $commandWords

    # ---- 2. GUARD-NESTED-CLAUDE -------------------------------------------
    # A nested session can be launched with hooks disabled, bypassing this
    # entire layer in one command, so a command word that IS claude -- or a
    # path ending in it -- is refused. The same word inside an argument (a
    # commit trailer, a grep pattern) is data and passes. Matching on
    # substrings would also snag .claude/settings.json, which is legitimate.
    foreach ($cw in $commandWords) {
        if (Test-BareVerb ([string]$cw.Head) 'claude') {
            Write-Deny 'GUARD-NESTED-CLAUDE' 'nested-claude-session'
        }
    }

    # ---- 3. GUARD-DYNEXEC --------------------------------------------------
    # The interpreter or cmdlet that runs code must BE the command word; the
    # same text inside an argument passes. Whole words only: '-Encoding' is
    # not '-enc'. 'node -e' and 'node -p' pass when the command names none of
    # child_process, spawn, exec, writeFile, fetch or http; 'node --eval',
    # '--print' and an '--input-type' without -e / -p stay refused.
    $lowCmd = $cmd.ToLowerInvariant()
    $nodeRisky = $false
    foreach ($s in @('child_process', 'spawn', 'exec', 'writefile', 'fetch', 'http')) {
        if ($lowCmd.Contains($s)) { $nodeRisky = $true }
    }
    foreach ($cw in $commandWords) {
        $hw = [string]$cw.Head
        $cwArgs = @($cw.Args)
        $first = ''
        if ($cwArgs.Count -gt 0) { $first = [string]$cwArgs[0] }
        $dyn = $false
        if (@('iex', 'invoke-expression', 'start-process', 'add-type') -contains $hw) { $dyn = $true }
        if ($hw.StartsWith('[scriptblock]')) { $dyn = $true }
        if ((Test-BareVerb $hw 'cmd') -and ($first.StartsWith('/c') -or $first.StartsWith('/k'))) { $dyn = $true }
        if ((Test-BareVerb $hw 'powershell') -or (Test-BareVerb $hw 'pwsh')) {
            if ($first.StartsWith('-') -or ($cwArgs -contains '-enc') -or ($cwArgs -contains '-encodedcommand')) { $dyn = $true }
        }
        if (((Test-BareVerb $hw 'python') -or (Test-BareVerb $hw 'python3')) -and ($first -eq '-c')) { $dyn = $true }
        if (((Test-BareVerb $hw 'perl') -or (Test-BareVerb $hw 'ruby') -or (Test-BareVerb $hw 'bun')) -and ($first -eq '-e')) { $dyn = $true }
        if ((Test-BareVerb $hw 'deno') -and ($first -eq 'eval')) { $dyn = $true }
        if (Test-BareVerb $hw 'node') {
            # An '--input-type=' flag right before -e / -p only picks the
            # script's syntax; the script is judged like any other -e / -p.
            $nodeFirst = $first
            if ($first.StartsWith('--input-type=') -and ($cwArgs.Count -gt 1) -and (@('-e', '-p') -contains [string]$cwArgs[1])) {
                $nodeFirst = [string]$cwArgs[1]
            }
            if (($nodeFirst -eq '--eval') -or ($nodeFirst -eq '--print') -or $nodeFirst.StartsWith('--input-type')) { $dyn = $true }
            if ((($nodeFirst -eq '-e') -or ($nodeFirst -eq '-p')) -and $nodeRisky) { $dyn = $true }
        }
        if ($dyn) { Write-Deny 'GUARD-DYNEXEC' 'dynamic-code-execution' }
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
            # 'git stash list' only reads; every other stash form mutates.
            $stashList = (($sub -eq 'stash') -and ($gargs.Count -gt 0) -and ($gargs[0] -eq 'list'))
            if (-not $stashList) { Write-Deny 'GUARD-GIT' "forbidden-git-subcommand" }
        }

        if ($sub -eq 'push') {
            # Gated push (CLAUDE.md "Agent autonomy"): the ONE permitted
            # form is an explicit, flag-free push of mainexpo to origin --
            # 'git push origin mainexpo' (or 'origin mainexpo:mainexpo'),
            # with no -c / --git-dir / --work-tree prefix. Anything else --
            # any flag (--force, -f, --force-with-lease, --delete, --mirror,
            # --tags, --all, -u, ...), any other remote, ref or refspec, or
            # a bare 'git push' -- is blocked. Allow-list, never block-list.
            # A trailing '2>&1' only merges stderr into stdout and is not an
            # argument; a '| tail ...' already ends the call's arguments.
            $pushOk = $false
            $pa = @($call.Args | Where-Object { $_ -ne '2>&1' })
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
    function Test-ReadOnlyGit {
        # True when every segment is git status / log / diff / stash list,
        # or tail / head reading their output.
        $sawGit = $false
        foreach ($segment in ($low -split '\|\||&&|\||;')) {
            $s = $segment.Trim()
            if ($s -eq '') { continue }
            $w = $s.Split(' ')
            if (Test-GitVerb $w[0]) {
                $j = 1
                while ($j -lt $w.Length) {
                    if ($w[$j] -eq '-c') { $j += 2; continue }
                    if ($w[$j].StartsWith('--git-dir=') -or $w[$j].StartsWith('--work-tree=')) { $j++; continue }
                    break
                }
                $s1 = ''
                if ($j -lt $w.Length) { $s1 = $w[$j] }
                $s2 = ''
                if (($j + 1) -lt $w.Length) { $s2 = $w[$j + 1] }
                if ((@('status', 'log', 'diff') -contains $s1) -or (($s1 -eq 'stash') -and ($s2 -eq 'list'))) {
                    $sawGit = $true
                    continue
                }
                return $false
            }
            if ((Test-BareVerb $w[0] 'tail') -or (Test-BareVerb $w[0] 'head')) { continue }
            return $false
        }
        return $sawGit
    }

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
            # Read-only git (status, log, diff, stash list -- optionally piped
            # through tail or head) may carry '2>&1': it merges stderr into
            # stdout and writes no file.
            $redirectText = $low
            if (Test-ReadOnlyGit) { $redirectText = $low.Replace('2>&1', '') }
            if ($redirectText.Contains('>')) { $hit = $true }
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
