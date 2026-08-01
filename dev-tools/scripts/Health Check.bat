@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Health Check
echo ================================================
echo.
echo This runs a read-only diagnostic of your local dev
echo environment - git state, tooling, dependencies, and
echo network info. It does not change anything.
echo.

set PASS=0
set WARN=0
set FAILN=0

echo --- Repository ---
git rev-parse --is-inside-work-tree >nul 2>&1
if !errorlevel! == 0 (
    echo [PASS] Inside a git repository
    set /a PASS+=1
) else (
    echo [FAIL] Not inside a git repository
    set /a FAILN+=1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
if "!BRANCH!"=="mainexpo" (
    echo [PASS] On expected branch: mainexpo
    set /a PASS+=1
) else if defined BRANCH (
    echo [WARN] On branch "!BRANCH!", expected "mainexpo"
    set /a WARN+=1
) else (
    echo [FAIL] Could not determine current branch
    set /a FAILN+=1
)

git status --porcelain > "%TEMP%\brazos_health.tmp" 2>nul
for %%A in ("%TEMP%\brazos_health.tmp") do set STATUS_SIZE=%%~zA
if "!STATUS_SIZE!"=="0" (
    echo [PASS] Working tree is clean
    set /a PASS+=1
) else (
    echo [WARN] Working tree has uncommitted changes
    set /a WARN+=1
)
del "%TEMP%\brazos_health.tmp" 2>nul

set "OPINPROGRESS="
if exist ".git\MERGE_HEAD" set "OPINPROGRESS=merge"
if exist ".git\CHERRY_PICK_HEAD" set "OPINPROGRESS=cherry-pick"
if exist ".git\rebase-merge" set "OPINPROGRESS=rebase"
if exist ".git\rebase-apply" set "OPINPROGRESS=rebase"
if defined OPINPROGRESS (
    echo [WARN] A !OPINPROGRESS! is in progress
    set /a WARN+=1
) else (
    echo [PASS] No merge/rebase/cherry-pick in progress
    set /a PASS+=1
)
echo.

echo --- Tooling ---
where git >nul 2>&1
if !errorlevel! == 0 (
    for /f "delims=" %%v in ('git --version') do echo [PASS] %%v
    set /a PASS+=1
) else (
    echo [FAIL] git not found on PATH
    set /a FAILN+=1
)

set "NODEVER="
where node >nul 2>&1
if !errorlevel! == 0 (
    for /f "delims=" %%v in ('node -v') do set "NODEVER=%%v"
) else (
    echo [FAIL] Node not found on PATH
    set /a FAILN+=1
)
if defined NODEVER (
    echo [PASS] Node !NODEVER! found
    set /a PASS+=1
    for /f "tokens=1 delims=.v" %%m in ("!NODEVER!") do set NODEMAJOR=%%m
    if defined NODEMAJOR (
        if !NODEMAJOR! LSS 18 (
            echo [WARN] Node !NODEVER! is older than the 18.x LTS line Expo SDK 54 expects
            set /a WARN+=1
        )
    )
)

where npm >nul 2>&1
if !errorlevel! == 0 (
    for /f "delims=" %%v in ('npm -v') do echo [PASS] npm %%v found
    set /a PASS+=1
) else (
    echo [FAIL] npm not found on PATH
    set /a FAILN+=1
)

where npx >nul 2>&1
if !errorlevel! == 0 (
    echo [PASS] npx found
    set /a PASS+=1
) else (
    echo [FAIL] npx not found on PATH
    set /a FAILN+=1
)

where code >nul 2>&1
if !errorlevel! == 0 (
    echo [INFO] VS Code CLI "code" found
) else (
    echo [INFO] VS Code CLI "code" not on PATH - "Open VS Code.bat" will not work
)

where claude >nul 2>&1
if !errorlevel! == 0 (
    echo [INFO] Claude Code CLI "claude" found
) else (
    echo [INFO] Claude Code CLI "claude" not on PATH - "Open Claude Code.bat" will not work
)

where adb >nul 2>&1
if !errorlevel! == 0 (
    echo [INFO] Android platform-tools "adb" found
) else (
    echo [INFO] Android platform-tools "adb" not on PATH - only needed for Android device debugging
)
echo.

echo --- Dependencies ---
if exist "node_modules" (
    echo [PASS] node_modules present
    set /a PASS+=1
) else (
    echo [WARN] node_modules missing - run "Start BRAZOS.bat" to install
    set /a WARN+=1
)

if exist "package-lock.json" (
    echo [PASS] package-lock.json present
    set /a PASS+=1
) else (
    echo [WARN] package-lock.json missing
    set /a WARN+=1
)

if exist "node_modules\.bin\expo.cmd" (
    for /f "delims=" %%v in ('npx expo --version 2^>nul') do set "EXPOVER=%%v"
    if defined EXPOVER (
        echo [PASS] Expo CLI resolves ^(version !EXPOVER!^)
        set /a PASS+=1
    ) else (
        echo [FAIL] Expo CLI did not run - dependencies may be broken
        set /a FAILN+=1
    )
) else (
    echo [WARN] Expo CLI not installed yet - run "Start BRAZOS.bat" first
    set /a WARN+=1
)

if exist ".env" (
    echo [PASS] .env file present
    set /a PASS+=1
) else (
    echo [WARN] .env file missing - Supabase env vars will not load
    set /a WARN+=1
)
echo.

echo --- Network ---
echo LAN IP address(es^) - use one of these in Expo Go if the QR
echo code does not connect (phone must be on the same network^):
set FOUNDIP=0
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set "IP=%%i"
    set "IP=!IP: =!"
    echo   !IP!
    set FOUNDIP=1
)
if !FOUNDIP! == 0 (
    echo [WARN] No IPv4 address found - check your network connection
    set /a WARN+=1
) else (
    set /a PASS+=1
)
echo.

echo --- Dev Server ---
set RUNNING=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%METRO_PORT%" ^| findstr "LISTENING" 2^>nul') do (
    set RUNNING=1
    echo [INFO] Metro bundler already running on port %METRO_PORT% ^(PID %%p^)
)
if !RUNNING! == 0 (
    echo [INFO] Port %METRO_PORT% is free
)
echo.

echo ================================================
echo   Summary: !PASS! passed, !WARN! warning(s), !FAILN! failed
echo ================================================
if !FAILN! gtr 0 (
    echo One or more checks FAILED - see [FAIL] lines above.
) else if !WARN! gtr 0 (
    echo No failures, but some things need attention - see [WARN] lines above.
) else (
    echo Everything looks good.
)

echo.
pause
endlocal
