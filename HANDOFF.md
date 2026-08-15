# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-15 - stage3: completion review + static security sweep

`npm run verify` is GREEN: 531 tests pass / 0 fail / 0 skipped. Doc-only run; no
code, SQL, or config changed. Two reports added under `docs/audits/`:
`COMPLETION_REVIEW_2026-08-15.md` and `SECURITY_SWEEP_2026-08-15.md`. Both carry
the static-audit ceiling - source defects only, never runtime safety; on-device
adversarial testing is still required before beta.

Applied reality (staging `zzkumxcjtbqoselzptig`, live snapshot 2026-08-15):
phases 67-72 (incl. 69_default_privileges) all APPLIED. Account deletion + push
proven end-to-end on a physical iPhone; an EAS **development** build
(`app.brazos.mobile`, staging) runs on device; `send-push` deployed (one manual
call drained 94 claims). The last handoff's three blockers - apply phase68, the
security-hardening pair, the EAS dev build - are all CLOSED.

What blocks a beta now (worst first):
1. Money loop is build-gated - checkout/release/tip/cash-out work only on a
   `__DEV__` dev-client build; a release binary disables payments.
2. Phone sign-in dead-ends on a release build; email is the only session path.
3. Push has no scheduler - the outbox drains only on a manual `send-push` call.
4. `transition_job_status` NULL-unsafe guard leaks unassigned jobs (read-only
   oracle); residual anon EXECUTE on ~11 pre-phase32 functions is NOT
   DETERMINABLE STATICALLY - needs a live `pg_proc.proacl` check.
5. Named smaller: `saved_workers` upsert may 42501, in-app notification
   dead-taps, session tokens in unencrypted AsyncStorage, unbounded money.

Production (`avkighsiufeefyycbebf`) has none of the migrations; standing decision
is a rebuild from a staging dump. Never contacted. `supabase/.temp/` is expected
untracked CLI state (now gitignored).
