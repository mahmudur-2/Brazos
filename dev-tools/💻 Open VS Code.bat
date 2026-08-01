@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo ================================================
echo   BRAZOS Developer Control Center
echo   Open VS Code
echo ================================================
echo.
echo This opens the BRAZOS project folder in Visual
echo Studio Code using the "code" command.
echo.

where code >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: The "code" command was not found on your PATH.
    echo.
    echo To fix this, open VS Code, press Ctrl+Shift+P, and run:
    echo   "Shell Command: Install 'code' command in PATH"
    echo Then try this launcher again.
    echo.
    pause
    exit /b 1
)

echo Opening project in VS Code...
start "" code "%cd%"

echo Done. VS Code should be opening in a new window.
echo.
pause
endlocal
