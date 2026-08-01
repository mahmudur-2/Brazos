@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

set "METRO_PORT=8081"
if defined BRAZOS_METRO_PORT set "METRO_PORT=%BRAZOS_METRO_PORT%"

echo ================================================
echo   BRAZOS Developer Control Center
echo   Stop BRAZOS
echo ================================================
echo.
echo This looks for a Metro bundler process listening
echo on port %METRO_PORT% and stops it. It does not touch
echo any other app, browser tab, or process on your
echo machine. (set BRAZOS_METRO_PORT to use a different port)
echo.

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
    echo No process found listening on port %METRO_PORT%.
    echo Metro bundler does not appear to be running.
)

echo.
pause
endlocal
