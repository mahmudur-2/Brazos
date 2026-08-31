# BACKLOG — the only place unscheduled work lives

Append; never dispatch from chat memory. A dispatch that needs an item reads it from here.

## v1 bugs
- $92.50 worker take shown as $100 on job cards (wrong cents column)
- "APPROVED · PAYOUT ON ITS WAY" missing from ApproveOrDispute report-form copy
- Stripe sandbox account named "Brazos sandbox" — rename before launch
- Stripe publishable test key appeared in terminal output — roll at convenience

## v1.2 (after ten real users)
- Instant payouts · Live Activities · Instant Book · automatic recurrence
- Per-screen UI Studio generalised from dev-tools/HomeDesignStudio
- Android as a shipping target — decide with real data after ten users.

## Side backlog (moved from Claude memory 2026-08-30)
1. `job-photos` and `avatars` buckets are public with permanent unauthenticated URLs — batch with MEDIA1; do not fix via the dashboard "Remove policy" button
2. MEDIA1: `useCaching: true`, one-year `cacheControl`, ≤1600px downscale, poster frames; needs `expo-image-manipulator` and `expo-video-thumbnails` (not installed)
3. Supabase Pro deferred to the launch gate
4. Production burned ~2 GB cached egress with no users — diagnose before launch (frozen web surface, old TestFlight build, or crawlers on public bucket URLs)
5. CI cannot run the 120-test guard suite on ubuntu-latest (G-002) — a green badge is not evidence the guards ran
6. Nominatim is called directly from phones — server-side proxy with caching before real user volume
7. Buy a domain — App Store privacy-policy URL and Stripe business-website field
8. Offline cache should be an allowlist — the job draft holds the private service address in plain device storage
9. Legal: confirm Stripe Connect terms explicitly shelter the held-in-protection mechanic
10. Post-launch engineering, none gating the first paid job: durable job queue, Stripe reconciliation runbook line, allowlist error logging, backup restore drill, operator audit log
11. 72h auto-release cannot prove the customer was notified — Expo push ticket ≠ delivery; receipts carry error codes that must be handled
12. UNVERIFIED (from a ChatGPT review): `send-push` receipt handling, `translate` rate limiting, inline embedding refresh in `worker-search` — verify before acting
13. `payouts_enabled` ≠ identity verification — no copy may claim "ID-verified workers" from that flag
14. Tax as a first-class price component, compatible with all-in display

## Verify landed — R7 truth sweep checks each, ticks or reopens
- Agreement snapshot row written at offer acceptance (both parties, scope text, price and every component incl. a zero tax line, policy version) — was it in R4's migration?
- Transfer reversal clears `released_at` (status and timestamp agree) — fixed in R4/R5?
- Transfer reversal does NOT re-open `release_requested_at` (double-pay path) — fixed in R4/R5?
- R4 reconciled with the `payments` table that already existed in staging rather than creating fresh?
- The three app.json fixes rode R1's app.config.ts rewrite: no `UIBackgroundModes: ["location"]`, no `NSLocationAlwaysAndWhenInUseUsageDescription`, `supportsTablet: false`, runtimeVersion policy = `appVersion`?
- Authorization proofs cover every client-writable table plus location, messages and money, as anon / owner / assigned worker / losing bidder / unrelated user (R3b) — any table missing?

## Parked tangents
- Naming / branding · voice modes · hardware monetisation · Codex switch · Idiolect
