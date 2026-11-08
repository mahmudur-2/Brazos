# HANDOFF

Resume: read this file, then `git log -10 --oneline` and `git status`, then do Next. Git owns branch,
HEAD and tree; older sections of this file are in git history.

## Now

Lean v1 is on `mainexpo` (branch `lean-v1` merged, pushed 2026-11-08). Read `docs/lean/SHIP-REPORT.md`
first: numbers, test-run links, build ids, the owner's seven "For you" steps, and "Decided for you".
- Gates on HEAD: `npm run verify` 1241 pass; `npm run db:test` 1782 pass (after `npm run db:reset`);
  CI, pgTAP and TestSprite (9/9 against staging) green on GitHub.
- EAS builds finished: e2e-test simulator `68b4d69c…` and TestFlight build 9 `bfb47ced…` (store,
  staging backend, Stripe test keys). Build 9 is NOT uploaded to TestFlight: owner command in the report.
- Staging has NOT received `20261108000000_lean_v1.sql` / `20261108010000_lean_v1_grants.sql`: the
  pipeline halts on destructive files until the owner re-runs it with `allow_destructive` (backup first).
- e2e iOS workflow (`.github/workflows/e2e-ios.yml`, manual dispatch only): account A passes 01-auth end
  to end; account B is blocked (below). Flows 02-10 have not run yet.

## Blocked

- Phone `13473208154` must be added as a Supabase test number (code `123456`) on staging before the
  e2e flows can sign account B in. Owner step 2 in the report.

## Next

1. Owner steps 1-4 from the report (staging migration with backup, second test phone, TestFlight
   upload, e2e run 3).
2. After e2e run 3: fix red flows (flow edits need no build; an app fix needs a new `e2e-test` build and,
   if it ships, a new `testflight` build via `npm run release:testflight`).
3. Backlog: `docs/BACKLOG.md` ("Security (from the lean verdict)" first).

## Revert

- The whole run: `git checkout -b restore pre-lean-2026-11` (tag before any change).
- One slice: `git revert <hash>` (commits `lean D1` … `lean H2b` on `mainexpo`).
- Database: a corrective migration; rows in dropped tables do not return. Staging is still unmigrated.
- Moved files: `_archive/2026-11-lean/` (git-ignored) with `MOVED.txt`; the lean working docs are there too.
