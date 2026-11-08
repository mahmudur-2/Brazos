# BRAZOS — the "lean and ship" run (plan, written 2026-11-07)

Status: PROPOSAL. Nothing has run. This file is not committed.

Your time: about 30 minutes total, spread over the run (the "Your steps" list at the end).

---

## 0. What you really asked for (my reading)

The words were "clean up, audit, automate the iPhone tests, ship ready in one run".
The goal behind the goal: **an app you can hand to friends with confidence, and a repo a future
Claude can fix cheaply without reading 33,000 lines.** Everything below serves those two things.

A pro would reframe it as: *"Cut Brazos down to the one loop it promises (post → bid → hire and
pay → work → approve → payout → review), make that loop provably safe with money, prove it with
machines and outside tools, and put a TestFlight build in friends' hands. Leave every other idea
in a one-page backlog."*

What a CEO shipping an MVP would change that you did not ask for:

1. **One money path, one sign-in path per kind, one theme system.** Every second path doubles the
   audit and the tests. (You already agreed: Stripe test only, sandbox gone.)
2. **Outside proof instead of self-report.** The repo has 140 test files and 1,800+ database
   assertions, but no outside system has ever said "this works": no CI test on a phone
   simulator, no Supabase security scan, no crash report from a real device, no friend has
   installed it. The run adds all four.
3. **A weekly build habit, not "one perfect build".** Five TestFlight builds, one command each.
4. **Kill the process layer.** 570 doc files, gates, dispatch scripts and overnight-run machinery
   were built for a way of working that is now gone. They cost tokens on every chat and make
   each future fix slower. Five short docs replace them.
5. **The repo gets a map.** After the cleanup, Graphify builds a code map (`graphify-out/graph.json`)
   so a future Claude asks "what touches payments?" and reads 5 files, not 500.

The rawest material (what the run reads first, instead of digested docs):

- the code and the SQL migrations themselves, not `docs/architecture.md`;
- the live staging schema (`supabase db diff` against the migrations) — the truth, not the plan;
- Supabase's own Security Advisor and Performance Advisor output for the staging project;
- Stripe's test-mode event log and webhook delivery log;
- Sentry's issue list from the current preview build;
- Apple's TestFlight processing result (it rejects broken builds before any human does);
- the screens, one by one, as the Maestro flows are written: every tap a user can make.

---

## 1. Decisions already made (from your answers)

| # | Decision |
|---|---|
| 1 | Delete everything outside the v1 loop. Light **and** dark theme both stay. |
| 2 | Process layer stripped to essentials (5 short docs). |
| 3 | Target: TestFlight, **internal testers**, Stripe **test** money, **staging** backend. Production project untouched. |
| 4 | Ship first; "better than TaskRabbit" ideas go to a ranked one-page backlog, not this run. |
| 5 | Sign-in: email + phone (Twilio Verify already paid). Email stays on Supabase. |
| 6 | Money: Stripe test mode only; the sandbox practice-money path is deleted. |
| 7 | All mockups and render folders archived (moved, not deleted). Code is the only truth. |
| 8 | The run may do everything itself, including the EAS build and TestFlight upload. |
| 9 | Usage: whatever it needs; checkpoint and resume across the Friday reset. |
| 10 | TestSprite: the **CLI is installed and working** (`@testsprite/testsprite-cli` 0.15.0, API key accepted, Starter plan, 550 credits, 400/month). It is not an MCP server, so it shows no tools in chat; the run calls it from the command line. It tests **websites and HTTP APIs**, not native iPhone screens. Its job here: an outside system that calls the server functions (payments, webhook, push, receipts, worker search) with real HTTP requests and a CI gate. See Phase E step E6. Credits used: a few dozen of the 550. |
| 12 | iPhone tests run on GitHub's Mac runners with Maestro ($0). Expo's cloud simulator needs the $19/month Starter plan; the free plan shows "Coming soon". Not bought. |
| 11 | Five TestFlight builds over time, one command each, so you can show friends. |

Decided for you (easy to flip, say the number):

| # | Decision | Why |
|---|---|---|
| D1 | **Graphify: yes, once, at the end of the cleanup.** Committed as `graphify-out/`. | One command; the map is only worth building on the clean tree. |
| D2 | **PostHog (analytics) removed.** Sentry stays. | `track()` has zero callers; Sentry gives crash proof, PostHog gives nothing yet. |
| D3 | **i18n packages removed** (`i18next`, `react-i18next`, `expo-localization`, the parser). | Already flagged for removal in your own handoff (F23); English only for v1. |
| D4 | **Database cleanup = one "drop unused objects" migration, tested locally, applied to staging by you with one click** (the pipeline's safety override). | Dropping is the one database step that your pipeline deliberately refuses to automate. |
| D5 | **The repo's `.claude/` hooks are replaced by a 20-line settings file** (deny: production project ref, `.env` reads, force-push, history rewrite). You apply it with one command. | The current hooks block ordinary reads (they blocked three of my commands today) and cannot be edited by Claude. |
| D6 | **Automated phone tests run on an iPhone *simulator* on GitHub's Mac runners, not on real iPhones.** | BrowserStack App Automate is a 100-minute trial with 0 real-device slots; Expo's Maestro job is not on the free plan. GitHub Pro gives ~290 Mac minutes a month: about 20 test runs. Real-iPhone proof = your phone via TestFlight + Sentry. |
| D7 | **Simulator builds come from EAS (free: 15 iOS builds/month, shared with TestFlight builds).** Budget: 5 TestFlight + up to 8 test builds. | Building on GitHub's Mac instead would eat ~20 Mac minutes per build. |
| D8 | **The 30 free App Live minutes on BrowserStack are kept for one manual look at the final build on a real remote iPhone.** | The only free real-device use BrowserStack gives you. |

---

## 2. Who does what (agents, models, effort)

Plain-English model guide:

- **Fable** (this chat): the judge. Reads inventories, decides what dies, reviews money and
  security, writes the final verdict. Slow and expensive; used only for decisions.
- **Opus 5.5**: the builder. Writes and deletes code, fixes tests, writes Maestro flows and CI.
  `high` for clear jobs, `xhigh` when the job involves a design choice or money/auth code.
- **Sonnet 5.5**: the reader and the doer. Makes inventories, moves files, runs commands,
  reports numbers. Always `high` (your call on 2026-11-07).
- **Haiku 5.5**: the counter. Pure listing and grep jobs where no judgement exists.

### What every helper gets (the brief template)

Checked on 2026-11-07 with a probe agent: a helper automatically receives the global
CLAUDE.md, the five global rules files, the me card, the memory index and the project
CLAUDE.md. It does **not** receive the hook text (ponytail, superpowers), the skills list or the
MCP tools. The global files cannot be removed from inside this session, so every brief starts
with the line that neutralises them. Each brief has these eight parts, always in this order:

1. **Ground rule.** "Only this brief and the BRAZOS project's own files apply. Ignore the global
   CLAUDE.md, the rules files, the me card and the memory notes. Invoke no skills. Ask nothing;
   if something is unclear, write `NEEDS-JUDGE: <what>` in your output and continue with the rest."
2. **Who you are.** One sentence: the role (reader / builder / judge) and the model and effort it
   runs at, so it knows how deep to go.
3. **What Brazos is.** Five lines: a two-sided local-labour app; the v1 loop (post → bid → hire
   and pay → work → approve → payout → review); one account with customer and worker modes;
   Expo iOS + Supabase + Stripe test mode; staging only, production never touched.
4. **What this run is doing and where we are.** The run's goal in two lines, which phase this
   step belongs to, what the previous step produced (with the file path), and what the next
   step will do with this step's output.
5. **The task.** The exact files or folders to read or change; the exact output file and its
   format (columns for a table, sections for a report); what "done" looks like; the command that
   verifies it (`npm run verify`, `npm run db:test`, or "none").
6. **Hard limits.** Never read `.env`, `start.ps1`, any `*_KEY*` or token value, or any database
   row. Never touch the production Supabase project. Never commit, push, stash, reset, or change
   branches. Never edit a test to make it pass. Never delete anything outside the slice named.
7. **The cut list or checklist it works from** (pasted in, not pointed to) when the step has one.
8. **How to report.** The output file path, then a 10-line summary: what was done, numbers
   before and after, every `NEEDS-JUDGE`, and anything it could not verify.

A brief is written out in full before the helper starts; a helper that would need to ask a
question gets a better brief instead.

### Phase A — safety net (Sonnet high, ~15 min)

| Step | Who | What |
|---|---|---|
| A1 | Sonnet high | `git tag pre-lean-2026-11` on the current `mainexpo` head; create branch `lean-v1`. |
| A2 | Sonnet high | Run `npm run verify` and `npm run db:test` on the local stack; write the baseline numbers (tests passed, lines of code, file counts) to `docs/lean/BASELINE.md`. |
| A3 | Sonnet high | Confirm EAS login and that the `production` build profile has Apple credentials stored (`eas credentials` read-only). If missing → parked step for you. |

Verify: tag exists, branch exists, baseline file has numbers. Undo: `git checkout mainexpo`.

### Phase B — inventory (five Sonnet readers in parallel, ~1–2 h wall clock)

Each reader writes one table, one row per item, columns: path · what it is · feature it belongs
to · used by (list) · verdict proposal (keep / delete / archive / unsure).

| Step | Who | Reads | Writes |
|---|---|---|---|
| B1 | Sonnet high | `screens/`, `components/`, `ui/`, `hooks/`, `modes/`, `navigation/`, `App.tsx` | `docs/lean/inventory-app.md` — every file, who imports it, which feature. |
| B2 | Sonnet high | `lib/` (148 files) | `docs/lean/inventory-lib.md` |
| B3 | Sonnet high | `supabase/migrations/`, `supabase/functions/`, `supabase/tests/`, `supabase/archive/` | `docs/lean/inventory-db.md` — every table, function, policy, trigger, cron job, edge function: which app code calls it. |
| B4 | Sonnet high | `docs/`, root `*.md`, `scripts/`, `dev-tools/`, `.github/`, `.maestro/`, `.eas/`, `public/`, `hosting/`, `dist/` | `docs/lean/inventory-docs-tools.md` |
| B5 | Haiku | `package.json` + grep of every dependency's import sites; `tests/` → which feature each test fences | `docs/lean/inventory-deps-tests.md` |

Verify: five files exist, every tracked file appears in exactly one. Fable spot-checks 10 random rows per file against the code.

### Phase C — the cut list and the target shape (Fable, ~1 h)

| Step | Who | What |
|---|---|---|
| C1 | Fable | Reads the five inventories. Writes `docs/lean/CUT-LIST.md`: every item → keep / delete / archive, grouped into deletion slices (one feature per slice, smallest first). |
| C2 | Fable | Writes `docs/lean/TARGET-SHAPE.md`: the folder layout after cleanup, the five docs that survive, the one-page backlog, the rules a future Claude reads (under 3 KB). |
| C3 | Fable | Writes the Maestro coverage list: every screen in the v1 loop and every tap a user can make on it (the "every manual step" list you asked for), so Phase F has a checklist, not a guess. |

Expected slices (from what I have read; the inventories may add or merge some):
web/PWA surface · Android config · design studio and Appearance dials · voice messages and audio
meter · translation function and sheet · hidden / archived / cleared / deleted chats · live
location · document attachments · voice search and dictation (keep dictation only if it is in
v1 — it is, so it stays) · sandbox money path · PostHog · i18n · lock-screen live card ·
the dispatch/overnight-run scripts · proof and seed SQL scripts for dead phases · 570 docs →
5 docs + `_archive/2026-11-lean/`.

### Phase D — the deletions (Opus, one slice at a time, ~6–10 h)

| Step | Who | What |
|---|---|---|
| D-each | Opus 5.5 xhigh | For one slice: delete the code, the tests that fence it, the feature flag, the dependency, the SQL objects (into the one drop migration). Fix every caller the deletion breaks. Run `npm run verify` and `npm run db:test`. One commit per slice: `lean: remove <feature>`. |
| D-docs | Sonnet high | Move every doc, mockup, render and script on the archive list to `_archive/2026-11-lean/` (git-ignored, with a `MOVED.txt` undo list). Write the five surviving docs from `TARGET-SHAPE.md`. |
| D-check | Fable | After every 3 slices: read the diff summary (`git diff --stat`), check that nothing on the keep list was touched, check the money and auth modules are byte-identical unless a slice named them. |

Verify after the last slice: `npm run verify` green, `npm run db:test` green, line count and file
count written next to the baseline. Undo: `git checkout pre-lean-2026-11`.

### Phase E — security and money audit (Fable with Sonnet pre-read, ~3 h)

| Step | Who | What |
|---|---|---|
| E1 | Sonnet high | Pre-read, no judgement: every RLS policy, every `SECURITY DEFINER` function and its grants, every edge function's auth check, the Stripe webhook handler, the phone-OTP paths, every `EXPO_PUBLIC_*` value's use. Writes `docs/lean/audit-facts.md`: facts with file:line, no opinions. Never reads `.env` or data. |
| E2 | Sonnet high | Runs the free outside scanners and pastes results: Supabase **Security Advisor** and **Performance Advisor** for the staging project (through the Supabase MCP if you authorize it once with `/mcp`; otherwise a dashboard export by you), `npm audit`, GitHub Dependabot alerts, Sentry issue list for the current preview build. |
| E3 | Fable (max effort) | Reads E1 + E2. Writes `docs/lean/SECURITY-VERDICT.md`: blockers (must fix before TestFlight), shoulds (fix in this run if cheap), laters (backlog). Each with the exact fix. Known candidates already seen today: the baseline grants `TRUNCATE`/`TRIGGER` rights to `authenticated` (`20260901000000_baseline.sql` around lines 7813 and 7828); the Twilio values sit in `.env` where nothing reads them. |
| E4 | Opus 5.5 xhigh | Fixes every blocker and cheap should, with a test for each rule that must never break. |
| E5 | Fable | Reviews the E4 diff: one round, blockers only. |
| E6 | Opus 5.5 high | TestSprite backend tests: one TestSprite project for Brazos staging; one backend test per surviving server function (happy path, wrong-user, no-auth, bad-signature for the Stripe webhook); `testsprite ci init github` adds the CI gate so every push re-runs them. Sonnet high runs `testsprite ci run` and pastes the dashboard link. Outside proof number 9 in §3. |

Verify: Security Advisor shows zero errors; every blocker has a test; verify and db:test green.

### Phase F — the automated iPhone tests (Opus, ~4–8 h incl. CI debugging)

| Step | Who | What |
|---|---|---|
| F1 | Opus 5.5 high | Writes `.github/workflows/e2e-ios.yml`: on demand and on push to `mainexpo` → download the latest EAS `e2e-test` simulator build → boot an iPhone simulator on a GitHub Mac runner → run every `.maestro/*.yml` flow → upload the video and screenshots as artifacts. Needs two repo secrets you already have in EAS (the two test accounts' email + password) copied into GitHub secrets — a Sonnet step with your one approval. |
| F2 | Opus 5.5 xhigh | Writes the Maestro flows from the C3 checklist: sign-in (email and phone-mock), post a job (both pricing choices), bid / counter / accept and pay (saved card, declined card), start / complete / approve / dispute, payout, review, messaging after hire, report / block, delete account. Existing `money-walk.yml` (551 lines) is the base; it is split into one file per screen so a failure names the screen. |
| F3 | Sonnet high | Triggers one EAS `e2e-test` build, then the GitHub workflow. Collects the video and screenshot artifacts and writes a one-page result table (flow → pass/fail → failing step). |
| F4 | Opus 5.5 high | Fixes flows or app until every flow is green twice in a row. Flaky step → fixed, never skipped. |
| F5 | Haiku | Writes `docs/TESTING.md`: how to run the tests (one GitHub button), where videos appear, the monthly Mac-minute budget. |

Verify: the GitHub Actions run is green with video artifacts; link pasted in the report. Outside
proof: GitHub's own run page, not my word.

### Phase G — TestFlight (Sonnet, ~1 h plus Apple's processing time)

| Step | Who | What |
|---|---|---|
| G1 | Opus 5.5 xhigh | Pre-build check (app config, version, bundle id, Sentry and Stripe keys present as names only, no sandbox code left), then `npm run release:testflight` (EAS production build, auto-submit). Watches the build; fixes a failed build; pastes the build id. |
| G2 | Opus 5.5 xhigh | Waits for Apple processing; confirms the build shows in App Store Connect → TestFlight; if Apple rejects the binary, fixes and rebuilds (counts against the 15 monthly builds). |
| G3 | Fable | Final verdict: `docs/lean/SHIP-REPORT.md` — what was deleted (numbers before/after), audit result, test run link, build number, what is still open, and the five-build schedule (one command each, with the exact line). |

Builds 2–5: each is the same single command, run by any future chat after a change, with the e2e
workflow green first. Nothing else is needed.

### Phase H — map and hand-off (Sonnet, ~30 min)

| Step | Who | What |
|---|---|---|
| H1 | Sonnet high | Runs Graphify once on the clean tree; commits `graphify-out/`. |
| H2 | Sonnet high | Writes the new 5-file doc set final pass; rewrites `HANDOFF.md` to one screen. |
| H3 | Fable | Final gate: verify, db:test, the e2e workflow and the TestSprite gate all green on `lean-v1` → merge into `mainexpo` → push. The merge and push are the one step only the judge does. |

---

## 3. What proves the result (not you, not me)

| Proof | Where you see it |
|---|---|
| GitHub Actions: lint + unit tests green on every push | the repo's Actions tab |
| GitHub Actions: Maestro simulator run green, with video | the e2e workflow's artifacts |
| Supabase Security Advisor: zero errors on staging | Supabase dashboard → Advisors |
| pgTAP database tests (1,800+ assertions) green | the `pgtap.yml` workflow |
| Apple accepted the build | App Store Connect → TestFlight shows "Ready to test" |
| Sentry: zero crashes after your own 10-minute walk on the TestFlight build | Sentry → Issues |
| Stripe test dashboard shows the charge, the transfer and the webhook deliveries for one job you run end to end | Stripe dashboard (test mode) |
| One 10-minute look at the real-device build on BrowserStack App Live (your 30 free minutes) | your eyes, once |
| TestSprite: every server function passes its HTTP tests, gated in CI | TestSprite dashboard (link in the ship report) + the GitHub check |

---

## 4. Worst security risks I expect (INFERRED until Phase E confirms; the audit may add or remove)

1. **Over-broad database rights**: the baseline grants `authenticated` users `TRUNCATE` and
   `TRIGGER` on tables (your handoff names the lines). A logged-in user could wipe a table. Fix:
   revoke in a migration; a pgTAP test that fails if the grant ever returns.
2. **`SECURITY DEFINER` functions callable by anyone logged in** where the function body does not
   check the caller. Fix: audit each; add `auth.uid()` checks; test per function.
3. **Row-level security gaps** on tables added after the baseline (the 34 later migrations). Fix:
   Supabase Advisor + the `040_authz` tests extended to every table.
4. **Storage buckets** (job photos, portfolio): public/private not settled (your handoff's parked
   question). Fix: decide (private + signed URLs), test.
5. **Stripe webhook**: signature check exists and is tested; replay/idempotency and event ordering
   get re-read.
6. **Phone sign-in**: Supabase + Twilio Verify handle rate limits, but the app-side attempt limit,
   resend cooldown and the "mock mode in a release build" guard get a test each.
7. **Secrets**: only `EXPO_PUBLIC_*` publishable values may be in the app; the audit greps for
   anything else. Sentry PII scrubbing confirmed on.
8. **Account deletion and data retention**: exists and is tested; confirm the partial-refund path
   cannot be used to extract money.

Free tools used: Supabase Advisors, pgTAP, `npm audit`, Dependabot, Sentry, Stripe test mode,
GitHub Actions, TestSprite (server-function HTTP tests, decision 10 and step E6).

---

## 5. Your steps (about 30 minutes total)

| When | Step | Minutes |
|---|---|---|
| Before the run | Say "go" (or ask for changes to this plan). | 1 |
| Before the run | Supabase dashboard, **staging** project → Authentication → Providers → Phone → enable, choose Twilio Verify, paste the three values from your `.env`. Then delete those three lines from `.env` (nothing reads them there). | 5 |
| Before the run | Run the one command I will give you that replaces the repo's `.claude/` hooks with the 20-line settings file (Claude cannot edit that folder). | 1 |
| During (parked) | GitHub → repo → Settings → Secrets: approve the two test-account secrets the run asks for (it tells you the names; you paste nothing, you click "approve" on the run's PR, or paste two values the run shows you from EAS). | 3 |
| Before the run (optional) | TestSprite's doctor says its "verify skill" is not installed for Claude Code. If you want Claude to use it, run `testsprite setup` once in the Terminal tab (it writes into your Claude config, which Claude itself may not touch). Not needed for the run. | 2 |
| Before the run (check) | TestSprite shows plan "Starter, state pending: a plan change or payment retry is in progress". If you did not mean to pay for Starter, check TestSprite → Billing. | 2 |
| Before the run (optional) | In this app, run `/mcp` and authorize **Supabase**. Then the run fetches the Security Advisor itself and you skip the export below. | 2 |
| During (parked) | Supabase dashboard → Advisors → export, only if you skipped the step above. | 3 |
| During (parked) | Re-run the staging pipeline with "allow drops" checked, once, when the run says the drop migration is ready. | 2 |
| After build 1 | App Store Connect → TestFlight → Internal Testing → add your friends' Apple emails; accept the invite on your own phone; walk the app for 10 minutes. | 10 |
| After build 1 | Open BrowserStack → App Live, upload the `.ipa` the run links, look at it on a real iPhone for 10 minutes. | 10 |

Hard stops (the run halts and waits for you): an Apple 2-factor prompt during the build;
anything that would touch the production Supabase project; a missing Apple credential in EAS.

---

## 6. Time and cost (INFERRED; ranges, not promises)

| Phase | Wall clock |
|---|---|
| A safety net | 15 min |
| B inventory | 1–2 h |
| C cut list | 1 h |
| D deletions | 6–10 h |
| E audit + fixes | 3–5 h |
| F iPhone tests + CI | 4–8 h |
| G TestFlight | 1 h + Apple |
| H map + hand-off | 30 min |
| **Total** | **roughly 2–3 days of run time, with checkpoints** |

Money: $0. (GitHub Pro Mac minutes, EAS free builds, Supabase free, Stripe test, Sentry free,
Twilio already paid.)

Undo for the whole run: `git checkout pre-lean-2026-11` (the tag), and the `MOVED.txt` lists in
`_archive/2026-11-lean/`. Applied staging migrations are never reverted; the drop migration is
written so a corrective migration can recreate anything by name.
