# Maestro flows (lean v1, iPhone simulator, staging backend, Stripe test mode)
Run: `maestro test .maestro/` (config.yaml runs 01 → 10 in order and stops at the first failure). CI: `.github/workflows/e2e-ios.yml` on the `e2e-test` build.
Accounts: A = CUSTOMER (`MAESTRO_E2E_PHONE` / `MAESTRO_E2E_OTP`), B = WORKER (`MAESTRO_E2E_PHONE_2` / `MAESTRO_E2E_OTP_2`): Supabase test phone numbers, 11 digits with the leading 1. The first run creates both (Setup + LegalGate); later runs sign in. Titles carry `E2E ${MAESTRO_RUN_ID}` (default `E2E lean`); flows pick the newest card.
Every flow: clean launch → sign in (subflows/sign-in-phone.yml) → its screens → signed out. One two-party job ("main") runs 02 → 06; a small "side" job carries the open-bids, counter, withdraw and decline paths.
- 01-auth: Welcome, email/phone forms name each missing field, country picker, wrong code refused, both accounts in, sign out.
- 02-customer-post-job: Home (bell, avatar, tiles, All services), wizard (category, questions, photo add/remove, area + GPS + address, Today, set price $50, Need it today, Repeat Off), draft save + resume, open bids, Edit job.
- 03-worker-discover-bid: Map tab, search, Filters sheet, JobDetail with no exact address, $50 bid at the set price, written $40 bid (pitch rule), withdraw + rebid, report dialog.
- 04-customer-accept-pay: saved cards cleared, Bid Detail counter $45, accept $50, Checkout (save card), Stripe sheet 4242, Job Confirmed held copy, saved card listed + removed.
- 05-worker-start-complete: worker counter $42, Your Job (exact address), on my way, 10 min late, start, photo rule, Mark complete.
- 06-customer-approve-review: Review tab, Finished Work photo, report + withdraw, approve and release, 5 stars + comment, tip skipped, decline $42, Reuse a past job, Delete job.
- 07-messages: Inbox pills, send text + photo, viewer, unsend, Block / Report (cancelled), reviews list, Worker Profile report; B reads the unread row.
- 08-notifications-settings: feed → job, mark read, every switch + quiet hours, Dark / Light / Auto, Legal docs, Profile Details, Account & Safety, mode round trip.
- 09-worker-profile-payout: Earnings buckets + the main job row, Payouts status, add + remove a priced service.
- 10-account-delete: Delete Account explainers, blockers or the DELETE gate, final confirm always cancelled.
No "Paid" before release is asserted on Job Confirmed, ClientJobDetail, WorkerJob and Earnings.
Not covered, and why:
- M/P (docs/lean/MAESTRO-COVERAGE.md): push, receipts, webhook, crons, real SMS, Dynamic Type, offline banner, Stripe Connect onboarding (Stripe web), dark run of F2/F3.
- Real email or real money: email Create account, Forgot password send, tip payment, the Stripe setup sheet (Add a card), real account deletion.
- Not in the app: Welcome Terms/Privacy links, an unread tab badge, a services edit screen, archive/mute; formatBudget shows whole dollars ("$50") by design.
- Needs more data than two accounts: CompareBids (two workers), offer card in chat (direct hire), admin reports (admin account), revealed reviews (both sides or 7 days), Home's needs-attention row and live bar, match reasons and trust counts.
- Not driveable on a simulator: dictation mics (no speech), video add, map pins/peek drag, Support mailto, quiet-hours time pick, photo zoom.
- Left out to keep accounts reusable: Home search (starts a draft), Repeat cadence (spawns jobs), Taking new work, Block confirm, Setup/LegalGate (first sign-in only).
