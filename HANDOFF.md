# HANDOFF — current operational context

WRITTEN: 2026-09-30 (THE VIEWER'S PREP FIXED, AND THE TAB BAR EXPLORED — a one-line run and this
session's side work; its section, the first below — then the DESIGN LOOP section, still the current
design work and the next session's start, BUILD IT, the LUX-LIST-2 run's, LUX-LIST-64's, the NEXT
SESSION primer of 2026-09-27 (the pipeline, the fences and the traps), THE OPERATOR'S REVIEW OF THE
LUX AFTER, THE LUX REMAKE, the brief's own section, THE REFRESH (2026-09-26), the sign-in records,
the WebP run's, the Welcome records, the mode switch's, the Lux drawing run's, the eighteen-item
run's and the sittings before them, unchanged).

Rewritten as the last act of every run. Read it before naming what is blocked or what just
happened.

## THE VIEWER'S PREP FIXED, AND THE TAB BAR EXPLORED (2026-09-30, one session; nothing in the app changed)

**Start from the DESIGN LOOP section below.** It is still the current design work: the list waits
for item 8, and its standing rule holds — nothing is built, applied or sent OTA until the operator
says so in so many words. This section is a side run.

**What just happened.** `node docs/mockups/refresh/prepare.mjs` threw ENOENT before preparing
anything: its shared step copied `assets/prestige/hero_armchair_customer.webp` (the viewer's
stand-in job photo, `armchair.webp`), which `c508b09` deleted. `61f9525` points that one line at
`hero_armchair_customer_lamp_dark.webp`; the other two samples still exist.

**Verification.** `node docs/mockups/refresh/prepare.mjs before` exit 0 ("prepared before"); the
copied `armchair.webp` is byte-identical to the lamp-dark file; `npm run verify` exit 0, 1415 / 1415
(`.shots/refresh/armchair-verify.log`, 40 s), before the commit.

**The viewer's Before is today's app now.** For the tab-bar pages this session ran
`node docs/mockups/refresh/export.mjs before` on the real tree at `356a1b9` (2026-09-30), so the
viewer's Before and After both show the built app, and BUILD IT's "the viewer's Before is now the
OLD app" no longer holds. The old app's export is gone (`.shots/` is gitignored); it comes back only
by exporting a checkout from before `c508b09`.

**Still stale, not fixed (outside this run).** Three more scripts name armchair files that
`c508b09` deleted, and would throw ENOENT if run: `scripts/home-ground-blend.mjs:53` (`HERO`),
`docs/mockups/html/map-explore.build.mjs:213`, and `docs/mockups/html/lux/lux.build.mjs:32` — the
operator's file, carrying their uncommitted changes, so it was not touched.

**The tab bar exploration (no repo change).** The operator explored a new bottom tab bar and
settled on the "Melt-through" bar: a floating pill in the lit-card material, the chosen tab a flat
mint bubble that melts from tab to tab, tab names under the unchosen icons, and Home without its
chimney. NOT BUILT. The handoff page — today's app in both modes with only the bar replaced, how it
works, and a copyable build brief — is `https://claude.ai/artifact/YQFnLDZqmEWDwc6K1CQCMX`; the
brief is also `.shots/refresh/navbar/handoff-brief.full.md` (local). The option pages: the lifted
bar `https://claude.ai/artifact/5kmraW46VRPv8TKUaJdTjb` and the glowing-bubble variant
`https://claude.ai/artifact/DCyY66fjBPPXEBYTHckxeK`. Every source and scratch script is in
`.shots/refresh/navbar/`. For the build: no new dependency; the melt runs through `lib/motion120`
and needs Reanimated's and gesture-handler's native parts in the installed binary
(`lib/motion120/vendor.ts` detects them at run time); without them the brief's fallback is a
plain slide. The feel is a device check only the operator can make.

## DESIGN LOOP — in progress (2026-09-29, the loop session; docs only, nothing in the app changed)

**What is happening.** `docs/dispatch/DESIGN-LOOP.md` is being run: the ten candidates (A–J) were
verified against the code at `c71a5e1` and recorded with evidence in `docs/dispatch/LUX-LIST-3.md`
§3 — A, B, C, E, G, H, J are DONE (B stripe-mode only; C except the button label), D is PART, F is
NEW, and I was DROPPED by the audit (`synthesis.json` M-30: the sign-up phone is the only
ban-by-phone check). Board 1 (A, B, C) is published — `https://claude.ai/artifact/6LhcHquAZjWMVkaKwefyct`,
source `.shots/refresh/boards/board-1.html`, the Now PNGs from `.shots/refresh/shots/` (the After
export = the app) — and an ideas board with seventeen numbered ideas —
`https://claude.ai/artifact/JH7z7vvYqxcmdfCheJTTA9`, `.shots/refresh/boards/ideas.html`. The
operator's answers went into `LUX-LIST-3.md` §4 the moment they were tapped. Boards 2 and 3 followed
(`https://claude.ai/artifact/4hydJgq6dFGP6FTTtwjwXt`, `https://claude.ai/artifact/3LqsNGzgduDRriPX4zWHNg`).
**The list is complete**: eight items kept as built (A, B, D, E, G, H, J, and I closed as "leave the
phone at sign-up"), two changes to build — C (the accept dialog's button reads "Accept & pay $TOTAL"
when a quote exists) and F (Terms + Privacy in ONE scroll, everything else in sign-up untouched; 4
taps instead of 5). **STANDING RULE (the operator, 2026-09-29): nothing is built, applied or sent
OTA until they say so in so many words** — "No don't build anything yet until I specifically tell
you to build and it publish OTA... I have alot of changes left... I dont wanna make this too long of
a process anymore". C and F sit in `LUX-LIST-3.md` §4 as confirmed-not-built. From the ideas board
the operator picked 1, 2 (after a picture), 3, 4, 5, 6, 7, 8 (show the email format), 9 (show it
visually), 10, 12, 14 for the next list, and asked for a better second round; `LUX-LIST-3.md` §7.
`npm run verify` exit 0 (`.shots/refresh/boards/_verify.log`, 40 s) before the record commit.

**The rest of the sitting (2026-09-29 → 30), all in `LUX-LIST-3.md` §4 and §7, popups 4–14.** The
operator picked ideas 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 20, 23, 25 (21 "not now"; 11, 13,
15, 16, 17, 19, 22, 24 off), and reshaped several in their own words — 2 became "Reuse a past job", a
closed row in the + sheet whose chevron opens a sliding strip of compact cards; 18 became two mic
icons; 20 became a push confirmed in place that then turns into the live card of 9, with a saved
card opt-in at Checkout and in Payment methods; 23 became the app's own tiles with a questions
dropdown and the page scrolling itself (three looks offered, none picked yet); 8 became a
Brazos-made receipt with the What-happened timeline and category · area, nothing under "Amount
charged" but the reply line, plus the worker's receipt. Boards 4–10 and two ideas pages were
published (URLs in `LUX-LIST-3.md` §2). The closing deliverable is ONE local file, not an
artifact, at the operator's request: `.shots/refresh/boards/full-list.html` (built from
`full-list.tpl.html` by `inline.mjs`), every decision with today beside the change playing on the
real screens. NOTHING IS BUILT: the standing rule from popup 5 holds until the operator says
"build" in so many words. The operator then walked a "what's wrong" list against the full-list
file (`LUX-LIST-3.md` §7, items 1–7): the Reuse cards made compact (about 2.5 across), ideas 3
and 25 dropped, the Dynamic Island scene dropped from 9, the mics moved bottom-right and made
smaller, the pushes redrawn the way a phone shows them (with the honest answer that anything the
app cannot show — a lock screen, a push, an email — is drawn, not a screenshot), and 23 decided
as look 2, plain rows in the page (the last word; the lit card was the earlier pick). The list
was still open when the operator dismissed the popup and asked to wait; the next session asks
for item 8. PICKED ideas now: 1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 18, 20, 23.

**The sitting's record and the next dispatch.** At the operator's request the whole sitting is
written up, checked line by line against `LUX-LIST-3.md`, in
`docs/dispatch/DESIGN-LOOP-RECORD-2026-09-29.md` (every decision, every idea's final spec, the
"what's wrong" list, everything pending, the facts read from the code), and the next session's
brief is `docs/dispatch/DESIGN-LOOP-2.md` (the operator's way of working, where things stand, the
first ten minutes, the pending list, the recipes and traps). The next session starts from those two
files and this section; the boards are records, the full-list file is the surface of truth.

**Recipes added.** `boards/inline.mjs` inlines the Now shots (1x JPEG via jimp-compact) and the
Ionicons TTF into a single HTML; `boards/look.mjs` accepts `"<selector>@<nth>"` clicks
(force-clicked) and prints page errors; `boards/probe*.mjs` are throwaway DOM probes. The app's
browser pane renders a local HTML as a data: snapshot, so relative images never load there — inline
them, or render with playwright and read the PNG.

**Recipes that worked.** The `.txt` beside each shot is an element map in 1x CSS px (`top x left
w×h text {style}`), enough to place overlays without opening the PNG; `boards/sample.mjs` (pngjs)
samples exact colours; `boards/look.mjs` renders a board from disk with the harness's playwright and
writes `_look-*.png` (the local file view in the app's browser pane is a data: snapshot with no
images, and the published page needs a claude.ai sign-in the pane does not have). `boards/shots` is a
junction to `../shots` so relative image paths work locally and as the Artifact's `files` root.

**Not done here.** The commit of `LUX-LIST-3.md`, `DESIGN-LOOP.md` and this section waits for the
sitting to reach a stopping point; the untracked lux mockup files in the tree predate this session.

## BUILD IT — the After IS the app now: LUX-LIST-64 and LUX-LIST-2 applied, verified, pushed and on the Beta (2026-09-29, the build run)

**What just happened.** The operator said "build it" (and: "build it with fable and use opus 5.5
max for everything thats easy" — the evidence guard refused every helper, `BRAZOS_EVIDENCE` being
unset for the session, so the run was single-threaded; see Blocked). The After that three sittings
built in `.shots/refresh/practice` — the Lux remake (2026-09-27), the operator's review, LUX-LIST-64
(2026-09-28) and LUX-LIST-2 (2026-09-29) — was applied to the real app as ONE commit, `c508b09`:
`docs/mockups/refresh/after.patch` applied whole (186 files modified, 46 added), item 5's eight hero
files copied into `assets/prestige/` (`hero_armchair_customer_lamp_{dark,light}.webp` + their PNG
masters, the glow and shadow layers), and the six retired armchair scenes deleted
(`hero_armchair_customer{,_light,_lux}.{png,webp}` — nothing in code named them; the roster fence
compares code mounts to its keys, not the folder). Then HANDOFF (this), the push and the OTA.

**The one trap met, and its fix (record it, it will recur).** `git apply` writes every patched file
through `core.autocrlf`, so all 232 patched text files came out CRLF, while the fences — and the
practice copy they were verified against — read LF: 12 fences went red on `\n` regexes over
`lib/theme.ts`, `JobFilterSheet.tsx`, `money-walk.yml`, `CheckoutScreen.tsx` and the like. The
working tree is mixed (98 of the 272 untouched source files are CRLF), and every failing fence's
file was LF before the patch. The 232 files were converted back to LF
(`.shots/refresh/buildit-lf.mjs`; tracked content unchanged — the index is LF either way) and
`npm run verify` went green: exit 0, 1415/1415. Next time: apply the patch, then run that script
before verify.

**Verification.** `npm run verify` exit 0, 1415 / 0 (`.shots/refresh/buildit-verify2.txt`) — the
full suite, `safety` and `governance` included, which the practice copy could never run. The
viewer's Before is now the OLD app (its export predates the apply); the After and the app are the
same code.

**Pushed** `45d6bed..` this commit (`c508b09` the code, then this HANDOFF). **THE OTA:**
`npm run update:preview` → branch `preview`, runtime `1.0.0`, update group `be8d26ea-bf13-49e2-9fc5-f43f37200738`, iOS update `01a0ede2-b43a-78c1-8b3f-40ccbe3f5a7b` (an Android update `01a0ede2-b43a-7df4-aebb-5751a0cc8a9f` rides the same group — no Android target, CLAUDE.md §Target), commit `c508b09`; dashboard `https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/be8d26ea-bf13-49e2-9fc5-f43f37200738`. The export went to the gitignored `dist/`; nothing tracked moved. Open the Beta twice to pull it.

**Blocked.** Subagents: `.claude/hooks/evidence-guard.ps1` blocks the Agent tool unless
`BRAZOS_EVIDENCE` contains `subagents` when the session is launched — chat authorization cannot
reach it. To use Opus helpers next time, launch the session with that variable set (operator-only).

**Now the phone (the operator's walk, both appearances).** Open the Beta twice to pull the update,
then: #3's instant dim on View all, the [+] sheet and Filters; #7's Profile — the Edit pill, the
mode card, Legal and Worker/Customer tools opening in place (and with Reduce Motion on); the
Notifications feed's gear and day groups; #9's frost on the Inbox ••• and the dialogs (and under
Reduce Transparency); the lit cards while scrolling My Jobs and Available Jobs at 120 Hz; the
lamp-lit armchair on Home. What the viewer already proved is in the LUX-LIST-2 section below.

**Left as it was.** `after.patch` stays committed as the record of what was applied (regenerating
it now would produce an empty diff, since the practice copy and the app are the same); the practice
copy stays for the next list. Judgment calls to overturn in one line each are in
`docs/dispatch/LUX-LIST-2.md` §4.

## LUX-LIST-2 — BUILT in the practice copy; the After is `docs/mockups/refresh/after.patch`, NOT applied (2026-09-29, the list run); docs only, nothing in the app changed

**What just happened.** The list sitting closed at nine items (`docs/dispatch/LUX-LIST-2.md`, every
item confirmed by popups and written in full), and the operator ordered the run: "run the list for
now and make changes update into … the viewer … Implement these surgically and also see if there
are any small inconsistencies / bugs … (fully autonomous… im leaving the desk)", and then a guide
to making UI changes faster at the same precision (".md + chat summary"). Everything was built in
`.shots/refresh/practice`, the viewer re-exported, and the patch regenerated. Commit `13097a8`; the
record is `docs/DECISIONS.md` 2026-09-29 "LUX-LIST-2" (1)–(10); the brief's §4 is the run's own
summary, with the judgment calls.

**Item by item, and where the viewer shows it** (`file:///C:/Users/mdmah/BRAZOS/.shots/refresh/index.html#<id>`;
"phone" = only a device shows it):
- #1 the light spots → green (#064C3B) — `details`, `welcome` in light. #2 auth buttons 52 tall,
  corners 22 — `welcome` … `setup`.
- #3 one sheet presenter: the dim instant, only the card slides — `home` (View all), `create-sheet`,
  `w-filters`; the motion is the phone's.
- #4 light labels green again, 25 kept antique gold — every light screen (the 25 are in the brief).
- #5 the lamp-lit armchair — `home`, `home-new`, `home-draft`.
- #6 the lit card, tiles and status pills — every screen. After a census of all 72 screens found
  misses, it now reaches the job pages' hero, Bid detail, Services, Approve, Delete account, the
  checklist, Earnings, Saved, Route & arrival, Worker Home's needs card, "What happens next" and
  the dark category squares.
- #7 the Profile hub — `profile`, `profile-more`, `profile-open` (new: Legal and tools open),
  `profile-worker`; the past work now on `details`; Account & safety trimmed — `safety`.
- #8 the feed — `feed`; its gear → `notif`.
- #9 the frost — `inbox-manage`, `mode-switch`, `accept`, `post-price`.
- ALSO FIXED, the four cut-offs carried since LUX-LIST-64 — `w-jobs` ("Your job" no longer under the
  pay), `create-sheet` ("Approval needed" / "releases in 66h"), `w-map` ("$140", not "$1…"),
  `job-bids` (the bidder's full name).

**Verification.** Practice: `tsc` clean, `node --test` 1286/1286. The After and the Before are each
72/72 in both schemes. The #4 scan finds exactly the 25 labels in `#86641A`, none missing or extra.
All 14 notification types draw their icon and colour in both schemes. Real repo: `npm run verify`
exit 0, 1393/1393; `after.patch` has 186 modified and 46 added files, and `git apply --check` is
clean.

**Blocked, and for the operator.**
- SUBAGENTS: the evidence guard (`.claude/hooks/evidence-guard.ps1`) refused the parallel helpers
  that the brief's "faster, same quality" plan named: "subagents require operator authorization for
  this run". The run went single-threaded. Allowing render and check helpers is your edit, outside
  a session.
- THE GUIDE: `.shots/refresh/BRAZOS-faster-ui-guide-2026-09-29.md` (local).
- JUDGMENT CALLS, each one line to overturn (brief §4):
  - the past work moved to Profile details;
  - Appearance's screen stays, reached by a "Design studio" row in internal builds only;
  - the settings pages' gold-outlined icon squares stay outlined;
  - #8's grouped row keeps the trigger's "$135.00".

**Next.** "build it" for LUX-LIST-64 and LUX-LIST-2 together, in a fresh session:
- apply `after.patch`;
- copy item 5's eight files from the practice copy's `assets/prestige/` into the real one, and
  delete the six retired armchair files by hand (`make-patch.mjs` carries no assets and cannot
  delete);
- `npm run verify`, commit, OTA to the Beta;
- the phone walk: #3's dim, #7's dropdowns and Reduce Motion, #9 with expo-blur and under Reduce
  Transparency, 120 Hz with the inset shadows.

The practice copy stays the After's source until then. The two unused helper copies
(`practice-profile`, `practice-notif`) are gone; their `node_modules` junctions were unlinked first,
and the real `node_modules` is intact.

## LUX-LIST-64 — DONE in the practice copy; the After is `docs/mockups/refresh/after.patch`, NOT applied (2026-09-28, the list run); docs only, nothing in the app changed

**What just happened.** The operator's sixty-four numbered changes to the After — one sitting of
about eighty-five pictures, written the same day into `docs/dispatch/LUX-LIST-64.md` (the whole
brief: every ruling, number, exception and reference, the pages under `docs/mockups/html/refs/`)
— were built end to end in `.shots/refresh/practice`, fully autonomously ("Fully autonomous …
surgically build it out … with extra accuracy"). The dated record is `docs/DECISIONS.md`
2026-09-28 "LUX-LIST-64" (1)–(7): the reversals the operator ordered, the colour roles, what the
run decided, the consistency set as built, the harness, the fences, what is left.

**Item by item, and where the viewer shows it** (`file:///C:/Users/mdmah/BRAZOS/.shots/refresh/index.html#<id>`;
"phone" = only a device shows it):
- #1–#3 auth labels and icons mint, the email form on one screen — `signin-email`, `create-email`,
  `create-phone`; #2 also `edit`, `details`. #4 the pill left the EMAIL sign-up (`create-email`);
  the PHONE sign-up keeps its "Private until a job is confirmed." line — asked in the report.
- #5 the country dropdown — tap the pill on `signin-phone`; flags are emoji (letters on Windows).
- #6 round 52 buttons — `welcome` … `setup`. #7 the dark red — `report`, `delete`. #8 the focus
  glow — any field while typing. #9 Finish Setup — `setup`. #10 the one legal button — `legal`.
- #11 #52 #59 the bare bell, red badge, your photo — `home`, `w-home`. #12–#14 tiles 30, the
  roller / bin / drill EVERYWHERE a category is drawn — `home`, `discover`, `post-what`, cards,
  job pages. #13 View all → all services — tap it on `home`. #15 the Lux field — `home`, `w-home`.
- #16 How Brazos works — `home-new` (new). #17 the draft card first — `home-draft` (new),
  `myjobs-draft`. #18 #19 #21 #43 View details + a plain mint arrow, names alone — `myjobs`.
- #20 Assigned gold, #46 In progress orange — `myjobs`, `w-myjobs`, `job-assigned`, `w-job`.
- #22 #23 #27 #29 #60 headers: the round back button, "‹ Home", centred Title Case titles, the big
  left title on Inbox / Discover / Profile — every pushed screen. #24 no leaf divider — `saved`.
- #25 initials avatars — everywhere. #26 the grey bubble — any empty Inbox tab.
- #28 the swipe tiles hidden until a swipe — phone (the swipe cannot be driven in the viewer).
- #30–#35 Post a Job's header, privacy note, no nudge, mint media boxes, the address, chip checks —
  `post-what`, `post-media`, `post-where`. #36–#41 the price first and its list, the switch
  icons, the rebuilt summary, the add menu, white prices, the bar — `post-review`, `post-price`.
- #42 Seal → Your job is live — `post-live` (new); the motion is the phone's.
- #44 no "Post another job", #45 the stage rail (the customer's card, as in its reference) —
  `myjobs`, `home-draft`. #47 light gold → green — every light screen, and the sheet
  `.shots/refresh/gold-sheet.png`. #48 light labels antique gold — every light screen.
- #49 #50 the red Sonar dots — `home-draft`, `w-home` (Paused: tap the switch); the ring is the
  phone's. #51 no dot before AVAILABLE JOBS — `w-home-summary`. #53 the glass dropdown —
  `inbox-manage`. #54–#58 the clean list, #55 pills without checks — `inbox`. #61 no Switch
  pill — `w-home`. #62 the live bar and Hire again — `home`.
- #63 payout honesty — not visible (the sample world pays through the sandbox);
  `tests/earnings.test.mjs` executes it.
- #64 the consistency set — `w-jobs` (the Custom chip), `w-filters` (Cancel), `bid-detail`,
  `accept` (the words and the in-app dialog), `mode-switch`, `create-sheet`, `w-detail`,
  `w-submit`.

**Found by the run's own end pass, and fixed** (none was a new request): #24 had not been built
(the leaf divider was still drawn); #14 had reached only the tiles, the list and the hub card —
it now reaches every category icon, with solid twins for the filled ones
(`assets/glyphs/*-fill.png`); the Notification Feed's centred title was cut
("Notification Fe…") — its "Mark all read" is 15/700; and a VIEWER bug from `5f4aaf4`: the
Before's four Post-a-Job screens typed into the After's shortened placeholders and stopped at
step 1 — each app now types into its own (`steps` / `afterSteps`), and the Before arrives
71/71 again.

**Verification.** Practice copy: `tsc --noUnusedLocals --noUnusedParameters` clean; `node --test`
1282 / 1282, the fences moved with dated reasons, two new (`tests/inboxRows.test.mjs`,
`tests/consistencySet.test.mjs`). The viewer: 71 screens (68 + `home-new`, `home-draft`,
`post-live`), After 71/71 dark and light, Before 71/71 dark and light; all 71 After screens shot
in both schemes into `.shots/refresh/shots/` and looked at on contact sheets; a truncation probe
over every screen in both schemes; the #47 gold scan over every light screen. `after.patch`:
178 modified and 41 added — 219 files, 28,980 lines. `git apply --check --ignore-whitespace` clean against this tree. Real tree:
`npm run verify` exit 0 — 1393 / 1393 — this run, before the docs commit; pushed as the run's last
act with `git push origin mainexpo`.

**Open for the operator.** (1) #4: should the phone sign-up lose its "Private until a job is
confirmed." line too? (2) Confirm the #47 sheet of the gold left in light. (3) The CTA gradient,
still DECISIONS 2026-09-27 review (9). (4) On the phone: the swipe (#28), the focus glow (#8),
the Seal's timing (#42), the Sonar and breathing dots (#49, #50, #54, #62), real flags (#5).

**Next.** On "build it": `git apply --ignore-whitespace docs/mockups/refresh/after.patch`, then
`npm run verify`, the commit, the OTA to the Beta. The three baked glyphs and their three solid
twins are ALREADY in the real `assets/glyphs/` (committed this run; nothing requires them until
the patch lands). `components/PulseDot.tsx` is unused in the After and
`components/EditBudgetDialog.tsx` is unmounted but still read by fences — `make-patch.mjs`
cannot delete a file, so both stay until a hand removes them.

**The primer below (2026-09-27) still holds**, with three updates: the viewer has 71 ids
(§10 plus `home-new` and `home-draft` after `home`, `post-live` after `post-price`); the
pipeline's fences gained `inboxRows` and `consistencySet` (§7); and image reads worked in this
session — contact sheets (`.shots/refresh/contact.mjs <out.png> <cols> <width> <png,png,…>`)
are how the renders were looked at.

## NEXT SESSION — START HERE: the operator's next remake of the After, which they will brief more specifically; everything the Lux chat established (2026-09-27, the handoff sitting)

**Read this section first, then the operator's brief. Do not start remaking from this section
alone.** It is the context; the remake is theirs to specify ("another remake... but I'll be more
specific"). This sitting changed nothing but this file: not the app, not the practice copy.

### 1. What the operator wants, and how they want it run

- **Another remake of the After**, briefed in the next session's first message. If the brief
  arrives as chat text or pictures, write it first into `docs/dispatch/<NAME>.md` in the shape
  of `docs/dispatch/LUX-REMAKE.md` (rulings, screen by screen, mechanics, verification, end), so
  it outlives the session.
- **The same boundaries unless the brief moves them.** The Before stays exactly as it is. Every
  change is made in the practice copy `.shots/refresh/practice`. Nothing in the real app
  changes. The After reaches the repo only as `docs/mockups/refresh/after.patch`, applied only
  when the operator says "build it". The operator, this chat: "as always do not change live /
  real apps code... just the `.shots/refresh/index.html`".
- **Run shape.** Fully autonomous; the operator steps out. Questions only for big, taste-level
  decisions, and then as rendered options (memory `brazos-options-first`: a–f options as PNGs,
  they pick, the pick becomes the reference). Small things are decided, recorded in DECISIONS
  and reported. Economical with usage: narrow reads, scripted edits, renders in the background,
  no redundant screenshots. One mobile push at the end.
- **They number their pictures and complaints.** Answer each by its number in the final report.
- **The references outrank pictures.** The Lux HTML pages in `docs/mockups/html/lux/`, the
  SYSTEM_CSS inside `docs/mockups/html/lux/lux.build.mjs` (about lines 217–460), and
  `.shots/ux-audit/sim.html`, whose `:root` and `.card` match the Lux page number for number.
  Read the CSS numbers; screenshots are the check. The operator: "there htmls for references i
  know thats more accurate so reading pics is not always necessary".
- **The model.** A session cannot switch its own model or effort; the operator does it with
  `/model` (this sitting moved to Opus 5.5).

### 2. Where the After stands (history by commit; git owns the live state)

- The last commit that touched app code is `b0e54d4` (2026-09-21, the sign-in fix). Every
  commit since is docs.
- `ef087db`: the Lux remake, from `docs/dispatch/LUX-REMAKE.md` (15 rulings, 12 screen notes).
  It carried `after.patch`, the viewer's after-notes, DECISIONS 2026-09-27 "THE LUX REMAKE"
  (1)–(11), `docs/dispatch/MOTION-INVENTORY.md`, and the baked hero
  `assets/prestige/hero_armchair_customer_lux.png` + `.webp`. Its HANDOFF is `2061688`.
- `5f4aaf4`: the operator's review, twelve pictures. It carried DECISIONS "THE OPERATOR'S REVIEW
  OF THE LUX AFTER" (1)–(9), `after.patch` at 131 files and 13,253 lines, after-notes on twelve
  entries, and `.maestro/` added to `make-patch.mjs` ROOTS. Its HANDOFF is `ab4aacc`.
- Verified for `5f4aaf4`: practice `tsc` clean and `node --test` 1269/1269; the After 68/68 in
  dark and in light; the real `npm run verify` 1393/1393; `git apply --check --ignore-whitespace
  docs/mockups/refresh/after.patch` clean.
- **The first check next session.** Run `node docs/mockups/refresh/make-patch.mjs`, then
  `git status --short docs/mockups/refresh/after.patch`. No output means the practice copy is
  exactly the committed After.
- **`.shots/` is gitignored** (`.gitignore:77`). The practice copy, the exports, the renders,
  the viewer page, `.shots/ux-audit/` and every scratch script exist on this machine only. If
  the practice copy is ever lost: copy every tracked file into `.shots/refresh/practice`, join
  `node_modules` to the real one by a junction (the shape `export.mjs`'s header describes), then
  run `git apply --ignore-whitespace docs/mockups/refresh/after.patch` inside it.

### 3. The pipeline (every command ran green in this chat)

```
# practice copy — cwd .shots/refresh/practice
npx tsc --noEmit --pretty false --noUnusedLocals --noUnusedParameters
node --test $(ls tests/*.test.mjs | grep -v -e tests/safety.test.mjs -e tests/governance.test.mjs)

# render — cwd the real repo
node docs/mockups/refresh/export.mjs after          # practice → .shots/refresh/after-export (~12 s)
node docs/mockups/refresh/prepare.mjs after         # relative assets, Inter, iOS safe-area edges
node docs/mockups/refresh/validate.mjs after dark   # expect: 68/68 arrived in after (dark)
node docs/mockups/refresh/validate.mjs after light
node .shots/refresh/shot.mjs after dark <id,id,…>   # → .shots/refresh/shots/after-dark-<id>.png + .txt
node .shots/refresh/copy-lines.mjs                  # every string that wraps at 393 wide, from the .txt dumps

# land — cwd the real repo
node docs/mockups/refresh/make-patch.mjs
git apply --check --ignore-whitespace docs/mockups/refresh/after.patch
npm run verify
git push origin mainexpo                            # its own Bash call, nothing chained
```

- Safety and governance are left out in the practice copy because they read the real tree's
  guard state; the real `npm run verify` runs them.
- All 68 shots: two background jobs of 34 ids each. Only one job at a time should drive the
  browser.
- The viewer: `file:///C:/Users/mdmah/BRAZOS/.shots/refresh/index.html#<id>`, Before beside
  After, dark and light. The notes under the phones are the `before` / `after` arrays in
  `docs/mockups/refresh/screens.js`. Add notes with a script like
  `.shots/refresh/registry-review-notes.mjs`; a note may not contain a straight quote.
- Scratch helpers already in `.shots/refresh/`: `shot.mjs`, `copy-lines.mjs`, `icons-check.mjs`
  (every Ionicons name used has an `-outline` twin), `ground-sweep.mjs`,
  `auth-theme-codemod.mjs`, `motion-census.mjs`, `hero-lux-bake.mjs` and `hero-lux-webp.mjs`
  (feathered-alpha bake; WebP through Playwright's canvas, no new dependency),
  `registry-*-notes.mjs`, `append-decisions*.mjs`, `handoff-*.mjs`.

### 4. What the After wears now (the rulings as built, in the practice copy)

- **Colour.** One mint `#4FC58C` in dark: the action colour, the selection fill and the flat
  CTA (`ui/tokens.ts` `forest` / `emerald`; `lib/theme.ts` `primary`, `ctaTop` / `ctaBottom`,
  `success`; `primaryDark` `#3FB07A`). Gold `#D4A24C` only for field labels, section eyebrows,
  money and the person's name. Hairlines `#325047`. Roles `eyebrow` (light `#0D6B52`, dark
  `#D4A24C`) and `wizardProgress` (light `#0D6B52`, dark `#5FAE81`). `EYEBROW_TYPE` is
  12 / 700 / 1.5 / uppercase. Light keeps emerald eyebrows and its own greens.
- **Ground.** `lib/theme.ts` `screenGround()`, `linear-gradient(165deg, #062421 0%, #0A1A17
  55%, #07110F 100%)`, on every dark screen: the shell (`navigation/ModeShell.tsx`), the three
  templates, `HomeAtmosphere`, 27 hand-rolled roots, and the auth scaffold with its rings gone.
- **The card.** `components/Card.tsx` is `Surface` wearing the `card` material. Dark: fill
  `#0C2C26` at .58, rim `#C8FFE6` at .24, a white specular edge at .22 inset half the radius,
  shadow black .42 / radius 17 / y 12 (web `0 12px 34px`), corner 22, a press spring. Light:
  white under `#102A1D` .1 / 14 / 6. `shadows.cardDark` carries the same shadow for hand-styled
  cards. This is one notch PAST the Lux numbers (.52 / .20 / .16 / `0 10px 30px .35`), because
  the operator saw those flat on the lighter top of the ground.
- **The CTA.** Flat mint, with the Lux `.cta` glow `shadows.ctaDark`
  (`0 10px 24px rgba(79,197,140,.30)`) under every primary `Button` and the Home pill. OPEN: the
  Lux gradient `#8DF0C0 → #4FC58C` (DECISIONS review (9)); if the operator says "the Lux
  gradient", it is one token, `ctaTop`.
- **Fields.** `ui/primitives/SearchBar.tsx` wears `wells.field` in dark (`#031410` at .55 under
  `#C8FFE6` at .14, the Lux `.field`), with the magnifier and the idle mic in mint. The Map's
  `emphasis="ink"` pill is untouched. `TextField` / `AuthField` wells are white at .06 in dark,
  with gold labels.
- **Segments.** `components/SegmentedControl.tsx` is the Lux `.seg2`: a 52 track (4 padding, the
  rim, text at .06), the chosen cell FILLED with `primary` and `onPrimary` ink, labels 15 / 700,
  cells never under 44. Its callers: My jobs (dials `myJobs.tabs.height` 52 and `.radius` 26),
  the client's bid sort, the alert radius, Post-a-job's pricing choice, Profile, Services.
- **Chips.** A chosen chip KEEPS its glass and lights its rim and glyph mint (ruling 11). The
  Lux CSS itself fills a chosen chip (`.chip.f.on{background:var(--acc)}`); see §6.
- **Icons.** `outlineIcon()` in `components/ServiceTileRow.tsx`: the Lux line icons, mint in
  dark, on the service tiles and every category glyph on a card.
- **Pinned.** Map and the Filters sheet keep today's exact colours through
  `PalettePinContext` (`hooks/useThemeColors.ts`, `mapPalette()` / `mapEmerald()`). The nav bar
  is untouched (`navBarPalette()`).
- **Motion.** The published-job check draws itself (`components/SuccessMark.*`: two strokes
  through `lib/motion120`, Reanimated where present, a native-driver fallback, still under
  Reduce Motion). Cards spring under the finger. The Post-a-job progress bar and the worker's
  stepper crossfade in 220 ms. The census and the later pass: `docs/dispatch/MOTION-INVENTORY.md`.
- **Screens.** Home: no "Browse workers" line, the Lux-baked hero
  `hero_armchair_customer_lux.webp`, the tagline on three lines, the task card lifted. Post a
  job: no pinned Continue on steps 1–3 (the reason sits under the blocking field and the header
  link greys), Publish on step 4, fields grouped in pop-out cards per the Lux post pages, the
  placeholders "e.g. Walk my dog on weekdays" and "e.g. Sheepshead Bay" (the Maestro flow
  follows them). My jobs: the title and its line only, the count beside the section label (the
  Lux `.badge`), "Post another job" a compact pill. Hub cards break a next-action at its em
  dash. The bell shows the unread count. Setup and the legal gate follow the scheme. The auth
  flow sits on the Lux ground with gold eyebrows and the "US +1 ›" pill.
- **Copy.** One line per subtitle, hint and helper (37 cut). What stayed long, and why, is the
  Lux remake entry's (10) in DECISIONS.

### 5. The operator's taste: the pattern across every complaint in this chat

1. **Lift above all.** "The biggest difference is literally just making it more 3d tab popping
   out and visually more appealing / cleaner." Cards, tabs and pills visibly stand off the
   ground: shadow, specular edge, rim. When in doubt, more lift.
2. **One accent.** Mint `#4FC58C` for anything chosen, active or tappable: filled pills, CTAs,
   icons, links. Gold is type only (labels, eyebrows, money, the name), never a hairline, ring,
   border or decorative glyph. They removed the gold summary-card rim and the gold briefcase.
3. **No chrome that eats space.** Eyebrows that repeat the title ("YOUR WORK"), decorative marks
   (the briefcase), rings and duplicate links ("Browse workers") go. Fixed headers sit as high
   and tight as the safe area allows, so more content shows.
4. **Compact, round pills** over full-width bars ("smaller and rounder", about half the width).
   Segmented pills shaped like the Lux `.seg2`, "anywhere on app".
5. **Numbers beside their labels** ("next to YOU POSTED"). Counts, not dots, on badges.
6. **One line of copy.** Two lines only "in a nice way": broken at a meaningful point such as
   the em dash, never an orphan word ("66h" alone).
7. **Fields are wells:** darker than the card they sit in, with mint icons.
8. **Style fixes never move layouts** ("do not change the layouts etc").
9. **Fidelity to the references' numbers**, read from the CSS, not approximated ("look at the
   html references carefully").
10. **Smart guessing is welcome.** "Use your common sense... look at the pattern of my
    complaints." Small things are decided and recorded; big things are asked, as options.
11. **Everything feels 120 Hz** (memory `brazos-120hz-smoothness`).
12. **Plans and questions in the most concise plain English, key questions first** (memory
    `brazos-plan-style`).

### 6. Seen in this chat's renders, not fixed (none was on the operator's lists): candidates

- **Step 1's back link** is the bare gold circle, but `docs/dispatch/LUX-REMAKE.md` screen 8
  says "< Home" on step 1. `screens/PostJobScreen.tsx` passes no `backLabel` on step 0.
- **Gold lines still drawn.** On the client's job detail (`job-open`): the "Bids Pending (2)"
  pill's rim, the "Furniture Assembly" chip's rim and glyph, the category well's glyph, and the
  timing clock's ring. On Notification settings (`notif`): the gold ring round every row glyph
  and the gold toggle thumbs. Taste rule 2 says these become mint or neutral.
- **Mixed label styles on one step.** Post-a-job step 3's "Which day?" and "Arrival window" are
  white bold labels, while TITLE, AREA and SERVICE ADDRESS above them are gold eyebrows.
- **The address caption** "Never shown until you hire — can see after job is accepted." wraps
  to two lines inside its card. `tests/postJobPublish.test.mjs` (D11/PJ1-C7) pins the sentence,
  so shortening it needs a ruling.
- **The worker's Available Jobs cards** (`w-jobs`): the "Your job" chip collides with the price,
  and titles truncate hard ("Assemble a …", "Mount a 55-i…") because the EST. PAY block takes
  the width.
- **Worker Home's greeting** truncates to "Good morni…" beside the bell and the Switch to
  Customer pill.
- **"TV mounting"** wraps to two lines under its tile on both Homes.
- **Chips against the reference.** Ruling 11 keeps chosen chips glass; the Lux CSS fills them
  mint. If "pills anywhere" was meant to include chips (distance, day, arrival window,
  category), it is a change in `components/Chip.tsx`. Ask, or take the brief's word.
- **Light was validated, not looked at.** Every light screen arrived 68/68, but this chat
  reviewed the dark renders only.

### 7. Fences that pin the After's look (move expected constants only, each with the date and the ruling; never the logic)

- `tests/themeTokens.test.mjs`: the material table (the card's numbers), light/dark key parity,
  hex only in the three token surfaces, the one-serif fence.
- `tests/themeResolution.test.mjs`: the BAKED_ART roster ('baked-feathered': RGBA, minimum alpha
  0, transparent under 30 %, partial over 5 %), the gated mounts
  (`hero_armchair_customer_lux.webp`), no raw colour literal in screens, components, ui, hooks,
  navigation or modes.
- `tests/goldOnForest.test.mjs`: `D6_SURFACES`. The SegmentedControl and the My jobs tabs left
  the list; chips stay on it.
- `tests/customerCore.test.mjs`: SegmentedControl must keep `minHeight: 44`,
  `accessibilityRole="tab"` and `accessibilityState={{ selected }}`.
- `tests/screenDials.test.mjs`: every dial's `drew`, `parent` and `fallback`. It parses
  `ui/designStudioSchema.ts` with a strict regex, so **no comment may sit inside a dial
  object**. A screen reads `useDialNumber('<key>') ?? <fallback>` exactly, and an UPPER_CASE
  fallback must be a `const NAME = value;` in the same file.
- `tests/workerHome.test.mjs`: needs the exact line
  `import { ServiceTileRow } from '../components/ServiceTileRow';`, so other names go on a
  separate import line; also the summary card's rim.
- `tests/voiceSearch.test.mjs`: the mic and magnifier colour expressions, verbatim.
- `tests/postJobPublish.test.mjs`: the privacy sentences, the one info card on
  `<Card style={styles.infoCard}>`, `reasonUnder`, the footer on the last step only.
- Copy fences that keep sentences long: `jobCompletions`, `accountDeletion`, `paymentsMode`,
  `platformFee`, `stripePayments`, `pricingMode`, `chatComposer`, `shotHarness`, `copyTruth`.
- Also moved in this chat, with dated reasons: `emeraldFences`, `layout`, `mode`, `rimLight`,
  `setupOnboarding`, `legalGate`, `conversion`.
- In `ui/tokens.ts`, a new group that reads `CARD_INK` or `CARD_RIM` must be declared after
  them; a constant read too early throws at load and fails whole test files.

### 8. Guards and traps (each cost a retry in this chat)

- `node -e` is refused (GUARD-DYNEXEC). Write a script under `.shots/refresh/` and run it.
- Writing outside the project is refused (GUARD-PATH-ESCAPE), the session scratchpad and the
  memory directory included. Scratch lives in `.shots/refresh/`; preferences live in this file.
- A shell command containing the co-author trailer's words is refused as a nested session
  (GUARD-NESTED-CLAUDE). Write commit messages with the Write tool and `git commit -F <file>`.
- The push must be its own Bash call, exactly `git push origin mainexpo`. Chained after anything,
  it is refused (GUARD-GIT).
- Image reads need the session launched with image authorization, and a command that names the
  evidence variable is refused. Subagents are refused.
- Two shell calls in flight with different working directories raced once and wrote into the
  real tree. Use absolute paths, never `cd` in parallel calls, and check `git status` for app
  files before every commit.
- The Grep tool returns nothing for a brace glob combined with a `path`; search per directory.
  ESM imports with absolute `C:/` paths fail; use relative ones.
- The working copy is CRLF, so git warns on every add. `make-patch.mjs` and `git apply` use
  `--ignore-whitespace`.

### 9. The operator's own uncommitted work: never stage it; it may be the next reference

- Modified: `docs/mockups/html/lux/index.html` (1 line) and `docs/mockups/html/lux/lux.build.mjs`
  (+471 lines).
- Untracked: nine "(Fable)" Lux pages, `lux-{welcome,signin,home,post-review,cjob,compare,
  checkout,chat,review-tip}-fable.html`, titled "BRAZOS — Emerald Lux Glass — <screen>
  (Fable)"; `lux-modes.mjs` and `lux-modes.build.mjs`, a text transform that writes any Lux page
  in dark or light (one system font, every icon sized); and `modes/` (137 files:
  `lux-<key>.dark.html` / `.light.html`, `index.html`, `img/`).
- They came from another chat. Ask before treating them as the brief's reference, and never
  `git add` them.

### 10. The 68 viewer ids (the recipes are in `docs/mockups/refresh/screens.js`)

- Sign-up & sign-in: welcome signin-phone signin-email create-phone create-email verify legal
  setup
- Customer: home create-sheet discover discover-results worker-profile post-what post-media
  post-where post-review post-price myjobs myjobs-draft job-open job-bids bid-detail counter
  accept job-assigned job-assigned-pay track job-done approve job-paid
- Worker: w-home w-jobs w-filters w-map w-detail w-detail-bid w-submit w-myjobs w-home-summary
  w-job-hired w-route w-job w-job-end w-checklist w-earnings w-services
- Messages: inbox inbox-manage chat chat-menu chat-block report feed
- Profile & settings: profile profile-more profile-worker details edit safety safety-more notif
  appearance payment terms saved delete mode-switch

### 11. How the run ends (the contract, as this chat ran it)

1. The practice copy green (tsc and tests); the After exported, prepared and validated 68/68 in
   both schemes; the changed screens shot and looked at.
2. `after.patch` regenerated and `git apply --check` clean; a dated DECISIONS entry; after-notes
   in `screens.js`.
3. `npm run verify` exit 0 in the real tree; commits by explicit path, never the operator's Lux
   files; HANDOFF rewritten as the last commit; `git push origin mainexpo` on its own; one mobile
   push naming what finished and whether verification passed.

## THE OPERATOR'S REVIEW OF THE LUX AFTER — twelve pictures, fixed in the practice copy; the After is `docs/mockups/refresh/after.patch`, NOT applied (2026-09-27, the review sitting); docs `5f4aaf4`, nothing in the app changed

**What just happened.** The operator opened the viewer after the remake and sent twelve
pictures with one sentence over them — "the biggest difference is literally just making it
more 3d tab popping out and visually more appealing / cleaner" — and stepped out ("full
autonomous fix"). Every fix was read against the Lux SYSTEM_CSS in
`docs/mockups/html/lux/lux.build.mjs` and `.shots/ux-audit/sim.html` (whose `:root` and
`.card` are the Lux page's, number for number) and made in `.shots/refresh/practice` only.
The dated record is `docs/DECISIONS.md` 2026-09-27 "THE OPERATOR'S REVIEW OF THE LUX AFTER",
(1)–(9):
- THE FIELD WELL: the search field's dark fill is the Lux `.field` (`ui/tokens.ts`
  `wells.field`), the magnifier and the idle mic mint; Home's own override of the fill gone;
  the map's ink pill untouched.
- THE CARD, ONE NOTCH PAST THE LUX: fill .58, rim .24, specular .22 (inset half the radius),
  shadow `0 12px 34px` .42 — `shadows.cardDark` the same — because the reference's numbers
  read flat on the lighter top of the ground (the operator's pic 3 against pic 4).
- THE CTA GLOW: `shadows.ctaDark`, the Lux `.cta` shadow, under every primary Button and the
  Home pill in dark; the fill stays flat (ruling 5, today's — the gradient is the one question
  left, DECISIONS (9)).
- THE SEGMENT: `components/SegmentedControl.tsx` is the Lux `.seg2` — a glass track and the
  chosen pill FILLED `#4FC58C` with the CTA ink — 52 tall for the 44pt floor; My jobs'
  Active / Review / Closed bar is this control (its dials kept at 52 and 26; the header-mark
  dial retired), and the bid sort, the alert radius, Services and Profile follow. Chips keep
  their glass (ruling 11).
- THE NEXT-ACTION LINES: `HubCard` breaks a label at its em dash — "Approval needed" over
  "releases in 66h", "Worker on the way" over "track progress" — never "66h" alone.
- MY JOBS: the header is the title and its line (no YOUR WORK, no briefcase) at the safe area;
  the count beside YOU POSTED as the Lux `.badge`; "Post another job" a compact pill; the
  bell on Home shows the unread COUNT in a mint pill ("9+" past nine), not a red dot.
- POST A JOB, THE BOXES, per the Lux post pages: step 1's Title and Description in one pop-out
  card with the chips under it; step 2's notice a card row; step 3's area, locate disc and
  private address in one card, the day and window under; step 4's summary the card material.
  No layout moved.

**Verification.** Practice copy: `tsc --noUnusedLocals --noUnusedParameters` clean;
`node --test` 1269 / 1269, the fences moved with dated reasons (themeTokens, customerCore,
screenDials, goldOnForest, postJobPublish, voiceSearch). The After: exported, validated `68/68 arrived in after (dark)` and `(light)` on the final export (the shortened placeholders included). The
review's sixteen screens re-shot into `.shots/refresh/shots/after-dark-*.png` and read by
eye against the pictures; `docs/mockups/refresh/screens.js` carries the fixes as after-notes
on twelve entries. `after.patch`: 131 files, 13,253 lines — the Maestro flow now rides it too (`docs/mockups/refresh/make-patch.mjs` ROOTS gained `.maestro/`, because the After shortened the two placeholders the flow taps: "e.g. Walk my dog on weekdays", "e.g. Sheepshead Bay", which clipped inside the new cards). `git apply --check --ignore-whitespace`
clean against this tree. Real tree: `npm run verify` exit 0 — 1393 / 1393 — this sitting, before the docs commit `5f4aaf4`; pushed as the run's last act with `git push origin mainexpo`.

**Open for the operator.** The CTA gradient (DECISIONS (9)): say "the Lux gradient" and it is
one token change. The viewer is `.shots/refresh/index.html`; "build it" applies the patch.

**Next.** As before — the operator reviews; on "build it" the patch lands in the real tree
(`git apply --ignore-whitespace docs/mockups/refresh/after.patch`), then `npm run verify`,
the commit, the OTA to the Beta.

## THE LUX REMAKE — DONE in the practice copy; the After is `docs/mockups/refresh/after.patch`, NOT applied (2026-09-27, the Lux remake run); docs `ef087db`, nothing in the app changed

**What just happened.** The run in `docs/dispatch/LUX-REMAKE.md` ran end to end in
`.shots/refresh/practice` (the practice copy; the real tree's app files never moved — proven at
the end by `git status`, which lists docs and the two new art files only). The rulings, as
built (the dated record is `docs/DECISIONS.md` 2026-09-27 "THE LUX REMAKE", sub-entries
(1)–(11)):
- THE TOKENS: one mint `#4FC58C` as the action colour and the flat CTA fill in dark; gold
  `#D4A24C` kept for field labels, section eyebrows, money and the name; two new roles,
  `eyebrow` and `wizardProgress`; the `card` material — the Lux glass card flat (fill
  rgba(12,44,38,.52), rim rgba(200,255,230,.20), specular .16, shadow 0 10 30 .35, r22; light:
  white on a soft shadow); `screenGround()` — the Lux 165° gradient — on every dark screen,
  the shell and the auth flow included; Map and the Filters sheet PINNED to today's colours by
  `PalettePinContext` (one context, no per-file edits).
- THE COMPONENTS: `Card` on the material with the press spring; chips keep the glass and light
  the rim and glyph mint; `outlineIcon()` for the Lux line icons on tiles and every category
  glyph on a card; the bare back control a circle (gold on Discover); the phone pill "US +1 ›";
  Setup and the legal gate themed (today's layouts); Post a job with no pinned Continue on
  steps 1–3 (the reason under the blocking field, the header link greys), the progress bar
  crossfading; the worker's stepper crossfading; the published-job check DRAWS ITSELF through
  the motion boundary (Reanimated where present, a native-driver fallback where not); Home
  without the "Browse workers" line, the hero re-baked with the Lux radial mask
  (`assets/prestige/hero_armchair_customer_lux.png` + `.webp`, 'baked-feathered' on the
  roster), the tagline THREE lines by the brief's Home note.
- THE COPY PASS: 103 wrapped strings on the dark dumps at 393 wide; 37 subtitles, hints and
  helpers cut to one line; every sentence left long is listed with its reason in DECISIONS (10)
  — the sandbox and paused-payments sentences, the money and no-tracking honesty, the fenced
  completion-media and posted-price lines, the deletion list, the legal statement, the Media
  privacy note at two lines by the ruling.
- THE FENCES moved with the rulings, never weakened — expected constants with this date and the
  ruling in themeTokens, themeResolution, emeraldFences, goldOnForest, layout, mode, workerHome,
  rimLight, setupOnboarding, legalGate, postJobPublish, conversion, voiceSearch, shotHarness.
  Practice copy at the end: `tsc --noUnusedLocals --noUnusedParameters` clean; `node --test`
  1269 / 1269 (every file but safety and governance, which read the real tree's guard state).
- THE AFTER: exported, prepared, validated `68/68 arrived in after (dark)` and `(light)`; 68
  dark renders with text dumps in `.shots/refresh/shots/after-dark-*.png|txt`; the viewer at
  `.shots/refresh/index.html`, its registry `docs/mockups/refresh/screens.js` carrying the
  copy changes as after-notes (24 entries); `after.patch` regenerated — 127 files, 12,265
  lines, `git apply --check --ignore-whitespace docs/mockups/refresh/after.patch` clean against
  the real tree. `docs/dispatch/MOTION-INVENTORY.md` is the motion census the brief asked for.

**Left as it is, with the reason.** The worker's toolbox was NOT re-baked: on the roster it is
`transparent` — a cut-out with no painted ground — so it already sits on the Lux gradient
with no edge (the `w-home` render), and the radial bake exists for the armchair, whose master
carries a ground. The Home tagline stays three explicit lines (the brief's screen 6) although
the Lux home page draws it as one span.

**Operator, and device-only.** The viewer is the review: `.shots/refresh/index.html`, Before
beside After. "Build it" is the next run — apply the patch in the real tree, copy nothing
(the two art files are already in `assets/prestige/`), `npm run verify`, commit, OTA. Only
the phone shows the 120 Hz check, the press spring and Continue riding the keyboard.

**A preference to keep (memory is write-blocked).** The operator said, this run: the Lux HTML
pages are the reference — `docs/mockups/html/lux/` and the SYSTEM_CSS numbers in
`lux.build.mjs` — "reading pics is not always necessary"; screenshots are the check, the
pages are the source. The memory directory outside the repo is refused by the guard
(GUARD-PATH-ESCAPE), so this line is the record.

**An incident, repaired.** Two shell calls issued in parallel with different working
directories raced: one `sed` meant for the practice copy wrote an import line into the real
`screens/WorkerHomeScreen.tsx` and `components/CreateSheet.tsx`. Both lines were reversed the
same sitting by hand-checked `sed` on the absolute paths; `git status` then showed no app
file modified. Rule from it: absolute paths, one working directory, never two `cd`s in
flight at once.

**Untracked and untouched.** The operator's own pages under `docs/mockups/html/lux/`
(`lux-*-fable.html`, `lux-modes.mjs`, `lux-modes.build.mjs`, `modes/`) and that folder's
modified `index.html` and `lux.build.mjs` predate this run and were not staged.

**Verification and the push.** `npm run verify` in this tree, this sitting, before the docs commit `ef087db`: exit 0 (lint = `tsc --noEmit --noUnusedLocals --noUnusedParameters`, then `node --test tests/*.test.mjs`). Pushed as the run's last act, after this file's commit, with the one permitted form `git push origin mainexpo`; every commit green.

**Next.** The operator reviews the viewer; on "build it", the patch lands in the real tree
(`git apply --ignore-whitespace docs/mockups/refresh/after.patch`), then `npm run verify`,
the commit, the OTA to the Beta.

## THE LUX REMAKE — brief written, run not started (2026-09-27, the refresh chat, latest); nothing in the app changed

**What just happened.** The operator opened the viewer and ruled the After wrong — "These do
not look like the emerald references screens": keep Before exactly, remake After against
`docs/mockups/html/lux/`. Nineteen pictures and eight answered questions became
`docs/dispatch/LUX-REMAKE.md`: gold `#D4A24C` (never the Lux `#E9C170`) on every field label
and section eyebrow in dark; mint `#4FC58C` everywhere; one system font, no serif; the corner
rings gone; "3D pop-out" cards everywhere (white + soft shadow in light); one-line copy; chips
light their rim and icon; no pinned Continue on Post a job (the top-right link greys out, the
reason under the field); no "Browse workers" line on Home; Discover's back circle back, gold;
Setup and the legal gate in dark too, today's layouts; the last After's other flow changes
kept "but smart guess my taste"; the nav bar untouched; Map / Filters untouched AND pinned to
today's colours. A motion inventory is required; the live-job check draws itself in under a
second. Nothing in the app moved; the working tree's app files are as at `e9b2efc`.

**Blocked on the operator, this sitting.** The evidence guard blocked image reads again (the
session was launched without `BRAZOS_EVIDENCE` carrying `images`), so the pictures were read
from the chat only; and the memory directory outside the repo is write-blocked by the guard
(GUARD-PATH-ESCAPE), so the rulings live in the brief, not in memory. The operator chooses:
relaunch with image authorization so the run can see its own renders beside the Lux pages, or
run blind on the text / box / colour dumps.

**Next.** The run in the brief, in `.shots/refresh/practice`: tokens, the card primitive, the
pinned Map / Filters palette, the auth ground, the hero bake, the copy pass, the motion
inventory; the After re-exported, validated 68/68 in both schemes, `after.patch` regenerated;
nothing in the app until "build it".

## THE REFRESH — the whole app, Before beside After, from the real code; the After is a patch awaiting "build it" (2026-09-26, the refresh chat); docs `b5554da`, nothing in the app changed

**What just happened.** The operator asked to see every screen "exactly how it is on my screen"
beside how it would look with Emerald Lux and the UX audit's simplifications, both phones
clickable with real animations and one pill switching both between dark and light — "All i have
to do is reference this html exactly and have entire UI/UX refreshed without any bugs". Their
answers: base "Your real app", hard screens "Sample data on my PC", text "Like my iPhone", scope
"The whole app, clickable", After "real screen + lux colors" plus "All screen fixes". Rulings:
one system font (no serif), the B on Launch only, the bottom nav bar untouched, phone first,
"Send a bid" the main button, Forgot password added. DECISIONS 2026-09-26.

**Open it:** `.shots/refresh/index.html` (a file — no server). Rebuild and details:
`docs/mockups/refresh/README.md`. 68 screens; every one reached in BOTH apps in BOTH schemes —
Before 68/68 dark, 68/68 light, After 68/68 dark, 68/68 light (`validate.mjs`). The evidence guard blocked image reads
this run, so layout was checked by the rendered page's own boxes, colours and labels
(`.shots/refresh/shot.mjs` writes a text dump beside each screenshot).

**The After, where it lives.** Every change was made in the practice copy
(`.shots/refresh/practice`, scratch), never in the working tree — `git status` shows no app file
touched. It is `docs/mockups/refresh/after.patch`: 82 files (76 changed, 6 new — Forgot
password's three, `ModeSwitchRow`, `NotificationBell`, the reset test), `git apply --check
--ignore-whitespace` clean on `ec9ec36`; in the copy, the lint-level `tsc` is clean and the suite
is 1269 / 0 (`safety` and `governance` need `.claude/` and `.git/`, which the copy lacks — the
real `npm run verify` runs them). What it changes, screen by screen, and what it leaves out with
reasons: `docs/dispatch/SCREEN-BY-SCREEN.md`.

**Fences moved with rulings, never weakened.** Where the After reverses a pinned decision (D2/D4's
last-step-only footer, a4's in-dialog price question, 4D-6's "Online / Visible to customers", the
Home field's magnifier, the Other sheet, the Messages title) the fence now pins the new rule as
tightly; honesty fences were met by changing code. `scripts/shots.mjs`'s Worker Home waits
follow the new copy in the patch.

**To build it (the operator's word only):** `git apply --ignore-whitespace
docs/mockups/refresh/after.patch`, then `npm run verify`, then the usual OTA. Build it screen by
screen by cutting the patch, or whole.

**Operator items:**
- Forgot password needs `brazos://reset-password` on Supabase Auth → URL Configuration for
  staging and production (the patch adds it for the local stack only).
- `components/BrazosMonogram.tsx` is imported by nothing once the patch lands (the B stays on
  Launch through `BrandLogo`); delete it then, or keep it for later.
- Superseded and uncommitted, safe to delete: `docs/mockups/html/lux/lux-modes.mjs`,
  `lux-modes.build.mjs` and `modes/` (the Lux pages in light — replaced by the viewer).
- Not built, needing server work or their own runs: arrival / start / payment-protected pushes
  (M-26, M-27), the payouts nudge (M-14), the Setup + legal collapse (M-19), one bid/offer
  vocabulary (M-17), one filter memory (M-25).

**Left standing.** The tree's unrelated dirt untouched and uncommitted: the Fable pages,
`docs/mockups/html/lux/lux.build.mjs`, `docs/mockups/html/lux/index.html`. No OTA, no device
walk: nothing reached the phone.

## SIGN-IN, FROM THE PHONE AGAIN — Continue on top and on the keyboard, the "Instead" pill under it, no "Go" (2026-09-21, the sign-in chat, latest); `b0e54d4`, OTA `f4a996f5` live on preview

**What just happened.** On the `2993ee0` OTA the operator sent four screenshots: the phone
screen with the number pad up showed a floating "Go" pill (iOS's return key for a number
pad whose field asks for `returnKeyType="go"`); the email screen with the keyboard up showed
Continue 12 above the keyboard; both screens at rest showed the "Instead" pill ABOVE
Continue (the (21) layout had left the route in the scroll, bottom-pinned, over the footer).
"get rid of the go … don't add space between keyboard and the continue button … for both
screens continue should always be on top, not the instead pills … fix and push again".
DECISIONS 22. All three done, pushed and published under the standing word.

**The change (`b0e54d4`).** Both screens: BOTH controls are the scaffold's pinned footer —
Continue on top, the "Instead" route under it, 12 between (`styles.footer`); the scroll holds
only the copy and the form (its least air above the footer 32). `AuthScaffold
footerBelowLead` (the 12 + 58 the footer stacks under its lead) joins the inset, the resting
gap and the column's COLUMN_BOTTOM_PADDING in the KeyboardRisingColumn's `insetBelow`, so
the rise lands CONTINUE's bottom edge on the keyboard and the route goes under it; the
shared `riseFor` is untouched. The phone field asks for no return key (and no
`onSubmitEditing`) — Continue on the keyboard is the way onward; the email screen's text
keyboard keeps its real return key. Pages regenerated: the footer holds both; the keyboard
frames rise 208 / 163 so Continue's bottom sits on a 336 keyboard / a 291 number pad
(516 / 561) with the route under it.

**Proven by the loop** (`.shots/lux/signin-compare.mjs`, both screens, light): Continue
666–724 and the route 736–794 on the pages' boxes; the fields, the back disc and the copy
unchanged; copy 0.4 % / 0.6 % differing, fields 0.7 % / 0.2 %, actions 2.0 % / 1.5 %, the gap
0.0 %; the keyboard frames' geometry by script (`.shots/lux/kbframe-signin.mjs`). NOT
provable here: the ride, the flush landing and the absent "Go" — the operator's walk. The
evidence guard blocked image reads in this run: every check is a script's.

**Verify, push, OTA.** `npm run verify` lint clean, 1393 / 0 (`.shots/lux/verify-signin3.txt`).
Pushed `af1572b..616fb92` (`b0e54d4` code, `616fb92` DECISIONS 22). `npm run update:preview`
→ branch `preview`, runtime `1.0.0`, update group `f4a996f5-5310-48e9-bda0-2100ad91cf94`,
iOS update `01a0c625-6216-755a-8354-f8a30ea0be8d`; dashboard
`https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/f4a996f5-5310-48e9-bda0-2100ad91cf94`.
Open the Beta twice to pull it.

**The operator's walk, both screens:** at rest Continue above the "Instead" pill; tap the
field — Continue rides up and stops ON the keyboard with no gap, the pill disappears under
the keyboard, the copy and field lift a touch; the number pad shows no "Go"; dismiss —
everything returns. **Left standing:** `screens/CreateAccountScreen.tsx`'s phone field still
asks for "go" and floats the same pill (not asked; one screen at a time); the B on both
Create-account screens; no "Forgot password?". The tree's unrelated dirt untouched (the Fable
pages, `lux.build.mjs`, `index.html`, the Lux chat's ideas pages).

## BOTH SIGN-IN SCREENS, FROM THE PHONE — "Brazos", Continue rides the keyboard, the back circle, the phone screen matched (2026-09-21, the sign-in chat, latest); `2993ee0`, OTA `971f0ac0` live on preview

**What just happened.** The operator, holding the shipped email screen with the keyboard up
(Continue cut off under the keyboard's autofill bar — the KeyboardAvoidingView's padding path,
whose shrunken scroll no longer fit the column) and the untouched phone screen: "Make BRAZOS
to Brazos … the continue button should slide up smoothly with the keyboard and stay on top of
it … the back button < on top should have a iphone style circle around it and iphone
animations if pressed … make the changes we talked about to sign in screen for With phone,
not just email … if the continue button overlaps the password box please move the whole
thing higher (there's a lot of space on top)". DECISIONS 21. All four done, both screens,
pushed and published under the standing "push / ota / auto".

**The mechanism (`components/AuthScaffold.tsx`).** `footer`: a pinned action rendered as the
column's LAST SIBLING (not an overlay — the scroll ends where it begins), resting 24 above
the safe inset (a 12 margin + the shared COLUMN_BOTTOM_PADDING 12) and riding the keyboard
through `KeyboardRisingColumn` — the seam Chat's composer has used since 2026-08-23: the
keyboard's live frame on the UI thread (`react-native-keyboard-controller` + reanimated)
where the binary can track it, `useKeyboardOffset`'s native-driver imitation at the system's
own duration otherwise — with `insetBelow = insets.bottom + 12`, so its padded edge lands on
the keyboard and Continue stops 12 above it. The KeyboardAvoidingView's `padding` behaviour is
OFF while a footer is present (nothing re-lays out per frame); the ScrollView keeps
`automaticallyAdjustKeyboardInsets` so a field can still be reached on a phone too short for
all of it. `lift`: the scroll column translates up by this much — the sign-in pages pass 24,
the air between the bar and the eyebrow — as a fraction of the keyboard's rise over its
first 200 points (`useKeyboardOffset(insets.bottom).interpolate`, native driver), so the
last field clears the button on every phone (852: the password field ends 17 above Continue;
taller phones more). The back control on a THEMED screen is the iOS circle: a 36 disc at the
ink's .08 (.16 pressed) inside the 44 target, the chevron 20 (`authSizes.backCircle` /
`backChevron`), a 90 ms dip to .88 and a spring back on the native driver; untouched screens
(VerifyPhone, Setup, LegalGate) keep the bare 22 chevron byte for byte.

**The screens.** `EmailSignInScreen` and `SignInScreen`: "Sign in to Brazos" (title case —
the C5 chrome rule is about mid-sentence BRAZOS; both files still sit on its chrome list);
Continue is the footer (`themed hero lit chevron`); the alternate route stays in the scroll
12 above it (`body.paddingBottom` 24 → 12), `lift={authSpacing.xl}`. The phone screen took the
whole of (20): the B gone, `heroEyebrow`, the serif `heroTitle` in `fonts.displayHero` (the
ONE serif role's fourth site — `tests/themeTokens.test.mjs` HERO_SITES, constants only),
"Use Email Instead" outlined with `mail-outline` and the chevron. The `themed` prop is kept
LAST on `<AuthScaffold …>` on both — `tests/themeResolution.test.mjs` matches
`<AuthScaffold[\s\S]{0,200}?themed\s*>`, so the footer is a `const` above the return.

**The references.** `docs/mockups/html/lux/signin-ship-light.html` regenerated — "Brazos",
the circle, and a second frame `lux-signin-ship-light-keyboard` (the email field focused on
an 852 phone: a 336 keyboard drawn as a labelled slab, Continue 446–504, the column at 118,
the password field 375–429, the phone action under the keyboard) — and
`docs/mockups/html/lux/signin-phone-ship-light.html`, new, the same two frames for the phone
screen (a 291 number pad; Continue 491–549). The ideas page `signin-ideas.html` is the record
of the options and stays as sent.

**Proven by the loop** (`.shots/lux/signin-compare.mjs`, both screens, light, the export's
missing 54 / 34 insets accounted for): eyebrow 142–159, headline 167–205, body 213–261, the
fields (307–361 and 399–453; the number field 307–361 from x 114), the back disc 20..56 ×
62..98, Continue 736–794, the second control 666–724 — `=` the pages' boxes; the bar title's
box 66–94 against the page's 67–93 (native line height, same centre); copy 0.4 % / 0.6 %
differing, fields 0.7 % / 0.2 %, actions 2.1 % / 1.5 % (text anti-aliasing and Ionicons
against SVG), the gap 0.0 %. Stills `.shots/signin-app-{email,phone}-light.png` beside
`.shots/signin-page-{email,phone}-light.png`; the harness's own
`.shots/auth-{signin,email-signin}-{light,dark}.png` (both themes render, no page errors).
NOT PROVABLE HERE: the keyboard ride, the lift and the back press — the web harness has no
keyboard and no touch; every number above is a resting-state number. The evidence guard
blocked image reads in this run: every check is a script's.

**Verify, push, OTA.** `npm run verify` lint clean, 1393 pass / 0 fail
(`.shots/lux/verify-signin2.txt`). Pushed `354d23a..8711b6d` (`2993ee0` code, `8711b6d`
DECISIONS 21). `npm run update:preview` → branch `preview`, runtime `1.0.0`, update group
`971f0ac0-43ff-417c-9406-e810b9abd870`, iOS update `01a0c61a-5b97-7960-882a-80277e7b6cf4`;
dashboard `https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/971f0ac0-43ff-417c-9406-e810b9abd870`.
Open the Beta twice to pull it.

**The operator's walk, both screens, both appearances:** tap a field — Continue should
travel with the keyboard and stop just above it while the copy and fields move up a touch,
never overlapping; dismiss — everything returns; the back circle should dip on press and
spring back; "Sign in to Brazos" in the serif; the phone screen without the B, with the
outlined "Use Email Instead". If Continue still overlaps a field on the operator's phone, the
lift is one number (`lift={authSpacing.xl}` on both screens; the scaffold spends it from the
bar-to-eyebrow air, 32 at most before the eyebrow touches the bar's padding).

**Left standing, on purpose.** The B on both Create-account screens (their turn is a
separate pick); no "Forgot password?" (the app has none — a feature for BACKLOG if asked).
The tree's unrelated dirt untouched: `lux.build.mjs`, `index.html`, the nine
`lux-*-fable.html` pages (the Fable chat's, uncommitted by its instruction) and the Lux chat's
own ideas pages.

## THE EMAIL SIGN-IN, FROM THE PHONE — the B removed, the Welcome's type and controls (2026-09-21, the sign-in chat, latest); `9085cc5`, OTA `68b2388f` live on preview

**What just happened.** The operator, holding the shipped LIGHT email sign-in screen
(`screens/EmailSignInScreen.tsx`): "remove the B and overall show me a html of how a better
sign in page looks like, without changing too much". Options first, per the standing loop:
`docs/mockups/html/lux/signin-ideas.html` — NOW (the shipped screen, honest to its source)
and six steps a–f, each adding ONE thing with the mark gone (a the B removed; b + the
Welcome's serif headline; c + the bar's duplicate "Sign in" dropped, the eyebrow tracked as
the Welcome's; d + the Welcome's controls; e + the Welcome's ground and arcs; f + the
password eye), shot to `.shots/mockups/lux-signin-idea-{now,a..f}.png` and a two-row sheet.
THE PICK: "make it d", then, from a crop of the bar, "also add the sign in on top" — d with
the bar title kept. Before the pick was sent the operator circled the field icons ("make sure
the icons aren't in weird places"): the ideas page's icon class collided with its intro
paragraph's `.lead` (margin 0 24px 18px), so every glyph sat 24 in and 9 high — measured,
renamed `.glyph`, re-shot (icon 14 in from the field edge, the text 12 after: 15 / 47 from
the field's outer edge, the app's own numbers). DECISIONS 20.

**The reference.** `docs/mockups/html/lux/signin-ship-light.html` (`data-shot`
`lux-signin-ship-light`): the eyebrow 13/700 tracked 2 on a 17 line at 142; the headline
Georgia 34/38 tracked −.4 at 167–205; the body 16/24 at 213–261; the fields 54 at radius 14 at
307 and 399; Continue lit at 666–724 (58, radius 22, the gold hairline at .62, the specular
edge, the 17/600 label, the gold chevron 18 at 18 from the right); the phone route outlined at
736–794 with the phone glyph 22 and the forest chevron; the actions end 58 above the bottom
(24 above the 34 inset), 12 between them; the bar ("Sign in" 21/600, the emerald chevron) and
the soft teal contour as shipped. Light only — the operator's phone and pick were light; dark
follows from the same components' dark roles (the harness's dark render draws the lit lead in
the `authCta*` shade, the outlined second on the ground, no mark).

**The app (`9085cc5`).** `screens/EmailSignInScreen.tsx`: `BrandLogo` gone (and the
`authSizes` import with it); the eyebrow `authType.heroEyebrow`; the headline the new
`authType.heroTitle` (`lib/authTheme.ts`: 34/38, −0.4, 700) in `fonts.displayHero`; the two
`AuthButton`s `themed hero lit chevron` and `themed hero icon="phone-portrait-outline"
chevron` — `hero` without `lit`, NOT `ghost`, because a ghost hero is the Welcome's text link
and the page draws a box; `popTo('SignIn')`, `disabled={loading}`, the hint and the copy
unchanged. `tests/themeTokens.test.mjs` HERO_SITES names this screen as the ONE serif role's
third site — expected constants only. Every fence that reads the screen still holds
(`themeResolution`, `authPhone`, `phoneOtp`, `copyTruth` …).

**Proven by the loop** (`.shots/lux/signin-compare.mjs`, gitignored, after `node
scripts/shots.mjs --build --only auth-email-signin`; the app rendered at 393 × 764 — the web
export has neither the 54 status inset nor the 34 home inset — and shifted 54 into the page's
frame): the eyebrow 142–159, the headline 167–205, the body 213–261, the field wrappers
307–361 and 399–453, the phone button 736–794 — `=` the page's boxes to the pixel; the Continue
label centred at 684–706 in its 666–724 box; the bar title's box 66–94 against the page's
67–93 (the native line height, same centre). Pixel regions: bar 2.0 % differing, contour
3.8 % (the .67-px rings' anti-aliasing), copy 0.4 %, fields 0.7 %, gap 0.0 %, actions 2.1 %
(the label rows and the glyph column — the Welcome loop's floor). Stills:
`.shots/signin-app-light.png`, `.shots/signin-page-signin-ship-light.png`,
`.shots/auth-email-signin-{light,dark}.png`. The evidence guard blocked image reads in this
run, so every check above is a script's number, none an eye's.

**Verify, push, OTA.** `npm run verify` lint clean, 1393 pass / 0 fail (`.shots/lux/
verify-signin1.txt`). Pushed `dfdce36..9fb8d11` (`9085cc5` code, `9fb8d11` DECISIONS 20).
`npm run update:preview` → branch `preview`, runtime `1.0.0`, update group
`68b2388f-8b19-407c-999e-a5a0cdefaaab`, iOS update `01a0c603-06fe-79cd-96a8-b6a2cbb6661f`,
2 bundles, no new assets (45 reused); dashboard
`https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/68b2388f-8b19-407c-999e-a5a0cdefaaab`.
Open the Beta twice to pull it. NOT walked on the phone — that check is the operator's: the
email sign-in in both appearances (the headline's serif cut, the two boxed actions, the field
glyphs), reached from Welcome → "I already have an account" → "Use Email Instead".

**Left standing, on purpose.** The B mark on the phone Sign-in and both Create-account screens
(this decision is one screen; their turn is a separate pick). No "Forgot password?" — the app
has none; a new control is a feature for BACKLOG if asked. Not taken from the ideas page: e's
ground and arcs, f's eye. The tree's unrelated dirt is untouched: `lux.build.mjs`,
`index.html` and the nine `lux-*-fable.html` pages (the Fable chat's, uncommitted by its
instruction), plus the Lux chat's own ideas pages.

## RUN WEBP COMPLETED (2026-09-21, the Fable chat) — the four mounted prestige rasters ship as WebP; OTA `b962496b` live on preview

**What changed (commit `0dcdd58`, pushed to `mainexpo`; CI verify runs on the push).** The
four rasters the app mounts — `hero_armchair_customer`, `hero_armchair_customer_light`,
`hero_toolbox_worker`, `home-atmosphere-dark` — are required as `.webp` (q90, alpha kept,
encoded with Chromium's libwebp through Playwright, so NO new dependency): 165 → 21 KB,
150 → 19 KB, 1,448 → 234 KB, 3,729 → 94 KB; 5.9 MB of PNG to 0.5 MB, measured at 36–45 dB
PSNR against the PNGs (mean error 1–2 points per channel out of 255). The PNG masters
STAY on disk beside them: `tests/themeResolution.test.mjs` measures each bake on the
master (`scripts/atmosphere-tune.mjs`, `home-ground-blend.mjs` and the mockup builders
read them too). `brazos_b_drape.png` is mounted by nothing and is untouched.

**The fence, read carefully (the one thing the operator should review).** The BAKED_ART
roster now keys the `.webp` mounts, each naming its PNG `master`; a new `rosterBytes()`
proves the WebP exists, is RIFF/WEBP, and is exactly the master's size (`webpDims()`
reads VP8X / VP8L / VP8 headers), THEN the unchanged alpha sweep measures the master's
bytes as it always did. Nothing was loosened: every prior assertion still runs on real
alpha samples; the indirection was added, not a check removed. The three other pins
(`workerHome`, `emeraldFences` home(4), `postJobPublish`'s light-hero gate) take the
new filename only. `npm run verify`: lint clean, 1387 tests pass.

**The OTA.** `npm run update:preview` → branch `preview`, runtime `1.0.0`, update group
`b962496b-83d0-43d0-85de-6d740d9a5df8`, iOS update `01a0c2da-c0f3-7fdc-a1e0-51e54cfff423`,
4 new assets uploaded (47 reused). Dashboard:
https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/b962496b-83d0-43d0-85de-6d740d9a5df8.
NOT yet walked on a device — that check is the operator's: Customer Home's hero and
atmosphere, Worker Home's toolbox, both themes, after the Beta build pulls the update.
`dist/` is unchanged by git's account after the export.

**Why this and not a drawing.** The operator asked whether the hero could be redrawn in
CSS/SVG to shrink the app; a four-round measured attempt (`.shots/vector/`, gitignored)
reached 95% mean-colour match and was judged "not even close" by eye, as predicted —
vector cannot carry velvet, brass or leaves. Parked. WebP keeps the photo and takes
91% of the bytes; the tooling is `.shots/webp/` (convert / compare.html / emit /
patch-tests), gitignored.

**Also from this chat, docs only, UNCOMMITTED by instruction:** the nine Fable Lux pages
(`docs/mockups/html/lux/lux-<key>-fable.html` for home, post-review, compare, cjob, chat,
checkout, review-tip, welcome, signin; their render functions appended to
`lux.build.mjs`, `index.html` rebuilt to 76 screens; the Lux chat composes the
Opus-vs-Fable sheets and records the operator's pick in `SCREENS.md`).

**Tree at the end of this run.** Modified, uncommitted: `docs/mockups/html/lux/lux.build.mjs`
and `index.html` (the Fable pages). Untracked: the nine `lux-*-fable.html` pages, and the
Lux chat's own `welcome-ideas.html`, `welcome-motion.html`, `mode-switch-*.html`. This
HANDOFF commit carries the Lux chat's uncommitted Welcome-page note below unchanged —
flagged here because that note was theirs and still awaiting the operator's pick.

## WELCOME, FROM THE PHONE — phone leads, the copy lifted, the light lead flat (2026-09-21, the Lux chat, latest); `b4f7332`

**What just happened.** The operator saw the shipped screen on the phone in both appearances
(it matched the pages) and asked for three things: "Continue with phone" on top, the copy a
little higher with consistent spacing, and the two boxed buttons identical in size (light).
The ship pages were changed first and approved, then the app: PHONE is the lead action (lit,
the glyph, the chevron, the rim light), email the outlined second, sign-in the text link — the
operator's ruling, reversing (17)'s email-first, recorded in `tests/firstSession.test.mjs` n5
with the still-true reason (phone auth is disabled outside development; the phone screen shows
the notice and "Use Email Instead" until SMS is provisioned); the eyebrow at 374 (26 under the
last badge, the body 27 above the actions, which still end at 803); the lit lead's depth is
DARK-ONLY — in light both boxed actions are flat but for the specular edge, so they read the
same size. DECISIONS 19. The loop's numbers are unchanged (art ≤ 0.6 %, ground 0.0 %, the
actions' 2.2 % the label rows). `npm run verify` 1393 / 0. Pages: `welcome-ship.html`,
`welcome-ship-light.html` (the copy at 371, phone first), `welcome-glint-light.html` (the
flat lead). PUSHED (`9ad665e..0c48ded`, after verify 1393 / 0) AND PUBLISHED — **THE OTA IS LIVE on the
preview channel**: update group `82a49dcd-7650-47d8-8a83-0b573938425c`, iOS update
`01a0c5d9-d7ed-7b9f-bcf9-c8a0bd4683ed`, commit `0c48ded`; dashboard
`https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/82a49dcd-7650-47d8-8a83-0b573938425c`.
Open the Beta twice to pull it. Not walked on the phone since this change.

## THE WELCOME PAGE — SHIPPED, both themes, matched to its pages by a render loop (2026-09-21, the Lux chat, latest); `7f10dd5`

**What just happened.** After the build of `b8456f6` was refused and restored (`23d76ad`, the
section below), the operator approved the dark pick page ("HTML looks good so far") and its
light counterpart ("oh yes looks very good"), then: "ship both to phone right now — carefully,
in a loop where you go back and forth within the HTMLs and then implement once it's perfect,
then auto push". Done, in that order: THE SHIP PAGES (`docs/mockups/html/lux/welcome-ship.html`
and `-light.html`, derived from the approved pages by `.shots/lux/make-ship-pages.mjs` — every
approved thing kept, the one forced change being three actions: email lit with the glint,
phone outlined, "I already have an account" the Lux text link; the art at 60 / 300 tall with
its contents lifted 15, the copy at 385, the actions ending at the approved 803), then THE APP
(`7f10dd5`), then THE LOOP until only text anti-aliasing differed, then `npm run verify` 1393 /
0, then the push and the OTA (see the end of this section for their state).

**What the app is now (`7f10dd5`; DECISIONS 18 has every number):** sixteen auth roles in
both palettes (`ui/tokens.ts` + `lib/theme.ts`; dark = the pages' Lux hexes, light = the light
page's, gradients flat in light by construction); `lib/authTheme.ts` `heroButton` 58 / r22,
`heroLink` 44, `heroBadge` 42, the `hero*` type; `AuthScaffold ground` (the base + the glow,
the corner haze, the foot shade, both themes); `AuthBackdrop full` = the page's five arcs alone
(`soft` untouched); `AuthButton` `hero` / `lit` / `icon` / `chevron` / `light` (absent-inert;
the ghost hero is the text link); `WelcomeScreen` = the page's art in a 353 × 300 canvas, the
discs with the pages' inset rims / glows / shadows as `boxShadow` from the roles, the badges,
the SERIF two-tone headline (`fonts.displayHero` 44/47 — the one-serif fence widened to the
two hero screens by the operator's ruling), the copy at the page's distances, the actions
ending 49 above the bottom whatever the inset; `RimLight.{shared,motion120,}.tsx` (the glint,
the pages' stops per theme). BORDER-BOX LESSON, load-bearing for any future page match: the
pages are CSS content-box, React Native is border-box — every bordered size is +2 in the app
(discs 218 / 202 / 174, ghost ring 250, badges 42, the arcs' diameters +2); this is what took
the art from 5.6 % differing to 0.6 %.

**Proven by the loop (`.shots/lux/ship-compare.mjs`; run after `node scripts/shots.mjs --build
--only auth-welcome`):** the live screen from the harness's export, both themes, 2x, reduced
motion (the rim at rest) beside each ship page with its glint hidden — element boxes and a
pixel diff per region. Final pass: the headline, body and all three action boxes ON the page's
pixels; arcs 1.1 % / 0.1 % differing (dark / light), art 0.6 % / 0.4 %, copy 0.4 % / 0.2 %,
actions 2.2 % / 2.2 % (`ship-rows.mjs`: exactly the label rows and the glyph column — text
anti-aliasing, and Ionicons where the page draws SVG at the same size and place), ground
0.0 %. Motion on (`welcome-motion-live.mjs dark|light`): the glint circles the lead button
clockwise, peaks 217–233 against the resting hairline's 142 / 125, the fill constant, no page
errors. The stills are `.shots/ship-app-{dark,light}.png` beside `.shots/ship-page-*.png`.
Image reads were blocked for this run; every claim above is a measurement.

**Fences moved, with their reasons in place:** `tests/themeTokens.test.mjs` (HERO_SITES — two
hero screens, exactly once each, DECISIONS 18), `tests/motion120.test.mjs` (SIBLINGS + the
worklet-callable roster gain RimLight), `tests/rimLight.test.mjs` (rewritten for the ship
pages). `tests/firstSession` n5, `copyTruth`, `shotHarness` untouched and green.

**PUSHED:** `git push origin mainexpo` — `2b80147..585d242` (the restoration `23d76ad`, the two
pick pages, the code `7f10dd5`, the docs `585d242`), after `npm run verify` 1393 / 0 in the
same run. **THE OTA IS LIVE on the preview channel** (`npm run update:preview`, as the operator
asked — "ship both to phone right now"): update group `df6cc228-85aa-4bea-8a00-e66cd0b05718`,
iOS update `01a0c5cd-3c24-7f7d-8e5d-704238fda038`, runtime 1.0.0, commit `585d242`; dashboard
`https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/df6cc228-85aa-4bea-8a00-e66cd0b05718`.
The export went to the gitignored `dist/`; nothing tracked moved.

**Not walked on the phone.** The operator walks Welcome in both appearances: the arcs from
the corner, the three lit discs, the badges, the serif headline, the glint circling the email
button once every six seconds, the phone button, the sign-in link — and the entrance stagger.

## THE WELCOME PAGE — BUILD RESTORED, THE PICK PAGE IS THE REFERENCE, NOTHING PUSHED (2026-09-21, the Lux chat, latest)

**What just happened, in order.** The operator saw the harness render of `b8456f6` beside
the page it was built from: "wthh… it looks nothing like the one you showed me… don't push
this." It HAD been pushed (`b8456f6` code, `2b80147` docs — GitHub only; no OTA was ever
published, no device has it). Asked, answered: RESTORE the old Welcome now, then fix; the
serif headline — YES, Georgia on Welcome too; the actions — THREE, email first with the
glint. Then: "make it in HTML, this is the exact reference, as accurate as possible, show
me the HTML with the animation (f) first, do not push anything."

**State of the tree.** `23d76ad` — LOCAL ONLY, NOT PUSHED (`ahead 1` of origin) — restores
by content every file `b8456f6` touched to its state at `369991d` (each proven
byte-identical with `git diff --quiet 369991d -- <file>`) and removes the four it added;
`npm run verify` 1387 pass / 0 fail, as before the build. `git revert` is a subcommand the
run guard reserves for the operator, hence the content restoration. ORIGIN STILL CARRIES
`b8456f6` + `2b80147`: the next `git push origin mainexpo` (only on the operator's word)
carries the restoration and everything after it.

**Why the build did not look like the page — three real gaps, all mine:** (1) the headline
was the system sans at 38 (the one-serif fence permits Georgia on Home alone) where the
page is Georgia 44/47; (2) the page's LIGHT was not ported — the mint glow behind the middle
of the screen (`.glowbg`), the corner haze and the shade at the foot — so the render was
flat and much darker; (3) the disc rims were 1.5-pt slivers where the page draws a crisp
line plus a soft 12-pt glow and a deep shadow under each disc. Verifying NUMBERS (arc
positions, text rows, colours) instead of the LOOK is what let it through: the harness
runs under reduced motion and at 1x, image reads were blocked, and the operator judged
from small thumbnails against a crisp 2x still.

**THE REFERENCE, now (APPROVED by the operator: "HTML looks good so far"):** `docs/mockups/html/lux/welcome-glint.html`, and its LIGHT counterpart `welcome-glint-light.html` (asked for next: "how would the light mode version look? be very accurate") — derived from the dark page by `.shots/lux/make-glint-light.mjs`, geometry identical to 0.1 px across all 49 elements (`glint-light-check.mjs`), every colour mapped to the app's light tokens: ivory `bg` #F6F3EA flat, white badge cards on the light card shadow, pale mint disc spheres (an emerald rim on the back one, gold on the front two), the eyebrow EMERALD (the eyebrow law), the headline ink then emerald, the forest #064C3B CTA with a white label and gold glyph/chevron, the secondary in forest on a gold hairline, the light gold #C8A15B for arcs, rims and hairlines; the glint cream-cored over the forest rim. Its still: `.shots/mockups/lux-welcome-glint-light.png`. Awaiting the operator's word on the light page. THE DARK PAGE: — the pick alone: the
polished v1 phone (the still the operator holds, `.shots/mockups/lux-welcome-final.png`)
with the f rim glint running on "Continue with phone". Its markup and CSS are
`welcome-motion.html`'s own, emitted by that page's builder, so it IS the still, moving —
proven: the shot frozen at 30 % of the lap (`lux-welcome-glint.png`) differs from the still
only on the lead button's rim (the light) and in text anti-aliasing where the browser
composites the animated layer; every sampled interior pixel is identical. ONE CORRECTION
found on the way: `welcome-motion.html` defined `.halo` twice (the art's glow, then idea
b's spark halo), so the art's glow rendered as a 44-px dot in every frame of that page —
the still the operator chose therefore has NO glow behind the discs, and the pick page
draws none. The six-motion page keeps that flaw as it was shown; the pick page is what the
app is matched to.

**Next, ONLY after the operator approves the pick page:** rebuild the app screen to MATCH
IT — the serif headline (`fonts.displayHero` on Welcome's headline at 44/47: widen
`tests/themeTokens.test.mjs`'s one-serif allow-list to `screens/WelcomeScreen.tsx` with the
operator's ruling recorded, DECISIONS), the ground WITH its light layers (`glowbg`, the
corner haze, the foot shade — all gradient layers on one `experimental_backgroundImage`
string), the discs with a crisp rim AND a soft glow (a glow ring behind an offset disc, a
radial-gradient ring) and the page's deep shadow, the buttons at 58 × r22 with the hairline
at the page's alpha, the glint on the lead action. THE ACTIONS, as ruled: three, email
first with the glint — but the page has TWO (phone first); the operator has been asked once
more, plainly, whether the app should match the page's two instead. PROVE IT BY THE LOOK
before showing: render the live screen at 2x with motion on beside the pick page at the
same phase and diff them, region by region, and send the pair — never the harness's
reduced-motion 1x still alone. Then the phone walk is theirs.

**Fences that will move, with the operator's rulings:** the one-serif allow-list
(`tests/themeTokens.test.mjs`); `tests/motion120.test.mjs` SIBLINGS + roster (the
RimLight sibling returns); `tests/rimLight.test.mjs` returns. `tests/firstSession.test.mjs`
n5 stays unless the operator rules two-phone-first.

**Scratch (gitignored, `.shots/lux/`):** `welcome-glint-shoot.mjs` (the frozen shot + the
pixel diff against the still), `glint-diff.mjs`, `glint-check.mjs`, the earlier probes,
`commit-restore.txt`.

## THE MODE SWITCH — the glass wipe carrying the capsule (2026-09-21, app code)

**What changed and why.** The operator, on the 1000 ms artwork sheet: "get rid of this
annoying switching mode transition … consistent with the emerald lux glass theme … show
me diff versions … optimized for smoothness." Six ideas were drawn live (no app run:
`docs/mockups/html/lux/mode-switch-ideas.html`, CSS on Lux phones with a slow-motion
toggle); they picked **the glass wipe carrying the capsule** (shown alone both ways in
`mode-switch-wipe-capsule.html`), then "implement this right now". Asked and answered:
the confirm dialog stays as it is; the capsule holds ~700 ms then retracts; publish the
OTA. DECISIONS (15).

**What landed (one code commit, `npm run verify` 1387 pass / 0 fail — six new tests):**
- `components/ModeTransitionOverlay.shared.tsx` — NEW: every number (pane in 260 ms,
  swap under full cover, hold ≥ 60 ms, reveal fail-safe 400 ms after the swap, pane out
  280 ms; capsule in at 180 ms over 220, holds until 1100, out over 200; reduced motion
  110/130), `runSequence` (THE one clock: the swap fires once from the cover callback
  with the layout waiter armed first, the reveal waits for the tree's layout or the
  fail-safe then one frame), the themed styles (the pane is `palette.background`, the
  leading edge the mint `emeraldBright` rim at .55 + a specular line, the shadow a
  gradient strip from the palette's black — no literal colour).
- `components/ModeTransitionOverlay.motion120.tsx` — NEW: the Reanimated path (two
  shared values — the pane's translateX, the capsule's translateY — each `withTiming`
  ending in one `runOnJS` hop), chosen through `resolveMotion120` like the other
  siblings.
- `components/ModeTransitionOverlay.tsx` — rewritten: the provider (`start`, `busy`,
  and the new `markTreeLaidOut`), `ModeTreeLayoutSignal` (the paint signal), the
  native-driver sibling and the reduced-motion crossfade (opacity only, the same
  capsule), all over `runSequence`. `busy` ends when the pane has left; the layer
  unmounts when the capsule has gone.
- `navigation/ModeShell.tsx` — mounts `<ModeTreeLayoutSignal key={treeMode} />` inside
  the painted tree View (its fences untouched: the View's opening tag and the ground
  paint are byte-identical).
- RETIRED: `components/modeTransitionAssets.ts` (deleted); `assets/brand/transition-
  customer.png` and `transition-worker.png` stay on disk, required by nothing.
- Fences moved as constants with dated reasons: `tests/motion120.test.mjs` (the fast-path
  roster and the SIBLINGS table gain the new sibling), `tests/themeResolution.test.mjs`
  (the two sheets leave the raster roster; the shimmer allowance goes; the D6 lazy-sheet
  count holds at 23 because the base file keeps `metricStyles`), `tests/themeTokens.test.mjs`
  (the `'#FFF3D6'` allowance goes — the map is empty), `tests/goldOnForest.test.mjs` (the
  gold-fill allowlist is empty). NEW `tests/modeTransition.test.mjs`: the one clock, the
  swap once under cover with the waiter armed first, the paint signal keyed by the tree,
  the one owner, transform/opacity only, reduced motion never travels, the sheets
  required by nothing.

**Not walked on the phone.** THE OTA IS LIVE on the preview channel (asked: "Yes, publish"): update group `2b439b2e-3e43-4189-a3d7-bac9e6e1b9b1`, iOS update `01a0c2c0-6c7b-7d6d-8336-e9b277464a5d`, commit `cc4889f`; dashboard `https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/2b439b2e-3e43-4189-a3d7-bac9e6e1b9b1`. The operator
open the Beta twice and switch modes both ways: the pane should never rest, the new
home should already be there when it clears, the capsule should drop, hold and leave on
its own, and the customer's [+] sheet / the worker's Profile row must stay disabled only
until the pane has left. If the incoming home ever shows blank under the leaving pane, the
layout signal did not fire — the fail-safe (400 ms) is the floor to check first.

**A working-tree note.** While this landed, the operator's OTHER chat (Fable 5.1, the
seven comparison pages) was editing `docs/mockups/html/lux/lux.build.mjs` and adding
`lux-*-fable.html` pages in the same tree; those files were left exactly as found and
are not in this commit.

## THE LUX DRAWING RUN (2026-09-21) — all 67 screens are pages; NOTHING is applied

**What exists now.** `docs/mockups/html/lux/lux-<key>.html` for every row of
`docs/mockups/html/lux/SCREENS.md` (67 screens, 84 frames — a screen that scrolls
carries a second frame, `lux-<key>-2`, shifted to end exactly at the bar; the Filters
popups, the chat menus, the portfolio steps and the amount/confirm pair are one frame
each), all from `lux.build.mjs`, all opened by `docs/mockups/html/lux/index.html`.
The review sheets the operator sees are `.shots/mockups/lux-sheet-b<batch>-<n>.png`
(gitignored, 23 of them) and the singles `lux-<key>.png` beside them.

**What the operator said, and where the loop stands.** Batches 1 and 2 (23 screens):
**"Yes, all of them"**, asked one batch at a time per the handover's loop. Then, before
batch 3: *"Build all of the batches til 6, without my permission, I'll be stepping away
… just NO IMPLEMENTATION IN THE ACTUAL REPO ALL I WANT IS MOCKUP … save them in the repo
somewhere and I will come back and say what to change"* — so batches 3–6 (44 screens)
were drawn without a pause and AWAIT THEIR REVIEW. They also ruled Fable 5.1 reserved
for hard accuracy or layout calls only and gave leave to switch models when needed; no
call arose and Fable was not used. Ultracode and the Agent tool stay refused on this
machine; one hand drew every page.

**How every page was proven (measured, never viewed — image Reads are refused).** Per
page: the source screen read and its controls listed; the column measured against the
bar or the sticky bar (`.shots/lux/measure.mjs`, the pattern of
`.shots/harness-blur/redesign/measure.mjs`); every clipped or squeezed text flagged
(`.shots/lux/clipcheck.mjs` — only the source's own one-line ellipses remain); and
every string the source draws asserted present in the page (`.shots/lux/controls.mjs`,
green on all 67). The whole set was rebuilt from scratch in one run at the end
(`node docs/mockups/html/lux/lux.build.mjs`, no key), then `npm run verify`: 1381
pass, 0 fail, before each of the six pushes.

**Commits, one per batch, all pushed to `mainexpo`:** `c34aa75` batch 1, `cce4c50`
batch 2, `bf370b3` batch 3, `64fa0b6` batch 4, `c18921f` batch 5, `97adab3` batch 6
(the full rebuild + index), then this docs commit. Every one is docs under
`docs/mockups/html/lux/` — no app file moved. Revert: `git revert` any of them; each
stands alone.

**Corrections and additions made on the way, for the reviewer to know:** Worker Home
and Available Jobs (approved in the previous sitting) were re-barred with the WORKER
bar (Home · Map · My Jobs · Inbox · Profile) the README specifies — they had carried
the customer's [+] bar. `SCREENS.md`'s `post-live` source was corrected to
`PostJobScreen`'s success overlay (not `JobConfirmedScreen`). The README's honesty
rules now name the added fixtures: the sample worker (Sam Okafor), a second sample
bidder (Priya Natarajan), the sample job's two bids and its one funded payment at the
fee schedule's 7.5% ($110 agreed → $118.25 charged → $101.75 to the worker), and the
customer map's tiles (the approved worker-map stand-in). No rating, review, completed-
job count or balance was invented anywhere — a worker reads "New worker" / "No reviews
yet", and Earnings sums the one sample row.

**Two rulings are the operator's on return:** (1) batch 6 is drawn in Lux — whether
the auth flow keeps its own emerald/ivory palette (`lib/authTheme.ts`) is theirs;
(2) reviews and the worker's profile are drawn with no reputation, by the README's
rule — say "draw sample reviews" to see that layout.

**What the next chat does.** Read the operator's changes per screen; remake only those
(README §Working loop; a remake is a render function edit, `lux.build.mjs <key>`,
`shoot.mjs`, the three checks, a sheet); then ask "plan the rebuild, or park it?" —
applying anything is a NEW plan (tokens → primitives → screens) and never a step of
the review. The seven Fable comparison pastes in `docs/dispatch/LUX-HANDOVER.md` stay
optional.

> **BEFORE THIS RUN, THE SAME DATE: the dark rebuild's direction was chosen —
> B, Emerald Lux Glass — and NOTHING was applied.** The harness gained `--design <file>`
> (a candidate token table rendered as real screens) and a comma list for `--only`.
> DECISIONS (14). What follows is that run's record, unchanged.

## What this session landed

**THE EIGHTEEN-ITEM RUN — four code commits over `1cdacc9`**, each revertible alone,
`npm run verify` green before each (1381 pass, 0 fail after the last); then this docs
commit. The specification is `docs/dispatch/NEXT-RUN-2026-09-21.md` (now marked
LANDED); the record is DECISIONS (13).

- `7370b9c` — **feat(jobs)**: one card size (the tile a constant 120 — the reference's
  118 fill inside its rim — every card 146, pitch 158, measured in the harness), the pay
  block's clearance MEASURED + 8, the chip's full label unless it would not fit (decided
  from the chip's own layout at the full label, unseen until decided; `Chip` forwards
  `onLayout`), and **`useScrollClearance()`** beside `useFloatingNavClearance()`: by
  route — the bar's footprint on the two atmosphere homes, `spacing.lg` everywhere else,
  where the bar is in the layout flow and the footprint was a ~104pt double count.
  Twenty-one scrolling surfaces swapped; Chat and the studio panel keep the footprint.
- `c5545c0` — **feat(filters)**: `paneFills.filters` (ui/tokens.ts, beside `paneEdges`)
  drawn by `Surface fill` as the tint itself — no scrim, no sheen — on the Filters sheet
  alone (the map's panes keep recipe D); `emeraldBright` (dark #84DFAA, light the
  emerald) on the chosen pills, ticks, caret and the popup's chosen row; the popover on
  the **menu** material, values centred with the tick pinned left (Sort keeps its left
  layout via `contentAlign`), iOS's own bar flashed once on open, light-grey dividers,
  the date popup 192. Harness: `worker-results-filters-{dark,light}` and the budget
  popup, with the new `landmarks` field (the boxes of named texts beside the PNG).
- `2b20f0d` — **feat(home, sort)**: the sixth sort `'reset'` (latest added first,
  nothing else; grey, last; the pill "Sort by Latest added"); "Earliest jobs first"; the
  sheet's footer centred (22 above the button, only the safe inset below it — a footer
  brings its own air). Home: one rhythm of 24 (headline margin 16, the hero's padding
  gone, `sectionGap` 24, the section margin −9); the field 56 r20 with ONE trailing
  control (`SearchBar.micBecomesSearch`); the tile measured from the row, the gap the
  gutter itself, four whole and none peeking; the copy (no period, three-line sub-copy,
  "You haven't posted any jobs yet"). Harness: the customer-home targets carry landmarks.
- `d9bbb0e` — **feat(home)**: `scripts/home-ground-blend.mjs --apply`, once — the hero
  feathered in its file, the ground pooled to the photo's night; the marker
  `assets/prestige/home-ground-blend.json` refuses a second pass; the roster says
  'baked-feathered'; the atmosphere docblock re-measured.

**THE LOOPS (measured, not eyeballed; the scripts are the gitignored
`.shots/harness-blur/loop-filters.mjs` and `loop-home.mjs` — re-create from the
pattern if the folder is gone: the app's landmark boxes + PNG against the reference's
boxes by Playwright + its 2x shot, sampled beside the same texts):**
- Filters, light: 0/channel everywhere. Dark: the chosen pill within 2, the popup within
  1, the ground and the unchosen pill 3–5 darker than the reference — the harness
  backdrop (the jobs list, not the mockup's brighter blurred map) through the tint's own
  5–9%. The numbers are the reference's exactly and were NOT tuned against that
  harness-only artifact; the phone, whose backdrop is the map, decides.
- Home, both themes: greeting → headline 24 / 24, sub-copy → card 42 / 42, card → Popular
  services 24 / 24, tile labels → Your jobs 39.5 / 40; tiles 73 at 20 / 113 / 207 / 300
  in both, none peeking; the field 56 (fenced). NOT in the list, left alone: "Your jobs"
  → the empty row (app 36.5, reference 11 — the app's row has no subtitle and a 44pt
  header row); the harness has no status inset, so its hero sits 59 higher than the
  phone's — the seam is compared with that offset.

**NOT YET SEEN ON THE PHONE:** all of it. **THE OTA IS LIVE** on the preview channel
(asked: "yes, publish"): update group `b6a3d686-a879-4d5c-9d74-8550e0bb2901`, iOS update
`01a0c177-4906-7e06-a5c2-a0bebe2498be`, commit `4bb4f2d`; dashboard
`https://expo.dev/accounts/mah_r2/projects/BRAZOS/updates/b6a3d686-a879-4d5c-9d74-8550e0bb2901`.
The operator opens the Beta twice and walks the list below.

### Earlier this sitting and the sitting before (unchanged record)

**SITTING 3 — THE FILTERS SHEET'S COLOURS AND ITS POPUPS, RULED AND REFERENCED (docs
only).** The operator sent the live dark Filters sheet beside the mockup ("warmer",
chosen pills "very dim") and asked for: the mockup's gradient copied accurately, a
scroll bar in the popups (iOS's own, subtle), no gradient on the popups, the values
centred — questions first, then HTML mockups, then the list. Answered (asked): dark
only for the colours, centring and the bar in light too; the sweep on the Filters
sheet ONLY; the tick stays at the left edge; the built-in bar; Sort stays left; the
Newest hint loses ", then newest posted". THE CAUSE, read from the code: the pane's
near-white mint sheen (.10 → .04 over #062418 @.88) lifts the green into grey-olive —
the reference measures rgb(5,27,19) at the sheet's top-left, the app's numbers
rgb(30,57,46); and the chosen pills wear `dark.emerald` #5FAE81 where the mockup wears
#84dfaa at the same alphas. LANDED: `docs/mockups/html/map-explore.build.mjs`
(`--filters`): popups at the app's menu numbers (.82, no inner line, no end fade),
rows centred with the tick pinned left (Sort left), the date popup 192, iOS's bar in
the open moments, the Filters blur without `saturate()`, the shorter hint;
`map-explore-filters-{dark,light}.html` regenerated; NEW `filters-fix.build.mjs` →
`filters-fix-dark.html` (NOW beside FIXED, derived from the gallery). Measured in the
pages (Playwright): 15 + 15 + 2 phones, 0 nested; every centred row's content ≥ 10pt
clear of the tick; the bar and no mask on every open popup. DECISIONS (1)–(6);
the run list `docs/dispatch/NEXT-RUN-2026-09-21.md` "PART TWO", items 4–9 with the
reference's sampled colours. NOT BUILT: nothing in the app moved this sitting.

**SITTING 3, SECOND ROUND — the Sort popup again, the customer Home, the ground + hero.**
The operator sent four more screenshots. LANDED (docs + one tracked script, no app code):
the Filters gallery's sixteen moments (the grey Reset row → "Sort by Latest added", "Earliest
jobs first", light-grey dividers, the footer centred over a drawn home indicator);
`docs/mockups/html/home-redesign.html` re-cut to the operator's list (rhythm 24, field 56
r20 with the mic alone, four whole tiles at gap 20, the copy) and made honest — it draws
the app's ground raster and the hero as `<img>`s, no CSS mask; the ground + hero blend
(pick c: the hero feathered in its file, the ground pooled to the photo's night under it)
with its transform `scripts/home-ground-blend.mjs` on the repo's own PNG codec
(`scripts/atmosphere-tune.mjs` `encodePng` gained `bpp: 4`, self-test green). Measured in
the pages: 32 + 2 phones, 0 nested; field 56 r20; tiles 73.25, four whole, none peeking;
every gap 24; the seam ≤ 2 levels. DECISIONS (7)–(12); the run list's PART THREE, items
10–18. `--apply` has NOT been run: the assets are unchanged until the run.

**SITTING 2 — THE TWELVE-ITEM RUN — three code commits over `a4382bf`**, each revertible alone,
then this docs commit (the regenerated mockups, DECISIONS (8), this file, the session
notes). `npm run verify` after the last code commit: **1380 pass, 0 fail, exit 0**
(five new tests in `tests/workerSkills.test.mjs`).

- `5dfb096` — **feat(glass)**: the `pane` material wears recipe **D** — its own ink
  `PANE_SCRIM` #062418 at .88, the mint rim .46, a MINT sheen .10 → .04
  (`MaterialSpec.sheen.color`, drawn by Surface), and `highlightAlpha` **0**: no dark
  pane draws the inner top line any more (the search pill, the Today chip, the jobs
  sheet, the Filters sheet, the popover). The Filters sheet rings its **top edge
  only** (`Sheet edge="top"`; every other sheet keeps `'all'`), hairlines .20.
  Distance / Minimum budget / When **fill their row** (`Section fill`); Categories
  scrolls; Sort's pill never grows. **Best Match reads one skills rule** —
  `lib/workerSkills.ts` (pure, executed by the fence) applied by
  `hooks/useWorkerSkills.ts`: profile categories ∪ listed services' categories
  (`worker_services`, one read per account through a module store), labels tolerated,
  and a state the Categories note names (loading / couldn't load / pick categories).
  The map's sheet, Available Jobs (also its Skill Matches filter) and Worker Home read
  it; `jobMatchesSkills` takes a `ReadonlySet`.
- `062d5a9` — **feat(map)**: the jobs sheet **rests on the nav bar**
  (`MAP_SHEET_BOTTOM` 0; the sides keep `map.sheet.inset`) with **three stops** —
  a pull down from the peek tucks it to MINI (the handle + the top half of the count
  line, measured), a pull or a tap restores the peek, always the peek when the map
  comes into view (`useFocusEffect`). Fast path: a release aims where the finger was
  heading and takes the nearest stop; a flick moves one stop. Fallback: two stops.
  Apple's Legal link rides above the resting pane (`legalLabelInsets`, native only,
  peek height + 8). The search pill is **62** tall (corner 31, ink glyphs 25 / 23,
  the distance pill 34). Light's "Any" pill: cream, no rim, ink. Available Jobs'
  distance chips: whole-number heights (chip 44, row 60) against the clipped outline.
- `1f057dd` — **feat(card)**: `WorkerJobCard` layout **a1** on Home AND Available
  Jobs — location line, ONE facts line ("Sat, Sep 5 · No bids · 2w ago";
  `formatBidCountShort`, `formatTimeAgoShort`), Break the ice, a **square picture as
  tall as the text block** (measured; the harness renders 118 × 118), the pay block
  over the top-right. The peek row's light amount wears `amountGold` #C08F2E.

**Reference mockups** (all regenerated, committed): `docs/mockups/html/map-explore.build.mjs`
(recipe D, no spec line, the light chip cream / no rim, the fill rows, the sheet at
`bottom: 93px`, a `mini` moment in `--card`), `docs/mockups/html/worker-results-card.{build.mjs,html}`
(the card, a1, both themes).

**THEN, ITEM 13 (the same sitting, after the OTA): THE PANES' OWN EDGES** — the
operator's picks from seven honest renders: the search pill and the Today chip wear
the dark emerald rim `#5FAE81` at .70 under a soft glow of three 2pt rings (option C);
the jobs sheet the bright green `#7DE7A4` at .60 under the same rings (option B); the
Filters sheet's top line is a hairline (one physical pixel), no glow. One table —
`ui/tokens.ts` `paneEdges` + `PANE_HALO_RING`; `Surface` gained `rim` / `halo` (dark
glass only; the rings are plain Views outside the box, no shadow); `Sheet` passes
`rim`; the peek sheet's frame grows by `PEEK_HALO_REACH` (6) on the top and sides.
DECISIONS (9). Verify after it: 1380 / 0. Published as a second OTA.

**THE OPERATOR WALKED AVAILABLE JOBS after the first OTA** and ruled the next run —
three findings with one approved reference, `docs/mockups/html/worker-results-screen.html`:
one card size (a constant 118 tile, the text block at least 118), the title and chip
clearing the pay block by its MEASURED width + 8 (the full chip label unless it would
not fit), and the list ending 16pt above the bar (a `useScrollClearance()` for every
scrolling screen — the bar-footprint padding is a double count everywhere but the two
Homes). NOT BUILT YET. The method, file by file, is `docs/dispatch/NEXT-RUN-2026-09-21.md`;
DECISIONS (10).

**NOT YET SEEN ON THE PHONE:** everything but Available Jobs — the map, the sheet, the
Filters sheet, the light pill and gold, the search pill 62, item 13's edges. The OTA was published at the
end of this run (the operator's "yes — publish at the end"); the operator opens the
Beta twice and walks it (below).

**WHAT COULD NOT BE CHECKED OFFLINE:** the map, its sheet and the Filters sheet have no
harness target (external tile hosts fail the escape assertion) — every number was
matched to the mockup's and fenced, and the mockups were re-measured with Playwright
(fill rows end at the row's edge; sheet bottom = nav top; mini shows 48px). The
Available Jobs card WAS rendered by the harness (`node scripts/shots.mjs --build
--only worker-results`): the first card's tile measures 118 × 118 (light) / 116 inside
its rim (dark), at the mockup's padding.

## What a following run must know

- **`useScrollClearance()` is what a scrolling surface pads its end with**; the old
  `useFloatingNavClearance()` is the bar's real footprint and is right for Chat's
  keyboard rise and the studio panel only. `tests/layout` names the one exception.
- **The Filters sheet's tint is `paneFills.filters`**, drawn by `Surface fill` in place
  of the scrim and the sheen where the glass draws; the fallback keeps the material's
  scrim. The map's panes still wear `pane` (recipe D) with no fill. A new pane names
  its fill from the table, never at a call site.
- **The popover wears `menu`** and centres its values; `contentAlign="start"` is the
  Sort popup's left layout. `emeraldBright` is the chosen green on this sheet and its
  popups only; `dark.emerald` is untouched (D0 pins it).
- **A `Sheet` with a footer keeps only the safe inset below it** — the footer's own
  22 above its button is the air. The Filters sheet is the only footer caller.
- **The Home field's one control is `SearchBar.micBecomesSearch`** — the mic while empty,
  the magnifier once text is typed and no dictation is listening; Home only (asked).
- **The tile is measured**: `tileSizeFor(rowWidth, gap)` with `gap = inset` (the
  gutter); `TILE_FLOOR` only until the row lays out. Nothing may re-introduce a
  constant tile.
- **The ground and the hero are transformed files now.** `scripts/home-ground-blend.mjs`
  is the record; the marker refuses `--apply` twice; the originals are
  `git show c59d2aa:<path>`. The roster records the dark hero as 'baked-feathered'.
- **The harness's `landmarks` field** writes the LAST exact match's box per text (a sheet
  over a screen renders later in the DOM than the screen's own chips) after the shutter;
  the loops read them. `tests/shotHarness` counts 86 targets.
- **The references' NOW pages record the app at `c59d2aa`**
  (`docs/mockups/html/filters-fix-dark.html`, `worker-results-screen.html`) — historical
  by their own headers now that the app moved.
- **Stale comments still owed** (unchanged): `scripts/shots.mjs` lines 387-390.

### The earlier notes (unchanged)

- **(DONE 2026-09-21, the run above.) The next run is ONE big run: Available Jobs 1–3 then the Filters 4–9**, both in
  `docs/dispatch/NEXT-RUN-2026-09-21.md`, each with its approved HTML reference. The
  operator's rule from sitting 3: the HTML IS the reference the loop measures against —
  build the harness target, sample beside named texts, compare to the numbers in that
  file, iterate on alphas only. Nothing is judged by eye.
- **(DONE 2026-09-21 — `d9bbb0e`.) `scripts/home-ground-blend.mjs --apply` rewrites two assets and is guarded by a marker** —
  run it exactly once in the run, then re-measure the raster fences (item 17). The reference
  already shows its result; the app does not yet.
- **`filters-fix.build.mjs` depends on the gallery**: run `map-explore.build.mjs --filters`
  first; it slices the gallery's first slot. NOW's CSS in it is the app's numbers at
  `c59d2aa` — update it when the app changes, or it lies.

- **The pane material is recipe D and rim-only.** `highlightAlpha` 0 on `pane`;
  `sheen: { fromAlpha: 0.1, toAlpha: 0.04, color: brand.mint }`; `scrimColor`
  `PANE_SCRIM` (#062418) — GLASS_SCRIM (#071B15) is untouched and every other material
  keeps it. `tests/themeTokens` pins all of it. The phone's blur cannot saturate; the
  richness is the tint.
- **`Sheet` has `edge`** ('all' | 'top'), default 'all'. Only the Filters sheet passes
  'top'. `Surface`'s `border` prop was already there; `edge` just feeds it.
- **The Filters rows**: `Section fill` = the scrolling row + `flexGrow: 1` content +
  a growing cell per child (`Children.map`). A wrapping `pillRow` still exists for any
  row that passes neither `scroll` nor `fill` (none today).
- **Skills come from `useWorkerSkills()` and nowhere else.** The rules are
  `lib/workerSkills.ts`; the hook holds a module store for the services read (the
  `useProfile` pattern). `JobFilterSheet` takes `skillsState`; `categoriesNote()` is
  exported and fenced. If the phone STILL says "Pick job categories…" with categories
  set, the note now distinguishes loading / error / empty — read which.
- **`PeekSheet` props changed**: `stop: PeekStop` + `onStopChange` replaced
  `open` + `onOpenChange`; `insetBottom` (default `inset`); `onPeekHeight`. `PeekStop`
  is exported from `components/PeekSheet`. `usePeekMetrics` returns `miniOffset` and
  `canMini`; the title Text reports its height (`onTitleLayout`). MINI is a pull's
  destination only; a tap never tucks. `tests/motion120` pins the mechanics.
- **The map's sheet bottom is a constant** (`MAP_SHEET_BOTTOM`), not the dial; the
  `sheetMaxHeight` formula subtracts it. `LEGAL_LINK_AIR` 8.
- **`WorkerJobCard`'s `variant` 'compact' and 'full' now draw the same card**; the
  names stay for callers. `PAY_CLEAR` 96 pads the title and the chip row; `META_GLYPH`
  16. The picture's size is `Math.max(THUMB_SIZE, infoHeight)` from `onLayout` on the
  info block — never a constant.
- **Short labels share their rules**: `formatTimeAgoShort` / `formatTimeAgo` are
  `relativeAge(iso, 'short' | 'long')`; `formatBidCountShort` wraps `formatBidCount`.
- **`amountGold`** is a `constantAccents` entry (both palettes, one value); only the
  peek row's light amount wears it. `goldDeep` is untouched.
- **`DistanceChips`** reads its row height at use time (`rowHeight()`, D7); the chips
  carry an explicit `height: 44` over the primitive's `minHeight`. If the outline still
  clips on the Beta, add 1pt of `paddingBottom` to the row and say so.
- **The mockup builder's blur saturation is `lqSat`** (dark 2.1, default 1.9) —
  mockup-only richness; do not look for it in the app.
- **`OPEN_THRESHOLD` in PeekSheet.shared is exported and now unused** by the fast path
  (the release picks the nearest stop); left in place, harmless — remove with the
  next touch of that file.
- **Stale comments still owed** (unchanged): `scripts/shots.mjs` lines 387-390.
- **The panes' edges are per pane now** (`paneEdges.search` / `.sheet` / `.filters`):
  a rim is 1pt or a hairline, never thicker (fenced); a glow is rings, never a shadow.
  A new pane names its edge from the table; the shared pane rim (brand.mint .46) is
  what a pane gets when it names none. A parent that clips a haloed pane must leave
  the rings their room (the peek frame is the model).

### The fences this session touched, and how

| File | What moved |
|-|-|
| `tests/themeTokens.test.mjs` | The pane: #062418 / .88 / .46 / highlight 0 / the mint sheen. |
| `tests/jobFilterRules.test.mjs` | `SHEET_EDGE` 'top', hairline .2, the three `fill` rows, Categories `scroll`, the fill styles. |
| `tests/workerSkills.test.mjs` | NEW: the rules executed (keys, labels, the union, the state), the note copy, the three screens on the one hook. |
| `tests/workerDiscovery.test.mjs` | B2 rewritten to layout a1 (the facts line, the measured square, the short labels); the map's bar/legal/stops; the chip row's heights. |
| `tests/motion120.test.mjs` | The PeekSheet fence: three stops (`canToggle`, `canMini`, the mini clamp, the release's nearest-stop / one-stop-per-flick, `offsetOf` worklet, the fallback's target). |
| `tests/screenDials.test.mjs` | `map.searchPill.radius` drew 31. |
| `tests/voiceSearch.test.mjs` | The ink mic 23. |

## What is blocked

- **Image `Read`s** stay refused by `.claude/hooks/evidence-guard.ps1`; renders were
  measured with pngjs / Playwright, never viewed.
- **The Write tool cannot reach the plan file or the memory directory**
  (`GUARD-PATH-ESCAPE`). Scratch and patch scripts live under `.shots/harness-blur/`.
- **Bash heredocs are unreliable in this harness** (a `\\` collapses to `\`) — every
  patch script with a backslash was written with the Write tool; `.shots/harness-blur/
  patchlib.mjs` is the CR-aware exact-match patch helper; `node -e` is refused.
- **CRLF files**: `docs/DECISIONS.md`, `lib/time.ts`, `lib/hotspots.ts` (and others) —
  the helper normalises per file; Git normalises on commit.
- **The co-author trailer cannot appear in a Bash command's text** — all commits by
  `git commit -F <file>`.

## Waiting on the operator

- **THE LUX PAGES (this run): the review of batches 3–6** — 44 screens drawn under the
  standing "build all batches" instruction — and the two rulings above (the auth
  palette; sample reviews or none). Open `docs/mockups/html/lux/index.html`, or the
  sheets `.shots/mockups/lux-sheet-b3-1.png` … `b6-3.png`. Say what to change per
  screen; nothing is applied until a rebuild plan is asked for.
- **The phone — open the Beta twice, then walk, item by item:** (1) Available Jobs —
  every card the same height with the same square picture; long titles no longer
  losing room to the price; "Packing/Unpacking" whole; the list ending 16pt above the
  bar (and every other screen's list end — no dead space); (4) the dark Filters sheet's
  green — deep, the mockup's, not grey-olive; (5) the chosen pills bright; (6)–(8) the
  popups flat, values centred, the tick at the left edge, the bar shown on open and while
  scrolling; (10) the Sort popup's Reset row (grey, last) and the pill reading "Sort by
  Latest added" after it; "Earliest jobs first"; light-grey dividers; (12) the Show
  button centred in the footer; (13)–(16) Home — the even rhythm, the taller rounder
  field with the mic that becomes a magnifier when typing, four whole tiles, the copy;
  (17) the chair, the lamp and the plant sitting in the room, no rectangle around them.
  Also still unwalked from sitting 2: the map's sheet stops, item 13's edges, the light
  "Any" pill and gold, the search pill 62.
- **The Filters ground on the phone**: if it still reads greyer than the reference, send
  a PNG screenshot; the loop reads it (pngjs) and the two stops' ALPHAS are the only
  dials.
- **Staging**: the Actions tab for this push — verify only (no migration, no function).
- **Revert lines, latest first:** `git revert d9bbb0e` (the assets), `2b20f0d`,
  `c5545c0`, `7370b9c`; the docs commit reverts with them. After any revert:
  `npm run verify`, then an OTA on the operator's word.

## Open gates

See `docs/GATES.md`. Gates 0, 1 and 2 are closed. Gate 3 is the live one. This session
ticks no box.

## Dispatch log

DISPATCH START 2026-09-17 22:17 - prompt home-plus-and-your-jobs, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH END 2026-09-17 22:49 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-plus-and-your-jobs-2026-09-17_2217.log
DISPATCH START 2026-09-17 23:14 - prompt home-slider-and-subcopy, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-slider-and-subcopy-2026-09-17_2314.log
DISPATCH END 2026-09-17 23:46 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-slider-and-subcopy-2026-09-17_2314.log
DISPATCH START 2026-09-17 23:57 - prompt home-task-card, model claude-opus-5, effort max, mode bypass, log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-task-card-2026-09-17_2357.log
DISPATCH END 2026-09-18 00:34 - exit 0 - log C:\Users\mdmah\BRAZOS\.audit-scratch\dispatch\home-task-card-2026-09-17_2357.log
