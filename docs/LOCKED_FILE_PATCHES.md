# LOCKED_FILE_PATCHES — authorized-ready diffs for locked files

Written 2026-08-10 (pre-review-hardening session). Every finding here lives in
a file this session was forbidden to modify. **Nothing below has been applied.**
Each section carries the exact diff, the risk of leaving it unpatched, and a
release-blocker verdict, so each can be authorized individually. The four
numbered findings are DECISIONS.md "NEEDS REVIEW" items 2–5, verbatim in
origin; the addendum entries surfaced during this session's sweeps.

Apply order is free — no diff below depends on another.

---

## 1 · hooks/useReactions.ts — fixed channel topic collides across mounts

**File:** `hooks/useReactions.ts` (LOCKED — manifest recursive dep)

Two chats for the same job mounted at once (React Navigation keeps prior
screens mounted; Chat is registered in four stacks) both open
`reactions:job:<jobId>`. supabase-js dedupes channels **by topic string**, and
`removeChannel()` tears down asynchronously — the second mount can receive the
first's still-tearing-down channel and throw
`cannot add postgres_changes callbacks... after subscribe()`. useOpenJobs.ts
lines 12–28 document the identical failure and carry the sanctioned fix.

**Diff (the useOpenJobs uniquifier pattern):**

```diff
-import { useCallback, useEffect, useMemo, useState } from 'react';
+import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
 ...
+  // Per-instance + per-effect-run topic — see useOpenJobs.ts lines 12-28 for
+  // why both are required (async removeChannel + topic-string dedupe).
+  const instanceId = useId();
+  const runRef = useRef(0);
 ...
   useEffect(() => {
     if (!jobId) return;
     const channel = supabase
-      .channel(`reactions:job:${jobId}`)
+      .channel(`reactions:job:${jobId}:${instanceId}:${runRef.current++}`)
       .on(
```

(If the import line differs, keep its existing names and add `useId`/`useRef`.)

**Risk unpatched:** a thrown `cannot add postgres_changes callbacks` error on
the second mount — reactions stop updating live in one of the two chats;
worst case a red box in dev. Requires the same job's chat open from two stacks
(Messages + MyJobs is enough), which real navigation produces.

**Release blocker:** **NO** — degraded realtime, recoverable by leaving the
screen; but it is a 1-line-plus-imports fix and should ride the next
authorized batch.

---

## 2 · hooks/useConversations.ts — fixed topic + resubscribe every token refresh

**File:** `hooks/useConversations.ts` (LOCKED — manifest recursive dep)

Two defects, one effect (lines 96–117):

1. Topic `'messages:inbox'` is a fixed string — same collision class as §1.
2. The effect is keyed `[user, refresh]`, and `user` is the Supabase **user
   object**, whose reference changes on every hourly token refresh — tearing
   down and recreating the channel (and any queued events with it) once an
   hour for no data change.

**Diff:**

```diff
-import { useCallback, useEffect, useState } from 'react';
+import { useCallback, useEffect, useId, useRef, useState } from 'react';
 ...
+  const instanceId = useId();
+  const runRef = useRef(0);
 ...
   useEffect(() => {
     if (!user) return;
     const channel = supabase
-      .channel('messages:inbox')
+      .channel(`messages:inbox:${instanceId}:${runRef.current++}`)
       .on(
 ...
-  }, [user, refresh]);
+    // user?.id, not user: the object reference rotates on every token
+    // refresh; the id does not. Prevents hourly channel churn.
+  }, [user?.id, refresh]);
```

**Risk unpatched:** hourly missed-event windows on the inbox (a message
arriving during the resubscribe gap never appears until manual refresh), plus
the §1 collision if two inbox instances ever mount.

**Release blocker:** **NO**, but it silently degrades the inbox's realtime
promise on every session longer than an hour — highest value of the three
hook patches.

---

## 3 · hooks/useChat.ts + hooks/useOpenJobs.ts — no refetch on channel rejoin

**Files:** `hooks/useChat.ts`, `hooks/useOpenJobs.ts` (both LOCKED)

Both subscribe with a bare `.subscribe()`. After the app backgrounds long
enough for the socket to drop, the channel rejoins — but rows inserted while
offline were never delivered and are not refetched: the chat (or the feed) is
silently stale until a manual refresh. REVIEW_GUIDE.md §6 flags this for the
human pass.

**Diff (same shape in both files; useChat shown):**

```diff
-      .subscribe();
+      .subscribe((status) => {
+        // A (re)join after a dropped socket delivers nothing that happened
+        // while away — refetch to close the gap. Fires on first join too,
+        // which is a harmless double-read of a just-read list.
+        if (status === 'SUBSCRIBED') refresh();
+      });
```

For `useChat.ts`, `refresh` is in scope (defined above the effect). For
`useOpenJobs.ts` the same line works verbatim — `refresh` is the useCallback
at line 34.

**Risk unpatched:** stale chat/feed after every backgrounding — the exact
"missed messages until manual refresh" behaviour REVIEW_GUIDE tells the
device pass to look for.

**Release blocker:** **NO** for a sandbox release; **YES** for any release
marketed as realtime messaging. Recommend applying with §1/§2 as one
realtime batch and re-running the device realtime checklist once.

---

## 4 · components/JobProgress.tsx — duplicates the lifecycle staging map

**File:** `components/JobProgress.tsx` (LOCKED — manifest recursive dep)

Lines 5–15 hard-code a three-step `STEPS`/`ORDER` map
(assigned → in_progress → completed) parallel to `lib/jobLifecycle.ts`, the
one lifecycle derivation point (run addendum §1). The two already disagree:
deriveJobLifecycle knows `en_route`/`arrived`/`awaiting_approval`/`disputed`,
which this component collapses into whichever of its three buckets `status`
string-matches — and a job in `awaiting_approval` renders as merely
"In progress".

**Diff (minimal: keep the 3-dot visual, derive placement from the canonical
map instead of a local one):**

```diff
+import { deriveJobLifecycle, trackStepIndex } from '../lib/jobLifecycle';
 ...
-const ORDER: Record<string, number> = {
-  assigned: 0,
-  in_progress: 1,
-  completed: 2,
-};
 ...
-  const current = ORDER[status] ?? 0;
+  // trackStepIndex covers the full phase51 ladder; collapse its 0-4 track to
+  // this component's three dots (hired / working / done) so the visual stays
+  // but the placement comes from the ONE derivation point.
+  const track = trackStepIndex(deriveJobLifecycle({ status }));
+  const current = status === 'completed' ? 2 : track >= 2 ? 1 : 0;
```

(Exact mapping to be reviewed at apply time against deriveJobLifecycle's
input type — it takes the job row's lifecycle fields, so callers
(ClientJobDetailScreen, WorkerJobScreen) may need to pass the job instead of
the bare status string. That widening is why DECISIONS offered the
alternative: leave it until the §H.1 enum migration kills the map anyway.)

**Risk unpatched:** a second source of truth for lifecycle staging that has
already drifted once; cosmetic mislabeling today, real divergence the next
time a state is added.

**Release blocker:** **NO** — DECISIONS' "leave until the §H.1 enum lands"
option remains defensible. Authorize only if the enum migration is far off.

---

## Addendum — surfaced by this session's sweeps (same fields, same rules)

### A5 · screens/BrowseJobsScreen.tsx — own posted jobs inflate POTENTIAL EARNINGS

**File:** `screens/BrowseJobsScreen.tsx` (LOCKED — screen 48). This is work
item 3 of the session brief; **both** of its seams (the screen's stats memo
and useOpenJobs) are locked, so it lands here instead of in code.

The banner sums `budget_cents` over the whole feed (lines 105–109). The feed
deliberately includes the user's own posted jobs (their card shows Edit), and
a user cannot earn from their own job — so their own budgets inflate
"POTENTIAL EARNINGS ACROSS N JOBS".

**Diff (screen-side, keeps the card and its Edit action untouched; perspective
stays ModeContext-driven — no new prop anywhere):**

```diff
   const stats = useMemo(() => {
     let cents = 0;
-    for (const job of jobs) cents += job.budget_cents ?? 0;
-    return { cents, count: jobs.length };
-  }, [jobs]);
+    let count = 0;
+    for (const job of jobs) {
+      // Own posted jobs stay IN the feed (their card carries Edit) but out
+      // of the earnings sum — you cannot earn from your own job.
+      if (profile?.id && job.client_id === profile.id) continue;
+      cents += job.budget_cents ?? 0;
+      count += 1;
+    }
+    return { cents, count };
+  }, [jobs, profile?.id]);
```

`profile` is already in scope (`useProfile()`, line 79); `OpenJob.client_id`
exists (`lib/jobs.ts:241`). The `across N jobs` caption uses `stats.count`, so
both figures stay consistent.

**Unit test to land WITH the patch** (both modes; add to a new or existing
test file — the logic is pure once extracted, or assert via source scan):
sum excludes rows where `client_id === viewer`, count matches, and a
customer-mode session (same account) sees identical feed cards — the sum is
worker-banner-only, so no customer surface changes.

**Risk unpatched:** a worker plans their day against a number that includes
money they cannot earn. Wrong marketplace math on the primary worker surface.

**Release blocker:** **YES** under CLAUDE.md's "money figures must be true"
bar — the number is wrong whenever the viewer has an open posted job.

### A6 · Locked auth flow — raw Supabase auth text reaches users

**Files:** `screens/EmailSignInScreen.tsx:61`,
`screens/EmailCreateAccountScreen.tsx:84`, `screens/LegalGateScreen.tsx:213`
(all LOCKED — shared auth flow).

All three surface `error.message` directly. Supabase **auth** errors are
mostly human ("Invalid login credentials") but not guaranteed to stay so
(rate-limit and GoTrue internals leak through), and these are now the only
unrouted error surfaces in the app.

**Diff (per file, one line each):**

```diff
 EmailSignInScreen.tsx
-    if (error) setFormError(error.message);
+    if (error) setFormError(userMessage(error, 'Check your email and password and try again.'));

 EmailCreateAccountScreen.tsx
-      setFormError(error.message);
+      setFormError(userMessage(error, 'Could not create the account. Try again.'));

 LegalGateScreen.tsx
-      const detail = acceptError.message.replace(/\s*\.?\s*$/, '');
+      const detail = userMessage(acceptError).replace(/\s*\.?\s*$/, '');
```

plus `import { userMessage } from '../lib/errorMessage';` in each.
`userMessage` passes human sentences through (`isSafeToShow`), so "Invalid
login credentials" still shows verbatim — only engine text is caught.

**Risk unpatched:** low today (auth messages are human-written); nonzero and
permanent. `tests/errorMessage.test.mjs` allowlists these three by name with
a pointer here, so the exception is visible, not silent.

**Release blocker:** **NO.**

### A7 · hooks/useOpenJobs.ts:37 + BrowseJobsScreen.tsx:351 — the one raw-error chain left

**Files:** both LOCKED. `useOpenJobs` stores `error.message` raw; screen 48
renders it raw at line 351. Every OTHER consumer of a locked hook got wrapped
at its (unlocked) render seam this session; this chain is locked at both ends.

**Diff (either end suffices; hook end shown, one line + import):**

```diff
+import { userMessage } from '../lib/errorMessage';
 ...
-    if (error) setError(error.message);
+    if (error) setError(userMessage(error));
```

**Risk unpatched:** on any feed failure, screen 48 shows PostgREST text
verbatim — the exact schema-disclosure class the errorMessage module exists
to stop, on the highest-traffic worker surface.

**Release blocker:** **YES**, jointly with whichever realtime batch touches
this file first — it is one line, and the sweep test's allowlist entry for
`hooks/useOpenJobs.ts` names it as pending this authorization.

### A8 · screens/HomeScreen.tsx:162 — the last unguarded getParent() hop

**File:** `screens/HomeScreen.tsx` (LOCKED — screen 07).

`openMap()` does `navigation.getParent()?.navigate('Map')`. Map is a shared
tab, so it cannot crash — but it is now the only tab hop not going through
`navigateAcrossTabs()`, and `tests/crossTabNavigation.test.mjs` allowlists
this file by name.

**Diff:**

```diff
+import { navigateAcrossTabs } from '../lib/navigationRef';
 ...
   function openMap() {
-    navigation.getParent()?.navigate('Map');
+    navigateAcrossTabs('Map');
   }
```

**Risk unpatched:** none functional today; it is the one remaining copyable
example of the unguarded pattern.

**Release blocker:** **NO.**
