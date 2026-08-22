# BRAZOS — Repository Instructions

Permanent policy and invariants. Nothing here is current state.

## Source-of-truth hierarchy

Each domain has one owner; never record another owner's facts here.

|Domain|Owner|
|-|-|
|Machine state — branch, HEAD, tree cleanliness|**Git.** Read it with `git`. No document may claim it.|
|Permanent policy and invariants|**CLAUDE.md** (this file)|
|Current operational context — what just happened, what is blocked|**HANDOFF.md**|
|Implemented architecture|**docs/architecture.md**|
|Roadmap and priorities|**BRAZOS\_MASTER\_PLAN.md** — intent only, never current state|
|History|**docs/archive/** — never an authority for anything current|

`docs/README.md` classifies every documentation surface. When this file and a
document disagree, this file wins; when it and the code disagree on what is
implemented, the code wins and this file gets fixed.

## Target and trunk

Expo / iOS native app. Android deferred. Derive the Expo SDK from
`package.json`; consult version-matched Expo docs only before changing
behavior that depends on a version-sensitive Expo API — not for ordinary
layout, styling, or app logic. Base branch is **`mainexpo`**: single trunk,
all work lands there. Never switch or create a branch unless the dispatch
prompt says so.

## Critical business invariants

Break these and the marketplace is wrong, not just ugly.

* **Money is integer cents** (`budget\_cents`, `amount\_cents`,
`final\_amount\_cents`), formatted only through `formatBudget()`. Money labels
follow the payment state machine everywhere — including UI copy: never
"paid" before released, never a faked payment state.
* **One account, both capabilities.** Data layer: there is no role — any user
may post jobs and take work; nothing may gate a table, RPC, or policy by
account type. UI layer: two modes (Customer / Worker); mode changes ONLY via
`switchMode()` with confirm + stack reset; card perspective comes from
`ModeContext`, never a hand-passed prop.
* **Assignment and lifecycle are DB-only.** `accept\_offer()` is the only
assignment path; `transition\_job\_status()` is the only status mover
(`open → assigned → in\_progress → completed`). Never set
`assigned\_worker\_id` or `status` from the client. `accept\_bid()` and
`respond\_job\_request()` are deprecated compatibility shims with no app
callers — never call, extend, or imitate them; their removal is a logged
future migration.
* **`job\_offers` is RPC-write-only:** no direct authenticated
INSERT/UPDATE/DELETE. **Messaging is locked pre-assignment:** free-form
person-to-person messaging opens only after an offer is accepted and a
worker is assigned.
* **Exact address lives in `job\_locations`** — owner + hired worker only,
enforced by RLS, never only by the frontend. Customer-facing open-market
surfaces show approximate location only. `job\_private\_details` was never
built — `job\_locations` is that surface, per
`supabase/phase43\_job\_offers\_foundation.sql`.
* **Never invent marketplace data.** No placeholder ratings, fake reviews,
stub history, or stock imagery standing in for real uploads.
* **Lifecycle derivation is never duplicated** (P3-31). One implementation per
rule; if a second copy seems needed, extract and share instead.

## Design system and navigation

Token source of truth: `ui/tokens.ts`. `lib/theme.ts` wraps it and is the
standard import for screens. Never hardcode hex, radii, or spacing; never
import `ui/tokens.ts` directly in a new screen; never create a third token
surface. Shared templates provide loading / empty / error / offline /
permission-denied states — configure them, don't reinvent them.
Dual navigation trees: `navigation/CustomerRoot.tsx` and
`navigation/WorkerRoot.tsx` under `navigation/ModeShell.tsx`; `switchMode()`
and `ModeContext` live in `modes/ModeProvider.tsx`. The trees are separately
typed, so cross-tree navigation must be a compile error. Route param types
live in `lib/navigation.ts`.

## Locked — never modify

None. All screens were unlocked 2026-08-19 for the Prestige dark sweep. This
list is EMPTY by decision and stays empty; regression fences, not a filename
list, are the protection. A dispatch prompt may NOT reintroduce a locked list
by restating one — if a surface needs locking, it is added here first.

`screens/BrowseJobsScreen.tsx` is UNLOCKED but DEAD: imported by nothing,
registered in neither navigation tree since 4D-1b, and kept on disk only
because ten test files read its source as text. Do not style it, do not add
`hitSlop` to it, do not fix its hardcoded hex. Its removal is a queued task
that must update those tests in the same commit.

## Agent autonomy — what a run may finish without the operator

A run may complete end to end without stopping, including:
- Editing any source file (the locked list is empty).
- Running `npm run verify`, type checks, and any read-only repo command.
- Committing, by explicit path only.
- `git push` to `mainexpo` — ONLY after `npm run verify` exits 0 in that same
  run. A red or unrun suite means commit and report; never push.

A run must STOP and hand back only for:
- A required new dependency.
- A destructive or schema migration awaiting operator approval.
- Any need to execute SQL or contact any database.
- Any need to touch production, `.env`, `start.ps1`, or the frozen web surface.
- Any need to weaken a regression fence's logic rather than update its
  expected constants.
- Physical-device verification, which only the operator can perform.
- A collision with an active hook or deny rule.

Everything the deny matrix forbids stays forbidden. This section widens what a
run may FINISH; it does not widen what a run may DO.

A stop that this contract already answers is a wasted dispatch.


## Design references

`docs/mockups/` holds the Emerald Prestige screen designs, and
`design-reference/` holds `screen\_map.json` and everything beside it.
References are direction, not canvases — never position absolutely to match
them. AI screens 09-11 and all LLM dependencies are out of scope: manual
posting produces a `JobDraft` and nothing may depend on AI.

**Frozen web/PWA surface:** `public/`, `hosting/`, `dist/`,
`WEB\_DEPLOYMENT.md`, the service worker, PWA startup/bootstrap, web deployment
config, `\*.web.ts` / `\*.web.tsx`, the web-specific map implementation. If a
task appears to require touching these, stop and explain the dependency.

**The locked list above and the `.claude/` deny matrix are non-negotiable.** The locked list and .claude/ deny matrix are protected controls. Agents must not modify, weaken, or bypass them without explicit user authorization. Agents may explain what is blocked, recommend exact changes, and provide manual instructions for the user to apply outside the agent session.

## Supabase

* Production (`avkighsiufeefyycbebf`) is never contacted, read or write —
mechanically blocked. `.env` stays pointed at staging; never modify it
during a run.
* Never execute SQL against any database during a run. Schema changes are
numbered `supabase/phaseNN\_\*.sql` files, hand-applied by the user; only a
green `node scripts/verify-schema.mjs` counts as applied. That script needs
`.env` and live staging, so it never runs inside an autonomous run.
* Every new function needs `grant execute … to authenticated;` (phase32 revoked
the default) or it is unreachable from the app. Never weaken RLS, a policy,
or a grant to make a feature work — add a narrow security definer function.
* **Every new SECURITY DEFINER function in schema `public` carries explicit
`revoke`/`grant` statements in the same migration that creates it** —
`revoke all on function … from public, anon;` then `grant execute … to` only
the roles a call-site inventory proves are needed. The CREATE-time default ACL
grants EXECUTE to PUBLIC, so a function shipped without them is reachable by
`anon` from the moment it exists, and `create or replace` on an existing
function preserves whatever ACL it already had — a later phase cannot quietly
fix it. phase69 is the precedent: sixteen pre-phase32 functions had drifted
that way, four of them forming a live unauthenticated notification chain, and
one of them aborted phase68 at its own self-check. If the function is called
from an RLS policy, grant it to that policy's roles — a policy expression is
evaluated as the querying role, so revoking there breaks the policy, not just
the function.
* **There are NO generated Supabase database types.** `lib/supabase.ts` calls
`createClient(URL, KEY, {...})` with no type parameter, so nothing is
compile-checked against the schema. Status values are plain `string`, compared
against hand-written literals and local unions (`lib/jobLifecycle.ts`,
`lib/jobStage.ts`, `lib/disputes.ts`, `ui/primitives/StatusPill.tsx`). A
status literal absent from the database enum fails at runtime, never at build
time — so SQL that filters on status must fail safe: allow-list what it
accepts, never block-list what it rejects.
* Live table names where older planning vocabulary differs: exact address →
`job\_locations`; disputes → `job\_disputes`; portfolio → `portfolio\_items`;
push tokens → `push\_tokens`; notifications → `notification\_outbox` +
`notification\_prefs`. `completion\_records` and `job\_media` were never built —
completion media lives on `jobs` as jsonb columns.
* Migration mechanics: `.claude/rules/supabase.md`.

## Validation

`npm run verify` is the canonical offline check: `npm run lint` (which is
`tsc --noEmit` plus `noUnusedLocals` / `noUnusedParameters`) then `npm test`
(`node --test tests/\*.test.mjs`). `npm run typecheck` is the bare `tsc`. Run
the narrowest check that covers what changed; run `npm run verify` once per
batch. **A failing test is a failure.** There are no blessed failures and no
assertion allowed to stay red because it is "known". Fix the code or fix the
test, and say which you did and why.

## Workflow

* Verify the base gate before editing: confirm with `git` that the branch and
HEAD match what the dispatch prompt names. On mismatch, stop. If the prompt
names no branch or commit, stop and ask.
* A dirty tree alone is not a blocker. Preserve unrelated modifications; never
stash, reset, clean, revert, or edit them. Stop only if they overlap files
the task must change, and list those paths in the final report.
* Stage by explicit path only — never `git add .`, `-A`, `-u`, or a wildcard.
Inspect `git diff --cached --name-status` before every commit. One commit per
milestone. Never autonomously `git push`, `reset --hard`, `clean`, `stash`,
force checkout, rewrite history, or `commit --amend`; also mechanically denied.
* Inspect → execute → verify → self-repair → continue, without asking the user
to run a command you can run. Self-repair covers repository-local,
reversible, mechanical failures only, and may never enlarge the tracked diff
beyond what the task requires.
* Flag new dependencies before adding; no animation libraries (built-in
`Animated` with `useNativeDriver: Platform.OS !== 'web'`). No unrelated
cleanup. Report exceptions, not routine operations, and rewrite `HANDOFF.md`
at the end of every run.


## Home screenshots

`node scripts/home-shots.mjs` writes Customer Home and Worker Home, dark and
light, at 393x852 CSS px into `.shots/` (gitignored). Add `--build` to force a
fresh `expo export` first; without it the export under `.shots/web` is reused.
The harness supplies its own `__BRAZOS_CONFIG__` for a project that does not
exist and answers every non-local request itself, so it needs no credentials and
reaches no database. It is a comparison aid for `docs/mockups/`, not a check
`npm run verify` runs.
