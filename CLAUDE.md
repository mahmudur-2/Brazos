# BRAZOS: policy, never current state

## Core rules (copied from the owner's global rules)
- Owner doesn't code, has ADHD: basic English, answer first, short, answer every part.
- Plan, popups, "go", build alone; never wait at night. Hard stops only: sending to real people, moving real money, deleting data with no backup, store submissions. Money or red deploy = parked step.
- Short helpers, one job each; one review, blockers only. Critical (money, login, personal data, irreversible, folders below): Fable max designs + reviews, Opus writes.
- Handoff file (docs/STATE.md unless named below) after every step; new chats read it + git log + git status first.
- Owner's steps: one copy-paste block, where it goes, what to expect.
- BRAZOS production deploys stay manual: a production step is always a parked step for the owner, never run by a chat.

Non-Windows (cloud) chat: change nothing; tell the owner to use Remote Control from the PC (guard hooks need Windows PowerShell).

## Owners
- Git owns branch, HEAD and tree; no document may claim them.
- `HANDOFF.md`: context. `docs/architecture.md`: what is built. `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md`: the one roadmap. `docs/DECISIONS.md`: decisions in force.
- `docs/GATES.md` and `docs/SCOPE.md` bind every feature run: read both first.
- `docs/archive/` is history, never an authority; `docs/README.md` classifies every document.
- This file beats any document; the code beats this file on what is built (then fix this file).

## Target
iOS only for v1; Android config stays and keeps building. Expo SDK: `package.json`. Trunk: `mainexpo`; no branch switch or creation unless the dispatch prompt says so.

## Invariants
- Money is integer cents, shown only through `formatBudget()`; labels follow the payment state (never "paid" before released, never faked).
- One account, both capabilities: no role gates any table, RPC or policy. Mode changes only via `switchMode()`; card perspective from `ModeContext`.
- `accept_offer()` is the only assignment path and `transition_job_status()` the only status mover (`open → assigned → in_progress → completed`). Never set `assigned_worker_id` or `status` from the client; never call or imitate the deprecated `accept_bid()` / `respond_job_request()`.
- `job_offers` is RPC-write-only. Messaging opens only after an offer is accepted and a worker assigned.
- The exact address lives in `job_locations` (owner + hired worker, by RLS); open-market surfaces show approximate location only.
- Never invent marketplace data. Never duplicate lifecycle derivation: extract and share.

## Surfaces
- Tokens: `ui/tokens.ts` through `lib/theme.ts` (`lib/authTheme.ts` the exception); no fourth token surface; no hardcoded hex, radii or spacing (`.claude/rules/native-ui.md`).
- Locked files: none (emptied 2026-08-19); regression fences protect screens.
- Frozen web/PWA surface: `public/`, `hosting/`, `dist/`, `WEB_DEPLOYMENT.md`, service worker, `*.web.ts(x)`, web map; a task that needs one stops and explains.
- `docs/mockups/` is direction, never a canvas (screenshots: `docs/LAUNCH_CHECK.md` §Screenshots). Nothing may depend on AI.
- Never modify, weaken or bypass `.claude/` or its deny matrix.

## Supabase
Production (`avkighsiufeefyycbebf`) is never contacted, read or write. `.env` stays on staging; never modify it. A run uses only the local stack, never a remote project. Rest: `.claude/rules/supabase.md`.

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

## Critical folders
- supabase/migrations/
- supabase/functions/
- lib/phoneAuth/
- lib/payments/
