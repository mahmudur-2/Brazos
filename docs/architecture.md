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
   executed anywhere. `HANDOFF.md` names these. As of 2026-08-22 the newest
   repository phases are 74–76; which of them are applied to staging is
   `HANDOFF.md`'s fact, not this file's. The layer is kept because it fills
   again the moment a new `phaseNN_*.sql` is written.

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
reset for free. Since Stage 4D the two BARS differ: the worker bar keeps the
five classic tabs (Home, Map, MyJobs, Messages, Profile); the customer bar
shows Home · Discover · [ + ] · Messages · Profile, with Map and MyJobs still
REGISTERED as hidden routes. home(9) removed Customer Home's "View map" pill
and its dispatch — the map is a worker surface — but the ROUTES stay, because
React Navigation 7 resolves an untargeted NAVIGATE against the tab navigator
only, and notification routing targets MyJobs in both modes (see
`ui/primitives/BottomNav.tsx` for the mechanism). The Home tab is the
mode-defining tab: customer Home roots at `HomeMain`, worker Home roots
at `WorkerHome` (explicit `initialRouteName`, 4D-1b) and carries the bid flow
(`WorkerResults`, `JobDetail`, `SubmitBid`, `BidSent`). The atlas-48 browse
screen was unmounted in 4D-1b and deleted in Batch F; every job-list intent
lands on `WorkerResults{mode:'all'}`.

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
(`headerShown: false`); screens render `components/ScreenHeader`. The old
customer-reaches-a-worker-surface gap is closed AT THE SCREEN: `JobDetail`
delegates customer mode to `components/MarketJobPreview.tsx`, so no
navigation path can render EST. PAY or a bid CTA to a customer.

## Design tokens and theme resolution

`ui/tokens.ts` is the authoritative token file and since 4D-3.5 exports TWO
palettes with identical key names, compile-checked by
`satisfies Record<ColorToken, string>`: `light` (Heritage — the existing §I
values, unchanged) and `dark` (Emerald Prestige v2: near-black emerald bg,
deep-green `forest` as the one solid conversion fill, `gold` reserved for
metal line-work — eyebrows, hairlines, icons, rings — and never a fill, with
a cream `onForest`. v2 inverted v1's gold-primary premise; see the notes on
`dark` in ui/tokens.ts).
`lib/theme.ts` wraps it for screens (CLAUDE.md: screens never import
ui/tokens.ts directly) and re-exports the §I helpers — `withAlpha`, `layout`,
`controls`, and the §I radius scale as `emeraldRadius`. `darkColors`' seven
brand hues are spread from the tokens `dark` palette, so dark-forest has one
definition.

Resolution is a context: `lib/ThemeContext.tsx`'s ThemeProvider (mounted once
in App.tsx, above auth and mode) feeds `hooks/useThemeColors.ts`, the single
reactive read. Since 4D-4 the provider resolves a real preference in order:
stored preference (AsyncStorage, `lib/themePreferenceStorage.ts`, read BEFORE
the themed tree mounts so there is no light flash) → system appearance
(`useColorScheme()`, subscribed to Appearance change events so an OS flip
repaints live) → light. A pinned preference is pushed to the native side with
`Appearance.setColorScheme` (RN 0.81.5 has it; react-native-web does not, and
the helper hands control back with null). `app.json` sets
`userInterfaceStyle: "automatic"`. `screens/AppearanceScreen.tsx` is the
setting surface. Both palettes are live and both are swept.

Translucent colours are derived, never restated: `withAlpha(token, alpha)`
(`ui/colorAlpha.ts`, pure and executed by tests byte-for-byte against the
values the 4D-3.5 sweep replaced) is the one way a scrim or on-fill
translucency comes from a palette hex. `tests/themeTokens.test.mjs` keeps the
migrated files free of raw hex/rgba literals.

## Worker discovery (4D-2)

The worker Map tab renders clustered pins: `lib/mapClustering.ts` (pure
fixed-grid aggregation, no clustering library, executed directly by tests)
merges `job_hotspots()` cells into count-badged pins by the visible region's
`latitudeDelta`; deterministic keys, member order and count-weighted
centroids. Tapping a pin opens a bottom sheet of `WorkerJobCard`s for the
pin's member cells (`fetchOpenJobsInCells`), and a card opens `JobDetail`
inside the Map stack. Customer mode keeps the pre-4D-2 glow-cell drill-down,
and the new `HotspotMapProps` members are optional so the frozen web map
ignores them.

Distance is server truth or absent: cards carry `jobs_within_radius()`'s
half-mile-snapped `distance_miles` where the surface has it (radius results;
the map sheet joins it through one radius read sized to the pin), and render
nothing otherwise — the client never guesses at coordinates `job_locations`
keeps unreadable. The distance filter is a single-select chip row
(`components/DistanceChips.tsx`) whose rules live in `lib/discoveryFilter.ts`
(also home of the canonical `NEARBY_RADIUS_MILES = 5`, re-exported by
WorkerResultsScreen for WorkerHomeScreen's import) and whose
selection persists per account via `lib/discoveryFilterStorage.ts`
(AsyncStorage, modeStorage pattern). WorkerResults routes all/skills through
the radius when one is chosen, arrives at the stated 5 in nearby mode with a
title that tracks the chip, and announces a dead location instead of silently
unfiltering.

The market job detail leads with the scope of work (description directly
under the title), shows the approximate area only, and renders
`lib/matchReasons.ts`'s output: three deterministic boolean checkmarks —
category ∈ profile categories, known distance within the persisted radius
(default the nearby promise), and the feed filter's own `budgetCeiling`
covering the viewer's cheapest published flat price. Unknown or unmet facts
render nothing; percentages and scores are banned and test-guarded. The
worker hero card (`lib/workerHeroCard.ts`, 4E) composes lib/compareBids.ts —
`knownRating`, `totalCompletedJobs` over `worker_job_stats`, `trustRowFor`'s
"New worker" verdict — into positive-only trust rows (rating · jobs
completed · responds-in), and a tombstoned profile (rebook's `canHire`)
carries no offer, book, or save affordance.

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
arrival timestamps, and whether a dispute is open — where a FAILED dispute
read arrives as `'unknown'`, never as "no dispute". It yields `draft, open,
pending_payment, confirmed, en_route, arrived, in_progress, awaiting_approval,
disputed, completed, cancelled, unknown`. Since Batch I (F-012) every other
status vocabulary is presentation over that one derivation: `lib/jobStage.ts`
(the card badge — runs the raw status through the derivation, keeps only the
bid overlay, the poster privacy rule and the frozen labels, and owns the one
`formatStatus` title-caser), `components/StatusBadge.tsx` (a colour map over
caller-supplied keys, importing that title-caser), `components/JobProgress.tsx`
(renders `trackStepIndex()`; off-track statuses claim nothing), and
`ui/primitives/StatusPill.tsx` (label maps over caller-supplied enums; derives
nothing). Screens still branch on raw `job.status` for control flow — fetch
gates, permission gates, section selection — but no screen re-derives a
lifecycle classification, and a raw status→step map anywhere outside
`lib/jobLifecycle.ts` fails `tests/lifecycle.test.mjs`'s sweep. Customer Home
reads the hub's aggregation (`hooks/useMyJobsHub.ts`) and, through
`lib/homeAttention.ts`, lists the posted jobs that need the customer's move
with the hub's own next-action line; the selection rule lives there and
nowhere else.

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
disabled rather than merely rejected. `create_offer()` caps `p_message` at 500
characters; the bid composer mirrors that cap the same way
(`lib/offerMessage.ts`) and appends at most one availability line ("Can start
today · about 1-2h") — when the line would not fit, the chips disable with a
written reason instead of a send ever being truncated.

## Money

Integer cents throughout, formatted only through `formatBudget()`.
`lib/payments.ts` holds the client types and reads; writes go through the
adapter in `lib/adapters/payments.ts` into SECURITY DEFINER RPCs, never from a
screen. `payments` grants SELECT to its two parties and nothing more.

Amounts are bounded above as well as below (phase75): job budgets, offer
amounts and payment amounts carry a 10,000,000-cent ($100,000) ceiling,
enforced by CHECK constraints on `jobs`, `job_offers` and `payments` rather
than in any function, so every writer is bound — including future ones. Tips
keep their separate $1,000 cap in `sandbox_tip_worker()`.

`payment_status` is `unfunded, authorized, held, released, paid_out, failed,
voided, refunded, partially_refunded`. A legacy `pending` label exists in the
live enum from a pre-repository scaffold; nothing writes it and the client
union deliberately excludes it, so no screen can render a state the payment
model does not define. `payment_kind` is `job_payment | tip`.

**Availability is declared, never inferred from the build type.**
`EXPO_PUBLIC_PAYMENTS_MODE` selects it and `lib/adapters/paymentsMode.ts`
resolves it as an allow-list: `sandbox` → sandbox on *any* build, `disabled` →
disabled on *any* build, unset/blank → sandbox in development and disabled
otherwise, anything else → disabled with the reason in `configError`. So
sandbox money runs on a release binary — that is deliberate, because TestFlight
is the build the beta is exercised on, and it is why the checkout banner states
the money fact ("SANDBOX — no real money moves") rather than the build type.
There is no `live`, `real` or `production` value and no code path behind the
resolver that could reach a real provider; the sandbox RPCs are the only
functional one that exists. Contrast phone auth above, whose `mock` provider
*is* refused outside development — a mock credential path and clearly-labelled
simulated money are not the same risk.

The flow is sandbox: checkout creates a payment that stops at `held`; release
happens on customer approval or the 72-hour auto-release clock, stamped with
`release_reason` (`approved` | `auto_approved`); a simulated cash-out sweeps
released rows to `paid_out`. For a stripe row the 72-hour clock requires that
the customer was TOLD — a `job_completed` `notification_outbox` row in any
terminal status (`sent`, `skipped`, `failed`), because the in-app feed shows the
row whether or not a push left the server — and an unconditional fallback
releases at 7 days after completion under the same refusal set as
`release_job_payment()` (open dispute, card dispute, refund-directed, parked).
`job_completed` is enqueued under the always-on `jobs` category, which a
preference, a mute or a block never suppresses (migration
`20260930000100_auto_release_told_gate.sql`). `PLATFORM_FEE_RATE` is 0, so
`platform_fee_cents` is always 0 — a real column and real maths, not an
omission. An open dispute
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
stated in `supabase/archive/phases/phase43_job_offers_foundation.sql`. Customer-facing
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
else: the per-role REVEALED summaries — `profile_review_summary(p_user,
p_role)` for one person and `profile_review_summaries(p_users, p_role)` for a
list (both any-signed-in-user; both shrunk toward the platform prior, with
"New" under three revealed reviews; the batch also returns `completed_jobs`
and `on_time_pct`);
`completion_rate`, `on_time_pct`, `response_time` (nullable — treat null as
unknown, never as zero); `categories`; `worker_job_stats(p_worker)`, a security
definer aggregate because a visitor cannot read another user's completed jobs
under RLS (it returns per-category counts — the total is their sum); and
`portfolio_items`. `rating_avg` / `rating_count` are the legacy mixed
aggregate — still maintained by the trigger, read by no display after n7, and
scheduled for retirement (`docs/BACKLOG.md` §v1.2). Never invent any of it.
Where bids present a worker,
`lib/compareBids.ts` enforces the null-is-unknown rule as code: facts render
only when known, unknown renders nothing, and "New worker" appears only when a
sub-3 completed-job count is actually known alongside a null `on_time_pct`.
The worker's own profile (worker mode only) carries a four-step completeness
meter (`lib/profileCompleteness.ts`) that disappears entirely at 4/4.

## Notifications

`notification_outbox` is one event log with two consumers: the push queue and
the in-app feed (`lib/notifications.ts`, phase56 — SELECT scoped by RLS to the
recipient, UPDATE column-granted to `read_at` only), so nothing is
double-written. Preferences live in `notification_prefs`; device tokens in
`push_tokens`, unregistered on sign-out.

The outbox now drains on a schedule (phase74): pg_cron fires
`public.drain_notification_outbox()` every minute; that function reads the
endpoint and the `service_role` key from Supabase Vault and posts to the
`send-push` Edge Function through pg_net. The call is fire-and-forget, so
`cron.job_run_details` reports success independently of delivery —
`net._http_response` is where the outcome actually lands.

## Security model

RLS is on everywhere. Anything a caller cannot legitimately see under RLS is
served by a narrow security definer function returning the minimum — a count, an
aggregate, or the caller's own row. phase32 revoked EXECUTE from `anon` and
turned off default EXECUTE grants, so a function created afterwards is
unreachable until a migration grants it explicitly. phase64 pinned `search_path`
on security definer bodies; phase65 made views `security_invoker`. Client code
never trusts its own state for a transition that matters: it calls the RPC and
handles the error.

phase75 removed anon's INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
grants from seventeen tables. anon's SELECT is deliberately retained, because
`scripts/verify-schema.mjs` probes column existence over PostgREST with the
publishable key; the retention is inert — no policy on any of those tables
admits anon, so the grant yields zero rows. In the same phase,
`jobs_within_radius()` began returning a half-mile-snapped `distance_miles`
and ordering by that snapped value, so the sort cannot leak the precision the
rounding removes.

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
