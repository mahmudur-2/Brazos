<#
dispatch.ps1 - start ONE dispatch run and report on it.

Replaces pasting chainA.ps1's whole block into PowerShell. One line at the
prompt, from the repository root:

    powershell -ExecutionPolicy Bypass -File scripts\dispatch\dispatch.ps1 -Prompt docs\dispatch\<name>.md -Model claude-opus-5 -Effort max

WHY THE PARAMETERS ARE PLAIN STRINGS AND NOTHING IS Mandatory.
PowerShell prompts for a missing mandatory parameter and then WAITS. An
unattended run that waits is a lost night, and the wait is silent - the phone
push never arrives because the agent never started. So every parameter is an
ordinary [string], and the missing-argument check below is written by hand and
exits with a message instead.

WHAT THIS SCRIPT DOES NOT DO. It does not check the prompt. preflight.ps1 stays
where it is, in the operator's runs folder, and stays the gate before dispatch;
replacing the launcher and moving the checker at the same time is two changes
fighting each other.
#>

param(
  # The four arguments the operator types.
  [string]$Prompt,
  [string]$Model,
  [string]$Effort,
  [string]$Mode = 'bypass',

  # Print the banner and exit without starting anything. This is how the banner
  # is verified without launching an agent - a run is forbidden to start one.
  [switch]$NoLaunch,

  # The ntfy topic the phone is already subscribed to. Outside the repository
  # because that is where it has always lived; read only, never written.
  [string]$TopicFile = (Join-Path $env:USERPROFILE 'runs\ntfy-topic.txt')
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$handoff  = Join-Path $repoRoot 'HANDOFF.md'
$logDir   = Join-Path $repoRoot '.audit-scratch\dispatch'
$stamp    = Get-Date -Format 'yyyy-MM-dd_HHmm'

function Say { param($m) Write-Host ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $m) }

# ---------------------------------------------------------------------------
# 1. MISSING ARGUMENTS - before anything starts, and before any push.
# ---------------------------------------------------------------------------
$missing = @()
if ([string]::IsNullOrWhiteSpace($Prompt)) { $missing += '-Prompt (the prompt file)' }
if ([string]::IsNullOrWhiteSpace($Model))  { $missing += '-Model (no default; name the model)' }
if ([string]::IsNullOrWhiteSpace($Effort)) { $missing += '-Effort (no default; name the effort level)' }

if ($missing.Count -gt 0) {
  Write-Host ''
  Write-Host 'NOT LAUNCHED - a required argument is missing:' -ForegroundColor Red
  foreach ($m in $missing) { Write-Host ('  missing ' + $m) -ForegroundColor Red }
  Write-Host ''
  Write-Host 'Nothing was started. Add the argument above and run the line again.'
  exit 2
}

$promptPath = $Prompt
if (-not [System.IO.Path]::IsPathRooted($promptPath)) { $promptPath = Join-Path $repoRoot $Prompt }
if (-not (Test-Path -LiteralPath $promptPath)) {
  Write-Host ''
  Write-Host ('NOT LAUNCHED - the prompt file does not exist: ' + $promptPath) -ForegroundColor Red
  Write-Host 'Nothing was started.'
  exit 2
}
$promptPath = (Resolve-Path -LiteralPath $promptPath).Path

# ---------------------------------------------------------------------------
# 2. BANNER - every line read back from the variable actually in use.
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '=============================================================='
Write-Host ('  prompt : ' + $promptPath)
Write-Host ('  model  : ' + $Model)
Write-Host ('  effort : ' + $Effort)
Write-Host ('  mode   : ' + $Mode)
Write-Host '=============================================================='
Write-Host ''

# Warn, never block. The fast model at the highest effort level buys less than
# it costs; the operator may still want it, so this is a warning and the run
# continues.
if (($Model -match '(?i)fable') -and ($Effort -match '(?i)^max$')) {
  Write-Host 'WARNING: fast model at the highest effort level. That pairing costs the' -ForegroundColor Yellow
  Write-Host '         most and gains the least. Continuing anyway.' -ForegroundColor Yellow
  Write-Host ''
}

if ($NoLaunch) {
  Say 'NoLaunch: banner only. Nothing started, HANDOFF.md untouched.'
  exit 0
}

# ---------------------------------------------------------------------------
# 3. PHONE - ported verbatim from chainA.ps1 against the same topic file.
#    The provisioning branch is NOT ported: it calls Read-Host, and a prompt
#    that waits for Enter hangs an unattended run.
# ---------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $TopicFile)) {
  Write-Host ''
  Write-Host ('NOT LAUNCHED - no ntfy topic file at ' + $TopicFile) -ForegroundColor Red
  Write-Host 'The phone would get no push, so nothing was started.'
  exit 2
}
$topic = (Get-Content -LiteralPath $TopicFile -Raw).Trim()

function Push-Phone($title, $msg, $prio) {
  try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$topic" -Body $msg -ContentType 'text/plain' -Headers @{ Title = $title; Priority = $prio } -TimeoutSec 20 | Out-Null }
  catch { Say "push failed: $($_.Exception.Message)" }
}

# ---------------------------------------------------------------------------
# 4. THE AGENT COMMAND
# ---------------------------------------------------------------------------
# -Mode is passed straight through as --permission-mode, EXCEPT the value
# 'bypass', which expands to the two flags chainA.ps1 has launched with since
# night 1. One or the other is required: a run that stops to ask a question at
# 03:00 is a wasted night.
$modeArgs = @()
if ($Mode -match '(?i)^bypass$') { $modeArgs = @('--dangerously-skip-permissions', '--permission-prompts', 'none') }
else { $modeArgs = @('--permission-mode', $Mode) }

$task = "Read $promptPath in full and execute it exactly as written."
$agentArgs = @('-p', '--model', $Model, '--effort', $Effort) + $modeArgs + @('--verbose', $task)

$runName  = [System.IO.Path]::GetFileNameWithoutExtension($promptPath)
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath  = Join-Path $logDir ($runName + '-' + $stamp + '.log')
$exitFile = Join-Path $logDir ($runName + '-' + $stamp + '.exit')

# ---------------------------------------------------------------------------
# 5. HANDOFF.md - the START line goes in before the agent starts.
# ---------------------------------------------------------------------------
function Add-HandoffLine {
  param([string]$Line)
  try {
    if (-not (Test-Path -LiteralPath $handoff)) { return }
    $body = Get-Content -LiteralPath $handoff -Raw
    if ($body -notmatch '(?m)^## Dispatch log\s*$') {
      Add-Content -LiteralPath $handoff -Value "`r`n## Dispatch log`r`n" -Encoding UTF8
    }
    Add-Content -LiteralPath $handoff -Value $Line -Encoding UTF8
  } catch {
    Say ('could not write the HANDOFF line: ' + $_.Exception.Message)
  }
}

$script:finished = $false
$script:lastCode = 1

Add-HandoffLine ("DISPATCH START $(Get-Date -Format 'yyyy-MM-dd HH:mm') - prompt $runName, model $Model, effort $Effort, mode $Mode, log $logPath")

try {
  Say ("LAUNCH $runName (model $Model, effort $Effort, mode $Mode)")
  Say ("log: $logPath")
  Push-Phone "LAUNCH $runName" "model $Model, effort $Effort, mode $Mode" 'default'

  $attempt = 0
  $maxRetries = 2

  while ($true) {
    Remove-Item -LiteralPath $exitFile -Force -ErrorAction SilentlyContinue

    # A BACKGROUND JOB, NOT A SYNCHRONOUS CALL. chainA.ps1 calls the agent
    # synchronously, which means nothing can be checked until it returns - the
    # ninety-second liveness check below is impossible as those scripts are
    # written. The job writes its exit code to a file so the parent reads a
    # number rather than guessing from the pipeline.
    $job = Start-Job -ScriptBlock {
      param($Repo, $AgentArgs, $Log, $ExitFile)
      Set-Location $Repo
      & 'claude' @AgentArgs *>&1 | ForEach-Object { "$_" } | Out-File -FilePath $Log -Append -Encoding utf8
      "$LASTEXITCODE" | Set-Content -LiteralPath $ExitFile -Encoding ASCII
    } -ArgumentList $repoRoot, $agentArgs, $logPath, $exitFile

    # --- ninety-second liveness check ---
    $size0 = 0
    if (Test-Path -LiteralPath $logPath) { $size0 = (Get-Item -LiteralPath $logPath).Length }
    Start-Sleep -Seconds 90
    $size1 = 0
    if (Test-Path -LiteralPath $logPath) { $size1 = (Get-Item -LiteralPath $logPath).Length }

    if ($job.State -ne 'Running') {
      Say 'the agent already finished inside the first ninety seconds'
      Push-Phone "ALIVE $runName" 'finished inside the first 90 s' 'min'
    } elseif ($size1 -gt $size0) {
      Say ('ALIVE - the log grew ' + ($size1 - $size0) + ' bytes in ninety seconds')
      Push-Phone "ALIVE $runName" ("log grew " + ($size1 - $size0) + " bytes in 90 s") 'min'
    } else {
      Say 'STALLED - the log has not grown in ninety seconds'
      Push-Phone "STALLED $runName" 'the log has not grown in 90 s - it may be waiting on something' 'high'
    }

    Wait-Job $job | Out-Null
    Receive-Job $job -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $job -Force -ErrorAction SilentlyContinue

    $code = 1
    if (Test-Path -LiteralPath $exitFile) {
      $raw = (Get-Content -LiteralPath $exitFile -Raw).Trim()
      if ($raw -match '^\d+$') { $code = [int]$raw }
    }
    $script:lastCode = $code
    Say ("EXIT $runName code $code")

    $tail = ''
    if (Test-Path -LiteralPath $logPath) { $tail = (Get-Content -LiteralPath $logPath -Tail 40) -join "`n" }

    # The run stopped itself and named what it needs. Retrying that is waste.
    if ($tail -match '(?m)^\s*RUN STOPPED') {
      Say 'the run stopped itself - read NEEDS THE OPERATOR in its report'
      Push-Phone "STOPPED $runName" 'the run stopped itself - read NEEDS THE OPERATOR in its report' 'high'
      $script:finished = $true
      break
    }

    if ($code -eq 0) {
      Say "$runName DONE"
      Push-Phone "DONE $runName" "exit 0" 'low'
      $script:finished = $true
      break
    }

    if ($attempt -ge $maxRetries) {
      Say ("FAILED $runName after " + ($attempt + 1) + ' attempts')
      Push-Phone "FAILED $runName" ("exit $code after " + ($attempt + 1) + ' attempts') 'high'
      $script:finished = $true
      break
    }

    $attempt++
    $why = "exit $code"
    if ($tail -match '(?i)\b429\b|rate.?limit|overloaded|usage limit') { $why = 'a 429 / limit message in the output' }
    Say ("RETRY $runName in 20 min ($why, attempt $attempt of $maxRetries)")
    Push-Phone "RETRY $runName" "$why - waiting 20 min, attempt $attempt of $maxRetries" 'default'
    Start-Sleep -Seconds 1200
  }
}
finally {
  if (-not $script:finished) {
    $last = ''
    if (Test-Path -LiteralPath $logPath) {
      $lines = @(Get-Content -LiteralPath $logPath | Where-Object { $_.Trim() -ne '' })
      if ($lines.Count -gt 0) { $last = ($lines[-1]).Trim() }
    }
    Add-HandoffLine ("DISPATCH STOPPED $(Get-Date -Format 'yyyy-MM-dd HH:mm') - exit $($script:lastCode) - last log line: $last")
    Push-Phone "STOPPED $runName" "the launcher died - exit $($script:lastCode) - $last" 'high'
  } else {
    Add-HandoffLine ("DISPATCH END $(Get-Date -Format 'yyyy-MM-dd HH:mm') - exit $($script:lastCode) - log $logPath")
  }
}

exit $script:lastCode
