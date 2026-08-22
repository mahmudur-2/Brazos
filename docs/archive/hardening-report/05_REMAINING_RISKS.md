# Remaining risks

## Critical release gates

### Phase 29 has not been executed against a database

Severity: CRITICAL deployment gate.

The migration is based on repository phases, but the live schema was not
queried and may differ. Apply `supabase/phase29_security_hardening.sql` only to
a disposable/staging clone first. Run
`supabase/tests/phase29_security_contract.sql`, then test with separate client,
worker, outsider, banned, and admin identities. Stop if the staging schema
differs materially. Do not apply directly to production.

### Client and migration must ship as one coordinated change

Severity: HIGH.

The hardened client calls new RPCs for jobs, bids, reviews, profile self access,
and status transitions. Phase 29 revokes the former direct writes. Deploying
only one side will break legitimate mutations. Existing profile code has a
missing-RPC compatibility fallback; marketplace writes intentionally do not
bypass missing security RPCs.

### Legacy public chat URLs need staging verification after bucket privacy

Severity: HIGH.

`lib/storage.ts::resolveChatMediaUrl` extracts legacy object paths and signs
them. This should preserve existing messages when buckets become private, but
it must be tested against representative legacy objects in staging. Signed URLs
expire after six hours; long-lived open chats currently refresh them only when
messages are loaded or received.

## Dependency risks

`npm audit --omit=dev` reports 19 high and 10 moderate advisories, with no
non-breaking remediation offered by npm. The affected paths are primarily
Expo/React Native CLI/build transitive packages. Resolving them requires a
separate Expo/React Native SDK upgrade, native/web regression testing, and
possibly dependency replacements. No forced audit fix was applied.

## Not changed because scope/risk was too large

- No Expo 54→56/57 or React Native upgrade.
- No production/staging database connection or migration execution.
- No destructive/data-repair migration.
- No native-device push, camera, microphone, location, or storage smoke test.
- No payment, translation, Express/NOW, onboarding, admin, analytics, or
  workflow feature work.
- No broad UI warning refactor.
- No new chat-message write RPC. Ordinary message INSERT RLS still derives
  authority from sender/job-party checks, but the client can supply metadata
  columns added by later migrations if table privileges allow them. A future
  focused migration should revoke direct ordinary-message inserts and expose a
  validated send RPC while preserving server-generated job-request events.
- No universal removal of read-path `any` types. Security-critical mutations
  now derive identity/state in SQL, but older read mappers/RPC results still
  contain loose typing and merit a separate typed Supabase-schema generation
  pass.

## Operational unknowns

- Whether all repository migrations have been applied, in order, to any remote
  environment.
- Whether database grants differ from Supabase defaults assumed by the
  repository.
- Whether existing bucket object names all follow documented legacy paths.
- Whether server-side Edge Functions are deployed with the source revisions in
  this repository.
