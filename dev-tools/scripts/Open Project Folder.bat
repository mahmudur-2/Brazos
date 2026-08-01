@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

echo ================================================
echo   BRAZOS Developer Control Center
echo   Open Project Folder
echo ================================================
echo.
echo This opens the BRAZOS project root in File Explorer.
echo.

start "" explorer "%cd%"

echo Done.
echo.
pause
endlocal
