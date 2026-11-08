# BACKLOG: the only place unscheduled work lives

A run never builds from chat memory: an item is read from here. A feature outside v1 goes here
first. Ranked lists are in the owner's order.

## v1 bugs

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

## Other open items

- `job-photos` and `avatars` buckets are public with permanent unauthenticated URLs on staging.
  Do not fix through the dashboard's "Remove policy" button; batch with the media item below.
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

## Parked operator decisions

Not authorised for any run until the owner says so.

- Staging migration apply: `20261108000000_lean_v1.sql` drops tables and functions, so the pipeline
  stops for it. Owner's click, backup first. Rows in dropped tables do not come back; the undo is a
  corrective migration.
- Twilio Verify values in the Supabase dashboard (Authentication, Providers, Phone), then
  `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase` (`docs/ARCHITECTURE.md`, Phone sign-in).
- Production migration: manual, by the owner, one file at a time, in filename order; never by a
  chat or a workflow.
- Resend (`RESEND_API_KEY`, `RECEIPT_FROM`) on staging, and a domain with a support inbox, before real
  customers.
- Stripe housekeeping: rename the test account "Brazos sandbox" before launch; roll the publishable
  test key that once appeared in terminal output.
- Supabase Pro at the launch gate; diagnose the roughly 2 GB of cached egress production burned
  with no users (an old build or crawlers on public bucket URLs).
- A read-only staging Postgres role for runs: the connection string would live outside the
  repository; needs a dated `docs/DECISIONS.md` row before any run uses it.
