# session-context.ps1 -- SessionStart hook.
# Emits one line of repository state (branch, HEAD short hash, dirty/clean);
# Claude Code injects SessionStart stdout as context, so every session opens
# knowing where the tree actually stands (CLAUDE.md "Branch and repository
# state").

$ErrorActionPreference = 'SilentlyContinue'

$repo = $env:CLAUDE_PROJECT_DIR
if ([string]::IsNullOrEmpty($repo)) {
    # Fallback when run outside the hook harness: .claude/hooks/ -> repo root.
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

$branch = git -C $repo rev-parse --abbrev-ref HEAD 2>$null
$head   = git -C $repo rev-parse --short HEAD 2>$null
$porc   = git -C $repo status --porcelain 2>$null
if ($porc) { $tree = 'dirty' } else { $tree = 'clean' }

if ($branch -and $head) {
    Write-Output "[repo-state] branch=$branch HEAD=$head tree=$tree"
}
exit 0
