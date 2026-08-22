# Brazos hardening summary

Date: 2026-07-30

Branch: `hardening/bugs-security-efficiency`

Baseline checkpoint: `5413ab7` (`Add Brazos project audit`)

## Outcome

This pass made the smallest practical changes for verified authorization, privacy,
atomicity, runtime, and misleading-state problems. It did not add product
features, redesign screens, change branding, deploy anything, use production
credentials, or modify remote data.

### Fixed in source and migration

- Protected profile fields and private phone data are no longer available
  through ordinary authenticated table writes/reads after
  `supabase/phase29_security_hardening.sql`.
- Job, bid, location, status-transition, bid-acceptance, and review writes move
  behind authenticated, validated `SECURITY DEFINER` functions.
- Bid acceptance is one locked database transaction and derives the selected
  worker and amount from the bid row.
- A client can delete only their own open, zero-bid job; assigned/completed
  zero-bid jobs are no longer deletable through the policy.
- Chat photo/audio buckets become private; reads require job membership and
  new upload paths are bound to the authenticated sender.
- Avatar, posting-photo, and completion-photo upload paths are ownership-bound.
- Public profile, job, bid, review, and message reads use explicit projections
  in the modified data-access paths.
- Web no longer invokes unsupported notification-response APIs.
- The chat hook uses instance-unique realtime channels, ignores late async
  media/fetch completion after cleanup, and deduplicates inserts by message ID.
- Unsupported “ID-checked” and proximity claims were replaced with accurate,
  neutral labels.
- Strict unused-code checking now passes after removing verified dead imports
  and constants.

## Validation status

- VERIFIED: TypeScript check passed.
- VERIFIED: strict unused-code lint command passed.
- VERIFIED: six hardening regression tests passed.
- VERIFIED: Expo dependency compatibility check passed.
- VERIFIED: Android, iOS, and web production export passed.
- VERIFIED: the local web runtime returned HTTP 200 and primary read-only flows
  rendered in an authenticated smoke test.
- VERIFIED: a high-confidence credential-pattern scan found zero candidate
  files outside ignored `.env*`, logs, build dependencies, and ZIP artifacts.
- NOT EXECUTED: `supabase/phase29_security_hardening.sql` and
  `supabase/tests/phase29_security_contract.sql`. There is no local PostgreSQL,
  Docker, Supabase CLI, or disposable staging project in this workspace.

## Deployment gate

The migration and matching client changes must be tested together in a
disposable/staging Supabase project before any release. Until phase 29 is
applied, the repository still describes the old unsafe live-database policies;
after it is applied, older clients that write jobs/bids/reviews directly will
fail. No live schema or production state was inspected or changed in this pass.
