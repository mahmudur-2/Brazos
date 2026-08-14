# phase69 diagnostic - execute privilege lockdown

Run date: 2026-08-14. Base: `mainexpo` @ `590e2b0`, clean tree, baseline
`npm run verify` green (519 tests, 0 fail).

No database was contacted at any point in this run, and no SQL was executed.
`SUPABASE_DB_URL_STAGING` is not set. Every claim below is derived from the SQL
text under `supabase/`, the TypeScript under `lib/`, `screens/`, `ui/`,
`navigation/`, `modes/`, `components/`, `hooks/`, the Deno sources under
`supabase/functions/`, and `scripts/`. Claims that could only be settled by the
live database are labelled as such and are taken from the staging inventory in
the dispatch prompt, read from `zzkumxcjtbqoselzptig` on 2026-08-14.

## Verdict up front

No stop condition fired. Q1 finds no stale source. Q3 finds no anon/public
policy referencing `job_request_parties_ok`. Q2 finds no client call site for
any of the five callable SECURITY DEFINER functions, and no direct call to any
of the ten trigger functions.

One finding changes an implementation detail inside the latitude section 3
already grants ("grant ONLY to the roles Q2 proves are required"):
**`is_blocked_between(uuid, uuid)` must keep its `authenticated` grant**, because
four live RLS policies that are granted `to authenticated` call it. Revoking it
from `authenticated` and granting nothing would break every authenticated INSERT
into `public.bids`, `public.messages` and two storage buckets. See Q2.

## Q1. Stale-source check

Every file under `supabase/` carrying a `create or replace function` for each
of the six functions, in file order. `phase68_deleted_at_authorization.sql` and
`phase68_rollback.sql` are listed for completeness but excluded when picking the
authoritative source, since phase68 is the file under test and its rollback
re-emits the pre-phase68 body.

| Function | Defining files | Highest-numbered | phase68 named | Match |
| --- | --- | --- | --- | --- |
| `job_request_parties_ok(uuid,uuid)` | `phase18:153`; phase68:97; phase68_rollback:47 | **phase18** | phase18 | yes |
| `should_notify(uuid,uuid,text)` | `phase20:246`, `phase56:59`; phase68:123; phase68_rollback:72 | **phase56** | phase56 | yes |
| `transition_job_status(uuid,text,jsonb,jsonb)` | `phase29:581`, `phase31:8`, `phase35:78`, `phase51:268`, `phase58:138`; phase68:189; phase68_rollback:133 | **phase58** | phase58 | yes |
| `match_workers_semantic(...)` | `phase39:499`, `phase40:69`; phase68:290; phase68_rollback:234 | **phase40** | phase40 | yes |
| `worker_semantic_refresh_queue(integer)` | `phase39:395`; phase68:477; phase68_rollback:412 | **phase39** | phase39 | yes |
| `is_profile_active(uuid)` | `phase29:43`, `phase67:177` | **phase67** | not a phase68 target | n/a |

All five phase68 targets re-emit the highest-numbered body that exists. **No
function has a defining file newer than the one phase68 used. No stale source.
No stop.**

`is_profile_active` is the sixth name in the question but is not one of the five
bodies phase68 replaces - phase68 routes the other five *through* it and leaves
it alone, stated at `supabase/phase68_deleted_at_authorization.sql:62`. Its
authoritative body is `supabase/phase67_account_deletion.sql:177`, which is
newer than phase29's, and phase68 does not re-emit it, so it cannot be reverted
by phase68.

### The `match_workers_semantic` discrepancy, explained

The live body in staging does contain the string `is_profile_active`. It is a
**comment**, not a call. `supabase/phase40_fix_semantic_match_return_type.sql:186-187`:

```sql
      -- Banned/inactive accounts stay out, matching is_profile_active().
      and coalesce(p.banned, false) = false
```

Line 186 is the comment that carries the string; line 187 is the actual
predicate, an inline `banned` read. `pg_get_functiondef` and `pg_proc.prosrc`
preserve comments verbatim, so any probe that searched the live body for
`is_profile_active` matched this comment and would wrongly conclude the function
already routes through the canonical predicate. It does not, and never did -
phase39's original body carries the same comment at
`supabase/phase39_worker_semantic_matching.sql:610`.

phase68 does account for this, and does so correctly. It classifies
`match_workers_semantic` as **FORM B** at
`supabase/phase68_deleted_at_authorization.sql:37-41`: for the two set-scan
functions the lifecycle test is inlined rather than routed through a per-row
definer call. Its patched body keeps phase40's comment and its `banned` line
byte for byte and appends the new predicate at
`supabase/phase68_deleted_at_authorization.sql:407-411`:

```sql
      -- Banned/inactive accounts stay out, matching is_profile_active().
      and coalesce(p.banned, false) = false
      -- phase68: public.is_profile_active(uuid) is the canonical predicate.
      -- Inlined here for scan performance, not duplicated by accident.
      and p.deleted_at is null
```

Consistently, phase68's self-check does **not** expect `is_profile_active` for
this function. The self-check table at
`supabase/phase68_deleted_at_authorization.sql:595-600` expects the predicate
string `deleted_at is null` for `match_workers_semantic` and for
`worker_semantic_refresh_queue`, and `is_profile_active` only for the three
FORM A functions at `:588`, `:591`, `:594`.

So the dispatch prompt's live-state claim - "all five target functions show no
lifecycle predicate" - holds. `deleted_at is null` is the correct needle for the
two FORM B functions and is absent pre-phase68; `is_profile_active` is the
correct needle for the three FORM A functions. Only a naive `is_profile_active`
substring probe applied to all five would have been misleading, and only for
`match_workers_semantic` and `worker_semantic_refresh_queue`. No defect, no
staleness, nothing to fix.

## Q2. Call-site inventory, five callable SECURITY DEFINER functions

Method: substring search for each function name across `screens/ lib/ ui/
navigation/ modes/ components/ hooks/ App.tsx supabase/functions/`, then across
`supabase/` and `scripts/`. The client search returned **zero** hits for all
five names, so no `supabase.rpc()` or PostgREST call site exists for any of
them; classification (i) is empty throughout. The two Edge Functions call
PostgREST RPC generically at `supabase/functions/send-push/index.ts:60` and
`supabase/functions/worker-search/index.ts:163`, and neither file mentions any
of the five names.

### `enqueue_notification(uuid,uuid,text,text,text,text,jsonb,text)`

Defined `supabase/phase20_push_notifications.sql:327`. Fourteen call sites, all
`perform public.enqueue_notification(...)` from inside another SECURITY DEFINER
function or a trigger body:

- `phase20:412` in `notify_on_message()` (`phase20:373`)
- `phase20:452`, `phase20:473` in `notify_on_bid()` (`phase20:433`)
- `phase20:506`, `phase20:521` in `notify_on_job_status()` (`phase20:495`)
- `phase20:623` in `notify_on_job_request()` (`phase20:565`)
- `phase20:687` in `notify_nearby_for_job()` (`phase20:644`)
- `phase20:734` in `notify_on_review()` (`phase20:727`)
- `phase56:134`, `phase56:170` in the phase56 notification-feed triggers
- `phase57:73`, `phase59:86`, `phase61:175`, `phase62:86` in later trigger bodies

Classification: **(iii) only.** The single non-database reference is
`scripts/seed-review.mjs:162,165`, a developer seed script that runs pasted SQL,
not app runtime, and not a role that needs a standing grant.
**Grant: nobody.**

### `notify_display_name(uuid)`

Defined `supabase/phase20_push_notifications.sql:359`. Twelve call sites, all
inside trigger or definer bodies: `phase20:417`, `:449`, `:527`, `:587`, `:600`,
`:610`, `:614`, `:740`; `phase57:78`; `phase59:84`; `phase61:180`; `phase62:77`.
`phase62:39-40` is a `to_regprocedure` existence guard, not a call.

Classification: **(iii) only. Grant: nobody.**

### `notify_nearby_for_job(uuid)`

Defined `supabase/phase20_push_notifications.sql:644`. One call site:
`phase20:716`, inside `notify_on_job_location()` (`phase20:709`), which is
itself bound as a trigger at `phase20:724`.

Classification: **(iii) only. Grant: nobody.**

This is the function phase68 excluded on purpose
(`supabase/phase68_deleted_at_authorization.sql:52-59`, restated at `:555`).

### `is_blocked_between(uuid,uuid)` - the one that needs a grant

Defined `supabase/phase13_moderation_photos_location.sql:131`.

(iii) callers, inside other definer bodies: `phase18:161` (inside
`job_request_parties_ok`), `phase20:276` and `phase56:84` (inside
`should_notify`), `phase29:508`, `phase29:560`, `phase30:48`, `phase46:351`,
`phase50:726`, `phase61:261`.

**(iv) callers - four live RLS policies, every one of them `to authenticated`:**

| Policy | Table | Cmd | Definition | `TO` |
| --- | --- | --- | --- | --- |
| `bids_insert_own` | `public.bids` | INSERT | `phase13:233-245`, call at `phase13:243` | `authenticated` (`phase13:236`) |
| `messages_insert_party` | `public.messages` | INSERT | `phase66:143` onward, calls at `phase66:156`, `phase66:165` | `authenticated` (`phase66:146`) |
| `chat_photos_insert_party` | `storage.objects` | INSERT | `phase29:772-790`, call at `phase29:785` | `authenticated` (`phase29:775`) |
| `chat_audio_insert_party` | `storage.objects` | INSERT | `phase29:806-824`, call at `phase29:819` | `authenticated` (`phase29:809`) |

`messages_insert_party` was defined at `phase13:265` and redefined at
`phase36:127`; `phase66:143` is the live definition and carries phase36's block
enforcement forward "BYTE FOR BYTE" (`phase66:138`).

None of the four is granted to `anon` or `public`.

Classification: **(iii) + (iv), authenticated.** An RLS policy expression is
evaluated as the querying role, so the querying role must hold EXECUTE on every
function the expression calls. Section 3 says to grant "ONLY to the roles Q2
proves are required"; Q2 proves `authenticated` is required. Revoking from
`authenticated` and granting nothing - the (iii)-only outcome - would make every
authenticated INSERT into `bids`, `messages`, `chat-photos` and `chat-audio`
fail with `permission denied for function is_blocked_between`. That is a
marketplace outage, not a hardening win.

**Grant: `authenticated`.** Revoke from `public` and `anon` as specified; anon
is not the applicable role of any of the four policies, so removing it is safe.

The house already treats policy-called helpers this way: `is_profile_active` is
called by two `to authenticated` policies (Q3) and is granted exactly
`authenticated` at `supabase/phase67_account_deletion.sql:197`. phase69 makes
`is_blocked_between` match its peer.

### `job_request_parties_ok(uuid,uuid)`

Defined `supabase/phase18_hire_requests_and_replies.sql:153`, re-emitted by
phase68 at `:97`.

No (i) call site. No (ii) call site. No (iii) caller inside another function
body anywhere under `supabase/`. No (iv) reference - see Q3.

The only non-database reference is `scripts/verify-schema.mjs:1091-1092`, the
phase68 reachability probe, which runs over PostgREST with the publishable key
(stated at `scripts/verify-schema.mjs:523`) and treats any response other than
`PGRST202` as proof the function exists (`scripts/verify-schema.mjs:126-133`).
Its own comment at `scripts/verify-schema.mjs:1080-1082` already anticipates the
post-phase69 state: "it is an internal helper, revoked from anon, and a
permission-denied answer still proves it exists."

Section 3 fixes this one by name: **revoke `public`, `anon`; grant
`authenticated`, `service_role`.**

### The ten trigger functions

Every one is `returns trigger` and every one is reachable only through a
`for each row execute function` binding. A repo-wide search for
`perform public.<name>` and `select public.<name>` across `supabase/` and
`scripts/` returned **zero** direct calls:

| Trigger function | Defined | Bound |
| --- | --- | --- |
| `close_requests_on_block()` | `phase18:438` | `phase18:460` |
| `create_default_notification_prefs()` | `phase20:188` | `phase20:205` |
| `enforce_portfolio_cap()` | `phase17:117` | `phase17:136` |
| `handle_new_user()` | `phase7:29`, `phase13:418` | `phase7:54`, `phase13:451` |
| `notify_on_bid()` | `phase20:433` | `phase20:492` |
| `notify_on_job_location()` | `phase20:709` | `phase20:724` |
| `notify_on_job_request()` | `phase20:565` | `phase20:641` |
| `notify_on_job_status()` | `phase20:495` | `phase20:541` |
| `notify_on_review()` | `phase20:727` | `phase20:752` |
| `recompute_profile_rating()` | `phase6:56` | `phase6:80` |

`handle_new_user` appears twice in application source, at
`lib/AuthContext.tsx:120` and `lib/phoneAuth/supabase.ts:92`. **Both are
comments** describing the trigger that consumes `auth.signUp` metadata; neither
is a call. Not a stop condition.

Postgres checks EXECUTE on a trigger function at `CREATE TRIGGER` time, not on
each fire, so revoking EXECUTE from `public`, `anon` and `authenticated` cannot
break an existing trigger. Migrations run as the owning role, which keeps its
own grant. **Grant: nobody, all ten.**

## Q3. RLS policy resolution

Both policies have been redefined several times. Live definitions are the
highest-numbered ones.

**`jobs_select_open`** on `public.jobs`. History: `phase1:24`, `phase13:219`,
`phase29:254`, `phase43:517`. Live definition
`supabase/phase43_job_offers_foundation.sql:517-525`:

```sql
create policy "jobs_select_open"
  on public.jobs for select
  to authenticated
  using (
    status = 'open'
    and visibility = 'open_market'
    and public.is_profile_active(client_id)
  );
```

`TO` clause: **`authenticated`** (`phase43:520`). References exactly one of the
six names: **`is_profile_active`** (`phase43:524`).

**`bids_select_job_owner`** on `public.bids`. History: `phase1:79`,
`phase13:248`, `phase29:263`. Live definition
`supabase/phase29_security_hardening.sql:263-275`:

```sql
create policy "bids_select_job_owner"
  on public.bids for select
  to authenticated
  using (
    exists (
      select 1
      from public.jobs j
      where j.id = bids.job_id
        and j.client_id = auth.uid()
    )
    and public.is_profile_active(worker_id)
  );
```

`TO` clause: **`authenticated`** (`phase29:266`). References exactly one of the
six names: **`is_profile_active`** (`phase29:274`).

Neither policy references `job_request_parties_ok`. Neither is granted to `anon`
or `public`. **No stop condition.** Both corroborate the Q2 rule: a function
called from a policy carries an explicit grant to that policy's role, which is
what `phase67:197` does for `is_profile_active`.

## Q4. phase68 check (d) semantics

Check (d) is `supabase/phase68_deleted_at_authorization.sql:652-671`, described
at `:566-567`. It is **two** assertions, run per function over the five-row table
at `:585-601`, against `proacl` selected at `:613`.

First, `supabase/phase68_deleted_at_authorization.sql:652-658`:

```sql
    -- (d) A null ACL is the DEFAULT ACL, and for functions the default grants
    --     EXECUTE to PUBLIC. That is a failure here, not an absence of one.
    if v_acl is null then
      raise exception
        'PHASE68 SELF-CHECK FAIL (d): % has a default ACL, which grants EXECUTE to PUBLIC.',
        r.sig;
    end if;
```

Second, `supabase/phase68_deleted_at_authorization.sql:659-671`:

```sql
    if exists (
      select 1
      from aclexplode(v_acl) a
      where a.privilege_type = 'EXECUTE'
        and (
          a.grantee = 0
          or a.grantee = (select o.oid from pg_roles o where o.rolname = 'anon')
        )
    ) then
      raise exception
        'PHASE68 SELF-CHECK FAIL (d): % grants EXECUTE to PUBLIC or to anon.',
        r.sig;
    end if;
```

So (d) asserts exactly: `proacl is not null`, **and** no `EXECUTE` aclitem whose
grantee is `0` (PUBLIC) or the `anon` role oid. It asserts nothing else - no
requirement that any particular role *hold* EXECUTE, no owner check, no
`service_role` check. The observed staging failure was the first assertion:
`job_request_parties_ok` still had the default ACL because phase68 re-emits its
body at `:97-113` and emits **no** `revoke`/`grant` for it, and `create or
replace function` preserves the existing ACL. That is why check (d) fired on
that function and not on the other four.

**Confirmed: granting `job_request_parties_ok` explicitly to `authenticated` and
`service_role`, and not to `anon`, makes check (d) pass.** The preceding
`revoke ... from public, anon` materialises the ACL, so it is no longer null,
which clears the first assertion; the resulting aclitems name only the owner,
`authenticated` and `service_role`, none of which is grantee `0` or `anon`,
which clears the second. Check (d) asserts nothing beyond those two conditions,
so nothing else is required of phase69 to make phase68 apply.

## Q5. Grant convention

The house pattern, taken verbatim from the five functions section 1 lists as
already correct. Two statements, `revoke all on function` before
`grant execute on function`, revoking from `public, anon` when `authenticated`
is a grantee and from `public, anon, authenticated` when it is not, wrapped onto
a continuation line only when the signature is long:

`supabase/phase67_account_deletion.sql:196-197` - `is_profile_active`:

```sql
revoke all on function public.is_profile_active(uuid) from public, anon;
grant execute on function public.is_profile_active(uuid) to authenticated;
```

`supabase/phase40_fix_semantic_match_return_type.sql:250-253` -
`match_workers_semantic`:

```sql
revoke all on function public.match_workers_semantic(double precision[], text[], integer, double precision)
  from public, anon;
grant execute on function public.match_workers_semantic(double precision[], text[], integer, double precision)
  to authenticated, service_role;
```

`supabase/phase56_notification_feed.sql:116` - `should_notify`, no grant at all,
which is how "owner only" is written:

```sql
revoke all on function public.should_notify(uuid, uuid, text) from public, anon, authenticated;
```

`supabase/phase39_worker_semantic_matching.sql:683-684` -
`worker_semantic_refresh_queue`:

```sql
revoke all on function public.worker_semantic_refresh_queue(integer) from public, anon, authenticated;
grant execute on function public.worker_semantic_refresh_queue(integer) to service_role;
```

`supabase/phase58_hardening_fixes.sql:235-238` - `transition_job_status`, the
long-signature form again.

Sentinel convention, from `supabase/phase68_deleted_at_authorization.sql:538-539`,
matching `phase56:203-204` and `phase58:250-251`:

```sql
revoke all on function public.phase68_deleted_at_authorization_enabled() from public, anon;
grant execute on function public.phase68_deleted_at_authorization_enabled() to authenticated;
```

phase69 uses `revoke all on function` / `grant execute on function` in that
order, with those exact role lists, and does not invent a style.

## Why these sixteen, and not others

All sixteen are defined in phase6, phase7, phase13, phase17, phase18, phase20
and phase23 - every one of them **before** phase32, which is the file that
revoked the default. `supabase/phase32_function_execute_privileges.sql:82-89`
changes `alter default privileges for role postgres in schema public`, which by
definition only affects functions created *after* it, and phase32's explicit
per-function fix list at `:41-66` names only five functions. Everything created
earlier and never re-granted since kept the original default ACL. That is the
whole mechanism, and it is why the set is exactly this shape.

This also sets the scope of `supabase/phase69_default_privileges.sql`: phase32
already carries the same `alter default privileges` for role `postgres`
specifically. The phase69 file is the unqualified form, which applies to the
current role, and is kept separate so it can be declined.

## Two recorded discrepancies, neither blocking

**1. `job_categories_expanded()` already has grants in the repo.**
`supabase/phase23_realistic_job_seed.sql:88-89` emits:

```sql
revoke all on function public.job_categories_expanded() from public;
grant execute on function public.job_categories_expanded() to authenticated;
```

If those two statements had taken effect, `proacl` would be non-null and the
function would not appear in the staging inventory of sixteen. It does appear,
so in staging they did not take effect. A mechanism is visible in the file:
phase23 carries a `commit;` at `supabase/phase23_realistic_job_seed.sql:65`, and
the function and its grants are at `:80-89`, i.e. after that commit, in a
separate transaction - so a partial paste or an abort after line 65 leaves the
earlier half applied. This cannot be settled without the database and does not
need to be: phase69 sets the ACL explicitly either way.

Note the difference in intent. phase23 wanted `authenticated` only; section 3 of
the dispatch specifies `anon, authenticated`, on the rationale that the function
is SECURITY INVOKER (`phase23:80-86` declares `language sql immutable` with no
`security definer`) and that granting `anon` preserves today's PUBLIC-derived
behaviour. phase69 implements the dispatch decision. If the phase23 intent is
preferred, it is a one-line edit to drop `anon` from that grant; flagged for
Mahmudur, not decided here.

**2. The phase68 `job_request_parties_ok` probe stays green - settled, not
assumed.** After phase69, `anon` loses EXECUTE on `job_request_parties_ok`, and
`scripts/verify-schema.mjs:1112` probes it with the publishable key. The probe
tolerates a permission-denied response (`scripts/verify-schema.mjs:147-154`), so
a `403` keeps it green; only `PGRST202` counts as missing. The open question was
whether PostgREST would instead drop a function the calling role cannot execute
from its schema cache and answer `PGRST202` anyway.

The repo already leans on the answer. `scripts/verify-schema.mjs:274-285` probes
`claim_notification_batch`, `resolve_notification` and `deactivate_push_token`
with the same publishable key, and all three are service_role-only. Those probes
sit in the `phase20_push_notifications.sql` group, which carries **no**
`sentinel:` key (`scripts/verify-schema.mjs:232`), so unlike a pending group its
checks are mandatory: a `PGRST202` from any of them increments `missing` and
exits the harness non-zero. The same tolerant shape has been in place since
phase20 and phase56 and is documented in the comment right above them - "a
permission-denied answer still proves it exists". phase69's block reuses that
established behaviour rather than introducing a new assumption.

This is a static reading of the harness, not a live result: verify-schema needs
staging and was not run here (last recorded run 2026-08-13). If those three ever
did go red, the phase69 and phase68 probes would be red for the same reason, and
the in-database self-check would remain the real proof either way. Line numbers
in this section are as of the phase69 verify commit, after the phase69 block was
inserted.

## What phase69 will do

| Function | revoke from | grant to | Basis |
| --- | --- | --- | --- |
| ten trigger functions | `public, anon, authenticated` | nobody | trigger-bound only, Q2 |
| `enqueue_notification(...)` | `public, anon, authenticated` | nobody | (iii) only, Q2 |
| `notify_display_name(uuid)` | `public, anon, authenticated` | nobody | (iii) only, Q2 |
| `notify_nearby_for_job(uuid)` | `public, anon, authenticated` | nobody | (iii) only, Q2 |
| `is_blocked_between(uuid,uuid)` | `public, anon, authenticated` | `authenticated` | (iv), four `to authenticated` policies, Q2 |
| `job_request_parties_ok(uuid,uuid)` | `public, anon` | `authenticated, service_role` | section 3, unblocks phase68 check (d), Q4 |
| `job_categories_expanded()` | `public` | `anon, authenticated` | section 3, SECURITY INVOKER catalog read |

The five functions section 1 lists as already correct are not named anywhere in
phase69's DDL, and self-check (e) proves their ACLs are byte-identical before
and after.
