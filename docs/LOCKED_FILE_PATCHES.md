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

### A9 · Locked auth flow — bare goBack() dispatches (GO_BACK fix, 2026-08-11)

**Files:** `screens/SignInScreen.tsx:91`, `screens/EmailSignInScreen.tsx:65`,
`screens/CreateAccountScreen.tsx:98`, `screens/EmailCreateAccountScreen.tsx:99`,
`screens/VerifyPhoneScreen.tsx:284/309/393` (all LOCKED — shared auth flow).

The 2026-08-11 sweep converted every unlocked back control to
`goBackOrHome()` after the device-confirmed unhandled GO_BACK (a screen landed
on via `navigateAcrossTabs()` is its stack's INITIAL route — nothing to pop).
These seven sites keep bare `goBack()` and are the guard test's named
allowlist (`tests/crossTabNavigation.test.mjs`, `GOBACK_ALLOWLIST`).

**Why the risk is near-zero here:** every one of these screens is pushed from
Welcome inside the auth tree — none is reachable by cross-tab or notification
dispatch (those fire post-auth), so `canGoBack()` is true in practice.
`OnboardingFlow.tsx:78` already uses the guarded
`if (navigation.canGoBack()) goBack()` form and needs nothing.

**Diff (per file, mechanical):** add
`import { goBackOrHome } from '../lib/navigationRef';` and replace each
`() => navigation.goBack()` with `goBackOrHome` (for VerifyPhone, inside its
`leaveChallenge(() => …)` wrapper: `leaveChallenge(goBackOrHome)`). Note the
helper's fallback dispatches `navigateAcrossTabs('Home')`, which in the auth
tree (no tabs mounted) is DROPPED with a dev warning — same net behavior as
today's unhandled GO_BACK, minus the red box.

**Risk unpatched:** effectively none today; becomes real only if an auth
screen ever becomes deep-linkable.

**Release blocker:** **NO.**

### A10 · lib/authTheme.ts — token homes for the auth surface's stray literals (4D-3.5)

**File:** `lib/authTheme.ts` (READ-ONLY per the 4D-3.5/4D-2/4E dispatch).

The 4D-3.5 token sweep migrated every colour literal in unlocked files whose
token home was writable. Three call sites' only correct home is this file, so
their literals were deliberately LEFT and are listed in that run's report:
`components/AuthNotice.tsx:31` (`'#3E4F47'`), `components/AuthNotice.tsx:50`
(`'#F5E7E4'`), `components/CountryPicker.tsx:204`
(`'rgba(11, 32, 25, 0.42)'`).

**Diff (add inside `authColors`, after the `danger` entry at line 42):**

```diff
   /** --danger */
   danger: '#9C3F35',
+  /** Danger surface behind auth error notices — §I's exact dangerSurface. */
+  dangerSurface: '#F5E7E4',
+  /** Body text on an auth notice (components/AuthNotice.tsx). */
+  noticeText: '#3E4F47',
+  /** Muted helper text on the auth create/sign-in forms (#526059 sites). */
+  noticeMuted: '#526059',
+  /** Gold-dark emphasis text on the verify-phone warning (#7A5A18 sites). */
+  warningText: '#7A5A18',
+  /** The country-picker sheet scrim (components/CountryPicker.tsx:204). */
+  sheetScrim: 'rgba(11, 32, 25, 0.42)',
```

**Follow-up in UNLOCKED files once applied** (ordinary edits, no unlock
needed): AuthNotice:31 `'#3E4F47'` → `authColors.noticeText`; AuthNotice:50
`'#F5E7E4'` → `authColors.dangerSurface`; CountryPicker:204 the rgba literal
→ `authColors.sheetScrim`; then add the three files to
`tests/themeTokens.test.mjs`'s MIGRATED_FILES list.

**Risk unpatched:** none functional — purely the last unmigrated colour
literals outside locked/frozen surfaces.

**Release blocker:** **NO.**

### A11 · Locked screens — remaining colour literals, for the unlock session (4D-3.5)

Queued so the operator's T4 theming session (STAGE4D_PLAN.md) has the exact
sites. All are LOCKED screens; values in comments are excluded. Exact
replacements, by file and line as of the 4D-3.5 run:

```diff
 screens/BrowseJobsScreen.tsx:45
-const AVAILABILITY_ONLINE_COLOR = '#0DBC5A';
+const AVAILABILITY_ONLINE_COLOR = colors.availabilityOnline;
 screens/HomeScreen.tsx:653 (the paired glow)
-    backgroundColor: '#7DE7A4',
+    backgroundColor: colors.availabilityOnlineSoft,
 screens/HomeScreen.tsx:655
-  liveDot: { ... backgroundColor: '#0DBC5A' },
+  liveDot: { ... backgroundColor: colors.availabilityOnline },
 screens/EmailCreateAccountScreen.tsx:243, screens/EmailSignInScreen.tsx:182
-    backgroundColor: '#F5E7E4',
+    backgroundColor: authColors.dangerSurface,   (A10's token)
 screens/CreateAccountScreen.tsx:213, screens/EmailCreateAccountScreen.tsx:261
-    color: '#526059',
+    color: authColors.noticeMuted,               (A10's token)
 screens/VerifyPhoneScreen.tsx:519 and :523
-    color: '#7A5A18',
+    color: authColors.warningText,               (A10's token)
```

Prerequisite for the two `availabilityOnline*` lines: add to BOTH palettes in
`lib/theme.ts` (an unlocked edit any run can make when this is authorized):
`availabilityOnline: '#0DBC5A'` / `availabilityOnlineSoft: '#7DE7A4'` in
`colors`, with dark-palette counterparts chosen in the unlock session.

Deliberately NOT queued (brand-artwork tints, per the same rule that left
`components/ModeTransitionOverlay.tsx:449`): WelcomeScreen:50 `#DEEAD9`
(artwork ring disc), HomeScreen:597 `#F1EAE2` / :665 `#E7E3DB` (reference
hairlines the unlock designer should resolve against the token set).

**Release blocker:** **NO.**

### A12 · WelcomeScreen — two false claim badges (2026-08-18 overnight audit)

Operator-applied (locked screen 02). Both floating badges state things the
shipped product does not do: the verification badge and every "verified"
claim left the product in 4D-B (43d1e7f) except this locked line, and the
Terms state Brazos does not currently process payments, so "Protected
payment" is false under the shipped product and the Terms alike. Exact
replacements, by line as of this run:

```diff
 screens/WelcomeScreen.tsx:158
-          <Text style={styles.badgeText}>Verified workers</Text>
+          <Text style={styles.badgeText}>Real customer reviews</Text>
 screens/WelcomeScreen.tsx:170
-          <Text style={styles.badgeText}>Protected payment</Text>
+          <Text style={styles.badgeText}>Clear upfront pricing</Text>
```

Icons may stay (shield-checkmark reads fine over reviews; lock-closed reads
fine over pricing) or be swapped at the operator's discretion — the copy is
the defect, not the glyphs. Supersedes HANDOFF's standing item G ("Unlock
decision — WelcomeScreen's Verified workers line") by giving it the exact
patch.

**Risk unpatched:** a first-run surface makes a trust claim (verification)
and a payment claim (protection) the product cannot back — App Review and
user-trust exposure, not a functional break.

**Release blocker:** **NO**, but it should land before any external beta.
