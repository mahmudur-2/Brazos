# DIAG — offer / counteroffer / messaging repair

Branch `stability-core-transactions`. Preflight: branch OK, HEAD `373bd72` OK,
tree clean OK. Pre-edit test baseline: **329 tests / 328 pass / 1 fail**
(`tests/pwa.test.mjs` → "web build is installable and receives hosted runtime
configuration", the documented frozen-PWA failure — `public/index.html` ships
`config.js?v=20260731-2`, the test expects `-1`. Frozen surface, out of scope).

---

## 1. PHASE 0 ANSWERS

### 0a. How offers and counteroffers are persisted

**OFFERS ARE A SEPARATE TABLE**

`public.job_offers`, created by `supabase/phase43_job_offers_foundation.sql:87`:

```sql
create table if not exists public.job_offers (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  offer_type public.offer_type not null,          -- marketplace_bid | direct_offer
  parent_offer_id uuid,                           -- null on a root; a counter HAS one
  root_offer_id uuid not null references public.job_offers(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  worker_id   uuid not null references public.profiles(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  awaiting_id uuid references public.profiles(id) on delete cascade,
  amount_cents integer not null,
  message text,
  status public.offer_status not null default 'pending',
  ...
);
```

A counter is identified structurally by having a `parent_offer_id`, not by a
type value (`docs/emerald-v2/ARCHITECTURE_DECISION_job_offers.md` §2).

**Creating RPCs** (all `security definer`, all with an explicit
`grant execute … to authenticated` because phase32 revoked the default):

| Action | Function | Newest definition |
|---|---|---|
| open a negotiation | `create_offer(...)` | `phase61_marketplace_thread_identity.sql:204` |
| counter | `counter_offer(p_offer_id, p_amount_cents)` | `phase63_counteroffer_cap_ten_per_side.sql` |
| accept | `accept_offer(p_offer_id)` | `phase50_sandbox_payments_and_offer_lifecycle.sql:437` |
| decline | `decline_offer(p_offer_id)` | `phase50_...:626` |
| withdraw | `withdraw_offer(p_offer_id)` | `phase50_...:370` |

`job_offers` grants `select` only; every write is an RPC
(`phase46_offer_rpcs_and_rls.sql` §10 / `lib/offers.ts:6-20`).

**`messages` rows are the thread REPRESENTATION of an offer, not the offer.**
`public.offer_post_event()` (`phase46_offer_rpcs_and_rls.sql:239-273`) posts one
message row per chain event:

```sql
insert into public.messages (
  job_id, direct_thread_id, sender_id, content,
  job_offer_id, request_event, request_amount_cents
)
values (v_job, v_thread, p_actor, '', p_offer_id, p_event, p_amount);
```

So the messaging lock has to key off the message row's discriminator (0b), and
the offer itself is never at risk from a `messages` policy.

### 0b. The discriminator the pre-confirmation lock keys off

**`public.messages.job_offer_id`** (added `phase46_offer_rpcs_and_rls.sql:76`),
with the pre-unification legacy column **`public.messages.job_request_id`**
(`phase18_hire_requests_and_replies.sql:63`). The app reads them in exactly that
order — `lib/offers.ts:155` `offerIdOf()` returns
`message.job_offer_id ?? message.job_request_id`.

A row is a **structured negotiation event** iff
`job_offer_id is not null or job_request_id is not null`.
A row is **free-form** iff both are null. `request_event` is the event name and
is constrained by `messages_request_event_valid`
(`phase43_job_offers_foundation.sql:580`) to
`created | countered | accepted | declined | closed | withdrawn | expired | superseded`.

**Why offer/counter/accept/decline creation cannot be blocked by the lock — two
independent reasons:**

1. Those actions never insert a message from the client. They call the offer
   RPCs, which are `security definer`; a `security definer` function runs as the
   table owner and RLS policies do not apply to it (`messages` does not have
   `FORCE ROW LEVEL SECURITY`). The new INSERT policy is therefore invisible to
   `offer_post_event()`.
2. Belt and braces: the new policy's negotiation branch explicitly permits a row
   carrying either discriminator, so even a hypothetical non-definer writer of a
   structured event is unaffected.

`lib/messages.ts:163-183` `sendMessage()` — the ONLY client insert into
`messages` — never sets `job_offer_id` or `job_request_id`. That is what makes
the discriminator a clean split rather than a heuristic.

Verified by test: `tests/messagingLock.test.mjs` asserts the deployed policy
text contains the negotiation branch and that `sendMessage()` sets neither
discriminator column.

### 0c. Every non-user writer to the message path

All of these are `security definer` and therefore **unaffected** by the new
INSERT policy. None was modified.

| Writer | File:line | What it writes | Lock applies? |
|---|---|---|---|
| `offer_post_event()` | `phase46:268` | chain events (`countered`/`accepted`/`declined`/`withdrawn`/`expired`) with `job_offer_id` | No — definer + negotiation branch |
| `create_offer()` root message | `phase50:864`, marketplace branch `phase61:409` | `request_event='created'` with `job_offer_id` | No |
| phase61 backfill | `phase61:430` | historical root messages for live marketplace chains | No — plain SQL in the migration, runs as superuser |
| `create_job_request()` (legacy shim) | `phase18:261`, `phase36:382` | `request_event='created'` with `job_request_id` | No |
| `respond_job_request()` (legacy shim) | `phase18:345/359/389`, `phase36:491/509/543` | accepted/declined/countered with `job_request_id` | No |
| `ban_user()` system notice | `phase13:334` | a **free-form** cancellation notice attributed to the banned user | No — `security definer` (`phase13:292`). This is the one non-negotiation system write; it is deliberately left working, because it explains to the counterparty why a job stopped. |
| `notify_on_message()` | `phase61:104` | reads `messages`, writes `notification_outbox` only | N/A |

Nothing in the notification path writes `messages`, so badge/notification
behaviour is untouched.

### 0d. Threads that already contain pre-confirmation free-form messages

**Reads are not touched.** The change is INSERT-only:
`messages_select_party` (`phase36_direct_offer_threads.sql:110`) is left exactly
as it is, so every historical row keeps rendering in the thread for both
parties. `unsend_message()` (an UPDATE path) is untouched.

**No row is deleted, rewritten or migrated.** Staging threads that already
contain pre-agreement chat keep it. The only observable change for such a thread
is that a *new* free-form message can no longer be inserted until the pair has a
confirmed job — which is the intended product rule, applied forward only.

---

## 2. ROOT CAUSE — Screenshot 1 (live offer card is a navigation dead end)

`screens/ChatScreen.tsx` handed the card a destination **only when the offer
had already been accepted**:

```tsx
onOpenJob={request?.status === 'accepted' ? () => openAcceptedJob(request) : undefined}
```

and `components/OfferCard.tsx` then required both facts again:

```tsx
const openable = event === 'accepted' && !!onOpenJob;
```

So a live JOB OFFER or COUNTER-OFFER rendered with no chevron, no
"Tap to view the job", and a disabled `Pressable`.

**Nothing was missing from the data.** `job_offers.job_id` is `NOT NULL`
(phase43:94) and is pinned constant down a whole chain by the composite
inheritance FK, so every revision of every negotiation already carries the
canonical job identity. `openAcceptedJob()` was reading exactly that
(`request.job_id`) and routing by role — it was simply never called for a
live offer. **This is a renderer/navigation-branch defect**, per the run's
root-cause rule; no query, RPC or creation path was at fault and none was
changed.

**Standalone-offer exception: does not exist in this architecture.** A direct
offer creates its own `draft`/`direct` job up front (that is where its title,
media and location live — `create_offer()`, phase61:204), which is why
`job_id` can be `NOT NULL`. There is no offer without a job, so nothing was
invented to make a card tappable and no duplicate job is created anywhere.

## 3. ROOT CAUSE — Screenshot 4 (`$119 proposed` stub, no actions)

The card was rendering with `offer === undefined`. That is the only state in
which all three of its explanatory outputs vanish at once — no
Accept/Counter/Decline, no "replaced by a newer one", no
"Waiting for their response…" — while the amount still shows, because the
amount comes from the **message** snapshot (`request_amount_cents`) and
everything else comes from the **offer** row and its embedded job.

`hooks/useJobOffers.ts` `useThreadOffers()` fetches offers by the id set found
in the thread's messages, and **two independent realtime channels drive that
refresh**:

* `messages` (hooks/useChat.ts) — the counter's event message arrives, which
  is what adds the new offer id to the fetch set;
* `job_offers` (useThreadOffers itself) — fires on the counter's own INSERT,
  and re-runs `refresh` while it is still bound to the **old** id set.

Both reads are therefore in flight at once with different id sets, and the old
implementation ended in `setOffers(data)` — a plain overwrite. When the older,
smaller answer landed last it **erased the just-arrived offer**, and nothing
re-triggered afterwards (the id set had already stopped changing), so the
newest card stayed stuck as a stub while every older card rendered in full.
That is exactly the asymmetry in the screenshot.

A second, smaller contributor: `const { data } = await fetchOffersByIds(ids)`
discarded the error, so a failed read blanked every card in the thread.

**Fix (no special-casing of any amount or account):**
`lib/offers.ts` gains `mergeThreadOffers(previous, incoming, allowedIds)` —
merge by id, `updated_at` breaks ties so a stale copy can never overwrite a
fresher row, and the result is pruned to the ids the thread currently
references so it cannot grow. The merge is measured against the **live** id
set (a ref), not the one the read captured, which is what makes the outcome
order-independent. The error is now inspected and a failed read leaves the
cards alone.

## 4. WHY CHAT AND MY JOBS DIVERGED

They never shared a rule. Three separate decisions were each written twice:

| Decision | Chat (before) | My Jobs / Job Detail (before) |
|---|---|---|
| is this actionable? | `isOpenOffer(status) && awaiting_id === me` (ignored lapsing) | `!bidLapsed && awaiting_id === me && author_id !== me` |
| where does it lead? | accepted only, inline in the screen | `navigate('JobDetail' \| 'ClientJobDetail' \| 'WorkerJob')`, inline per card |
| what does it say? | "Accept" / "Decline" / "Counter offer" | "Accept for $X" / "Decline counter-offer" / "Counter" / "Message X" |

Each now has exactly one definition, and both surfaces consume it:

* `isOfferActionableBy()` — `lib/offers.ts`
* `offerJobTarget()` — `lib/offerNavigation.ts`
* every string — `lib/offerCopy.ts`, rendered by `components/OfferResponseActions.tsx`

## 5. HOW JOB NAVIGATION IDENTITY IS NOW RESOLVED

`lib/offerNavigation.ts` `offerJobTarget(offer, viewerId)` → `{ screen, jobId }`
or `null`. Identity is `offer.job_id` and nothing else — no title, timestamp
or user-id heuristic (guarded by test). Role comes from the offer's own stable
participants (`customer_id` / `worker_id`), never from `author_id` or the app's
current mode.

| Viewer | Offer status | Destination |
|---|---|---|
| customer (job owner) | pending or accepted | `ClientJobDetail` |
| worker | pending | `JobDetail` (the marketplace view that carries the respond card) |
| worker | accepted | `WorkerJob` |
| anyone | declined / withdrawn / expired / superseded | none — card not tappable |

These are the same three routes `MyJobsHubScreen` already used (lines 288, 317,
370) — no new screen and no second navigation system. Dispatch goes through
`navigateAcrossTabs()`, the one guarded cross-tab helper, exactly as the
accepted path already did.

## 6. FIXES A–F — WHAT CHANGED

* **A** — `ChatScreen` passes `onOpenJob` whenever `offerJobTarget()` returns a
  destination; `OfferCard`'s `openable` is now `!!onOpenJob`. `openAcceptedJob`
  became `openOfferJob` and handles all three routes.
* **B** — the merge fix above, plus the offer's job embed widened to the full
  browse projection (`OFFER_JOB_EMBED`), so a card shows title, category,
  location, description, photo/video thumbnails, amount and time, and the
  screen it opens is built from the same row.
* **C** — `isOfferActionableBy()` is symmetric by construction: it reads only
  the turn and the author, so reversing the roles reverses only who acts.
  Lapsed-pending now reads as expired on the chat card too (it already did on
  job detail). Sender keeps the waiting state + Withdraw; superseded /
  declined / expired keep their explanatory note and no monetary actions;
  accepted keeps Screenshot 5's navigation.
* **D** — `components/OfferResponseActions.tsx` is the one actionable card,
  rendered by both Chat and Job Detail: heading, `Your move` badge, prominent
  amount, explanatory copy, then **Accept Offer ($X)** (primary, `checkmark`)
  / **Send Counter Offer** (secondary outline, `swap-horizontal`) /
  **Decline Offer** (destructive, `close`), icons leading. No Message button.
  No hex values — tokens only (guarded by test).
* **E** — the paragraph collided with the Accept button because `bidNote` had
  no `lineHeight` and the 52pt fixed-height `Button` followed it with no
  separation. The shared card gives the column a `gap` and the note an
  explicit `lineHeight`, so the copy always reserves its true height. No
  absolute positioning and no screen dimensions are referenced anywhere in the
  component (guarded by test).
* **F** — both surfaces now confirm with the exact amount:
  `Accept this offer for $110?` / `Decline this $110 offer?`
  (`acceptOfferConfirmTitle` / `declineOfferConfirmTitle`). Opening or viewing
  a card is unconfirmed, as required.

**Locked screens:** the shared card renders on `screens/JobDetailScreen.tsx`
and inside `components/OfferCard.tsx` (chat). Neither is a locked screen —
01–07 are auth/launch/Customer Home and 48 is `BrowseJobsScreen`, and
`OfferCard` is imported only by `ChatScreen` and `ClientJobDetailScreen`
(list variant, untouched). **No gate or branch was needed**, and no locked
screen was modified.

`components/Button.tsx` gained one optional prop, `iconPosition`, defaulting
to `'trailing'` — every existing caller renders byte-identically.

## 7. AUTONOMOUS DECISIONS

1. **Dead revisions stay non-tappable.** Fix A requires *live* offers to open
   their job and requires accepted ones not to regress. `declined` /
   `withdrawn` / `expired` / `superseded` were left non-tappable: their job may
   be a draft/direct row the losing side can no longer read, and a tap landing
   on a permission error is worse than no tap. Smallest, safest, reversible —
   one line in `isOfferJobOpenable()`.
2. **The `Message <name>` button was removed from the counteroffer card in
   commit 1, not commit 2.** Fix D names "no Message button" as part of the
   card format, and the card is rebuilt in commit 1. The other pre-hire
   Message CTAs move with the messaging lock in commit 2.
3. **Three existing test assertions were rewritten, not deleted.** They
   asserted the old per-screen markup (`<StatusBadge … label="Your move" />`,
   `{posterFirstName} sent you a Counteroffer`, `Accept for`,
   `Decline counter-offer`, the cap sentence) directly in
   `screens/JobDetailScreen.tsx` / `components/OfferCard.tsx`. Each now asserts
   the same guarantee at its new single location and additionally forbids the
   superseded label from returning. No guarantee was weakened.
4. **The offer's job embed was widened** (`budget_min_cents`,
   `budget_max_cents`, `scheduled_date`, `arrival_start_hour`,
   `arrival_end_hour`). Fix B asks the card to show the job information
   "already present in the system"; the narrower embed silently dropped the
   budget range and arrival window from both the card and the screen it hands
   the row to. Additive projection change only — no new table, no policy
   change.
