# phase68 diagnostic - ban checks routed through is_profile_active

Run date: 2026-08-14. Base: `mainexpo` @ `e3bc795`, clean tree, baseline
`npm run verify` green (519 tests, 0 fail).

No database was contacted at any point in this run. Every statement below is
derived from the SQL text in `supabase/` and the TypeScript in `lib/` and
`screens/`. Where a claim could only be settled by the live database, it is
labelled as such.

## Q5 up front: no phase67 P0 defect

Q5 asked whether a completed job belonging to the deleting user survives
`delete_my_account()`. It does. The only status write in that function is
`supabase/phase67_account_deletion.sql:409-412`:

```sql
  update public.jobs
     set status = 'cancelled'
   where client_id = v_user
     and status = 'open';
```

The filter is `status = 'open'`, an exact equality, so a `completed` row is
never matched. The gate that runs before it agrees: `account_deletion_blockers()`
at `phase67:264` reads

```sql
        or j.status not in ('completed', 'cancelled', 'open', 'draft')
```

so a completed job is not a blocker either. And the closing inventory at
`phase67:610-614` lists `jobs` among the rows "RETAINED DELIBERATELY, all now
pointing at the tombstone". Completed work survives, still attributed, resolving
through the tombstone profile. Nothing to escalate; no HANDOFF blocker is
created for this.

## Q1. Inventory of every function referencing `banned`

Twelve public functions reference `banned`. `is_profile_active` is the canonical
predicate and is excluded from the count of problems, leaving the eleven below.

Two names that a naive grep pulls in are NOT on this list, and the reason is the
authoritative-file rule: a function may be replaced across several phase files,
and the highest-numbered file defining it wins.

- `accept_bid` reads `profiles.banned` at `phase30:47`, but its authoritative
  definition is `phase47_bids_projection_trigger.sql:315`, which does not read
  `banned` at all. It is a deprecated compatibility shim per CLAUDE.md and is
  not a live ban-check site.
- `is_active_user()` reads `profiles.banned` at `phase13:123` and `phase29:34`,
  but its authoritative definition is `phase67:199-207`, whose entire body is
  `select public.is_profile_active(auth.uid());`. It is already correct.

| # | Function | Class | `banned` site (file:line) | Authoritative defining file | Gate subject |
|---|---|---|---|---|---|
| 1 | `job_request_parties_ok(uuid, uuid)` | GATE-OTHER | phase18:166 | `phase18_hire_requests_and_replies.sql:153` | `p_a` and `p_b` (both parameters) |
| 2 | `should_notify(uuid, uuid, text)` | FILTER | phase56:80, phase56:93 | `phase56_notification_feed.sql:59` | recipient list; `p_recipient` and `p_actor` |
| 3 | `notify_nearby_for_job(uuid)` | FILTER | phase20:673 | `phase20_push_notifications.sql:644` | recipient fan-out; `p.id` joined from `notification_prefs.user_id` |
| 4 | `transition_job_status(uuid, text, jsonb, jsonb)` | GATE-SELF | phase58:167 | `phase58_hardening_fixes.sql:138` | `v_user`, assigned `:= auth.uid()` at phase58:150 |
| 5 | `match_workers_semantic(double precision[], text[], integer, double precision)` | FILTER | phase40:187 | `phase40_fix_semantic_match_return_type.sql:69` | result set; `p.id` joined from `worker_semantic_docs.worker_id` |
| 6 | `worker_semantic_refresh_queue(integer)` | FILTER | phase39:413, phase39:422 | `phase39_worker_semantic_matching.sql:395` | queue rows; `pr.id` joined from `profiles` / `worker_semantic_docs` |
| 7 | `ban_user(uuid, uuid)` | SUBJECT | phase13:306 | `phase13_moderation_photos_location.sql:289` | n/a - writes `banned = true` |
| 8 | `unban_user(uuid)` | SUBJECT | phase13:365 | `phase13_moderation_photos_location.sql:352` | n/a - writes `banned = false` |
| 9 | `admin_open_reports()` | SUBJECT | phase13:397 | `phase13_moderation_photos_location.sql:375` | n/a - returns `rd.banned` as a column |
| 10 | `current_user_is_banned()` | OTHER | phase29:130 | `phase29_security_hardening.sql:122` | n/a - see below |
| 11 | `handle_new_user()` | OTHER | phase13:428 | `phase13_moderation_photos_location.sql:418` | n/a - see Q6 |

Notes on the two OTHER rows:

- `current_user_is_banned()` is a caller-state accessor, not a gate. It returns
  `coalesce((select p.banned from public.profiles p where p.id = auth.uid()), false)`,
  so it FAILS OPEN on a missing row. Zero function bodies call it; its only
  caller anywhere is `lib/profiles.ts:132`. It is left untouched by phase68 and
  recorded as a removal candidate for a future migration that also does the
  client sweep.
- `handle_new_user()` reads `public.banned_phones`, not `public.profiles.banned`.
  See Q6.

The claim in `BRAZOS_MASTER_PLAN.md` and
`docs/runbooks/phase67-account-deletion.md` that "six SECURITY DEFINER bodies
read profiles.banned" is arithmetically defensible but was never enumerated: six
is exactly the GATE + FILTER count (rows 1-6). It is not the count of functions
touching `banned`, which is eleven. Both documents are corrected in commit C3.

## Q2. Fix form per GATE / FILTER function

| Function | Lookup shape | Form |
|---|---|---|
| `job_request_parties_ok` | single-row `exists` over at most two ids | A |
| `should_notify` | two single-row `exists` probes | A (see deviation) |
| `notify_nearby_for_job` | predicate inside a set-returning `for` loop already joining `profiles` | B - EXCLUDED, see below |
| `transition_job_status` | single-row `exists` on `auth.uid()` | A |
| `match_workers_semantic` | predicate inside a CTE already joining `profiles` | B |
| `worker_semantic_refresh_queue` | two predicates, both inside queries already joining `profiles` | B |

### Recorded deviation: `should_notify` uses FORM A, not FORM B

Section 8 maps FILTER to FORM B ("add `and p.deleted_at is null` beside the
existing banned predicate"). That recipe is only correct where the existing
predicate is written in the ACTIVE direction (`not coalesce(p.banned, false)` or
`coalesce(p.banned, false) = false`). Both of `should_notify`'s sites are
written in the BANNED direction:

```sql
  if exists (select 1 from public.profiles p where p.id = p_recipient and p.banned) then
    return false;
```

Appending `and p.deleted_at is null` there would read "exists a profile that is
banned AND not deleted", which is strictly NARROWER than today. A deleted but
unbanned account would stop matching, the `exists` would be false, and the
function would return true - enqueuing a notification for a deleted account.
That is the opposite of the mission.

FORM A is used instead: `if not public.is_profile_active(p_recipient) then`.
Section 8's own FORM A text anticipates this hazard ("the old code tested
BANNED, the new predicate tests ACTIVE"). FORM B's stated rationale is "never
put a per-row definer call in a set scan"; `should_notify` contains no set scan,
so FORM A does not violate that intent. The same reasoning applies to the
`p_actor` site at phase56:93.

## Q3. Blast radius

Patching moves each site from fail-open to fail-closed on a missing or
tombstoned profile row. Both sub-questions are answered per function.

### (a) Can any flow run before `handle_new_user` creates the profiles row?

**No, for all six.** The trigger is
`phase13_moderation_photos_location.sql:448-451`:

```sql
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

`after insert on auth.users` means the `profiles` row is written inside the same
transaction as the auth row. No authenticated request can exist before that
transaction commits, so no caller can reach any of the six with its own profile
row absent. Signup itself calls none of the six: a search of `lib/` and
`screens/` finds `is_profile_active` referenced only at `lib/profiles.ts:157`
and `current_user_is_banned` only at `lib/profiles.ts:132`, neither on a signup
path, and none of the six named in either directory.

Per function: `transition_job_status` needs an assigned job; `job_request_parties_ok`
needs two existing users; `match_workers_semantic` and
`worker_semantic_refresh_queue` filter OTHER people's rows and already drop a
missing row via the join; `should_notify` addresses an existing recipient;
`notify_nearby_for_job` inner-joins `notification_prefs`. No answer is yes.

### (b) Can `auth.uid()` be NULL on a real path?

**No, for all six.** Only service_role, cron, pg_cron or webhook paths with no
JWT qualify, and a definer-to-definer call does not (given, section 6).

- `transition_job_status` - no. It is the only GATE-SELF. It already raises
  before the ban check: phase58:160 is
  `if not found or v_user is null or v_job.assigned_worker_id <> v_user then`,
  so a null uid is fail-closed today and the patch changes nothing there.
- `should_notify`, `job_request_parties_ok` - no. Neither reads `auth.uid()`;
  both take explicit uuid parameters.
- `match_workers_semantic` - no. It already raises `'Sign in to search for
  workers.'` at phase40:120-122 when `v_viewer` is null, and the patched
  predicate applies to other people's rows.
- `worker_semantic_refresh_queue` - no. This is the one genuine no-JWT path
  (service_role, called by the `worker-search` Edge Function), so `auth.uid()`
  IS null there. It does not matter: the function never reads `auth.uid()`. Its
  predicates filter candidate worker rows by `pr.banned`, and adding
  `pr.deleted_at is null` narrows which workers get embedded, not who may call.
- `notify_nearby_for_job` - no, and excluded anyway.

No function is excluded under E1.

## Q4. phase67 interaction - `delete_my_account` ordering

**(a) Does it call any GATE function? No.**

`delete_my_account` calls exactly three things: `account_deletion_blockers()`
(phase67:353), `withdraw_offer(v_offer.id)` (phase67:449), and the implicit
triggers on its own writes. It specifically does NOT call
`transition_job_status`. phase67:365-374 says so explicitly and gives the
reason:

```
  --     WHY THIS IS A RAW UPDATE AND NOT transition_job_status().
  --     The canonical lifecycle RPC cannot perform this transition. Its live
  --     definition is phase58's
  --     transition_job_status(uuid, text, jsonb, jsonb), and:
  --       * its allow-list is exactly `assigned -> in_progress` and
  --         `in_progress -> completed`. Anything else - including
  --         'open' -> 'cancelled' - raises 'Invalid job status transition'.
  --       * its authorisation is `v_job.assigned_worker_id <> v_user`: only
  --         the ASSIGNED WORKER may call it. The caller here is the job's
  --         CLIENT, and an open job has no assigned worker at all.
```

**(b) Ordering: every call happens BEFORE the tombstone is stamped.**

The `deleted_at` write is the last profile mutation in the function,
phase67:512-525:

```sql
  update public.profiles
     set full_name         = 'Deleted user',
         ...
         deleted_at        = now()
   where id = v_user;
```

Line 524 is where `deleted_at = now()` lands. Every function call and every
status write precedes it: the blocker gate at 353, the raw job cancel at
409-412, and the `withdraw_offer` loop at 432-458. The trigger fan-out from the
job cancel (which reaches `should_notify` via `notify_on_job_status`) therefore
also runs at line 409, while the caller is still active.

So phase68 cannot break account deletion. **No function is excluded under E2.**
The tombstone-then-call hazard the prompt anticipated does not exist in this
schema. No phase69 reorder is required as a precondition for anything here.

One forward-looking note, not a blocker: if a future migration ever moves the
`deleted_at` stamp earlier, or routes the open-job cancel through a patched
`transition_job_status`, that ordering becomes load-bearing. The safe ordering
invariant to preserve is: **stamp `deleted_at` last.**

## Q6. `handle_new_user()`

**OTHER.** It gates nothing on `profiles.banned`. Its only ban-related read is
`public.banned_phones` at phase13:427-431, a phone blacklist consulted to abort
signup. It is also the function that CREATES the `profiles` row, so routing it
through `is_profile_active` would be circular - the row does not exist yet when
it runs. Left alone, as instructed.

## Exclusions

### `notify_nearby_for_job(uuid)` - EXCLUDED

**Code: E5 (new).** Section 5's E1-E4 does not cover this case. Section 0
directs the narrower option plus a written record, which is what this is.

**Evidence.** The function body contains a non-ASCII character, U+00B7 MIDDLE
DOT, inside a user-visible string literal at `phase20_push_notifications.sql:693`:

```sql
      left(v_job.title, 80) || coalesce(' <U+00B7> ' || v_job.location, ''),
```

(rendered here with the codepoint spelled out, because this file is ASCII too.)

`create or replace function` re-emits the entire body, so patching this function
requires writing that literal into `supabase/phase68_deleted_at_authorization.sql`.
Section 4 forbids non-ASCII in every file written by this run. Replacing the
separator with an ASCII character would change user-visible notification copy,
which section 8 forbids ("the ONLY change being the lifecycle predicate"). The
two constraints cannot both be satisfied, so the function is dropped from the
migration rather than either rule being bent.

**Why the exclusion costs little.** A deleted account is already structurally
excluded from this fan-out. `delete_my_account` deletes the row this function
selects from, at phase67:476-478:

```sql
  if to_regclass('public.notification_prefs') is not null then
    delete from public.notification_prefs where user_id = v_user;
  end if;
```

and the fan-out is driven by an inner join on exactly that table,
phase20:665-669:

```sql
    select np.user_id
    from public.notification_prefs np
    join public.profiles p on p.id = np.user_id
    where np.nearby_jobs
```

No `notification_prefs` row means no candidate row, tombstone or not. The patch
would be defence in depth against a future path that recreates prefs for a
deleted account, not the closing of a live hole.

**Precondition to patch in a later phase.** Either (i) a migration explicitly
permitted to carry UTF-8, or (ii) an explicit decision to encode the separator
as `chr(183)` so the emitted source stays ASCII while the runtime string is
byte-identical. With either in hand, the whole fix is one line added after
`phase20:673`:

```sql
      and not coalesce(p.banned, false)
      and p.deleted_at is null
```

### Functions deliberately not patched, by instruction

`is_profile_active` (canonical), `ban_user`, `unban_user`, `admin_open_reports`
(all SUBJECT - `banned` is the data, not a gate), `current_user_is_banned`
(OTHER; removal candidate, not deleted here), `handle_new_user` (OTHER).

## Comment normalisation applied to re-emitted bodies

Section 4 requires ASCII "including SQL comments". Three of the five patched
bodies carry a U+2014 EM DASH inside a `--` comment. Re-emitting the body means
writing those bytes, so each was replaced with an ASCII hyphen. These are
comment-only, zero behaviour change, and are listed here so the substitution is
never mistaken for drift:

| Source | Comment text |
|---|---|
| phase58:173 | `The retry's media is ignored <emdash>` |
| phase40:150 | `checked against its real source type <emdash> see the file` |
| phase40:151 | `header <emdash> and none of them needed a cast.` |
| phase39:404 | `have never had a document built at all <emdash> a profile that` |

The same four substitutions are applied identically in
`supabase/phase68_rollback.sql`, so the rollback restores behaviour exactly
while also staying ASCII. No string literal was altered in any patched function;
the one function whose literal would have needed altering is excluded above.

## Recorded drift, not fixed by this run

`tests/workerMatching.test.mjs:293-307` asserts the ban predicates of
`match_workers_semantic` and `worker_semantic_refresh_queue` by reading
**phase39**, even though its own header comment (lines 26-30) explains that
phase40 is the live version of `match_workers_semantic`. After phase68 the live
version of both functions is phase68. The assertions still pass, because phase39
is untouched, but they will be asserting against a historical file. `tests/` is
not in this run's MAY MODIFY list, so this is recorded rather than corrected.

## Convention sources read

`.claude/rules/supabase.md`, plus the two highest-numbered migrations
(`phase66_messaging_locked_until_confirmed.sql`,
`phase67_account_deletion.sql`) for sentinel style, grant placement and header
shape. `scripts/verify-schema.mjs:1009-1055` for the phase-block idiom.

## verify-schema coverage note

`should_notify` (`scripts/verify-schema.mjs:247`) and
`worker_semantic_refresh_queue` (line 511) are already probed today as mandatory
checks, despite being revoked from `anon` and `authenticated`. That is the
evidence that PostgREST exposes these functions in its schema cache regardless
of the EXECUTE grant, and therefore that a reachability probe for every patched
function is honest rather than a guaranteed false MISSING. All five patched
functions get one, plus the sentinel.
