## 2026-08-22 — BATCH F+J: dead code deleted, documents corrected (F-023, F-071 + J) — COMPLETE

Six commits: `778fc5c` deletes `screens/BrowseJobsScreen.tsx`,
`hooks/useWorkerAvailability.ts` and `hooks/useChat.ts` with their ten test
files updated in the same commit; `cb240d0` retires the openJobsPotential
duplicate's apparatus and the stale errorMessage allowlist entry; `239950d`
architecture.md; `e434a9c` CLAUDE.md (operator-authorized, decision-7 scope
only); `7991453` HANDOFF Batch-C correction + manifest banner + README;
plus this record. Bare `npm run verify` exit 0 after every commit — **final
suite 843 pass / 0 fail / 0 TS errors** (baseline 846; −3 = crossTab's
browse-remount test deleted with its subject, and potentialEarnings' five
tests became three lib-level executions). A repo-wide grep for the three
deleted names returns nothing outside `.git` and `docs/audit/`. Pushed under
the autonomy gate after the final green verify; `git` is the authority on
what reached the remote.

**Facts a later run needs:**

* `lib/earningsMath.ts`'s `openJobsPotential()` is the ONE implementation
  (live consumer: WorkerHomeScreen); the deleted screen's authorized inline
  twin went with it. ChatScreen's hook is `useConversationChat`; the
  superseded chat hook is deleted, not allowlisted.
* `tests/crossTabNavigation.test.mjs`'s WorkerResults mode sweep window is
  260 chars (was 160): the old window missed WorkerHomeScreen's long
  'nearby' dispatch and had been passing on the deleted screen's compact
  call — observed red before the widening. Fence logic unchanged.
* `assets/brand/worker-home-toolbox.png` (115,644 B) lost its only
  `require()` with the screen: on disk, orphaned, off the raster roster,
  and outside this run's scope — deleting it is an operator call.
* The audit's "J precedes F" batch-ordering constraint is DEAD: it existed
  only because CLAUDE.md's malformed locked section still named the dead
  screen, and the 2026-08-21 repair dissolved it. Recorded here per
  decision 4 — `docs/audit/` is a historical record and was not edited.
* F-069 recorded, not fixed: `phase69`'s comment cites `bids_insert_own` as
  live; phase29:301 dropped that policy. The phase69 conclusion still holds
  (three other live policies call the function). Applied migrations are
  history — the file stays byte-identical.
* `tests/verificationBadgeRemoved.test.mjs`'s formerly-locked list still
  carries both sign-in screens (open item 11, unchanged) — this run removed
  only the deleted screen's entry.

No database contacted, no schema change, no dependency change, no app
behavior change beyond the deletions, no theme or asset change.

