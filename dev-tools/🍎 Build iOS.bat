@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Build iOS
echo ================================================
echo.
echo This starts the Expo dev server targeting iOS
echo (npm run ios / "expo start --ios"). It does NOT
echo produce a production build or upload anything
echo (no EAS build, no deploy). Metro port: %METRO_PORT%
echo.
echo NOTE: The iOS Simulator only exists on macOS. On
echo Windows, "--ios" cannot open a simulator - Metro
echo will still start, so you can scan the QR code with
echo Expo Go on a physical iPhone instead.
echo.

if not exist "node_modules" (
    echo ERROR: node_modules not found. Run "Start BRAZOS.bat" first
    echo so dependencies can be installed, then try again.
    echo.
    pause
    exit /b 1
)

echo Starting Expo for iOS...
echo.
call npm run ios -- --port %METRO_PORT%

echo.
echo Expo has exited.
pause
endlocal
