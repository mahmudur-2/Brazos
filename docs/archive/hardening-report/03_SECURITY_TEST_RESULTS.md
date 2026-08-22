# Security test results

## Executed automated checks

Command: `npm test`

Result: PASS — 6 tests, 0 failures.

`tests/hardening.test.mjs` verifies:

1. Private/protected profile fields are outside direct authenticated reads and
   writes, while the self RPC allowlist contains only intended editable fields.
2. Jobs, bids, status transitions, bid acceptance, and reviews use
   server-validated RPCs; direct protected writes are revoked; delete is
   open/owner/zero-bid scoped.
3. Chat buckets are private, reads require job-party membership, writes require
   caller-owned paths, and client display uses signed URLs.
4. Avatar and job-photo insert paths are ownership-bound.
5. Unsupported notification-response listeners are not registered on web.
6. Unsupported identity/proximity claims are absent.

These are source-level regression tests. They prove the intended controls are
present in the migration and matching client, not that a remote database has
applied them.

## Adversarial matrix

| Required scenario | Code/migration result | Executed against PostgreSQL? |
|---|---|---|
| Modify `is_admin`, `banned`, `role`, verification, or ratings | Direct profile mutation revoked; `update_my_profile` rejects protected/unknown keys | No |
| Read another user's phone/admin/ban data | Authenticated SELECT grant omits those columns; public fetches use allowlist | No |
| Insert/update another user's job or protected job state | Direct INSERT/UPDATE revoked; auth-derived/state-checked RPCs | No |
| Insert/update another worker's bid or accept with forged amount/worker | Direct mutation revoked; create/accept derive and lock server rows | No |
| Review an unrelated/incomplete job or forge reviewer | Direct insert revoked; `create_review` validates parties/completion/rating | No |
| Access admin report functions/policies as non-admin | Report policies use self-only `current_user_is_admin()` boolean helper | No |
| Read private chat object as non-party | Private bucket plus job-party SELECT policy | No |
| Upload under another user's chat/avatar/posting path | Storage policies compare path segment to `auth.uid()` | No |
| Upload completion media for an unassigned job | Completion-photo policy requires `assigned_worker_id = auth.uid()` | No |

Reason PostgreSQL execution was stopped: the machine has no PostgreSQL client,
Docker, or Supabase CLI, and no disposable local/staging project was supplied.
Using the configured remote project would risk production data and violate the
task. Run `supabase/tests/phase29_security_contract.sql` after applying phase 29
to a disposable/staging database, then add two authenticated test identities
and exercise every denial in the table above.

## Secret checks

- `.env` exists locally but is not tracked and its values were not read or
  copied into this report.
- `.env.example` contains configuration names/placeholders.
- High-confidence credential-pattern scan outside ignored `.env*`,
  `node_modules`, `.git`, logs, and ZIP files: 0 candidate files.
- `.gitignore` now also excludes logs, `.claude/`, and `brazos-review.zip`.

## Dependency audit

Command: `npm audit --omit=dev`

Result: FAIL — 29 advisories (19 high, 10 moderate, 0 critical). High-severity
paths are in Expo/React Native build/development transitive dependencies such as
`postcss`, `brace-expansion`, `glob`, and related CLI/Babel packages. npm's
available remediation requires breaking upgrades (including newer Expo and
React Native lines). `npm audit fix --force` was not applied because it would
violate the conservative/no-library-replacement scope and needs a dedicated SDK
upgrade and regression cycle.
