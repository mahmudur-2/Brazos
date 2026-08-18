# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 - stage 4D-3: conversion and rebook

**No SQL executed, no database contacted, no schema object touched, no
dependency added, nothing pushed, no locked file edited.** Four feature
commits plus this docs commit, in dispatch order (§3→§6), each landed on a
green `npm run verify`. Suite: **595 pass at the base gate → 620 pass / 0
fail / 0 skipped** at the end. All new assertions live in
`tests/conversion.test.mjs` (25 tests: pure lib modules EXECUTED via the
strip-types pattern; screen wiring pinned against source and marked
`[static]` in the test names). No existing suite was weakened or amended —
none needed to change.

The re-issued dispatch stated, and this run confirms: **4D-2 (worker
discovery and map, `docs/audits/STAGE4D_PLAN.md`) remains undispatched and
was not a dependency of this batch** — nothing here touches the map, filter
sheet, browse cards or market preview.

### What landed

1. **Post flow (§3).** `lib/priceGuidance.ts` — a frozen static table keyed
   by the ten `lib/skillCategories.ts` keys; the two guidance lines render on
   the budget step of a fresh post while the category has a range and both
   budget fields are empty or unfocused. Description floor: 20 trimmed
   characters (`lib/validation.ts`), Continue disabled on the Describe step
   with a written remaining count. Photo nudge ("Jobs with a photo get more
   bids.") above the advance control on the media step, dismissible
   per-draft (`photoNudgeDismissed` lives on `PostJobDraft`), never gating
   advance.
2. **Rebook (§4).** `lib/rebook.ts` — a worker in both populations appears
   only under Saved; tombstoned profiles (phase67 writes
   `full_name = 'Deleted user'`, pinned against the SQL) render their label
   and real reviews but **no Hire control**; the strip model excludes them
   outright. SavedWorkersScreen deduped, its empty state now routes to Find
   workers (customer mode). WorkerSearchScreen's idle landing opens with the
   "Hire someone again" strip — saved first with a bookmark mark, taps open
   the prefilled PostJob hire composer, See all lands on SavedWorkers. The
   centre [+] sheet already routed there; that routing is now pinned.
3. **Compare Bids (§5).** `lib/compareBids.ts` — deterministic total order
   (rating desc with known ratings only and nulls last as a block, then
   price asc, then earliest, then id), stated on screen verbatim from
   `BID_ORDER_RULE`; "HIGHEST RATED" badge fails closed; trust rows per D4;
   completed figure is the SUM of `worker_job_stats` rows. The segmented
   sort control, blended value score and completion% left this screen. Rows
   still open BidDetail; the screen writes nothing.
4. **Worker-side conversion (§6).** `lib/offerMessage.ts` — availability
   chips (bid branch only; counters carry no message) append ONE trailing
   line; 500-char cap mirrored (phase61 literal pinned), chips disable and
   clear with a written reason when the line would not fit.
   WorkerProfileScreen: "Book at listed price" / "Ask about this" per
   published service row, opening the hire composer prefilled (title,
   category, description, `initialAmountCents` — a new PostJob route param
   in every stack copy); over-ceiling stored prices refuse in writing before
   navigation. ServicesPricingScreen: explicit **Flat price / Ask me**
   control (Ask me clears the amount; flat//hr unit toggle stays inside the
   Flat state so hourly pricing remains reachable); over-ceiling refused in
   writing before the insert; still direct RLS-scoped DML, no RPC added; no
   same-day toggle. `lib/profileCompleteness.ts` + ProfileScreen: four-step
   meter, worker mode, own profile only, hidden until counts are known and
   gone at 4/4; each unmet step routes to its fix.

### §3.1 category-to-range mapping (integer cents), nulls included

| key (lib/skillCategories.ts) | range |
| --- | --- |
| cleaning | 6000–12000 |
| moving | 8000–20000 |
| furniture_assembly | 5000–12000 |
| tv_mounting | 7000–15000 |
| handyman | 6000–15000 |
| yard_work | 5000–12000 |
| errands | 2500–6000 |
| painting | 15000–40000 |
| dog_walking | **null — renders no guidance** |
| packing | **null — renders no guidance** |
| `other` (post flow only, not a skill key) | absent from the table → lookup null |

### §5.1 deviations from the Compare_Bids mockup, per the dispatch

- **Vertical full-width list, not the three-across grid** — bid count is
  unbounded and a ~100pt column cannot hold an offer line like "Mount +
  tools included".
- **"HIGHEST RATED" instead of "BEST FIT"** — "best fit" is a match claim,
  and match scoring is permanently rejected on this product. The badge
  renders only when the top-sorted bid's rating is built on 3+ reviews and
  every rival's rating is KNOWN and strictly lower.

Both mockups also show the pre-4D-1a five-tab bar with Map, and
22_savedworkers shows a verification pill and a Hire button on a deleted
user — none reproduced.

### Judgment calls a reviewer should see

- **§3 aids scope to fresh posts.** The floor is not retro-applied to edit
  mode (a legacy job with a short description must stay editable), and hire
  mode negotiates a single amount, so guidance/nudge/floor all key off the
  fresh-post path.
- **Hire suppression on deleted users** is not in the 4D-3 §4 text, but it
  is a standing operator decision (`docs/audits/STAGE4D_PLAN.md` item 8:
  "a dead-end tap today") and the mockup carries the defect; implemented and
  tested. The "Deleted user" label itself renders verbatim from the data.
- **§4 empty state is mode-aware**: worker search lives in the customer tree
  only, so worker mode keeps Back instead of a dispatch
  `navigateAcrossTabs` would drop.
- **§5.1 badge null semantics**: "strictly greater than every other bid's"
  against an unrated rival is unknowable, so the badge fails closed (SQL
  null-comparison reading, matching the repo's fail-safe doctrine).
- **§5.3 read literally**: "New worker" replaces the whole trust row,
  message line included; a KNOWN sub-3 count is required — a pending or
  failed stats read renders nothing rather than the verdict.
- **§5.2 protection pill**: none renders on the current screen and D6 bans
  authoring new protection copy, so none was added (the mockup's BRAZOS
  PROTECTS triad was likewise not added).
- **The blended "value" sort stays in `lib/offers.ts`** — its remaining
  consumer is ClientJobDetailScreen's inline bid list, and job detail
  screens are explicitly out of this run's scope (D8). Compare Bids no
  longer uses it.
- **§6.4 "published portfolio_items"**: the table has no draft state, so the
  step counts existing rows.

## Applied reality - staging `zzkumxcjtbqoselzptig`

Unchanged by this run. phase74 (push scheduler) + phase75 (security
hardening) are committed and operator-applied to staging; phases 67-73
applied and verified green 2026-08-16. **Per standing policy only a green
`node scripts/verify-schema.mjs` counts as applied, and the two groups
covering phase74/75 have still never been exercised** - that run remains the
next operator action (needs `.env` + live staging, never inside an
autonomous run). Expected: every group OK, zero MISSING, zero PENDING; no
unapplied migration exists in the repository.

**Production (`avkighsiufeefyycbebf`) still has none of the migrations.**
Standing decision: rebuild from a staging dump once staging is beta-ready;
`PROD_APPLY.md` is the ordered fallback. Production was never contacted.

### anon-EXECUTE evidence - preserve on any rewrite

Settled by a live `pg_proc` read on staging, 2026-08-16 (before phase74/75
were applied):

> Exactly ONE function in schema `public` is EXECUTE-able by `anon`:
> `job_categories_expanded()`, SECURITY INVOKER, returns boolean, ACL
> `postgres=X/postgres | anon=X/postgres | authenticated=X/postgres`. That is
> the deliberate one (phase69 re-granted it). `worker_job_stats`,
> `deactivate_push_token` and `resolve_notification` did NOT drift.

That ACL string cannot be re-derived from any file in this repository and
exists nowhere else. Preserve it on any rewrite of this document. Neither
phase74 nor phase75 disturbs the finding.

## Still blocking a beta, worst first

1. **Phone sign-in dead-ends on a release build.** `EXPO_PUBLIC_PHONE_AUTH_MODE`
   unset means `mock` in development and `disabled` in a release, and `mock`
   is refused when `__DEV__` is false - correctly, since no SMS provider is
   configured. Email + password is the only authenticating path. See
   `docs/phone-auth-activation.md`.
2. **Supabase session tokens sit in unencrypted AsyncStorage.** Swap the
   `createClient` storage adapter to `expo-secure-store`.
3. **Payments are sandbox-only and configuration-governed.**
   `EXPO_PUBLIC_PAYMENTS_MODE=sandbox` must be set for a release/TestFlight
   build to run payments at all; no real provider exists behind the
   resolver (deliberate for beta).

## Needs the operator - outside any run

**A. Run `node scripts/verify-schema.mjs` against staging** - the only thing
that makes "phase74/75 applied" official; their two groups have never run.
**The env-parity gate fails closed (4D-B).** If `.env`'s `SUPABASE_KEY` is a
new-format `sb_…` publishable key the run will stop at the parity gate
(exit 3) with the remedy in the message; check the prefix first:
`sed -n 's/^SUPABASE_KEY=\(...\).*/\1/p' .env` prints only the first three
characters (`eyJ` = will proceed, `sb_` = will stop — swap in the legacy
`eyJ…` anon key for the staging project). No agent run can read the prefix
itself: `.env` is mechanically denied to agents.

**B. The next TestFlight build will fail its own gate** (unchanged from
Stage 4A): the EAS `preview` environment's `SUPABASE_KEY` is a new-format
publishable key (`sb_pu…`); `refFromJwt` cannot resolve it, so
`evaluateGate` fails closed. Replace with the legacy `eyJ…` anon key -
**production's**, because the `testflight` profile selects the `preview`
environment and `EXPECTED_REF.testflight` is the production ref. The
related verify-schema silent-degradation noted here previously was FIXED in
4D-B — it now fails closed the same way.

**C. "preview" names two different things.** `EXPECTED_REF` maps
`preview → STAGING_REF`, but the EAS **environment** named `preview` holds
production credentials and is what the `testflight` profile selects.
Nothing is broken; the docblock on `EXPECTED_REF` explains.

**D. `EXPO_PUBLIC_PAYMENTS_MODE` governs whether payments run.** For
payments on a release build set it to `sandbox` in `.env` and restart Metro
(Expo inlines `EXPO_PUBLIC_*` at bundle time).

**E. `RAISE NOTICE` is invisible in the Supabase SQL Editor.** Acceptance
for single-transaction migrations is "Success. No rows returned." plus a
green verify-schema; phase74/75 each end with a visible-acceptance SELECT.

**F. Device-test backlog.** Still pending from 4D-1a/4D-1b (suite-verified
only): worker-mode cold start lands on WorkerHome every time with no
"Get hired. / Get paid." screen reachable; the worker search field lands on
Search Results; Map's worker "See All Jobs" lands on Available Jobs;
"Taking new work" visible to a second account; the four customer tabs +
[ + ] sheet; cross-mode bid-notification switch prompt; My Jobs buckets
mid-approval. **New from 4D-3:** post a fresh job through the wizard
(guidance appears for a seeded category and steps aside while typing a
budget; Continue stays disabled under 20 description characters with the
count shown; the photo nudge dismisses and stays dismissed after an app
kill restores the draft); Compare Bids with 2+ bids (order matches the
stated rule; HIGHEST RATED only under its conditions); Saved & past workers
(a saved past worker appears once under Saved; a deleted user shows no
Hire); the Find-help landing strip; bid chips appending exactly one line
and disabling on a ~500-char pitch; "Book at listed price" prefilling the
composer including the amount; Flat price / Ask me; the completeness meter
moving as steps complete and vanishing at 4/4 (and absent in customer
mode).

**G. Unlock decision — WelcomeScreen's "Verified workers" line.** With the
badge removed everywhere else, locked screen 02 is the only remaining
user-visible verification claim. Removing or rewording it requires
unlocking that screen; the 4D-B suite's allow-list names it so the
exception stays visible.

**H. 4D-2 (worker discovery and map) remains undispatched** — it was not a
dependency of 4D-3 and nothing in this run touched its surfaces. Dispatch
it whenever its turn comes; `docs/audits/STAGE4D_PLAN.md` holds the scope.
