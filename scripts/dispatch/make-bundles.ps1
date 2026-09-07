#requires -Version 5.1
<#
  BRAZOS — project knowledge bundle generator.

  Concatenates the repo's text sources into a handful of .txt files sized to
  fit Claude's project-knowledge budget, which is a TOKEN budget, not the
  30 MB per-file limit. Code is token-dense, so the practical ceiling is
  roughly 5.3 MB of source across all uploaded files.

  Never reads or writes anything inside the repo. Output goes to $Out.

  Usage (plain PowerShell, from anywhere):
      powershell -File C:\Users\mdmah\runs\make-bundles.ps1

  Deliberately EXCLUDED and never written into a bundle:
      .env  ·  start.ps1  ·  .git  ·  node_modules  ·  ios  ·  android
      dist  ·  coverage  ·  .expo  ·  .shots  ·  .audit-scratch
      package-lock.json
      docs\audit  docs\audits  docs\dispatch  docs\device-captures  docs\cleanup
#>

[CmdletBinding()]
param(
  [string]$Repo  = 'C:\Users\mdmah\BRAZOS',
  [string]$Out   = 'C:\Users\mdmah\runs\bundles',
  [int]   $MaxKB = 600
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Repo)) { throw "Repo not found: $Repo" }
$Repo = (Resolve-Path -LiteralPath $Repo).Path

# --- what counts as source -------------------------------------------------
$Extensions = @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json',
                '.md', '.sql', '.yml', '.yaml', '.css', '.html')

# --- hard exclusions -------------------------------------------------------
$ExcludeDirs = @('.git', 'node_modules', 'ios', 'android', 'dist', 'coverage',
                 '.expo', '.shots', '.audit-scratch', '.vscode', '.idea',
                 'docs\audit', 'docs\audits', 'docs\dispatch',
                 'docs\device-captures', 'docs\cleanup')

$ExcludeFiles = @('start.ps1', '.env', '.env.local', 'package-lock.json',
                  'yarn.lock', 'pnpm-lock.yaml')

# --- grouping: first path segment -> bundle name ---------------------------
$GroupOf = [ordered]@{
  'lib'         = 'lib'
  'ui'          = 'ui'
  'screens'     = 'screens'
  'components'  = 'components'
  'hooks'       = 'hooks'
  'navigation'  = 'navigation'
  'modes'       = 'navigation'
  'scripts'     = 'scripts'
  'supabase'    = 'supabase'
  'docs'        = 'docs'
  'tests'       = 'tests'
  'dev-tools'   = 'misc'
  'assets'      = $null      # binaries; skipped
  '.claude'     = $null      # agent config; skipped
}

function Get-Group([string]$Relative) {
  $head = ($Relative -split '\\')[0]
  if ($Relative -notmatch '\\') { return 'app-root' }
  if ($GroupOf.Contains($head)) { return $GroupOf[$head] }
  return 'misc'
}

function Test-Excluded([string]$Relative, [string]$Name) {
  foreach ($d in $ExcludeDirs) {
    if ($Relative -eq $d -or $Relative.StartsWith("$d\", 'OrdinalIgnoreCase')) { return $true }
  }
  foreach ($f in $ExcludeFiles) {
    if ($Name -eq $f) { return $true }
  }
  return $false
}

# --- collect ---------------------------------------------------------------
Write-Host "Scanning $Repo ..." -ForegroundColor Cyan

$files = Get-ChildItem -LiteralPath $Repo -Recurse -File |
  Where-Object { $Extensions -contains $_.Extension.ToLower() }

$buckets = @{}
$skipped = 0

foreach ($f in $files) {
  $rel = $f.FullName.Substring($Repo.Length + 1)
  if (Test-Excluded $rel $f.Name) { $skipped++; continue }
  $group = Get-Group $rel
  if ($null -eq $group) { $skipped++; continue }
  if (-not $buckets.ContainsKey($group)) { $buckets[$group] = New-Object System.Collections.ArrayList }
  [void]$buckets[$group].Add([pscustomobject]@{ Rel = $rel; Full = $f.FullName })
}

# --- write -----------------------------------------------------------------
if (Test-Path -LiteralPath $Out) {
  Get-ChildItem -LiteralPath $Out -Filter 'brazos-*.txt' -File | Remove-Item -Force
} else {
  New-Item -ItemType Directory -Path $Out -Force | Out-Null
}

$utf8 = New-Object System.Text.UTF8Encoding($false)   # UTF-8, no BOM
$maxBytes = $MaxKB * 1024
$written = New-Object System.Collections.ArrayList

foreach ($group in ($buckets.Keys | Sort-Object)) {
  $part = 1
  $sb = New-Object System.Text.StringBuilder

  function Flush-Part {
    param($Group, [ref]$Part, [ref]$Builder)
    if ($Builder.Value.Length -eq 0) { return }
    $path = Join-Path $Out ("brazos-{0}-{1}.txt" -f $Group, $Part.Value)
    [System.IO.File]::WriteAllText($path, $Builder.Value.ToString(), $utf8)
    [void]$written.Add([pscustomobject]@{
      File  = Split-Path $path -Leaf
      Group = $Group
      KB    = [math]::Round((Get-Item -LiteralPath $path).Length / 1KB, 1)
    })
    $Part.Value++
    $Builder.Value = New-Object System.Text.StringBuilder
  }

  foreach ($item in ($buckets[$group] | Sort-Object Rel)) {
    $body = [System.IO.File]::ReadAllText($item.Full)
    $chunk = "`r`n===== FILE: $($item.Rel) =====`r`n`r`n$body`r`n"

    if ($sb.Length -gt 0 -and ($sb.Length + $chunk.Length) -gt $maxBytes) {
      Flush-Part -Group $group -Part ([ref]$part) -Builder ([ref]$sb)
    }
    [void]$sb.Append($chunk)
  }
  Flush-Part -Group $group -Part ([ref]$part) -Builder ([ref]$sb)
}

# --- report ----------------------------------------------------------------
Write-Host ""
$written | Sort-Object File | Format-Table File, KB -AutoSize

$testKB  = ($written | Where-Object { $_.Group -eq 'tests' } | Measure-Object KB -Sum).Sum
$totalKB = ($written | Measure-Object KB -Sum).Sum
$uploadKB = $totalKB - $testKB

Write-Host ""
Write-Host ("Files written : {0}" -f $written.Count)
Write-Host ("Sources        : {0} included, {1} excluded" -f ($files.Count - $skipped), $skipped)
Write-Host ("Total          : {0} MB" -f [math]::Round($totalKB / 1024, 2))
Write-Host ("Tests          : {0} MB   <-- DO NOT UPLOAD" -f [math]::Round($testKB / 1024, 2)) -ForegroundColor Yellow
Write-Host ("To upload      : {0} MB" -f [math]::Round($uploadKB / 1024, 2)) -ForegroundColor Green

if ($uploadKB / 1024 -gt 5.4) {
  Write-Host ""
  Write-Host "OVER BUDGET. Project knowledge refuses above roughly 5.4 MB." -ForegroundColor Red
  Write-Host "Drop the largest docs bundle and re-check." -ForegroundColor Red
}

Write-Host ""
Write-Host "Output: $Out"
Write-Host "Upload every brazos-*.txt EXCEPT brazos-tests-*.txt"
