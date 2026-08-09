# ARCHITECTURE DECISION — the unified `job_offers` model

**Phase:** 3A + 3B (Data foundation)
**Date:** 2026-08-08 (§11 corrected twice the same day — see its notes)
**Status:** phase43–47 APPLIED and verified live; phase48 written, not applied
**Files:** `supabase/phase43_job_offers_foundation.sql`,
`supabase/phase44_backfill_bids_to_job_offers.sql`,
`supabase/phase45_job_requests_to_job_offers.sql`,
`supabase/phase46_offer_rpcs_and_rls.sql`,
`supabase/phase47_bids_projection_trigger.sql`,
`supabase/phase48_bids_drift_view_rewrite.sql`

---

## 1. Why unify

`bids` and `job_requests` were separated on purpose. phase18's header states
the reason plainly: bids answer a *public* open job that many workers compete
for, while a hire request is a *private* two-party negotiation with an
alternating turn and a per-side counter budget, and overloading `bids` would
have meant bolting turn-tracking onto a table whose RLS, uniqueness and accept
path were all built around competition.

That argument was correct for phase18 and is now obsolete, for three reasons
that all arrived after it:

1. **Both are now negotiations.** phase18's own counter mechanism made the
   "private" side a turn-taking negotiation. The V2 plan (§H.2) makes the
   public side one too — a customer may counter a bid. The single structural
   difference that justified two tables — one has counters, the other does not
   — no longer exists.
2. **They already converged on the same acceptance semantics.** `accept_bid()`
   and `respond_job_request(accept)` both end with: stamp the job, set
   `assigned_worker_id`, settle the losing rows. §H.2 specifies one
   `accept_offer()` doing exactly that for both.
3. **The duplication is now load-bearing in the wrong direction.** phase33
   exists solely because `job_requests.category` did not follow a change to
   `job_category`. `job_requests` carries a full copy of the job fields
   (title, description, category, location, photos, videos, lat, lng) that
   must be kept in sync with `jobs` by hand, and phase33 is proof that this
   drifts in production and produces user-visible failures.

Two tables also means every downstream surface — inbox badges, notification
routing, My Jobs, the offer UI — is written twice, which is precisely the
"66 one-off screens" problem the V2 plan exists to end.

**Decision: one table, `job_offers`.** `job_requests` is retired in Phase 3B.
`bids` is retired in Phase 3B.

---

## 2. Shape: `offer_type` + `parent_offer_id`, and no `kind = 'counter'`

§G's sketch had `kind (bid | direct_offer | counter)`. That is rejected: it
makes "counter" a sibling of the two origin types, so `kind` answers two
unrelated questions at once and can contradict itself (a row could claim
`kind='counter'` while having no parent, or `kind='bid'` while having one).

Instead:

| Column | Meaning |
|---|---|
| `offer_type` | How the negotiation *started*: `marketplace_bid` or `direct_offer`. Set once on the root, inherited unchanged by every counter. |
| `parent_offer_id` | Null on a root; the offer this one answers otherwise. **A counter is identified by having a parent** — structurally, not by a type value. |
| `root_offer_id` | The chain's first offer. Equals `id` on a root. |

`job_offers_root_shape` enforces `(parent_offer_id is null) = (root_offer_id =
id)`, so "root" has exactly one definition and nothing can disagree with it.

### Inheritance is enforced by the schema, not by code

A composite unique constraint plus a composite self-referencing foreign key:

```sql
unique (id, job_id, offer_type, customer_id, worker_id, root_offer_id)

foreign key (parent_offer_id, job_id, offer_type, customer_id, worker_id, root_offer_id)
  references job_offers (id, job_id, offer_type, customer_id, worker_id, root_offer_id)
```

Because `id` is unique, the only row a child can match is its own parent — so
the child's `job_id`, `offer_type`, `customer_id`, `worker_id` and
`root_offer_id` are *forced* to equal its parent's. This holds transitively at
any chain depth, with no trigger, no `security definer` helper and no
application code. `MATCH SIMPLE` (the default) skips the whole constraint when
any referencing column is null, and `parent_offer_id` is the only nullable one
— so a root, and only a root, is exempt. That is exactly the intent.

"`offer_type` never changes within a chain" is therefore a schema guarantee.

---

## 3. Participant identity, and why no separate chain table

Every row — root and counter — carries `customer_id` and `worker_id`, set once
at chain creation and inherited by the FK above. Two further columns are
deliberately *not* identity:

- `author_id` — who wrote **this** revision. Alternates down the chain.
- `awaiting_id` — whose move is **next**. Null once settled.

`job_offers_author_is_party` and `job_offers_awaiting_is_party` constrain both
to be one of the two participants, so neither can drift to a third party.

**A separate negotiation-chain table was considered and rejected.** The brief
asked for concrete evidence before introducing one. There is none: the only
thing such a table would hold is `(job_id, offer_type, customer_id, worker_id)`
— exactly the tuple the composite FK already replicates and pins. A chain table
would add a join to every read and a second write path to every negotiation
action, in exchange for a guarantee the FK already provides. The uniqueness
rules below are likewise expressible as partial indexes on `job_offers` itself.

### Uniqueness

```sql
unique (job_id, worker_id)              where offer_type='marketplace_bid' and status='pending'
unique (job_id, customer_id, worker_id) where offer_type='direct_offer'    and status='pending'
unique (customer_id, worker_id)         where offer_type='direct_offer'    and status='pending'
```

A chain has at most one `pending` row at a time (a counter supersedes its
parent, per §H.2), so "one pending row per pair per job" and "one live chain
per pair per job" are the same statement.

The third index is not new policy — it carries forward phase18's
`job_requests_one_open_per_pair`, which caps a customer at one open direct
negotiation with a given worker *across all jobs*. The per-job index is weaker
than that, so without it phase45 would have silently repealed an existing
anti-spam rule. Preserved rather than re-litigated; Phase 3B may revisit it
deliberately.

### Verification against the required sequence

> worker bids → customer counters → worker counters again → the worker must not
> be able to open a second root bid while that chain is live.

| Step | Rows for `(job J, worker W)` | Pending rows |
|---|---|---|
| Worker bids | `R` pending | 1 |
| Customer counters | `R` superseded, `C1` pending | 1 |
| Worker counters again | `C1` superseded, `C2` pending | 1 |
| Worker opens a second root bid | would insert a 2nd pending row for `(J, W)` | **2 → unique violation** |

Also blocked structurally: `C1`/`C2` cannot change `job_id`, `offer_type`,
`customer_id` or `worker_id` (composite FK), and `C2`'s `root_offer_id` is
forced to `R`, not `C1` — so a chain cannot fork into a second chain either.

---

## 4. THE PRODUCT DECISION: one bid ever vs. one active chain

**Today:** `bids` carries an *unconditional* `unique (job_id, worker_id)`. A
worker gets one bid per job, **ever** — after rejection they can never bid on
that job again.

**This cannot survive unchanged**, because a counter chain needs several rows
per `(job, worker)` by construction. The question was never whether to change
it, only how far.

**Decision: one ACTIVE chain at a time.** A worker whose offer was `declined`,
`withdrawn` or `expired` may open a new chain on the same job.

**Reasoning.** §H.2 introduces `withdrawn` and `expired`, neither of which
exists as a code path today (the live enum has `withdrawn`; **zero rows carry
it** and nothing sets it). Under a one-chain-ever rule both would become traps:
a worker who withdrew a typo'd bid, or whose offer simply timed out, would be
permanently barred from a job they are still eligible for — and Phase 5 is
specifically chartered to build withdraw and expiry. Choosing "one chain ever"
would mean shipping two new states whose main effect is to punish the user.

**This is a deliberate loosening of live behaviour and needs sign-off.** It is
also trivially reversible: append `and parent_offer_id is null` to
`job_offers_one_live_bid_per_worker` and the old semantics return exactly (one
*root* per `(job, worker)` forever, counters still permitted). That one-line
alternative is recorded in the migration itself.

Rejected middle ground: "new chain allowed after withdrawn/expired but not
after declined." It encodes the same rule in a form nobody can read off the
index definition, and a constraint that cannot be explained in a sentence will
be violated by the next person who touches it.

---

## 5. Status mapping

`offer_status` is §H.2 verbatim: `pending | accepted | declined | withdrawn |
expired | superseded`.

| Source | Value | → `offer_status` | Note |
|---|---|---|---|
| `bids` | `pending` | `pending` | |
| `bids` | `accepted` | `accepted` | |
| `bids` | `rejected` | `declined` | Same event, canonical vocabulary. |
| `bids` | `withdrawn` | `withdrawn` | Zero live rows; mapped anyway so the migration stays total. |
| `job_requests` | `pending` | `pending` | |
| `job_requests` | `countered` | `pending` on the newest revision, `superseded` on its ancestors | `countered` means "still open, awaiting the other side" — `isOpenRequest()` treats it as live. |
| `job_requests` | `accepted` | `accepted` | |
| `job_requests` | `declined` | `declined` | |
| `job_requests` | `closed` | *(not migrated — see §6)* | |

Both backfills assert the mapping is **total against the values actually
present** and abort if they meet one they do not recognise, so an enum value
added after these files were written stops the migration instead of silently
dropping rows.

---

## 6. Requirement 3 — the synthetic draft-job check

> Before materializing any live `pending`/`countered` job_request into a
> draft/direct `jobs` + `job_locations` row, verify every required (NOT NULL,
> no default) field can be deterministically populated. If any cannot be mapped
> without guessing, STOP.

### Result: STRUCTURAL **PASS** · ROW-LEVEL **NOT COMPLETED** → phase45 **HELD**

**Structural — PASS.** Every column `jobs` requires is derivable 1:1, and this
is not an inference: `respond_job_request()` already performs this exact insert
in production on every accept. Its column list is therefore a live proof that
the set is sufficient.

| `jobs` column | Source | Notes |
|---|---|---|
| `client_id` | `job_requests.client_id` | NOT NULL both sides |
| `title` | `title` | NOT NULL |
| `description` | `description` | NOT NULL, default `''` |
| `category` | `category::job_category` | phase33 made the CHECK mirror the enum exactly |
| `location` | `location` | nullable both sides |
| `budget_cents` | `amount_cents` | NOT NULL, CHECK > 0 |
| `photos` / `videos` | `photos` / `videos` | NOT NULL, default `'[]'` |
| `status` | **defined by the migration** | see below |
| `visibility` | `'direct'` constant | column introduced by phase43 |

| `job_locations` column | Source | Notes |
|---|---|---|
| `job_id` | the new job | |
| `lat` / `lng` | `lat` / `lng` | Both NOT NULL here, both nullable there → the row is written **only when both are present**, the same condition `respond_job_request()` applies. A half-populated pair is skipped, never defaulted. |

The single field with no source is `jobs.status` — and that is a schema
decision, not a data guess. A job carrying a live unaccepted offer is neither
`open` (that publishes a private negotiation) nor `assigned` (that claims a
hire which has not happened). §H.1 already names the state: `draft`. The value
comes from the plan; phase45 adds it to the `job_status` enum.

**Row-level — NOT COMPLETED.** Whether the *live rows* satisfy the mapping
cannot be checked from this repository: `.env` holds only the publishable
(anon) key, `job_requests` is RLS-restricted to its two parties, and
`information_schema` is unreachable through PostgREST with that key. Per the
brief, the migration that performs the materialization is therefore **not
finalized**: it is named `.DRAFT.sql` and its first statement refuses to run
without an explicit session-level acknowledgement.

Run this in the Supabase SQL Editor and read the result:

```sql
-- Requirement 3 · live-row check for phase45.
-- Every count must be 0 except `live_total` and `accepted_total`.
select
  count(*) filter (where status in ('pending','countered'))                      as live_total,
  count(*) filter (where status = 'accepted')                                    as accepted_total,
  count(*) filter (where status in ('declined','closed'))                        as not_migrated_total,
  -- Hard stops:
  count(*) filter (where status = 'accepted' and created_job_id is null)         as accepted_without_job,
  count(*) filter (where client_id = worker_id)                                  as self_negotiation,
  count(*) filter (where amount_cents <= 0)                                      as nonpositive_amount,
  count(*) filter (where btrim(coalesce(title,'')) = '')                         as empty_title,
  count(*) filter (where category is null)                                       as null_category,
  count(*) filter (where (lat is null) <> (lng is null))                         as half_coordinates,
  count(*) filter (where status not in
    ('pending','countered','accepted','declined','closed'))                      as unmapped_status
from public.job_requests;

-- Chain-reconstruction fidelity for the LIVE rows only.
-- Both counts must be 0, or phase45 would reset a counter cap mid-negotiation.
select
  count(*) filter (where created_events <> 1)                                    as bad_root_count,
  count(*) filter (where client_events <> client_counters
                      or worker_events <> worker_counters)                       as counter_mismatch
from (
  select r.id, r.client_counters, r.worker_counters,
    (select count(*) from public.messages m
      where m.job_request_id = r.id and m.request_event = 'created')             as created_events,
    (select count(*) from public.messages m
      where m.job_request_id = r.id and m.request_event = 'countered'
        and m.sender_id = r.client_id)                                           as client_events,
    (select count(*) from public.messages m
      where m.job_request_id = r.id and m.request_event = 'countered'
        and m.sender_id = r.worker_id)                                           as worker_events
  from public.job_requests r
  where r.status in ('pending','countered')
) s;
```

phase45 re-asserts every one of these itself and rolls back on any violation,
so the query is a preview of what it will do, not a substitute for it.

### A second, independent reason phase45 is held

`lib/jobs.ts`'s `fetchJobsByClient()` selects a client's jobs with **no status
filter**. The moment phase45 runs, every customer with a live outgoing offer
gains a phantom My Jobs entry that no screen explains. phase45 must be
sequenced *after* Phase 3B ships the surfaces that render a draft job, or after
`fetchJobsByClient()` learns to exclude them. This is recorded in the file's
header as Gate 2.

### Declined and closed requests are not migrated

They have no job row and never will, and `job_offers.job_id` is NOT NULL, so
migrating them would mean fabricating a job for a negotiation that never
produced one. Their history remains in `messages`, which is the historical log
by design.

**RESOLVED in Phase 3B (final, not a gap):** legacy dead `job_requests` stay
unmigrated and `job_offers.job_id` stays NOT NULL — but this is a statement
about *legacy* rows only, not a rule about terminal offers. Going forward
`job_offers` retains its own terminal rows normally (`accepted`, `declined`,
`withdrawn`, `expired`, `superseded`), because each of those belongs to a real
draft or public job and is structured negotiation history by design. The
asymmetry exists solely because pre-unification dead requests have no job to
attach to, and inventing one would be fabricating marketplace data.

---

## 7. `job_private_details` — satisfied by extending `job_locations`

§G asks for a 1:1 table holding exact address, geo point and access notes,
readable by the job owner always and the hired worker after acceptance.

`job_locations` (phase12) **is** that table for the geo point, with exactly
that RLS (`job_locations_select_party`), never added to the realtime
publication, and with all client INSERT/UPDATE/DELETE already revoked by
phase29. `BRAZOS_BUILD_STATE.md`'s Phase 3 entry says to extend it, not rebuild
it.

phase43 therefore adds `address_line` and `access_notes` to it and updates its
table comment to name it as the §G table. Creating a second private-details
table would leave two 1:1 privacy tables hanging off the same job; renaming
this one would break phase12/18/29/36/41 and three live RPCs that reference it
by name. **No policy change was needed** — the existing one is already §G's
rule.

---

## 8. `notification_prefs` — the explicit rule

`notification_prefs.bids` and `.hire_requests` are two independently-set user
toggles and are **not** merged.

**Rule: route by `offer_type`.**

| Offer | Pref consulted |
|---|---|
| `offer_type = 'marketplace_bid'` (root or counter) | `notification_prefs.bids` |
| `offer_type = 'direct_offer'` (root or counter) | `notification_prefs.hire_requests` |

Because `offer_type` is fixed for a whole chain (§2), every event in a
negotiation routes to the same toggle — a customer who muted bids does not
start hearing about them because a bid got countered. This preserves both
toggles' current meaning exactly and needs no data migration.

Rejected: `new = bids OR hire_requests`, which would start sending direct-offer
notifications to anyone who enabled bids, i.e. silently opt users into a
category they never chose.

**Not implemented in Phase 3A.** `should_notify()` and `notify_on_*` are
untouched; Phase 12 owns notifications. This records the rule so it is not
re-decided later.

---

## 9. Deferred to Phase 3B — with reasons

**`jobs.accepted_bid_id` is NOT renamed to `accepted_offer_id`.** The brief
asked for the rename. It conflicts directly with the Phase 3A guardrail "do not
modify lifecycle RPC bodies": `accept_bid()` (phase29/30) and
`lib/acceptBidCompatibility.ts` both *write* that column, so renaming it breaks
the accept path the moment the migration is applied, and repairing it means
editing a lifecycle RPC. **Resolution:** phase43 *adds* `accepted_offer_id` as a
new nullable FK → `job_offers(id)` and leaves `accepted_bid_id` in place and
authoritative. Both are kept consistent by phase44/phase45. Phase 3B flips the
writers and drops the old column in one step. The stated purpose of the rename —
that no PostgREST embed silently resolves the wrong relationship — is met
another way: every new FK in phase43 is explicitly named, and `job_offers` has
no ambiguous pair.

**`bids_job_id_fkey` is NOT renamed.** `lib/bids.ts` names it directly in two
embed hints (`jobs!bids_job_id_fkey`, and `bids!bids_job_id_fkey(count)` in
`lib/jobs.ts`). Renaming it breaks those queries at runtime the instant the
migration lands, and Phase 3A ships no client change. It is renamed or dropped
in Phase 3B alongside the callers.

**`lib/acceptBidCompatibility.ts` is NOT deleted.** It is *not* dead code:
`lib/bids.ts:2` imports it, `lib/bids.ts:196` calls it on `PGRST202`, and
`tests/hardening.test.mjs:86,91` asserts both. Deleting it would change
behaviour and fail a test. It is marked in-file for **mandatory removal in
Phase 3B**, when `accept_bid()` is replaced by `accept_offer()` and the fallback
has nothing left to fall back to. (It also carries a known non-atomic TOCTOU
race — see BUILD_STATE Known issues — which is a second reason it should not
outlive its purpose.)

**RLS for `job_offers`.** phase43 enables RLS with **zero policies** and revokes
every grant, which denies all client access. That is the correct state for a
table no shipped code reads. Phase 3B writes the policies (job owner + offer
author + targeted worker) as part of the RLS baseline.

**A missing policy Phase 3B must add:** the *targeted worker* of a direct job
cannot read that job before acceptance. `jobs_select_assigned_worker` needs
`assigned_worker_id`, which a live direct offer has not set. Without a new
policy, a worker will not be able to see the job an offer refers to.

**The duplicate `public`/`authenticated` RLS policies on `bids`** (`workers view
own bids` ≈ `bids_select_own`, `job owner views bids on their job` ≈
`bids_select_job_owner`) are informational only, per the brief. Not touched.
Phase 3B's RLS consolidation should remove the `public`-role pair — they are
strictly weaker (no `is_profile_active(worker_id)` term) and, being permissive,
they OR with the stricter pair, which means the stricter one currently adds
nothing.

**Generated database types.** Not produced. `supabase gen types` needs the
Supabase CLI plus either a local Postgres (Docker) or a service-role
connection; the CLI is not installed, there is no `supabase/config.toml` (this
repo runs hand-applied SQL by design, with no CLI migration directory), and
adding either is a new dependency that the standing rule says to flag first.
**No TypeScript was hand-written to compensate** — nothing in Phase 3A needs to
compile against the new schema, so hand-authoring `OfferStatus`/`OfferType`
unions now would create a second source of truth that the real generated types
would immediately contradict. Authoritative regeneration is deferred to
immediately after the Phase 3 migrations are applied remotely, which is also
when `StatusPill`'s local unions get retargeted (Phase 1 shipped them as local
types precisely so that swap is mechanical).

---

## 10. RLS on `job_offers` (Phase 3B — locked)

```sql
create policy "job_offers_select_party"
  on public.job_offers for select
  to authenticated
  using (customer_id = auth.uid() or worker_id = auth.uid());

grant select on public.job_offers to authenticated;
revoke insert, update, delete on public.job_offers from public, anon, authenticated;
```

**One predicate, two behaviours.** `customer_id` is the job's owner, so a job
owner matches every offer on their job — that is what makes the compare-offers
surface work — while a competing worker matches only on `worker_id` and sees
exclusively their own chain. There is no second policy to keep in sync.

**`customer_id` on marketplace bids — confirmed.** It is populated on bid rows
too, and always equals the job's `client_id`: phase43 declares it `NOT NULL`
and pins it constant down a chain via the composite inheritance FK, phase44
sourced it from `jobs.client_id` for all 25 migrated bids, and phase46's
`create_offer()` sets it from the locked job row. Phase 3A flagged that nothing
*enforced* the equality, leaving the policy resting on RPC discipline; phase46
closes that with `job_offers_customer_owns_job_fkey`, so it is now a schema
guarantee. No stop condition was hit.

**No write policies at all.** Every mutation goes through
`create_offer` / `counter_offer` / `decline_offer` / `accept_offer`, each of
which validates `auth.uid()`, validates participant/owner authorization,
validates the lifecycle state before acting, takes row locks, sets an explicit
`search_path`, and carries an explicit `grant execute … to authenticated`
(phase32 revoked the default). There is no client-side fallback path anywhere —
`lib/acceptBidCompatibility.ts` was deleted with this phase.

**Aggregate counts deliberately bypass RLS.** `job_offer_count` /
`job_offer_counts` are `security definer` for the reason phase15 recorded: RLS
would silently under-count for a browsing worker, and a bare integer exposes no
amount, message or identity.

**Lock order is `jobs` then `job_offers`, everywhere.** `accept_offer` updates
every sibling offer on a job, so two concurrent accepts holding one offer row
each would reach for the other's and deadlock. Serialising on the job row first
makes that impossible, and it matches what `accept_bid()` already did.
`counter_offer` follows the same order because it writes `jobs.budget_cents`.

---

## 11. Deprecation — the six legacy shims

phase46 keeps `create_bid`, `accept_bid`, `create_job_request`,
`respond_job_request`, `job_bid_count` and `job_bid_counts` alive under their
exact original names, parameter lists and return types, with bodies that
operate on `job_offers`. BRAZOS ships as an installed Expo binary; dropping
them would break bidding and hiring on every phone that has not updated.

**These are temporary. They are removed in the first phase that ships a version
gate** — Expo update-gating or a store-side forced update — which is Phase 3C
or later. That is the trigger: *the next phase that can enforce a minimum app
version*, not a date, and not "eventually". They must not become a permanent
second implementation, and they cannot drift into one: every shim delegates and
none contains negotiation logic of its own.

Removing them is a deliberate, self-contained task: drop the six functions, the
projection trigger, `project_offer_chain_to_bids()`,
`v_bids_projection_drift`, and update the phase18/29/30/36/38 groups in
`scripts/verify-schema.mjs`, which currently require the shims to exist and are
what would otherwise turn red.

**A note on the drift view, because it cost two attempts.** phase47's version
expected one mirror row per CHAIN; the projection keeps one per
`(job_id, worker_id)`, because `bids` still carries phase1's unconditional
unique on that pair. A settled chain that lost its row to a later chain is not
drift. The first correction — "only the newest chain is expected to be
mirrored", ordered by `created_at` — was also wrong: two chains created in one
transaction share an identical `now()`, there is no sequence on `job_offers`,
and `id` is random, so **"newest chain" is not determinable from this schema**.
phase48 therefore checks what is exact: a row must match ITS OWN chain
(`stale`), a `pending` chain must have a row (`missing_live`), and a row with
no chain is reported but not repairable (`orphan`).

**How `bids` is kept current — a projection, not a mirror.**

A function shim cannot cover a table SELECT, and old builds read `bids`
directly. phase46 handled that by writing to `bids` from inside `create_bid()`
and `accept_bid()`. **That was wrong and is superseded by phase47.** Those two
functions are only two of the six paths that mutate `job_offers`; a current
build calls `create_offer`, `counter_offer`, `decline_offer` and
`accept_offer` directly, so in a mixed fleet the mirror was stale as soon as
anyone updated — a new-build bid was invisible to an old-build customer, a
countered chain still showed `pending` at the original price, an accepted job
still showed an open bid list, and a second chain's row was silently dropped by
`on conflict do nothing` colliding with phase1's unconditional
`unique (job_id, worker_id)`. All of it read as authoritative, which made it
worse than no mirror at all.

phase47 replaces it with one `AFTER INSERT OR UPDATE` trigger on
`job_offers`:

- keyed on `root_offer_id`, so the legacy row's id is stable for the whole
  negotiation and an old client that captured a bid id keeps resolving it;
- `marketplace_bid` only — direct offers never wrote to `bids` and must not
  start, since everything in that table is assumed to be public competition;
- amount and status come from the chain's **leaf** (the row nothing claims as a
  parent), never from the row that fired the trigger and never from a
  `created_at` sort — `counter_offer()` supersedes the parent and inserts the
  child in one transaction, so both carry an identical `now()` and a timestamp
  ordering has no deterministic answer;
- status maps `declined|expired|superseded → rejected`, `withdrawn → withdrawn`,
  `accepted → accepted`, `pending → pending`. `superseded` only reaches the leaf
  when a *different* chain won the job, which in legacy vocabulary is exactly
  "rejected"; within a chain a superseded row always has a child;
- delete-then-upsert, so a settled chain's row can never block a new chain's
  insert on that unconditional unique index.

**It cannot drift**, because there is no way to change `job_offers` without it
running. Confirmed empirically on 2026-08-08 by a SQL harness that drove the
shims through bid, rival bid, counter, accept, decline and reopen — every
behavioural assertion passed, including "zero new bid pushes per counter or
accept". **No recursion**, by enumeration: it writes `bids`; the only trigger on
`bids` is phase20's `bids_notify`, which writes `notification_outbox`; nothing
is triggered on `notification_outbox`; nothing anywhere writes back to
`job_offers`.

It also restores a notification phase46 had silently lost: `notify_on_bid()` is
an AFTER INSERT trigger on `bids`, so a bid placed on a new build produced no
row and therefore no "new bid" push. phase47's repair pass disables that trigger
while reprojecting historical chains, so the backfill cannot emit pushes for
bids placed days ago.

Direction is unchanged and still strict: `job_offers → bids`, one-way, never
read back. `lib/offers.ts` never references `bids`, and phase29 revoked
`insert, update` on it from every client role with no DELETE policy, so no
client can write it under any circumstance.

**`job_requests` gets no projection.** 0 live rows, 0 accepted, 1 dead legacy row
(measured 2026-08-08). There is no user to protect, and mirroring a mutating
single-row negotiation would mean re-implementing phase18's counter
bookkeeping. An old build can still send a direct offer but will not render the
negotiation card — a documented degradation with zero production impact.

---

## 12. Application order

| # | File | State | Notes |
|---|---|---|---|
| 1 | `phase43_job_offers_foundation.sql` | **APPLIED** 2026-08-08 | Structure only. Verified by a green `verify-schema` run, not a SQL Editor message. |
| 2 | `phase44_backfill_bids_to_job_offers.sql` | **APPLIED** 2026-08-08 | 25/25 bids migrated, 24/24 accepted links set. |
| 3 | `phase45_job_requests_to_job_offers.sql` | **APPLIED** 2026-08-08 | Gates cleared (§6). Applied before phase46, as required. |
| 4 | `phase46_offer_rpcs_and_rls.sql` | **APPLIED** 2026-08-08 | RPCs, RLS, shims, composite FK. All ten verifier checks flipped to OK. |
| 5 | `phase47_bids_projection_trigger.sql` | **APPLIED** 2026-08-08 | Trigger-driven projection replacing phase46's mirror. Both verifier checks OK. |
| 6 | `phase48_bids_drift_view_rewrite.sql` | **final, not applied** | Rewrites the drift view on correctness + coverage. The projection itself was correct; the view was not. |

**Why 45 before 46, and not the other way round.** The default instinct is to
put RPCs and RLS in place before data lands. Checked against the real
dependency, the order is forced the other way: phase45 adds the `draft` value
to the `job_status` enum and commits it, and phase46's `accept_offer()`
references that value. Postgres refuses to use an enum value whose adding
transaction has not committed, so phase46 cannot even be created first — its
section 1 raises a clear error if the value is missing rather than failing
obscurely later.

The usual argument for RPCs-first does not apply here anyway: with
`live_total = 0` and `accepted_total = 0`, phase45 migrates no rows and
materializes no draft jobs on today's data. There is no window in which
unreadable data sits waiting for a policy.

**phase47 exists for a reason that was not visible when phase46 was written.**
The original plan said everything fit in phase46, and structurally it did. What
phase47 fixes is a defect found by review AFTER phase46 was applied (§11): the
`bids` compatibility mirror was written from two call sites and therefore
drifted on four of the six paths that mutate `job_offers`. phase46 is not
edited — it is applied and is now historical record, the same rule phase43/44
follow — so the trigger, the superseded shim bodies and the drift repair ship
as a new numbered migration.

Nothing in 1 or 2 changed what the app does. phase46 is the cutover.
