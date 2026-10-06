# DISPATCH home-plus-and-your-jobs - the dark [+] goes green; "Your jobs" replaces Nearby on the customer Home

Constraints come from CLAUDE.md and the .claude/ deny matrix AS THEY EXIST AT RUN START; read them first and honor them as binding. This prompt supersedes docs/dispatch/ files ONLY - it never adds to, overrides, or restates CLAUDE.md or the deny matrix.

WHAT THIS RUN IS FOR. Two changes to the customer Home, each in its own commit so the
operator can revert either one alone with a single command. Change A recolours the dark-mode
centre button in the bottom bar. Change B removes the Nearby section from the customer Home
and puts a "Your jobs" section in its place. Nothing else on any screen changes.

=====================================================================
BASE GATE
=====================================================================

Before anything else run: git merge-base --is-ancestor f2eed5f HEAD
It must exit 0. If it does not, the tree sits BELOW the anchor this prompt was written
against: change nothing, report BASE GATE FAILED, and end. That is the only condition this
prompt adds that ends the run. Do not run git fetch or git pull - both are denied.

f2eed5f is the trunk tip: the commit that added docs/mockups/html/home-redesign.html. It sits
on top of 4d70269, the nineteen baked nav values, which this run's Change A edits beside.

Then run: git status --porcelain
One entry is expected:  M HANDOFF.md  (the launcher appends a START line before you begin).
Anything else that is dirty: leave it exactly as it stands, never stash, reset, restore or
clean it - all four are denied - list it in the report, and continue. The base gate fails on
the ancestry check alone; a dirty tree never fails it.

=====================================================================
NON-INTERACTIVE
=====================================================================

Put no question to the person dispatching this. Every uncertainty below has a written
continue-path; take it and keep going. A stop is a failed run. CLAUDE.md's own stop
conditions still apply in full and take precedence.

TOOL RULE - read this twice. The guard hook matches command TEXT, not intent. A shell command
is refused if its text contains the bare token claude, a git subcommand naming a remote, the
filename start.ps1 or .env, the substring --amend, or powershell - even when the command only
prints a heading. So: never echo a heading that narrates this run's work. Use the Read, Grep
and Glob tools for inspection and the Write tool for file content. Reserve shell commands for
git status, git log, git merge-base, git diff, git add <explicit path>, git commit -F <file>,
node scripts/..., npm run verify, and git push origin mainexpo. EVERY commit message travels
by file: write it with the Write tool under .shots/ and commit with git commit -F. The
co-author trailer contains a refused token and cannot appear on a command line.

=====================================================================
PRE-RESOLVED DECISIONS - the operator's answers, 2026-09-17. Do not re-litigate.
=====================================================================

CHANGE A - the dark centre button.
A1. Scope: DARK MODE ONLY, and only the customer bar's centre button. The light button is
    untouched - fill, ring, glyph, all of it. The worker bar has no centre button; confirm
    that from CUSTOMER_BAR_TABS and the roster in ui/primitives/BottomNav.tsx and say so.
A2. Fill: THE SAME RECIPE THE LIVE DARK "POST A JOB" PILL USES, so the two controls are
    identical by construction and no new colour enters the app. That recipe is in
    screens/HomeScreen.tsx: litFill({ surface: colors.postPillGreen, lift: colors.emerald,
    liftAlpha: CTA_LIFT_ALPHA, highlight: true, highlightAlpha: CTA_EDGE_ALPHA, flat: !isDark })
    over a base backgroundColor of colors.postPillGreen, where `colors` is the DARK palette
    when dark. litFill lives in ui/primitives/LitSurface.tsx and returns a plain style (a
    background gradient), so it can be applied to the button directly. Use it with
    highlight: false - the operator wants no edge.
    CONTINUE-PATH: ui/primitives/BottomNav.tsx deliberately does not consume the theme hook
    (its own header explains why - an Android bug and recompute churn). Do not add the hook.
    Take the dark palette's values from the static `dark` export in ui/tokens.ts, the way the
    file already branches dark and light for createButtonDark / createButtonLight. If litFill
    cannot be applied there for a reason you can name, compute the resulting colour ONCE as a
    navBar token from the same inputs and the same math, and say so in the report.
A3. Glyph: the app's cream - the DARK palette's onForest (#F1EDE1), the same value the dark
    "Post a job" text uses. Referenced by token, never retyped.
A4. Ring: NONE. No border of any kind on the dark button. The gold hairline
    (navBar.ringColorDark) stops being drawn in dark. The light button keeps its ring.
A5. Glow: if the button's glow takes a colour, it takes the new fill. createGlowAlpha and
    every other number - createSizeRatio, createGlyphRatio, createRadius - do not move.
A6. Studio: the design-studio rows create.fill and create.glyphColor in
    ui/designStudioSchema.ts take the new defaults, so the studio and the shipped app agree.
    Rows are parsed as TEXT in a fixed field order by tests/screenDials.test.mjs - a comment
    between two fields breaks the parser; notes go above the row's opening brace.
A7. Fences: HANDOFF.md records that create.fill and create.glyphColor are held by no fence -
    pinned by token name only. Read tests/emeraldFences.test.mjs (home(8), RUN H3),
    tests/goldOnForest.test.mjs and tests/designStudio.test.mjs. Any assertion that the dark
    button is filled gold, or that its glyph is navBar.glyphColorDark, is re-pointed to the
    new fill and glyph. THE OPERATOR AUTHORISES THAT RE-POINTING FOR THIS BUTTON ONLY.
    Nothing else in those files changes. Where a fence pins the light button, it must keep
    passing untouched.
A8. This reverses the gold decision of 2026-09-08 (docs/DECISIONS.md). More than 48 hours
    have passed. The docs commit records the new choice as a dated entry that names the old one.

CHANGE B - "Your jobs" replaces Nearby on the customer Home.
B1. Remove the Nearby section from screens/HomeScreen.tsx: the heading, the live dot and its
    pulse, its "View all open jobs" control, its cards, its empty and error notices. Nearby
    stays on Discover and in worker mode; nothing outside Home changes. If, after removal,
    nothing on Home consumes useOpenJobs (hooks/useOpenJobs.ts), drop the call from Home - do
    not edit the hook. Pull-to-refresh keeps refreshing what Home still shows.
B2. The "needs attention" block (lib/homeAttention.ts, ATTENTION_CAP, drawn with
    components/HubCard.tsx from hooks/useMyJobsHub.ts) STAYS EXACTLY AS IT IS, in its place,
    shown only when non-empty. tests/homeAttention.test.mjs must pass unchanged.
B3. Below it, a new section headed "Your jobs" with "View all" and a right arrow on the
    right. View all navigates where the [+] sheet's "My jobs" row already goes -
    navigation/CustomerRoot.tsx uses navigateAcrossTabs('MyJobs'); do the same. The section
    is ALWAYS present, populated or empty.
B4. Contents: the customer's 3 most recent POSTED jobs, newest first, ANY status - open,
    hired, in progress, finished, cancelled. Drafts are not posted and do not appear. A job
    that is in the attention block may ALSO appear here; the operator chose that. Data comes
    from what hooks/useMyJobsHub.ts already loads - reuse its rows; no new query, no new RPC,
    no schema. CONTINUE-PATH: if the hub's rows do not include every status this needs, use
    the widest set it already has, list the statuses that are missing in the report, and do
    not add a read.
B5. Cards: components/HubCard.tsx, the card My Jobs already draws, unchanged. Tapping a card
    opens the job the way My Jobs does - lib/ownJobCard.ts openOwnJob(), the same path the
    attention block uses. No new card.
B6. Empty state, shown only when no job has ever been posted: the circle-with-briefcase mark
    and ONE line, "No jobs have been posted yet". No second line. The look is
    docs/mockups/html/home-redesign.html's "Your jobs" empty state; read that file for the
    sizes (54pt circle on the mint token, 17/700 title). It is a reference, not a canvas -
    build it from the existing empty-state pieces where they exist.
B7. Fences: the RUN H2 fence in tests/emeraldFences.test.mjs pins the Nearby heading's text
    node and the live dot; home(26) pins Nearby's gap below the card. Both are re-pointed to
    "Your jobs". THE OPERATOR AUTHORISES THAT RE-POINTING. home(9) - nothing on the customer
    Home stack links to Map - must keep passing. tests/copyTruth.test.mjs and
    tests/copyHonesty.test.mjs: the new line is only ever shown when no job was ever posted,
    so it is always true; keep it that way. tests/ownJobCard.test.mjs,
    tests/customerCore.test.mjs and tests/crossTabNavigation.test.mjs: read them before
    editing; expected constants move, logic does not.
B8. "Post a job" stays above the fold - it sits above everything this change touches, in the
    promo card, which is not edited. Confirm from the AFTER render.
B9. The 2026-09-05 ruling (docs/DECISIONS.md, entry (4)) placed the attention block directly
    below the post card and above Nearby. Its position does not move; Nearby leaves and
    "Your jobs" takes the slot. The docs commit says so in the same dated entry as A8.
B10. docs/BACKLOG.md carries a v1 bug: customer Home's Live Nearby cards run the open-jobs
    browse and offer the worker-mode switch. Removing Nearby from Home closes it. Strike that
    line in the docs commit with one clause saying how it closed.

=====================================================================
SCOPE - what this run may touch
=====================================================================
  ui/primitives/BottomNav.tsx           - Change A, the dark centre button only
  ui/tokens.ts                          - Change A, the navBar block only, only if a token is added
  ui/designStudioSchema.ts              - Change A, the two create.* rows' defaults
  screens/HomeScreen.tsx                - Change B
  the fence files named in A7 and B7    - expected constants and the two authorised re-pointings
  docs/DECISIONS.md, docs/BACKLOG.md, HANDOFF.md - the docs commit
  scripts/shots.mjs and tests/shotHarness.test.mjs - ONLY under Phase 3's continue-path, and only
                                          to answer one more read with the four rows it already seeds

SCOPE - what this run may NOT touch
  The light-mode centre button. Any other screen. The worker bar. The promo card, the search
    field, the greeting, the hero, the service chips - every other part of Home.
  Any data path beyond dropping a read Home no longer needs. No new query, RPC, table,
    migration, edge function or database contact. The invariants this run must not go near:
    assignment and lifecycle are database-only; job_offers is RPC-write-only; money is
    integer cents through formatBudget(); exact address lives in job_locations behind RLS.
  New dependencies. New fonts. docs/GATES.md, docs/SCOPE.md. The frozen web surface and
    .claude/ - refused by path rules anyway.

=====================================================================
PHASE 0 - READ. Writes nothing.
=====================================================================
0.1  CLAUDE.md in full; docs/GATES.md and docs/SCOPE.md (Gates 1 and 2 closed - confirm).
0.2  HANDOFF.md - the section "What a following run must know" names the six loose values,
     the stale literals in tests/layout.test.mjs, and the registry's text-parsed rows.
0.3  ui/primitives/BottomNav.tsx in full, ui/tokens.ts navBar block, ui/primitives/LitSurface.tsx
     litFill, and the litFill call in screens/HomeScreen.tsx (search CTA_LIFT_ALPHA).
0.4  screens/HomeScreen.tsx in full: the attention block, the Nearby block, useOpenJobs,
     useMyJobsHub, the pull-to-refresh, openOwnJob. Then hooks/useMyJobsHub.ts,
     lib/homeAttention.ts, lib/ownJobCard.ts, components/HubCard.tsx, lib/jobs.ts.
0.5  Every fence in A7 and B7, plus tests/screenDials.test.mjs, tests/layout.test.mjs and
     tests/shotHarness.test.mjs. Write down, per fence, which assertions will move and
     whether each is a constant or one of the two authorised re-pointings.
0.6  scripts/shots.mjs: the registry entries customer-home-* and customer-home-jobs-*, and
     what `jobs: true` answers (the open-jobs feed read and the by-id read - NOT the
     customer's own-jobs read).
0.7  git log -1 --oneline   and   git status --porcelain

=====================================================================
PHASE 1 - THE BEFORE RENDER. Before editing one character.
=====================================================================
1.1  mkdir -p .shots/plus-yourjobs
1.2  node scripts/shots.mjs --build --only customer-home
     --build is mandatory here and at every later render; without it the harness reuses the
     previous export and pictures the wrong tree.
     CONTINUE-PATH: on failure retry once; then once without --build; then capture what
     rendered, record the exact output, and continue diminished.
1.3  Copy the four PNGs to .shots/plus-yourjobs/ with a before- prefix.

=====================================================================
PHASE 2 - CHANGE A, then its own render and proof
=====================================================================
2.1  Make Change A per A1-A7. Update the studio rows (A6) and the fence constants (A7).
2.2  npm run verify. Red in a fence you moved: fix the expectation as A7 allows. Red anywhere
     else: fix only what this change caused; leave unrelated red alone and report it.
2.3  Render again: node scripts/shots.mjs --build --only customer-home
     Copy to .shots/plus-yourjobs/ with an afterA- prefix.
2.4  PROVE LIGHT DID NOT MOVE. Compare before-customer-home-light.png against
     afterA-customer-home-light.png, and the same for the -jobs- pair, with a pixel
     comparison (tests/pngGeometry.mjs decodes a PNG; a dozen lines under
     .shots/plus-yourjobs/ over the two decoded buffers is enough). Report the count of
     differing pixels. The expected count is zero. A non-zero count means the light button
     moved: find why and fix it before committing; if you cannot, do not commit Change A -
     report it and go on to Change B.
2.5  Commit A. Stage by explicit path only: the files Change A edited, nothing else. Inspect
     git diff --cached --name-status. Message by file. Subject line:
       feat(nav): the dark centre button takes the Post-a-job green, no ring
     Record the hash.

=====================================================================
PHASE 3 - CHANGE B, then its own render
=====================================================================
3.1  Make Change B per B1-B9. Update the fence constants and the two re-pointings (B7).
3.2  npm run verify, same rule as 2.2.
3.3  Render: node scripts/shots.mjs --build --only customer-home
     Copy to .shots/plus-yourjobs/ with an afterB- prefix.
     THE POPULATED VARIANT. customer-home-jobs answers the open-jobs feed read with four
     seeded rows. Those rows fed Nearby, which is now gone; the hub's own-jobs read is not
     answered, so "Your jobs" will render EMPTY there. CONTINUE-PATH, in this order:
       (a) If the harness can answer the hub's own-jobs read with THE SAME FOUR ROWS it
           already seeds - no new invented data, the rows attributed to the seeded session's
           user - and tests/shotHarness.test.mjs accepts it by a constant change, do that,
           in Change B's commit, and say so.
       (b) Otherwise leave the harness alone. Deliver the empty variant as the harness proof
           and state plainly that the populated "Your jobs" is unphotographed until the
           operator opens the Beta; the attention block was in the same position before
           this run, and tests/homeAttention.test.mjs unchanged is its proof.
3.4  Confirm B8 from afterB-customer-home-dark.png: "Post a job" visible without scrolling.
3.5  Commit B. Explicit paths, message by file. Subject line:
       feat(home): "Your jobs" replaces Nearby on the customer Home
     Record the hash.

=====================================================================
PHASE 4 - THE DOCS COMMIT, VERIFY, PUSH
=====================================================================
4.1  docs/DECISIONS.md: ONE dated entry for this run, two numbered items - (1) the dark
     centre button, named as reversing the 2026-09-08 gold decision, with the recipe, the
     glyph, no ring; (2) Nearby leaves the customer Home, "Your jobs" takes its slot, the
     attention block's position from the 2026-09-05 entry (4) unchanged, 3 most recent posted
     jobs any status, may duplicate the attention block, View all to My Jobs.
4.2  docs/BACKLOG.md: strike the Live Nearby card bug per B10.
4.3  HANDOFF.md: rewrite per CLAUDE.md as the last act. Record: the three commit hashes; that
     the operator verified the nineteen nav values on the device on 2026-09-17 (clear that
     wait-list item); which fences were re-pointed and which constants moved; the populated
     variant's status from 3.3; and the two revert lines from the report.
4.4  npm run verify. Report the output exactly as printed. Commit C, explicit paths,
     message by file. Subject line:
       docs: the green centre button and "Your jobs" - decision, backlog, handoff
4.5  If, and only if, 4.4 exited 0:  git push origin mainexpo
     That exact form and no other. CONTINUE-PATH: if the push is refused, record the exact
     error under NEEDS THE OPERATOR and end the run cleanly; do not retry in a loop.

=====================================================================
REPORT - the last thing you write. Plain language; the operator writes no code.
Compose it with the Write tool or in your reply, never inside a shell command.
=====================================================================
 1. THE IMAGES. Absolute paths: before / afterA / afterB, customer Home, dark and light,
    empty and populated. One line on which command made each.
 2. LIGHT DID NOT MOVE. The differing-pixel counts from 2.4, both pairs.
 3. THE BUTTON. What the dark centre button is now made of, by token name: fill recipe,
    glyph, no ring; the glow's colour; confirmation the worker bar has no centre button.
 4. YOUR JOBS. The section order on Home now; the statuses the list can show; the populated
    variant's status (3.3 a or b); "Post a job" above the fold, from the AFTER render.
 5. TESTS. Every test file that changed: which assertions moved as constants, and the exact
    two re-pointings the operator authorised, quoted before and after.
 6. VERIFY. The final npm run verify output as printed. Anything red you left alone, and why.
 7. THE DECISION ENTRY, quoted in full.
 8. THE COMMITS. Three hashes with subjects. Whether the push happened.
 9. NEEDS THE OPERATOR - three paste-ready blocks, nothing left as a placeholder:
       git revert <hash of A>      - undoes the button, one command
       git revert <hash of B>      - undoes Your jobs and brings Nearby back, one command
       npm run update:preview      - sends this to the Beta; then launch the app twice
    Each with one line on what it does. Plus anything the run could not do, each with why.
10. Every continue-path taken.

MODEL AND EFFORT. Written for claude-opus-5 at effort max, bypass permission mode. Every
branch is pre-decided and carries a continue-path.

End the report with the literal line: RUN COMPLETE
