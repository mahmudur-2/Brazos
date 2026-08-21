# 08 — Security & schema (STATIC ONLY)

**Zero database contact.** No connection, no query, no authentication, against any project. `scripts/verify-schema.mjs` was **read, never executed**. No command containing the production ref was constructed. `start.ps1` was never opened.

**Method:** every file under `supabase/` (81 SQL files, 20,630 lines) plus `scripts/verify-schema.mjs` (1,501 lines) read end to end, with the app-side write inventory cross-referenced against the resulting policy and grant set.

---

## Scope caveat that governs everything below (VERIFIED)

**The migrations are not a complete description of the schema.** Five tables are used but **never created by any file in the repo**: `jobs`, `bids`, `profiles`, `reviews`, `payments`. At least three policies that exist on live staging were created outside version control. `phase47_bids_projection_trigger.sql:67` says it plainly:

```sql
-- no `create table public.bids` anywhere under supabase/ — so the referential
```

and `phase71_reviews_read_lockdown.sql:20-22`:

> *"The world-readable policy predates the repo's numbered migrations (no supabase/*.sql creates it)"*

Every "final state" claim in this document is therefore **final state as expressed by the repo**, not proven live state. That distinction is the source of the two most serious findings.

---

## Findings, ranked

| # | Sev | Finding | Where |
|-|-|-|-|
| **S-1** | **P0** | `public.payments` — **RLS never enabled by any migration**, and its only SELECT policy also lives outside the repo. The money ledger's access boundary is unversioned and unverifiable. | §B.2 |
| **S-2** | **P0** | `scripts/verify-schema.mjs` has **no production guard** — point `.env` at production and it probes production. | §J.2 |
| **S-3** | **P1** | `job_request_parties_ok()` **lost its `pg_temp` pin** — phase68 overwrote phase64's fix. The stated invariant is currently false. | §E.1 |
| **S-4** | **P1** | `phase22` / `phase23` **mass-delete all jobs, bids and reviews** with no environment guard. | §H.1 |
| **S-5** | **P1** | `verify-schema.mjs` **exits 0 on a completely unmigrated database**, and 23 of its negative assertions cannot tell "secured" from "table missing". | §J.6, §J.9 |
| **S-6** | **P2** | `lib/jobStatusCompatibility.ts` ships a client-side `jobs.status` writer, inert **only** because of a grant revoke. | §B.3 |
| **S-7** | **P2** | `worker-search` edge function silently falls back to sending the **service-role key** as `apikey` on the user-identity path. | §K.2 |
| **S-8** | **P3** | `eas.json` commits a Supabase **anon/staging** JWT. Not a leak; still a pinned staging credential in build config. | §K.1 |
| **S-9** | **P3** | Seven tables deny `authenticated` writes via RLS-with-no-policy while still holding the CREATE-time grant. | §B.4 |
| **S-10** | **P3** | `worker_services.price_cents` is client-writable money with no ceiling. | §C.1 |
| **S-11** | **P3** | `PROD_APPLY_READY.sql` — 69 KB runnable, 17 phases stale, self-labelled DO NOT APPLY, tracked. | §H.9 |
| **S-12** | **P4** | `phase69:48` cites `bids_insert_own` as a live policy; dropped at `phase29:301`. Conclusion unaffected. | §B.5 |
| **S-13** | **P4** | `phase11_hotspots_demo_seed.sql` is numbered 11 but requires phase12. | §I.1 |
| **S-14** | **P4** | `add_location_column.sql` is unnumbered, unguarded, untransacted, unverified. | §A, §I.3 |

---

## A. Migration inventory

**81 `.sql` files, 20,630 lines.** Scheme: `phaseNN_<slug>.sql`, applied in ascending `NN`, hand-pasted into the SQL Editor.

**Gaps:** `phase2`, `phase3`, `phase4` do not exist — numbering runs 1, then 5.

**Duplicate numbers:**
- **phase11 — two unrelated files.** `phase11_map_hotspots.sql` (the real migration) and `phase11_hotspots_demo_seed.sql` (an optional fake-data seed). Apply order is not derivable from the number — see §I.1.
- **phase68/69/70/71/72** each ship a `_rollback.sql` sibling. Expected.
- **phase69 has three files.** `phase69_execute_privilege_lockdown.sql` (the repair), `phase69_default_privileges.sql` (an **optional** standing-policy change — `:5-9`: *"SEPARATE FILE ON PURPOSE… it can be declined"*), and `phase69_rollback.sql`.

**Unnumbered orphan (VERIFIED):** `supabase/add_location_column.sql`, 9 lines, no `begin;`/`commit;`, no sentinel, no self-check, no `verify-schema.mjs` entry:

```sql
alter table public.jobs
  add column if not exists location text;
```

Its header records the pre-repo scaffold it patches: *"the live public.jobs table is missing that column (it has lat/lng and budget_cents, but no `location`)"*.

Largest files: `phase46_offer_rpcs_and_rls.sql` (1,162), `phase50_sandbox_payments_and_offer_lifecycle.sql` (957), `phase20_push_notifications.sql` (897), `phase29_security_hardening.sql` (826), `phase51_active_work_lifecycle.sql` (728), `phase75_security_hardening.sql` (729), `phase39_worker_semantic_matching.sql` (713).

---

## B. Tables and RLS

### B.1 All 21 repo-created tables have RLS enabled ✅ (VERIFIED)

`messages` · `message_reads` · `message_reactions` · `job_locations` · `banned_phones` · `blocks` · `mutes` · `reports` · `portfolio_items` · `job_requests` · `push_tokens` · `notification_prefs` · `notification_outbox` · `legal_acceptances` · `direct_threads` · `worker_semantic_docs` · `job_offers` · `job_checklist_items` · `job_disputes` · `worker_services` · `saved_workers`.

RLS enablement for four of the five externally-created tables is at least *asserted* somewhere: `jobs`/`bids` at `phase1_rls_and_realtime.sql:16-17`, `profiles` at `phase5_profiles.sql:13` and `phase7_profiles_two_way.sql:60`, `reviews` at `phase6_reviews_and_storage.sql:22`.

### B.2 🔴 **S-1 (P0) — `public.payments`: RLS never enabled anywhere in the repo**

A repo-wide grep for any statement enabling RLS on `payments` returns **zero hits** — in `.sql`, `.md`, or `.mjs`. Its RLS status exists only as prose inside phase50's comments:

```
phase50_sandbox_payments_and_offer_lifecycle.sql:167-171
-- Lockdown, phase29's standard. The existing SELECT policy ("parties view own
-- payments": payer or payee) is exactly §G's boundary and is KEPT — but the
-- scaffold era left full table grants to anon/authenticated sitting under RLS.
-- RLS with no write policy already denies those writes; the revokes make the
-- grants tell the truth too.
```

**Its only SELECT policy is also in no migration.** So `payments` — the money ledger — has **both** its RLS switch **and** its access boundary defined outside version control.

**Why this is P0.** `phase50:174` grants `select on public.payments to authenticated`. That grant is safe *only* while RLS is on and the payer/payee policy exists. If RLS were ever off — a restore from a dump, a hand-run `alter table … disable row level security`, a rebuild from a schema export that drops it — **every payer, payee and amount row in the marketplace becomes readable by any signed-in user.** Nothing in the repo can detect that, and §J proves `verify-schema.mjs` cannot either: it never reads `relrowsecurity` and never enumerates policies.

**Mitigating (INFERRED):** phase50 adds a strong precondition that proves the table exists and is empty at apply time (`phase50:79-87`). This is a **coverage** gap, not proof of exposure. But it is the one gap where the blast radius is the entire money table.

**Recommendation, not applied:** a new corrective migration (**SCHEMA**, hand-applied) that (a) asserts `relrowsecurity` on `payments` and raises if false, (b) `create policy if not exists` for the payer/payee SELECT boundary so it is version-controlled, and (c) adds both to `verify-schema.mjs`. Never rewrite phase50 — it is applied.

### B.3 ⚠️ **S-6 (P2) — two client write paths, structurally dead but still shipped**

1. **`lib/jobStatusCompatibility.ts:117-119`** writes `jobs.status` directly. Against the current schema it is **doubly dead**: `jobs` has no UPDATE policy (all three dropped at `phase29:282-284`) and `phase29:297-299` revoked the UPDATE grant from `authenticated`, `anon` and `public`.

   **This settles the open question from `02_invariants.md` §I-13.** That domain flagged the write path and named the discriminating check — *"read the grants and the `jobs` UPDATE policy from the migrations."* Done: **there is no direct UPDATE grant and no UPDATE policy.** The path cannot succeed. It remains a P1 *invariant* violation to remove, but it is **not exploitable**, and the severity in the fix queue reflects that.

2. **`lib/profiles.ts:72-73`** — a direct `.from('profiles').update(patch)` fallback. `phase29:87-89` revoked all profile grants from `authenticated`, so this is dead too.

### B.4 ⚠️ **S-9 (P3) — grant/policy divergence on seven tables**

`job_requests`, `direct_threads`, `job_disputes` (partly), `banned_phones`, `blocks`, `mutes`, and (now fixed) `worker_semantic_docs` rely on **RLS-with-no-write-policy** to deny `authenticated` writes while still holding the CREATE-time table grant. There is no `revoke insert, update, delete on public.job_requests` or `… on public.direct_threads` anywhere.

Safe today — RLS denies. But it is exactly the shape phase50, phase51 and phase56 deliberately fixed elsewhere (`phase50:173`, `phase51:201`, `phase56:42`), and it means the grants do not tell the truth. **Recommend a phase76 sweep mirroring phase75 §6 but for `authenticated` rather than `anon`.**

### B.5 The surviving policy set — the four invariant-critical tables

#### `public.jobs` — 4 SELECT + 1 DELETE. **No INSERT, no UPDATE policy.** ✅

| policy | cmd | final definition |
|-|-|-|
| `jobs_select_open` | SELECT | `phase43:518-525` — `using (status = 'open' and visibility = 'open_market' and public.is_profile_active(client_id))` |
| `jobs_select_own` | SELECT | `phase1:32-35` — `using (client_id = auth.uid())` |
| `jobs_select_assigned_worker` | SELECT | `phase1:39-42` — `using (assigned_worker_id = auth.uid())` |
| `jobs_select_offer_party` | SELECT | `phase46:169-178` — worker on an offer for the job |
| `jobs_delete_own` | DELETE | `phase60:138-141` — `using (public.can_delete_own_job(jobs.id))` |
| ~~`jobs_insert_own`~~ / ~~`jobs_update_own`~~ / ~~`jobs_update_assigned_worker`~~ | — | **GONE** — `phase29:282-284`, never recreated |
| ~~`"jobs are viewable by authenticated users"`~~ | — | **GONE** (pre-repo) — `phase58:39` |

#### `public.job_offers` — 1 SELECT only ✅ **invariant fully enforced at both layers**

- `job_offers_select_party` — `phase46:143-146` — `using (customer_id = auth.uid() or worker_id = auth.uid())`
- `phase43:296` — `revoke all on public.job_offers from public, anon, authenticated;`
- `phase46:148-149` — `grant select on public.job_offers to authenticated;` then `revoke insert, update, delete … from public, anon, authenticated;`

#### `public.job_locations` — 1 SELECT only ✅ **exact-address boundary airtight**

```sql
-- phase12_job_location_privacy.sql:75-84
job_locations_select_party ... using (exists (
  select 1 from public.jobs j
   where j.id = job_locations.job_id
     and (j.client_id = auth.uid() or j.assigned_worker_id = auth.uid())))
```

INSERT/UPDATE/DELETE policies all dropped at `phase29:313-315`; grants revoked at `:316-318`. **This closes `02_invariants.md` §I-16 as a PASS:** owner + hired worker only, RLS-enforced, not frontend-only. phase75 additionally closed a trilateration oracle in `jobs_within_radius()` (`phase75:185-236`).

#### `public.bids` — 2 SELECT only ✅

`bids_select_own` (`phase1:73-76`), `bids_select_job_owner` (`phase29:264-275`). Write policies dropped `phase29:301-303`. `bids` is now a projection maintained by the `mirror_offer_chain_to_bids` trigger (`phase47:242`).

#### RLS enabled with ZERO policies — both deliberate and correct ✅

- **`banned_phones`** (`phase13:39`) — *"No policies: only SECURITY DEFINER functions (ban_user / handle_new_user) touch this table. Nothing client-side should read or write it."*
- **`worker_semantic_docs`** (`phase39:168`) — plus `phase39:173` `revoke all … from public, anon, authenticated;`

#### Remaining tables

| table | policies |
|-|-|
| `message_reads` | select/insert/update `_own` on `user_id = auth.uid()`. No DELETE. |
| `message_reactions` | all four, own-scoped, job-party for select |
| `blocks` / `mutes` | select/insert/delete, own-scoped. No UPDATE. |
| `reports` | insert_own (`+ is_active_user()`), select_admin, update_admin. No DELETE. |
| `portfolio_items` | select_visible (`published = true or worker_id = auth.uid()`), insert/update/delete own. `portfolio_select_all` (`using (true)`) **GONE** at `phase53:121` |
| `job_requests` | **select_party only.** No write policy. |
| `push_tokens` | all four, `user_id = auth.uid()` |
| `notification_prefs` | select/insert/update own. No DELETE. |
| `notification_outbox` | select_recipient, update_recipient. No INSERT/DELETE. |
| `legal_acceptances` | select_own, insert_own. **No UPDATE/DELETE — append-only, correct.** |
| `direct_threads` | **select_party only.** |
| `job_checklist_items` | all four, scoped to `assigned_worker_id = auth.uid()` **and** `j.status in ('assigned','in_progress')` |
| `job_disputes` | select_parties only |
| `worker_services` | select_visible / insert / update / delete own |
| `saved_workers` | select/insert/delete own. No UPDATE. |
| `messages` | select_party (job OR direct thread), insert_party (`sender_id = auth.uid() and is_active_user() and …not blocked`). **No UPDATE/DELETE** — unsend goes through the definer `unsend_message()`. |
| `reviews` | select_party, insert_completed_party (requires a **completed** job). `"reviews are viewable by everyone"` (pre-repo, `USING (true)`, role `public`) dropped at `phase71:110` |
| `profiles` | select_authenticated `using (true)`; write policies dropped `phase29:84-85`; replaced by a **column-level** allow-list `phase29:91`, extended `phase53:139` |

#### Storage — one acknowledged residual

phase72 moves `avatars_read` / `job_photos_read` from role `public` to `authenticated` (`:84-85`). Its own header records what it does **not** close (`:24-28`):

> *"It does NOT stop an unauthenticated fetch of an already-known object URL: both buckets are PUBLIC buckets, and Supabase serves public buckets through a path that bypasses RLS."*

**Open, acknowledged, deferred.** Recorded here so it is not re-discovered as new.

### B.6 Policy coverage gaps — none exploitable ✅

Every app-side write was cross-referenced against a matching policy: `job_checklist_items` (`lib/checklist.ts:36,46,56`), `message_reads` (`lib/conversations.ts:186`), `messages` (`lib/messages.ts:209`), `blocks`/`mutes` (`lib/moderation.ts:80-104`), `reports` (`:131,180`), `notification_prefs` (`lib/notificationPrefs.ts:88,117`), `notification_outbox.read_at` (`lib/notifications.ts:38,46`), `portfolio_items` (`lib/portfolio.ts:131,152,160`), `push_tokens` (`lib/pushNotifications.ts:274`), `message_reactions` (`lib/reactions.ts:58,77`), `saved_workers` (`lib/savedWorkers.ts:53,63`), `worker_services` (`lib/services.ts:60,88,98`), `jobs` DELETE (`lib/jobs.ts:500`). All ✅.

---

## C. Direct DML grants to `authenticated` / `public` / `anon`

### C.1 Every table-level grant in the repo (VERIFIED, exhaustive)

| file:line | statement | verdict |
|-|-|-|
| `phase9:65`, `phase16:65`, `phase25:79`, `phase36:660` | `grant select on public.conversations to authenticated;` | ✅ view, SELECT only |
| `phase29:91` | `grant select (…)` column-list on `profiles` | ✅ narrowing |
| `phase46:148` | `grant select on public.job_offers to authenticated;` | ✅ writes revoked next line |
| `phase50:174` | `grant select on public.payments to authenticated;` | ✅ SELECT only — **but see S-1** |
| `phase51:157` | `grant select, insert, update, delete on public.job_checklist_items to authenticated;` | ✅ **not a violation** — not lifecycle/assignment/money; policy-scoped to the assigned worker in `assigned`/`in_progress` |
| `phase51:203` | `grant select on public.job_disputes to authenticated;` | ✅ |
| `phase53:73` | `grant select, insert, update, delete on public.worker_services to authenticated;` | ⚠️ **S-10** |
| `phase53:111` | `grant select, insert, delete on public.saved_workers to authenticated;` | ✅ private list |
| `phase53:139` | `grant select (accepting_work, availability_note) on public.profiles to authenticated;` | ✅ column-scoped |
| `phase56:44-45` | `grant select on notification_outbox` + **`grant update (read_at)`** | ✅ **single-column update — exemplary** |

### C.2 ✅ The four invariant-critical tables are clean

| table | evidence |
|-|-|
| `jobs` | `phase29:297-299` `revoke insert, update … from authenticated / anon / public`. DELETE deliberately retained for `jobs_delete_own`. |
| `job_offers` | `phase43:296` `revoke all`, then `phase46:148-149` SELECT-only re-grant + re-revoke of writes |
| `bids` | `phase29:304-306` `revoke insert, update …` |
| `job_locations` | `phase29:316-318` `revoke insert, update, delete …` |

**The RPC-only write architecture is real and enforced at two independent layers** — policies dropped *and* grants revoked. This is the strongest part of the schema.

### C.3 ⚠️ **S-10 (P3) — `worker_services.price_cents` is client-writable money**

`phase53:73` grants full DML, and `lib/services.ts:88-89` uses it: `.from('worker_services').update(patch)` where `patch.price_cents = input.priceCents` (`:82`).

This is a **money-shaped integer-cents column written directly from the client**, outside any RPC and outside phase75's ceiling constraints (`phase75:83-96` cover `jobs`, `job_offers`, `payments` — **not** `worker_services`). It is a worker's own advertised rate, not a transaction, so it does not break the payment state machine. But it has **no upper bound and no `> 0` check** enforceable from the repo. Recommend a `worker_services_money_ceiling` constraint in the next phase.

### C.4 ✅ No table grant to `anon`/`public` survives — and phase75 swept the catalog

`phase75:552-569` removes them by **querying the catalog** rather than a hand-list:

```sql
where grantee = 'anon' and table_schema = 'public'
  and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
```

with a self-check that **aborts the whole file** if any survive (`:668-678`). Retained anon **SELECT** is documented and honest (`:21-32`): it exists so `verify-schema.mjs` can probe columns, and *"no policy on any of these tables admits anon… so the grant yields zero rows."*

**INFERRED note:** correct, but it makes anon SELECT **load-bearing for the test harness** — a circular dependency the file itself records as a follow-up (`:30-32`).

---

## D. `transition_job_status()`

### D.1 Seven definitions; phase73 wins (VERIFIED)

`phase29:581` → `phase31:8` → `phase35:78` (3-arg dropped at `:76`) → `phase51:268` → `phase58:138` → `phase68:189` → **`phase73_null_safe_owner_guard_and_unsend_gate.sql:26` ← WINNER**. phase74 and phase75 do not touch it. (`phase68_rollback.sql:133` also defines it, but is a rollback artifact.)

### D.2 The winning body — the guard and the state machine

```sql
create or replace function public.transition_job_status(
  p_job_id uuid, p_status text,
  p_completion_photos jsonb default null::jsonb,
  p_completion_videos jsonb default null::jsonb)
returns public.jobs
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid := auth.uid(); v_job public.jobs; …
begin
  select * into v_job from public.jobs where id = p_job_id for update;

  if not found or v_user is null or v_job.assigned_worker_id is distinct from v_user then
    raise exception 'Job not found or not assigned to caller';
  end if;
  if not public.is_profile_active(v_user) then
    raise exception 'Active authentication required';
  end if;

  if v_job.status::text = p_status then return v_job; end if;   -- idempotent retry

  if not (
    (v_job.status = 'assigned'    and p_status = 'in_progress')
    or (v_job.status = 'in_progress' and p_status = 'completed')
  ) then
    raise exception 'Invalid job status transition';
  end if;
  …
```

### D.3 Precise answers to the three questions asked

**Which transitions?** — **VERIFIED: exactly two.** `assigned → in_progress` and `in_progress → completed` (`phase73:65-70`). **No** `open → assigned`, **no** `→ cancelled`, **no** `→ disputed`, no reverse. Anything else raises.

Corroborated independently: `phase75:246-247` is *forced* to use a raw UPDATE because of that narrowness —
> `-- because transition_job_status() permits only assigned -> in_progress and`
> `-- in_progress -> completed and authorises only the assigned worker.`

**Who may call it?** — **VERIFIED: the assigned worker only, for both transitions.** The single guard at `:51` is `v_job.assigned_worker_id is distinct from v_user` → raise. **The job owner cannot call this function at all.** There is no owner branch. The caller must also pass `is_profile_active(v_user)` (`:54`), so a banned or tombstoned worker is refused.

**SECURITY DEFINER with `search_path`?** — **VERIFIED: yes to both.** `security definer` (`:34`), `set search_path to 'public', 'pg_temp'` (`:35`). Grants: `phase73:121-122` — `revoke all … from public, anon;` then `grant execute … to authenticated;`

### D.4 Two behaviours worth naming

1. **The row is locked before the guard** (`:43-46`, `for update`), so a concurrent `accept_offer()` cannot race the assignment check.
2. **phase73 closed a real, recent vulnerability.** Its header (`:7-13`) records it: the previous inequality test yielded `NULL` on an *unassigned* job, so the guard did not fire, and the idempotent branch **returned the full `jobs` row to any authenticated caller**, bypassing the `jobs` SELECT policies. Read-only, but a full-row disclosure. `IS DISTINCT FROM` is NULL-safe and closes it; `phase73:203-213` asserts the fix landed.

### D.5 What else moves `jobs.status` — two raw definer UPDATEs, both deliberate

- `phase75:375-378` (`delete_my_account`) — `update public.jobs set status = 'cancelled' where client_id = v_user and status = 'open';` Reasoned at `:364-371`, **including the fail-safe**: *"IN not NOT IN, so an unrecognised status is never auto-cancelled"* — exactly the allow-list-never-block-list rule CLAUDE.md states for status literals.
- `ban_user()` — same shape, noted at `phase75:254`.

Both are now covered by the `jobs_settle_offers_on_cancel` trigger (`phase75:303-308`).

---

## E. SECURITY DEFINER functions

**198 function definitions across all migrations; ~155 are SECURITY DEFINER.** Each evaluated by its **last** definition.

### E.1 🔴 **S-3 (P1) — exactly one definer function has lost its `pg_temp` pin**

```
supabase/phase68_deleted_at_authorization.sql:97-113
  public.job_request_parties_ok(uuid, uuid)
  101  security definer
  102  set search_path = public          ← no pg_temp
```

**This is a regression of phase64**, which had already fixed it:

```sql
-- phase64_security_definer_search_path.sql:72
alter function public.job_request_parties_ok(p_a uuid, p_b uuid) set search_path = public, pg_temp;
```

`CREATE OR REPLACE FUNCTION … SET search_path = public` **replaces `proconfig`**, so phase68 silently undid it. The anomaly is local to this one function — every *other* function phase68 emits carries `pg_temp` (`:132`, `:198`, `:315`, `:481`, `:533`), and phase68's own header sets `set local search_path = public, extensions, pg_temp;` at `:86`. Nothing after phase68 re-ALTERs it.

**Severity, stated honestly (INFERRED for exploitability, VERIFIED for the invariant break):**
- **No live exploit today.** The body contains **no unqualified relation references** — only two schema-qualified calls (`:105-110`: `public.is_blocked_between(…)`, `public.is_profile_active(…)`). phase64's own analysis (`:19`) notes *"Functions and operators are never resolved from pg_temp, so the exposure is limited to unqualified RELATION references."*
- **But the invariant is currently false.** phase64's post-condition (`:95-106`) raises if *any* definer function lacks `pg_temp` — so **re-running phase64 against staging right now would abort.** And a future edit adding an unqualified table reference to this body becomes exploitable silently.

**Fix, not applied:** one line in the next corrective migration — `alter function public.job_request_parties_ok(uuid, uuid) set search_path = public, pg_temp;` **SCHEMA**, hand-applied.

### E.2 Everything else pins correctly ✅ (VERIFIED)

Distinct `search_path` values across the repo: `= public, pg_temp` (127×), `to 'public', 'pg_temp'` (15×), `= public, extensions, pg_temp` (12×), `= public` with no `pg_temp` (43× — **all pre-phase64 definitions superseded by `phase64:60-87`, except E.1**).

### E.3 Twenty functions with no `search_path` at all — none is SECURITY DEFINER ✅

Every one is a `*_enabled()` sentinel: `language sql immutable`, body `select true`, invoker rights. `portfolio_category_freeform_enabled` (`phase19:34`) through `messaging_lock_enabled` (`phase66:224`).

**Not P0** — an invoker-rights `select true` has no privilege to hijack. Later sentinels (phase73-75) set it anyway, which is the better habit.

---

## F. Function EXECUTE grants

### F.1 `grant execute … to anon` — exactly one, deliberate ✅

```sql
-- phase69_execute_privilege_lockdown.sql:229-230
revoke all on function public.job_categories_expanded() from public;
grant execute on function public.job_categories_expanded() to anon, authenticated;
```

Intentional: `verify-schema.mjs:1258-1259` uses it as the **only** positive anon-executability probe in the harness. The function returns a static category list. **Not a finding.**

### F.2 `grant execute … to public` — only in rollback files ⚠️

17 occurrences, all in `phase69_rollback.sql:40-99` and `phase70_rollback.sql:82`. **Not live** — but applying either rollback would **re-open 16 functions to `PUBLIC`, including the notification chain.** Recommend a header banner on both saying exactly that.

### F.3 phase69 — the 16 drifted functions, and the drift is not recurring ✅

`phase69_execute_privilege_lockdown.sql:22-27`:
> *"Sixteen of the 116 functions in schema public are in that state. Every one of them is defined in phase6, phase7, phase13, phase17, phase18, phase20 or phase23 — all BEFORE phase32, which is the migration that changed the default"*

The 16: ten trigger functions (`close_requests_on_block`, `create_default_notification_prefs`, `enforce_portfolio_cap`, `handle_new_user`, `notify_on_bid`, `notify_on_job_location`, `notify_on_job_request`, `notify_on_job_status`, `notify_on_review`, `recompute_profile_rating`), three notification helpers (`enqueue_notification`, `notify_display_name`, `notify_nearby_for_job`), plus `is_blocked_between`, `job_request_parties_ok`, `job_categories_expanded`.

**The "live unauthenticated notification chain" is real (VERIFIED):** `enqueue_notification`, `notify_display_name`, `notify_nearby_for_job` and the ten triggers were `EXECUTE`-able by `anon` from creation. phase69's origin story is that **phase68 refused to commit rather than publish it** (`phase69:10-20`) — the self-check working as designed.

**One more that drifted and was fixed later:** `unsend_message`, created `phase25:18` with no revoke, exposed to `PUBLIC` for **45 migrations** until `phase70:100`.

**Has anything since phase69 re-introduced the drift?** — **VERIFIED: no.** Every function created in phase70-75 ships its `revoke`/`grant` in the same file: `unsend_message` (`phase70:100`, again `phase73:171`), five sentinels, `drain_notification_outbox` (`phase74:90` — revoked from all three and granted to nobody, correct since `cron.schedule` runs it as the job owner, `:96-100`), `settle_offers_on_cancelled_job` (`phase75:301`), `should_notify` (`:181`), `jobs_within_radius` (`:239`), `delete_my_account` (`:529`). **Clean.**

**Structural defence:** `phase32:82-89` sets `alter default privileges for role postgres in schema public revoke execute on functions from public/anon/authenticated/service_role`. `phase69_default_privileges.sql:43` adds the **un-role-qualified** version — *but it is optional and may not have been applied.* **If migrations ever run as a role other than `postgres`, the drift recurs.**

### F.4 ⚠️ **S-12 (P4) — phase69's justification cites a policy that no longer exists**

`phase69:45-51` justifies keeping `is_blocked_between` granted to `authenticated` by listing four RLS policies that call it, the first being:
```
--   bids_insert_own          public.bids       phase13:233-245, call at :243
```
But `bids_insert_own` was dropped at `phase29:301` and never recreated — **stale by 40 migrations.** The **conclusion still holds**: the other three (`messages_insert_party` `phase66:144+`, `chat_photos_insert_party` `phase29:773`, `chat_audio_insert_party` `phase29:807`) are live and do call it. Documentation defect, not a privilege defect.

---

## G. Profile deletion / tombstone ✅

**VERIFIED — the row is anonymized into a tombstone, `deleted_at` is the marker, and `banned` is deliberately NOT the marker.**

Winning definition: `public.delete_my_account()` at **`phase75_security_hardening.sql:328`** (supersedes `phase67:331`).

```sql
-- phase75:445-461
  -- (f) Scrub the profile to a tombstone. NOT touched on purpose: id,
  --     created_at, rating_avg, rating_count, and banned - deletion must never
  --     launder a ban.
  update public.profiles
     set full_name         = 'Deleted user',
         phone = null, avatar_url = null, bio = null, availability_note = null,
         categories = null, completion_rate = null, on_time_pct = null,
         response_time = null, is_admin = false, accepting_work = false,
         deleted_at        = now()
   where id = v_user;
```

| question | answer |
|-|-|
| Tombstone rather than hard delete? | **VERIFIED YES** for `public.profiles`. `phase75:522-525` lists sixteen table families that keep pointing at it. |
| Is `deleted_at` the marker? | **VERIFIED YES** (`:460`). `phase68:11-12` — *"phase67 gave `profiles` a `deleted_at` tombstone and made `public.is_profile_active(uuid)` THE lifecycle predicate."* |
| Is `banned` used instead? | **VERIFIED NO — and they are deliberately separate.** `banned` is explicitly excluded from the scrub (`:446-447`). `is_profile_active()` tests both. |

**Important nuance:** the `auth.users` row **is** hard-deleted — `phase75:508` `delete from auth.users where id = v_user;`, with `:511-516` asserting exactly one row affected, else raise and roll back, *"the profile scrub must not commit without it."* So: **auth identity destroyed, marketplace identity tombstoned.** That is the right shape.

Genuinely private rows are hard-deleted first (`:414-443`): `push_tokens`, `notification_prefs`, `notification_outbox`, `saved_workers` (user side), `mutes` (both sides), `message_reads`, `message_reactions`, `portfolio_items`, `worker_services`, `worker_semantic_docs`. `blocks` is deliberately retained (`:413` — *"a block has to survive"*).

**Self-reported residual:** `phase75:496-498` — *"One exception, unscrubbable: `notification_outbox.title`/`.body` embed the actor's display name with no actor column. Recorded as a follow-up."* Other users' outbox rows can still contain the deleted user's name.

**Race closed in phase75:** the blocker gate now reads under a lock (`:349-353`), preventing a concurrent `accept_offer()` from stranding an assigned job on a tombstone. Lock order `jobs` → `job_offers` matches phase46 (`:319-322`), making deadlock structurally impossible.

---

## H. Dangerous / destructive migrations

### H.1 🔴 **S-4 (P1) — mass-delete seed migrations with no environment guard**

```sql
-- phase22_job_listings_seed.sql:77-84   (phase23:108-115 is byte-identical)
delete from public.bids     where job_id not in (select id from protected_job_ids);
delete from public.reviews  where job_id not in (select id from protected_job_ids);
delete from public.jobs     where id     not in (select id from protected_job_ids);
```

Plus `phase22:73-75` / `phase23:104-106`: `update public.jobs set accepted_bid_id = null where id not in (…)`.

These are **staging seed files**, but they carry **no `raise exception` guard against being run on a non-staging database**, no project-ref precondition, and no row-count sanity check. Applied to production they would delete the marketplace.

**Recommend adding a hard precondition** — refuse unless the project ref is the staging one, or unless `count(*) from jobs` is below a threshold — mirroring the discipline phase50 and phase75 already show.

Narrower relatives, all acceptably scoped: `phase27:43,49,51` (`= any(v_dupe_ids)`), `phase13:366`, `phase47:191-195`.

### H.2 ⚠️ **Fake marketplace data — the only files that contradict a stated invariant**

CLAUDE.md: *"Never invent marketplace data."* Four migrations insert fabricated jobs:
- `phase11_hotspots_demo_seed.sql:4-8` — *"It inserts 118 fake OPEN jobs clustered in four Brooklyn grid cells… these are real open jobs, so they WILL also appear in the Find Work browse list"*
- `phase22_job_listings_seed.sql`, `phase23_realistic_job_seed.sql`, `phase24_flatlands_red_tier_boost.sql`

Each is self-labelled as demo/seed and phase11's is marked OPTIONAL with a cleanup line (`:13-14`). **INFERRED: acceptable as staging tooling** — and `04_data_binding.md` §6 independently confirms no invented data reaches a client render path. But nothing mechanically prevents applying them, which is the same gap as H.1.

### H.3 `drop column` on live data — deliberate

`phase12:119-120` — `alter table public.jobs drop column if exists lat/lng;`. Privacy-motivated (coordinates move to `job_locations`), and phase12 recreates the dependent functions in the same file (`:125`, `:171`). **Correct**, but irreversible.

### H.4 Dynamic constraint dropping

`phase67:124` — `EXECUTE format('alter table %I.%I drop constraint %I', …)`. Drops every public FK pointing at `auth.users` so the `auth.users` delete can land. Necessary; scoped to that FK set. Flagged only because it is `format()`-built DDL over arbitrary table names.

### H.5–H.7 Clean ✅

- **`drop table`** — 14 hits, **all `pg_temp.*` scratch tables**.
- **`truncate` as a statement** — **zero.** It appears only inside `revoke … truncate …`, which is the good direction.
- **`drop policy` without recreate** — 8, every one intentional and listed in §B.5. `phase71:110`'s drop of `"reviews are viewable by everyone"` (`USING (true)` to role `public`) is a **security fix**, not a gap.

### H.8 Hardcoded project refs — comments only ✅ (VERIFIED)

Six occurrences, **every one on a header comment line** of the form *"Apply to STAGING (…). Production (…) is never contacted by this run."* — `phase67:4-5`, `phase68:4-5`, `phase70_rollback.sql:11`, `phase73:4`.

**No connection string, no DSN, no `dblink`, no `postgres_fdw` in any migration.** `supabase/.temp/linked-project.json` holds the staging ref and is gitignored (`.gitignore:13`).

### H.9 ⚠️ **S-11 (P3) — `PROD_APPLY_READY.sql`**

Independently verified by reading its own header:

```
-- SUPERSEDED 2026-08-18 — DO NOT APPLY. Covers phases 51-58 only;
-- phases 59-75 are absent. The production path is a rebuild from a
-- staging schema dump (standing decision, BRAZOS_MASTER_PLAN.md).
-- Kept for history only.
```

Self-labelled correctly — but it is a **runnable 69 KB file at the repo root** that would apply a 17-phase-stale schema. Move to `docs/archive/`.

---

## I. Migration ordering

**VERIFIED: exactly one forward reference across all 81 files.** A first-creation map was built for every `public.<table>` and `public.<function>`, then every migration scanned for references to objects created by a higher-numbered file.

### I.1 **S-13 — `phase11_hotspots_demo_seed.sql:66` references `public.job_locations`, created at `phase12:46`**

Documented and benign. Its own header states the real prerequisite (`:10-11`):
> *"⚠️ Requires phase12_job_location_privacy.sql to have been run first — exact coordinates now live in job_locations, not jobs.lat/jobs.lng."*

**INFERRED:** written after phase12, numbered 11 to sit beside `phase11_map_hotspots.sql`. It is optional demo tooling, not part of the apply chain. **Recommend renaming to `phase12b_` or moving to a `seeds/` subdirectory** so the number stops lying about apply order.

### I.2 Related orderings, all correct ✅

`phase11_map_hotspots.sql` reads `jobs.lat`/`lng` — columns phase12 drops — and phase12 recreates both dependent functions in the same file. `phase13:44-47` orders `blocks` before `is_blocked_between()` because *"SQL-language function bodies are validated against the catalog at CREATE FUNCTION time (unlike plpgsql)."* `phase18:143-146` adds the `messages → job_requests` FK only after creating the table. No migration below 43 references `job_offers`.

### I.3 **S-14 — orderings that depend on files outside the numbered chain**

`phase50` requires `public.payments` to pre-exist and refuses otherwise (`:79-81`) — that one handles itself loudly. `add_location_column.sql` must run before anything reads `jobs.location` (`phase75:217`, `phase43`'s `create_job`) and has **no guard, no transaction, no verify-schema entry**.

### I.4 A cross-transaction ordering trap worth knowing — **a bug class, not a one-off**

```
phase69_execute_privilege_lockdown.sql:222-226
-- Note: phase23:88-89 already emits a `from public` revoke and an
-- `authenticated` grant for this function. Live staging still shows a default
-- ACL, so those two statements did not take effect there - phase23 carries a
-- `commit;` at :65 and this block sits after it, in a separate transaction.
```

phase23's grants landed **after its `commit;`**, in a separate implicit transaction, and were lost. **Worth grepping future migrations for privilege statements positioned after `commit;`.**

### I.5 Apply order the numbers understate

`phase69_execute_privilege_lockdown.sql:29` — *"APPLY ORDER: this file FIRST, then phase68 unchanged."* **69 must precede 68.**

---

## J. `scripts/verify-schema.mjs` — read, never executed

1,501 lines. It hand-parses the repo-root `.env` (`:26`), reads `SUPABASE_URL` (`:35`) and `SUPABASE_KEY` (`:36`), and issues `fetch()` calls against `${BASE}/rest/v1/…` (`:42`). **It opens no Postgres connection at all** — every probe is HTTP through PostgREST with the app's own publishable key. `SUPABASE_DB_URL_STAGING` is read from the shell (`:101`) but **parsed only for its project ref, never connected to**. Missing env → `exit 2`.

### J.1 Structure

One array `MIGRATIONS` (`:245-1435`), each element `{ file, [sentinel], checks }`. Runner at `:1451-1487`: sentinel first, `applied = s.ok`; if not applied, every check in that group prints `PENDING` and **is never run**. Exit: 2 = missing env / control-probe failure, 3 = parity failure, else `:1501` `process.exit(missing === 0 ? 0 : 1)`.

### J.2 🔴 **S-2 (P0) — no production guard**

There is **no check refusing a particular project ref.** `envParityProblems()` (`:73-95`) only compares the three refs **against each other**:

```js
} else if (appRef && keyRef !== appRef) {
  problems.push(`the anon key belongs to ${keyRef} but SUPABASE_URL points at ${appRef}`);
}
```

Contrast the sibling script, which **does** pin: `scripts/eas-build-pre-install.mjs:44` — `const STAGING_REF = 'zzkum…';` with a matching `PRODUCTION_REF` at `:46`.

**Point `.env` at production and `verify-schema.mjs` will happily probe production.** Worse, a missing `toolingRef` is only a **warning** (`:119-123`), so with `SUPABASE_DB_URL_STAGING` unset the app-vs-tooling comparison silently does not happen.

**This directly contradicts CLAUDE.md's first Supabase rule** — *"Production is never contacted, read or write — mechanically blocked."* It is mechanically blocked for *agents* (the `.claude/` guard matrix stopped this audit from even reading `eas.json`), but **not** for this script run by a human with a mis-pointed `.env`.

**Fix, not applied:** import the two ref constants from `eas-build-pre-install.mjs` and hard-refuse the production ref. **This is the single highest-value one-line hardening in the entire repo.** Owner class STRUCTURE (a `scripts/` change, not a migration).

### J.3 🟡 The parity gate does not check the JWT `role` claim

`scripts/supabase-ref.mjs:32` decodes only `.ref`. **A legacy service-role JWT for the same project passes the gate** — nothing tests `role !== 'service_role'`. It would then fail loudly at the `checkColumnRevoked` probes (service_role reads everything), so it is not silent — but it is not refused up front either.

### J.4 The five check mechanisms — all HTTP, none reads a catalog

| helper | line | passes when | uses |
|-|-|-|-|
| `checkColumn` | `:133-141` | HTTP 2xx on `?select=<col>&limit=0` | 72 |
| `checkColumnRevoked` | `:150-160` | **any** non-2xx | 23 |
| `checkRpc` | `:183-197` | anything except `PGRST202` | 113 |
| `checkRpcAllowed` | `:169-181` | 2xx required | **1** |
| `checkRpcDenied` | `:216-242` | `403` or `42501` | **1** |

### J.5 🔴 **S-5a — `checkColumnRevoked` cannot distinguish "secured" from "missing"**

23 negative assertions pass on a database where the table **was never created or was dropped** — a 404 `PGRST205` reads identically to a 403 permission-denied. These cover `payments`, `job_offers`, `worker_semantic_docs`, `notification_outbox`, `job_disputes`, `saved_workers`, `profiles.phone` and more. **Only `checkRpcDenied` (`:232-237`) gets this right, and it is used once.**

Note how this compounds **S-1**: `payments` is both the table whose RLS is unversioned *and* one of the tables whose "secured" assertion would pass if it vanished.

### J.6 🔴 **S-5b — PENDING never fails the run**

```js
// :1471-1477
if (!applied) { pending++; console.log(`  PENDING  ${label} — EXPECTED MISSING until the migration is applied`); continue; }
// :1494-1499  "This is not a failure"
// :1501       process.exit(missing === 0 ? 0 : 1);
```

**A completely unmigrated database exits 0.** All 33 groups from phase43 up are gated this way, and one missing sentinel silently suppresses that whole group.

### J.7 Coverage — 50 groups, 210 probes, phase15 → phase75

**Files with NO group at all:** `phase1_rls_and_realtime` (**the entire RLS foundation**), `phase5`–`phase14`, `phase22`, `phase24`, `phase26`–`phase28`, **`phase32_function_execute_privileges`**, `phase33`, `phase40`, `phase41`, `phase44`, `phase45`, `phase69_default_privileges`, and `add_location_column.sql`.

Twelve groups are sentinel-only (`checks: []`) — phases 52, 54, 57, 59, 60, 61, 62, 63, 64, 65, 71, 72. For those, "verified" means *one marker function resolves*.

### J.8 What it does NOT check — the drift surface

| question | answer | evidence |
|-|-|-|
| RLS **enabled** on any table? | **NO** | `relrowsecurity` / `pg_tables.rowsecurity` never read |
| RLS **policy** exists / correct? | **NO** | `:1314` *"pg_policies has no PostgREST surface"*; `:1108`; `:1293` |
| Function **grants / EXECUTE**? | **NO** | `:1232-1235` — *"WHAT THIS HARNESS CANNOT SEE: an ACL… nothing here can prove EXECUTE was revoked from PUBLIC or from anon."* All 113 `checkRpc` calls treat 403 as PASS |
| Function is SECURITY DEFINER? | **NO** | `prosecdef` never read |
| **`search_path`** pinned? | **NO** | `:1067` — *"ALTER FUNCTION … SET creates no object at all, so there was nothing to probe"* |
| Function **body**? | **NO** | `:1174-1176`, `:1272-1273` |
| Column types / constraints / defaults / NOT NULL? | **NO** | `checkColumn` issues `select=<col>&limit=0` only |
| **Triggers** exist? | **NO** | `:741-742`, `:888-891`, `:984-986` |
| Extra/unexpected objects (reverse drift)? | **NO** | the runner iterates a hardcoded array; no enumeration, no diff |

Also unchecked: row counts, enum values, view definitions, return types (**phase40's entire purpose**), FK drops, `pg_cron` schedules, extensions, Vault secrets, storage bucket policies.

### J.9 Verdict

**`verify-schema.mjs` proves "the SQL file ran to completion", not "the database is in the intended state."**

Everything real is delegated to the **in-transaction self-checks** (`phase64:95-106`, `phase68:552+`, `phase73:203-213`, `phase75:601-692`), which are genuinely strong — phase68 aborting on its own ACL check is what surfaced the 16-function drift in the first place. But those run **once, at apply time**. The harness cannot detect a *later* out-of-band change to any policy, grant, RLS switch, constraint, trigger, or function body. **Every drift class in §B, §C, §E and §F above is invisible to it** — including S-1.

**This is also why `05_theme_parity.md`'s and `04_data_binding.md`'s findings compound:** there are no generated database types either, so a renamed column is caught by neither the type system nor the harness.

### J.10 Explicitly skipped checks, each with a stated reason ✅

`:421-422` (`is_active_user()` — *"would be a false green"*), `:487-495` (phase33 — *"A check that cannot fail is worse than no check."*), `:693-699` (phase44/45 are data migrations), `:1192-1193`, `:1294-1301`, `:1316-1320` (phase72's sentinel explicitly does **not** claim public-bucket URLs are closed). This is good discipline and worth preserving.

---

## K. Secret scan

Scanned the whole working tree **excluding `start.ps1`** (quarantined, never opened), `node_modules`, `.git`, `dist`, `brazos-review.zip`, `package-lock.json`. **All values redacted; no secret is reproduced in this document.**

### K.1 ⚠️ **S-8 (P3) — `eas.json` carries a committed Supabase key**

| file:line | kind | tracked? |
|-|-|-|
| `eas.json:12` | Supabase JWT — `eyJ…[redacted]` | **YES — committed to git** |
| `.env:9` | Supabase JWT — `eyJ…[redacted]` | **NO** — gitignored (`.gitignore:50`) ✅ |

**Only the token's claims were decoded, never the token:** `"role":"anon"`, `"iss":"supabase"`, `"ref":"zzkum…[redacted]"`, `exp` present.

**It is an `anon` key for the STAGING project — not `service_role`, not production.** Anon keys are publishable by design and already ship inside the app bundle, so this is **not a credential leak in the usual sense.** It is still worth acting on: it pins a **staging** credential into a build-config file that an EAS **production** profile also reads; and if the key rotates or the JWT expires, the committed value goes stale silently. `.env.example` exists and `scripts/eas-build-pre-install.mjs` already implements ref-checking, so the machinery to source this from an EAS secret is present.

> **Method note:** the `.claude/` guard matrix **blocked this audit's own attempt to re-read `eas.json`** (`GUARD-SECRET credential-bearing-file`). That is the control working exactly as intended, and it was respected rather than worked around. The finding above comes from the delegated static scan, which had already redacted the value.

### K.2 🟡 **S-7 (P2) — a service-role key can be sent as `apikey` on the user-identity path**

```ts
// supabase/functions/worker-search/index.ts:153
userCredentials → apikey: ANON_KEY || SERVICE_KEY
```

If `SUPABASE_ANON_KEY` is unset in that function's deployed environment, the **service-role key is sent as the `apikey` header** on the path that is supposed to carry the *caller's* identity. The `Authorization: Bearer <user JWT>` still governs `auth.uid()`, so this is **not automatic privilege escalation** — but it puts the service key on a request shaped as a user request, and the `?? ''` defaults at `:107-108` make the misconfiguration **silent**.

**Recommend making both keys required and failing loudly**, as `scripts/reset-test-user-password.mjs:132-134` already does.

Note this file is **excluded from `tsc`** (`tsconfig.json` excludes `supabase/functions`), so `npm run verify` type-checks nothing here. See `13_tests.md`.

### K.3 `service_role` — 41 hits, **zero are credentials** ✅ (VERIFIED)

Every occurrence is SQL role-name syntax (`grant execute … to service_role`), prose in an audit doc, or an environment **read**, never a literal:
- `supabase/functions/send-push/index.ts:57` — `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''` ✅
- `supabase/functions/worker-search/index.ts:107-108` — same ✅
- `scripts/reset-test-user-password.mjs:127,136` — the only `createClient` with a service key; `process.env.…`, hard-fails at `:132-134` if unset, never bundled ✅

### K.4 Stripe-style keys — **none** ✅

Four hits for `sk_test` / `sk_live` / `rk_live`, all in `SECURITY_AUDIT.md` prose (`:197`, `:206`, `:269`). No `pk_live`, no `whsec_`. **No Stripe credential exists in the tree** — consistent with `11_dependencies.md`, which finds no payment SDK.

### K.5 Connection strings — 6 hits, **all synthetic or documentation** ✅

`tests/safety.test.mjs:177` and `docs/audits/HARDENING_RUN_B_2026-08-14.md:150` use `postgres://synthetic-…` fixtures; `docs/archive/*` mention the bare scheme in prose. **No real DSN with credentials anywhere.**

### K.6 Private keys — **zero hits** ✅

No `BEGIN RSA PRIVATE KEY`, `BEGIN PRIVATE KEY`, `BEGIN EC PRIVATE KEY`, `BEGIN OPENSSH PRIVATE KEY`. `.gitignore:18-22,47` pre-empts the classes: `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision`, `*.pem`.

### K.7 Tracked-vs-ignored `.env` audit — ✅ clean (independently VERIFIED)

`git ls-files | grep -i env` returns only: `.env.example`, `env.d.ts`, `project-audit/13_DEPLOYMENT_AND_ENVIRONMENT.md`, `tests/envParity.test.mjs`, and this audit's own `01_environment.md`. **No real `.env` file is tracked.**

`.gitignore` intent is explicit and good: `:50-51` (`.env`, `.env*.local`), `:53-54` (*"local launcher (embeds a live DB credential — must never be committed)"* / `start.ps1`), `:13` (*"Supabase CLI local state (may hold connection material)"* / `supabase/.temp/`).

**`eas.json` is the only credential-bearing tracked file at the repo root.**

---

## What is genuinely solid

Worth stating plainly, because it is the majority of the picture:

- **The RPC-only write architecture is real and enforced at two independent layers.** `jobs`, `bids`, `job_offers`, `job_locations` each have write policies dropped **and** write grants revoked.
- **`transition_job_status()` is exactly as narrow as documented** — two transitions, assigned-worker-only, definer, `pg_temp` pinned, row-locked, lifecycle-gated.
- **The exact-address boundary is airtight** in the repo's definitions, and phase75 closed a trilateration oracle on top of it.
- **The tombstone design is correct and carefully reasoned** — `deleted_at` as the single lifecycle predicate, `banned` preserved so deletion cannot launder a ban, `auth.users` hard-deleted with a row-count assertion.
- **phase64/68/69/73/75 each carry in-transaction self-checks that abort rather than half-apply.** That discipline is why this codebase's real security posture is materially better than its test harness can prove — and it is also the reason S-1 and S-2 matter: they are the two places where nothing is watching.

---

## Coverage

**100%** of `supabase/` (81 SQL files) and `scripts/verify-schema.mjs` read.

Stated limits:
- **Live state was never observed** and could not be — that is the point of the run. Five tables and at least three policies exist only outside the repo (§scope caveat), so the picture is necessarily partial in exactly the places S-1 identifies.
- **`eas.json` was not re-read by this session** — the repo's own guard blocked it. The finding stands on the delegated scan's redacted output.
