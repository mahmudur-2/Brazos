# SECURITY-VERDICT (step E3, Fable, 2026-11-08)

Inputs: docs/lean/security-facts.md (E1a, local DB at 72b6a30), docs/lean/audit-facts.md (E1b, code at
b37f6e2), a re-measure of the local DB after lean_v1 (below), `npm audit --omit=dev` at b37f6e2.
Scope: TestFlight internal testers, Stripe test mode, staging backend. Production is out of scope.

## Re-measure after lean_v1 (local, VERIFIED 2026-11-08 03:35)
- 33 relations in public (28 tables + 5 views). authenticated holds TRUNCATE on 20; anon holds TRUNCATE
  on 20 and SELECT on 15. Every anon SELECT is blocked by RLS today (no policy grants anon a row), so
  this is a grant hygiene gap, not a data leak.
- Policies not limited to `authenticated`: 5, all gated by `auth.uid()` or `auth.role()`
  (app_config world-readable is intended). No policy returns rows to anon.
- View `conversations`: security_invoker=on, but anon and authenticated hold all 8 privileges on it.
- Zero-policy tables still granting rights: banned_phones (anon+authenticated SELECT/TRUNCATE).
- Functions executable by anon: review_is_revealed only.

## Blockers (fix in E4 before any TestFlight build)
B1. Grant hygiene, one migration `20261108010000_lean_v1_grants.sql`:
    - revoke TRUNCATE, REFERENCES, TRIGGER, MAINTAIN from anon and authenticated on every table and
      view in public; revoke ALL from anon on every table and view except SELECT on app_config;
      revoke ALL on view `conversations` from anon; revoke everything from anon and authenticated on
      banned_phones; revoke EXECUTE on review_is_revealed from anon.
    - revoke EXECUTE from authenticated on functions the client never calls and that reveal other
      users' state: is_blocked_between, should_notify, job_request_parties_ok (then DROP it: its
      table is gone).
    - `alter default privileges for role postgres in schema public`: revoke all on tables and
      sequences from anon; revoke TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on tables from
      authenticated. (supabase_admin defaults cannot be altered from a migration: note it.)
    - pgTAP `310_grants.sql`: no anon privilege on any public relation except app_config SELECT; no
      TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for authenticated anywhere in public; anon can execute no
      public function; the three revoked functions are not executable by authenticated; every table
      has RLS on (keep); the default-privilege rows for postgres carry no anon entry.
B2. Storage is undecided: the app stores public URLs for `avatars` and `job-photos` (lib/storage.ts:176)
    while the local buckets are private; staging flags UNKNOWN; the privacy policy says job media is
    public. Decide now, in the same migration: `avatars` public=true (shown to everyone by design),
    `job-photos` public=true for v1 (postings are market-visible; the privacy policy already says so),
    `chat-photos` stays private (signed URLs). Set `file_size_limit` = 26214400 (25 MB) and
    `allowed_mime_types` = image/jpeg, image/png, image/webp, image/heic, video/mp4, video/quicktime on
    all three. Delete the orphan buckets chat-audio and chat-documents if seed/config still create
    them. pgTAP: bucket flags, size limit and mime list as asserted; the storage policies from
    security-facts §7b still present for the three buckets. Backlog (v1.2): completion and review
    photos move to signed URLs like chat-photos.
B3. Three edge functions compare the service key with a plain string `!==` (send-push index.ts:222,
    send-receipts :224, process-settlements :442). Add `supabase/functions/_shared/serviceAuth.ts`
    with a constant-time compare (Deno std `timingSafeEqual` over equal-length byte arrays, length
    checked first) and a POST-only method check; use it in all three. Node test
    `tests/edgeServiceAuth.test.mjs`: the helper exists, all three import it, no `!== \`Bearer`
    or `=== \`Bearer` compare remains in supabase/functions.
B4. Build-time modes are not pinned: eas.json sets no EXPO_PUBLIC_PHONE_AUTH_MODE or
    EXPO_PUBLIC_PAYMENTS_MODE, so a build inherits whatever the EAS environment holds. Pin the
    non-secret values in eas.json: preview and production get `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase`
    and `EXPO_PUBLIC_PAYMENTS_MODE=stripe`; development keeps mock. e2e-test (simulator) gets
    `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase` too (Maestro uses the Supabase test phone number). Node test
    in tests/appConfig or a new tests/easProfiles.test.mjs: those keys present per profile; no profile
    sets `mock` except development. (Secrets such as the Supabase URL/key stay in the EAS
    environment; G1 verifies they exist by name with `eas env:list`.)
B5. `npm audit --omit=dev`: 37 findings (1 critical shell-quote, 16 high, all transitive except zod).
    Run `npm audit fix` (never --force), then `npm run verify` and `npx expo export --platform ios`
    must pass; report the remaining count. postcss (needs an Expo major) stays and goes to BACKLOG.

## Shoulds (cheap, do in E4)
S1. handle_new_user trusts `raw_user_meta_data->>'phone'` (client-supplied). Prefer the verified
    `new.phone` and fall back to metadata only when `new.phone` is null; pgTAP in 300 (the auth trigger
    test): a user row with phone set gets that phone even when metadata says another.
S2. delete_my_account only checks `auth.uid() is not null`: add `is_active_user()` like every other
    mutator? NO: a banned user must still be able to delete their data (privacy). Keep; document in
    ARCHITECTURE.md's deletion paragraph (one sentence).
S3. Phone auth in `supabase` mode has no client attempt counter: GoTrue rate-limits
    (token_verifications 30 / 5 min hosted default). Keep; add one node test asserting `mock` can
    never resolve outside `__DEV__` (tests/phoneAuthMode or extend an existing phoneAuth test) if no
    such assertion exists yet.
S4. Sentry: add `enabled: env.EXPO_PUBLIC_APP_VARIANT !== 'development'` so dev runs stop sending
    events; add `release`/`dist` from expo-constants if already imported there (skip if it needs a new
    import). PII scrubbing is in place (sendDefaultPii false, beforeSend scrubber).
S5. Legal copy: PRIVACY_VERSION bump in lib/legal/index.ts (facts changed in D8/D9: mutes and portfolio
    gone; job media public stated correctly after B2); termsOfService.ts:134 and :244 still mention
    portfolio photos: remove. Test: the legal fence tests still pass.
S6. Dependabot alerts and automated security fixes: enabled by the judge via the GitHub API on
    2026-11-08 (repo setting, reversible). Nothing to build.

## Laters (BACKLOG.md, security section)
L1. job-photos completion/review folders to signed URLs. L2. postcss advisory (Expo major).
L3. supabase_admin default privileges (Supabase-owned; raise with the Advisor on staging).
L4. Supabase Security Advisor and Performance Advisor export for staging: owner, 2 minutes, morning.
L5. notify_on_bid re-home then drop the bids table (CUT-LIST ruling 46).

## Verified non-issues (keep as they are)
- accept_offer, transition_job_status, release_job_payment, begin_*_payment, cancel_job, create_offer,
  counter_offer, open/withdraw dispute, update_job_details, unsend_message: caller checks present
  (audit-facts §2). Money amounts are server-derived; tips are client amounts capped by a trigger.
- stripe-webhook: constant-time HMAC, 300 s tolerance, event id primary key, unknown types ignored.
- create-payment forwards the caller's JWT to the RPC; the RPC checks ownership in SQL.
- connect-return reflects nothing. No secret-shaped string in the app tree. Sentry sends only the user id.
- No client write to jobs.status, assigned_worker_id or job_offers.

## Gate
E4 lands as ONE commit touching: the grants migration, pgTAP 310 + 300 edits, _shared/serviceAuth.ts +
three functions, eas.json, sentry.ts, legal files, package-lock.json. `npm run db:reset`, `npm run
db:test`, `npm run verify`, `npx expo export --platform ios` all green. Then E5 (Fable review of the diff).
