 > **SUPERSEDED 2026-08-18 — DO NOT APPLY. Covers phases 51-58 only; phases
> 59-75 are absent. The production path is a rebuild from a staging schema
> dump (standing decision, BRAZOS_MASTER_PLAN.md). Kept for history only.**

# PROD_APPLY — production migration queue (human-executed; NEVER by an agent)

Everything below was applied to
staging in this order and verified green there; production has none of it.
(The "Source of truth: BRAZOS_BUILD_STATE.md" line this file used to open
with is gone — that file is retired; docs/README.md classifies what owns
what now.)
Apply strictly in order; after EVERY step run
`node scripts/verify-schema.mjs` against production `.env` and stop on
anything but green. All eight migrations are idempotent (safe to paste
twice).

| # | File | What it does | Rollback note |
|---|---|---|---|
| 1 | `supabase/phase51_active_work_lifecycle.sql` | Arrival timestamps, completed_at, checklist + disputes tables, release / auto-release / tip RPCs | Additive. Reverse = drop the two tables, three columns, seven functions; installed builds never call them until the app update ships. |
| 2 | `supabase/phase52_offer_scoped_chat.sql` | Thread auto-create trigger on job_offers + backfill | Reverse = drop trigger + function. Backfilled `direct_threads` rows are plain pair rows; harmless to keep. |
| 3 | `supabase/phase53_worker_self_service.sql` | worker_services, saved_workers, portfolio.published, availability columns, update_my_profile widened | Additive; portfolio SELECT policy narrowed (published-or-owner). Reverse = restore `portfolio_select_all`, drop the rest. Existing rows default published=true, so nothing visible changes at apply time. |
| 4 | `supabase/phase54_review_integrity.sql` | Defense-in-depth reviews INSERT policy (behind phase29's revoke) | Reverse = drop the policy (create_review remains the sole reachable path either way). |
| 5 | `supabase/phase55_sandbox_cash_out.sql` | payments.paid_out_at + sandbox_cash_out() | Additive. Reverse = drop function + column. |
| 6 | `supabase/phase56_notification_feed.sql` | Outbox becomes the recipient feed (read_at, recipient RLS, UPDATE→read_at only), should_notify loses ONLY the push-token gate, release/dispute triggers | Reverse = re-add the token gate (phase20 body), drop the two triggers/policies/column. NOTE: this narrows anon/authenticated table grants on notification_outbox — verify no service tooling relied on broad grants. |
| 7 | `supabase/phase57_direct_thread_message_notifications.sql` | notify_on_message handles direct threads | Reverse = restore the phase20 body (job-thread-only). |
| 8 | `supabase/phase58_hardening_fixes.sql` | DROPS the legacy permissive jobs SELECT policy (security fix), client_job_stats(), authorize-after-start, idempotent transition retries | Reverse of the policy drop = recreate the legacy policy — DO NOT: it re-opens every job row (incl. private direct-offer drafts) to all users. KNOWN TRADE-OFF at apply time: installed builds' cross-user posted/completed counts undercount until users update (no errors — numbers read lower). Function changes reverse to the phase50/51 bodies. |

After #8: run `scripts/phase5-proof.sql` through `phase12-proof.sql` and
`node scripts/lifecycle-proof.mjs` — but ONLY against staging; the proofs
create/roll back data and the lifecycle proof writes real rows. Production
verification is verify-schema plus the device pass (REVIEW_GUIDE.md).

## STAGING-ONLY — must NEVER touch production
- `scripts/staging-acl-bootstrap.sql` (rebuilds staging's stripped grants)
- `scripts/seed-phase-6.sql`, `seed-phase-7.sql`, `seed-phase-8.sql`,
  `seed-phase-9.sql`, `scripts/seed-review.mjs` (test identities + fixtures)
- `scripts/lifecycle-proof.mjs` (writes real rows for its two accounts)
- every `scripts/phaseN-proof.sql` and `scripts/rls-probe-*.mjs`
  (rolled-back, but they exercise auth.users fixtures that only exist on
  staging)
- `prod_schema.sql` (reference dump; not a migration)
