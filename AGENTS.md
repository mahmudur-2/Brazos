# BRAZOS — Agent Reading Order

1. **`CLAUDE.md`** — permanent policy and invariants. Binding. Read it first,
   in full, every session.
2. **`HANDOFF.md`** — current operational context: what last landed, what is
   blocked, what is next.
3. **Only the files the task actually touches.** Do not pre-read the repository.

`docs/README.md` says which documentation surface is authoritative and which
is history. `docs/architecture.md` is the implemented architecture;
`docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` is the one roadmap owner (run queue,
priorities, backlog), never current state.

## Machine state comes from Git

Branch, HEAD and tree cleanliness are read with `git`, never taken from a
document. Any file that appears to state them is stale by construction.

## Expo version

Derive the Expo SDK from the `expo` dependency in `package.json`, then consult
the docs for exactly that version — and only when the change depends on a
version-sensitive Expo API. Never hard-code an SDK version or a docs URL in
this repository's instructions; the dependency is the single source.

## Never infer current state from an archived document

Anything under `docs/archive/` describes a moment that has passed. Use it for
history and rationale only. If an archived file and the code disagree, the
code is right and the archive is simply old.
