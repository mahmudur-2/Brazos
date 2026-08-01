@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0..\.."

echo ================================================
echo   BRAZOS Developer Control Center
echo   Run Tests
echo ================================================
echo.
echo This runs the project's test suite
echo ("node --test tests/*.test.mjs") and reports
echo pass/fail results below.
echo.

if not exist "node_modules" (
    echo ERROR: node_modules not found. Run "Start BRAZOS.bat" first
    echo so dependencies can be installed, then try again.
    echo.
    pause
    exit /b 1
)

call npm test
set TEST_RESULT=%errorlevel%

echo.
if %TEST_RESULT% == 0 (
    echo All tests passed.
) else (
    echo One or more tests FAILED. See output above for details.
)

echo.
pause
endlocal
