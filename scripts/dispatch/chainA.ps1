& {
  $runs  = 'C:\Users\mdmah\runs'
  $repo  = 'C:\Users\mdmah\BRAZOS'
  $night = "$repo\.shots\night1"
  $drive = "$runs\reports\night1"
  $base  = 'b4f4d3d'
  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
  foreach ($d in @("$runs\night1", $drive, "$drive\shots", "$drive\cleared", "$drive\preflight", "$night\prompts", "$night\reports", "$night\preflight", "$night\cleared")) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  try { Start-Transcript -Path "$drive\chainA-$stamp.log" -Append | Out-Null } catch {}

  function Say($m) { Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m) }

  # ---------- phone (ntfy.sh) ----------
  $topicFile = "$runs\ntfy-topic.txt"
  if (-not (Test-Path $topicFile)) {
    $t = 'brazos-' + (-join ((48..57) + (97..122) | Get-Random -Count 10 | ForEach-Object { [char]$_ }))
    Set-Content -Path $topicFile -Value $t -Encoding ASCII
    Write-Host ''
    Write-Host "=== PHONE TOPIC: $t ===" -ForegroundColor Yellow
    Write-Host 'iPhone: open ntfy > + > type that topic exactly > Subscribe. Then press Enter here.'
    Read-Host | Out-Null
  }
  $topic = (Get-Content $topicFile -Raw).Trim()
  function Push-Phone($title, $msg, $prio) {
    try { Invoke-RestMethod -Method Post -Uri "https://ntfy.sh/$topic" -Body $msg -ContentType 'text/plain' -Headers @{ Title = $title; Priority = $prio } -TimeoutSec 20 | Out-Null }
    catch { Say "push failed: $($_.Exception.Message)" }
  }
  Push-Phone 'BRAZOS chain A' 'phone link works - chain starting' 'default'
  Say "chain log: $drive\chainA-$stamp.log  (phone topic $topic)"

  function Stop-Chain($name, $why) {
    "STOPPED $name at $(Get-Date -Format 'yyyy-MM-dd HH:mm') - $why" | Set-Content -Path "$drive\STOPPED-$name.txt" -Encoding ASCII
    Say "STOPPED $name - $why"
    Push-Phone "STOPPED $name" $why 'high'
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
  function Publish-Report($name) {
    if (Test-Path "$night\reports\$name.md") { Copy-Item "$night\reports\$name.md" "$drive\$name.md" -Force }
  }
  function Publish-Side {
    if (Test-Path "$night\chainA-manifest.txt") { Copy-Item "$night\chainA-manifest.txt" "$drive\chainA-manifest.txt" -Force }
    Get-ChildItem "$night\cleared" -Filter *.txt -ErrorAction SilentlyContinue | Copy-Item -Destination "$drive\cleared" -Force
    Get-ChildItem "$night\preflight" -Filter *.txt -ErrorAction SilentlyContinue | Copy-Item -Destination "$drive\preflight" -Force
  }
  function Copy-Shots {
    if (Test-Path "$repo\.shots") {
      robocopy "$repo\.shots" "$drive\shots" *.png /S /NJH /NJS /NP /NDL /NFL *>&1 | Out-Null
      Say "renders copied to $drive\shots"
      Push-Phone 'renders in Drive' "$drive\shots" 'low'
    }
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
    Push-Phone "LAUNCH $name" "effort $effort, resumed=$resumed" 'min'
    Push-Location $repo
    claude -p --model claude-fable-5-1 --effort $effort --dangerously-skip-permissions --permission-prompts none --verbose $task *>&1 | ForEach-Object { "$_" } | Out-File -FilePath "$night\reports\$name.stdout.log" -Append -Encoding utf8
    $code = $LASTEXITCODE
    Pop-Location
    Say "EXIT $name code $code"
  }
  function Fail-Run($name, $why, $soft) {
    if ($soft) { Say "FAILED $name - $why (chain continues)"; Push-Phone "FAILED $name" "$why - chain continues" 'default' } else { Stop-Chain $name $why }
  }
  function Invoke-ChainRun($n, $effort, $dep, $needMaestro, $extra, $soft) {
    if (Test-Complete $n) { Say "$n already complete - skipping"; return 'DONE (earlier)' }
    if ($dep -and ($status[$dep] -notlike 'DONE*')) { Say "$n needs $dep"; return "SKIPPED (needs $dep)" }
    if (-not (Test-Path "$runs\night1\$n.txt")) { Say "$n not authored"; return 'SKIPPED (not authored)' }
    if (-not (Test-Path "$night\cleared\CLEARED-$n.txt")) { Say "$n not cleared"; return 'SKIPPED (not cleared)' }
    if (-not (Test-Path "$night\preflight\$n.txt") -or -not (Test-Ready (Get-Content "$night\preflight\$n.txt" -Raw))) { Say "$n preflight not READY"; return 'SKIPPED (preflight not READY)' }
    if (Test-SelfStopped $n) { Fail-Run $n 'the run stopped itself earlier - read NEEDS THE OPERATOR in its report' $soft; return 'STOPPED (needs operator)' }
    $attempt = 0
    while ($true) {
      $resumed = Test-Path "$night\reports\$n.md"
      $g = Test-RepoGate (-not $resumed)
      if ($g) { Fail-Run $n $g $soft; return "STOPPED ($g)" }
      Invoke-Claude $n "$runs\night1\$n.txt" $effort $resumed $extra
      Publish-Report $n
      if (Test-Complete $n) { break }
      if (Test-SelfStopped $n) { Fail-Run $n 'the run stopped itself - read NEEDS THE OPERATOR in its report' $soft; return 'STOPPED (needs operator)' }
      $attempt++
      if ($attempt -gt 2) { Fail-Run $n "no RUN COMPLETE $n after 3 attempts" $soft; return 'STOPPED (incomplete)' }
      $why = 'no RUN COMPLETE line'
      $log = "$night\reports\$n.stdout.log"
      if ((Test-Path $log) -and ((Get-Content $log -Raw) -match '(?i)\b429\b|rate.?limit|overloaded|usage limit')) { $why = 'a 429 / limit message in the output' }
      Say "RETRY $n in 20 min ($why, attempt $attempt of 2)"
      Push-Phone "RETRY $n" "$why - waiting 20 min, attempt $attempt of 2" 'default'
      Start-Sleep -Seconds 1200
    }
    $g = Test-RepoGate $true
    if ($g) { Fail-Run $n "after the run: $g" $soft; return "STOPPED ($g)" }
    if ($needMaestro -and ((Get-Content "$night\reports\$n.md" -Raw) -notmatch 'MAESTRO GREEN')) { Fail-Run $n 'no MAESTRO GREEN line in the report' $soft; return 'STOPPED (Maestro not green)' }
    Say "$n DONE"
    Push-Phone "$n DONE" ("HEAD " + (git -C $repo rev-parse --short HEAD).Trim()) 'low'
    return 'DONE'
  }
  function Read-Manifest {
    $mf = "$night\chainA-manifest.txt"; $list = @()
    if (-not (Test-Path $mf)) { return $list }
    foreach ($line in (Get-Content $mf)) {
      $l = "$line".Trim()
      if ($l -eq '' -or $l.StartsWith('#')) { continue }
      $f = $l.Split('|')
      if ($f.Count -lt 5) { Say "manifest line ignored (needs 5 fields): $l"; continue }
      $nm = $f[0].Trim()
      if ($nm -notmatch '^a[0-9]+-[a-z0-9-]+$') { Say "manifest name refused: $nm"; continue }
      $e = $f[1].Trim().ToLower(); if ($e -ne 'max' -and $e -ne 'xhigh') { $e = 'max' }
      $pos = $f[4].Trim().ToUpper(); if ($pos -ne 'AFTER-N8') { $pos = 'BEFORE-N8' }
      $list += [pscustomobject]@{ Name = $nm; Effort = $e; Dep = $f[2].Trim(); Position = $pos }
    }
    return $list
  }
  function Prep-Prompt($n) {
    $src = "$night\prompts\$n.txt"
    if (-not (Test-Path $src)) { Say "no prompt file for $n"; return }
    Copy-Item $src "$runs\night1\$n.txt" -Force
    $pre = Get-Preflight "$runs\night1\$n.txt"
    Set-Content -Path "$night\preflight\$n.txt" -Value $pre -Encoding ASCII
    if (Test-Ready $pre) { Say "preflight $n : READY" } else { Say "preflight $n : NOT READY"; Write-Host $pre }
  }

  # ---------- 0. environment ----------
  if (-not (Test-Path "$runs\preflight.ps1")) { Stop-Chain 'env' "$runs\preflight.ps1 is missing"; Stop-Transcript | Out-Null; return }
  docker info *>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Chain 'env' 'Docker is not running. Start Docker Desktop, wait for it, paste this block again.'; Stop-Transcript | Out-Null; return }
  npx --yes eas-cli whoami *>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Chain 'env' 'EAS is not logged in. Run: npx --yes eas-cli login  then paste again.'; Stop-Transcript | Out-Null; return }
  gh auth status *>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Stop-Chain 'env' 'gh is not logged in. Run: gh auth login --web --hostname github.com  then paste again.'; Stop-Transcript | Out-Null; return }
  $sl = "$repo\.claude\settings.local.json"
  if (Test-Path $sl) {
    $slt = Get-Content $sl -Raw
    if (($slt -match 'Write\(\./\.claude/\*\*\)') -and ($slt -notmatch 'Edit\(\./\.claude/\*\*\)')) { Stop-Chain 'env' 'settings.local.json still has Write(./.claude/**), which Claude Code ignores. Change Write to Edit on that line, save, paste again.'; Stop-Transcript | Out-Null; return }
    if ($slt -match 'defaultMode') { Say 'WARN settings.local.json sets a defaultMode (the 09-03 suspect); the launcher still passes --dangerously-skip-permissions' }
  }
  if (-not (Test-Complete 'plan') -or -not (Test-Complete 'verify')) { Stop-Chain 'env' 'plan.md or verify.md is not complete - this block expects night 1 to have run'; Stop-Transcript | Out-Null; return }
  $recNote = $null
  if (-not (Test-Path "$repo\.shots\recommendation_final.md")) { $recNote = 'NOTE FROM THE LAUNCHER: .shots/recommendation_final.md is ABSENT on disk, so Change 3 and Change 6 cannot be read; list both as SKIPPED in the manifest with that reason and author the other runs.'; Say 'WARN recommendation_final.md absent - Change 3 and 6 will be skipped' }
  $job = Start-Job -ScriptBlock { claude --version 2>&1 | Out-String; claude mcp list 2>&1 | Out-String }
  if (Wait-Job $job -Timeout 90) { $mcp = ((Receive-Job $job) -join "`n") } else { $mcp = 'claude mcp list timed out after 90 s' }
  Remove-Job $job -Force
  Say "claude version and mcp list (kept for chain B):`n$mcp"
  $g = Test-RepoGate $false
  if ($g) { Stop-Chain 'env' $g; Stop-Transcript | Out-Null; return }
  Say ("repo gate OK at " + (git -C $repo rev-parse --short HEAD).Trim())

  # ---------- 1. operator clearances on the verifier's evidence (night2, unchanged) ----------
  foreach ($n in @('n1-nearby-schema','n5-first-session','n8-hygiene')) {
    $nc = "$night\cleared\NOT-CLEARED-$n.txt"; $c = "$night\cleared\CLEARED-$n.txt"
    if ((Test-Path $nc) -and -not (Test-Path $c)) {
      $txt = Get-Content $nc -Raw
      "OPERATOR-CLEARED $(Get-Date -Format 'yyyy-MM-dd HH:mm'): verify.md records checks 1-5 and 7 PASS; check 6 failed on a stale preflight file; refreshed preflight READY.`r`n`r`n--- verifier's file follows ---`r`n$txt" | Set-Content -Path $c -Encoding ASCII
      Say "operator-cleared $n"
    }
  }
  foreach ($p in @('plan-a','verify-a')) {
    $c = "$night\cleared\CLEARED-$p.txt"
    if (-not (Test-Path $c)) { "OPERATOR-CLEARED $(Get-Date -Format 'yyyy-MM-dd HH:mm'): $p was authored in the operator's chat on 2026-09-05; it commits nothing and writes only under .shots/night1/." | Set-Content -Path $c -Encoding ASCII }
  }

  # ---------- 2. n9-sentry: n4's STEP 3 as its own run (night2, unchanged) ----------
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
  $effort = @{ 'n1-nearby-schema'='max'; 'n2-harness-registry'='xhigh'; 'n4-money-ops'='max'; 'n5-first-session'='xhigh'; 'n7-reputation-client'='xhigh'; 'n8-hygiene'='xhigh'; 'n9-sentry'='xhigh' }
  $deps   = @{ 'n2-harness-registry'='n1-nearby-schema' }
  $extra  = @{ 'n4-money-ops'='One change to that prompt, decided by the operator: STEP 3 (Sentry) is removed from this run and is executed by a separate run named n9-sentry; skip STEP 3 entirely, do not mention it as unfinished, and proceed from STEP 2 straight to STEP 4.' }
  foreach ($n in $names) {
    if (Test-Path "$night\prompts\$n.txt") { Copy-Item "$night\prompts\$n.txt" "$runs\night1\$n.txt" -Force; if (-not (Test-Complete $n)) { Prep-Prompt $n } } else { Say "no prompt file for $n" }
  }
  foreach ($p in @('plan-a','verify-a')) {
    Copy-Item "$runs\chainA\$p.txt" "$night\prompts\$p.txt" -Force
    Prep-Prompt $p
    if (-not (Test-Ready (Get-Content "$night\preflight\$p.txt" -Raw))) { Stop-Chain 'env' "preflight NOT READY for $p - paste .shots\night1\preflight\$p.txt into the chat"; Stop-Transcript | Out-Null; return }
  }
  Publish-Side

  # ---------- 4. segment 1: night2's runs ----------
  $status = @{ 'n3-autorelease-schema'='DONE (night 1)'; 'n6-reputation-schema'='DONE (night 1)' }
  $halted = $false
  foreach ($n in @('n7-reputation-client','n1-nearby-schema','n2-harness-registry','n5-first-session','n4-money-ops','n9-sentry')) {
    $dep = ''; if ($deps.ContainsKey($n)) { $dep = $deps[$n] }
    $x = $null; if ($extra.ContainsKey($n)) { $x = $extra[$n] }
    $r = Invoke-ChainRun $n $effort[$n] $dep ($n -eq 'n4-money-ops') $x $false
    $status[$n] = $r
    if ($r -like 'STOPPED*') { $halted = $true; break }
    if (($n -eq 'n2-harness-registry') -and ($r -like 'DONE*')) { Copy-Shots }
  }

  # ---------- 5. segment 2: planner, verifier, the a-runs, n8, then the after-n8 run ----------
  $manifest = @()
  if (-not $halted) {
    $r = Invoke-ChainRun 'plan-a' 'max' '' $false $recNote $true
    if ($r -like 'STOPPED*') { $r = $r -replace '^STOPPED', 'FAILED' }
    $status['plan-a'] = $r
    if ($r -like 'DONE*') {
      $manifest = @(Read-Manifest)
      Say ("manifest: " + (($manifest | ForEach-Object { $_.Name }) -join ', '))
      foreach ($m in $manifest) { Prep-Prompt $m.Name }
      $r = Invoke-ChainRun 'verify-a' 'max' 'plan-a' $false $null $true
      if ($r -like 'STOPPED*') { $r = $r -replace '^STOPPED', 'FAILED' }
      $status['verify-a'] = $r
      if ($r -like 'DONE*') { foreach ($m in $manifest) { Prep-Prompt $m.Name } } else { Say 'verifier did not complete - no a-run launches'; $manifest = @() }
    } else { Say 'planner did not complete - no a-run launches' }
    Publish-Side
    foreach ($m in $manifest) {
      if ($m.Position -eq 'AFTER-N8') { continue }
      $r = Invoke-ChainRun $m.Name $m.Effort $m.Dep $false $null $false
      $status[$m.Name] = $r
      if ($r -like 'STOPPED*') { $halted = $true; break }
    }
  }
  if (-not $halted) {
    $r = Invoke-ChainRun 'n8-hygiene' $effort['n8-hygiene'] '' $true $null $false
    $status['n8-hygiene'] = $r
    if ($r -like 'STOPPED*') { $halted = $true } else { Copy-Shots }
  }
  if (-not $halted) {
    foreach ($m in $manifest) {
      if ($m.Position -ne 'AFTER-N8') { continue }
      $r = Invoke-ChainRun $m.Name $m.Effort $m.Dep $false $null $false
      $status[$m.Name] = $r
      if ($r -like 'STOPPED*') { $halted = $true; break }
    }
  }

  # ---------- 6. summary ----------
  Copy-Shots
  Publish-Side
  $order = @('n3-autorelease-schema','n6-reputation-schema','n7-reputation-client','n1-nearby-schema','n2-harness-registry','n5-first-session','n4-money-ops','n9-sentry','plan-a','verify-a') + @($manifest | Where-Object { $_.Position -ne 'AFTER-N8' } | ForEach-Object { $_.Name }) + @('n8-hygiene') + @($manifest | Where-Object { $_.Position -eq 'AFTER-N8' } | ForEach-Object { $_.Name })
  $lines = @()
  foreach ($n in $order) { if ($status.ContainsKey($n)) { $lines += ("{0,-26} {1}" -f $n, $status[$n]) } else { $lines += ("{0,-26} not reached" -f $n) } }
  Say '---- CHAIN A SUMMARY ----'
  foreach ($l in $lines) { Say $l }
  $head = (git -C $repo rev-parse --short HEAD).Trim()
  Say "HEAD now $head"
  Say "reports: $drive  (Drive)"
  $note = 'finished'; if ($halted) { $note = 'STOPPED - read the STOPPED-*.txt file' }
  Push-Phone "CHAIN A $note" ("HEAD $head`n" + ($lines -join "`n")) 'high'
  Stop-Transcript | Out-Null
}
