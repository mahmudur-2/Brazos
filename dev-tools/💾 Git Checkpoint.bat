@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0.."

echo ================================================
echo   BRAZOS Developer Control Center
echo   Git Checkpoint
echo ================================================
echo.
echo This creates a local commit of your current changes
echo so you have a save point to come back to. It does
echo NOT push, merge, or switch branches - it is a plain
echo local "git add -A" + "git commit" on whatever branch
echo you are currently on.
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if !errorlevel! neq 0 (
    echo ERROR: This does not look like a git repository.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
if not defined BRANCH (
    echo ERROR: Could not determine the current branch.
    echo.
    pause
    exit /b 1
)
echo Current branch: %BRANCH%

if "%BRANCH%"=="HEAD" (
    echo.
    echo WARNING: You are in a detached HEAD state - you are not
    echo on a named branch. A commit here can be easily lost once
    echo you check out a branch again unless you note the commit
    echo hash or create a branch for it.
    echo.
    set /p DETACHED_OK="Type YES to continue anyway, anything else to cancel: "
    if not "!DETACHED_OK!"=="YES" (
        echo Cancelled. No commit was made.
        echo.
        pause
        exit /b 0
    )
)

if exist ".git\MERGE_HEAD" set OPINPROGRESS=a merge
if exist ".git\CHERRY_PICK_HEAD" set OPINPROGRESS=a cherry-pick
if exist ".git\rebase-merge" set OPINPROGRESS=a rebase
if exist ".git\rebase-apply" set OPINPROGRESS=a rebase
if defined OPINPROGRESS (
    echo.
    echo ERROR: !OPINPROGRESS! is in progress in this repository.
    echo Committing now could create a confusing or broken state.
    echo Finish or abort it first with normal git commands, then
    echo run this checkpoint again.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%u in ('git config user.email 2^>nul') do set GITEMAIL=%%u
if not defined GITEMAIL (
    echo.
    echo ERROR: git user.email is not configured, so a commit would
    echo fail. Set it first, e.g.:
    echo   git config user.email "you@example.com"
    echo   git config user.name "Your Name"
    echo.
    pause
    exit /b 1
)
echo.

git status --porcelain > "%TEMP%\brazos_checkpoint.tmp"
for %%A in ("%TEMP%\brazos_checkpoint.tmp") do set STATUS_SIZE=%%~zA
if "!STATUS_SIZE!"=="0" (
    del "%TEMP%\brazos_checkpoint.tmp" 2>nul
    echo Working tree is already clean - nothing to checkpoint.
    echo.
    pause
    exit /b 0
)

echo Changes to be included in this checkpoint:
type "%TEMP%\brazos_checkpoint.tmp"
del "%TEMP%\brazos_checkpoint.tmp" 2>nul
echo.

set CONFLICTFOUND=0
for /f "delims=" %%f in ('git status --porcelain 2^>nul ^| findstr /r "^UU \|^AA \|^DD "') do set CONFLICTFOUND=1
if !CONFLICTFOUND! == 1 (
    echo ERROR: git reports unresolved merge conflicts ^(UU/AA/DD^)
    echo in the working tree. Resolve them before checkpointing.
    echo.
    pause
    exit /b 1
)

set /p CONFIRM="Create a checkpoint commit with these changes? (Y/N): "
if /i not "!CONFIRM!"=="Y" if /i not "!CONFIRM!"=="YES" (
    echo Cancelled. No commit was made.
    echo.
    pause
    exit /b 0
)

set "MSG="
set /p MSG="Optional checkpoint note (press Enter to skip): "

rem Strip characters that could break the quoted commit message
rem or be interpreted as shell metacharacters.
if defined MSG (
    set "MSG=!MSG:"=!"
    set "MSG=!MSG:^=!"
    set "MSG=!MSG:&=!"
    set "MSG=!MSG:|=!"
    set "MSG=!MSG:<=!"
    set "MSG=!MSG:>=!"
    set "MSG=!MSG:%%=!"
)

for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH:mm:ss"') do set TS=%%t

if "!MSG!"=="" (
    set "FULLMSG=Checkpoint: !TS!"
) else (
    set "FULLMSG=Checkpoint: !TS! - !MSG!"
)

git add -A
git commit -m "!FULLMSG!"

if !errorlevel! == 0 (
    echo.
    echo Checkpoint committed successfully on branch %BRANCH%.
    echo Reminder: this was NOT pushed anywhere.
) else (
    echo.
    echo ERROR: git commit failed. See output above.
)

echo.
pause
endlocal
