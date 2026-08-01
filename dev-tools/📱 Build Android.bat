@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Build Android
echo ================================================
echo.
echo This starts the Expo dev server targeting Android
echo (npm run android / "expo start --android"). It will
echo try to open a connected device or emulator through
echo Expo Go or a dev client - it does NOT produce a
echo production build or upload anything (no EAS build,
echo no deploy). Metro port: %METRO_PORT%
echo.

if not exist "node_modules" (
    echo ERROR: node_modules not found. Run "Start BRAZOS.bat" first
    echo so dependencies can be installed, then try again.
    echo.
    pause
    exit /b 1
)

echo Starting Expo for Android...
echo.
call npm run android -- --port %METRO_PORT%

echo.
echo Expo has exited.
pause
endlocal
