# FILE LEASES — ULTRACODE pre-review hardening run (2026-08-09)

Partition model: **single-writer**. Every repository write is leased to the
LEAD agent alone. Subagents dispatched by this run are READ-ONLY on the
repository — they inspect, probe staging inside rolled-back transactions,
and return findings with exact file/line references and proposed patches;
the lead applies (or declines) every change serially. This satisfies the
"exactly one agent may write any given file" rule with zero shared-write
surface and makes lease conflicts structurally impossible.

## Serial-only (lead agent, charter-mandated)
- lib/jobLifecycle.ts (lifecycle derivation helper) — ALSO under
  LOCKED-adjacent care: single source of truth
- modes/* (ModeContext) — LOCKED_MANIFEST (read-only this run)
- navigation/* and lib/navigation.ts — navigation config
  (lib/navigation.ts is additionally in LOCKED_MANIFEST → read-only)
- supabase/* (every migration)
- BRAZOS_BUILD_STATE.md, DECISIONS.md, LEASES.md, PROD_APPLY.md,
  REVIEW_GUIDE.md

## LOCKED_MANIFEST (read-only for the ENTIRE run, all agents)
95 files: screens 01–07, 48, the shared auth flow, and their recursive
repo-local dependency graph — baseline hashes captured in the run
scratchpad (locked-manifest.baseline.txt). Includes, notably:
lib/jobs.ts, lib/offers.ts, lib/messages.ts, lib/profiles.ts,
lib/navigation.ts, lib/jobFilters.ts, lib/hotspots.ts, lib/theme.ts,
lib/supabase.ts, lib/storage.ts, lib/dialog.ts, lib/time.ts, modes/*,
components/{Button,ScreenHeader,WorkerJobCard,JobFilterSheet,Skeleton,…},
hooks/{useAuth,useProfile,useOpenJobs,useOfferCounts,…},
screens/WorkerResultsScreen.tsx, ui/tokens.ts, ui/primitives/Sheet.tsx.
A defect whose only fix lives in one of these files is recorded under
NEEDS REVIEW with the exact change — never applied.

## Lead-writable scope (everything else), notably
Phase 6–12 screens (RouteArrival, WorkChecklist, TrackWorker,
ApproveOrDispute, ReviewAndTip, WorkerJob, ClientJobDetail, JobDetail,
SubmitBid, BidDetail, CompareBids, Checkout, JobConfirmed, Chat,
MessagesInbox, ServicesPricing, SavedWorkers, PaymentMethods, Earnings,
Notifications, MarketJobPreview, QuickReplies), lib/{jobLifecycle,
payments, earnings, earningsMath, checklist, disputes, conversations,
notifications, savedWorkers, services, adapters/*}, tests/*, scripts/*.

## Subagent contract (all Workflow agents this run)
READ-ONLY on the repo. Staging DB access only through transactions that
ROLL BACK. Never print secrets. Production is unreachable and must never
be referenced. Findings return as structured output to the lead.
