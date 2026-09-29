# LUX-LIST-2 — the operator's next list of changes to the After (brief, IN PROGRESS)

Started 2026-09-28, right after LUX-LIST-64 landed (`03b5e15`), in a list sitting like the one
that wrote `docs/dispatch/LUX-LIST-64.md`: the operator sends changes one at a time; each is
confirmed ("make sure you understand 100%"), written here, and every five the whole list goes
back to the operator. NOTHING is built during the sitting ("dont rebuild it yet") — except item 1,
which was already applied before that instruction arrived (its STATUS line says so).

## 1. Boundaries and how to run (as LUX-LIST-64 §1, unless the operator moves them)

- Build ONLY in the practice copy `.shots/refresh/practice`. The Before stays exactly as it is;
  the real app's code does not change. The After reaches the repo only as
  `docs/mockups/refresh/after.patch`, applied only when the operator says "build it".
- First check: `node docs/mockups/refresh/make-patch.mjs` then
  `git status --short docs/mockups/refresh/after.patch`. At `03b5e15` the ONE expected difference
  is item 1 (already in the practice copy); anything else means the practice copy moved.
- Rule 0: pictures point at the problem; the references build the fix. Rule 0b: every change
  applies to light mode too — only colours differ. Everything feels 120 Hz. No new dependency.
- Answer the operator by item number. One mobile push at the end of the run.

## 2. Pictures

`.shots/refresh/brief-pics-2/` (gitignored), named by item: `1a.webp`, `1b.png`, …

## 3. The list

**1.** LIGHT MODE ONLY (confirmed by the operator) — three more spots leave the gold `#C8A15B` for
the green `#064C3B` (#47's rule, the `mark` role: `#064C3B` in light, the gold `#D4A24C` in dark,
so dark does not move), from the operator's marks on the #47 gold sheet:
- Profile details (`details`): the "Edit profile" outline pill — its rim, its pencil and its
  word — and the JOB CATEGORIES chips ("Furniture Assembly", "Handyman/Repairs") — rim and
  word. `screens/ProfileDetailsScreen.tsx`: the pencil's colour, and the shared `chip` /
  `chipText` styles.
- Welcome (`welcome`): the "BRAZOS MARKETPLACE" wordmark. `screens/WelcomeScreen.tsx` `eyebrow`.
- Everything else on the sheet STAYS gold: the Welcome's three badges, the sign-in buttons'
  rings and glyphs, rating stars, the client job detail's badge ring, toggle knobs, "Break the
  ice", the Map.
- This reverses two of #47's "stay gold" entries (the Profile details category chips; the
  Launch wordmark) — record in DECISIONS with the date.
- STATUS: already applied in the practice copy on 2026-09-28 — `ProfileDetailsScreen.tsx` (pencil,
  `chip`, `chipText` → `colors.mark`), `WelcomeScreen.tsx` (`eyebrow` → `colors.mark`), and the
  fence `tests/rimLight.test.mjs` moved with a dated ruling (the eyebrow's colour → `colors.mark`).
  Practice `tsc` clean, `node --test` 1282/1282, the After exported and 71/71 in both schemes.
  NOT yet in `after.patch`, DECISIONS or the viewer notes. (pics 1a, 1b)
