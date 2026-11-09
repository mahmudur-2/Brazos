# Ship readiness: what stands between build 10 and a public launch

Your time: ~5 min to read. Nothing to click. Written 2026-11-08 against `mainexpo` f5ed1e7.
VERIFIED = read in the repo or a run today. INFERRED = expert judgment, not checked against a source.

## The better question

"Is it ship ready?" is the wrong question, because the tests answer it: the app works. The question a
CEO asks before putting their name on it is:

**"When a stranger trusts Brazos with their money, their home address and their afternoon, and
something goes wrong, who finds out, who fixes it, and who pays?"**

Everything below is that question, answered part by part. The code is not the gap. The gap is
everything around the code that only exists once real people and real money are in it.

## Why a careful CEO would not release this today (and what each fear really is)

1. **Nobody is watching.** Crash reporting exists in code (`lib/observability/sentry.ts`) but only
   turns on when a DSN is set; no DSN is set in any build profile (VERIFIED). No support inbox, no
   email provider (Resend is a parked decision, VERIFIED). So on day one a crash or a stuck payment
   is found by a one-star review, not by us. Fear: blind launch.
2. **Production has never run.** Every test, every deploy, every migration happened on staging.
   The production project has had zero traffic from this code (VERIFIED: never contacted by design).
   The first production deploy is itself an untested event. Fear: the first real user is the test.
3. **No backup.** Staging has none (Pro plan declined, VERIFIED). A production launch without
   point-in-time recovery means a bad migration or a bug that deletes rows is permanent. Fear: one
   mistake, no undo.
4. **The money path is tested, the money failures are not.** Escrow, release, payouts (Stripe
   Connect), settlements and the webhook are built and have pgTAP tests (VERIFIED: 10 SQL test files,
   idempotent webhook by event id). What has never happened: a chargeback, a refund after release, a
   worker whose Connect account is rejected, a payout that bounces, a customer who disputes with their
   bank. Each of those is a manual process today with no written runbook (VERIFIED: "Stripe
   reconciliation runbook" is in the backlog). Fear: the first dispute costs more than the first 100
   jobs earn.
5. **Legal is a draft.** The privacy policy is marked "WORKING DRAFT" in the source (VERIFIED). The
   terms have not been read by a lawyer. The "held in protection" mechanic has not been checked
   against Stripe Connect's terms (VERIFIED: open backlog item). Workers are strangers entering
   homes with no ID check or background check; the app's safety layer is blocks, reports, bans and a
   word filter (VERIFIED). Fear: liability when something happens in someone's house, and a
   contractor-classification complaint. (INFERRED: this is the risk that actually kills gig
   marketplaces; TaskRabbit and Thumbtack carry insurance and ID checks for this reason.)
6. **Stripe is still in test mode.** Every build uses test keys (VERIFIED: `EXPO_PUBLIC_PAYMENTS_MODE`
   stripe + test account). Going live means Stripe reviews the business, Connect payouts to real
   bank accounts, and Radar fraud rules on a brand-new account with no history. Fear: a fraud ring
   finds a new marketplace before real customers do (INFERRED: common with new Connect platforms).
7. **No one outside has said it is good.** Every verdict so far (security review, tests, this
   report) was written by Claude and read by you. Apple has not reviewed it, Stripe has not activated
   it, no stranger has paid real money, no lawyer has read a line. Fear: we are grading our own exam.

## What "100% professional grade" actually means here (the parts you are not seeing)

Three layers, in order of what breaks first:

| layer | what it is | state today |
|---|---|---|
| **Works** | the flows do what they say | green: 01-05 proven on device, 06-10 unit-tested, 1243 tests, 9/9 server checks |
| **Survives** | when it fails, we know within minutes, we can undo, and nobody loses money | red: no monitoring on, no backup, no production, no runbooks, no support channel |
| **Trusted** | an outsider has verified it: Apple, Stripe, a lawyer, real users, insurance | red: none yet |

A professional app is strong in all three. Brazos is strong in the first and has not started the
other two. That is normal for this stage. It is also exactly why a CEO would say "not yet".

## The raw material a real operator would start from (not our digests)

- **Stripe's live dashboard**, once a test job is run with real cards: the Disputes, Radar and Payouts
  tabs are where the truth about a marketplace lives. Not our tests.
- **Apple's review guidelines**, sections on payments, user-generated content and account deletion,
  read against this app (INFERRED section numbers, read the current page): account deletion exists
  (flow 10), content reporting exists; a "physical services" marketplace must take payment outside
  in-app purchase, which Brazos does with Stripe.
- **Supabase's own Security and Performance Advisors** on staging (step 6 of the ship report, 2
  minutes, never exported yet).
- **The competitors' Terms and Help pages** (TaskRabbit, Thumbtack, Angi): how they word the protection
  pledge, cancellation fees, no-shows, and who is insured. Copy the structure, not the text.
- **New York's rules for app-based workers and independent contractors** (INFERRED: the test phones
  are NYC numbers and the market runs on New York time; the market's state decides the law).
- **Real humans**: five friends, each paid a real $20 job through a live Stripe account with a small
  cap. Their confusion is the bug list that matters.

## The methods and tools a field expert would use

1. **A launch ladder, not a launch.** TestFlight friends (now) → 10 strangers with live Stripe and
   a $50 cap per job → 100 users in one neighbourhood → public. Each rung has a kill switch
   (`PAYMENTS_MODE=disabled` already exists, VERIFIED) and a number that must hold before the next
   rung (crash-free rate, disputes, support tickets).
2. **Turn the lights on before anyone enters.** Sentry DSN in the preview and production profiles;
   an external uptime check on the edge functions; Supabase Pro with point-in-time recovery; a
   support inbox that forwards to your phone. All exist as products; none needs new code.
3. **A day-one runbook**, one page: stuck payment, refund after release, worker not paid, user says
   "delete everything", a bad review that is harassment. Each with the exact Stripe or Supabase
   screen. Written before launch, tested once on staging with a fake incident.
4. **A restore drill.** Break staging on purpose, restore from backup, time it. A backup that was
   never restored is a hope, not a backup.
5. **Fraud posture on Stripe**: Radar rules for new accounts, a payout delay for a worker's first
   jobs, manual review above a threshold. Standard Connect practice (INFERRED).
6. **Legal pass**: terms, privacy policy and the protection mechanic read by a lawyer who knows
   marketplaces; one quote for general liability insurance to learn the number even if you decline.
7. **Trust layer, minimum viable**: phone verified (done), photo ID selfie for workers before the
   first payout (Stripe Identity does this in a day, INFERRED cost about $1.50 per check), and a
   visible "verified" badge. Background checks can wait for volume.

## What, other than you or Claude, proves it is right

- **Apple approves the build** for TestFlight external testing, then for the App Store.
- **Stripe activates live mode** and lands a real payout in a real worker's bank account.
- **A chargeback happens and is resolved** following the runbook, with escrow covering it.
- **Supabase Advisors show zero red** on staging, then on production.
- **Sentry shows a crash-free rate above 99.5% over two weeks** of real TestFlight use.
- **An uptime monitor shows the edge functions answering** for 30 days.
- **A lawyer signs off** on the terms and the protection mechanic, in writing.
- **Five real users complete five real paid jobs** and leave reviews you did not write.

Until at least the first four exist, "ship ready" is our opinion. After them it is a fact.

## Where that leaves us tonight

- The code is ahead of the business. That is the right order; it is also why it cannot ship yet.
- Nothing in this list is a rewrite. It is settings, services, a plan page, outsiders and money
  decisions (Supabase Pro, Sentry, insurance, legal) that are yours, not a chat's.
- The cheapest next move that teaches the most: finish the robot tests when the free minutes
  reset, meanwhile put build 10 on five friends' phones and read what confuses them.
