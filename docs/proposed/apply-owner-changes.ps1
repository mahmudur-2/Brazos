Set-Location C:\Users\mdmah\BRAZOS -ErrorAction Stop
# apply-owner-changes.ps1 -- applies the 2026-10-06 token-diet proposals to the files only the
# owner changes: CLAUDE.md, .claude/settings.json, .claude/rules/ and .claude/hooks/guard.ps1.
# Written by that run and NOT run by it. Run it yourself in Windows PowerShell, with every Claude
# Code window on this project closed:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\mdmah\BRAZOS\docs\proposed\apply-owner-changes.ps1
#
# It stops at the first error. It checks everything before it changes anything, backs the four
# targets up first, and refuses to run a second time: a second run would back the changed files
# up over the originals.
$ErrorActionPreference = 'Stop'

$root   = 'C:\Users\mdmah\BRAZOS'
$backup = 'C:\Users\mdmah\.claude\backups\brazos-2026-10-06'
$utf8   = New-Object System.Text.UTF8Encoding $false

$proposedClaude = Join-Path $root 'docs\proposed\CLAUDE.md'
$proposedGuard  = Join-Path $root 'docs\proposed\guard.ps1'
$ruleNames      = @('supabase.md', 'native-ui.md')
$claudeMd       = Join-Path $root 'CLAUDE.md'
$settings       = Join-Path $root '.claude\settings.json'
$rulesDir       = Join-Path $root '.claude\rules'
$guard          = Join-Path $root '.claude\hooks\guard.ps1'
$marker         = 'moved from CLAUDE.md, 2026-10-06'

# ---- 1. check everything first; nothing has changed if this part stops ----------------------
foreach ($p in @($proposedClaude, $proposedGuard, $claudeMd, $settings, $guard)) {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw "Missing file: $p. Nothing was changed." }
}
foreach ($name in $ruleNames) {
    $src = Join-Path $root ('docs\proposed\rules\' + $name)
    $dst = Join-Path $rulesDir $name
    if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { throw "Missing file: $src. Nothing was changed." }
    if (-not (Test-Path -LiteralPath $dst -PathType Leaf)) { throw "Missing file: $dst. Nothing was changed." }
    if (([System.IO.File]::ReadAllText($dst, $utf8)).Contains($marker)) {
        throw "$dst already carries the appended section, so these changes look applied already. Nothing was changed."
    }
}
if (Test-Path -LiteralPath $backup) {
    throw "The backup folder already exists ($backup), so these changes look applied already. Nothing was changed."
}
$null = Get-Command node -ErrorAction Stop

# ---- 2. back up the four targets ---------------------------------------------------------------
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $claudeMd -Destination (Join-Path $backup 'CLAUDE.md')
Copy-Item -LiteralPath $settings -Destination (Join-Path $backup 'settings.json')
Copy-Item -LiteralPath $guard -Destination (Join-Path $backup 'guard.ps1')
Copy-Item -LiteralPath $rulesDir -Destination (Join-Path $backup 'rules') -Recurse
Write-Output "Backed up to $backup"

$restore = "Copy-Item '$backup\CLAUDE.md' '$claudeMd' -Force; Copy-Item '$backup\settings.json' '$settings' -Force; Copy-Item '$backup\guard.ps1' '$guard' -Force; Copy-Item '$backup\rules\*' '$rulesDir' -Force"

try {
    # ---- 3. CLAUDE.md ----------------------------------------------------------------------------
    Copy-Item -LiteralPath $proposedClaude -Destination $claudeMd -Force
    Write-Output 'CLAUDE.md replaced by docs\proposed\CLAUDE.md'

    # ---- 4. the two rule files: the proposed text goes on the end --------------------------------
    foreach ($name in $ruleNames) {
        $src = Join-Path $root ('docs\proposed\rules\' + $name)
        $dst = Join-Path $rulesDir $name
        $text = [System.IO.File]::ReadAllText($src, $utf8)
        if (-not ([System.IO.File]::ReadAllText($dst, $utf8)).EndsWith("`n")) { $text = "`n" + $text }
        [System.IO.File]::AppendAllText($dst, $text, $utf8)
        Write-Output ".claude\rules\$name appended"
    }

    # ---- 5. the guard ------------------------------------------------------------------------------
    Copy-Item -LiteralPath $proposedGuard -Destination $guard -Force
    Write-Output '.claude\hooks\guard.ps1 replaced by docs\proposed\guard.ps1'

    # ---- 6. settings.json: claudeMdExcludes, by parsing and writing the JSON -----------------------
    # Keeps the file's line endings and final-newline choice; re-parses what it wrote.
    $js = @'
const fs = require('fs');
const file = process.argv[2];
const raw = fs.readFileSync(file, 'utf8');
const obj = JSON.parse(raw.replace(/^\uFEFF/, ''));
const have = Array.isArray(obj.claudeMdExcludes) ? obj.claudeMdExcludes : [];
obj.claudeMdExcludes = [...new Set([...have, '**/.shots/**'])];
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
fs.writeFileSync(file, JSON.stringify(obj, null, 2).replace(/\n/g, eol) + (raw.endsWith('\n') ? eol : ''));
JSON.parse(fs.readFileSync(file, 'utf8'));
console.log('.claude\\settings.json: claudeMdExcludes = ' + JSON.stringify(obj.claudeMdExcludes));
'@
    $jsFile = Join-Path $backup 'add-claudeMdExcludes.cjs'
    [System.IO.File]::WriteAllText($jsFile, $js, $utf8)
    & node $jsFile $settings
    if ($LASTEXITCODE -ne 0) { throw "node could not update $settings (exit $LASTEXITCODE)" }
} catch {
    Write-Output ''
    Write-Output "STOPPED: $($_.Exception.Message)"
    Write-Output 'Nothing after that step ran. To put the backups back, run this one command:'
    Write-Output $restore
    exit 1
}

Write-Output ''
Write-Output 'ALL APPLIED'
Write-Output 'To put the backups back, run this one command:'
Write-Output $restore
