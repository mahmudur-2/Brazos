## 2026-08-21 — BATCH B: production guard + verify-schema honesty (F-003, F-006): COMPLETE

Five commits on `mainexpo`. **Suite at end of run: 804 pass / 0 fail / 0
skipped, exit 0** (bare `npm run verify`; this run's baseline was 799 pass /
0 fail). Pushed under the autonomy contract's gate after the final green
verify — flag-free `git push origin mainexpo`; as always, `git` is the
authority on what actually reached the remote.

**The CLAUDE.md push contradiction is CLOSED.** The Workflow bullet that
still said "Never autonomously `git push` …; also mechanically denied" now
defers to the "Agent autonomy" contract as the single authority and states
the gate: flag-free `git push origin mainexpo`, only after `npm run verify`
exits 0 in that same run. No other CLAUDE.md statement contradicts the
contract. This was the one protected-control edit the dispatch authorized.

**`scripts/verify-schema.mjs` was refactored and hardened, and was never
executed** — no database was contacted this run; the new tests import its
exported functions instead of running it.

- **F-003 closed.** main() hard-refuses the production project ref FIRST:
  a `.env` URL or key, or `SUPABASE_DB_URL_STAGING`, resolving to production
  exits 4 with the source named — evaluated before `headers` is assigned and
  before any request exists. Parity alone could never catch an
  all-production `.env` (three agreeing refs pass parity); that is the hole
  this closes.
- **The ref constants live in `scripts/supabase-ref.mjs`** (`STAGING_REF`,
  `PRODUCTION_REF`) — MOVED there from `eas-build-pre-install.mjs`, not
  retyped; both gates and the tests import the one definition. Never retype
  a ref literal anywhere.
- **F-006 closed.** PENDING now fails the run — an unmet sentinel used to
  print PENDING, suppress its whole group and still exit 0, so a completely
  unmigrated database passed. And `checkColumnRevoked` passes ONLY on a
  denial (403 / body code 42501, the `checkRpcDenied` shape); a 404 missing
  table or 42703 missing column now fails as absent-is-broken-not-secured —
  23 assertions, `payments` among them, previously passed on ANY non-2xx.
- **Exit codes** (the frozen `EXIT` map in the script header is the one
  definition): 0 ok · 1 MISSING ("applied wrong") · 2 missing `.env` values
  or control-probe failure · 3 env parity failure · 4 production ref
  refused · 5 PENDING ("not applied yet"). MISSING wins the code when both
  are red; the summary prints both counts.
- **Importing `verify-schema.mjs` is now side-effect-free** — everything
  effectful lives in main() behind the same isMain guard the EAS gate uses —
  which is what lets `tests/verifySchemaGuards.test.mjs` pin all of the
  above offline. Ten core assertions were mutated red in two batches and
  restored green before the commit.
- The missing-tooling-ref condition **stays a warning by decision**: the
  ref feeds only the optional app-vs-tooling cross-check, no probe uses it,
  the verdict line already refuses to over-claim ("app side only"), and
  `envParity.test.mjs` pins warn-not-fail as the designed contract.

**OPERATOR STEP OWED:** with `.env` pointed at staging, run
`node scripts/verify-schema.mjs` yourself (optionally with
`SUPABASE_DB_URL_STAGING` exported for the tooling cross-check). Expect
exit 5 while sentinel-gated migrations remain unapplied — that is the new
honest signal, not a regression. Exit 4 means a ref resolved to production:
stop and fix the environment before anything else.

**NEXT: BATCH C — phase76**, per the operator's batch sequence. Nothing in
this run touched `supabase/` or contacted any database.

