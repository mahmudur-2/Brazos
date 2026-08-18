# BRAZOS - HANDOFF

Operational context, rewritten every run. Machine state is Git's, not here.

## 2026-08-18 (overnight) - Stage 4D audit, P0 privacy fix, gates, truth-up

**No SQL executed, no database contacted, no schema object touched, no
dependency added, nothing pushed, no locked file edited, no `.env` read.**
Eleven commits before this one, all twelve dispatch items executed (none
skipped), every code commit on a green `npm run verify`. Suite: **665 pass
at the base gate → 696 pass / 0 fail / 0 skipped** at the end. Base gate
note: `git merge-base` is denied by the permission matrix; ancestry was
proven by identity (HEAD *was* b858053).

### The P0 — GPS-coordinate location leak (cf144aa): CONFIRMED, FIXED

The externally-alleged chain was real and live: on double reverse-geocode
failure `lib/geolocation.ts` labeled the place with its raw four-decimal
GPS pair ("40.6501, -73.9496" ≈ 10 m), PostJobScreen accepted it,
`create_job` stored it in public `jobs.location`, and `OPEN_JOB_COLUMNS`
served it to every signed-in browser. Fixed fail-closed, client-only:

- Empty label on double failure (never coordinates); any coordinate-shaped
  geocode output scrubbed by the same rule.
- `lib/locationPrivacy.ts` (new, pure) — the ONE coordinate-shape rule:
  full-string two signed decimals with 3+ places; never broader, so real
  addresses with numbers pass.
- Write boundary: createJob / updateJob / createDirectOffer refuse
  coordinate-shaped `p_location` with a written sentence (fits
  isSafeToShow's 160-char gate).
- Open-market mask in `toOpenJob`: coordinate-shaped STORED rows render as
  absent (browse/search/map/detail/market preview). Owner and
  assigned-worker surfaces (mapJobRow) deliberately unmasked.
- 11 tests in tests/locationPrivacy.test.mjs (executed rules + wiring pins).

**Pending migration (operator prerequisite named):** a server-side CHECK on
`jobs.location` refusing coordinate-shaped values was deliberately NOT
authored. Prerequisite: inspect staging (and any real) rows first — e.g.
`select id, location from jobs where location ~ '^\s*-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\s*$';`
— because existing violating rows would abort the ALTER. Scrub or accept
them, then author the CHECK as a numbered phase.

### The other ten commits

| commit | what it did |
| --- | --- |
| f92cd0c | docs/audits/STAGE4D_AUDIT.md — full 4D regression audit (range bbdf7e0..b858053 + repo-wide invariant sweeps). 1 BLOCKER (the P0, fixed), 1 DEFECT (raw error.message on two LOCKED auth screens — logged), 4 RISK (response_time phrasing; useLegalGate fail-open; jobStatusCompatibility shim; Terms "escrows" denial — all logged), 10 NOTE verifications. Mode purity, lifecycle single-source, money-through-formatBudget, hex allowlist, copy rules: all hold. |
| 37da53f | tests/stage4dInvariants.test.mjs — executed coverage for what had none: arrivalWindowLabel (both-or-neither, 12h edges, hour-24 wrap, TZ-safe date), budgetRangeLabel/hasBudget, the no-"paid"-before-release vocabulary over every lifecycle label and next-action, and the B3 radius-ladder pin. |
| 201858b | Price guidance label is exactly "Suggested starting range" (pre-decided; label only, one producer in lib/priceGuidance.ts). |
| 7d0b066 | Dead code: components/SectionHeader.tsx and ui/templates/ListScreen.tsx deleted (zero-importer proof); four stranded exports un-exported. hooks/useChat.ts (LOCKED) and BrowseJobsScreen (locked 48, unmounted by design) logged, untouched. ui/primitives/JobCard.tsx is LIVE (catalog + mode tests) but its docblock still claims to replace cards that exist — stale, left for a docs pass. |
| c1b17b0 | Money ceiling refusals read the pre-decided verbatim copy: "Amount must be $100,000 or less." / "Tip must be $1,000 or less." (mirror itself landed in 4D-B; both exact strings now test-pinned at the one-cent-over boundary). |
| 4eafe45 | ONE bid-ordering rule (pre-decided): lib/compareBids.ts is the single source. ClientJobDetail consumes sortBidsForChip; chips are exactly "Lowest price" / "Highest rated"; default (no chip) = the stated deterministic rule. offerValueScore / sortOffers / bestValueOfferId / OFFER_SORT_OPTIONS and the "Best value" badge are DELETED with a do-not-reintroduce note; SegmentedControl accepts a null value (nothing selected). |
| 4f1354c | Release gates accept new-format keys, fail closed: URL ref is authoritative (refFromRestUrl); eyJ keys decode + cross-check; sb_publishable_/sb_pu_ accepted as format (live control probe verifies pairing); anything else — sb_secret_ included — refused. verify-schema parity matches (publishable continues with "key format carries no ref; URL ref is authoritative"; other unresolvable keys still exit 3). EXPECTED_REF and every ref literal untouched. |
| 41c545b | Explicit projections for all five audited runtime select('*') sites (conversations, reactions ×2, portfolio, notificationPrefs) plus their same-module bare .select() returning calls; tests/projections.test.mjs pins list ⇄ type equality parsed from source. Nothing was unprovable. |
| 628987c | Docs truth-up: PROD_APPLY.md/PROD_APPLY_READY.sql/PROD_VERIFY.sql carry SUPERSEDED headers (51-58 only; production path = staging-dump rebuild); master plan loses done items (money mirror, customer-safe preview — verified at JobDetailScreen:483, 42P17 via phase60) and its gate entry now describes the URL-derived gate; sharedStacks' KNOWN GAP comment records the gap as closed; REVIEW_GUIDE stops promising pre-hire "Message Wren first" (phase66); brazos-product-spec.md gets the ARCHIVED banner; LOCKED_FILE_PATCHES gains A12. |
| 8a5c873 | Privacy policy: three false statements corrected verbatim (deletion behavior incl. "media files not yet automatically removed from storage" per phase67's deliberate no-cleanup; Profile → Delete Account is the real control; completion media sits in the public job-photos bucket until private storage lands). Terms untouched. legalGate.test.mjs pins the corrected facts. |

### Judgment calls this run

- **"Highest rated" chip = the default order made explicit.** The factual
  rule already leads with rating; the chip exists so the user can SAY it.
  "Lowest price" leads with amount and keeps the full deterministic chain
  as tiebreak — no blended score anywhere, per the final decision.
- **The Terms' "escrows" stays.** It is a DENIAL ("not a payment Brazos
  holds, guarantees, escrows, or collects") inside the one file tonight's
  dispatch forbade touching; the settled copy rule targets product claims
  of protection. Flagged for the next legal session.
- **PRIVACY_VERSION was NOT bumped.** The policy module's own header says a
  substance change should bump it so users re-accept; tonight's edits make
  the draft truthful but re-acceptance is a product call the dispatch did
  not order. Operator decides (see queue).
- **sb_secret_ keys are refused by the new gate** even though the dispatch
  only said "any other format = fail closed" — a secret key in a client
  bundle must never pass a format check.

## Applied reality - staging `zzkumxcjtbqoselzptig`

Unchanged by this run — the run was repository-only. phase74 (push
scheduler) + phase75 (security hardening) are committed and
operator-applied to staging; phases 67-73 applied and verified green
2026-08-16. **Per standing policy only a green
`node scripts/verify-schema.mjs` counts as applied, and the two groups
covering phase74/75 have still never been exercised** - that run remains the
next operator action (needs `.env` + live staging, never inside an
autonomous run). Expected: every group OK, zero MISSING, zero PENDING; no
unapplied migration exists in the repository. The pending location-CHECK
migration above is not yet authored, so nothing new awaits apply.

**Production (`avkighsiufeefyycbebf`) still has none of the migrations.**
Standing decision: rebuild from a staging dump once staging is beta-ready;
`PROD_APPLY.md` is now marked SUPERSEDED and is history/fallback only.
Production was never contacted.

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

**A. Run `node scripts/verify-schema.mjs` against staging** — still the
only thing that makes "phase74/75 applied" official; their two groups have
never run. NEW since tonight: the parity gate is format-aware — a
new-format `sb_…` publishable key in `.env` no longer stops the run (it
prints "key format carries no ref; URL ref is authoritative" and
continues); only a key in neither recognized format exits 3. The old
"swap in the legacy eyJ key first" instruction is obsolete.

**B. TestFlight retry is now possible WITHOUT swapping keys.** The EAS
gate derives the ref from SUPABASE_URL; the `preview` environment's
existing `sb_pu…` publishable key passes the format check. Run one
TestFlight build to confirm the gate goes green end-to-end.

**C. "preview" still names two different things** (EAS environment holding
production credentials vs. the unreachable EXPECTED_REF row). Nothing is
broken; the docblock on EXPECTED_REF explains. Unchanged.

**D. `EXPO_PUBLIC_PAYMENTS_MODE` governs whether payments run.** For
payments on a release build set it to `sandbox` in `.env` and restart Metro
(Expo inlines `EXPO_PUBLIC_*` at bundle time).

**E. `RAISE NOTICE` is invisible in the Supabase SQL Editor.** Acceptance
for single-transaction migrations is "Success. No rows returned." plus a
green verify-schema; phase74/75 each end with a visible-acceptance SELECT.

**F. Location-CHECK migration (from the P0).** Before authoring it: run the
data inspection named at the top of this file against staging; scrub or
accept any coordinate-shaped `jobs.location` rows; then a numbered phase
adds the CHECK. The client already refuses and masks, so this is
defense-in-depth, not urgent-first.

**G. Locked patches A10-A12 (docs/LOCKED_FILE_PATCHES.md).** A12 is new
tonight: WelcomeScreen "Verified workers" → "Real customer reviews",
"Protected payment" → "Clear upfront pricing" — both current claims are
false under the shipped product and Terms. Should land before any external
beta. (A12 supersedes the old standing item about the WelcomeScreen
verification line.)

**H. PRIVACY_VERSION decision.** lib/legal/privacyPolicy.ts changed
substantively tonight (three factual corrections). Its header says a
substance change should bump PRIVACY_VERSION in lib/legal/index.ts so
users re-accept. Not bumped autonomously — decide whether the corrected
WORKING DRAFT warrants re-acceptance now or at the counsel-reviewed
version.

**I. Device-test backlog.** Everything from the 2026-08-18 4D HANDOFF list
(see git history for the full text) remains, plus new from tonight:
- ClientJobDetail bid list: with >1 bid, no chip is selected by default and
  the order is rating → price → earliest; "Lowest price" and "Highest
  rated" chips select and re-sort; NO "Best value" badge appears anywhere.
- Post flow: with airplane mode (geocode dead), "Use my current location"
  keeps typed text, saves coords, and asks for an area name; a job cannot
  be posted with a coordinate-shaped location string typed by hand (the
  written refusal appears).
- Price guidance step reads "Suggested starting range: …".
- Profile → Legal → Privacy Policy shows the corrected §7 (Delete Account
  path, media-retention honesty).

**J. `node --test` needs Node with type-stripping** (the suite imports .ts
directly) — the environment already satisfies this; noting it because
tests/projections.test.mjs and tests/locationPrivacy.test.mjs added more
direct-import surface.

**K. 4D-4 remains the next feature dispatch** — dark resolution
(Appearance + stored preference + setting UI), dark map style (T2), dark
brand assets (T3), `userInterfaceStyle: "automatic"` (T1, native build),
and the both-themes full-screen sweep, per `docs/audits/STAGE4D_PLAN.md`.
