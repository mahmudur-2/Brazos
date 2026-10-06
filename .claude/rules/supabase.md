---
paths:
  - "supabase/**/*.sql"
---
# Supabase migration mechanics
- New migration: `supabase/migrations/YYYYMMDDHHMMSS_short_name.sql`, timestamped after
  every existing file there. The `supabase/phase*.sql` files are historical, superseded
  by the 20260901 baseline — never edited, never extended, never authoritative. The
  live definition of any function is the newest migration that defines it.
- Never edit a migration applied anywhere shared. New evidence gets a new corrective
  migration — never a rewrite that hides the discovery.
- Prove locally before commit: `npm run db:reset` clean, `npm run db:test` fully green.
  pgTAP assertions ride the same run as the migration they prove.
- Regenerate `types/database.ts` (`npm run db:types`) whenever a typed table changes.
- Staging: a migration reaches staging by commit + push to mainexpo. The staging
  pipeline (.github/workflows/staging.yml) verifies, scans pending migrations for
  destructive shapes, applies, then deploys edge functions — in that order, with no
  operator step. A migration that drops or renames a database object stops the
  pipeline; the operator applies it by hand or re-runs with allow_destructive.
- Production: hand-applied by the operator, always. No automation targets production.
- Proof of application is `node scripts/verify-schema.mjs` or the pipeline's
  list-after step — never "SQL Editor success".
- Changing an RPC's parameter list: `drop function` with the full old signature,
  create the new one, re-grant — in a new migration.

## Supabase policy (moved from CLAUDE.md, 2026-10-06)

* Production is never contacted, read or write —
mechanically blocked. `.env` stays pointed at staging; never modify it
during a run. Production migrations are hand-applied by the operator, always:
no automation targets production, no workflow in this repository may be
pointed at it, and none ever applies a migration to it.
* Never contact a REMOTE Supabase project from a run. The local stack
  (`supabase start`, 127.0.0.1) is the run's database: `supabase db reset`,
  `supabase test db` and `npm run db:types` are expected in any schema run.
  Remote projects are contacted only by the operator. The `--linked`,
  `--db-url` and `--project-ref` flags are never used inside a run.
* Every new function needs `grant execute … to authenticated;` (phase32 revoked
the default) or it is unreachable from the app. Never weaken RLS, a policy,
or a grant to make a feature work — add a narrow security definer function.
* **Every new SECURITY DEFINER function in schema `public` carries explicit
`revoke`/`grant` statements in the same migration that creates it** —
`revoke all on function … from public, anon;` then `grant execute … to` only
the roles a call-site inventory proves are needed. The CREATE-time default ACL
grants EXECUTE to PUBLIC, so a function shipped without them is reachable by
`anon` from the moment it exists, and `create or replace` on an existing
function preserves whatever ACL it already had — a later phase cannot quietly
fix it. phase69 is the precedent: sixteen pre-phase32 functions had drifted
that way, four of them forming a live unauthenticated notification chain, and
one of them aborted phase68 at its own self-check. If the function is called
from an RLS policy, grant it to that policy's roles — a policy expression is
evaluated as the querying role, so revoking there breaks the policy, not just
the function.
* **The client is typed.** `lib/supabase.ts` is `createClient<Database>(…)` over
`types/database.ts` through `lib/supabaseTypes.ts` (one correction: a function argument also
accepts null), regenerated with `npm run db:types` (local only) in the same commit as any
migration that changes a table, view, enum or function signature. Client status unions in
`lib/jobLifecycle.ts` and the others remain the app's own vocabulary; SQL that filters on status
still fails safe — allow-list what it accepts, never block-list what it rejects.
* Live table names where older planning vocabulary differs: exact address →
`job_locations`; disputes → `job_disputes`; portfolio → `portfolio_items`;
push tokens → `push_tokens`; notifications → `notification_outbox` +
`notification_prefs`. `completion_records` and `job_media` were never built —
completion media lives on `jobs` as jsonb columns.
* **Staging migrations are neither hand-applied nor hand-triggered.** A
migration reaches staging by being committed and pushed. The push starts
`.github/workflows/staging.yml`, one pipeline of three dependent jobs that runs
in this order and no other: **verify** (the offline suite — nothing reaches
staging until it is green), then **migrate** (apply every pending file), then
**deploy** (the edge functions). There is no SQL Editor step for staging and no
operator tap. A run must NEVER instruct the operator to paste SQL into the SQL
Editor for staging.
* **A destructive migration does not auto-apply.** Before applying anything,
the pipeline runs `scripts/staging-scan.sh` over the files staging reports as
pending. If one DROPS or RENAMES a database object — `drop table`,
`drop column`, `drop schema`, `truncate`, `rename to`, `rename column`,
`delete from` — the job stops before a single statement runs, and that push's
function deploy stops with it. The operator then applies that file by hand, or
re-runs the pipeline from the Actions tab with `allow_destructive` checked. The
reason is not production, which has no users: staging is what the installed
TestFlight builds read, and removing something a build still reads breaks it
the moment it lands. Additive SQL cannot, so additive SQL flows on its own.
* **Edge functions reach staging by the same push**, in the job AFTER the
migration job and never before it. A function deployed ahead of the migration
it depends on is a live 500. `supabase/config.toml` is the only source for
`verify_jwt`; the workflow never passes it as a flag.
* A run still never contacts the remote project itself and never holds a remote
credential: the pipeline is GitHub's, running from the `staging` environment.
What moved is where the gate sits — it was the operator's tap on Run workflow;
it is now the verify job plus the destructive-shape scan, with the tap retained
only for the override.
