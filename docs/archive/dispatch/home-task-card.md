# DISPATCH home-task-card - the task card replaces the search bar and the promo card on the customer Home

Constraints come from CLAUDE.md and the .claude/ deny matrix AS THEY EXIST AT RUN START; read them first and honor them as binding. This prompt supersedes docs/dispatch/ files ONLY - it never adds to, overrides, or restates CLAUDE.md or the deny matrix.

WHAT THIS RUN IS FOR. One change to the customer Home, in one commit so the operator can
revert it with a single command: the standalone search bar and the "FASTEST WAY TO START"
promo card both go, and one task card takes their place directly under the hero - a title,
the search field with the real mic and a magnifier that runs the search, and the live
"Post a job" pill moved inside it. The service tile row then sits directly under the card.
Nothing else on any screen changes.

=====================================================================
BASE GATE
=====================================================================

Before anything else run: git merge-base --is-ancestor de5fa03 HEAD
It must exit 0. If it does not, the tree sits BELOW the anchor this prompt was written
against: change nothing, report BASE GATE FAILED, and end. That is the only condition this
prompt adds that ends the run. Do not run git fetch or git pull - both are denied.

de5fa03 is the docs commit that closed the previous run (the two-line sub-copy and the
service tile row). The commit carrying this prompt sits on top of it.

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

THE CARD, TOP TO BOTTOM.
C1. WHAT GOES. From screens/HomeScreen.tsx: the standalone SearchBar with the placeholder
    "Describe a service or project" and its gold arrow-forward trailing slot; and the whole
    promo card - the eyebrow "FASTEST WAY TO START", the headline "Describe the job. BRAZOS
    handles the rest.", the B mark (PRESTIGE_B_DRAPE / POST_MARK) and its copy-column
    arithmetic (bDrape.copyPaddingRight, MASTER_SERIF_CAPS entries that exist only for that
    headline). The two required() assets stay on disk; if nothing on Home reads them after
    this, drop the two require lines from Home only. Never delete an asset file.
C2. WHAT COMES, in ONE card directly under the hero, at the screen's content padding:
      a. Title "What do you need done?" - 20/24, weight 700, the ink token.
      b. The search field: the SAME ui/primitives/SearchBar.tsx instance Home already has -
         same value, onChangeText, onSubmit (submitSearch), autoCapitalize, autoCorrect -
         with placeholder "Describe your task..." and its mic exactly as live: the REAL voice
         search, rendered by SearchBar itself when the device can do it. Nothing about voice
         changes. The field is 44 tall with radius 17: these are Home's own values,
         lib/homeDesignStudio.tsx searchHeight 65 -> 44 and searchRadius 35 -> 17, and the
         registry rows that carry them follow.
      c. The magnifier IS the submit. The trailing slot's gold arrow-forward becomes an
         Ionicons "search" glyph in the same slot, same size, same gold, same onPress
         (submitSearch), same accessibility label semantics ("Search"). It sits to the right
         of the mic, as the arrow does today. SearchBar also draws a LEADING "search" glyph
         inside the field; with the magnifier on the right that would be two. Add ONE
         optional prop to SearchBar to omit the leading glyph, default false so every other
         caller is untouched; Home passes it. That is the only shared-primitive change.
      d. The "Post a job" pill: THE LIVE PILL, MOVED, NOT REDESIGNED. Same styles.heroButton,
         same litFill recipe (postPillGreen lifted with emerald, highlight on, flat in light),
         same text "Post a job ›" at its current size and colour, same onPress
         (startJobDraft), same accessibilityLabel "Post a job". Full width inside the card,
         under the field, gap 14. Its ctaHeight 48 and ctaRadius 24 do not move.
C3. THE CARD ITSELF. Padding 17, radius 22 (the promo card's home.promoCard.radius dial
    keeps its key; relabel it as the task card's corner). Light: the surface token, the line
    token as a 1pt border, shadows.card. Dark: LIT WITH THE MOCKUP'S EXACT SHADES - top
    #15362B to bottom #0B2019, edge #27473A - which are NEW VALUES. They go into the dark
    palette as three named tokens (suggested: taskCardLitTop, taskCardLitBottom,
    taskCardEdge) in ui/tokens.ts, exposed through lib/theme.ts like every other token;
    never a raw hex in the screen. Draw the gradient with the SAME mechanism litFill uses
    (experimental_backgroundImage on native, backgroundImage on web): extend
    ui/primitives/LitSurface.tsx with a helper that takes explicit top and bottom stops and
    keeps its platform branch. No gradient library.
C4. ORDER ON THE SCREEN, after this run: hero -> the task card -> "Popular services" and
    the tile row -> the attention block (when non-empty) -> "Your jobs". The tile row moves
    up to sit directly under the card; nothing about the row itself changes.
C5. THE 2026-09-05 RULING, entry (4), placed the attention block directly below the post
    card. The post card is now the task card and the tile row sits between them. The
    ruling's REASON - "Post a job" reachable without scrolling - is more than intact: the pill
    moves UP the screen. The docs commit records this as a dated decision that names the old
    one. tests/homeAttention.test.mjs's two position claims - never above the pill, always
    leading the job sections - both still hold and must keep passing; if it also pins
    "immediately after the card", that one assertion moves. Authorised.
C6. E2E. Read .maestro/money-walk.yml and .maestro/sign-in.yml. "Post a job" is sign-in's
    HOME_MARK and the Act-1 tap; it must still be rendered, tappable, and above the fold -
    prove the last from the AFTER render. List every other string the flows depend on from
    customer Home and confirm each. The flows are never edited. The harness recipes in
    scripts/shots.mjs that reach Post-a-Job press "Post a job" too; Phase 3 renders one of
    them as proof the recipe still lands.

=====================================================================
SCOPE - what this run may touch
=====================================================================
  screens/HomeScreen.tsx                - C1, C2, C4
  ui/primitives/SearchBar.tsx           - C2c, the one optional prop, default unchanged
  ui/primitives/LitSurface.tsx          - C3, the explicit-stops helper
  ui/tokens.ts, lib/theme.ts            - C3, the three dark tokens
  lib/homeDesignStudio.tsx              - C2b, searchHeight and searchRadius
  ui/designStudioSchema.ts              - the Customer Home rows those values and the card's
                                          corner ride on; rows are parsed as TEXT in a fixed
                                          field order by tests/screenDials.test.mjs - notes go
                                          above a row's opening brace, never between fields
  the fences named in Phase 0.5         - expected constants and the authorised re-pointings
  docs/DECISIONS.md, HANDOFF.md         - the docs commit
  .shots/                               - renders and commit-message files

SCOPE - what this run may NOT touch
  The tile row's own component and lib/skillCategories.ts. "Your jobs" and the attention
    block's contents. The greeting, the headline, the sub-copy, the hero art, the bar, the
    centre button. Worker Home. Discover. The Post-a-Job flow itself.
  Any data path. The search still calls submitSearch; the pill still calls startJobDraft;
    the mic is still lib/voiceSearch through SearchBar. No new query, RPC, table, migration,
    edge function or database contact. The invariants this run must not go near: assignment
    and lifecycle are database-only; job_offers is RPC-write-only; money is integer cents
    through formatBudget(); exact address lives in job_locations behind RLS.
  New dependencies. New fonts. docs/GATES.md, docs/SCOPE.md. The frozen web surface and
    .claude/ - refused by path rules anyway.

=====================================================================
PHASE 0 - READ. Writes nothing.
=====================================================================
0.1  CLAUDE.md in full; docs/GATES.md and docs/SCOPE.md (Gates 1 and 2 closed - confirm).
0.2  HANDOFF.md - the two previous runs' records.
0.3  screens/HomeScreen.tsx in full: the SearchBar call and its trailing slot, submitSearch,
     the promo card (styles.heroCard / heroCardDark / heroEyebrow / heroHeadline /
     heroButton, the B mark, bDrape), startJobDraft, the section order, the studio reads.
     ui/primitives/SearchBar.tsx in full. ui/primitives/LitSurface.tsx (litFill, litGradient).
     lib/homeDesignStudio.tsx. lib/theme.ts and the dark palette in ui/tokens.ts.
0.4  docs/mockups/html/home-redesign.html - the .card / .card-title / .field / .cta rules and
     the dark card's gradient line, for C2 and C3. It is a reference, not a canvas.
0.5  The fences, and write down per fence which assertions will move and whether each is a
     constant or an authorised re-pointing: tests/emeraldFences.test.mjs (home(2) the B mark
     and the copy column; home(25) the promo card's height term by term; home(6) the strip
     above the Post-a-Job footer; RUN H2 "the greeting name and the Post-a-job pill"; RUN H3
     "the light pill goes cream" - the pill's own assertions must keep passing since the pill
     is unchanged; the card and mark assertions describe a card that no longer exists and are
     retired or re-pointed to the task card, authorised, each with a one-line note),
     tests/homeDesignStudio.test.mjs, tests/screenDials.test.mjs, tests/customerCore.test.mjs,
     tests/voiceSearch.test.mjs, tests/litSurface.test.mjs, tests/copyTruth.test.mjs,
     tests/copyHonesty.test.mjs, tests/homeAttention.test.mjs, tests/postJobPublish.test.mjs,
     tests/layout.test.mjs, tests/designStudio.test.mjs, tests/themeTokens.test.mjs.
0.6  scripts/shots.mjs: the customer-home targets, and the postjob-media recipe (how it
     reaches Post-a-Job from Home).
0.7  git log -1 --oneline   and   git status --porcelain

=====================================================================
PHASE 1 - THE BEFORE RENDER. Before editing one character.
=====================================================================
1.1  mkdir -p .shots/task-card
1.2  node scripts/shots.mjs --build --only customer-home
     --build is mandatory here and at every later render.
     CONTINUE-PATH: on failure retry once; then once without --build; then capture what
     rendered, record the exact output, and continue diminished.
1.3  Copy every PNG produced to .shots/task-card/ with a before- prefix.

=====================================================================
PHASE 2 - THE CHANGE
=====================================================================
2.1  Make C1 through C5. Work in the values, never in literals: Home's own values for the
     field, tokens for every colour, the studio rows following.
2.2  npm run verify. Red in a fence you moved: fix the expectation as Phase 0.5 allows. Red
     anywhere else: fix only what this change caused; leave unrelated red alone and report it.

=====================================================================
PHASE 3 - THE AFTER RENDER AND THE PROOFS
=====================================================================
3.1  node scripts/shots.mjs --build --only customer-home
     Copy every PNG to .shots/task-card/ with an after- prefix.
3.2  Prove from the AFTER renders, with tests/pngGeometry.mjs where the eye cannot be used
     (the run cannot open images): the card sits directly under the hero; the pill's green
     band is inside the card and its bottom edge is above the fold with margin to spare;
     the tile row's boxes sit directly under the card; the dark card's top rows are lighter
     than its bottom rows (the gradient exists); light's card rows are the surface white.
3.3  node scripts/shots.mjs --only postjob-media
     If it lands (its wait text arrives), the Post-a-Job recipe still finds "Post a job" on
     Home. Copy the PNG to .shots/task-card/ with an after- prefix. CONTINUE-PATH: if it does
     not land, the pill's text or position broke the recipe - fix the screen, not the recipe.
3.4  Commit. Stage by explicit path only - the files this change edited, nothing else.
     Inspect git diff --cached --name-status. Message by file. Subject line:
       feat(home): the task card replaces the search bar and the promo card
     Record the hash.

=====================================================================
PHASE 4 - THE DOCS COMMIT, VERIFY, PUSH
=====================================================================
4.1  docs/DECISIONS.md: ONE dated entry - the task card (what went, what came, the field's
     new size, the magnifier as submit, the pill unchanged and moved, the three dark
     tokens by name and value), and the order change over the 2026-09-05 entry (4), named.
4.2  HANDOFF.md: rewrite per CLAUDE.md as the last act. Record: the two commit hashes; the
     fences re-pointed and the constants moved; the SearchBar prop added; the LitSurface
     helper added; the three tokens; and the revert line from the report.
4.3  npm run verify. Report the output exactly as printed. Commit, explicit paths, message by
     file. Subject line:
       docs: the task card - decision, handoff
4.4  If, and only if, 4.3 exited 0:  git push origin mainexpo
     That exact form and no other. CONTINUE-PATH: if the push is refused, record the exact
     error under NEEDS THE OPERATOR and end the run cleanly; do not retry in a loop.

=====================================================================
REPORT - the last thing you write. Plain language; the operator writes no code.
Compose it with the Write tool or in your reply, never inside a shell command.
=====================================================================
 1. THE IMAGES. Absolute paths: before / after, customer Home, dark and light, empty and
    populated, plus the postjob-media proof. One line on which command made each.
 2. THE CARD. What is in it, top to bottom, with the token or value behind each part; the
    three new dark tokens by name and value; the measured proofs from 3.2.
 3. E2E. Every string from C6, one per line, still rendered and tappable, with the proof.
 4. TESTS. Every test file that changed: which assertions moved as constants, and every
    authorised re-pointing quoted before and after.
 5. VERIFY. The final npm run verify output as printed. Anything red you left alone, and why.
 6. THE DECISION ENTRY, quoted in full.
 7. THE COMMITS. Two hashes with subjects. Whether the push happened.
 8. NEEDS THE OPERATOR - two paste-ready blocks, nothing left as a placeholder:
       git revert <hash of the change>   - brings the search bar and the promo card back
       npm run update:preview            - sends this to the Beta; then launch the app twice
    Each with one line on what it does. Plus anything the run could not do, each with why.
 9. Every continue-path taken.

MODEL AND EFFORT. Written for claude-opus-5 at effort max, bypass permission mode. Every
branch is pre-decided and carries a continue-path.

End the report with the literal line: RUN COMPLETE
