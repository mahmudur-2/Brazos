# DECISIONS — dated, append-only

Format: `YYYY-MM-DD · D-n · decision · reason · reversible? (cost to reverse)`
Taste decisions (font, colour, asset, spacing) are not reversed within 48 hours of their date. A reversal is a new entry citing the reason.

Prior history, not restated here: `DECISIONS.md` at the repository root holds the phases 6–12 forks, `docs/emerald-v2/DECISIONS.md` holds the Emerald V2 redesign forks, and ADR-0013 — the fee rates — lives in `docs/BRAZOS_TARGET_ARCHITECTURE_v2.md` §12.1, carried forward as D-3 in `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` §2.2, which is the standing decision table D-1…D-16.

2026-08-30 · D-0 · This kit replaces ad-hoc process; governance changes need a named failure they would have prevented · retrospective · yes (delete the file)

2026-08-31 — Platform: iOS only for v1. Android stays buildable, not a release target. Reason: every device walk doubles on a second platform and the operator is the only device tester; the platform differences sit in the money path, which is the most expensive place to diverge; a second store is a fifth external clock. Reversible — the code is not removed.

2026-08-31 — R8a reputation, five decisions locked by the operator. Where `docs/BRAZOS_TARGET_ARCHITECTURE_v3.md` (§4.3 row 6, "double-blind, 14-day auto-publish", and A.2's D-§10 #6) says 14 days, this dated decision supersedes it — do not "correct" back to 14.
- D1 Double-blind: a review is hidden until BOTH sides have written, or 7 days after it was written, whichever comes first. Computed at read time (`review_is_revealed()`); no reveal column, no cron.
- D2 Writing window: 30 days from `jobs.completed_at` — a separate clock from the blind window. A late review still lands; it just isn't blind. `completed_at` NULL (legacy rows) → no window enforced.
- D3 Two reputations per person, worker and customer, never mixed. Role is derived per review from the job: the reviewee was the worker if `jobs.assigned_worker_id = reviewee_id`, the customer if `jobs.client_id = reviewee_id`. No role column.
- D4 New-rating cold start: the publicly shown rating is shrunk toward a platform prior — `shown_average = (5m + sum)/(5 + n)`, m the platform-wide revealed average for the role, 4.5 when the platform has none — and "New" under three revealed reviews.
- D5 would-you-hire-again / would-you-work-for-them-again captured per review (`reviews.would_again`); rehires counted; workers see a customer's record before bidding (`client_job_stats`).
Deliberately untouched by R8a: `recompute_profile_rating`, `profiles.rating_avg`, `profiles.rating_count` — the legacy mixed aggregate. R8b-c (2026-09-01) repointed the single-subject surfaces (ProfileScreen, ProfileDetailsScreen, WorkerProfileScreen via lib/workerHeroCard.ts, PublicProfileScreen, BidDetailScreen); the list surfaces (WorkerSearchScreen, SavedWorkersScreen, CompareBidsScreen / OfferCard via lib/compareBids.ts, lib/workerSearch.ts scoring) and the trigger remain on it, pending a schema run — a batch per-role summary function first, then retirement (`docs/BACKLOG.md` §v1.2). Reversible — read-time predicates and additive columns, nothing destructive (cost: one corrective migration).

2026-08-31 — Provenance ruling: a document reconstructed from a gate's implemented core IS that gate's OUTPUT. Gate 1's last box asks for the architecture document "written as the OUTPUT of this gate"; `docs/README.md` classifies `docs/architecture.md` as "Implemented architecture, reconstructed from source". Reason: the gate asks what the document must contain and prove — state machines, table names, RPC contracts — not which came first off the keyboard; a document reconstructed from that gate's implemented core states exactly those things, and holding the box open on the order of authorship would leave it permanently unclosable, since no later run can change where a document came from. That classification therefore does not bar Gate 1's provenance box. The ruling changes how the classification is READ, not the classification: `docs/README.md` and `docs/architecture.md` are unedited by it. Not reversed inside 48 hours of this date. Reversible — a later dated entry citing its reason re-opens the box (cost: one entry and one gate tick).

2026-09-01 — R8b-c reputation display, three decisions locked by the dispatch:
- D1 One rating number everywhere: `shown_average` from `profile_review_summary`, or the word "New" when `is_new`. The raw `average` is displayed on no surface. Reason: a profile and the page one tap below it must never print two different numbers for the same person — that is the defect class R8b-c repairs. Reversible — display-layer only (cost: one client run).
- D2 Default role is worker everywhere; the customer reputation is reachable only through the toggle on the reviews page. Reversible — display-layer only (cost: one client run).
- D3 Skipping would-you-again stays legitimate: NULL is a valid answer — no validation, no Skip control. Reversible — display-layer only (cost: one client run).

2026-09-01 — ReviewSection name form: first name only. Every person-name ReviewSection renders uses the first name, both roles — the heading and the would-again line ("How was <First>'s work?", "Would you hire <First> again?", "Would you work for <First> again?"). One screen, one person, one form of the name. Found as item (c) on the R8b-c device walk. Cooling waived 2026-09-01 by the operator: two lines of copy, trivial to re-flip, nothing depends on it.

2026-09-01 — Calendar clocks deferred: LLC/EIN/bank, Stripe business verification, and the domain start pre-TestFlight, not before. Apple Developer is already done (2026-08-15). Gate 0's calendar-clock box closes on this ruling; nothing in Gate 2 depends on the paperwork.

2026-09-01 — Audit budget: two audits for this project, Gate 0 and pre-TestFlight. Anything else called an audit becomes one scoped fix run with a named pass condition. Gate 0's audit-budget box closes on this ruling.

2026-09-01 — SCOPE and DOMAIN frozen: docs/SCOPE.md and docs/DOMAIN.md change only through a dated entry in this file; a feature not in SCOPE.md goes to docs/BACKLOG.md v1.2 and never to a run. The iOS-only clause was settled 2026-08-31. Gate 0's SCOPE/DOMAIN box closes on this ruling.

2026-09-01 — Production ref placement: guard machinery is the .claude/ deny matrix, the .claude/ PreToolUse hook, the CLAUDE.md deny-sentinel line that tests/governance.test.mjs requires, and the tests that prove the ref is refused. The ref lives nowhere else — docs say "the production ref". Ruled by the operator; G0A carried it out.

2026-09-01 — Where secrets live: real secrets (database password, service-role key, Stripe secret keys, read-only staging connection string) live only under %LOCALAPPDATA%\BRAZOS\ on the operator's machine, never in the repository, never in .env, never in a prompt. .env holds client-public values only. start.ps1 is quarantined outside the tracked tree. Nothing is zipped without the credential scan in tests/governance.test.mjs having passed.