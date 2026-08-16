# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-15 - stage4A: pre-redesign fixes

`npm run verify` is GREEN: **544 tests pass / 0 fail / 0 skipped** (lint =
`tsc --noEmit` plus `noUnusedLocals` / `noUnusedParameters`, then the full
`node --test tests/*.test.mjs` suite). Six commits: three code fixes, one
migration file, one test correction, one documentation pass. Full per-commit
detail, including two places where the dispatch prompt's premise did not match
the repository, is in `docs/audits/STAGE4A_FINDINGS.md`.

### What is live in the tree right now

1. **Payments are no longer gated on the build type.** `resolvePaymentsMode`
   in `lib/adapters/paymentsMode.ts` now reads `EXPO_PUBLIC_PAYMENTS_MODE` as
   an allow-list: `sandbox` -> sandbox on every build type, `disabled` ->
   disabled, unset/blank/whitespace -> sandbox in dev and disabled in a
   release, anything else -> disabled with the reason surfaced. Trimmed and
   case-folded first. Checkout, release, tip and cash-out therefore work on a
   TestFlight binary. No payment RPC, amount, cents arithmetic or state-machine
   rule changed, and no `live`/`real`/`production` value exists.
2. **The saved-worker write is idempotent.** `saveWorker` sends
   `ignoreDuplicates: true`, so PostgREST emits `ON CONFLICT DO NOTHING` and
   the write needs INSERT only. `saved_workers` has neither an UPDATE grant nor
   an UPDATE policy (phase53 grants `select, insert, delete` and defines those
   three policies), and nothing was widened. Re-saving an already-saved worker
   now succeeds silently.
3. **Notification feed taps route correctly, and this landed IN FULL.**
   `NotificationsScreen` no longer carries its own routing switch; it delegates
   to `lib/notificationRoutes.ts`, the resolver the push-tap path already used.
   Direct-message rows (`Chat` + `directThreadId`) and review rows
   (`ProfileMain`) used to mark themselves read and go nowhere; `WorkerJob`
   rows landed on the hub. All three now open their subject. A row whose
   payload resolves to nothing is not tappable at all. Every destination sits
   in a tab mounted in both navigation trees, so no `switchMode()` was added
   and no cross-tree navigation exists.

### What needs the operator before it takes effect

**A. `phase73` is WRITTEN but NOT APPLIED to any database.** No SQL was
executed during this run. `supabase/phase73_null_safe_owner_guard_and_unsend_gate.sql`
must be hand-applied in the Supabase SQL Editor against staging
`zzkumxcjtbqoselzptig`. Only a green `node scripts/verify-schema.mjs` counts as
applied; until then its **three checks report PENDING** (the
`phase73_null_safe_guards_enabled()` sentinel plus the two RPC-resolution
checks). Both defects it fixes are therefore still live:

- `transition_job_status()` compares `assigned_worker_id` with an inequality,
  which is NULL - not TRUE - on an unassigned job, so the guard does not fire
  and the idempotent return branch hands any authenticated caller the full
  `jobs` row. Read-only, but it bypasses the `jobs` SELECT policies.
- `unsend_message()` has no lifecycle check, so a banned or tombstoned account
  can still blank its own messages.

The file carries an in-transaction self-check that asserts the positive desired
state, so a failed assertion rolls the whole thing back and the sentinel cannot
exist unless every check passed. One caveat when applying: self-check blocks
(f) through (i) select by function NAME without a signature filter, so a stale
`transition_job_status` overload left over from the phase35 arity change would
abort them while the 4-arg function is perfectly correct. Diagnose an
(f)/(g)/(h)/(i) failure by looking for leftover overloads first.

**B. `EXPO_PUBLIC_PAYMENTS_MODE` is not declared anywhere.** Leaving it unset
reproduces the previous `__DEV__` behaviour **exactly**, so nothing regressed by
shipping this - but nothing changed either. To get payments on a release build
the operator must add `EXPO_PUBLIC_PAYMENTS_MODE=sandbox` to `.env` and
**restart Metro** (Expo inlines `EXPO_PUBLIC_*` at bundle time; a hot reload
will not pick it up).

`.env.example` could not be updated by this run: `.claude/settings.json` denies
`Read`/`Edit` on `./.env.*`, and that deny matrix is non-negotiable per
CLAUDE.md. Add by hand:

```
# Payments availability. Two accepted values:
#   sandbox  - simulated money, real ledger rows, no real provider is reachable
#   disabled - every payment call refuses
# Unset (or blank) means sandbox in a dev build and disabled in a release.
# Any other value is rejected and resolves to disabled.
EXPO_PUBLIC_PAYMENTS_MODE=sandbox
```

`env.d.ts` was deliberately left untouched: it declares only `SUPABASE_URL` /
`SUPABASE_KEY` inside `declare module '@env'` and carries no `EXPO_PUBLIC_*`
declarations to match.

### Two follow-ups this run deliberately did not make

- **`screens/CheckoutScreen.tsx`'s sandbox banner still reads "SANDBOX -
  development build."** It is not gated on anything, so it correctly renders on
  a release build now - but the wording will be false on a TestFlight binary.
  Re-word it (and `tests/sandboxCheckout.test.mjs`, which asserts that exact
  string) in the visual overhaul run. Un-gated payments with a misleading
  simulated-money label is an App Review risk.
- **`docs/architecture.md:48` still says payments are "disabled in a release".**
  Stale as of this run. The Stage 4A brief permitted exactly one correction to
  that file, so only the pending-migrations example was updated.

### Carried forward, unchanged by this run

Applied reality (staging `zzkumxcjtbqoselzptig`, live snapshot 2026-08-15):
phases 67-72 all APPLIED. Account deletion and push proven end-to-end on a
physical iPhone; an EAS **development** build (`app.brazos.mobile`, staging)
runs on device; `send-push` is deployed.

Still blocking a beta, worst first:

1. Push has no scheduler - the outbox drains only on a manual `send-push` call.
2. Phone sign-in dead-ends on a release build; email is the only session path.
3. phase73 is unapplied (see A above).
4. Session tokens sit in unencrypted AsyncStorage; money amounts are unbounded.

The anon-EXECUTE question is CLOSED and needs no migration: a direct read of
the post-phase72 staging permission snapshot, across all 121 functions in
schema `public`, found exactly one anon-executable function -
`job_categories_expanded()`, the intended one - zero functions still on the
CREATE-time default ACL, and `worker_job_stats`, `deactivate_push_token` and
`resolve_notification` all sealed.

Production has none of the migrations; the standing decision is a rebuild from
a staging dump. It was never contacted during this run, and its project ref is
not repeated here. `supabase/.temp/` is expected untracked CLI state.
