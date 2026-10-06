# BRAZOS — Repository Instructions

Cloud chats: this project runs only on the owner's Windows PC, because its guard hooks need Windows PowerShell. If you are not on Windows (for example a cloud chat), change nothing and tell the owner to use Remote Control from the PC.

Permanent policy only; nothing here is current state.

## Owners
- Git owns branch, HEAD and tree; no document may claim them.
- `HANDOFF.md`: current context. `docs/architecture.md`: implemented architecture. `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md`: the one roadmap. `docs/DECISIONS.md`: the decisions in force.
- `docs/GATES.md` and `docs/SCOPE.md` are binding: read both before any feature run.
- `docs/archive/` is history, never an authority. `docs/README.md` classifies every document.
- This file beats any document; the code beats this file on what is implemented, and then this file gets fixed.

## Target
iOS only for v1; the Android config stays and keeps building. Expo SDK: from `package.json`. Trunk: `mainexpo`. Never switch or create a branch unless the dispatch prompt says so.

## Invariants
- Money is integer cents, shown only through `formatBudget()`; labels follow the payment state (never "paid" before released, never a faked state).
- One account, both capabilities: no role gates any table, RPC or policy. Mode changes only via `switchMode()`; card perspective comes from `ModeContext`.
- `accept_offer()` is the only assignment path and `transition_job_status()` the only status mover (`open → assigned → in_progress → completed`). Never set `assigned_worker_id` or `status` from the client; never call or imitate the deprecated `accept_bid()` / `respond_job_request()`.
- `job_offers` is RPC-write-only. Messaging opens only after an offer is accepted and a worker assigned.
- The exact address lives in `job_locations` (owner + hired worker, by RLS); open-market surfaces show approximate location only.
- Never invent marketplace data. Never duplicate lifecycle derivation: extract and share.

## Surfaces
- Tokens: `ui/tokens.ts` through `lib/theme.ts`, with `lib/authTheme.ts` the one exception; no fourth token surface; no hardcoded hex, radii or spacing (`.claude/rules/native-ui.md`).
- Locked — never modify: none (emptied 2026-08-19); regression fences protect screens.
- Frozen web/PWA surface: `public/`, `hosting/`, `dist/`, `WEB_DEPLOYMENT.md`, the service worker, `*.web.ts(x)`, the web map. If a task needs one, stop and explain.
- `docs/mockups/` is direction, never a canvas (screenshots: `docs/LAUNCH_CHECK.md` §Screenshots). Nothing may depend on AI.
- `.claude/` and its deny matrix are protected: never modify, weaken or bypass them.

## Supabase
Production (`avkighsiufeefyycbebf`) is never contacted, read or write. `.env` stays on staging; never modify it. A run never contacts a remote project; the local stack is its database. Everything else: `.claude/rules/supabase.md`.

## Workflow
- Check branch and HEAD with `git` against the dispatch prompt; on a mismatch, stop.
- Keep unrelated changes: never stash, reset, clean, revert or edit them.
- Stage by explicit path; check `git diff --cached --name-status`; one commit per milestone.
- Push only `git push origin mainexpo`, only after `npm run verify` exits 0 in the same run. What a run may finish alone: `docs/LAUNCH_CHECK.md` §Agent autonomy.
- Never `reset --hard`, `clean`, `stash`, force checkout, rewrite history or `--amend`.
- `npm run verify` = lint (`tsc` + unused checks), then `npm test`. A failing test is a failure: fix the code or the test, and say which.
- Inspect, execute, verify, self-repair, continue; never ask the owner to run a command you can run. Report exceptions, not routine.
- Flag a new dependency before adding it. Motion goes through `lib/motion120` (`USE_NATIVE_DRIVER` from `lib/motion.ts`); no new animation library; `LayoutAnimation` is banned. No unrelated cleanup.
- HANDOFF.md holds Now / Blocked / Next / Revert only; before writing a new run section, move the previous one to docs/handoff-archive/<date>-<name>.md. Rewrite it last, after every other commit.
- A feature outside `docs/SCOPE.md` goes to `docs/BACKLOG.md` v1.2. A gate box ticks only with its evidence path. A taste decision is never reversed within 48 hours.
- "Done" needs evidence in the same report; without it, write "landed, unverified". Never state repo facts from memory.
