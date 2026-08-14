# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## Last meaningful work - 2026-08-14

phase68 written: five SECURITY DEFINER bodies routed through
`is_profile_active(uuid)`, so a phase67 tombstone is refused and not just a ban. Inventory and evidence: [`docs/audits/PHASE68_DIAGNOSTIC.md`](docs/audits/PHASE68_DIAGNOSTIC.md).

`npm run verify` green: lint plus **519 tests, 519 pass, 0 fail, 0 skipped** on
Node 24 (`.nvmrc` pins the major; CI reads it). **verify-schema not run** - it
needs live staging, which an autonomous run never contacts; last run 2026-08-13.

## Device verification

**phase67 is APPLIED to staging and device-verified (2026-08-14).** The delete
passed all four device-observable checks: auth row gone, tombstone present,
`phone` NULL, open job cancelled. Completed-job survival was **verified by
reading the function body, not on a device** (phase67:409-412 writes status only
where `status = 'open'`; phase67:610-614 retains `jobs`).

Also device-verified: inbox, merged timeline, mode switch. Test-green only, never on a device: phase66 lock, offers.

## Current blockers

1. **phase68 is written and applied nowhere.** Apply
   `supabase/phase68_deleted_at_authorization.sql` to staging; steps, expected
   NOTICE and self-check meanings are in the phase68 section of
   [the phase67 runbook](docs/runbooks/phase67-account-deletion.md); rollback is
   `supabase/phase68_rollback.sql`. Five ban gates stay open until it lands.
2. **Security, blocking push ship:** unauthenticated user-ID lookup chained to
   a notification write; photo storage publicly listable.
3. **EAS development build** before TestFlight and push; fix the weakened
   production gate in the same pass.

## Next priorities and deferred issues

[`BRAZOS_MASTER_PLAN.md`](BRAZOS_MASTER_PLAN.md): phase68, security, EAS build;
deferred items enumerated there. Not there: P1-03/05/08/10; `start.ps1` Stripe
key mode **UNVERIFIED**. `.claude/settings.local.json` allow list cut 76 to 14, unversioned - [`docs/audits/HARDENING_RUN_B_2026-08-14.md`](docs/audits/HARDENING_RUN_B_2026-08-14.md) is its only record.
