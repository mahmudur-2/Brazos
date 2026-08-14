# BRAZOS — Implemented Architecture

What the code does today, reconstructed from source, migrations and tests. This
file owns *implemented architecture* and nothing else: no machine state (Git),
no operational context (`HANDOFF.md`), no roadmap (`BRAZOS_MASTER_PLAN.md`). If
it disagrees with the code, the code wins — fix this file.

## The four layers, kept separate

Statements about "the schema" are ambiguous unless the layer is named. Every
schema claim below is one of:

1. **Application contract** — what the client calls and needs; proven by
   reading `lib/` and `screens/`.
2. **Repository-defined schema** — what the numbered migrations in `supabase/`
   declare; proven by reading the SQL.
3. **Last live-verified staging state** — what `node scripts/verify-schema.mjs`
   last reported, recorded in `HANDOFF.md`. Never re-verified from here;
   running it needs `.env` and a live database.
4. **Pending / unapplied migrations** — SQL in the repository that has not been
   executed anywhere. `HANDOFF.md` names these; at the time of writing it names
   `supabase/phase67_account_deletion.sql`, whose four verify-schema checks
   report PENDING.

A migration file existing (layer 2) is not evidence the database has it (layer
3). Only a green verify-schema is.

## Toolchain

Expo SDK and React Native versions come from `package.json`; never hard-code
them elsewhere. TypeScript, with no generated Supabase types, so nothing is
compile-checked against the database (see CLAUDE.md). Entry point `index.ts` →
`App.tsx`. Tests are `node --test` over `tests/*.test.mjs` — offline, no
test-framework dependency.

## Auth and session boundary

`lib/AuthContext.tsx` owns the session. It exposes `user`, `session`, `loading`,
`signUp`, `login`, sign-out, and a `bannedNotice` flag set when the last
sign-out happened because the account is suspended; it also unregisters the push
token on sign-out. Screens read auth through `hooks/useAuth.ts`.

Phone one-time codes go through the provider boundary in `lib/phoneAuth/`.
Screens call `phoneAuth`, never `supabase.auth`, so the same UI runs against
any implementation: a development-only `mock` provider, a written-but-dormant
`supabase` provider (real `signInWithOtp` / `verifyOtp`), and `disabled`.
`EXPO_PUBLIC_PHONE_AUTH_MODE` selects one; unset means mock in development and
disabled in a release, and mock is impossible when `__DEV__` is false. Email +
password remains the only path that authenticates anyone until SMS is
provisioned — see [phone-auth-activation.md](phone-auth-activation.md). Phone
numbers are normalised to E.164 by `lib/phoneNumber.ts`, and the verify screen
names the number back masked. Above the tabs sit two gates: signed out → the
auth flow; signed in with legal documents unaccepted → `LegalGateScreen`.

## Mode architecture

One account is simultaneously a customer on the jobs it posted and a worker on
the jobs it bid for. There is **no role** anywhere in the data layer; "mode" is
a UI concept only. `modes/ModeProvider.tsx` is the single authority.
`switchMode()` is the only function that changes mode and it always confirms
first; callers may replace the confirmation copy but not remove it. Mode
resolves asynchronously from a cached value (`modes/modeStorage.ts`), a server
value (`fetchMyActiveMode` / `setMyActiveMode`, phase42's
`profiles.active_mode`), and a just-made Setup landing choice.
`navigation/ModeShell.tsx` holds a neutral loader until resolution finishes
rather than rendering a guessed tree and swapping it.

## Navigation — two trees, four shared stacks

`ModeShell` mounts exactly one root: `CustomerRoot` or `WorkerRoot`. Mutual
exclusion is the enforcement mechanism — a worker screen cannot render in
customer mode because it is not mounted — and it gives `switchMode()` its stack
reset for free. Both trees have the same five tabs in the same order (Home, Map,
MyJobs, Messages, Profile). **Only the Home tab differs**, and that difference
is what mode means here: customer Home roots at `HomeMain`, worker Home roots
at `BrowseJobs` and carries the bid flow (`WorkerResults`, `JobDetail`,
`SubmitBid`, `BidSent`).

The other four stacks are declared **once** in `navigation/sharedStacks.tsx`
and mounted by both trees, because one account's job hub, inbox, map and
profile are genuinely the same surfaces in either mode. MyJobs carries the hire
loop (`CompareBids`, `BidDetail`, `Counteroffer`, `Checkout`, `JobConfirmed`)
and the active-work loop (`RouteArrival`, `WorkChecklist`, `TrackWorker`,
`ApproveOrDispute`, `ReviewAndTip`); Profile carries account surfaces including
`DeleteAccount`, plus the design-system catalog gated on `__DEV__` so a
production bundle has no route to it at all.

Every param list lives in `lib/navigation.ts`. The two trees are separately
typed, so cross-tree navigation is a compile error. Headers are off everywhere
(`headerShown: false`); screens render `components/ScreenHeader`. Known gap:
`JobDetail` is registered in the Map and MyJobs stacks, so a customer drilling
into a map cell can still reach a worker surface; closing it needs a
customer-safe market preview route.

## Jobs and lifecycle

`jobs` carries `id, client_id, title, description, category, location,
budget_cents, status, created_at, assigned_worker_id, final_amount_cents,
completion_photo_url, completion_photos, photos, videos`; the three media
columns are jsonb arrays. `budget_cents` is integer cents — there is no
`budget` column. `jobs ↔ bids` has two foreign keys, so any PostgREST embed
must disambiguate (`bids!bids_job_id_fkey(count)`). Database status vocabulary
is `open → assigned → in_progress → completed`, and writes go through
`create_job()`, `update_job_details()` (edits only while `open` with zero bids)
and `transition_job_status()`. **`transition_job_status()` is the only status
mover and `accept_offer()` is the only assignment path** — the client never
sets `status` or `assigned_worker_id`.

Everything richer than those four values is *derived* in exactly one place,
`lib/jobLifecycle.ts`, from four facts: job status, payment state, the phase51
arrival timestamps, and whether a dispute is open. It yields `draft, open,
pending_payment, confirmed, en_route, arrived, in_progress, awaiting_approval,
disputed, completed, cancelled, unknown`, and no screen re-derives any of it.
`lib/jobStage.ts` separately turns status + bid count + ownership into the
badge a card shows.

## Offers — one negotiation model

`lib/offers.ts` is the single negotiation module; it replaced the earlier split
between marketplace bids and private job requests. A negotiation is a **chain**
of `job_offers` rows: the first is the root, and every counter is a child
pointing at the offer it answers. `offer_type` (`marketplace_bid` |
`direct_offer`) is fixed for the whole chain and records how it started. A
counter is identified by *having a parent*, never by a type value. Rows carry
stable `customer_id` / `worker_id` participants, an `author_id` for who wrote
that revision, and `awaiting_id` for whose move is next (null once settled).
`offer_status` is `pending, accepted, declined, withdrawn, expired,
superseded`.

**`job_offers` is RPC-write-only.** `authenticated` holds SELECT and nothing
else, so a raw write is rejected by the database rather than silently
succeeding. Writes: `create_offer`, `counter_offer`, `decline_offer`,
`withdraw_offer`, `accept_offer`. Reads: `job_offer_count`, `job_offer_counts`,
`my_pending_offers`. The counter cap is ten per side per chain, enforced under
the job row lock server-side and mirrored in the client so a spent action is
disabled rather than merely rejected.

## Money

Integer cents throughout, formatted only through `formatBudget()`.
`lib/payments.ts` holds the client types and reads; writes go through the
adapter in `lib/adapters/payments.ts` into SECURITY DEFINER RPCs, never from a
screen. `payments` grants SELECT to its two parties and nothing more.

`payment_status` is `unfunded, authorized, held, released, paid_out, failed,
voided, refunded, partially_refunded`. A legacy `pending` label exists in the
live enum from a pre-repository scaffold; nothing writes it and the client
union deliberately excludes it, so no screen can render a state the payment
model does not define. `payment_kind` is `job_payment | tip`.

The flow is sandbox: checkout creates a payment that stops at `held`; release
happens on customer approval or the 72-hour auto-release clock, stamped with
`release_reason` (`approved` | `auto_approved`); a simulated cash-out sweeps
released rows to `paid_out`. `PLATFORM_FEE_RATE` is 0, so `platform_fee_cents`
is always 0 — a real column and real maths, not an omission. An open dispute
(`job_disputes`, phase51) freezes release: the manual approval RPC and the
auto-release both refuse while one exists. **Money labels follow this state
machine everywhere** — never "paid" before `released`.

## Messaging

Storage is thread-keyed: a message row belongs to either a job (`job_id`) or a
direct thread (`direct_thread_id`), never both — `lib/messages.ts` models that
as the `ChatTarget` union so the impossible case cannot be constructed. RLS
grants a job thread to the job's client and assigned worker only.
`conversations` is a `security_invoker` view (one row per thread with its last
message) and so inherits the caller's RLS. `message_reads` drives the unread dot
for job threads; direct threads carry their own read state. Reactions, quoted
replies, unsend and voice notes all live in `lib/messages.ts`.

**Presentation collapses threads; storage does not.** A customer and a worker
have exactly one conversation, ever — jobs are context inside it, and the inbox
may never show two rows for the same person. `lib/conversationResolver.ts` owns
that collapse and the send routing under it, and carries the authoritative
resolver contract in its header: newer work wins over stale chatter, most
recent activity wins among jobs that both have it, ties break by ascending job
id, and with no active job the pair thread. Every downstream surface reads the
answer from there, so the inbox can never display one job while sends route to
another. The module is deliberately pure with no runtime imports, so the tests
execute it directly.

**Messaging is locked pre-assignment**, and the question is answered by the
database — phase66's `messaging_unlocked()` RPC, surfaced through
`fetchMessagingUnlocked()`. Free-form person-to-person messaging opens only
after an offer is accepted and a worker is assigned; before that, offer events
render as negotiation cards rather than ordinary bubbles.

## Location privacy

Exact coordinates and the exact service address live in **`job_locations`**,
not on `jobs` (phase12 removed `lat`/`lng` from `jobs`; phase43 extended the
table with `address_line` and access notes). RLS grants it to the job owner and
the assigned worker only, and it is never added to realtime. The planned
`job_private_details` table was never created — `job_locations` is that surface,
stated in `supabase/phase43_job_offers_foundation.sql`. Customer-facing
open-market surfaces show approximate location only, enforced by RLS rather
than by the frontend.

## Storage privacy

Four buckets. `job-photos` (public) holds posting photos/videos and worker
completion photos; `avatars` (public) holds profile pictures; `chat-photos` and
`chat-audio` are **private**. Chat media has been private since phase29:
uploads return a `storage://bucket/path` reference and display code exchanges
it for a short-lived signed URL through `resolveChatMediaUrl()` (six-hour TTL).
Legacy public URLs resolve to the same object path and are signed too.

## Profiles and reputation

`profiles` is readable by any signed-in user, but phase29 revoked table-wide
SELECT and re-granted it column by column: the readable set is exactly
`PUBLIC_PROFILE_COLUMNS` in `lib/profiles.ts`. `phone`, `is_admin` and `banned`
are self-only, via `get_my_profile()`. Real reputation signals, and nothing
else: `rating_avg` / `rating_count` (trigger-maintained from `reviews`);
`completion_rate`, `on_time_pct`, `response_time` (nullable — treat null as
unknown, never as zero); `categories`; `worker_job_stats(p_worker)`, a security
definer aggregate because a visitor cannot read another user's completed jobs
under RLS; and `portfolio_items`. Never invent any of it.

## Notifications

`notification_outbox` is one event log with two consumers: the push queue and
the in-app feed (`lib/notifications.ts`, phase56 — SELECT scoped by RLS to the
recipient, UPDATE column-granted to `read_at` only), so nothing is
double-written. Preferences live in `notification_prefs`; device tokens in
`push_tokens`, unregistered on sign-out.

## Security model

RLS is on everywhere. Anything a caller cannot legitimately see under RLS is
served by a narrow security definer function returning the minimum — a count, an
aggregate, or the caller's own row. phase32 revoked EXECUTE from `anon` and
turned off default EXECUTE grants, so a function created afterwards is
unreachable until a migration grants it explicitly. phase64 pinned `search_path`
on security definer bodies; phase65 made views `security_invoker`. Client code
never trusts its own state for a transition that matters: it calls the RPC and
handles the error.

## Compatibility shims that really exist

- `lib/jobStatusCompatibility.ts` — `transitionJobStatusWithoutRpc()`, used by
  `lib/jobs.ts` when the RPC returns `PGRST202` (function not found). Retire
  it once phase31 is confirmed applied everywhere the app runs.
- `isMissingRpc()` in `lib/profiles.ts` — the same `PGRST202` pattern for
  profile reads.
- `accept_bid()` and `respond_job_request()` — deprecated **database**
  functions with zero app callers. Never call, extend, or imitate them; their
  removal is a future migration.

Do not extend this pattern to new work. `advance_job_status` was never built —
if a document describes it as current architecture, that document is wrong.
