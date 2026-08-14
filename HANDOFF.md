# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-14 - phase69 written, nothing applied

Sixteen functions in schema `public` still carried the CREATE-time default ACL,
which for a function grants EXECUTE to PUBLIC. Evidence and call sites:
[`docs/audits/PHASE69_DIAGNOSTIC.md`](docs/audits/PHASE69_DIAGNOSTIC.md).
`npm run verify` green: **519 tests, 0 fail**. **verify-schema not run** - needs
live staging; last run 2026-08-13.

**Neither phase68 nor phase69 is applied to any database.** phase68 is authored,
committed and correct - pasted once, aborted at its own self-check (d) because
`job_request_parties_ok` still had a default ACL, rolled back cleanly, needs no
edit. Apply in this order:

1. `supabase/phase69_execute_privilege_lockdown.sql` - expect
   `PHASE69 SELF-CHECK PASS: 16 functions locked`.
2. `supabase/phase68_deleted_at_authorization.sql`, unchanged - phase69 is what
   makes its check (d) pass.

Rollback `phase69_rollback.sql` then `phase68_rollback.sql`.
`phase69_default_privileges.sql` is separate and optional; it stops the drift
recurring in future migrations.

## Blockers

1. **Unauthenticated notification chain, open until phase69 applies.**
   `enqueue_notification`, `notify_display_name`, `notify_nearby_for_job` and
   `is_blocked_between` are SECURITY DEFINER and executable by `anon`, so an
   unauthenticated caller can write into `notification_outbox` and resolve
   display names for arbitrary uuids. **phase69 closes it** - a fix, not a
   mitigation.
2. **Five ban gates stay open until phase68 lands**, which now waits on phase69.
3. Photo storage publicly listable. **EAS development build** before TestFlight
   and push; fix the weakened production gate in the same pass.

**Deferred, no longer an open decision:** E5, `notify_nearby_for_job`. It carries
U+00B7 in a user-visible literal (`phase20:693`), so `create or replace` cannot
re-emit it under an ASCII rule without changing copy. Post-phase69 it is
unreachable by `anon`, and a deleted account is already excluded because
`delete_my_account()` drops the `notification_prefs` row the fan-out inner-joins
(`phase67:476-478`).

Priorities, deferred items, P1-03/05/08/10, UNVERIFIED `start.ps1` Stripe key
mode: [`BRAZOS_MASTER_PLAN.md`](BRAZOS_MASTER_PLAN.md).
