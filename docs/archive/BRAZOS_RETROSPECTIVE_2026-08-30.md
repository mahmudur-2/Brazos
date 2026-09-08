# BRAZOS — Build Retrospective (2026-08-30)

> **ARCHIVE. Never infer current state from this file.** It was written on
> 2026-08-30 and recovered into the repository on 2026-09-07 from the copy that
> had been sitting in the claude.ai project's knowledge, where it was answering
> questions as if its claims were current. Wording is unchanged; markdown
> formatting was normalised on recovery.
>
> **What it says that has since become false**, so that a reader in six months
> does not act on it:
>
> - *"the core loop was still 'post and hope' (nearby alerts off by default, no
>   radius)"* — false since 2026-09-04. Nearby alerts default ON by migration
>   `20260930000300_nearby_alerts_default.sql`, every existing row backfilled,
>   and radius exists both as the discovery filter and as `nearby_radius_miles`
>   with presets 1/3/5/10. `docs/GATES.md` Gate 2, box 3.
> - *"1,226 tests"* — 1,361 as of 2026-09-07.
> - *"Project-knowledge bundles … GitHub sync (Aug 29) fixed it"* — it did not,
>   or it lapsed. `docs/HUMAN-STEPS.md`, written 2026-09-07, still carried bundle
>   generation and upload as live rows 1 and 2. The sync became the path on
>   2026-09-07; `docs/DECISIONS.md` that date carries the ruling.
> - *"First test-mode dollar moved on Aug 30 … Still pre-TestFlight"* — the Gate 1
>   device walk passed 2026-08-31 and the E2E money walk went green 2026-09-03.
>   Still pre-TestFlight is correct: Gate 3 is the live gate.
>
> **Part 5 is written for a different, future project, not for BRAZOS.** Several
> of its rules were adopted here and are now binding in their own files — the
> two-audit budget (`docs/DECISIONS.md` 2026-09-01), iOS only
> (2026-08-31 and `docs/SCOPE.md`), one theme and the system font (2026-09-04),
> `docs/DOMAIN.md`, `docs/BACKLOG.md`, `docs/LAUNCH_CHECK.md`, and the 48-hour
> cooling period in `CLAUDE.md`. One was not adopted and conflicts with current
> policy: *"one 40-line CLAUDE.md"*. Read Part 5 as history of a recommendation,
> never as an instruction to a run.

**Purpose:** the foundation document for your next project. What cost the most,
why, and what the same result would have cost if built the right way from day one.

**Evidence base:** every BRAZOS chat this Project can see (2026-08-08 → 2026-08-30,
~55 sessions), plus your time tracker output and run reports quoted in those chats.
The July 12 → Aug 8 period (V1 web app, migrations phase01–50) is visible only
through later references — anything about it is labeled INFERRED.

**Scale of the project (for calibration):**

- ~7 weeks of work. Time tracker: 220 h on Aug 20 (200 h of that your own
  estimate), averaging 6.7 h/day since → roughly 280–320 h total (INFERRED).
- ~146,500 lines, ~79,400 shipping; 78 hand-numbered migrations before a
  baseline; 1,226 tests; 53 screens.
- First test-mode dollar moved on Aug 30 — week 7. Still pre-TestFlight.

## Part 1 — The 18 worst mistakes, ranked by cost

Cost = calendar days lost + rework + risk. Rank 1 alone explains most of the others.

1. **Built the product on top of an undecided money/security/data core, then
   rebuilt the core underneath it.** Payments were sandbox-only until R4/R5
   (Aug 29). Authorization proofs (pgTAP, R3b) arrived Aug 29 and immediately
   found a real hole (losing bidder can forge negotiation events). The first
   architecture document was written Aug 27 — after ~220 hours. Both databases
   were wiped in R0. Everything built before that — 43 screens, 11 messaging
   features, 78 migrations — had to be re-verified against a core that did not
   exist when it was written. This is Boehm's cost-of-change curve in its purest
   form: a decision moved from week 1 to week 6 costs 10× more because everything
   above it has to move too. Next time: schema, RLS proofs, payment ledger, and
   the 8 product rules (fee, cancellation, accept=fund, sealed bids, dispute
   path, address reveal, review reveal, tips) are written and proven before the
   first screen.
2. **Ran an audit → findings → batches → re-audit loop instead of fixed
   milestones.** At least nine audits in 18 days: Aug 12 (11 P1s), Aug 15
   (completion + security), Aug 18 (ChatGPT + Codex), Aug 21 (14 domains, 80
   findings, 13 batches), Aug 22 (light-mode parity), Aug 27 (size +
   architecture), Aug 28 ("30-year architect" vs ChatGPT), Aug 29 (27-item
   product audit), Aug 29 ("world-class excellence"). Each one is cheap to
   commission and produces a backlog you then service for days. Audits never
   define "done"; a milestone does. You named this trap yourself on Aug 15
   ("audit-loop trap you already learned to avoid") and ran five more. Next time:
   one audit at the start, one before TestFlight. Nothing in between.
3. **Pixel-chased AI-generated mockups screen by screen.** The Emerald Prestige
   campaign: 43 masters → 34-commit overnight run → fidelity(1–N) → emerald(1–11)
   → audit(1–6) → home(1)–(28) → H1–H3 → P1 (rejected: "you have to be pranking
   me") → GROUND1/MOTION1/PUBLISH1/SHOTS1 → S1–S3 → T1–T2 → G1 → Design Studio
   with 263 dials. The Customer Home screen alone consumed roughly a week, and
   almost none of it transferred to other screens (your own words on Aug 22: "it
   was fought as a one-off screen"). The masters had baked artwork and an
   unbundled serif that code cannot reproduce — a ceiling of ~90% was known on
   Aug 20. Next time: converge tokens once from 3–4 masters, ship, polish with
   users. Never dispatch "match this image."
4. **Scope far beyond a marketplace MVP, before a single dollar moved.** Voice
   messages with live waveform, live location sharing, document sharing, Azure
   translation, hidden chats behind Face ID, archive/mute/timed-block (11
   messaging flags), voice search, dark+light parity, a dev-only design studio,
   Spanish, Android, a web PWA. Marketplaces die on liquidity (enough workers
   responding fast), not on features — the Aug 29 audit found the core loop was
   still "post and hope" (nearby alerts off by default, no radius). Next time:
   the walking skeleton — post → bid → accept → fund → complete → release →
   review — on a device with test money, before any second feature.
5. **Infrastructure arrived in week 6 instead of day 1.** R0 (Docker, Supabase
   CLI, local database, Sentry, PostHog, Stripe sandbox, Maps key) was completed
   Aug 27–28. Until then: 78 migrations hand-pasted into a browser SQL editor
   with sentinel functions, no local database to rehearse on, no crash reporting,
   no analytics. R3a (local stack) took 49 minutes when finally done. The
   push-triggered pipeline you wanted from Aug 9 ("I'm away the entire day, it
   codes for me") landed Aug 29. Next time: day-1 checklist — GitHub remote, CI,
   local DB, migrations by CLI, Sentry, secrets outside the repo, repo outside
   OneDrive.
6. **A 1,200-test suite that reads source code as text.** All 80 test files read
   files as strings; 31 import real code; zero database, integration, or
   end-to-end tests until pgTAP in R3b. Every run report headlined the test count
   (958 → 980 → 1,008 → 1,226) and the count became the success metric —
   Goodhart's law. The suite could not have caught the two double-pay bugs, the
   RLS recursion, the anon-callable admin functions, or the offer-forgery hole;
   humans and audits did. Next time: pgTAP for authorization, Maestro for the
   five money flows, and fences only for invariants. Never report a test count as
   evidence.
7. **Built the factory more than the product.** Guard hooks, deny matrix, Run A +
   Run B (multi-session hardening of the agent-safety layer with canaries and
   governance tests), CLAUDE.md rewritten ≥4 times, HANDOFF grown to 97 KB then a
   cleanup run to shrink it, project instructions v2→v5, memory rewritten ≥6
   times, bundle generator rebuilt from scratch, time tracker, remote control,
   chain launcher. INFERRED: 15–20% of all hours. Some was necessary (the
   production-ref guard after credential leaks). Most was reactive to chaos
   created by ranks 1, 5 and 8. Next time: one 40-line CLAUDE.md, one guard rule
   (production ref), CI as the enforcement layer. Governance grows only after a
   failure, never in anticipation.
8. **Credential and environment hygiene failures**, each of which triggered days
   of remediation. Production credentials in `.env` and `start.ps1`; whole-folder
   ZIPs sent to ChatGPT (twice); the DB password synced to your phone through
   remote control; a live OpenAI Sites deployment serving DB config to any
   browser; EAS server-side variables silently overriding staging with production
   (caught only by the pre-install gate); public storage buckets; 28
   anon-callable admin functions on production; `Bash(git:*)` pre-approved in
   agent settings. Each cost a rotation, a hardening run, and a session. Next
   time: secrets live in one place outside the repo and outside OneDrive from day
   1; the production ref never appears in any file an agent can read; nothing is
   zipped for a third party without a scan.
9. **Three-AI cross-check rounds on nearly every prompt.** ChatGPT → Claude
   adjudicates → Codex → Claude re-adjudicates: four rounds on Run A, ~six
   iterations on the Phase 13 prompt, three on Run B, four on the instructions.
   The cross-checks did catch real defects (branch-ordering contradiction; Claude
   caught the Stripe Express deprecation that ChatGPT missed) — roughly one
   material catch per three rounds. The marginal round rarely paid. The two-round
   cap came Aug 18 and was still exceeded. Next time: one external review, only
   for money/schema/security prompts.
10. **Environment blunders that masqueraded as product bugs.** Repo inside
    OneDrive (sync corruption risk, `.git/index.lock`, pause-before-every-run
    ritual); no git remote until Aug 9 — twelve phases existed only on one disk;
    Cowork run against the repo produced a 244-file phantom diff; stale Metro
    bundle misdiagnosed as a code regression at least four times (once
    invalidating five diagnostic screenshots); `.gitignore` comment rewrite
    silently cut off OTA delivery (~45 min plus two wrong fixes); ngrok tunnel
    bug; smart-quote corruption in pasted scripts; terminal mouse capture.
    Individually small; cumulatively days. Next time: repo at `C:\dev\`, remote on
    day 1, `expo start --clear` is the first diagnostic step for any "regression,"
    and OTA only after fingerprint stability is proven.
11. **Overnight runs dispatched from memory of the repo, not from the repo.**
    Prompts carried stale HEAD gates, invented file paths (`lib/haptics.ts`,
    `ui/primitives/Button.tsx`), a stale `docs/dispatch/` file that stopped a run
    at its gate, locked-screen lists written from memory, eight STOP conditions
    with "coin-flip probability of firing," the R1 prompt rewritten four times and
    dispatched twice (GUARD-DEPS). Every failed dispatch = a lost night plus a
    morning repair session. Root cause: the prompt author (chat Claude) could not
    see the live repo until GitHub sync on Aug 29. Next time: the prompt author
    reads the repo — either author inside Claude Code, or sync the repo before
    writing a single line.
12. **V1 built as a web PWA with Codex, then a native V2, with the web surface
    kept "frozen" in the repo.** (INFERRED for July) The frozen surface then
    appeared in every constraint list, carried a permanently failing test, was
    deployed live with DB config for weeks, and is the likely source of the 2 GB
    production egress anomaly. Next time: delete what you are not shipping. A
    frozen surface is a tax on every run.
13. **Calendar-gated items started late.** Apple Developer enrollment approved
    Aug 15 (week 5). Stripe live activation, LLC/EIN/bank, domain: still not
    started, now the binding constraint on launch. These run on other people's
    clocks and cost you nothing to start on day 1. Next time: day 1 — Apple,
    Stripe business verification, LLC, domain, Twilio A2P if phone auth.
14. **Locked "finished" screens before the product existed.** Screens 01–07 and
    48 were declared finished and locked (Aug 8). Every later phase routed around
    them, dark mode could not ship without unlocking, the lock list was
    hand-stripped and restored, and the guard rule is now dead code inside
    `if($false)`. Next time: nothing is "finished" before real users; lock only
    money and auth code.
15. **Domain model accreted run by run without an owner.** Two parallel
    negotiation systems (`bids` + `job_requests`) unified in Phase 3 through six
    iterations; five stacked definitions of `transition_job_status`; five
    lifecycle derivations consolidated to one; CLAUDE.md naming seven tables that
    did not exist; `advance_job_status` mandated in instructions but nonexistent
    in code. Each agent added a layer because no document said what the layer was.
    Next time: one `DOMAIN.md` with the state machines and table names, written
    before Phase 1, edited only by you.
16. **Design decisions reversed after being dispatched.** Fonts: Georgia →
    Playfair (bundled, fenced) → system font (unbundled, fence inverted) — three
    runs. Gold [+] removed then restored. Toggle track redesigned twice. Master
    PNG replaced on disk mid-campaign, voiding all measured constants. Hero art
    replaced three times. Each reversal is a full dispatch plus a device check.
    This is Parkinson's law of triviality — the cheap-to-argue decisions absorb
    the most time. Next time: taste values get a 48-hour cooling period in the
    live studio before any dispatch; a mockup enters the pipeline only after the
    font is decided.
17. **Android and web deferred late rather than cut early.** Android was
    "deferred" then "not deferred" (R1 D1 amended CLAUDE.md) then deferred again;
    a Google Maps key was provisioned for both platforms. Every hedge kept a
    second platform alive in config and constraints. Next time: iOS only, in
    writing, on day 1; revisit after 100 users.
18. **Working through the night.** The R1 quadruple rewrite, the OTA fingerprint
    misdiagnosis, the P1 blind-prompt disaster, and most "sleepy, minimal
    intervention" dispatches happened between 1 and 7 a.m. Sleep loss measurably
    degrades exactly the judgment this workflow depends on (Harrison & Horne,
    2000). Next time: overnight runs are dispatched at 11 p.m. from a prompt
    finished at 6 p.m.

**What you did right — keep these:** staging/production split with a mechanical
production-ref guard; migrations hand-applied to production only; the fence
doctrine and continue-paths; overnight runs that resume from `git log`; catching
Claude's errors yourself (stale paths, quota numbers, "confused" = expand); "held
in protection" and no fake payment states; the Stripe Accounts v2 catch; the
agreement snapshot; refusing to add fee copy until it was true.

## Part 2 — The worst usage waste (tokens, quota, runs)

Ranked by tokens burned for output that did not survive.

1. **Project-knowledge bundles at 87–89% capacity, re-uploaded after every run**
   (Aug 21 → Aug 29). Every message in every chat for nine days paid for the whole
   codebase to be present, and the bundles were stale the moment a run landed — so
   you paid full price for a snapshot Claude was told not to trust. GitHub sync
   (Aug 29) fixed it. Rule: never upload a codebase to chat; sync it, or ask
   Claude Code.
2. **The 43-screen overnight Prestige campaign** (8–14 h of Opus max) whose output
   was then re-fought screen by screen for two weeks (rank 3 above). Large batch →
   large rework (Reinertsen).
3. **A UI run that opened twelve PNG masters when one needed image evidence** —
   240k tokens. The three-bucket rule (BEHAVIOR / COPY-A-VALUE /
   UNSPECIFIED-APPEARANCE) exists because of this.
4. **Chat Claude reading and tuning files that Claude Code could open directly**
   (acknowledged Aug 21: "most of the day's work would have been faster in Claude
   Code"). Files uploaded repeatedly; a whole day of dial tuning through chat.
5. **Audits at Fable max (metered) producing backlogs that were never fully
   serviced** — the most expensive model spent on the least-used output.
6. **Cross-AI review rounds** (rank 9): each round re-sends the full prompt plus
   the full critique to two models.
7. **Context reconstruction at every new chat.** ≥8 chats titled "Continuing…" /
   "Gathering context…"; each starts with `read_conversation` paging through prior
   sessions and a handoff document — INFERRED 20–30% of each new session before
   real work.
8. **Fable quota exhausted mid-run at 2 a.m. repeatedly** (Aug 13: 17%; Aug 14:
   depleted; Aug 19: 5%), forcing fallbacks and halted campaigns. Fable was spent
   on pre-decided implementation runs that Opus handles identically.
9. **UltraCode on ordering-critical work** (early phases) — parallel sub-agents
   overwrote each other on shared files; the rule "never UltraCode for ordered
   commits" came after the damage.
10. **Long deep-research answers you then asked to be shortened.** You ask for
    "highest reasoning, take as much time" in one message and "one sentence" in
    the next; both cost full output tokens and the second wastes the first.

## Part 3 — Was there a 10× path?

**Verdict: no — 3× is real, 10× is not, at this quality bar.** Here is the honest
arithmetic.

**Irreducible costs** for a non-coder orchestrating agents on this stack: learning
EAS/Expo/Supabase/Stripe mechanics; device testing on a physical phone; ~20
product decisions that only you can make; reading run reports; Apple and Stripe
clocks. INFERRED floor: 60–80 h even with a perfect process.

**The optimal path** (what a senior architect would have done with the same tools):

- **Day 0–1 — Environment (8 h):** repo at `C:\dev\brazos`, GitHub remote, CI
  running `verify` on push, local Supabase in Docker, migrations by CLI from
  migration 001, Sentry + PostHog wired, secrets in `%LOCALAPPDATA%`, staging +
  production projects with the production ref in exactly one guard rule. Start
  Apple, Stripe business verification, LLC, domain the same day.
- **Week 1 — Core before surface (25 h):** `DOMAIN.md` with the five state
  machines (job, offer, payment, availability, dispute) and the eight product
  rules. Schema written once as ~15 migrations, not 78. RLS with pgTAP proofs for
  five caller identities on every writable table. Payment ledger with
  held-in-protection, agreement snapshot, fee schedule, cancellation, tips — all
  as first-class columns. Stripe Connect (Accounts v2) edge functions. A
  `verify-schema` that proves the real database. Architecture doc = this week's
  output, not week 6's.
- **Week 2 — Walking skeleton (20 h):** one ugly path on a device: post → bid →
  accept=fund (test card) → complete → release → review → Connect payout. The
  first test dollar moves on day ~10, not day 49. Maestro flows for those five
  screens. Tracer bullets through every layer; nothing else exists yet.
- **Weeks 3–4 — Screens on a token system decided once (30 h):** ~25 screens, one
  theme, system font, no mockup pixel-matching, no design studio. Notifications,
  messaging (text + photo only), worker discovery with radius and default-on
  alerts. UI reviewed by harness render, not by phone screenshot.
- **Week 5 — TestFlight to ten real users (10 h):** account deletion, UGC
  moderation quartet, privacy policy, screenshots at accepted sizes, seed data.
  Then iterate on real data.

**Total: ~90–110 h to TestFlight versus ~300 h and still pre-TestFlight.** Same
security posture (arguably better: proofs before surface), same premium potential
(the polish happens after users, on a token system that already exists), 3×
faster. The remaining 2× to reach 10× does not exist: it would require you to
write code yourself or to skip decisions only you can make.

Two things to be clear about. First, most of the "premium features" (voice
waveform, live location, translation, Face ID hidden chats, design studio) would
not be in that v1 — they would be in v1.2 after ten users asked for them, and most
would never be asked for. Second, the security and architecture you have now are
good; the cost was building them second instead of first.

## Part 4 — Your prompts and conversational loops

Patterns in how you write, and the loops they create with Claude. Each loop is
named with evidence and the cheapest break.

- **Loop A — Legislating style instead of resetting context.** You corrected
  length/jargon/commands in at least eight sessions (Aug 14, 15, 16, 18, 22, 25,
  29 ×2). Each time Claude rewrote instructions or memory; the instruction layer
  is now ~1,500 words plus a ~2,500-word memory. Research on instruction following
  shows compliance drops as constraints stack and as context lengthens (Liu et al.
  2023 "Lost in the Middle"; FollowBench/IFEval-style multi-constraint benchmarks)
  — so each new rule slightly worsens the drift it targets, and the real cause
  (rule conflicts plus very long threads) stays. **Break:** five style rules
  maximum; when drift appears, open a new chat instead of adding a rule.
- **Loop B — Requesting maximum depth, then rejecting the length.** "Use highest
  reasoning / take as much time / deep research plz" and "one sentence / stop
  overloading me" alternate within the same day. Claude cannot satisfy both in one
  mode. **Break:** two named modes — RESEARCH chats (long, no limits) and OPERATOR
  chats (one action + one line) — never mixed in one thread.
- **Loop C — Under-specified voice messages → guess → correction → repeat.**
  "Bring the nav down 20%", "huh", "confused", "good?", empty turns, mishearings
  about which dial is meant (Aug 21: repeated "you misheard the dial"). Without
  shared perceptual context both sides repair by trial (Clark & Brennan's
  grounding). **Break:** for any visual instruction, name the file/line or the
  master number; for any confusion, one word ("expand") rather than a paragraph of
  frustration.
- **Loop D — Screenshot in, diagnosis out, another screenshot.** Claude inferred
  asset state from screenshots (opaque PNG, seam, five stale-bundle screenshots)
  and reversed itself five times on Aug 25 alone. You fed the loop by sending the
  next screenshot instead of the datum requested (the OTA runtime line). **Break**
  (now in instructions): no diagnosis from a screenshot when repo evidence exists;
  when Claude asks for a specific datum, send that datum before anything else.
- **Loop E — Serial micro-requests across messages and chats, expecting
  consolidation.** You list UI nits across many messages ("also… and also…"), the
  chat rolls over, state is lost, and a verification run is spent asking "did X
  land?" **Break:** one `docs/backlog.md` in the repo you append to; every dispatch
  reads it; nothing lives only in chat.
- **Loop F — The autonomy pendulum.** "I want to walk away" → fewer stops → run
  halts on a coin-flip STOP or continues down a wrong path → morning repair → new
  guard/rule → longer prompt → next run halts on the new rule (GUARD-DEPS ×2). Six
  documented cycles. **Break:** ambiguous architecture is never overnight work;
  overnight = pre-decided + continue-paths only.
- **Loop G — Review it again.** "Double-review / triple-review" nearly always
  found something, which you correctly noticed — but the finding was always the
  same class (stale repo state), and the structural fix (prompt author sees the
  repo) waited until Aug 29. **Break:** fix the cause once rather than
  re-inspecting the symptom each time.
- **Loop H — Cross-AI adjudication.** See rank 9. You route every review through
  Claude for independent critique (good) but run three to six rounds (bad).
  **Break:** one round; stop when the remaining objections are cheaper to accept
  than to litigate.
- **Loop I — Tangents during pending steps.** Voice modes, Idiolect, hardware
  monetization, Codex switch, naming — raised while a dispatch or operator step sat
  idle; Claude answered thoroughly, which signaled the tangent was the work.
  **Break** (now in memory): one-line park; answer briefly or not at all.
- **Loop J — Reassurance before sleep.** "Ok 100% everything's good right?" /
  "it'll run the whole night?" — cheap per message, but it means the launch
  checklist lived in your head. **Break:** a 10-line `LAUNCH_CHECK.md` you tick
  before every overnight run; no questions after the last tick.
- **Loop K — Relitigating decided taste.** Fonts, gold, toggles, hero art, nav
  pill. Decisions made in one session were reopened in the next, usually after a
  screenshot. **Break:** taste decisions carry a date and a 48-hour cooling period;
  reopening one costs a written reason.

**Two strengths to keep:** you push back with evidence and you catch Claude's
factual errors (paths, quota, "escrow"). And you decide fast when the decision is
framed as one question ("750/750", "read the verdicts") — the fee decision took one
word and never reopened. That is the pattern to generalize: force every decision
into one question with one recommended answer, answer it once, write it down.

## Part 5 — The rules for the next project (one page)

1. Day 0: remote, CI, local DB, CLI migrations, Sentry, secrets outside repo, repo
   outside OneDrive, iOS-only in writing, Apple/Stripe/LLC/domain started.
2. Week 1: DOMAIN.md, schema, RLS proofs, payment ledger, product rules — before
   any screen.
3. Week 2: walking skeleton with test money on a device. Nothing else exists yet.
4. One theme, system font, tokens decided once from 3–4 masters. No pixel-matching.
   No design studio.
5. Feature list frozen at the walking skeleton plus notifications, text/photo
   messaging, discovery. Everything else waits for ten users.
6. Tests: pgTAP for authorization, Maestro for money flows, fences for invariants.
   Never report a count.
7. Two audits total: start and pre-TestFlight.
8. The prompt author reads the live repo. One review pass. One external review only
   for money/schema/security.
9. Overnight runs only when pre-decided; dispatched by 11 p.m. from a prompt
   finished by 6 p.m.
10. RESEARCH chats and OPERATOR chats never mix. Five style rules. Drift = new
    chat, not new rule.
11. One backlog file in the repo; one launch checklist; taste decisions cool for 48
    hours.
12. Governance grows only after a failure. Start with one guard rule: the
    production ref.

**Honest expectation** for a project of BRAZOS's scope under these rules: ~100
hours to TestFlight, ~2 weeks of iteration to launch. Not one-tenth of the time —
one-third, with the same quality and less risk.
