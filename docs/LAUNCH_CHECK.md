# LAUNCH_CHECK — tick every line before an overnight run. No questions after the last tick.

- [ ] Prompt saved in `docs/dispatch/` — inside the repository, not the runs folder
- [ ] Prompt last edited before 00:00 (preflight checks the file's write time); dispatching at any hour is fine
- [ ] `preflight.ps1 -Prompt <file>` printed READY (paste the last line here)
- [ ] Prompt file name is new; saved as a downloaded file, never pasted from a rendered page
- [ ] Base gate is an ancestry check; allowlisted dirty paths named
- [ ] Every decision the run could stop on has a continue-path
- [ ] OneDrive paused; sleep and hibernate off; lid open if a laptop
- [ ] Model and effort named in the launch line — the launcher has no default for either and refuses to start without them
- [ ] Report path known; morning starts by reading NEEDS THE OPERATOR only

## The launch line

One run, from the repository root:

```
powershell -ExecutionPolicy Bypass -File scripts\dispatch\dispatch.ps1 -Prompt docs\dispatch\<name>.md -Model claude-opus-5 -Effort max
```

`-Mode` is optional and defaults to `bypass`, which is the flag pair the chain has
launched with since night 1. Add `-NoLaunch` to print the banner and stop without
starting anything.

A whole night of chained runs is still `scripts/dispatch/chainA.ps1`, pasted.
`scripts/dispatch/dispatch.ps1` replaces that block for a single dispatch only.
