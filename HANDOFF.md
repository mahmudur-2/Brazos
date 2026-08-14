# BRAZOS — HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## Last meaningful work

Agent-safety layer replaced: fail-closed PreToolUse guard plus canary suite.

## Last validated state — 2026-08-14

`npm run verify` green: lint plus **519 tests, 517 pass, 0 fail, 2 skipped** on Node 24
(`.nvmrc` pins the major; CI reads it). No tolerated failures remain — two
stale `pwa.test.mjs` literals now match the frozen `public/` surface.
**verify-schema not run** (needs live staging); 2026-08-13: 179 checks OK,
0 MISSING, 4 PENDING (phase67), exit 0.

## Device verification

Device-verified: inbox one-row-per-person, merged timeline, mode switch.
Test-green only, never on a device: phase67 deletion, phase66 lock, offers.

## Current blockers

1. **phase67 is written and applied nowhere.** Follow
   [`docs/runbooks/phase67-account-deletion.md`](docs/runbooks/phase67-account-deletion.md)
   — FK NOTICE expectations, deletion counts, walk-through, verbatim.
2. **Security, blocking push ship:** unauthenticated user-ID lookup chained to
   a notification write; photo storage publicly listable.
3. **EAS development build** before TestFlight and push; fix the weakened
   production gate in the same pass.

## Next priorities

[`BRAZOS_MASTER_PLAN.md`](BRAZOS_MASTER_PLAN.md): phase67, security, EAS build.

## Deferred known issues

Enumerated with reasons in [`BRAZOS_MASTER_PLAN.md`](BRAZOS_MASTER_PLAN.md).
Not there: P1-03/05/08/10; `start.ps1` Stripe key mode **UNVERIFIED**.
`.claude/settings.local.json` allow list cut 76 to 14; unversioned, so [`docs/audits/HARDENING_RUN_B_2026-08-14.md`](docs/audits/HARDENING_RUN_B_2026-08-14.md) is its only record.
