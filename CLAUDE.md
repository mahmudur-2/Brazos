# BRAZOS — Repository Instructions

Permanent rules. Document roles: **BRAZOS_BUILD_STATE.md** holds current facts
(branch, HEAD, locked list, open items) — read it first, always. **This file**
holds invariants and rules. **BRAZOS_MASTER_PLAN.md** holds the roadmap and the
§L task protocol. On current-state facts, BUILD_STATE and the dispatch prompt
win. On invariants, this file wins. docs/architecture.md is partially stale
(its navigation section predates the dual-tree refactor) — where it conflicts
with this file or the code, trust this file and the code.
BRAZOS_MASTER_PLAN.md §D (the `src/features/...` feature-domain layout) and
the table names in its §G data model are **aspirational, not current**: the
repo is flat-root (lib/, screens/, components/, ui/, navigation/, modes/) and
several §G tables were satisfied by extending existing ones instead. Read §D/§G
as design intent; read the code and this file for what exists.

## Target
Expo / iOS native app. Android deferred. Check versioned Expo docs
(per the SDK in package.json) only before changing behavior that depends on a
version-sensitive Expo API — not for ordinary layout, styling, or app logic.

## Frozen web/PWA surface — never modify
public/, hosting/, dist/, WEB_DEPLOYMENT.md, the service worker, PWA
startup/bootstrap, web deployment config, *.web.ts / *.web.tsx, the
web-specific map implementation. If a task appears to require touching these,
stop and explain the dependency. Known baseline: tests/pwa.test.mjs has one
deliberately unfixed failure on this surface; 12/13 passing is green for
native work.

## Branch and repository state
- Base branch: mainexpo. The dispatch prompt names the working branch and base
  commit; verify HEAD matches before editing. On mismatch, stop. Never switch
  or create branches unless the prompt says so. If the prompt names no
  branch/commit, stop and ask.
- A dirty tree alone is not a blocker. Preserve unrelated modifications; never
  stash, reset, clean, revert, or edit them; continue if the task doesn't
  touch them; stop only if they overlap files the task must change. List
  pre-existing dirty paths in the final report and never include them in a
  commit. `git add` by explicit path only.
- A clean tree is an end condition for this task's own changes, not a
  universal precondition.

## Autonomous execution
- Inspect → execute → verify → self-repair → continue. Never ask the user to
  run a command, read a file, or check git when you can do it yourself.
- Self-repair is allowed for repository-local, reversible, mechanical
  failures: stale caches, gitignored/ephemeral state, formatting of files the
  task already owns, transient command failures. Hard bound: a repair may not
  enlarge the tracked-file diff beyond what the task itself requires. If the
  least-destructive repair would (e.g., a repo-wide line-ending renormalize),
  stop and report instead.
- Never autonomously: git push, git reset --hard, git clean, git stash, force
  checkout, history rewriting. These are also mechanically denied.
- Ask only when: a product/architecture decision is genuinely ambiguous;
  continuing risks unrelated work; production would be touched; required
  tools/permissions are missing; two authoritative requirements truly
  conflict.
- Report exceptions, not routine operations. Final report: status, commit(s),
  files changed, validation results, pre-existing dirty paths, blockers,
  exact next step.

## Critical business invariants
Break these and the marketplace is wrong, not just ugly.
- **Money is integer cents** (budget_cents, amount_cents,
  final_amount_cents). Format only through formatBudget(). Money labels
  follow the payment state machine everywhere — including UI copy: never
  "paid" before released, never a faked payment state.
- **One account, both capabilities.** Data layer: there is no role — any user
  may post jobs and take work; nothing may gate a table, RPC, or policy by
  account type. UI layer: two modes (Customer / Worker); mode changes ONLY
  via switchMode() with confirm + stack reset; JobCard perspective comes from
  ModeContext, never a hand-passed prop.
- **Assignment and lifecycle are DB-only.** accept_offer() is the only
  assignment path; transition_job_status() is the only status mover
  (open → assigned → in_progress → completed). Never set assigned_worker_id
  or status from the client. accept_bid() and respond_job_request() are
  deprecated compatibility shims with no app callers — never call, extend, or
  imitate them; their removal is a logged future migration.
- **job_offers is RPC-write-only.** No direct authenticated
  INSERT/UPDATE/DELETE.
- **Messaging is locked pre-assignment.** Free-form person-to-person
  messaging opens only after an offer is accepted and a worker is assigned.
- **Exact address lives in job_locations** — owner + hired worker only,
  enforced by RLS, never only by the frontend. Customer-facing open-market
  surfaces show approximate location only. (§G called this table
  `job_private_details`; phase12 already implemented that shape and phase43
  extended it with address_line/access_notes rather than renaming it.)
- **Never invent marketplace data.** No placeholder ratings, fake reviews,
  stub history, or stock imagery standing in for real uploads.
- **Lifecycle derivation is never duplicated** (P3-31). One implementation
  per rule; if a second copy seems needed, extract and share instead.

## Design system
Token source of truth: ui/tokens.ts. lib/theme.ts wraps it and is the
standard import for screens. Never hardcode hex, radii, or spacing; never
import ui/tokens.ts directly in new screens; never create a third token
surface. Shared templates provide loading/empty/error/offline/
permission-denied states — configure them, don't reinvent them.

## Navigation
Dual trees: navigation/CustomerRoot.tsx and navigation/WorkerRoot.tsx under
navigation/ModeShell.tsx; MainTabs in App.tsx is a pass-through. switchMode()
and ModeContext live in modes/ModeProvider.tsx. The trees are separately
typed; cross-tree navigation must be a compile error. Route param types live
in lib/navigation.ts.

## Locked — never modify
- Screens 01–07 and 48:
  - screens/LaunchScreen.tsx
  - screens/WelcomeScreen.tsx
  - screens/SignInScreen.tsx
  - screens/EmailSignInScreen.tsx
  - screens/CreateAccountScreen.tsx
  - screens/EmailCreateAccountScreen.tsx
  - screens/VerifyPhoneScreen.tsx
  - screens/SetupScreen.tsx
  - screens/LegalGateScreen.tsx
  - screens/HomeScreen.tsx
  - screens/BrowseJobsScreen.tsx
- design-reference/ (screen_map.json and everything beside it). The mockup
  PNGs are not in the repo; references are direction, not canvases — no
  absolute positioning to match them.
- AI screens 09–11 and all LLM dependencies are out of scope. Manual posting
  produces a JobDraft; nothing may depend on AI.

## Supabase
- Production (avkighsiufeefyycbebf) is never contacted, read or write.
  Mechanically blocked. .env stays pointed at staging; never modify it during
  runs.
- Never execute SQL against any database during a run. Schema changes are
  numbered supabase/phaseNN_*.sql files, hand-applied by the user; only a
  green `node scripts/verify-schema.mjs` counts as applied.
- Every new function needs `grant execute … to authenticated;` (phase32
  revoked the default) or it is unreachable from the app.
- Never weaken RLS, a policy, or a grant to make a feature work — add a
  narrow security definer function instead.
- **There are NO generated Supabase database types.** lib/supabase.ts calls
  `createClient(URL, KEY, {...})` with no type parameter, so nothing in the
  app is compile-checked against the schema. Status values are plain `string`
  in TypeScript and are compared against hand-written string literals and
  local unions (lib/jobLifecycle.ts, lib/jobStage.ts, lib/disputes.ts,
  ui/primitives/StatusPill.tsx). Consequence: a status literal that does not
  exist in the database enum fails at runtime, never at build time — so SQL
  that filters on status must fail safe (allow-list the values it accepts,
  never block-list the ones it rejects).
- Live table names, where the plan's vocabulary differs: exact address →
  `job_locations`; disputes → `job_disputes`; portfolio → `portfolio_items`;
  push tokens → `push_tokens`; notifications → `notification_outbox` +
  `notification_prefs`. `completion_records` and `job_media` were never built
  (completion media lives on `jobs` as jsonb columns).
- Detailed migration mechanics: .claude/rules/supabase.md.

## Validation
| Command | What it does |
| --- | --- |
| npm run verify | Lint + tests; default check after a batch |
| npm run typecheck | tsc --noEmit |
| npm run lint | typecheck + noUnusedLocals/Parameters |
| npm test | node --test tests/*.test.mjs |
| node scripts/verify-schema.mjs | Live staging schema truth; needs .env |
Run the narrowest check that covers what changed; npm run verify once per
batch.

## Workflow
Follow the PROTOCOL in BRAZOS_MASTER_PLAN.md §L for every task. One commit
per milestone. Flag new dependencies before adding; no animation libraries
(built-in Animated with useNativeDriver: Platform.OS !== 'web'). No unrelated
cleanup. Update BRAZOS_BUILD_STATE.md per §L.8 after every run.
