# apply-lean-settings.ps1 - replaces the repo's .claude guard hooks with a plain deny list.
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File docs\proposed\apply-lean-settings.ps1
# Undo: copy everything back from the backup folder this script prints.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$claudeDir = Join-Path $root '.claude'
$stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
$backup = Join-Path $root "_archive\2026-11-lean\claude-hooks-$stamp"

New-Item -ItemType Directory -Force -Path $backup | Out-Null
Copy-Item -Path (Join-Path $claudeDir '*') -Destination $backup -Recurse -Force
Write-Host "Backup of .claude written to $backup"

foreach ($name in @('hooks', '_claude_bak')) {
  $p = Join-Path $claudeDir $name
  if (Test-Path $p) { Remove-Item -Recurse -Force $p; Write-Host "removed .claude\$name" }
}
$local = Join-Path $claudeDir 'settings.local.json'
if (Test-Path $local) { Remove-Item -Force $local; Write-Host "removed .claude\settings.local.json" }

Copy-Item -Path (Join-Path $PSScriptRoot 'lean-settings.json') -Destination (Join-Path $claudeDir 'settings.json') -Force
Write-Host "wrote .claude\settings.json (plain deny list, no hooks)"
Write-Host "kept .claude\rules (project rules)"
Write-Host "DONE. If Claude still reports guard blocks, start a fresh chat: hooks load at session start."
