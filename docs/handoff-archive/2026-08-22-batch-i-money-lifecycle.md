## 2026-08-22 — BATCH I: money and lifecycle consolidation (F-011, F-012, F-070) — COMPLETE

Six functional commits plus this record: `76005a0` money, `df0a885` test,
`b0cc036` JobProgress, `d5d7a89` jobStage, `1440544` StatusPill/StatusBadge,
`47197a4` screens. Bare `npm run verify` exit 0 after every one; **final
suite 846 pass / 0 fail / 0 TS errors** (baseline 835 — +11: one money fence,
six statusVocabulary tests, four lifecycle fences). Pushed under the autonomy
gate; `git` is the authority on what reached the remote.

**Money (F-011):** `servicePriceLabel()` no longer re-implements
`formatBudget()` — it imports it and owns only the '/hr'/'flat' suffix and
the null 'Ask for a quote' guard. Fence: `lib/services.ts` may not contain
locale calls, cents arithmetic, or a hand-built dollar string.

**The five lifecycle vocabularies are now one derivation + presentation:**

* `lib/jobLifecycle.ts` — CANONICAL, body untouched this run.
* `components/JobProgress.tsx` — adapter: `trackStepIndex(deriveJobLifecycle(
  status, payment: null))` collapsed to its 3 steps; local ORDER map deleted.
  One deliberate NON-string delta (decision 5): off-track statuses
  (cancelled — reachable from a worker's closed job — and anything
  unclassifiable) used to fall through `?? 0` and draw "Assigned" as done;
  they now claim nothing.
* `lib/jobStage.ts` — adapter: switches on the DERIVED state (payment-blind
  by signature; raw 'assigned' arrives as 'pending_payment' and still labels
  'Assigned'); exports the ONE `formatStatus` title-caser.
* `components/StatusBadge.tsx` — presentation: imports that `formatStatus`;
  its local character-identical copy is deleted; colour map unchanged.
* `ui/primitives/StatusPill.tsx` — presentation over caller-supplied enums;
  derives nothing. Its 14-value job map has ZERO `kind="job"` callers (only
  offer/payment pills mount) and stays byte-frozen for the operator's label
  pass. Both stale Phase-3 promises in its header are deleted — replaced by
  standing facts, no new promise.

**tests/statusVocabulary.test.mjs (F-070)** — `create type public.job_status`
predates the tracked migrations (phase40's precedent), so the enum is
reconstructed from four value-reference patterns, each asserted non-empty:
ALTER TYPE (phase45: draft), casts (phase23/24/60: open; 45/46/50/61: draft;
46/50: assigned), literal jobs.status writes (phase13/67/75: cancelled;
29/30/46/50: assigned), transition graph (29/31/35/51/58/68 + rollback/73:
assigned/in_progress/completed). Union == deriveJobLifecycle's raw cases ==
{assigned, cancelled, completed, draft, in_progress, open}. Seven derived
states beyond the enum sit in a reasoned allowlist (pending_payment,
confirmed, en_route, arrived, awaiting_approval, disputed, unknown — note:
seven, the dispatch's list of six omitted 'confirmed'); 'assigned' is pinned
as the one enum value the derivation never emits.

**The label snapshot** in that file (StatusPill's three maps, StatusBadge's
keys + frozen title-caser chain + render pipeline, jobStage executed through
the stripTypeScriptTypes harness, JOB_LIFECYCLE_LABELS) is **byte-unchanged
since the commit that created it** — no user-visible string moved this run.
**Label COLLISIONS found and left standing for the operator:** `in_progress`
renders "In Progress" (StatusBadge/jobStage, on WorkerJob + ClientJobDetail)
but "In progress" (JOB_LIFECYCLE_LABELS, on RouteArrival/WorkerJob action
titles; also StatusPill's unreachable job map); `pending_payment` is
"Awaiting payment" (StatusPill, unreachable) vs "Awaiting payment
protection" (canonical, reachable). Converging any of these means editing
the snapshot in a commit that says so.

**Screen ladders (decision 6):** replaced 5 — ClientJobDetail's hasLifecycle
(now `trackStepIndex(...) >= 0`, payment-blind so a failed payment read
cannot flip AGREED PRICE) and its funding-card in_progress/completed copy
fork (1:1 under canFundNow), RouteArrival's arrival caption, WorkChecklist's
read-only tag. Left as control flow: ClientJobDetail ×6 (canAccept, fetch
gate, cancelled section, Track-worker gate, held-payment card selector, the
completed section fork — the raw check there also distinguishes
completed-with-failed-reads, which 'unknown' collapses, and three suites
anchor its text), WorkerJob ×4 (fetch gate + three action sections),
RouteArrival ×1 (action bar), WorkChecklist ×1 (RLS-mirror edit gate),
useJobOwnerActions ×2 (permission gates, documented Hire-Again reason).
`lib/disputes.ts` verdict: clean — its own disjoint dispute vocabulary,
filters only, no lifecycle classification.

**Fences added:** services no-currency; no raw status→step-index map outside
`lib/jobLifecycle.ts` (sweep over screens/components/ui/hooks/lib);
JobProgress explicit claim-nothing branch; jobStage explicit `case
'unknown'` + no raw-status switch; one title-caser only; no Phase-3 promise
in StatusPill; WorkChecklist added to the one-helper screen loop. Every new
assertion was mutated red first (nine mutations across the run, each named
in its commit message).

**Device walk OWED (operator):** one job through assigned → in_progress →
completed, naming every label at each step — hub card badge (StatusBadge via
jobStage: "Assigned"/"In Progress" poster-side/"Completed"), ClientJobDetail
hero badge + JobProgress steps, WorkerJob badge + action-card title
(canonical: "Awaiting payment protection"/"Confirmed"/"On the way"/
"Arrived"), RouteArrival "WHERE THINGS STAND", and a worker-side cancelled
job's stepper (must now show NO completed steps).

