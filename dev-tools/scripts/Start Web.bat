@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Start Web
echo ================================================
echo.
echo This starts the existing web dev server via
echo "npm run web" (expo start --web). It only runs the
echo pre-existing script from package.json - it does not
echo change any web/PWA code, config, or deployment.
echo Metro port: %METRO_PORT%
echo.

if not exist "node_modules" (
    echo ERROR: node_modules not found. Run "Start BRAZOS.bat" first
    echo so dependencies can be installed, then try again.
    echo.
    pause
    exit /b 1
)

echo Starting Expo for Web...
echo.
call npm run web -- --port %METRO_PORT%

echo.
echo Web server has exited.
pause
endlocal
