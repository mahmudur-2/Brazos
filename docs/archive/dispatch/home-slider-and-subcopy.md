# DISPATCH home-slider-and-subcopy - the sub-copy breaks onto two lines; the service chips become a sliding tile row on both Homes

Constraints come from CLAUDE.md and the .claude/ deny matrix AS THEY EXIST AT RUN START; read them first and honor them as binding. This prompt supersedes docs/dispatch/ files ONLY - it never adds to, overrides, or restates CLAUDE.md or the deny matrix.

WHAT THIS RUN IS FOR. Two changes, each in its own commit so the operator can revert either
one alone with a single command. Change A breaks the customer Home's hero sub-copy onto two
lines. Change B replaces the two rows of service chips on BOTH Home screens with one shared,
horizontally sliding row of square tiles showing every service the app knows. Nothing else on
any screen changes.

=====================================================================
BASE GATE
=====================================================================

Before anything else run: git merge-base --is-ancestor 8666ad7 HEAD
It must exit 0. If it does not, the tree sits BELOW the anchor this prompt was written
against: change nothing, report BASE GATE FAILED, and end. That is the only condition this
prompt adds that ends the run. Do not run git fetch or git pull - both are denied.

8666ad7 is the docs commit that closed the previous run (the green centre button and "Your
jobs"). The commit that carries this prompt sits on top of it.

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

CHANGE A - the sub-copy.
A1. screens/HomeScreen.tsx renders the heroSubtitle text node "Describe it. Hire help. Get it
    handled." as one line. It becomes two: "Describe it. Hire help." then a newline, then
    "Get it handled." - an explicit newline in the string, the way the headline above it
    already does with {'\n'}. Both themes, since it is one string.
A2. Nothing else about it moves: size, weight, colour, its 73% column, its margins. If the
    two-line block pushes the task-card region down, that is the intended consequence and
    nothing below is re-tuned to compensate.
A3. Fences: grep tests/ for the exact sentence and for heroSubtitle before editing. Any
    assertion that quotes the one-line string is updated to the two-line string - a constant.

CHANGE B - the sliding tile row.
B1. ONE SHARED COMPONENT, new, under components/ - suggested name ServiceTileRow - used by
    screens/HomeScreen.tsx and screens/WorkerHomeScreen.tsx. tests/workerHome.test.mjs holds
    the two screens' service rows byte-identical today; the shared component is how they stay
    identical from here on. The component owns the tiles, the scroll, the labels and the
    icons. Each screen passes only: the tap handler, and an optional heading.
B2. THE TILE SET, in this order, 25 tiles. Every entry already exists in
    lib/skillCategories.ts with a key that is a real job category and an Ionicons name; the
    key and the icon are read from there, never retyped. What is NEW is a short TILE LABEL
    per entry, defined once beside the list and used by nothing but the tile - the full names
    stay everywhere else in the app.
      The six Home shortcuts (HOME_QUICK_SERVICES), in their order:
        Assembly (furniture_assembly)  Moving (moving)  Cleaning (cleaning)
        TV mounting (tv_mounting)  Plumbing (handyman, icon water)  Yard work (yard_work)
      Then the eighteen behind Other (MORE_SERVICES), in their order:
        Repairs (Handyman & General Repairs)  Electrical  Painting (Interior Painting)
        Appliances (Appliance Installation)  Junk removal  Shelf hanging (Picture & Shelf Hanging)
        Pressure washing  Gutters (Gutter Cleaning)  Carpet cleaning (Carpet & Upholstery Cleaning)
        Windows (Window Washing)  Pest control  Organizing (Home Organization)
        Landscaping (Landscaping & Gardening)  Snow removal  Pet sitting (Pet Sitting & Dog Walking)
        Errands (Personal Assistant / Errands)  Packing (Packing & Unpacking)  Drywall (Drywall Repair)
      Then, last:
        Other (icon ellipsis-horizontal)
    Two tiles share the water icon (Plumbing, Pressure washing); that is what the entries
    carry and it is allowed. Do not invent a category, a key or an icon.
B3. TAPS ARE THE SCREEN'S OWN. On both screens a tile calls the screen's existing
    searchCategory(key) - customer: navigation.navigate('WorkerSearch', { category }); worker:
    WorkerResults with mode 'all' and the category - exactly what a chip does today. The Other
    tile opens the existing components/ServicePickerSheet.tsx with MORE_SERVICES, exactly as
    the Other chip does today, and its onSelect keeps calling searchCategory. No new
    navigation, no new route, no new param.
B4. GEOMETRY, from docs/mockups/html/home-redesign.html's .tiles / .tile / .tile-box rules
    (read that file; it carries the app's token names): tile 68x68, corner radius.md (14),
    gap 16, side inset = the screen's own content padding (20), icon 28 in the emerald token
    on the mint token, label 13/16 in the muted token centred under the tile, two-line wrap
    allowed. The row scrolls horizontally with snap; four tiles fully visible, the fifth cut
    in half so the slide is obvious. Values go through lib/theme.ts tokens - never a raw hex,
    radius or spacing literal in the component.
B5. HEADING. Customer Home passes "Popular services" - a section title in the same style as
    the screen's other section titles, sitting above the row. Worker Home passes no heading:
    its row sits under its search field exactly where the chips sit today.
B6. THE OLD LISTS. HOME_SERVICE_ROWS in lib/skillCategories.ts exists only to lay the chips
    out in two rows. If nothing reads it after this change, delete it. HOME_QUICK_SERVICES and
    MORE_SERVICES stay - the tile set is built from them, and the sheet still reads
    MORE_SERVICES. The six chip style entries (serviceRows, serviceRow, serviceChip,
    compactServiceChip, goldOutlineChip, otherChip) leave both screens' stylesheets if nothing
    else uses them - a stylesheet entry that draws nothing is a lie. Grep before deleting.
B7. FENCES, and the one re-pointing the operator authorises. tests/workerHome.test.mjs's
    "category pills mirror customer Home" test pins: HOME_SERVICE_ROWS.map on both screens,
    the exact two-slice definition of HOME_SERVICE_ROWS, variant="service", the sheet, and the
    six style entries byte-identical. THE OPERATOR AUTHORISES RE-POINTING THAT ONE TEST so it
    holds the NEW invariant: both screens render the shared component, the tile set is built
    from the two shared lists in the stated order with Other last, the sheet still opens from
    Other on both, and each screen's tap still lands on its existing search. Keep the test's
    purpose - the two rows cannot drift - and its dispatch assertions. Also read before
    editing: tests/emeraldFences.test.mjs (home(24) pins five chips on two rows against the
    old master - it describes a layout that no longer exists; re-point or retire that ONE
    test with a one-line note, authorised), tests/launchCategories.test.mjs,
    tests/customerCore.test.mjs, tests/workerDiscovery.test.mjs, tests/screenDials.test.mjs
    (the registry's Customer Home rows are parsed as TEXT in a fixed field order - a comment
    between fields breaks the parser), tests/layout.test.mjs, tests/homeDesignStudio.test.mjs,
    tests/designStudio.test.mjs. Expected constants move; logic does not, beyond the two
    authorisations above.
B8. THE DESIGN-STUDIO REGISTRY. ui/designStudioSchema.ts carries Customer Home dial rows. A
    dial whose control no longer exists is deleted, per that file's own charter (the previous
    run did the same for the Nearby card). Do not add dials for the tiles.
B9. E2E. Read .maestro/money-walk.yml and .maestro/sign-in.yml and list every literal string
    they tap on, wait for or assert that either Home renders. Known: "Post a job" and HOME_MARK
    on customer Home; "Search for jobs or areas" and "Search" on worker Home. The chips' own
    labels are not tapped by any flow - confirm that by reading, not by assuming. Every string
    on the list must still be rendered and tappable after Change B; if one is not, keep the
    old control for it and report the conflict. The flows are never edited.
B10. HORIZONTAL SCROLL ON WEB. The harness renders through react-native-web. A horizontal
    ScrollView with snapping must not throw or render vertically there. Prove it from the
    AFTER render: four tiles visible, the fifth cut. CONTINUE-PATH: if snapping misbehaves on
    web only, keep the scroll and drop the snap on web behind Platform.OS, say so, and keep
    native snapping.

=====================================================================
SCOPE - what this run may touch
=====================================================================
  screens/HomeScreen.tsx                - A1; B1, B3, B5, B6
  screens/WorkerHomeScreen.tsx          - B1, B3, B5, B6
  a NEW file under components/          - the shared tile row (B1)
  lib/skillCategories.ts                - the tile labels (B2), HOME_SERVICE_ROWS (B6)
  ui/designStudioSchema.ts              - B8 only
  the fence files named in A3 and B7    - expected constants and the authorised re-pointings
  docs/DECISIONS.md, docs/BACKLOG.md, HANDOFF.md - the docs commit
  .shots/                               - renders and commit-message files

SCOPE - what this run may NOT touch
  The centre button, the bar, "Your jobs", the attention block, the task card / search field,
    the greeting, the headline, the hero art, Discover, the picker sheet's own rows.
  Any data path. No new query, RPC, table, migration, edge function or database contact.
    The invariants this run must not go near: assignment and lifecycle are database-only;
    job_offers is RPC-write-only; money is integer cents through formatBudget(); exact
    address lives in job_locations behind RLS.
  New dependencies. New fonts. docs/GATES.md, docs/SCOPE.md. The frozen web surface and
    .claude/ - refused by path rules anyway.

=====================================================================
PHASE 0 - READ. Writes nothing.
=====================================================================
0.1  CLAUDE.md in full; docs/GATES.md and docs/SCOPE.md (Gates 1 and 2 closed - confirm).
0.2  HANDOFF.md - the previous run's record, including what it left for a cleanup run.
0.3  lib/skillCategories.ts in full. screens/HomeScreen.tsx and screens/WorkerHomeScreen.tsx:
     the chip rows, searchCategory, the Other chip, the sheet, the section-title styles.
     components/ServicePickerSheet.tsx. components/Chip.tsx (what the tiles replace).
     lib/theme.ts and the spacing / radius / colour tokens the component will use.
0.4  docs/mockups/html/home-redesign.html - the .tiles rules and the tile markup, for B4.
0.5  Every fence in A3 and B7. Write down, per fence, which assertions will move and whether
     each is a constant or one of the authorisations.
0.6  scripts/shots.mjs: the registry entries whose names contain "home" - customer-home,
     customer-home-jobs, worker-home, worker-home-online, worker-home-jobs, dark and light.
     --only home selects all of them.
0.7  git log -1 --oneline   and   git status --porcelain

=====================================================================
PHASE 1 - THE BEFORE RENDER. Before editing one character.
=====================================================================
1.1  mkdir -p .shots/slider-subcopy
1.2  node scripts/shots.mjs --build --only home
     --build is mandatory here and at every later render.
     CONTINUE-PATH: on failure retry once; then once without --build; then capture what
     rendered, record the exact output, and continue diminished.
1.3  Copy every PNG produced to .shots/slider-subcopy/ with a before- prefix.

=====================================================================
PHASE 2 - CHANGE A, render, commit
=====================================================================
2.1  Make Change A (A1-A3).
2.2  npm run verify. Red in a fence you moved: fix the expectation. Red anywhere else: fix
     only what this change caused; leave unrelated red alone and report it.
2.3  Render: node scripts/shots.mjs --build --only customer-home
     Copy to .shots/slider-subcopy/ with an afterA- prefix.
2.4  Commit A. Stage by explicit path only - the files Change A edited, nothing else. Inspect
     git diff --cached --name-status. Message by file. Subject line:
       feat(home): the hero sub-copy breaks after "Hire help."
     Record the hash.

=====================================================================
PHASE 3 - CHANGE B, render, commit
=====================================================================
3.1  Make Change B (B1-B10).
3.2  npm run verify, same rule as 2.2.
3.3  Render: node scripts/shots.mjs --build --only home
     Copy every PNG to .shots/slider-subcopy/ with an afterB- prefix.
3.4  From the AFTER renders confirm: four tiles fully visible and a fifth cut on both Homes,
     the heading present on customer Home and absent on worker Home, and every E2E string
     from B9 still present. Measure the tile boxes with tests/pngGeometry.mjs if the eye
     cannot be used - the run cannot open images.
3.5  Commit B. Explicit paths, message by file. Subject line:
       feat(home): one sliding tile row of every service, shared by both Homes
     Record the hash.

=====================================================================
PHASE 4 - THE DOCS COMMIT, VERIFY, PUSH
=====================================================================
4.1  docs/DECISIONS.md: ONE dated entry for this run, two numbered items - (1) the sub-copy
     on two lines; (2) the service row: 25 tiles in the stated order, Other last, tile labels
     defined once, one shared component on both Homes, the chip rows retired.
4.2  docs/BACKLOG.md: if the previous run's cleanup note (two orphaned nav tokens, two stale
     studio rows) is not already recorded there, add it as one line. Nothing else.
4.3  HANDOFF.md: rewrite per CLAUDE.md as the last act. Record: the three commit hashes; which
     fences were re-pointed and which constants moved; whether snapping needed the web
     fallback (B10); and the two revert lines from the report.
4.4  npm run verify. Report the output exactly as printed. Commit C, explicit paths, message
     by file. Subject line:
       docs: the two-line sub-copy and the service tile row - decision, handoff
4.5  If, and only if, 4.4 exited 0:  git push origin mainexpo
     That exact form and no other. CONTINUE-PATH: if the push is refused, record the exact
     error under NEEDS THE OPERATOR and end the run cleanly; do not retry in a loop.

=====================================================================
REPORT - the last thing you write. Plain language; the operator writes no code.
Compose it with the Write tool or in your reply, never inside a shell command.
=====================================================================
 1. THE IMAGES. Absolute paths: before / afterA / afterB for customer Home and worker Home,
    dark and light, each variant that rendered. One line on which command made each.
 2. THE ROW. The 25 tile labels in their final order, each with its key and icon; four
    visible and the fifth cut, on both Homes, from the AFTER render; heading on customer,
    none on worker.
 3. E2E. Every string from B9, one per line, still rendered and tappable, with the render or
    file that proves it.
 4. TESTS. Every test file that changed: which assertions moved as constants, and the
    authorised re-pointings quoted before and after.
 5. VERIFY. The final npm run verify output as printed. Anything red you left alone, and why.
 6. THE DECISION ENTRY, quoted in full.
 7. THE COMMITS. Three hashes with subjects. Whether the push happened.
 8. NEEDS THE OPERATOR - three paste-ready blocks, nothing left as a placeholder:
       git revert <hash of A>      - puts the sub-copy back on one line
       git revert <hash of B>      - brings the chip rows back on both Homes
       npm run update:preview      - sends this to the Beta; then launch the app twice
    Each with one line on what it does. Plus anything the run could not do, each with why.
 9. Every continue-path taken.

MODEL AND EFFORT. Written for claude-opus-5 at effort max, bypass permission mode. Every
branch is pre-decided and carries a continue-path.

End the report with the literal line: RUN COMPLETE
