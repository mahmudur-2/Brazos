# guard.ps1 -- PreToolUse guard for the Bash and PowerShell tools.
#
# Reads the hook JSON from stdin, extracts the command text, and blocks
# (exit 2, one-line reason on stderr) any command whose FULL text contains a
# forbidden pattern. Whole-string scan on purpose: prefix-style permission
# rules miss compound commands ("cd x && git push", "echo ok; git stash"),
# this does not.
#
# Blocked patterns:
#   avkighsiufeefyycbebf  -- the PRODUCTION Supabase ref. No tool command may
#                           ever carry it (CLAUDE.md "Supabase").
#   git push / push --force / push -f -- no pushes, ever (CLAUDE.md).
#   reset --hard / git clean / git stash -- destructive git, never autonomous.
#
# Exit 0 = allow. Exit 2 = block (stderr is fed back to the model).
# Fail-open on unparseable input: the permissions.deny rules in
# .claude/settings.json and the prose rules in CLAUDE.md are the backstop.

$ErrorActionPreference = 'Stop'

try {
    $raw = [Console]::In.ReadToEnd()
    $payload = $raw | ConvertFrom-Json
} catch {
    exit 0
}

$cmd = $null
if ($null -ne $payload -and $null -ne $payload.tool_input) {
    # Both the Bash tool and the PowerShell tool carry the command text in
    # tool_input.command.
    $cmd = $payload.tool_input.command
}
if ([string]::IsNullOrEmpty($cmd)) { exit 0 }

$lower = $cmd.ToLowerInvariant()

$patterns = @(
    @{ p = 'avkighsiufeefyycbebf'; why = 'command contains the PRODUCTION Supabase ref (avkighsiufeefyycbebf) -- production is never contacted' },
    @{ p = 'git push';             why = 'git push is forbidden (CLAUDE.md: no pushes, ever)' },
    @{ p = 'push --force';         why = 'force push is forbidden' },
    @{ p = 'push -f';              why = 'force push is forbidden' },
    @{ p = 'reset --hard';         why = 'git reset --hard is destructive and never run autonomously' },
    @{ p = 'git clean';            why = 'git clean is destructive and never run autonomously' },
    @{ p = 'git stash';            why = 'git stash is forbidden (preserve unrelated modifications in place)' }
)

foreach ($rule in $patterns) {
    if ($lower.Contains($rule.p)) {
        [Console]::Error.WriteLine("guard.ps1 BLOCKED [$($rule.p)]: $($rule.why)")
        exit 2
    }
}

exit 0
