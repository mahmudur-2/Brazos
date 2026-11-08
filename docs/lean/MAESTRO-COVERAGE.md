# MAESTRO-COVERAGE (Phase C3, Fable). Every tap the lean v1 app allows, grouped into flows.

Phase F turns each group into one `.maestro/<group>.yml` flow, run on a GitHub macOS runner against
the `e2e-test` simulator build (staging backend, Stripe test mode). Two seeded accounts: CUSTOMER
and WORKER (secrets MAESTRO_E2E_*). "assert" = assertVisible on the text or testID named.
Marked M = manual (cannot run in a simulator); P = pgTAP already proves the rule.

## Accounts and data the flows need (owner steps are in the report's "For you")
- Staging Supabase: Authentication → Providers → Phone: Twilio Verify on; add one TEST phone
  number with a fixed code (Supabase "Test phone numbers") so the phone flow completes without SMS.
- Two email accounts (seeded by Phase F's setup flow on first run; passwords in GitHub secrets).
- Stripe test card 4242 4242 4242 4242, any future date, any CVC.

## F1 auth (signed out)
Welcome: Create account, Sign in, Terms link, Privacy link. Phone sign-in: country picker open +
pick, number entry, Continue → VerifyPhone: 6 cells, Resend (disabled until cooldown), wrong code
error, right code → in. Phone create account: same + name. Email sign-in: email, password, Forgot
password → ResetPassword request, back. Email create account: fields, validation errors, Create.
LegalGate: both toggles, Continue disabled until both, Continue. Setup: Customer / Worker choice
card, Continue. Sign out from Profile returns to Welcome.

## F2 customer home and post a job
Home: avatar → Profile, bell → Notifications, search bar → WorkerSearch, service tiles (each) →
PostJob with that category, All services → ServicePickerSheet → pick, HowBrazosWorks dismiss,
needs-attention row tap, live bar tap, draft card tap, scroll. PostJob wizard: category tiles,
title + description, both dictation mics (tap → permission prompt → cancel; simulator has no
speech), photo add (simulator photo library) + remove, video add, guided question chips, price
mode (open bids / set price) + presets + custom amount, Need it today toggle, Repeat job cadence,
address / approximate area, Back keeps the draft (MyJobsHub shows Draft), Publish → seal animation
→ JobLivePage (live state, Done). Create sheet (centre tab): post again from a past job, new post.

## F3 customer: offers, pay, approve, review (needs WORKER to have bid: F6 runs first)
MyJobsHub: Active / Review / Closed tabs, card → ClientJobDetail. ClientJobDetail: offers list,
Compare bids → CompareBids (sort, pick) → BidDetail: Accept → Checkout, Counter → Counteroffer
(amount prompt, send), Decline. Checkout: amount shown as charge (no fee line), Save card toggle,
Pay → Stripe test sheet (4242) → JobConfirmed (held state copy, Done). Edit job / Delete job
(confirm dialog; delete only before accept). Chat from job. After worker completes (F7):
ApproveOrDispute: photo viewer, Approve → ReviewAndTip (stars, text, tip presets → Stripe sheet,
Skip tip) → MoneyMoment; Dispute path: reason, submit, shows "held" state, Withdraw dispute.
Payment methods (Profile): list saved card, remove, add (Stripe setup sheet).

## F4 messages (both accounts)
Inbox: filter pills, row → Chat, long-press → sheet (report, block; no archive/mute). Chat: send
text, send photo (library), tap photo → viewer (zoom, share), offer card in chat (accept / counter
/ decline from chat), header → counterpart profile, overflow → report, block (confirm), unsend own
message, keyboard rise, scroll to older. Unread badge on tab clears after read.

## F5 notifications and settings
Notifications: feed grouped by day, tap routes to the right screen, mark read. NotificationSettings:
each toggle, quiet hours on + time pick, nearby alerts (default on), save. Profile: mode switch
row (Customer ↔ Worker, wipe animation), Light / Dark / System switch (assert palette change on
one element), Profile details (name, bio, photo, categories accordion), Account & safety,
Support (mailto opens), Admin reports (admin account only: list, dismiss, ban), Delete account
(blockers list when a job is live; full path on a clean account: confirm → signed out).

## F6 worker home, discovery, bid
WorkerHome: hero, categories tiles, search bar → results, Map tab. Map: pins cluster, filter
sheet (radius chips, sort, category), peek sheet drag, pin → CellJobs list → JobDetail.
WorkerResults: list, distance chips, card → JobDetail. JobDetail (market): approximate area only
(never an exact address before hire, P too), match reasons, poster trust counts, Submit bid →
SubmitBid (OfferComposer: amount, message, availability chips, send) → BidSent (Done). Counter
on a customer counter. Withdraw bid. Report job.

## F7 worker: do the job, get paid
WorkerJob (after accept): exact address now visible, Start / En route, Running late chips (10/20/
30), Complete → requires a photo (assert blocked without one) → completed. Earnings: wallet
totals from ledger, per-job rows, payout CTA states. Payouts: Stripe Connect onboarding (M: opens
Stripe-hosted web; assert the button and the return state only). ServicesPricing: add, edit,
remove a priced service. WorkerProfile (as the customer sees it): reviews list, report.

## F8 cross-cutting asserts in every flow
No screen shows "paid" before release (P + assert on ClientJobDetail, WorkerJob, Earnings);
money always two decimals; offline banner when network off (simulator: toggle via `xcrun simctl
status_bar` is not possible; M); large text (Dynamic Type) on Home and Checkout (M, once, in
BrowserStack App Live); dark mode run of F2 and F3 once (set System → Dark in F5 first).

## Not automatable here (and what covers them instead)
Push taps and hire-from-push (P: 200_hire_from_push.sql; M once on a TestFlight device);
receipts email (P: 190_receipts.sql); Stripe webhook (tests/stripeWebhookSignature + P);
settlements and refunds cron (P: 030, 050, 070, 220); real SMS (one M sign-in on the device);
Apple review walk (docs/TESTING.md: the two-account rule).
