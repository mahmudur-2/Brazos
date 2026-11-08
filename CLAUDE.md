# BRAZOS: policy, never current state

## Core rules (copied from the owner's global rules)
Global rules apply; this file holds only this project's rules.
- Handoff file: `HANDOFF.md` (not docs/STATE.md).
- BRAZOS production deploys stay manual: a production step is always a parked step for the owner, never run by a chat.

## Owners
- Git owns branch, HEAD and tree; no document may claim them.
- `HANDOFF.md`: Now / Blocked / Next / Revert. `docs/ARCHITECTURE.md`: what is built. `docs/DECISIONS.md`: decisions in force. `docs/TESTING.md`: how to verify. `docs/BACKLOG.md`: work outside v1.
- This file beats any document; the code beats this file on what is built (then fix this file).
- Agents: read this file in full, then `HANDOFF.md`, then only the files the task touches. Derive the Expo SDK from `package.json`; never pin a version or docs URL in a document. `_archive/` is history, never an authority.

## Target
iOS only; no Android or web config. Expo SDK: `package.json`. Trunk: `mainexpo`; no branch switch or creation unless the dispatch prompt says so.

## Invariants
- Money is integer cents, shown only through `formatBudget()`; labels follow the payment state (never "paid" before released, never faked).
- Payments mode is `stripe` or `disabled`; there is no practice-money path.
- One account, both capabilities: no role gates any table, RPC or policy. Mode changes only via `switchMode()`; card perspective from `ModeContext`.
- `accept_offer()` is the only assignment path and `transition_job_status()` the only status mover (`open → assigned → in_progress → completed`). Never set `assigned_worker_id` or `status` from the client.
- `job_offers` is RPC-write-only. Messaging opens only after an offer is accepted and a worker assigned.
- The exact address lives in `job_locations` (owner + hired worker, by RLS); open-market surfaces show approximate location only.
- Never invent marketplace data. Never duplicate lifecycle derivation: extract and share.

## Surfaces
- Tokens: `ui/tokens.ts` through `lib/theme.ts` (`lib/authTheme.ts` the exception); no fourth token surface; no hardcoded hex, radii or spacing (`.claude/rules/native-ui.md`). Light and dark both ship.
- Nothing may depend on AI.
- Never modify, weaken or bypass `.claude/` or its deny list.

## Supabase
Production (`avkighsiufeefyycbebf`) is never contacted, read or write. `.env` stays on staging; never modify it. A run uses only the local stack, never a remote project. Staging gets migrations only through the pipeline; a destructive file waits for the owner's click. Rest: `.claude/rules/supabase.md`.

## Workflow
Verify: npm run verify
- Check branch and HEAD with `git` against the dispatch prompt; on a mismatch, stop.
- Keep unrelated changes: never stash, reset, clean, revert or edit them.
- Stage by explicit path; check `git diff --cached --name-status`; one commit per milestone.
- Push only `git push origin mainexpo`, only after `npm run verify` exits 0 in the same run.
- Never `reset --hard`, `clean`, `stash`, force checkout, rewrite history or `--amend`.
- `npm run verify` = lint (`tsc` + unused checks), then `npm test`. A failing test is a failure: fix the code or the test, and say which.
- Inspect, execute, verify, self-repair, continue; never ask the owner to run a command you can run. Report exceptions, not routine.
- Flag a new dependency before adding it. Motion goes through `lib/motion120` (`USE_NATIVE_DRIVER` from `lib/motion.ts`); no new animation library; `LayoutAnimation` is banned. No unrelated cleanup.
- Rewrite `HANDOFF.md` last, after every other commit; Git keeps the older sections.
- A feature outside v1 goes to `docs/BACKLOG.md`. A taste decision is never reversed within 48 hours.
- "Done" needs evidence in the same report; without it, write "landed, unverified". Never state repo facts from memory.

## Critical folders
- supabase/migrations/
- supabase/functions/
- lib/phoneAuth/
- lib/payments/
