# BRAZOS — verified architecture

Written from the code and the deployed migrations, not from the product spec.
Its only job is to stop the same discovery work being repeated every session.
If it disagrees with the code, the code wins — fix this file.

## Shape of the app

- Expo SDK 54, React Native 0.81, TypeScript. `index.ts` → `App.tsx`.
- Navigation: `createBottomTabNavigator` with five tabs, each wrapping a
  `createNativeStackNavigator`. Headers are off everywhere
  (`headerShown: false`); screens render `components/ScreenHeader` instead.

| Tab | Stack screens |
| --- | --- |
| Home | HomeMain, PostJob, BrowseJobs, JobDetail, WorkerProfile |
| Map | MapMain, CellJobs, JobDetail, PostJob, WorkerProfile |
| My Jobs | MyJobsHub, ClientJobDetail, WorkerJob, JobDetail, Chat, PostJob, WorkerProfile |
| Messages | MessagesInbox, Chat, PostJob, WorkerProfile |
| Profile | ProfileMain, AdminReports, NotificationSettings, LegalDocument |

`lib/navigation.ts` holds every param list. Screens registered in more than
one stack (PostJob, JobDetail, Chat, WorkerProfile) get a standalone
route-param type instead of being tied to one parent stack.

Auth and the legal gate sit above the tabs in `RootNavigator`: signed out →
`AuthScreen`; signed in but documents unaccepted → `LegalGateScreen`.

## Two hiring systems, deliberately separate

This is the single most important thing to understand before touching offers.

### 1. Bids — the public competition (`bids`)

A worker browsing open jobs places a bid on someone else's open job.

- `create_bid(p_job_id, p_amount_cents, p_message)` — derives the worker from
  `auth.uid()`. One bid per worker per job (unique constraint → error 23505).
- `job_bid_count(p_job_id)` — count-only, readable by any signed-in user,
  because bid RLS otherwise hides other workers' bids.
- `accept_bid(p_job_id, p_bid_id)` — the job owner accepts. Locks both rows,
  derives worker and amount from the bid, sets the job to `assigned`.
- Client code: `lib/bids.ts`, `hooks/useJobBids.ts`, `hooks/useBidCount.ts`.
- Ranking helpers (`bidValueScore`, `sortBids`) are pure client-side maths
  over data already fetched; they invent nothing.

### 2. Job requests — the private negotiation (`job_requests`, phase18)

A client sends a specific worker a proposed job. Nobody else can see it.

- `create_job_request(...)` — creates the request and posts a `created` event
  message into the thread. **Creates no job row.**
- `respond_job_request(p_request_id, p_action, p_amount_cents)` —
  `accept` / `decline` / `counter`. The turn (`awaiting_id`), the 3-counters-
  per-side cap, blocking, and job creation are all enforced here, so a stale
  screen simply gets an error back.
- Accepting inserts the job directly as `assigned`, never `open`, so a
  private negotiation can never surface in the browse feed or the map.
- A partial unique index allows only one live request per client/worker pair.
- Client code: `lib/jobRequests.ts`, `hooks/useJobRequests.ts`,
  `components/JobRequestCard.tsx`, rendered inline in `ChatScreen`.

**Eligibility limit worth knowing:** `create_job_request()` requires that the
worker has already completed a job for this client, and the negotiation must
attach to an existing `thread_job_id` — messaging is keyed to a job and only
the client and the assigned worker are parties to it. So there is no path
today for a first-time direct offer to a stranger. Reaching a worker you have
never hired means posting a job they can bid on.

## Jobs

`jobs` columns the app relies on: `id, client_id, title, description,
category, location, budget_cents, status, created_at, assigned_worker_id,
final_amount_cents, completion_photo_url, completion_photos, photos`.

- `photos` / `completion_photos` are `jsonb` arrays of strings.
- `budget_cents` — integer cents. There is no `budget` column.
- `jobs ↔ bids` has **two** foreign keys (`bids.job_id` and
  `jobs.accepted_bid_id`), so any PostgREST embed must disambiguate:
  `bids!bids_job_id_fkey(count)`.
- Exact coordinates live in `job_locations`, not on `jobs` (phase12 removed
  `lat`/`lng` from `jobs`). Only the client and assigned worker can read them.
- Writes go through `create_job()` / `update_job_details()` /
  `transition_job_status()`. `update_job_details()` only permits edits while
  the job is `open` with zero bids.

Status: `open → assigned → in_progress → completed`. `jobStage()`
(`lib/jobStage.ts`) turns status + bid count + ownership into the badge shown
on a card; `StatusBadge` renders it.

Categories are a Postgres enum (`job_category`) mirrored by `JOB_CATEGORIES`
in `lib/jobs.ts`. Worker *skills* are a plain `text[]` on `profiles` and use
the broader `SKILL_CATEGORIES` list in `lib/skillCategories.ts`; the keys
overlap deliberately so a skill and a job category resolve to the same label.

## Profiles and reputation

`profiles` is readable by any signed-in user, but phase29 revoked table-wide
`select` and re-granted it **column by column** — the readable set is exactly
`PUBLIC_PROFILE_COLUMNS` in `lib/profiles.ts`. `phone`, `is_admin` and
`banned` are self-only and come back from `get_my_profile()`.

Real reputation signals available for ranking (nothing else is real):

- `rating_avg`, `rating_count` — maintained by a trigger on `reviews`.
- `completion_rate`, `on_time_pct`, `response_time` — nullable; absent for
  most accounts, so treat null as "unknown", never as zero.
- `categories` — what the worker says they do.
- `worker_job_stats(p_worker)` — completed job counts per category. A
  `security definer` aggregate, because a visitor cannot read another user's
  completed `jobs` rows under RLS.
- `portfolio_items` — the curated Past Work gallery.

## Messaging

- `messages` are keyed by `job_id`; RLS grants access to the job's client and
  assigned worker only.
- `conversations` is a `security_invoker` view — one row per job with its last
  message. It inherits the querying user's RLS, so it cannot leak.
- `message_reads` drives the unread dot. Reactions, replies, unsend (15-minute
  window) and voice notes are all in `lib/messages.ts`.
- A message row with `job_request_id` set is a negotiation event, not a
  bubble; `ChatScreen` renders `JobRequestCard` for it.

## Storage

| Bucket | Public | Holds |
| --- | --- | --- |
| `job-photos` | yes | posting attachments (`postings/<uid>/…`) and worker completion photos (`<jobId>/…`) |
| `avatars` | yes | profile pictures |
| `chat-photos` | **no** | in-chat images |
| `chat-audio` | **no** | voice notes |

Chat media is private since phase29: uploads return a `storage://bucket/path`
reference and display code exchanges it for a short-lived signed URL via
`resolveChatMediaUrl()`. Legacy public URLs still resolve.

## Security model, in one paragraph

RLS is on everywhere. Anything a caller cannot legitimately see under RLS is
served by a narrow `security definer` function that returns only the minimum
(counts, aggregates, or the caller's own row). phase29 hardened policies,
column grants and the chat buckets; phase32 revoked EXECUTE from `anon` and
turned off default EXECUTE grants for functions created afterwards — so a new
function is unreachable until a migration grants it explicitly. Client code
never trusts its own state for a transition that matters; it calls the RPC and
handles the error.

## Compatibility shims

`lib/acceptBidCompatibility.ts` and `lib/jobStatusCompatibility.ts` exist only
for the window before phase30/phase31 were applied: they run when the RPC
returns `PGRST202` (function not found). Same pattern for `isMissingRpc()` in
`lib/profiles.ts`. Do not extend this pattern to new work — the migrations are
deployed now.
