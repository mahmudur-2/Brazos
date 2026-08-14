# BRAZOS — HANDOFF

Rewritten in full at the end of every run. Never appended.
Paste this file at the start of a planning session.

**Branch:** `mainexpo` — single-branch rule, all work lands here
**HEAD:** `f0124e7`
**Remote:** `origin/mainexpo` in sync (pushed 2026-08-14)
**Tree:** clean

## Last landed

- `f0124e7` — docs+config: CLAUDE.md rewrite from audited ground truth; mechanical guards for push/destructive-git/prod-ref
- `48169f8` — feat(chat): merged conversation timeline and send routing
- `2ce3aca` — feat(inbox): one row per person
- `3846495` — feat(messaging): lock free-form messaging until job confirmed
  (ancestor of `mainexpo`; `stability-core-transactions` fully contained, no merge needed)

## Verification status

- **Device-verified:** inbox one-row-per-person; merged conversation timeline; mode-switch animation
- **Test-green only:** messaging lock (phase66); offer negotiation unification
- **Tests:** 382 total / 381 pass / 1 known frozen-PWA failure

## Top 3 open

1. **Security** — unauthenticated user-ID lookup chained to notification write (blocks push ship); photo storage publicly listable
2. **EAS development build** — required for TestFlight and push; fix weakened production build gate in same pass
3. **Worker UI slice** — 5 screens (find job → bid → work detail → checklist → completion) against Atlas mockups

## Notes

- Stripe key mode in `start.ps1`: **UNVERIFIED** — affects security severity rating
- Apple Developer Program enrollment is calendar-gated; start before it's needed
- Deferred: `42P17` RLS recursion on job delete; stale map pin on address edit; P1-03 / P1-05 / P1-08 / P1-10
- Worker hero-card parity with Atlas 55 is never-built, not a regression — UI redesign phase
