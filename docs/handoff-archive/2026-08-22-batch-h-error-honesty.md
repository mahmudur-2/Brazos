## 2026-08-22 — BATCH H: error-handling honesty (F-026, F-027, F-013, F-042) — COMPLETE

One lens: can a failure be mistaken for a fact? Six commits, `54b289e`,
`071010a`, `dfd7f8d`, `57cd858`, `12e918e`, plus this file. `npm run verify`
exited 0 after every one; final suite is **835 tests, 0 failures, 0 TS
errors** (baseline was 814/0/0 — 21 tests added, most in the new
`tests/errorHonesty.test.mjs`).

**The `unknown` states introduced, and where they render:**

* `deriveJobLifecycle` accepts `hasOpenDispute: 'unknown'` (a FAILED dispute
  read, distinct from "no dispute") and derives ONLY `'unknown'` from it —
  fenced by executing every status x payment combination. `TrackWorkerScreen`
  renders the shared error state with Retry; `ClientJobDetailScreen` replaces
  its money block and completed-job fork with a retry banner. A network error
  can no longer paint a normal job progressing to auto-release.
* `useLegalGate` gained `'unknown'` (operator chose FAIL CLOSED): a failed OR
  thrown acceptance read blocks in App.tsx on the shared error template with
  Retry (`legal.recheck`); nothing is persisted, and the fail-open log line is
  gone — fenced extinct over all source trees (docs/ keeps the audit record).
  `gateStateForStatus()` is pure, allow-listed, and executed offline with a
  rejected read.
* `TrackWorkerScreen` earns `ready`: skeleton loading until the payment+dispute
  pair and the worker-name read settle (F-027), through DetailScreen's
  ScreenState — configured, not reinvented.

**F-026's other eight:** exact address (ClientJobDetail timing card),
poster+stats (JobDetail, one settled pair, one retry row), worker job stats
(ProfileDetails meta row), bid count (`useJobOwnerActions` fails CLOSED and
`JobOwnerActions` says so with Retry). TrackWorker's payment read is part of
the settled pair; ReviewSection's submit already surfaced via alertAsync —
no change needed there. The `if (active && !error)` idiom is EXTINCT and
fenced (acceptance grep over screens/hooks/components returns nothing).

**F-042 — the six paths, and which are best-effort:** draft save retries once
then alerts ONCE per streak (executed test); dead notification tap alerts
when the payload names a screen it can't open (executed test). Classed
best-effort with recorded, later-acted-on state: (1) sign-out token
deactivation — retry, then `brazos.push.pendingDeactivation`, settled at next
sign-in BEFORE registration (the dispatch's own example); (2) launch token
sync — retry, then re-sync on every app foreground (an alert would misfire on
every routine offline launch); (3) server-side mode write — retry, then
`brazos.mode.pendingWrite.v1.<uid>`, which the next resolution reads to
refuse the stale remote and re-push (a failed write previously let the server
silently REVERT a switch on next launch). The "sixth path" ambiguity was
resolved per the continue-path to ReviewSection's storage-cleanup trio
(99/187/253) — retry once, still-failed urls stay in `draftPhotosRef` for the
session's later sweeps; the unmount-time residue has no in-app actor and says
so in a comment. `PostJobScreen.tsx:273` (same leak class) is OUTSIDE this
batch's file list and still owed.

**Files touched beyond the dispatch list, each forced by a decision:**
`lib/jobLifecycle.ts` (decision 1's "explicit unknown in the data layer"),
`App.tsx` (the gate's render site), `components/JobOwnerActions.tsx` (the
hook's surface), `hooks/usePushNotifications.ts` (named by path in decision
4), `modes/modeStorage.ts` (the mode-storage authority), three test files.

**Fence-fact updates (old → new):** `tests/postJobDraft.test.mjs` and
`tests/crossModeNotification.test.mjs` stub tables each gained the new
`./dialog` import (was: AsyncStorage-only / jobs+navigationRef-only).
No fence logic was weakened. Mutations run red-then-green: lifecycle
unknown-early-return, ClientJobDetail completed-fork gate, TrackWorker
settle-gate, gate fallback flipped to 'accepted' (3 tests red), draft
alert-once gate, dead-tap alert guard (line-verified after a no-op perl).

**Device checks OWED (operator, physical device):** airplane-mode cold start
→ must show the Terms-check retry screen, never Home and never an eternal
spinner; airplane-mode open of an assigned/completed job's detail → retry
banner, never a progressing/releasing job; Track Worker first frame →
skeleton, then timeline, no reflow.

**BATCH I follows** (money/lifecycle consolidation). Its two shared files
(`ClientJobDetailScreen.tsx`, `JobDetailScreen.tsx`) were touched ONLY on
error-handling lines here — verified hunk by hunk; the ten raw status
ladders, JobProgress, and StatusPill/StatusBadge are untouched for I.

