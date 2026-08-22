# DIAG — Inbox & Routes (read-only diagnostic)

Date: 2026-08-12 · Branch: `stability-core-transactions` (clean tree) · Target: staging (zzkumxcjtbqoselzptig) only.
No code changed, no DB rows touched, no migrations applied. Live staging catalogs were **not reachable**
from this session (no `SUPABASE_DB_URL_STAGING` in any env store, no supabase CLI/token, no pgpass;
psql 16 is installed but has no credential) — items relying on live state are labeled **INFERRED** with the
migration-file evidence used instead.

---

## A1 — Route registry

**Referenced-but-unregistered routes: NONE.** Every route-name string dispatched anywhere in
`screens/`, `components/`, `hooks/`, `lib/`, `navigation/`, `App.tsx` resolves to a registered
`<X.Screen>`; all five tab names resolve too.

**`WorkerResults` is NOT among them.** It is registered at `navigation/WorkerRoot.tsx:45`
(typed at `lib/navigation.ts:180`); its four dispatch sites — `screens/BrowseJobsScreen.tsx:189, :193,
:334, :371` — are all inside the same `WorkerHomeStack` whose root is `BrowseJobs`. Worker mode only.
The historical device crash ("do you have a screen named 'WorkerResults'?") is recorded and now
asserted closed by `tests/crossTabNavigation.test.mjs:16-46`. Registration line re-verified directly.

**Navigator structure: separate per-mode trees**, swapped at `navigation/ModeShell.tsx:49`
(`mode === 'worker' ? <WorkerRoot/> : <CustomerRoot/>`), one shared `NavigationContainer`
(`App.tsx:163`). Map/MyJobs/Messages/Profile tabs are the *same* stack components
(`navigation/sharedStacks.tsx`) mounted in both trees; only the Home tab differs
(`CustomerHomeStack`, `CustomerRoot.tsx:40-47` vs `WorkerHomeStack`, `WorkerRoot.tsx:43-61`).

**Registered-in-one-tree-but-callable-from-the-other** (the failure class that mimics an
unregistered route) — three sites, none currently a live defect:

1. `screens/MapScreen.tsx:62` → `navigateAcrossTabs('Home','BrowseJobs')`. `BrowseJobs` exists only in
   `WorkerHomeStack` (`WorkerRoot.tsx:44`); MapScreen mounts in **both** modes. In customer mode the
   target is absent — but the control renders only when `mode === 'worker'` (`MapScreen.tsx:59`) and the
   `canNavigateTo` guard (`lib/navigationRef.ts:122`) turns a miss into a logged drop, not a crash.
2. `screens/PostJobScreen.tsx:495-500` → `('Home','HomeMain')`. `HomeMain` exists only in
   `CustomerHomeStack` (`CustomerRoot.tsx:41`). In worker mode `fallbackToTabRoot: true`
   (`PostJobScreen.tsx:499`; `lib/navigationRef.ts:141-144`) lands on the worker Home root by design.
3. `screens/HomeScreen.tsx:162` → `getParent()?.navigate('Map')` — tab-level parent hop, resolves
   (`CustomerRoot.tsx:60`); customer-only screen; allowlisted at `tests/crossTabNavigation.test.mjs:257-259`.

Dev-only asymmetry (not production-reachable): `ComponentCatalog` typed unconditionally
(`lib/navigation.ts:355`) but registered only under `__DEV__` (`sharedStacks.tsx:156-158`); its sole call
site is also `__DEV__`-gated (`ProfileScreen.tsx:662-665`).

---

## A2 — Inbox subtitle

**Verdict: present in the data, dropped in the render path.** The other two are ruled out:

- **Not missing from the select** — the inbox reads `select('*')` from the `public.conversations` view
  (`lib/conversations.ts:68-72`); the view's job branch selects `j.title as job_title`
  (`supabase/phase36_direct_offer_threads.sql:616`; last redefinition of the view — nothing after
  phase36 touches it). Typed at `lib/conversations.ts:12`.
- **Not null in the returned data (job rows)** — client INSERT on `jobs` is revoked
  (`phase29_security_hardening.sql:297-299`); the only insert path, `create_job`, enforces a
  non-blank, btrimmed title of 1–80 chars (`phase29_security_hardening.sql:342-344`). Direct-thread
  rows carry `job_title` null **by construction** (`phase36:640`) and the render fallback covers them
  (`'Direct messages'`, `MessagesInboxScreen.tsx:173`). *Caveat (unverifiable without data access):
  rows predating phase29 or seeded outside `create_job`; the `jobs` table's CREATE TABLE predates the
  repo's migration files, so a column-level NOT NULL cannot be confirmed statically.*
- **Confirmed render-path drops** (each cited):
  - `screens/MessagesInboxScreen.tsx:167-173` — `job_title` renders **only when the counterparty has
    exactly one conversation**; with ≥2 threads, every row of that counterparty shows
    `"N conversations together"` instead (:169-170).
  - `components/ConversationRow.tsx:77-86` — a row flagged `awaitingRequest` replaces the subtitle
    entirely with the "Job request · needs your reply" pill.
  - `MessagesInboxScreen.tsx:167-168` — `isSelf` rows get subtitle `null`, and `ConversationRow.tsx:82-86`
    then renders **nothing** in the slot. This (or an empty-string title, excluded above for app-created
    jobs) is the only path where the line is literally blank.

**Customer vs worker inbox: same root cause, structurally guaranteed.** There is exactly one inbox
implementation — `MessagesInboxScreen`, registered once in the shared `MessagesStack`
(`navigation/sharedStacks.tsx:107`), and that same stack component is mounted in both trees
(`CustomerRoot.tsx:67`, `WorkerRoot.tsx:78`). No per-mode inbox exists.

---

## A3 — Inbox grouping

1. **Source & grouping key.** List rows come from `fetchConversations()` — `select('*')` on the
   `public.conversations` view (`lib/conversations.ts:67-75`; view `phase36:611-658`, a UNION of job
   threads and direct threads, one row per thread, **no SQL grouping**). The badge overlay comes from
   `fetchMyPendingOffers()` → RPC `my_pending_offers()` (`lib/offers.ts:423-426`;
   `phase50_sandbox_payments_and_offer_lifecycle.sql:880-915`). Grouping is **client-side and never
   merges rows** — it only relabels: `MessagesInboxScreen.tsx:118-121` counts conversations per
   counterparty keyed by `resolveOtherId(c, user.id)` (counterparty profile uuid,
   `lib/conversations.ts:58-64`); `:169-170` swaps the subtitle of every such row to
   `"N conversations together"`. Row identity is `conversationKey(c)` (`lib/conversations.ts:47-49`).

2. **How the thread types differ in the key (actual columns).**
   - Bid-originated (job) thread: `job_id = <jobs.id>`, `direct_thread_id = null` → row key
     `job:<jobs.id>`; counterparty from `jobs.client_id` / `jobs.assigned_worker_id` (`phase36:614-618`).
   - Direct-offer thread: `job_id = null`, `direct_thread_id = <direct_threads.id>` → row key
     `direct:<id>`; counterparty from `direct_threads.user_a` / `user_b` (`phase36:638-642`).
   - Marketplace-bid chain: **no row at all** — a chain's thread identity is derived from its root
     thread message (`messages.job_offer_id = root_offer_id`, `phase50:903-910`) and marketplace chains
     deliberately never post one (`phase46_offer_rpcs_and_rls.sql:233-235`, §5), so `my_pending_offers()`
     returns `thread_job_id = null, direct_thread_id = null` for them.
   - The counterparty **count** key is the same uuid for both row types → both group; no inconsistency
     between the two row types themselves.

3. **What falls outside and why.** The marketplace-bid chain: it has no conversation row, so its
   pending state is grafted onto the pair's direct row via `pendingByCounterparty`
   (`MessagesInboxScreen.tsx:87-93, :149-150`), and that pill **suppresses the group subtitle** on the
   row it lands on (`ConversationRow.tsx:77-86`). **INFERRED device-state reconstruction:** the
   "grouped" row is a job thread labeled "2 conversations together" (it + the direct row = 2), and the
   "separate ungrouped row" is the pair's **direct-thread row wearing the bid chain's
   "Job request · needs your reply" pill** in place of the group label. Secondary suspect (only if the
   ungrouped row shows a plain subtitle, not the pill): `resolveOtherId`'s self-fallback when a job
   row's `assigned_worker_id` is null (`lib/conversations.ts:62-63`) — but that row would display your
   own name "(You)", contradicting "same counterparty". Confirming which needs the pair's staging rows
   (`conversations` + `job_offers`) or a screenshot of the two rows.

4. **Verdict: "STRUCTURALLY DIFFERENT RECORDS"** — the two row types are deliberately one shape
   (union view, `phase36:599-604`) with a consistent key; the thing that won't group is the
   marketplace-bid chain, which is not a conversation record at all and cannot share a key without a
   model change (giving marketplace chains a thread root). The field carrying the inconsistency:
   the chain's derived thread identity — `thread_job_id` / `direct_thread_id` (via
   `messages.job_offer_id`) — both NULL exactly and only for `offer_type = 'marketplace_bid'`.
   **P1-01's `direct:null` is the SAME underlying defect** (that null pair once keyed the badge as the
   literal string `direct:null`, matching no row — recorded at `MessagesInboxScreen.tsx:64-67`); this
   row-split is the same structural gap surfacing on the grouping surface.

5. **Sequencing** (verdict is not SAME SHAPE, so per the brief): truly unifying the third negotiation
   into the inbox is a **migration** (marketplace chains need a thread identity plus a view branch);
   merely stopping the badged row from looking ungrouped is a **client edit** in
   MessagesInboxScreen/ConversationRow.

---

## A4 — RLS recursion on `jobs` (source: migration files — **INFERRED**; live catalogs unreachable.
The observed 42P17 is consistent with, and corroborates, this reconstruction.)

**Policies on `jobs`** (end-state after phase1→59; RLS enabled `phase1:16`):

| Policy | Cmd | USING (WITH CHECK: none have one except as noted) | Defined |
| --- | --- | --- | --- |
| `jobs_select_open` | SELECT | `status='open' and visibility='open_market' and is_profile_active(client_id)` | phase43:518-525 |
| `jobs_select_own` | SELECT | `client_id = auth.uid()` | phase1:32-35 |
| `jobs_select_assigned_worker` | SELECT | `assigned_worker_id = auth.uid()` | phase1:39-42 |
| `jobs_select_offer_party` | SELECT | `exists(select 1 from job_offers o where o.job_id=jobs.id and o.worker_id=auth.uid())` | phase46:169-178 |
| `jobs_delete_own` | DELETE | `client_id=auth.uid() and status='open' and is_active_user() and not exists(select 1 from bids b where b.job_id=jobs.id) and not exists(select 1 from job_offers o where o.job_id=jobs.id)` | phase46:190-199 |

No INSERT/UPDATE policies — dropped and privileges revoked (`phase29:282-285, :297-299`); legacy
"jobs are viewable by authenticated users" dropped (`phase58:39`).

**Referenced tables, recursively:**
- `bids` (RLS `phase1:17`): `bids_select_own` (`phase1:73-76`, `worker_id=auth.uid()`);
  `bids_select_job_owner` (`phase29:264-275`):
  `exists(select 1 from jobs j where j.id=bids.job_id and j.client_id=auth.uid()) and is_profile_active(worker_id)`
  ← **references `jobs`**. No insert/update/delete policies (`phase29:301-306`).
- `job_offers` (RLS `phase43:294`): `job_offers_select_party` (`phase46:143-146`):
  `customer_id=auth.uid() or worker_id=auth.uid()` — references nothing. **Graph closes here.**
- `profiles`: reached only through `is_active_user()` / `is_profile_active()` — both
  **SECURITY DEFINER** (`phase29:23-35, :43-55`), so profiles' policies never enter the expansion.

**The cycle (direction of dependency):**

```
jobs_delete_own  (DELETE on jobs; phase46:197 term `not exists (select 1 from public.bids …)`)
    → bids  (planner attaches bids' SELECT policies to the subquery)
        → bids_select_job_owner  (phase29:268-273 term `exists (select 1 from public.jobs …)`)
            → jobs  ⟲  (already mid-expansion → 42P17 "infinite recursion … relation jobs")
```

- **Clause creating the self-reference:** `not exists (select 1 from public.bids b where b.job_id = jobs.id)`
  in `jobs_delete_own` (`phase46:197`) — the only `jobs` clause touching a table whose own policy points
  back at `jobs`. The `job_offers` term (`phase46:198`) is **not** in the cycle (`job_offers_select_party`
  is terminal).
- **Runtime path:** `lib/jobs.ts:441-442` (`deleteJob` — direct `from('jobs').delete()`), called from
  `hooks/useJobOwnerActions.ts:108`, so the policy evaluates under the caller's RLS.
- **phase59:** read in full — contains only an AFTER INSERT trigger on `job_offers`
  (`notify_on_offer_counter`, `phase59:55-120`) and a sentinel function (`:128-137`). **Zero policy DDL —
  the cycle pre-exists phase59.** Both halves are old: the bids term has been in `jobs_delete_own` since
  `phase14:36-42` (kept verbatim in spirit by `phase29:286-296` and `phase46:190-199`), and
  `bids_select_job_owner` has referenced `jobs` since `phase1:80-89`.
- **Production exposure (INFERRED):** with phase58-and-below applied (phase59 stated as the only
  unapplied migration), production carries the same two policies → **the same DELETE-path failure exists
  on production today**; phase59's absence neither causes nor avoids it.
- **Commands affected:** **DELETE on `jobs` only.** SELECT is unaffected (all four SELECT policies are
  acyclic — none references `bids`; the `job_offers` hop terminates). INSERT/UPDATE are unaffected (no
  policies, privileges revoked; writes go through SECURITY DEFINER RPCs, which bypass RLS). Other
  tables' policies that subquery `jobs` (`bids_select_job_owner` on normal bid reads,
  `job_locations_*`, `messages_select_party`) expand only jobs' acyclic SELECT policies → unaffected.
  Nothing else is hitting users through this cycle today.
- **Out-of-band caveat:** a policy created or altered directly in the SQL editor outside the numbered
  files would not appear in this reconstruction (`DECISIONS.md:118` records this run applying SQL via
  psql from files; only `pg_policies` can prove the live end-state).
- **Fix (one line):** break the cycle — move `jobs_delete_own`'s `bids`/`job_offers` existence checks
  behind a SECURITY DEFINER boolean helper (or route deletion through a SECURITY DEFINER `delete_job()`
  RPC); do **not** widen `bids`' or `jobs`' read access.

---

## Unable to determine, and access required

1. **Live policy catalog / view definition on staging** (`pg_policies`, `pg_get_viewdef`) — needs
   `SUPABASE_DB_URL_STAGING` (or any staging psql credential / supabase CLI access token) in the session
   environment; psql 16 is installed, only the credential is missing. Would upgrade A4 from INFERRED to
   CONFIRMED and empirically confirm the staging `conversations` view matches phase36.
2. **Which A3 reconstruction is real** — needs a screenshot of the two rows (does the "ungrouped" row
   show the request pill?) or read access to the tester pair's `conversations` + `job_offers` rows.
3. **`jobs.title` column-level nullability** (A2 completeness; the app path is already provably
   non-blank) — `information_schema.columns` on staging, same credential as (1).
