# BACKLOG: the only place unscheduled work lives

A run never builds from chat memory: an item is read from here. A feature outside v1 goes here
first. Ranked lists are in the owner's order.

## v1 bugs
- The wizard's "Today" and "Tomorrow" chips take the device's local date, while the running-late
  chips and the server use the New York market date (`lib/runningLate.ts`): a phone outside New York
  between 7 PM and midnight New York time posts "Today" as the wrong market day (e2e run 15 on a UTC
  runner, 2026-11-08; the runner now uses New York time, the app is unchanged).

none open

## v1.2 ranked

1. Lock-screen live card: needs `expo-live-activity` (install the package and add the plugin
   `['expo-live-activity', { enablePushNotifications: true }]`) and APNs keys (`APNS_KEY_P8`,
   `APNS_KEY_ID`, `APNS_TEAM_ID`) on staging, then a new native build. Code and tables were removed.
2. Saved workers and hire again: customers return to a worker they liked without searching.
3. Worker portfolio: a worker shows past work with photos on their profile.
4. Work checklist: a worker's per-job checklist the customer can see.
5. Live location sharing and Track worker: foreground only, no background permission.
6. Voice messages and documents in chat: needs two private buckets and policies again.
7. Message translation: AI, off by rule (D-20261108-2) until the rule changes.
8. Read ticks and reactions in chat.
9. Inbox archive and mute (with the undo toast).
10. Semantic search for workers: AI, off by rule (D-20261108-2) until the rule changes.
11. Price guidance: computed from completed jobs' outcomes, never from live offers (sealed bids,
    D-v3-1).
12. Android: decide with real data after ten users.
13. Web/PWA: the full app in a browser on the same backend; needs a web checkout path (Stripe's
    native library is iOS and Android only), web branches for camera, push, maps and share, a
    domain. A scope change on paper first.
14. Analytics (PostHog): events belong to the mutation layer; webhook-caused events such as
    `payment_held` are server-side only, never from the client.
15. i18n: translated app copy.
16. Re-home `notify_on_bid` onto `job_offers`, then drop the `bids` table and the `jobs.accepted_bid_id`
    column. The drop is destructive: the pipeline stops for the owner.
17. Tighten the `payments.provider` CHECK (`payments_provider_known`) to `stripe` only, and change its
    column default, after a staging reset removes the old `sandbox` rows.

Later, unranked: instant payouts; Instant Book; calendar-based recurrence beyond first-refusal
repeat jobs; waiting-state facts and nudges (notified count, expected first-offer time, 1 h and
24 h nudges; each needs a new RPC or a cron); an "available this week" label (needs an
availability calendar).

## Security (from the lean verdict)

From the lean security verdict (archived 2026-11-08, `_archive/2026-11-lean/SECURITY-VERDICT.md`).

- L1. Move the `job-photos` completion and review folders to signed URLs (D-20261108-12).
- L2. The postcss advisory waits for an Expo major.
- L6. Dependabot (on since the repo went public, 2026-11-09) lists 9 alerts (4 high, 4 moderate, 1 low)
  at https://github.com/mahmudur-2/Brazos/security/dependabot. Triaged 2026-11-11 (ledger N6): all in
  build tools that Expo brings in (`image-size`, `postcss`, `glob`, `minimatch`, `deepmerge`); they
  run on the build machine, not on the phone. The fix is an Expo patch update: a dependency change,
  flag it first.
- L3. `supabase_admin` default privileges are Supabase-owned: raise them with the Advisor on staging.
- L4. Export the Security Advisor and Performance Advisor reports for staging (owner, 2 minutes).
- L5. Re-home `notify_on_bid`, then drop the `bids` table (v1.2 item 16).
- `is_blocked_between` still answers for any two users: restrict it to the caller's own pairs.
- TestSprite happy-path tests need a staging user token (auto-auth is Pro): listed under Other open
  items.

## Other open items

- `job-photos` and `avatars` buckets are public with permanent unauthenticated URLs on staging, by
  decision (D-20261108-12). Do not fix through the dashboard's "Remove policy" button; batch with
  the media item below.
- Media: `useCaching: true`, a one-year `cacheControl`, a downscale to 1600 px, poster frames. Needs
  `expo-image-manipulator` and `expo-video-thumbnails` (not installed; flag before adding).
- The job draft stores the private service address in plain device storage: the offline cache
  should be an allowlist.
- Nominatim is called directly from phones: add a server-side proxy with caching before real volume.
- A reviewee whose review was blind is not told when it is revealed (no event to hang a
  notification on: the reveal is computed at read time). Needs a new notification type or a sweep.
- Tax as a first-class price component, compatible with all-in display (the mechanism exists at rate
  0; who collects on which category is the owner's call).
- Post-launch engineering, none gating the first paid job: a durable job queue, a Stripe
  reconciliation runbook, allowlist error logging, a backup restore drill, an operator audit log.
- Stripe: confirm Connect terms explicitly shelter the held-in-protection mechanic (legal).
- `.easignore`: mirror `.gitignore` fully first (EAS ignores `.gitignore` when `.easignore`
  exists); saves about 25 s of upload per build.
- Staging rows titled `E2E <timestamp>` pile up from the Maestro money walk; purge by title prefix
  once they get in the way.
- TestSprite happy-path tests need a staging test-user token (auto-auth is Pro): add when the plan allows.
- A notification tapped from Messages, Discover or Profile still opens its job in My Jobs: the E5 fix
  (`c88cecf`) opens it in place only from the Home tab, whose stacks register the job screens.
- Tell the workers who bid when a job closes: a design answer, not made in the 2026-11-11 run.
- Send transfers with source_transaction (the charge id, PaymentIntent.latest_charge, stored at
  funding) so Stripe caps each transfer at its charge; verify in Stripe test mode.
- A database rule "no account without a sign-in phone" (B12, part 2): it needs a new migration that
  replaces `handle_new_user`, and changes in `supabase/seed.sql`, `supabase/tests/_helpers.sql` and
  the tests that create email-only users.
- Hide email sign-in on production builds (B12, the part still open).
- A rule for a job that stays assigned or in progress while its money is held (ledger N2): nothing
  ends it and no money moves by itself; `payment_attention` lists it 7 days after its date window,
  or after the hire when it has no date. What should happen, and after how long, is a product
  decision.
- `begin_job_payment`, `begin_tip_payment` and `release_job_payment` return the payer's own full
  payment row, with the 20 internal columns the app's 26-column read hides (ledger N7).
- The `PGRST202` fallbacks in `lib/profiles.ts` are dead code against the current schema (ledger N8).
- Remove the DELETE listener in `hooks/useJobOwnerActions.ts` (an offer row is never removed while its
  job exists; ledger N1).
- Before Supabase removes the legacy keys on staging: set_drain_secrets(staging base, the new secret
  key) and confirm drain_probe_status is all 200. Ship an app build whose public key is the
  sb_publishable_ key.
- Then delete the SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY fallback in _shared/serviceAuth.ts,
  along with its unit tests.
- Maestro's iOS driver bug (mobile-dev-inc/maestro#3538) can still end other flows: the fix in
  `ff0784b` (a pause after each step that closes the keyboard) covers flow 03 only.

## Parked operator decisions

Not authorised for any run until the owner says so.

- Staging migration apply: `20261108000000_lean_v1.sql` drops tables and functions, so the pipeline
  stops for it. Owner's click, backup first. Rows in dropped tables do not come back; the undo is a
  corrective migration.
- Twilio Verify values in the Supabase dashboard (Authentication, Providers, Phone), then
  `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase` (`docs/ARCHITECTURE.md`, Phone sign-in).
- Production: the owner's steps for the Production button (`docs/production/owner-steps.md`); a
  real-money switch needs its own dated decision (D-20261111-3).
- Resend (`RESEND_API_KEY`, `RECEIPT_FROM`) on staging, and a domain with a support inbox, before real
  customers.
- Stripe housekeeping: rename the test account "Brazos sandbox" before launch; roll the publishable
  test key that once appeared in terminal output.
- Supabase Pro at the launch gate; diagnose the roughly 2 GB of cached egress the retired production
  project burned with no users (an old build or crawlers on public bucket URLs).
- A read-only staging Postgres role for runs: the connection string would live outside the
  repository; needs a dated `docs/DECISIONS.md` row before any run uses it.
