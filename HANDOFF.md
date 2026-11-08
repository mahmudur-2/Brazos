# HANDOFF

Resume: read this file, then `git log -10 --oneline` and `git status`, then do Next. Git owns branch,
HEAD and tree; older sections of this file are in git history.

## Now

Lean v1 run on branch `lean-v1` (plan: `docs/LEAN-SHIP-PLAN.md`, working notes: `docs/lean/`).
Cut-down slices done, one commit each:
- D1 `d65e0b4`: design studio and dead UI removed.
- D2 `d19519e`: web/PWA surface and Android config removed.
- D3a `1ffee33`: voice, documents, translation, read ticks, reactions, chat mic removed.
- D3b `0336c73`: live location sharing and Track worker removed.
- D3c `2227d62`: inbox states, feature-flag table, price guidance removed.
- D4 `96f83f6`: sandbox money path, PostHog and i18n removed.
- D5 `36d9415`: saved workers, portfolio, checklist, live card, semantic search, search mic removed.
- D6 `065fe9d`: cut tables, functions, triggers and edge functions dropped (28 tables, 126 functions,
  9 edge functions); auth.users trigger and push schedule added.
- D7 `dfcd3ec`: one-off scripts, dev-tools, old EAS workflows and phase SQL archived.
- D8 (the commit that rewrote this file): 570 docs folded into seven, mockups and unused assets
  archived, `CLAUDE.md`, `README.md` and this file rewritten.

Still to come: D9 dependency sweep, then Phase E security, F Maestro flows, G TestFlight, H merge to
`mainexpo`. `npm run verify` is green at every slice. Everything moved is in the git-ignored
`_archive/2026-11-lean/` with a `MOVED.txt`.

## Blocked

None.

## Next

D9: remove `@shopify/flash-list`, `@tanstack/query-async-storage-persister`,
`@tanstack/react-query-persist-client`, `expo-font` (and its plugin line in `app.config.ts`),
`expo-asset`, `expo-linking`; then `npm install`, `npx expo-doctor`, `npm run verify`, and a Metro
bundle proof (`npx expo export --platform ios --output-dir <scratch>`).

## Revert

- The whole run: `git checkout pre-lean-2026-11` (tag, before the run).
- One slice: `git revert <hash>` from the list in Now, newest first.
- Database: a corrective migration; rows in dropped tables do not return. Staging has not been
  migrated yet (`20261108000000_lean_v1.sql` waits for the owner's click, backup first).
- Moved files: copy back from `_archive/2026-11-lean/` using `MOVED.txt`.
