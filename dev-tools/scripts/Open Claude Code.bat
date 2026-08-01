@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

echo ================================================
echo   BRAZOS Developer Control Center
echo   Open Claude Code
echo ================================================
echo.
echo This opens a new terminal window running the
echo "claude" CLI in the BRAZOS project folder.
echo.

where claude >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: The "claude" command was not found on your PATH.
    echo.
    echo Claude Code is a CLI tool, not a GUI application, so it
    echo cannot be "opened" the way VS Code can - it needs to run
    echo inside a terminal. Install it first, e.g.:
    echo   npm install -g @anthropic-ai/claude-code
    echo Then try this launcher again.
    echo.
    pause
    exit /b 1
)

echo Launching Claude Code in a new window...
start "Claude Code - BRAZOS" /D "%cd%" cmd /k claude

echo Done. Claude Code should be starting in a new window.
echo.
pause
endlocal
