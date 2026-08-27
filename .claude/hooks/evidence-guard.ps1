$ErrorActionPreference = "Stop"
try { $j = [Console]::In.ReadToEnd() | ConvertFrom-Json } catch { exit 0 }
$tool  = "$($j.tool_name)"
$allow = "$env:BRAZOS_EVIDENCE"
function Block($msg) { [Console]::Error.Write($msg); exit 2 }
$path = "$($j.tool_input.file_path)"
$cmd  = "$($j.tool_input.command)"

if ($tool -eq "Read") {
  if ($path -match "\.(png|jpe?g|gif|webp|heic|bmp|tif|tiff)$" -and $allow -notmatch "images") {
    Block "BLOCKED by BRAZOS evidence guard: image reads require operator authorization and this run was launched without it. Do not try other image files. Use the code, the style tokens, BRAZOS_MOCKUP_MANIFEST.md, or scripted pixel analysis (node/python) instead. If an item genuinely cannot be done without visual inspection, SKIP it and record that in the final report."
  }
  if ($path -match "docs[\\/](archive|handoff-archive)([\\/]|$)" -and $allow -notmatch "archive") {
    Block "BLOCKED by BRAZOS evidence guard: bulk history under docs/archive and docs/handoff-archive requires operator authorization. HANDOFF.md live edge is the source of truth. If a specific archived record is truly required, SKIP the dependent item and record it in the final report."
  }
}
if ($tool -match "^(Task|Agent)$" -and $allow -notmatch "subagents") {
  Block "BLOCKED by BRAZOS evidence guard: subagents require operator authorization for this run. Do the work single-threaded in this session."
}
if ($tool -match "^(Write|Edit|MultiEdit|NotebookEdit)$") {
  if ($path -match "(^|[\\/])\.claude([\\/]|$)") {
    Block "BLOCKED by BRAZOS evidence guard: .claude/ is operator-only. Skip this step and record it in the final report."
  }
}
if ($tool -match "^(Bash|PowerShell)$") {
  if ($cmd -match "BRAZOS_EVIDENCE" -or $cmd -match "dangerously-skip-permissions") {
    Block "BLOCKED by BRAZOS evidence guard: touching the guard authorization or launching nested Claude sessions is operator-only."
  }
  if ($cmd -match "\.claude\b" -and $cmd -match "(>|Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item|\brm\b|\bmv\b|\bcp\b|\bdel\b|\btee\b|sed\s+-i)") {
    Block "BLOCKED by BRAZOS evidence guard: this command combines .claude/ with a write-capable operation. .claude/ is operator-only. Re-issue as a pure read or skip this step."
  }
}
exit 0
