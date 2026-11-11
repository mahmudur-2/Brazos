# BRAZOS: architecture

What the code does today; where this file and the code disagree, the code wins: fix this file.
Rules are in `CLAUDE.md`, rulings in `docs/DECISIONS.md`, later work in `docs/BACKLOG.md`.

## Toolchain

Expo SDK and React Native versions come from `package.json`. TypeScript. The Supabase client is
typed: `lib/supabase.ts` is `createClient<Database>` over `types/database.ts` (made by
`npm run db:types`, local stack only). Entry point `index.ts` then `App.tsx`. Tests: `docs/TESTING.md`.

## Auth and session

`lib/AuthContext.tsx` owns the session: `user`, `session`, `loading`, `signUp`, `login`, sign-out,
and a `bannedNotice` flag set when the last sign-out was a suspension. Sign-out also unregisters
the push token. Screens read auth through `hooks/useAuth.ts`. Sign-up creates the profile row
through the `on_auth_user_created` trigger on `auth.users` (`handle_new_user()`, which prefers the
verified phone on the auth row over client-supplied metadata).

Two gates sit above the tabs: signed out goes to the auth flow; signed in with the current Terms
and Privacy not accepted goes to `LegalGateScreen`. A gate failure admits only on-device proof
that the server confirmed this account accepted the current documents; otherwise it fails closed.
Sign-out always works locally.

### Phone sign-in

Phone one-time codes go through `lib/phoneAuth/`. Screens call `phoneAuth`, never
`supabase.auth`, so one UI runs on any provider. `EXPO_PUBLIC_PHONE_AUTH_MODE` selects it:
`supabase` (real SMS: `signInWithOtp` / `verifyOtp`, Twilio Verify behind GoTrue), `mock`
(development only: a random six-digit code shown on the verify screen) or `disabled` (the buttons
fall back to email). Unset means `mock` in development and `disabled` in a release. `mock` is
impossible when `__DEV__` is false: it resolves to `disabled` and reports the misconfiguration.
`eas.json` pins `EXPO_PUBLIC_PHONE_AUTH_MODE` and `EXPO_PUBLIC_PAYMENTS_MODE` in every build
profile (`development`: `mock` and `disabled`; `preview`, `production`, `testflight`, `e2e-test`:
`supabase` and `stripe`).

Turning SMS on, in this order:
1. Twilio: a funded account (a trial account messages only verified numbers) and a Verify Service;
   copy the Account SID, Auth Token and Verify Service SID.
2. Supabase dashboard only: Authentication, Providers, Phone, Twilio Verify. Enter the three
   values there, enable the provider, keep the code length at six (`OTP_LENGTH` in
   `lib/phoneAuth/types.ts`; change both together). They never go into `.env`, `app.config.ts`,
   EAS secrets read by the client, or the repository.
3. Set `EXPO_PUBLIC_PHONE_AUTH_MODE=supabase`; restart Metro or rebuild (inlined at bundle time).
4. Check: a new sign-up makes a session and a profile with the E.164 number; a returning sign-in
   makes no second account; an unknown number on sign-in creates no account
   (`shouldCreateUser: false`) and the message does not say whether the number is registered; the
   release build shows no `DEVELOPMENT CODE` banner.
5. Before public launch: CAPTCHA, the SMS rate limit and a Twilio geo allowlist (an open OTP
   endpoint is an SMS-pumping target billed to the account).

Numbers are normalised to E.164 by `lib/phoneNumber.ts`. Accounts are never merged by a matching
phone field: `updateUser({ phone })` is called nowhere, and a number already on another account
surfaces as `identity-conflict` and points to email sign-in.

## Mode architecture

One account is a customer on the jobs it posted and a worker on the jobs it took. No role exists
in the data layer; mode is a UI concept. `modes/ModeProvider.tsx` is the single authority.
`switchMode()` is the only function that changes mode and it always confirms first. Mode resolves
from a cached value (`modes/modeStorage.ts`), a server value (`profiles.active_mode`) and a
just-made Setup landing choice. `navigation/ModeShell.tsx` shows a neutral loader until
resolution finishes.

## Navigation: two trees, four shared stacks

`ModeShell` mounts exactly one root, `CustomerRoot` or `WorkerRoot`. A worker screen cannot render
in customer mode because it is not mounted, and `switchMode()` gets its stack reset for free. The
worker bar has five tabs (Home, Map, MyJobs, Messages, Profile). The customer bar shows Home,
Discover, [ + ], Messages, Profile; Map and MyJobs stay registered as hidden routes because React
Navigation resolves an untargeted NAVIGATE against the tab navigator only, and notification
routing targets MyJobs in both modes.

Customer Home roots at `HomeMain`, worker Home at `WorkerHome`; the worker's Home stack carries the
offer flow (`WorkerResults`, `JobDetail`, `SubmitBid`, `BidSent`). The other four stacks (MyJobs,
Messages, Map, Profile) are declared once in `navigation/sharedStacks.tsx` and mounted by both
trees. MyJobs carries the hire loop (`CompareBids`, `BidDetail`, `Counteroffer`, `Checkout`,
`JobConfirmed`) and the work loop (`WorkerJob`, `ApproveOrDispute`, `ReviewAndTip`). Profile
carries account surfaces including `DeleteAccount`.

Every param list lives in `lib/navigation.ts`; the trees are typed separately, so cross-tree
navigation is a compile error. Headers are off; screens render `components/ScreenHeader`.
`JobDetail` delegates customer mode to `components/MarketJobPreview.tsx`, so no path shows a
customer a worker's pay line or an offer button.

## Theme and tokens

`ui/tokens.ts` is the only token file. It exports two palettes with identical keys, checked by
`satisfies Record<ColorToken, string>`: `light` and `dark`. Both themes ship and both are tested.
`lib/theme.ts` wraps the tokens for screens (screens never import `ui/tokens.ts` directly) and
re-exports `withAlpha`, `layout`, `controls` and the radius scale. `lib/authTheme.ts` is the one
exception for the auth screens.

`lib/ThemeContext.tsx` (mounted once in `App.tsx`, above auth and mode) feeds
`hooks/useThemeColors.ts`. It resolves: stored preference (AsyncStorage, read before the themed
tree mounts so there is no light flash), then system appearance (live on change), then light. A
pinned preference is pushed native with `Appearance.setColorScheme`. `app.config.ts` sets
`userInterfaceStyle: "automatic"`. The Appearance row on `screens/ProfileScreen.tsx` is the
setting (system, light or dark). The platform system font is the only face; no font file is
bundled. Translucent colours come from `withAlpha(token, alpha)` (`ui/colorAlpha.ts`), never
restated; `tests/themeTokens.test.mjs` keeps screens free of raw hex and rgba literals.

## Worker discovery

Discovery is a list plus a map, with deterministic matching and no AI. The Map tab draws clustered
pins: `lib/mapClustering.ts` (pure fixed-grid aggregation, no library) merges `job_hotspots()`
cells into count-badged pins by the visible region's `latitudeDelta`. Tapping a pin opens a sheet
of `WorkerJobCard`s (`fetchOpenJobsInCells`); a card opens `JobDetail` inside the Map stack.

Distance is server truth or absent: cards carry `jobs_within_radius()`'s half-mile-snapped
`distance_miles` where the surface has it and show nothing otherwise; the client never guesses
coordinates `job_locations` keeps unreadable. The distance filter is one chip row
(`components/DistanceChips.tsx`, rules in `lib/discoveryFilter.ts`, `NEARBY_RADIUS_MILES = 5`),
persisted per account in AsyncStorage. The server radius cap is 3000 miles.

The market job detail leads with the scope of work, shows the approximate area only, and renders
`lib/matchReasons.ts`: three deterministic checkmarks (category is in the profile categories; known
distance within the persisted radius; the feed's budget ceiling covers the viewer's cheapest flat
price). Unknown or unmet facts render nothing. Percentages and scores are banned and test-guarded.
The worker hero card (`lib/workerHeroCard.ts`) composes `lib/compareBids.ts` (`knownRating`,
`totalCompletedJobs` over `worker_job_stats`, the "New worker" verdict) into positive-only trust
rows. A tombstoned profile carries no offer or hire affordance.

## Jobs and lifecycle

`jobs` carries `id, client_id, title, description, category, location, budget_cents, status,
created_at, assigned_worker_id, final_amount_cents, completion_photo_url, completion_photos,
photos, videos` and more; the three media columns are jsonb arrays. `budget_cents` is integer
cents. `jobs` and `bids` have two foreign keys, so a PostgREST embed must disambiguate
(`bids!bids_job_id_fkey(count)`).

Database status is `open`, `assigned`, `in_progress`, `completed` (and `cancelled`, terminal).
Writes go through `create_job()`, `update_job_details()` (only while `open` with zero offers) and
`transition_job_status()`. **`transition_job_status()` is the only status mover and
`accept_offer()` is the only assignment path.** The client never sets `status` or
`assigned_worker_id`. `transition_job_status()` holds the funding gate: no work starts before the
ledger says `held`. At least one completion photo is required to mark a job complete
(`job_completions`).

`pricing_mode` (`open_bids` or `posted_price`, default `open_bids`) records the customer's posting
choice. A posted-price job carries one `budget_cents`; a worker's request at that price is an
ordinary offer, and `accept_offer()` never reads the mode.

Everything richer than those values is derived in one place, `lib/jobLifecycle.ts`, from four
facts: job status, payment state, the arrival timestamps, and whether a dispute is open (a failed
dispute read is `'unknown'`, never "no dispute"). It yields `draft, open, pending_payment,
confirmed, en_route, arrived, in_progress, awaiting_approval, disputed, completed, cancelled,
unknown`. Every other status vocabulary is presentation over that derivation: `lib/jobStage.ts`
(card badge), `components/StatusBadge.tsx`, `components/JobProgress.tsx`, `ui/primitives/StatusPill.tsx`.
Screens branch on raw `job.status` only for control flow. A raw status-to-step map outside
`lib/jobLifecycle.ts` fails `tests/lifecycle.test.mjs`. Customer Home lists the posted jobs that
need the customer's move through `lib/homeAttention.ts`, the only place that rule lives.

Cancellation: `cancel_job()` is the only exit. A cancelled job is terminal. It is free outside the
window and within 15 minutes of acceptance inside it; otherwise a fee applies (2000 bps, floor
$15, cap $35, never above the price). A worker cancellation refunds in full; an unfunded payment is
voided; a completed job is refused. Pending offers are declined by `jobs_settle_offers_on_cancel`.
The other party is notified once, with no amount in the copy.

Also in v1: needed today (`needed_today`), running late (`late_minutes`, 10/20/30 minute chips),
day-before reminders, and repeat jobs (`job_series`: weekly, biweekly or monthly; a 24-hour first
refusal to the same worker, sent 3 days ahead, 9 am to 9 pm New York only; every visit is its own
job through `accept_offer()` and `transition_job_status()`).

## Offers: one negotiation model

`lib/offers.ts` is the single negotiation module. A negotiation is a chain of `job_offers` rows:
the first is the root, every counter is a child pointing at the offer it answers. `offer_type`
(`marketplace_bid` or `direct_offer`) is fixed for the chain. A counter is identified by having a
parent, never by a type value. Rows carry `customer_id` and `worker_id`, an `author_id` (who wrote
this revision) and `awaiting_id` (whose move is next; null once settled). `offer_status` is
`pending, accepted, declined, withdrawn, expired, superseded`.

**`job_offers` is RPC-write-only.** `authenticated` holds SELECT and nothing else. Writes:
`create_offer`, `counter_offer`, `decline_offer`, `withdraw_offer`, `accept_offer`. Reads:
`job_offer_count`, `job_offer_counts`, `my_pending_offers`. The counter cap is ten per side per
chain, enforced under the job row lock and mirrored in the client so a spent action is disabled
rather than rejected. `create_offer()` caps `p_message` at 500 characters; `lib/offerMessage.ts`
mirrors the cap and appends at most one availability line ("Can start today, about 1-2h"); when it
would not fit, the chips disable with a written reason.

Bidding is sealed: a worker sees that other offers exist and their count, never a competitor's
amount, before or after bidding. Customers see all offers. No worker-facing surface, RPC, view or
push copy may reveal another worker's amount.

A legacy `bids` table remains only because the new-bid push (`notify_on_bid`) is a trigger on it
(`docs/BACKLOG.md` item 16). `accept_bid()` and `respond_job_request()` are gone; never recreate
or imitate them.

## Money

Integer cents everywhere, shown only through `formatBudget()`. Writes go through the adapter
`lib/adapters/payments.ts` into SECURITY DEFINER RPCs, never from a screen. `payments` grants
SELECT to its two parties and nothing more. Job budgets, offer amounts and payment amounts carry a
10,000,000-cent ceiling enforced by CHECK constraints; tips keep a separate cap (`tip_max_bps`
5000, `tip_max_cents` 100000 in `fee_schedule`).

**Mode.** `EXPO_PUBLIC_PAYMENTS_MODE` is `stripe` or `disabled` (`config/env.ts`). The card path
runs only when the build declares `stripe` and carries the publishable key; anything else is
`disabled`, and every payment call refuses with one message. There is no practice-money path and
no code behind the resolver that could reach any other provider. TestFlight builds use Stripe
test-mode keys.

**Fees.** `fee_schedule` rows hold the rates: 750 bps customer, 750 bps worker with a $1.00
worker-side minimum, tips carry the customer side only and the worker keeps 100% of every tip, tax
0. A rate change is a new row with a future `effective_from`, never an UPDATE. `quote_job_price()`
is the only fee arithmetic (the client has no fee constant), and `charge_amount_cents` is the price
on every customer surface; the total never rises between the offer card and checkout.
`job_agreements` snapshots the terms at accept and is immutable.

**Ledger.** The ledger is the state machine; provider events move it through one idempotent
function, `apply_payment_event()`. `payment_status` is `unfunded, authorized, held, released,
paid_out, failed, voided, refunded, partially_refunded`. `payment_kind` is `job_payment` or `tip`.

```
unfunded --payment_intent.succeeded--> held --release--> held + release_requested_at
   --transfer.created--> released          held --refund--> refunded / partially_refunded
```

- Capture at hire: `accept_offer()`, then `begin_job_payment()` mints the row and `create-payment`
  starts the Stripe side. The client re-reads the row and never claims "held" off a successful
  payment sheet.
- Release: the customer's approval, or the 72-hour auto-release clock, or a 7-day fallback.
  `release_job_payment()` writes `transfer_cents = amount minus the worker fee` and sets
  `release_requested_at`; the row stays `held` until Stripe's `transfer.created` lands. Money
  labels follow this: never "paid" before `released`; `held` plus `release_requested_at` reads
  "approved, payout on its way".
- The 72-hour clock requires that the customer was told: a `job_completed` row in
  `notification_outbox` in any terminal status (`sent`, `skipped`, `failed`). The 7-day fallback
  releases under the same refusal set as `release_job_payment()` (open dispute, card dispute,
  refund-directed, parked). `job_completed` rides the always-on `jobs` notification category, which
  no preference or block suppresses.
- An open dispute freezes release: the approval RPC and the auto-release both refuse.
- `transfer.reversed` parks the row: it keeps `release_requested_at`, clears `released_at` and
  `transfer_ref`, and stamps `transfer_reversed_at`. Only `resolve_job_dispute()` clears the park.
- `payout.paid` is deliberately unhandled; the ledger stops at `released` (`paid_out` stays in the
  enum). There is no `adjustment` payment kind: renegotiate before funding; after funding, a
  top-up rides the tip rail.
- Settlement: `transfers_due` and `refunds_due` (and their `_ready` views, which wait for the
  worker's payout account) are drained by `process-settlements` every five minutes.
- Receipts: a payment reaching `released` fills `receipt_outbox`; `send-receipts` emails both
  parties (card payments only; skipped until `RESEND_API_KEY` and `RECEIPT_FROM` are set).

**Payout accounts.** Workers onboard through Stripe Connect (hosted onboarding in a system browser,
never a WebView): `connect-onboarding`, `connect-return`, `connect-status` (records
`payouts_status`). `payouts_enabled` is not identity verification: no copy may claim "ID-verified
workers" from it. **Saved cards** live on the Stripe customer
(`payment_accounts.stripe_customer_id`); `payment-methods` lists, adds and removes them. Hiring
from a push opens an in-app confirm ("Accept & pay"), never pays silently, and a declined saved
card alerts in-app and pushes a Checkout link. **Tips** are a second `payments` row
(`kind = tip`, `begin_tip_payment()`), opened after release.

## Disputes

A reported issue is a `job_disputes` row, opened from `ApproveOrDispute` (customer) or by a worker
no-show claim. While one is open the payment stays held and `transfers_due` excludes the job. The
app promises: "Brazos will look at it and reply by email within 2 business days." The clock starts
at `job_disputes.created_at`. There is no admin UI for resolution: the operator resolves by hand.
`resolve_job_dispute()` is service_role only; the app never calls it. A cancelled job is terminal;
a no-show claim moves no money until it is resolved or withdrawn (withdrawal refunds by trigger).

### Operator runbook

Run in the Supabase SQL editor as the operator, never from a run or a chat.

1. Find the open reports:

```sql
select d.id, d.job_id, d.reason, d.details, d.created_at, d.opened_by,
       j.title, j.status as job_status, j.client_id, j.assigned_worker_id,
       p.id as payment_id, p.status as payment_status, p.charge_amount_cents, p.amount_cents
  from public.job_disputes d
  join public.jobs j on j.id = d.job_id
  left join public.payments p on p.job_id = d.job_id and p.kind = 'job_payment'
                               and p.status not in ('failed', 'voided')
 where d.status = 'open'
 order by d.created_at;
```

Reply-to addresses are in `auth.users.email` for `client_id` and `assigned_worker_id`.

2. Read the record before deciding: the thread
   (`select sender_id, content, created_at from public.messages where job_id = :job order by created_at;`),
   `jobs.completion_photos`, the agreement (`select * from public.job_agreements where job_id = :job;`),
   and both people's `public.reviews` and earlier `job_disputes`. Write to both parties if the
   record is not enough; the promise is a reply, not necessarily a decision.

3. Decide and resolve with `resolve_job_dispute(p_job_id, p_in_favour_of, p_note)`.
   `p_in_favour_of` is `'worker'` or `'customer'`; `p_note` is kept on the dispute row
   (`resolution_note`): say why in one or two sentences.

```sql
select public.resolve_job_dispute('<job id>', 'worker',   'Photos show the work complete as agreed.');
select public.resolve_job_dispute('<job id>', 'customer', 'Work not done; customer refunded in full.');
```

| Job state | In favour of | Money |
|-|-|-|
| completed | worker | release requested; the transfer of the agreed price less the worker fee is queued. Refused while a chargeback is open on the row. |
| completed | customer | a full refund of the card charge is queued (reason `dispute_refund`). |
| cancelled (customer no-show claim) | worker | the frozen cancellation fee goes to the worker, the rest is refunded. |
| cancelled (customer no-show claim) | customer | a full refund. |
| cancelled (no open claim, undirected held row, for example after a ban) | customer only | a full refund; `'worker'` is refused. |

The queued transfer or refund leaves on the next `process-settlements` tick. Transfers land only
once the worker's payout account is enabled.

4. Reply by email to both parties: the decision, the reason, and what happens to the money and
   when. Nothing in the app re-opens a resolved dispute; a second look is a new thread and, if
   warranted, a hand refund or transfer in Stripe's dashboard (the webhook records it). Once
   `job_disputes.status` is `resolved`, both parties can review and the customer can tip.

## Messaging

A message belongs to a job (`job_id`) or a direct thread (`direct_thread_id`), never both;
`lib/messages.ts` models that as the `ChatTarget` union. RLS grants a job thread to the job's
client and assigned worker only. `conversations` is a `security_invoker` view (one row per thread
with its last message). `message_reads` drives the unread dot for job threads; direct threads carry
their own read time. Chat carries text and photos, unsend, block and report. There are no voice
notes, documents, reactions or read ticks in v1.

Presentation collapses threads; storage does not. A customer and a worker have one conversation,
ever; the inbox never shows two rows for the same person. `lib/conversationResolver.ts` owns the
collapse and the send routing: newer work wins over stale chatter, the most recent activity wins
among jobs that both have it, ties break by ascending job id, and with no active job the pair
thread. It is pure, with no runtime imports, so tests run it directly.

**Messaging is locked before assignment.** `messaging_unlocked()` answers it in the database
(`fetchMessagingUnlocked()`): person-to-person messaging opens only after an offer is accepted and
a worker assigned. Before that, offer events render as negotiation cards.

## Location privacy and storage

The exact address and coordinates live in `job_locations`, never on `jobs`. RLS grants it to the
job owner and the assigned worker only, and it is never added to realtime. A `job_private_details`
table was never built; `job_locations` is that surface. Open-market surfaces show approximate
location only, enforced by RLS and not by the frontend.

Three buckets, each with a 25 MB limit and an image/video mime list: `job-photos` (posting and
completion photos and videos) and `avatars`, public (permanent URLs; the privacy policy says so,
D-20261108-12); `chat-photos`, private, whose uploads return a `storage://bucket/path` reference
that `resolveChatMediaUrl()` exchanges for a six-hour signed URL. The orphan buckets `chat-audio`
and `chat-documents` are deleted. Direct SQL deletes on storage tables are refused for everyone; use the Storage API.

## Profiles and reputation

`profiles` is readable by any signed-in user column by column: the readable set is exactly
`PUBLIC_PROFILE_COLUMNS` in `lib/profiles.ts`. `phone`, `is_admin` and `banned` are self-only, via
`get_my_profile()`.

Reviews: double-blind. A review stays hidden until both sides write or 7 days pass, whichever comes
first; the writing window is 30 days from completion. Each person has two reputations (worker,
customer), derived per review, with no role column. A rating shrinks toward the platform prior and
shows as "New" under 3 revealed reviews; one rating number is shown everywhere (`shown_average`
or "New"). Would-you-hire-again is captured per review and may be skipped (NULL is valid). Signals:
`profile_review_summary(p_user, p_role)` and `profile_review_summaries(p_users, p_role)` (any
signed-in user; the batch also returns `completed_jobs` and `on_time_pct`), `completion_rate`,
`on_time_pct`, `response_time` (nullable: null is unknown, never zero), `categories`, and
`worker_job_stats(p_worker)` (security definer, per-category counts). `rating_avg` and
`rating_count` are a legacy mixed aggregate kept by a trigger and read by no display
(`tests/legacyAggregateFence.test.mjs`). Never invent any of it: `lib/compareBids.ts` renders facts
only when known.

## Notifications

`notification_outbox` is one event log with two consumers, the push queue and the in-app feed
(`lib/notifications.ts`; SELECT by RLS to the recipient, UPDATE of `read_at` only), so nothing is
written twice. Preferences and quiet hours live in `notification_prefs` (quiet hours run midnight to
6 am, off until the person turns them on; nearby alerts default on; one tap opts out). Device
tokens live in `push_tokens`, unregistered on sign-out. `should_notify()` honours blocks and the
person's preferences.

pg_cron calls `drain_notification_outbox()` every minute (`install_push_schedule()`); it reads the
endpoint and the `service_role` key from Supabase Vault and posts to `send-push` through pg_net.
The call is fire-and-forget: `cron.job_run_details` shows success regardless of delivery;
`net._http_response` holds the outcome. The local stack has no pg_cron or pg_net, so the installer
skips there with a notice.

## Account deletion

`delete_my_account()` is the only path. delete_my_account requires only a signed-in caller, so a
banned user can still delete their data. The gate: `account_deletion_blockers()` must return no rows
or the call raises `ACCOUNT_DELETION_BLOCKED` (assigned or in-progress jobs, unsettled money and
open disputes block; the screen lists them). Then, in one transaction: lock the person's jobs;
cancel their open postings (drafts stay drafts; offers on them are settled by
`jobs_settle_offers_on_cancel`); withdraw their pending offers one by one (a refusal is counted and
skipped); hard-delete private rows (push tokens, notification prefs and outbox, message reads,
worker services); scrub the profile to a tombstone (`Deleted user`, phone, avatar, bio and stats
nulled, `deleted_at` set; `banned` is never touched, so deletion cannot launder a ban); delete the
`auth.users` row and assert exactly one row went. Retained, pointing at the tombstone: reviews,
reports, blocks, banned phones, legal acceptances, payments, disputes, jobs, offers, messages,
threads, job locations. Not done: storage cleanup, and notification titles that embed an actor's
name.

Check after a change: delete a throwaway staging account that has an open posting; expect the auth
row gone, the tombstone present, `phone` null, the posting `cancelled`, a completed job untouched.
Read the rows: `RAISE NOTICE` output never shows in the SQL editor.

## Security model

RLS is on everywhere. Anything a caller cannot see under RLS is served by a narrow security
definer function that returns the minimum: a count, an aggregate, or the caller's own row.
`anon` has no EXECUTE by default and default EXECUTE grants are off, so a new function is
unreachable until its migration grants it. Security definer bodies pin `search_path`; views are
`security_invoker`. Every new security definer function in `public` carries its own
`revoke`/`grant` in the migration that creates it (`.claude/rules/supabase.md`). Client code never
trusts its own state for a transition that matters: it calls the RPC and handles the error.
`jobs_within_radius()` returns a half-mile-snapped `distance_miles` and orders by that snapped
value, so the sort cannot leak the precision the rounding removes. Reports and blocks feed
`ban_user()`; a server-side content filter (`blocked_terms`, `reject_blocked_terms`) checks posts,
bios, services, offers, reviews and messages.

## Data model: 28 tables

| Table | Role | Writes | Reads |
|---|---|---|---|
| `jobs` | the job | RPC only | owner, assigned worker, open-market projection |
| `job_offers` | offer chains | RPC only | the parties |
| `bids` | legacy projection; drives the new-bid push | trigger | parties |
| `job_locations` | exact address | RPC | owner and assigned worker |
| `job_agreements`, `job_completions` | price snapshot at accept (immutable); completion photos | trigger; `transition_job_status()` | the parties |
| `job_series` | repeat-job series | RPC | column-level for owner |
| `job_disputes` | reported issues | RPC; resolve is service_role | the parties |
| `payments` | the ledger (job payments and tips) | RPC and webhook | its two parties |
| `payment_events`, `payment_accounts`, `fee_schedule` | Stripe event inbox; Stripe customer and Connect ids; fee rates | service_role (rates: migration) | service_role |
| `app_config` | remote switches (maintenance, posting, payments) | operator | everyone |
| `profiles` | identity and reputation signals | RPC and self | column grants |
| `worker_services` | a worker's services and prices | owner | visible rules |
| `reviews` | double-blind reviews | RPC | revealed only |
| `messages` | chat | party | the thread's parties |
| `direct_threads` | offer-scoped person threads | RPC | the two people |
| `message_reads` | unread state | owner | owner and party |
| `notification_outbox` | push queue and in-app feed | server | recipient |
| `notification_prefs`, `push_tokens` | preferences and quiet hours; device tokens | owner | owner |
| `receipt_outbox` | email receipt queue | trigger | service_role |
| `reports`, `blocks` | report records; blocked people | owner | admin; owner |
| `banned_phones`, `blocked_terms` | ban list; content-filter list | `ban_user()`; operator | service_role |
| `legal_acceptances` | Terms and Privacy acceptance | owner | owner |

Plus views `conversations`, `transfers_due`, `refunds_due`, `transfers_ready`, `refunds_ready`, and
126 functions. The schema is the numbered files in `supabase/migrations/` (baseline `20260901000000`
to `20261108010000_lean_v1_grants.sql`). A migration file existing is not evidence staging has it: the
pipeline's list-after step is.

## Edge functions (9)

House style: plain `fetch` to PostgREST and Stripe, no `supabase-js`, no import map, no
shared module beyond `_shared/serviceAuth.ts` (below), no function computes a monetary amount
(every cent sent to Stripe is read verbatim from a `payments` column). The other import is
`stripe-webhook`'s sibling `./verify.mjs`, because a Node test runs it. `supabase/functions/` is
not type-checked.
`supabase/config.toml` is the only source of `verify_jwt`: `stripe-webhook` and `connect-return`
are `false` (Stripe and a browser send no JWT); `create-payment`, `connect-onboarding`,
`connect-status`, `payment-methods` are `true`; `send-push`, `send-receipts` and
`process-settlements` run on the platform default (the last two woken by pg_cron with the
service-role key as Bearer). After every deploy, confirm the dashboard still shows JWT
verification off for `stripe-webhook` and `connect-return`.

| Function | Role |
|---|---|
| `stripe-webhook` | records each Stripe event in `payment_events`, asks `apply_payment_event()` to apply it; decides nothing about money |
| `create-payment` | starts the Stripe side of a row `begin_job_payment()` holds |
| `process-settlements` | drains `transfers_due` and `refunds_due` every five minutes |
| `connect-onboarding` | creates the worker's Stripe account and a hosted-onboarding link |
| `connect-return` | stateless bounce from hosted onboarding back to the app |
| `connect-status` | classifies the Stripe account into the one app-facing payout state |
| `payment-methods` | list, add (setup intent) and remove saved cards |
| `send-push` | drains `notification_outbox` through Expo push (100 per request, 10 passes) |
| `send-receipts` | drains `receipt_outbox` by email (Resend) |

**`_shared/serviceAuth.ts`** is the one shared module (D-20261108-10): a constant-time check of the
service-role key in the Bearer header, POST only. `send-push`, `send-receipts` and
`process-settlements` call it first, since the database and pg_cron wake them with that key.

**Webhook events**, exactly seven: `payment_intent.succeeded`, `payment_intent.canceled`,
`charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, `transfer.created`,
`transfer.reversed`. Signature (`verify.mjs`): v1 scheme only, HMAC-SHA256 over `<t>.<raw body>`,
300-second tolerance, several v1 values accepted during key rotation, an empty key never
authenticates. Response rule: a bad or missing signature is 400 with no side effects; an event
outside the seven is 200 `ignored` and not recorded; a duplicate insert (23505) means stored, not
applied, so it falls through and applies; `apply_payment_event` `ok:true` is 200; `ok:false` with
`attempts >= 5` is 200 and the row stays recorded with `processed_at` null; `ok:false` with fewer
attempts, any other insert failure, an unreachable RPC or a throw is 500, so Stripe retries.

**`create-payment`**: POST with a user token and `{"jobId":"<uuid>"}`. `begin_job_payment()` runs as
the caller. Stripe calls carry idempotency keys (`brazos-customer-<user id>`,
`brazos-intent-<payment id>`); the intent amount is `charge_amount_cents` verbatim with
`metadata[payment_id]`. Success returns four strings and no amount. Failures: 4xx with the RPC's
own message, 401 no session, 409 no amount yet, 502 Stripe down. **`process-settlements`** sends
`transfer_cents` and `refund_cents` verbatim; a transfer carries `metadata[payment_id]` (without it
the event matches no row); idempotency keys `tr:<payment id>:<transfer_attempts>` and
`rf:<payment id>`; it writes nothing back, since `transfer_ref` and `refund_ref` arrive by webhook.

## Staging pipeline

`.github/workflows/staging.yml` runs on a push to `mainexpo` touching `supabase/migrations/**`,
`supabase/functions/**` or `supabase/config.toml`, and on manual dispatch with one input,
`allow_destructive` (default false). Three jobs in order: `verify` (`npm run verify`), `migrate`
(environment `staging`: link, list pending, the safety gate, `db push`, list again), `deploy` (every
function). The CLI is pinned (`supabase@2.116.0`); no third-party action holds the credentials.

The safety gate is `scripts/staging-scan.sh` over the files staging reports pending (from the
database, never the git diff). With `allow_destructive` false, a pending file containing
`drop table`, `drop column`, `drop schema`, `truncate` (at statement position), `rename to`,
`rename column` or `delete from` stops the job before a statement runs, and that push's function
deploy stops with it; the operator applies the file by hand or re-runs with the override. The scan
is a tripwire, not a proof. Staging is what installed TestFlight builds read, so removing what a
build still reads breaks it the moment it lands; additive SQL cannot. A migration that adds an
enum value is its own file. Production is hand-applied and no job targets it. `ci.yml` runs
`npm run verify` with no secrets; `pgtap.yml` runs `db:reset` then `db:test` on a local stack.

## Legal text and the public website

`lib/legal/termsOfService.ts` and `lib/legal/privacyPolicy.ts` are the one source of the Terms and
the Privacy Policy; `lib/legal/index.ts` holds the versions the gate records (`legal_acceptances`,
one row per document and version, so a new version asks everyone again). The app renders them with
`components/MarkdownText.tsx` (headings, paragraphs, bullets only).

`node scripts/build-site.mjs` reads those two strings as text, with the support address from
`lib/appLinks.ts`, and writes `site/` (git-ignored): `index.html`, `support.html`, `privacy.html`,
`terms.html`, `404.html` and `_headers`. No dependency, no script tag, no cookie, no request to
another host; colours follow `prefers-color-scheme`. The Support page's steps are written in the
script and name real controls (Cancel job, Report, Block, Report an issue, Delete account): change
them when those controls change. Hosting is the owner's manual upload of `site/` to Cloudflare
Pages; nothing deploys it. `tests/buildSite.test.mjs` builds to a temp folder and checks the
pages against the source.

Check after a change to either text: bump the version if the substance moved, `npm run verify`,
`node scripts/build-site.mjs`, then the owner uploads `site/` again.
