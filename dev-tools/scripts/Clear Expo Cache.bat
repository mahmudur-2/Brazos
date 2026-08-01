@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Clear Expo Cache
echo ================================================
echo.
echo This starts Expo with the Metro bundler cache
echo cleared ("expo start --clear"). Use this when you
echo see stale-bundle errors or changes that aren't
echo showing up. It does not touch node_modules, does
echo not install/upgrade anything, and does not modify
echo any source code. Metro port: %METRO_PORT%
echo.

if not exist "node_modules" (
    echo ERROR: node_modules not found. Run "Start BRAZOS.bat" first
    echo so dependencies can be installed, then try again.
    echo.
    pause
    exit /b 1
)

echo Starting Expo with a cleared cache...
echo.
call npx expo start --clear --port %METRO_PORT%

echo.
echo Expo has exited.
pause
endlocal
