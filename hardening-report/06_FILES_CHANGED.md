# Files changed

## Security and data access

- `supabase/phase29_security_hardening.sql` — restrictive migration, validated
  write RPCs, profile column privileges, private/path-owned storage policies.
- `supabase/tests/phase29_security_contract.sql` — read-only post-migration
  privilege/policy contract assertions.
- `lib/profiles.ts` — public/self projections and self-only profile RPC access.
- `lib/AuthContext.tsx` — self-only ban check and safe profile update path.
- `hooks/useProfile.ts` — self profile RPC/fallback.
- `lib/jobs.ts` — transactional RPC writes and explicit job projections.
- `lib/bids.ts` — validated bid RPCs, atomic acceptance, safe profile embed.
- `lib/reviews.ts` — validated review RPC and explicit review projection.
- `lib/storage.ts` — owned chat paths, private references, signed URLs.
- `lib/messages.ts` — explicit message projection and private-media resolution.
- `hooks/useChat.ts` — unique/cleaned realtime subscription and async guards.
- `screens/ChatScreen.tsx` — caller-owned photo/audio upload paths.
- `screens/ClientJobDetailScreen.tsx` — atomic acceptance call signature.
- `screens/PostJobScreen.tsx` — removed dead direct-hire input to open-job create.

## Runtime correctness and truthful labels

- `hooks/usePushNotifications.ts` — skip unsupported response APIs on web.
- `components/VerificationBadge.tsx` — remove unsupported ID-check claim.
- `screens/HomeScreen.tsx` — remove unsupported nearby claim.
- `screens/JobDetailScreen.tsx` — remove unsupported nearby claim.

## Strict-check cleanup

- `App.tsx` — removed unused constants.
- `components/HotspotMap.native.tsx` — removed unused map style constant/type.
- `components/HotspotMap.web.tsx` — removed unused import.
- `components/PhotoViewer.tsx` — removed unused pressable-state parameter.
- `screens/ChatScreen.tsx` — removed unused imports in addition to upload changes.

## Reproducibility and local hygiene

- `package.json` — added `typecheck`, `lint`, `test`, and `export` scripts.
- `tests/hardening.test.mjs` — six static security/runtime regression tests.
- `.gitignore` — ignores logs, `.claude/`, and the local review ZIP.
- `hardening-report/00_SUMMARY.md`
- `hardening-report/01_VERIFIED_FINDINGS.md`
- `hardening-report/02_CHANGES_MADE.md`
- `hardening-report/03_SECURITY_TEST_RESULTS.md`
- `hardening-report/04_BUILD_AND_RUNTIME_RESULTS.md`
- `hardening-report/05_REMAINING_RISKS.md`
- `hardening-report/06_FILES_CHANGED.md`

No dependency version or package-lock change was made.
