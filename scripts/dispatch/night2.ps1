& {
  $runs  = 'C:\Users\mdmah\runs'
  $repo  = 'C:\Users\mdmah\BRAZOS'
  $night = "$repo\.shots\night1"
  $base  = 'b4f4d3d'
  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
  foreach ($d in @("$runs\night1", "$runs\reports\night1", "$night\prompts", "$night\reports", "$night\preflight", "$night\cleared")) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  try { Start-Transcript -Path "$runs\reports\night1\chain-$stamp.log" -Append | Out-Null } catch {}

  function Say($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }
  function Stop-Chain($name, $why) {
    "STOPPED $name at $(Get-Date -Format 'yyyy-MM-dd HH:mm') - $why" | Set-Content -Path "$runs\reports\night1\STOPPED-$name.txt" -Encoding ASCII
    Say "STOPPED $name - $why"
  }
  function Get-Preflight($promptPath) {
    Push-Location $runs
    $out = (& "$runs\preflight.ps1" -Prompt $promptPath *>&1 | ForEach-Object { "$_" }) -join "`n"
    Pop-Location
    return $out
  }
  function Test-Ready($pre) { return (($pre -match '(?m)^\s*READY') -and ($pre -notmatch '(?m)^\s*NOT READY')) }
  function Get-LastLine($path) {
    if (-not (Test-Path $path)) { return '' }
    $lines = @(Get-Content $path | Where-Object { $_.Trim() -ne '' })
    if ($lines.Count -eq 0) { return '' }
    return ($lines[-1]).Trim()
  }
  function Test-Complete($name) { return ((Get-LastLine "$night\reports\$name.md") -eq "RUN COMPLETE $name") }
  function Test-SelfStopped($name) { return ((Get-LastLine "$night\reports\$name.md") -like "RUN STOPPED*") }
  function Test-RepoGate($requireClean) {
    git -C $repo fetch origin mainexpo 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { return 'git fetch failed' }
    git -C $repo merge-base --is-ancestor $base HEAD 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { return "HEAD is not a descendant of $base" }
    git -C $repo merge-base --is-ancestor origin/mainexpo HEAD 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { return 'HEAD is behind origin/mainexpo' }
    if ($requireClean) {
      $st = ((git -C $repo status --porcelain) -join '').Trim()
      if ($st -ne '') { return 'working tree not clean' }
      $h = (git -C $repo rev-parse HEAD).Trim(); $r = (git -C $repo rev-parse origin/mainexpo).Trim()
      if ($h -ne $r) { return "HEAD $h is not origin/mainexpo $r (unpushed)" }
    }
    return ''
  }
  function Invoke-Claude($name, $promptPath, $effort, $resumed, $extra) {
    $report = "$night\reports\$name.md"
    if ($resumed) {
      $task = "This is a RESUMED run. Read $promptPath in full. Then read $report and run: git log $base..HEAD --oneline. Skip every step already marked STEP n DONE in that report or already committed. Continue from the first unfinished step and execute the rest exactly as written."
    } else {
      $task = "Read $promptPath in full and execute it exactly as written."
    }
    if ($extra) { $task = "$task $extra" }
    Say "LAUNCH $name (claude-fable-5-1, effort $effort, resumed=$resumed)"
    Push-Location $repo
    claude -p --model claude-fable-5-1 --effort $effort --dangerously-skip-permissions --permission-prompts none --verbose $task
    $code = $LASTEXITCODE
    Pop-Location
    Say "EXIT $name code $code"
  }
  function Publish-Report($name) {
    if (Test-Path "$night\reports\$name.md") { Copy-Item "$night\reports\$name.md" "$runs\reports\night1\$name.md" -Force }
  }

  # ---------- 0. environment ----------
  Say "chain log: $runs\reports\night1\chain-$stamp.log"
  docker info *>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Chain 'env' 'Docker is not running. Start Docker Desktop, wait for it, paste this block again.'; Stop-Transcript | Out-Null; return }
  npx --yes eas-cli whoami *>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Chain 'env' 'EAS is not logged in. Run: npx --yes eas-cli login  then paste again.'; Stop-Transcript | Out-Null; return }
  gh auth status *>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Chain 'env' 'gh is not logged in. Run: gh auth login --web --hostname github.com  then paste again.'; Stop-Transcript | Out-Null; return }
  if (-not (Test-Complete 'plan') -or -not (Test-Complete 'verify')) { Stop-Chain 'env' 'plan.md or verify.md is not complete - this block expects night 1 to have run'; Stop-Transcript | Out-Null; return }
  $g = Test-RepoGate $false
  if ($g) { Stop-Chain 'env' $g; Stop-Transcript | Out-Null; return }
  Say ("repo gate OK at " + (git -C $repo rev-parse --short HEAD).Trim())

  # ---------- 1. operator clearances on the verifier's evidence ----------
  # verify.md: n1, n5, n8 failed ONLY check 6 (a stale preflight file); the refreshed preflight printed READY for all three.
  foreach ($n in @('n1-nearby-schema','n5-first-session','n8-hygiene')) {
    $nc = "$night\cleared\NOT-CLEARED-$n.txt"; $c = "$night\cleared\CLEARED-$n.txt"
    if ((Test-Path $nc) -and -not (Test-Path $c)) {
      $txt = Get-Content $nc -Raw
      "OPERATOR-CLEARED $(Get-Date -Format 'yyyy-MM-dd HH:mm'): verify.md records checks 1-5 and 7 PASS; check 6 failed on a stale preflight file; refreshed preflight READY.`r`n`r`n--- verifier's file follows ---`r`n$txt" | Set-Content -Path $c -Encoding ASCII
      Say "operator-cleared $n"
    }
  }

  # ---------- 2. n9-sentry: n4's STEP 3 as its own run ----------
  $n9 = @"
n9-sentry - Sentry captures at handled-failure sites. Model: Fable xhigh. NON-INTERACTIVE. Single-threaded (subagents are denied by the hooks; do not request them).

Constraints come from CLAUDE.md and the .claude/ deny matrix AS THEY EXIST AT RUN START; read them first and honor them as binding. This prompt supersedes docs/dispatch/ files ONLY - it never adds to, overrides, or restates CLAUDE.md or the deny matrix.

BASE GATE
git merge-base --is-ancestor b4f4d3d HEAD must exit 0 (do not run git fetch; the deny matrix refuses it). FRESH start: git status --porcelain empty and HEAD equal to the local origin/mainexpo. RESUMED start (the launcher's message says so): read .shots/night1/reports/n9-sentry.md and git log b4f4d3d..HEAD --oneline; skip what is already committed; a dirty tree whose diff belongs to this run's single step may be completed; any other dirty tree is a stop.

WHAT THIS RUN IS
Open .shots/night1/prompts/n4-money-ops.txt and read it in full. This run executes that prompt's STEP 3 (Sentry captureException beside console.error at handled-failure sites in app code, through lib/observability/sentry.ts, keeping console.error, tests/observability.test.mjs invariants green, edge functions untouched) exactly as written there, as this run's ONLY step, one commit, under every template clause of that prompt: its READS for that step, its proof (npm run verify green before the commit), its push after the commit (git push origin mainexpo), its shell rules, its genuine stops, its VERBATIM FOR THE OPERATOR and NEEDS THE OPERATOR sections. STEPS 1, 2 and 4 of that prompt are NOT this run's; do not touch process-settlements, the Payouts screen or Maestro. It was split out of n4 because money code keeps its own revert boundary (docs/BACKLOG.md line 15): this commit touches no money file.

NEW FILES this run creates: .shots/night1/reports/n9-sentry.md (gitignored). Report written with the Write or Edit tool, never a shell redirect; the word "claude" never inside a Bash command. Report format as n4's prompt defines it, with STEP 1 DONE <short sha> <one line> after the commit; last line exactly: RUN COMPLETE n9-sentry
"@
  Set-Content -Path "$night\prompts\n9-sentry.txt" -Value $n9 -Encoding ASCII
  if (-not (Test-Path "$night\cleared\CLEARED-n9-sentry.txt")) {
    "OPERATOR-CLEARED $(Get-Date -Format 'yyyy-MM-dd HH:mm'): this run is n4-money-ops STEP 3 verbatim, which passed verifier checks 1-4, 6 and 7; split out to satisfy check 5 (money revert boundary)." | Set-Content -Path "$night\cleared\CLEARED-n9-sentry.txt" -Encoding ASCII
  }

  # ---------- 3. prompts to runs\ and preflight ----------
  $names  = @('n7-reputation-client','n1-nearby-schema','n2-harness-registry','n5-first-session','n4-money-ops','n9-sentry','n8-hygiene')
  $effort = @{ 'n1-nearby-schema'='max'; 'n2-harness-registry'='xhigh'; 'n3-autorelease-schema'='max'; 'n4-money-ops'='max'; 'n5-first-session'='xhigh'; 'n6-reputation-schema'='max'; 'n7-reputation-client'='xhigh'; 'n8-hygiene'='xhigh'; 'n9-sentry'='xhigh' }
  $deps   = @{ 'n2-harness-registry'='n1-nearby-schema' }
  $extra  = @{ 'n4-money-ops'='One change to that prompt, decided by the operator: STEP 3 (Sentry) is removed from this run and is executed by a separate run named n9-sentry; skip STEP 3 entirely, do not mention it as unfinished, and proceed from STEP 2 straight to STEP 4.' }
  $maestro = @('n4-money-ops','n8-hygiene')
  foreach ($n in $names) {
    $src = "$night\prompts\$n.txt"
    if (Test-Path $src) {
      Copy-Item $src "$runs\night1\$n.txt" -Force
      if (Test-Complete $n) { continue }
      $pre = Get-Preflight "$runs\night1\$n.txt"
      Set-Content -Path "$night\preflight\$n.txt" -Value $pre -Encoding ASCII
      if (Test-Ready $pre) { Say "preflight $n : READY" } else { Say "preflight $n : NOT READY"; Write-Host $pre }
    } else { Say "no prompt file for $n" }
  }

  # ---------- 4. the chain ----------
  $status = @{ 'n3-autorelease-schema'='DONE (night 1)'; 'n6-reputation-schema'='DONE (night 1)' }
  foreach ($n in $names) {
    if (Test-Complete $n) { $status[$n] = 'DONE (earlier)'; Say "$n already complete - skipping"; continue }
    if ($deps.ContainsKey($n) -and ($status[$deps[$n]] -notlike 'DONE*')) { $status[$n] = "SKIPPED (needs $($deps[$n]))"; Say "$n $($status[$n])"; continue }
    if (-not (Test-Path "$runs\night1\$n.txt")) { $status[$n] = 'SKIPPED (not authored)'; Say "$n not authored"; continue }
    if (-not (Test-Path "$night\cleared\CLEARED-$n.txt")) { $status[$n] = 'SKIPPED (not cleared)'; Say "$n not cleared"; continue }
    if (-not (Test-Ready (Get-Content "$night\preflight\$n.txt" -Raw))) { $status[$n] = 'SKIPPED (preflight not READY)'; Say "$n preflight not READY"; continue }
    if (Test-SelfStopped $n) { Stop-Chain $n 'the run stopped itself earlier - read NEEDS THE OPERATOR in its report'; $status[$n] = 'STOPPED (needs operator)'; break }
    $resumed = Test-Path "$night\reports\$n.md"
    $g = Test-RepoGate (-not $resumed)
    if ($g) { Stop-Chain $n $g; $status[$n] = "STOPPED ($g)"; break }
    $x = $null; if ($extra.ContainsKey($n)) { $x = $extra[$n] }
    Invoke-Claude $n "$runs\night1\$n.txt" $effort[$n] $resumed $x
    Publish-Report $n
    if (-not (Test-Complete $n)) { Stop-Chain $n "report does not end with RUN COMPLETE $n"; $status[$n] = 'STOPPED (incomplete)'; break }
    $g = Test-RepoGate $true
    if ($g) { Stop-Chain $n "after the run: $g"; $status[$n] = "STOPPED ($g)"; break }
    if ($maestro -contains $n) {
      if ((Get-Content "$night\reports\$n.md" -Raw) -notmatch 'MAESTRO GREEN') { Stop-Chain $n 'no MAESTRO GREEN line in the report'; $status[$n] = 'STOPPED (Maestro not green)'; break }
    }
    $status[$n] = 'DONE'
    Say "$n DONE"
  }

  # ---------- 5. summary ----------
  Say '---- NIGHT2 SUMMARY ----'
  foreach ($n in @('n3-autorelease-schema','n6-reputation-schema') + $names) { if ($status.ContainsKey($n)) { Say ("{0,-24} {1}" -f $n, $status[$n]) } else { Say ("{0,-24} not reached" -f $n) } }
  Say ("HEAD now " + (git -C $repo rev-parse --short HEAD).Trim())
  Say "reports: $runs\reports\night1  (Drive)"
  Stop-Transcript | Out-Null
}
