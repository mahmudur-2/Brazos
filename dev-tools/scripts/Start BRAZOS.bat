@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Start BRAZOS
echo ================================================
echo.
echo This checks your git branch, working tree, and
echo dependencies, then starts the Expo dev server
echo attached to this window with the QR code visible.
echo Metro port: %METRO_PORT% (set BRAZOS_METRO_PORT to change)
echo.

echo Checking git branch...
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
echo Current branch: %BRANCH%
if not "%BRANCH%"=="mainexpo" (
    echo WARNING: expected branch "mainexpo" but found "%BRANCH%".
)
echo.

echo Checking working tree status...
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

echo Starting Expo (Expo Go)...
echo.
call npm start -- --port %METRO_PORT%

echo.
echo Expo has exited.
pause
endlocal
