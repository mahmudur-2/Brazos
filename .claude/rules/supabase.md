---
paths:
  - "supabase/**/*.sql"
---

# Supabase migration mechanics

- New file, next number: `supabase/phaseNN_short_name.sql`. Never edit an
  already-deployed migration (phase29–32 in particular are deployed and
  verified).
- Migrations must be **idempotent** — safe to paste twice.
- Changing an existing RPC's parameter list means `drop function` with the
  full old signature, then create the new one, then re-grant.
- Regenerate types after schema changes.
- SQL Editor "success" is not proof — only a green
  `node scripts/verify-schema.mjs` run counts as applied.

## Audit note (docs/CLAUDE_MD_AUDIT.md §2)

`transition_job_status` has stacked `create or replace` definitions across
phase29 / 31 / 35 / 51 / 58, with an arity change mid-stream (phase35 dropped
the 3-arg signature and recreated it 4-arg). Before touching it, read the
latest definition (phase58) and confirm which signature is live.
