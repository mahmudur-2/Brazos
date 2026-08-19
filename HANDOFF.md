# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-19 — Emerald Prestige golden-master campaign: COMPLETE

**No SQL executed, no database contacted, nothing pushed, no `.claude/`
file modified, no `.env` read, no dependency added or mutated, no frozen web
surface touched, `app.json` untouched, `lib/authTheme.ts` untouched.**

All **43 golden masters** in `docs/mockups/` are implemented, across 31
commits carrying the `prestige(NN)` prefix. The campaign's own living
record — every decision, deviation and cross-master conflict, with the
reason for each — is `docs/mockups/PRESTIGE_RUN_REPORT.md`. Read that
before reopening any of it; this section is the operational summary only.

### Verify

Every commit ran bare `npm run verify` (never piped) with the exit code read
directly. Final state: **755 pass / 0 fail / 0 skipped, exit 0** — the same
count the campaign began at. No assertion was relaxed to get there; the
suites that moved are listed with their reasons in the run report's
"Tests that moved" section, and each still guards something true.

### What changed, by area

- **Palette and primitives** (0b–0d, pre-existing at this run's start):
  palette v2, the shared controls, and one floating pill nav in both trees.
- **Homes** (1a–1c): Customer Home, Worker Home and Find help, including the
  operator's three `assets/prestige` crops. Those render under the DARK
  palette only; light keeps its approved Heritage arrangements everywhere.
- **Auth** (2a–2c): Welcome, Create account and Email create account convert
  to `useThemeColors` through one new mapping, `authSurface(palette,
  isDark)` in `lib/theme.ts`. The shared auth components take an additive
  `themed` flag, so the six auth screens with no master render exactly as
  before — verified by absence of the flag, not by intent.
- **Discovery, posting and both lifecycles** (3a–5b): Map, the radius list
  and its filter sheet, skill matches, the bid surfaces, both job-detail
  sides, track worker, the worker's job, and compare bids.
- **Messaging and people** (6a–6f): inbox, chat, worker profile, reviews,
  the past-work picker and saved workers.
- **Profile, settings and the hub** (7a–7i). The largest structural change
  is 7a: the Profile tab is now three pages — the hub (master 45),
  `ProfileDetailsScreen` (42) and `AccountSafetyScreen` (41) — registered on
  the SHARED profile stack, so both trees mount them identically and
  cross-tree navigation stays a compile error.

### Two new shared pieces

- `components/BrazosMonogram.tsx` — the serif "B" the masters set in a
  card's spare corner, in both drawings the set uses (low-alpha ghost
  watermark; the outlined shield). Code, not an asset, per the manifest's
  Appendix A. Decorative and hidden from assistive technology.
- `lib/theme.ts`'s `authSurface()` — the auth surface's Prestige mapping,
  a function of the resolved palette (the `emeraldColorsFor()` precedent),
  NOT a third token surface.

### Invariants, unchanged

Nothing in this campaign touched data flow. Money is still integer cents
through `formatBudget()`; money labels still follow the payment state
machine; `accept_offer()` is still the only assignment path and
`transition_job_status()` the only status mover; exact address still comes
from `job_locations` behind RLS; lifecycle derivation is still expressed
once. No marketplace data was invented anywhere — where a master draws a
figure the build cannot source, the run report names it and it is not built.

### Open items for the next run

1. **Master 34's inbox search and its four filter tabs are not built.** They
   are functionality, not presentation, and there is no support-thread kind
   in the data model — building the fourth cell would mean inventing what it
   filters. Same for its per-thread unread COUNT badge:
   `useConversations` carries a boolean, so the green dot the same master
   draws is what renders.
2. **Master 46's three-column grid is not built.** Bid count is unbounded;
   the full-width stacked card stays. Its "best fit" ribbon is not built
   either — it asserts a judgement no stored figure supports, and the honest
   HIGHEST RATED badge (shown only when defensible) stays instead.
3. **Master 33's dark map tiles** remain provider-style work, not screen
   styling. `HotspotMap.native` already follows the resolved theme via
   `userInterfaceStyle`; a custom tile style would be a build item.
4. **The verification badge** stays removed from every user-visible surface
   (43d1e7f). Masters 1, 17, 18 and 23 all draw a "Not verified" chip; none
   is implemented, because no KYC provider exists in this build.
5. **Disk filenames for ten masters are shuffled** relative to the
   manifest's numbering (`Profile_Account_Safety_Dark.png` holds master 45's
   content, `My_Jobs_Active_Dark.png` holds the Closed tab, and so on). The
   manifest's per-screen DESCRIPTIONS are content-accurate; read by content.
   Worth renaming the files at some point, which is an operator call.

### Device pass not yet done

Everything in this campaign was verified offline by `npm run verify` and by
reading each master against the code. The visual result has NOT been seen on
a device. A device pass is the natural next step — particularly for the
absolutely-positioned hero artwork on both homes, the three-page profile
navigation, and the new segmented/stepper treatments.
