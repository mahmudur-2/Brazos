@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Project Status
echo ================================================
echo.
echo This prints a read-only snapshot of the project:
echo git branch/status, tool versions, dependency and
echo dev-server state. It does not change anything.
echo.

echo --- Git ---
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
if defined BRANCH (
    echo Branch: !BRANCH!
    if "!BRANCH!"=="HEAD" echo   NOTE: detached HEAD - you are not on a named branch.
) else (
    echo Branch: unable to read - not a git repo?
    goto :skipgit
)

for /f "delims=" %%c in ('git log -1 --format^="%%h %%s" 2^>nul') do set LASTCOMMIT=%%c
if defined LASTCOMMIT echo Last commit: !LASTCOMMIT!

for /f "delims=" %%r in ('git remote get-url origin 2^>nul') do set REMOTE=%%r
if defined REMOTE (
    echo Remote origin: !REMOTE!
) else (
    echo Remote origin: none configured
)

set UPSTREAM_FOUND=0
for /f "tokens=1,2" %%a in ('git rev-list --left-right --count @{u}...HEAD 2^>nul') do (
    set UPSTREAM_FOUND=1
    echo Ahead/behind upstream: %%b ahead, %%a behind
)
if !UPSTREAM_FOUND! == 0 echo Ahead/behind upstream: no upstream tracking branch configured

git status --porcelain > "%TEMP%\brazos_status.tmp" 2>nul
set STATUS_LINES=0
for /f %%n in ('find /v /c "" ^< "%TEMP%\brazos_status.tmp" 2^>nul') do set STATUS_LINES=%%n
for %%A in ("%TEMP%\brazos_status.tmp") do set STATUS_SIZE=%%~zA
if not "!STATUS_SIZE!"=="0" (
    echo Working tree: NOT CLEAN ^(!STATUS_LINES! file^(s^) changed^)
    type "%TEMP%\brazos_status.tmp"
) else (
    echo Working tree: clean
)
del "%TEMP%\brazos_status.tmp" 2>nul
:skipgit
echo.

echo --- Tooling ---
where node >nul 2>&1
if !errorlevel! == 0 (
    for /f "delims=" %%v in ('node -v') do echo Node: %%v
) else (
    echo Node: NOT FOUND
)

where npm >nul 2>&1
if !errorlevel! == 0 (
    for /f "delims=" %%v in ('npm -v') do echo npm: %%v
) else (
    echo npm: NOT FOUND
)

findstr /c:"\"expo\":" package.json >nul 2>&1
if !errorlevel! == 0 (
    for /f "tokens=*" %%e in ('findstr /c:"\"expo\":" package.json') do echo package.json: %%e
) else (
    echo package.json: expo entry not found
)

if exist "node_modules\.bin\expo.cmd" (
    for /f "delims=" %%v in ('npx expo --version 2^>nul') do set EXPOVER=%%v
    if defined EXPOVER (
        echo Expo CLI (resolved^): !EXPOVER!
    ) else (
        echo Expo CLI (resolved^): unable to run - see node_modules/dependencies below
    )
) else (
    echo Expo CLI (resolved^): not installed - run "Start BRAZOS.bat" first
)
echo.

echo --- Dependencies ---
if exist "node_modules" (
    echo node_modules: present
) else (
    echo node_modules: MISSING - run "Start BRAZOS.bat" to install
)
if exist ".env" (
    echo .env file: present
) else (
    echo .env file: MISSING - Supabase env vars will not load
)
echo.

echo --- Dev Server ---
echo Metro port checked: %METRO_PORT% (set BRAZOS_METRO_PORT to change)
set RUNNING=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%METRO_PORT%" ^| findstr "LISTENING" 2^>nul') do (
    set RUNNING=1
    echo Metro bundler: RUNNING on port %METRO_PORT% (PID %%p)
)
if !RUNNING! == 0 (
    echo Metro bundler: not running
)

echo.
pause
endlocal
