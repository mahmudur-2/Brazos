@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo === BRAZOS Dev Launcher ===
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
call npx expo start

echo.
echo Expo has exited.
pause
endlocal
