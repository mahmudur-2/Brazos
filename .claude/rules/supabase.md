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