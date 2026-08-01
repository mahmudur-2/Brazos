@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Restart BRAZOS
echo ================================================
echo.
echo This stops any running Metro bundler on port %METRO_PORT%,
echo then starts a fresh Expo dev server in this window.
echo (set BRAZOS_METRO_PORT to use a different port)
echo.

echo Step 1: Stopping any running Metro bundler...
set FOUND=0
set "HANDLED=;"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%METRO_PORT%" ^| findstr "LISTENING"') do (
    echo !HANDLED! | findstr /c:";%%p;" >nul
    if errorlevel 1 (
        set "HANDLED=!HANDLED!%%p;"
        set FOUND=1
        echo Found Metro bundler process with PID %%p on port %METRO_PORT%.
        taskkill /PID %%p /F >nul 2>&1
        if !errorlevel! == 0 (
            echo Stopped process %%p successfully.
        ) else (
            echo WARNING: Could not stop process %%p. It may need to be closed manually via Task Manager.
        )
    )
)
if !FOUND! == 0 (
    echo No running Metro bundler found. Nothing to stop.
)
echo.

echo Step 2: Checking git branch...
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
echo Current branch: %BRANCH%
if not "%BRANCH%"=="mainexpo" (
    echo WARNING: expected branch "mainexpo" but found "%BRANCH%".
)
echo.

echo Step 3: Checking working tree status...
git status --porcelain > "%TEMP%\brazos_status.tmp"
for %%A in ("%TEMP%\brazos_status.tmp") do set STATUS_SIZE=%%~zA
if not "!STATUS_SIZE!"=="0" (
    echo WARNING: working tree is not clean:
    type "%TEMP%\brazos_status.tmp"
) else (
    echo Working tree is clean.
)
del "%TEMP%\brazos_status.tmp" 2>nul
echo.

if not exist "node_modules" (
    echo node_modules not found. Installing dependencies...
    call npm install
) else (
    echo node_modules found. Skipping install.
)
echo.

echo Step 4: Starting Expo (Expo Go)...
echo.
call npm start -- --port %METRO_PORT%

echo.
echo Expo has exited.
pause
endlocal
