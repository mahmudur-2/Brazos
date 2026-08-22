# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## THE PER-RUN RECORDS ARE ARCHIVED — read docs/handoff-archive/

This file carries ONLY the live edge. Every dated per-run record that used
to accumulate here now lives, verbatim and byte-preserved, in
`docs/handoff-archive/` — one file per run, listed oldest-to-newest by
`docs/handoff-archive/INDEX.md`. Consult the archive for any past run's
measurements, decisions, reversals and evidence. Nothing there is an
authority on current state, and nothing here restates what a record already
says.

## THE MASTER SET IS SPLIT — read this before citing any mockup

**Binding design authority, highest first:** the NUMBERED masters
(`docs/mockups/1_*.png` … `44_*.png`) · the emerald dispatch's D1–D11 ·
`docs/mockups/PRESTIGE_RUN_REPORT.md` (a "mismatch" logged there is CORRECT and
must not be reverted) · `docs/mockups/BRAZOS_MOCKUP_MANIFEST.md`.

**The WORD-NAMED masters are NOT authority and the operator has REJECTED them**
as an over-ornate render pass: `Compare_Bids_Dark.png`, `Discover_Map_Dark.png`,
`Messages_Inbox_Dark.png`, `My_Jobs_Active_Dark.png`, `My_Jobs_Closed_Dark.png`,
`My_Jobs_In_Progress_Dark.png`, `Notifications_Feed_Dark.png`,
`Notifications_Preferences_Dark.png`, `Payment_Methods_Dark.png`,
`Profile_Account_Safety_Dark.png`, `Profile_Details_Dark.png`,
`Profile_Past_Work_Settings_Dark.png`. Never cite one to justify a change; never
"restore" a detail that appears only there. You may read one to understand
intent where a numbered master is silent, but the change still needs a numbered
master, a dispatch decision or the run report behind it — and you log that you
read it.

**There is NO master for light mode.** Every mockup is dark. Never align a light
surface to one. **Six numbered masters the emerald dispatch cites do not exist
on disk** (33, 34, 39, 40, 45, 46; also absent: 21, 28, 35–38, 41, 42) — all of
them concern things D9 freezes as UNBUILT.

*Unchanged by the home reconstruction (2026-08-20), which cited no master: its
dispatch superseded `docs/dispatch/` and pre-decided every product question it
needed. Reaffirmed unchanged by the verification run (2026-08-19) and restated
at the head of the "Verification 2026-08-19" section of
`docs/mockups/PRESTIGE_RUN_REPORT.md`.*


## Current state — after the 2026-08-22 repository cleanup run

The newest run record is
`docs/handoff-archive/2026-08-22-securestore-session-adapter.md`: the auth
session lives in the device keychain via the SecureStore adapter, F-KEYCHAIN
fence suite green. The offline suite stands at 860 pass / 0 fail / 0 skipped,
bare `npm run verify` exit 0. Branch and commit state are Git's to report,
never this file's.

The cleanup run itself (2026-08-22, after the SecureStore run): root
historical documents moved under `docs/archive/` (`root-audits/`,
`diagnostics/`, `hardening-report/`, `project-audit/`); eleven rejected
word-named mockup renders moved to `docs/mockups/rejected/`
(`Discover_Map_Dark.png` stays beside the masters — source cites it);
`DIAG_offer_negotiation_messaging.md` stays at the root
(`lib/offerNavigation.ts:57` cites it); this file split into live edge plus
archive. Full inventory and evidence: `docs/cleanup/2026-08-22/inventory.md`.
Nothing was deleted, no source or test file moved, no fence changed, nothing
under `supabase/` touched, no behavior changed.

### Device checks OWED (operator, physical device) — carried forward

Each list lives verbatim in its run's archive file; none has been performed
yet:

- SecureStore keychain line on a NEW dev client, silent session migration,
  chunked writes against the real keychain →
  `2026-08-22-securestore-session-adapter.md`.
- Every heading's weight in the system sans, wrapping everywhere, the two
  typography dials, cold start, LaunchScreen wordmark, chat composer
  footprint, upload-failure copy → `2026-08-22-serif-retired-g001.md`.
- One-job lifecycle label walk, every label at every step →
  `2026-08-22-batch-i-money-lifecycle.md`.
- Airplane-mode cold start, airplane-mode job detail, Track Worker skeleton
  → `2026-08-22-batch-h-error-honesty.md`.
- Live Nearby pulse, PhotoViewer gestures, Setup legal-row pulse,
  similar-jobs caption → `2026-08-22-run-deg-motion-assets-copy.md`.
- Safe-area seam and Live Nearby card peek on Customer Home →
  `2026-08-20-customer-home-replaced-master44.md`.

### Known staleness in the list below, left uncorrected by the cleanup run

Open item 0 still describes G-001 as unfixed; the
`2026-08-22-serif-retired-g001.md` record closed it (`fc5a78d`, with the
F-ERRMSG widening to `ui/`). The cleanup run preserves records verbatim and
corrects nothing; the next functional run's HANDOFF rewrite should reconcile
item 0. G-002 (CI cannot run the 120-test guard suite) remains genuinely
open.

## THE LIGHT-mode parity audit — DISPATCHED, AUDITED, PARTLY FIXED

**No longer outstanding as an audit.** `ce4e6ec` wrote it
(`docs/audit/2026-08-22/light_mode_parity.md`, P0 0 / P1 0 / P2 10) and the
2026-08-22 cleanup run above closed **L-010** (`dd518d9`) and **L-002**
(`1714fd8`), skipped **L-001** at its gate, and left the rest.

**Still open from that audit:** L-003 (`lib/hotspots.ts`'s 4 heat-tier
strokes — the last live-rendering literal with no token home, and now also
recorded as G-003), L-004/L-006 (auth-surface literals whose token home
`lib/authTheme.ts` is editable again), L-005 (`CountryPicker`'s hand-mixed
scrim), L-007 (shimmer core, blocked on dark transition assets), L-008 and
L-009 (dev-only and frozen-web, no action available).

**C2's item L1 is CLOSED.** `lib/jobs.ts`'s light-only `JOB_CATEGORY_COLORS`
was named there as "the biggest outstanding light decision"; `1714fd8`
resolved it — the values are a theme-constant token group in `ui/tokens.ts`,
F5 continues to prove dark never paints them, and the light rendering did not
move. Do not re-open it from the run report's C2 list.

The rest of the light debt below stands as written.

Light stayed FROZEN through the home reconstruction as it did through emerald:
every colour change branched on `isDark` or moved a dark-palette value only, and
the light palettes are byte-identical to base. The structural exceptions are
stated in the run report.

**This run added to the light debt:**

* **Customer Home's promo card mounts a DIFFERENT light mark** than it did
  before (`home(1)`), because the old one had been deleted from disk. Look at it.
* **The light `heroMark` box is `79x101` holding a landscape drape**, so
  `contain` centres a `79x65` render inside a taller reserve.
* **`screens/PostJobScreen.tsx`'s photo nudge is now `surface` in light too**
  (`home(6)`), not `mint`: white on the ivory page with a mint hairline. This is
  a token swap, not a palette change, and it closes the same seam in both themes.
* **`components/HomeAtmosphere.tsx` renders NOTHING in light** — deliberate, and
  the reason light's homes keep their existing flat ground.

**CORRECTION to the standing light list:** section (c)'s item **L4** says
`assets/brand/customer-home-chair.png` bakes `#FAF5F1` opaquely and is
"invisible only because it matches `homeBackground` exactly today". **That is no
longer true** — `home(1)` measured it as a real cut-out, 62.81% of samples fully
transparent. L4 is closed. Everything else in section (c) stands.

**The scope is written out in full** as section **(c) THE LIGHT AUDIT HANDOFF
LIST** at the end of `docs/mockups/PRESTIGE_RUN_REPORT.md`, in four parts: C1
(thirteen shared components with light branches), C2 (the five D10 deferrals —
of which L1, `lib/jobs.ts`'s light-only `JOB_CATEGORY_COLORS`, was the biggest
outstanding light decision and is now CLOSED by `1714fd8`), C3 (both-theme
changes nobody has seen under light — read it for its debt list, NOT for the
bar's composition, which it describes wrongly as six slots), and C4
(theme-neutral changes, listed so they are not re-audited).

### Open items carried forward

0. **The two P1s from the guard-coverage audit** (`19357ab`) are the most
   actionable items on this list and both are one-file changes with a fence
   attached. **G-001**: wrap the extraction in
   `ui/primitives/MediaUploader.tsx` through `userMessage()`, and add `'ui'`
   to `tests/errorMessage.test.mjs`'s `dirs` **with** `{ recursive: true }`.
   **G-002**: CI cannot run the 120-test guard suite on `ubuntu-latest`, so
   either add a Windows job for it or stop treating a green CI badge as
   evidence the guards were verified. Neither was fixed here — that audit was
   dispatched read-only.

1. **Master 34's inbox search, its four filter tabs and its per-thread unread
   COUNT** are not built — functionality, not presentation, and the data model
   has no support-thread kind and no per-thread count.
2. **Master 46's three-column grid and its "best fit" ribbon** are not built —
   bid count is unbounded, and the ribbon asserts a judgement no stored figure
   supports. The honest HIGHEST RATED badge stays.
3. **The map tiles are CLOSED, with the mechanism named.** `HotspotMap.native`
   sets the per-MapView appearance prop from the resolved theme and keys the view
   on the theme, because MKMapView will not reliably re-rasterise tiles it has
   already drawn. If light tiles ever return, that is the thing to re-test — not
   the prop, which is verified correct.
4. **The verification badge** stays removed from every user-visible surface.
5. **Disk filenames for ten masters are shuffled** relative to the manifest's
   numbering. Read by content; renaming is an operator call. Concerns the
   WORD-NAMED files, which are no longer authority at all.
6. **Master 40's "No real charge" gold pill** and **master 25's gold ledger
   amount** remain unimplemented, both for reasons already on the record.
7. **Hand-drawn standard-shaped controls inside individual screens** never got
   the gold-hairline sweep — only the shared `Button` did. The enabled-hairline
   half is still outstanding and is worth its own pass.
8. **Section (e) of the run report** lists eleven items the emerald pass logged
   and did not fix, each with its reason.
9. **`screens/ChatScreen.tsx`'s clearance double count** — see "Found and NOT
   fixed" above. New, and the most actionable item on this list.
10. **The D2 inversion is missing from the run report's §(d) reversal list.**
    Named in the report's Verification section and in this file, and fenced by
    `tests/emeraldFences.test.mjs` F6 — but §(d) itself is where a future run
    looks, and it is still six items rather than seven.
11. **`tests/verificationBadgeRemoved.test.mjs`'s `LOCKED_SCREENS` is stale.**
    It still excludes both sign-in screens, which emerald(5) converted and
    un-allowlisted elsewhere. Harmless today; the operator's call.
12. **Guard rules that fire on command TEXT rather than command effect**, now
    reproduced by a **fourth** run. Earlier runs hit: `git commit` refused for a
    message containing the bare token `Claude`
    (`GUARD-NESTED-CLAUDE` matches any whitespace-delimited `claude` token
    anywhere in the command, including inside a heredoc body); `node -e` refused
    as `GUARD-DYNEXEC`; `git stash list` refused as a forbidden subcommand
    despite being read-only; and `Write` to the session's own scratchpad refused
    as a path escape. The 2026-08-22 cleanup run reproduced the scratchpad
    refusal and added a fifth shape: **`GUARD-CLAUDEDIR` fires on any command
    whose text contains `.claude/` together with a `>` anywhere**, so the purely
    read-only `ls -la .claude/ 2>&1` is blocked as a config mutation — the `2>&1`
    is the whole trigger. All fail safe. **None has ever been worked around** —
    commit messages go through `-F` files in the allowlisted `.audit-scratch/`,
    probes are written into the project tree, `.claude/` is read with the file
    tools instead of the shell, and refused calls are dropped rather than
    rephrased. Worth fixing at the guard, because every run pays this tax and it
    is now the single most reproducible friction in the contract.
13. **`tests/customerCore.test.mjs:225` and `tests/emeraldFences.test.mjs:1485`
    own `lib/theme.ts`'s dead `emeraldColors` export.** The first asserts the
    export exists; the second uses its NAME as the slice delimiter for the light
    palette block. There are zero production importers, so the export is dead
    code that two fences keep alive. Deleting it is a three-file change (export
    + both fences) and needs a dispatch that authorises touching them — this run
    was forbidden from editing any fence and correctly skipped it.
