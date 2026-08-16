# Stage 4A - pre-redesign fixes

Run date: 2026-08-15. Base: `mainexpo` at `b6f8be7`, equal to `origin/mainexpo`,
tree clean at start. Written incrementally, one section per commit.

Scope was five commits: un-gate payments from `__DEV__`, fix the saved-worker
write, write (not apply) migration phase73, route notification feed taps, and
reconcile the documents. Nothing here was applied to a database.

---

## Commit 1 - payments: gate on EXPO_PUBLIC_PAYMENTS_MODE instead of \_\_DEV\_\_

### What changed

| File | Change |
| --- | --- |
| `lib/adapters/paymentsMode.ts` | resolution rewritten to the declared-mode allow-list |
| `tests/paymentsMode.test.mjs` | new - executes the full resolution table |
| `tests/sandboxCheckout.test.mjs` | one test rewritten to the new contract |

The gate was where the prompt expected it: `lib/adapters/paymentsMode.ts`. The
old rule refused a declared `'sandbox'` whenever `dev` was false and returned
`'disabled'` plus a config error, so a release/TestFlight binary had no
payments loop at all - checkout, release, tip and cash-out were all dead.

New table, an allow-list:

```
'sandbox'                   -> sandbox   (on every build type)
'disabled'                  -> disabled
unset / empty / whitespace  -> dev ? sandbox : disabled
anything else               -> disabled, with the reason in configError
```

Raw value is trimmed and lower-cased before matching. The unset row reproduces
the previous default exactly, so a build that declares nothing is byte-for-byte
unchanged in behaviour.

No payment RPC, amount, cents arithmetic or state-machine rule was touched.
`lib/adapters/payments.ts` needed no edit: it already passed
`process.env.EXPO_PUBLIC_PAYMENTS_MODE` and `__DEV__` into the resolver, and
`__DEV__` is still the correct input for the unset row.

### Two deliberate departures from a literal reading of the prompt

**1. Signature kept as an options object.** The prompt suggested
`resolvePaymentsMode(raw, isDev)` with an "e.g.". An exported pure
`resolvePaymentsMode({ configured, dev })` already existed with identical
semantics and two call sites. Keeping it avoided churning `payments.ts` and
`sandboxCheckout.test.mjs` for no behavioural gain. The contract is the one
specified; only the parameter shape differs.

**2. Test mechanism.** The prompt pointed at `tests/platformFee.test.mjs` and
`tests/offerCopyAndRouting.test.mjs`. Both are source-text-plus-regex; neither
can execute a resolution table, and `platformFee.test.mjs` re-derives the fee
arithmetic by hand rather than calling it. The repo's actual mechanism for
executing a pure `lib/` module is in `tests/sandboxCheckout.test.mjs` -
`pathToFileURL(...)` plus dynamic `import()` of the `.ts` file, relying on
Node 24's native type stripping. No transpiler, no build step, no dependency.
`lib/adapters/paymentsMode.ts`'s own docblock already named that file as its
executing test, so this is the established mechanism, not a new one.

### Labelling

Per the pre-resolved rule: a simulated-money label **exists** in scope
(`screens/CheckoutScreen.tsx`, the `sandboxBanner` section) and is **not**
gated on `__DEV__` - it renders unconditionally in the `sections` array. Rule
two therefore applies: left alone. No label was added, and `CheckoutScreen.tsx`
was not modified.

**Flagged, not fixed:** that banner's copy reads "SANDBOX - development build."
Once payments run on TestFlight, "development build" is no longer accurate for
the build a tester is holding. The instruction was explicit ("if a label exists
and is NOT gated, leave it alone"), and `tests/sandboxCheckout.test.mjs:102`
asserts that exact string, so changing it is a deliberate decision with a test
to update - not something to slip into this commit. Recommend re-wording to
"SANDBOX - simulated payment" in the visual overhaul run.

### Test the prompt did not anticipate

`tests/sandboxCheckout.test.mjs` carried `a release binary can never run
sandbox money`, which asserted the exact rule this commit removes. That is a
**test fixed, not code fixed**: the old assertion encoded the defect as if it
were policy. Rewritten as `payments availability is declared, never inferred
from the build type`, keeping every assertion that is still true (defaults
unchanged, garbage rejected) and inverting only the two the change reverses.
The comment in place records why, so the history is not lost.

### Blocked: `.env.example`

`.claude/settings.json` denies `Read(./.env)`, `Read(./.env.*)`,
`Edit(./.env)`, `Edit(./.env.*)`. `.env.example` matches. Per CLAUDE.md the
deny matrix is non-negotiable and must not be bypassed, so **the operator must
add this by hand**:

```
# Payments availability. Two accepted values:
#   sandbox  - simulated money, real ledger rows, no real provider is reachable
#   disabled - every payment call refuses
# Unset (or blank) means sandbox in a dev build and disabled in a release.
# Any other value is rejected and resolves to disabled.
EXPO_PUBLIC_PAYMENTS_MODE=sandbox
```

`env.d.ts` was left untouched, per the prompt's own condition: it declares only
`SUPABASE_URL` / `SUPABASE_KEY` inside `declare module '@env'` and carries no
`EXPO_PUBLIC_*` declarations to match the style of.

### Also flagged, not fixed

`docs/architecture.md:48` still says payments are "disabled in a release". That
is stale as of this commit. Commit 5's brief permits exactly one correction to
that file (the pending-migrations section) and says to change nothing else, so
it was left. It needs a follow-up edit.

### Checks

- `npm run typecheck` - pass, no output.
- `node --test tests/paymentsMode.test.mjs tests/sandboxCheckout.test.mjs` -
  16 tests, 16 pass, 0 fail.
- A pre-existing `MODULE_TYPELESS_PACKAGE_JSON` warning is emitted when the
  `.ts` module is imported. It predates this run (`sandboxCheckout.test.mjs`
  already did the same import) and is a warning, not a failure.

Committed as `1a7b55e`.

---

## Commit 2 - savedWorkers: ON CONFLICT DO NOTHING, no UPDATE policy exists

### What changed

| File | Change |
| --- | --- |
| `lib/savedWorkers.ts` | `saveWorker` upsert takes `ignoreDuplicates: true` |
| `tests/selfService.test.mjs` | two tests added; `readdirSync`/`dir` helper added |

`saveWorker` issued a plain `.upsert(...)`, which PostgREST compiles to
`ON CONFLICT DO UPDATE`. `ignoreDuplicates: true` makes it `DO NOTHING`, so the
write needs INSERT and nothing more. No grant was widened and no UPDATE policy
was added.

### The prompt's stated cause is wrong, in the opposite direction to the plan's

This is the surprising finding of the commit, and it changes what commit 5 may
write down.

The prompt says: *"The table grants UPDATE to authenticated, but RLS carries
only SELECT, INSERT and DELETE policies and no UPDATE policy... BRAZOS_MASTER_PLAN.md
states the cause as a missing grant. That is wrong."*

The repository says otherwise. `supabase/phase53_worker_self_service.sql:110-111`:

```sql
revoke all on public.saved_workers from public, anon;
grant select, insert, delete on public.saved_workers to authenticated;
```

There is **no UPDATE grant**. The same file defines exactly three policies -
`saved_select_own`, `saved_insert_own`, `saved_delete_own` (lines 92-108) -
so there is **no UPDATE policy** either. A repo-wide scan of `supabase/*.sql`
finds nothing that later adds either one; phase67 only deletes from the table.
Both audits agree: `docs/audits/COMPLETION_REVIEW_2026-08-15.md:131-133`
("phase53 grants **no UPDATE** on `saved_workers` and defines no UPDATE
policy") and `AUDIT_2026-08-12.md:169` ("no UPDATE policy/grant").

So the accurate cause is **both**: no UPDATE grant *and* no UPDATE policy.
Either one alone is enough to refuse the conflict path. CLAUDE.md's hierarchy
puts the code above a document when they disagree about what is implemented,
and `docs/audits/SECURITY_SWEEP_2026-08-15.md:407` explicitly flags the live
table ACL as not determinable statically - no SQL may be run during this run,
so the live grant cannot be checked either way.

**Consequence for commit 5:** BRAZOS_MASTER_PLAN.md near-term #4 is corrected
to name both, rather than asserting the UPDATE grant exists. Writing the
prompt's version would have replaced one inaccurate claim with another.

None of this changes the fix - `DO NOTHING` is correct whichever is missing,
and it is correct even if both were present, because a duplicate save has
nothing to update.

### Idempotency at the call site

`screens/WorkerProfileScreen.tsx:147-155` (`toggleSaved`) needed no change and
was not modified. It surfaces nothing on success and flips `savedByMe` whenever
the write returns no error; with `DO NOTHING` a duplicate save returns no
error, so re-saving lands on saved, silently, with no toast and no throw. There
is no row-count check anywhere that could reinterpret an idempotent write as a
failure - a new test pins that.

`screens/SavedWorkersScreen.tsx` only calls `unsaveWorker`, which was untouched.

The primary key is `(user_id, worker_id)` and the only other column is
`created_at`, so `DO UPDATE` could only restamp when the save happened - which
would be false. Idempotent means the original save time survives.

### Checks

- `npm run typecheck` - pass, no output.
- `node --test tests/selfService.test.mjs` - 8 tests, 8 pass, 0 fail
  (6 pre-existing, 2 new).

Committed as `6b1b133`.

---

## Commit 3 - phase73: NULL-safe owner guard, unsend lifecycle gate (not applied)

### What changed

| File | Change |
| --- | --- |
| `supabase/phase73_null_safe_owner_guard_and_unsend_gate.sql` | new, transcribed |
| `scripts/verify-schema.mjs` | phase73 group appended to `MIGRATIONS` |

**THIS MIGRATION HAS NOT BEEN APPLIED TO ANY DATABASE.** No SQL was executed
during this run. It is a file awaiting a hand-apply in the Supabase SQL Editor
against staging. Until `node scripts/verify-schema.mjs` runs green, its three
checks report PENDING.

No `phase73_*.sql` existed before this commit (70, 71, 72 and their rollbacks
were the highest), so 73 was free as the prompt assumed.

### Transcription notes

The body was transcribed as given, not reconstructed from the older phase
files. Verified after writing:

- Three `$function$` pairs balanced (lines 36/119, 131/169, 185/187), the
  `do $$ ... $$;` block balanced (195/263), `begin;` at 22 and `commit;` at 265.
- All three `revoke all on function` / `grant execute on function` pairs present.
- Operators intact: `#>> '{}'` twice, `->>0`, `is distinct from v_user`.
- The string the self-check greps for (`is distinct from v_user`) is in the body,
  and the string it forbids (`assigned_worker_id <> v_user`) is not.
- Per-function attributes as specified: both RPCs `language plpgsql` /
  `security definer` / pinned `search_path`; the sentinel `language sql` /
  `immutable` / pinned `search_path` and deliberately **not** `security
  definer` (phase70's sentinel was - transcribed as given, not normalised).

**One judgement call.** The prompt's SQL block was bracketed above and below by
a bare 79-dash comment rule. Those were read as the prompt's fences, not file
content: no migration in `supabase/` opens with a bare rule line (phase70 and
phase72 both start at `-- Brazos - Phase NN - ...`), and none has anything
after `commit;`. Both lines are valid SQL comments, so including them would
have been harmless either way; the file starts at the
`-- supabase/phase73_...sql` header line instead.

`is_profile_active(uuid)` and `is_active_user()` both exist (phase29, re-issued
phase67), so neither call can fail on an undefined function.

### Note for whoever applies it

Self-check blocks (f) through (i) select by `proname` **without** a signature
filter, so they inspect *every* overload of `transition_job_status` and
`unsend_message`. `.claude/rules/supabase.md` records that
`transition_job_status` changed arity mid-stream (phase35 dropped the 3-arg
form and recreated it 4-arg). If a stale overload survived on staging, those
blocks can abort on the *old* function while the 4-arg one is perfectly
correct. That is the safe direction - it rolls back rather than passing
silently - but the failure message names only `proname`, so diagnose an
(f)/(g)/(h)/(i) abort by checking for leftover overloads before assuming the
new body is at fault. Blocks (a) through (e) are signature-filtered and are not
affected.

### verify-schema entry

Appended after phase72, which was genuinely the last entry in `MIGRATIONS`
(the array runs `scripts/verify-schema.mjs:203-1285`; 70, 71 and 72 all landed
after 69). `file`, `sentinel` and `checks` are exactly as specified. A
house-style comment header was added inside the entry to match every
neighbouring group - that is the only addition. `ZERO_UUID` is declared at
line 1287, *after* the array, but every reference sits inside a lazily-invoked
arrow function, which is the same pattern phase70's entry already uses.

### Checks

- `node --check scripts/verify-schema.mjs` - SYNTAX OK.
- ASCII scan of the SQL - 9753 bytes, 0 non-ASCII.
- The prompt's exact ASCII command could not be used: `.claude/hooks/guard.ps1`
  denies `node -e ` under GUARD-DYNEXEC. An equivalent byte scan was run
  instead (read all bytes, find the first > 127). Same assertion, same result.
- `scripts/verify-schema.mjs` was NOT executed. It requires `.env` and live
  staging, which CLAUDE.md forbids inside an autonomous run.

Committed as `0cd4827`.

---

## Commit 4 - notifications: route feed taps through notificationRoutes

**Landed in full.** Every category the triggers emit is fixed; nothing was
skipped and the graceful-degradation clause was not needed.

### What changed

| File | Change |
| --- | --- |
| `lib/notificationRoutes.ts` | `resolveTarget()` extracted; `canRouteNotification()` exported |
| `screens/NotificationsScreen.tsx` | local switch deleted; delegates; unroutable rows non-tappable |
| `tests/offerCopyAndRouting.test.mjs` | first test rewritten, one test added |

### The defect

`open()` in the feed gated **all** routing on `typeof jobId === 'string'`, then
ran its own three-way switch inside that gate. Mark-read ran first,
unconditionally. So:

| Payload | Emitted by | Before | After |
| --- | --- | --- | --- |
| `Chat` + `directThreadId` | phase57, phase61 (pre-hire DM) | marked read, went nowhere | opens Chat on the thread |
| `ProfileMain` (no job) | phase20 (review received) | marked read, went nowhere | opens Profile |
| `WorkerJob` + `jobId` | phase20 assigned, phase56 payment_released / dispute_opened | landed on MyJobsHub | opens the job |
| `Chat` + `jobId` | phase20, phase57, phase61 | correct | unchanged, now via the resolver |
| `ClientJobDetail` / `JobDetail` | phase20, phase59/62 | correct (already delegated) | unchanged |

The payload inventory is complete: a scan of every `supabase/*.sql` for
`jsonb_build_object('screen', ...)` yields exactly five distinct screens -
`Chat`, `ClientJobDetail`, `JobDetail`, `WorkerJob`, `ProfileMain` - and all
five are in `TAB_FOR_SCREEN`. So **no category is left non-tappable**; the
predicate is a safety net, not a live case.

### How

`resolveTarget()` was extracted from `handleNotificationData` as a pure
function returning a `RouteTarget | null`. It is split into `direct` targets
(everything the destination needs is in the payload) and `job` targets
(`ClientJobDetail` / `JobDetail`, which take the job ROW and so cost a fetch).
That split is what lets `canRouteNotification()` answer **synchronously** -
the feed must decide tappability while it renders and cannot await a
round-trip.

The screen now calls `handleNotificationData(notification.data)` and nothing
else; its switch, its `navigateAcrossTabs` import and its `MyJobsHub` fallback
are gone. Both the feed and the push tap dispatch on the same resolver, so
they cannot disagree about what is reachable.

A row whose payload resolves to nothing gets `disabled`, no `onPress`, and
`accessibilityRole="text"` - it stays readable but never offers a tap that
would only mark it read. That is the prompt's "explicitly non-tappable".

A screen present in `TAB_FOR_SCREEN` but unhandled by `resolveTarget` returns
null rather than falling through to a guess: a wrong destination is worse than
none.

### Mode boundary

No `switchMode()` call was added and no cross-tree navigation exists. All three
owning tabs - `Messages`, `MyJobs`, `Profile` - are mounted in **both**
navigation trees, so every destination resolves in either mode. A test now
pins that set exactly, which also means a future payload routed to `Home` (the
mode-defining tab) fails the suite rather than silently needing a mode change.

### Test rewritten, and why

`tests/offerCopyAndRouting.test.mjs`'s first test pinned the screen's own
switch by name: the `ClientJobDetail || JobDetail` branch, the
`navigateAcrossTabs('Messages', 'Chat', ...)` call and the
`navigateAcrossTabs('MyJobs', 'MyJobsHub')` fallback. Those assertions
described the duplicated copy this commit deletes, so this is a **test fixed,
not code bent to fit a test**. Rewritten as `the notifications feed owns no
routing of its own`, which asserts the stronger property - the screen
delegates and retains no switch, no `navigateAcrossTabs`, no `MyJobsHub`.

The added test derives the payload inventory from the migrations rather than
restating it, so a future trigger emitting a new `screen` string that the
resolver does not handle fails the suite instead of shipping a dead tap. It
guards its own scan (`emitted.size >= 5`) so an empty read cannot pass the
loops for the wrong reason.

### Checks

- `npm run lint` (`tsc` + `noUnusedLocals` / `noUnusedParameters`) - pass.
  This mattered: dropping the switch orphaned the `navigateAcrossTabs` import,
  which `noUnusedLocals` would have failed on.
- `node --test tests/offerCopyAndRouting.test.mjs` - 8 tests, 8 pass, 0 fail
  (one of mine failed first on a bad `$` anchor in my own regex - the resolver
  slice has trailing whitespace - and was fixed, not deleted).

Committed as `9cbb1af`.

---

## Commit 4b - two more tests pinned the deleted switch (extra commit)

**This is a sixth commit the prompt did not plan for.** It exists because the
per-commit validation policy is narrower than the blast radius of commit 4.

### What happened

The policy for commit 4 was `npm run lint` plus its own test file. Both were
green, so commit 4 landed. The full `npm run verify` run before commit 5 then
failed **2 of 544**:

| Test | File | Pinned |
| --- | --- | --- |
| `tap-through stays inside the shared tabs` | `tests/notificationFeed.test.mjs:56` | `navigateAcrossTabs('Messages', 'Chat'` and `('MyJobs', 'MyJobsHub'` in the screen |
| `every entry point from the audit still opens Chat...` | `tests/unifiedConversation.test.mjs:317` | the same `navigateAcrossTabs` call in the screen |

Both asserted the duplicated switch commit 4 deletes, in files the prompt's
search scope did not name. The second one had **two further rows** that would
have failed next (`navigateChecked(tab, 'Chat', {...})` and
`navigateChecked(tab, data.screen, {...})` in `lib/notificationRoutes.ts`) -
`assert.match` throws on the first failure, so they were masked. All four rows
were updated.

### Fix: tests, not code

Same judgement as commits 1 and 4: these assertions described the copy being
removed, so the tests were corrected, not the code bent back.

- `notificationFeed.test.mjs` - the property it protects ("tap-through stays
  inside the shared tabs, no silent mode switch") is now asserted where the
  destinations actually live: the screen keeps no `navigateAcrossTabs` of its
  own, `TAB_FOR_SCREEN` never names the mode-defining `Home` tab, and neither
  file mentions `switchMode`.
- `unifiedConversation.test.mjs` - the feed's row becomes the delegation, and
  the two resolver rows become the target shapes they now build, plus the one
  `navigateChecked(target.tab, target.screen, target.params)` that dispatches
  them. Chat's three accepted param shapes are unchanged.

### Why it was not folded into commit 4

Commit 4 was already made, and amending is forbidden. Folding source-test edits
into commit 5 would have made a commit titled `docs:` carry non-doc changes.
A separate, honestly-labelled commit was the least-bad option.

**Process note worth carrying forward:** a commit that deletes a shared code
path needs the full suite, not the one test file that names it. Grepping the
whole `tests/` tree for the deleted symbols (`navigateAcrossTabs`,
`MyJobsHub`) before committing would have caught all four rows at once.

### Checks

- `node --test tests/notificationFeed.test.mjs tests/unifiedConversation.test.mjs`
  - 26 tests, 26 pass, 0 fail.
- `npm run verify` - **GREEN: 544 tests, 544 pass, 0 fail, 0 skipped.**

---

## Commit 5 - docs: Stage 4A results, close anon-EXECUTE item, fix stale notes

### HANDOFF.md

Rewritten in full. States the verify result and count (544/544), that phase73
is written but applied nowhere and its three checks report PENDING until
verify-schema is green, that payments now read `EXPO_PUBLIC_PAYMENTS_MODE` with
the unset row reproducing the old `__DEV__` behaviour exactly, that the
operator must add the var to `.env` and restart Metro, and that commit 4 landed
**in full**. It carries the `.env.example` block verbatim for hand-application,
the phase73 overload caveat, and the two follow-ups this run deliberately left
(the checkout banner wording, `docs/architecture.md:48`). It stamps no HEAD -
`tests/governance.test.mjs` forbids it - and does not repeat the production
project ref.

### docs/architecture.md

One correction, as instructed. Layer 4's example was
`supabase/phase67_account_deletion.sql` with four PENDING checks; it is now
phase73 with three, plus a parenthetical that phases 67-72 are applied as of
2026-08-15. Nothing else in the file changed - including line 48's now-stale
claim that payments are "disabled in a release", which the brief put out of
scope and which is flagged in HANDOFF.md instead.

### BRAZOS_MASTER_PLAN.md

- **Near-term #2 (anon-EXECUTE): closed and removed.** The finding is recorded
  in one sentence in the near-term preamble, which is where this file already
  records departures ("when an item lands, it leaves this file").
- **Near-term #3 (transition_job_status): kept, annotated** with the phase73
  filename and "awaiting hand-apply", plus an explicit note that the defect is
  still live because nothing was applied.
- **Near-term #4 (saved_workers): removed as landed** - see the correction
  below.
- **`unsend_message` active-user gate (SS #9): annotated** the same way.
- **In-app notification dead-taps (CR): removed**, with a sentence at the head
  of that section recording what commit 4 achieved, since it landed in full.
- The list renumbered 1-3. Everything else is untouched, including the
  scheduler and SecureStore items.

**The saved_workers cause was NOT corrected as the brief specified, because the
brief was wrong.** It instructed: *"it is a missing UPDATE policy under RLS, not
a missing grant; the table does grant UPDATE to authenticated."* The plan's
existing text already read "a table with no UPDATE grant or policy", which
`supabase/phase53_worker_self_service.sql:110-111` confirms -
`grant select, insert, delete on public.saved_workers to authenticated`, no
UPDATE, and only three policies defined. Applying the instructed edit would
have replaced an accurate claim with an inaccurate one. The closure sentence
states both absences and notes that either alone refuses the conflict path.

### Checks

- `npm run verify` re-run after the documentation edits, because
  `tests/governance.test.mjs` asserts over `HANDOFF.md`,
  `BRAZOS_MASTER_PLAN.md` and `docs/architecture.md` as ACTIVE_DOCS.

---

## Run summary

Six commits on `mainexpo`. Base gate passed: branch `mainexpo`, HEAD equal to
`origin/mainexpo` at `b6f8be7`, tree clean. `CLAUDE.md` was never modified and
showed no local edit at any point.

| # | Commit | Effect |
| --- | --- | --- |
| 1 | `1a7b55e` | payments gated on `EXPO_PUBLIC_PAYMENTS_MODE` |
| 2 | `6b1b133` | saved-worker write is `ON CONFLICT DO NOTHING` |
| 3 | `0cd4827` | phase73 written (NOT applied) + verify-schema group |
| 4 | `9cbb1af` | notification feed taps delegate to the shared resolver |
| 4b | `eeacf8e` | two further tests that pinned the deleted switch |
| 5 | this one | documentation |

**Live in the tree:** the payments gate (behaviour-identical until the env var
is set), the saved-worker fix, the notification routing fix.

**Needs the operator:** hand-apply phase73 then run verify-schema; add
`EXPO_PUBLIC_PAYMENTS_MODE=sandbox` to `.env` and restart Metro; add the
documented block to `.env.example` by hand.

**Never done, by constraint:** no SQL executed anywhere, production never
contacted or named in any file this run created, `.claude/` and the locked
screen list untouched, no new dependency, no push.

### Where the brief and the repository disagreed

Recorded because both would otherwise have propagated as false claims:

1. **saved_workers** - the brief said the table grants UPDATE to
   `authenticated`; phase53 grants only `select, insert, delete`. The fix was
   unaffected; the documentation claim was not.
2. **The `.env.example` edit and the ASCII-check command** were both blocked by
   protected controls (`Read`/`Edit` deny on `./.env.*`, and GUARD-DYNEXEC on
   `node -e `). Neither was bypassed; an equivalent check was substituted and
   the file edit was handed to the operator.
3. **Commit 4's blast radius** exceeded its stated search scope by two test
   files, which the per-commit validation policy could not have caught. Hence
   commit 4b.

---
---

# Stage 4A-tail - 2026-08-16

Run date: 2026-08-16. Base: `mainexpo` at `4d78ce9`, tree clean at start.
Written incrementally, one section per commit. **No SQL was executed and no
migration file was written in this run.** Three commits: the checkout sandbox
label, the notification category reconciliation, and the documentation
truth-up.

Since the Stage 4A run above closed, two things changed on the operator's side
and are now facts rather than pending items:

- **phase73 is APPLIED to staging** (`zzkumxcjtbqoselzptig`) and
  `node scripts/verify-schema.mjs` ran green on 2026-08-16 - every group OK,
  zero MISSING, zero PENDING, including the three phase73 checks. The
  NULL-unsafe owner guard in `transition_job_status` and the missing
  active-user gate on `unsend_message` are both closed in the database.
- **The residual anon-EXECUTE question is settled** by a live `pg_proc` read on
  staging, 2026-08-16. Exactly ONE function in schema `public` is EXECUTE-able
  by `anon`: `job_categories_expanded()`, SECURITY INVOKER, returns boolean,
  ACL `postgres=X/postgres | anon=X/postgres | authenticated=X/postgres`. That
  is the deliberate one (phase69 re-granted it). `worker_job_stats`,
  `deactivate_push_token` and `resolve_notification` did NOT drift. **No
  remediation migration is needed.** This evidence cannot be re-derived from
  any file in the repository.

---

## Tail commit 1 - the checkout sandbox banner states the money fact, not the build fact

### What changed

| File | Change |
| --- | --- |
| `screens/CheckoutScreen.tsx` | banner copy rewritten; banner gated on the resolved mode; confirm-dialog copy corrected |
| `tests/sandboxCheckout.test.mjs` | the pinned-string assertion updated, two negative guards added |
| `tests/paymentsMode.test.mjs` | two assertions added to the label test |

### The defect

The banner read, verbatim, `SANDBOX — development build. No real money is
charged, held or moved.` The first clause is a claim about the BUILD TYPE.
Stage 4A commit `1a7b55e` moved payments availability to
`EXPO_PUBLIC_PAYMENTS_MODE`, so sandbox payments now run on a release binary -
and on TestFlight that sentence is simply false to the tester reading it. This
was flagged, not fixed, in Stage 4A commit 1 above ("Flagged, not fixed").

New copy, as specified:

```
SANDBOX — no real money moves. No real money is charged, held or
transferred. The payment states below are real app records used to test
the flow.
```

True on a development build and on TestFlight, and it states the money fact.
"moved" became "transferred" for one reason only: `No real money is charged`
is pinned by `tests/paymentsMode.test.mjs`, and keeping that phrase verbatim
avoided weakening a live assertion for a cosmetic word.

### The gate

The banner was previously an unconditional entry in the `sections` array. It is
now spread in only when `paymentsMode === 'sandbox'`.

This is belt-and-braces rather than a behaviour change, and the reason is worth
recording: `DetailScreen` renders `sections` **only** when `isReady(state)`,
and `CheckoutScreen`'s state resolves to `permissionDenied` whenever
`paymentsMode !== 'sandbox'` - so the banner could not already appear on a
disabled build. That made the correct behaviour an incidental consequence of
the order of a five-arm ternary in an unrelated state machine. It is now
structural.

`configError` needs no separate condition: `resolvePaymentsMode` returns
`mode: 'disabled'` on **every** path that sets a non-null `configError`, so
`paymentsMode === 'sandbox'` already implies `configError === null`. A second
runtime check would be unreachable code. That reasoning is in a comment at the
gate so a future reader does not "fix" the omission.

### One deliberate extension beyond the literal brief

The brief named the banner. The same screen's `ConfirmDialog` message carried
the identical falsehood one tap later:

> "No real money is being charged **in this development build**."

Changed to "No real money is being charged — this is sandbox." It is the same
defect, the same false build-type claim, in the same file, shown to the same
tester, and CLAUDE.md's invariant is that money labels follow the payment state
machine *everywhere, including UI copy*. Fixing the banner and leaving this
would have shipped a half-fix. Flagged here because it was not in the brief;
it is a one-line revert if unwanted. `tests/sandboxCheckout.test.mjs` pinned
the old string too, and was updated in the same commit.

### Assertions updated, and the direction of the fix

Two files pinned the old strings. Both are **tests fixed, not code bent**: they
asserted the copy this commit is deliberately correcting.

| File | Was | Now |
| --- | --- | --- |
| `tests/sandboxCheckout.test.mjs` | `/SANDBOX — development build\. No real money/` | `/SANDBOX — no real money moves\. No real money is charged/` |
| `tests/sandboxCheckout.test.mjs` | `/No real money is being charged in this development build/` | `/No real money is being charged — this is sandbox/` |

Three guards were added so the string cannot regress:

- `doesNotMatch(/SANDBOX — development build/)` and
  `doesNotMatch(/in this development build/)` in `sandboxCheckout.test.mjs`.
- `doesNotMatch(/development build/)` over the comment-stripped screen in
  `paymentsMode.test.mjs` - the label survives onto a release binary, so
  anything it claims has to be true there too.
- `match(/paymentsMode === 'sandbox'[\s\S]{0,400}styles\.sandboxBanner/)` -
  the banner renders iff the resolved mode is sandbox.

The pre-existing `doesNotMatch(/__DEV__[\s\S]{0,200}SANDBOX/)` still holds:
nothing in the screen references `__DEV__`.

No RPC, amount, cents arithmetic, payment state or state-machine rule was
touched. This commit is a label.

### Checks

`npm run verify` in full (lint, then `node --test tests/*.test.mjs`) -
**544 tests, 544 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo.**
