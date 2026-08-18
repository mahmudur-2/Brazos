# Stage 4D full regression audit — 2026-08-18 (overnight run)

Read-only findings document. Ranked BLOCKER / DEFECT / RISK / NOTE, each with
file:line and a one-line consequence. "4D" = introduced by a Stage 4D commit;
"pre-existing" = present before Stage 4D began (when unsure, classified
pre-existing per the dispatch rule).

## Range audited and why

- **Primary diff: `bbdf7e0..b858053`** — the merged 4D-3.5 + 4D-2 + 4E run
  (six commits: 09ff9e8, c2ab783, 751e5a8, bd59bad, 65ea7cc, b858053), the
  minimum the dispatch names.
- **Earlier Stage 4D commits identified from subjects and HANDOFF history**,
  reviewed at lower depth (their own HANDOFFs and suites already pinned
  them): 4D-1a (a1bd460, 142517a), 4D-1b (f9d40cd, e222a8b, 0fe3470,
  2f987fc), 4D-A (16aed0b, read-only), 4D-B (820b909, 0f34344, 43d1e7f,
  2ff0e59), 4D-3 (0ebfc6f, 8abd0c4, 5d78994, 213cd20, bbdf7e0).
- **Repo-wide invariant sweeps** (mode purity, escrow copy, money paths,
  status writes, hex, `.select('*')`, coordinate leaks) were run against the
  whole tree, not just the diff — an invariant violated anywhere is a
  violation regardless of which commit introduced it.

Tonight's own COMMIT 1 (cf144aa) landed before this document was written and
is referenced where it closes a finding.

## BLOCKER

- **(FIXED tonight, cf144aa) GPS-coordinate location leak — pre-existing.**
  `lib/geolocation.ts:126` (pre-fix) labeled a place with its raw
  four-decimal GPS pair on double reverse-geocode failure;
  `screens/PostJobScreen.tsx` accepted it into the location field;
  `lib/jobs.ts` stored it via `create_job` `p_location`; `OPEN_JOB_COLUMNS`
  exposed it to every signed-in browser. Consequence: a ~10 m fix on a home
  published on the open market, violating the job_locations privacy
  invariant. Fixed fail-closed (empty-label fallback, write-boundary
  refusal, open-market mask) with 11 tests — see `tests/locationPrivacy.test.mjs`.
  The server-side CHECK on `jobs.location` is deliberately NOT authored
  tonight: existing rows must be inspected live first (an ALTER would abort
  on a violating row). Recorded in HANDOFF as a pending migration.

No other BLOCKER found.

## DEFECT

- **Raw Supabase `error.message` reaches users on two LOCKED auth screens —
  pre-existing, logged only (locked).** `screens/EmailSignInScreen.tsx:61`
  and `screens/EmailCreateAccountScreen.tsx:84` render `error.message`
  verbatim via `setFormError`. Consequence: engine text can surface (most
  auth errors are human-written, so exposure is mild). Every other
  `error.message` call site is `console.warn` (dev-visible only). Fix
  belongs to the locked-screen patch queue (route through
  `lib/errorMessage.ts userMessage()`), candidate for a future
  LOCKED_FILE_PATCHES entry.

## RISK

- **`response_time` renders as "Responds in {value}" — 4E, known.**
  `screens/WorkerProfileScreen.tsx:302` assumes the nullable free-text
  column holds a duration phrase ("2 hours"). Consequence: ops writing any
  other shape ("usually same day") yields broken copy ("Responds in usually
  same day"). Flagged in HANDOFF at merge time; no fix without a product
  decision on the column's contract.
- **`useLegalGate` fails open — pre-existing, deliberate, LOG ONLY per
  dispatch.** `hooks/useLegalGate.ts:29-32`: a failed acceptance check
  reports 'accepted'. Consequence: a user can pass the consent gate during
  an outage. The docblock argues the availability tradeoff; changing it is a
  product decision, not tonight's.
- **`lib/jobStatusCompatibility.ts:118` writes `jobs` directly —
  pre-existing, gated.** `transitionJobStatusWithoutRpc` UPDATEs
  status/completion columns, called only on PGRST202 (missing
  `transition_job_status` RPC), with ownership/status re-checked as update
  filters and RLS as final authority. Consequence: a second status path
  exists in principle; `docs/architecture.md:370` already says "do not
  extend this pattern". No action tonight; its removal belongs to the
  version-gate phase.
- **Terms of Service contains the word "escrows" — pre-existing,
  untouchable tonight.** `lib/legal/termsOfService.ts:79`, inside a DENIAL
  ("not a payment Brazos holds, guarantees, escrows, or collects"). The
  settled copy rule ("held in protection") targets product claims of
  protection; this is a legal disclaimer using the term to deny it, and the
  dispatch's COMMIT 11 forbids touching termsOfService.ts. Consequence:
  none user-facing today; flag for the next legal-copy session.

## NOTE

- **Mode purity holds.** The trees are separately typed
  (`lib/navigation.ts` CustomerParamList/WorkerParamList; one mounted at a
  time via `navigation/ModeShell.tsx`); `screens/MapScreen.tsx` gates every
  worker-discovery surface on `mode === 'worker'` (pins, chips, sheet —
  lines 88-113, 211-281); `screens/JobDetailScreen.tsx:483-485` delegates
  customer mode on someone else's job to `MarketJobPreview`. No worker
  surface reachable in customer mode was found, or vice versa.
- **Lifecycle derivation is not duplicated.** `lib/jobLifecycle.ts` remains
  the one derivation point. Four inline RAW-status membership checks exist
  (`screens/ClientJobDetailScreen.tsx:126,772`,
  `screens/CheckoutScreen.tsx:102`, `screens/WorkChecklistScreen.tsx:61`) —
  primitive conditions, not copies of any derived rule; all pre-existing.
  A named `isHiredActive(status)` helper would remove the drift surface if
  those ever multiply.
- **No client assignment/status writes outside the documented shim.** No
  `.update({status})`/`.update({assigned_worker_id})` on `jobs` anywhere in
  app code except the compatibility shim above (the `reports` moderation
  update at `lib/moderation.ts:181` is a different table and fine).
  `advance_job_status`: zero live references — only archives, the negative
  assertion in `tests/governance.test.mjs:80`, and the architecture note.
- **Money renders only through `formatBudget()`.** No `$`-template, no
  `cents / 100` arithmetic, no `.toFixed(2)` money formatting anywhere in
  screens/components/ui. No money label ahead of its payment state found;
  `myJobsNextAction` (lib/jobLifecycle.ts:201) encodes the
  never-"paid"-before-release rule. The merged run added no fee/payment
  copy (diff-checked); existing fee copy is ledger-derived (commit 6b6f7ce)
  and governed by `tests/platformFee.test.mjs`.
- **Hex/radii/spacing sweep matches the merged run's documented allowlist
  exactly.** Outside token-definition files, locked screens 01-07/48 and
  the frozen web surface: `components/AuthNotice.tsx:31,50` (A10 queue),
  `components/ModeTransitionOverlay.tsx:449` (T3 brand shimmer), and
  READ-ONLY `lib/authTheme.ts` (the auth token home). No direct
  `ui/tokens.ts` import in any screen. Domain data colors in lib
  (`lib/hotspots.ts:32-35` tier strokes, `lib/jobs.ts:68-80` category
  accents) predate 4D and are content constants, not a third theme surface —
  left as-is, worth folding into tokens during 4D-4's sweep if desired.
- **No exact address or precise coordinates on open-market views.**
  `fetchJobLocation` (the `job_locations` read) is called only from
  `ClientJobDetailScreen` (owner), `PostJobScreen` edit (owner), and
  `RouteArrivalScreen` (assigned worker) — RLS-backed surfaces.
  `jobs_within_radius` returns server-computed `distance_miles`, never raw
  lat/lng (`lib/hotspots.ts:210-222`). Cross-check with COMMIT 1: stored
  coordinate-SHAPED labels are now also masked at `toOpenJob`.
- **Copy rules clean elsewhere.** No "escrow" in app surfaces outside the
  Terms denial above; no "always"/"forever" applied to fees (all hits are
  code comments); "Deleted user" appears only verbatim
  (`lib/rebook.ts:16 DELETED_USER_LABEL`, `screens/DeleteAccountScreen.tsx`);
  no match percentages (`lib/matchReasons.ts` is boolean checkmarks,
  test-guarded); no worker calendar surface (`lib/workerSearch.ts:38`
  documents availability/calendars as not stored; WorkerJobCard's
  calendar-outline icon marks a JOB's scheduled date, which is allowed).
- **Navigation: no dead targets found.** No `navigate('BrowseJobs')`
  dispatch remains (4D-1b unmounted it; the locked screen is reached only
  as a legacy component import via WorkerResults' re-export). `Create` and
  `ComponentCatalog` are typed-but-not-dispatched by documented design
  (`lib/navigation.ts:454-460, 424-431`). WorkerResults' `label` param is
  consumed (`screens/WorkerResultsScreen.tsx:156,198`). Hidden customer
  MyJobs/Map routes are deliberate (`lib/navigation.ts:463-472`).
- **`ui/primitives/JobCard.tsx` claims to replace cards that still exist**
  (its docblock names BrowseJobCard/WorkerJobCard). Checked in tonight's
  COMMIT 5 sweep for orphan status — see that commit's result; if it has
  zero importers it is dead code, if it has importers the docblock is
  stale. Pre-existing either way.
- **Runtime `.select('*')` inventory (feeds COMMIT 9), confirmed complete
  by repo-wide sweep — exactly the dispatch's known list:**
  - `lib/conversations.ts:70`
  - `lib/reactions.ts:19`
  - `lib/reactions.ts:36`
  - `lib/portfolio.ts:47`
  - `lib/notificationPrefs.ts:75`

## Counts

- BLOCKER: 1 (fixed tonight, cf144aa)
- DEFECT: 1 (logged — locked screens)
- RISK: 4 (all logged; 1 is 4E-introduced and was disclosed at merge)
- NOTE: 10 (verifications and inventories; no action required tonight
  beyond COMMIT 5/9 follow-ups)
