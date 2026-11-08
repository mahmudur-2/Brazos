import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/**
 * Stage 4D batch 1a — the new Worker Home dashboard.
 *
 * What must stay true:
 *   1. The worker Home stack roots at WorkerHome — explicitly, via
 *      initialRouteName — and every job-list intent lands on WorkerResults.
 *   2. The availability toggle is the phase53 profiles.accepting_work field
 *      through the existing updateProfile() path — AVAILABILITY, not
 *      presence. The 4D-6 card renders it as operator-authored status copy
 *      ("Online"/"Offline", "Visible to customers"/"Not visible to
 *      customers" — master 43's own caption, which outranks the earlier
 *      two-word draft). The words follow the master; the fact behind them is
 *      still accepting_work — the device-local availability hook was deleted
 *      in Batch F.
 *   3. Every figure comes from an existing source: openJobsPotential() from
 *      lib/earningsMath.ts, jobMatchesSkills() for the skill count, phase41's
 *      jobs_within_radius (via lib/hotspots) for the nearby count — the same
 *      sources WorkerResults itself renders from.
 *   4. Mode changes only through switchMode(); the screen never drives the
 *      transition overlay itself.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const screen = await read('screens/WorkerHomeScreen.tsx');
const workerRoot = await read('navigation/WorkerRoot.tsx');
const code = stripComments(screen);

test('WorkerHome roots the worker stack and View all lands on WorkerResults', () => {
  const home = workerRoot.indexOf('name="WorkerHome" component={WorkerHomeScreen}');
  assert.ok(home > 0, 'WorkerHome must be registered');
  // 4D-1b D6: the landing route is an explicit contract, not a side effect
  // of declaration order.
  assert.match(workerRoot, /initialRouteName="WorkerHome"/);
  // Every job-list intent resolves to the one list surface.
  assert.match(code, /navigation\.navigate\('WorkerResults', \{ mode: 'all' \}\)/);
});

test("the search field mirrors the locked 48's dispatch and sits above the toggle", () => {
  // 4D-1b D2: the one route to WorkerResults mode 'search', byte-for-byte
  // the locked screen's own param shape — trim first, never dispatch empty.
  assert.match(code, /const trimmed = query\.trim\(\);/);
  assert.match(code, /if \(!trimmed\) return;/);
  assert.match(
    code,
    /navigation\.navigate\('WorkerResults', \{ mode: 'search', query: trimmed \}\)/
  );
  assert.match(screen, /placeholder="Search for jobs or areas"/);
  // Placement (4D-4 device pass): greeting row, then the hero headline,
  // then search, then the summary card that now carries the toggle.
  const greeting = screen.indexOf('styles.greetingRow');
  const hero = screen.indexOf('styles.heroBlock');
  const search = screen.indexOf('styles.searchField');
  const card = screen.indexOf('styles.summaryCard');
  assert.ok(greeting > 0 && hero > greeting && search > hero && card > search,
    'the search field must sit between the hero block and the summary card');

  // 2026-08-23 — THE FIELD IS OUTLINED, NOT A FLOATING CARD, and this screen
  // keeps its own copy of the style, which is exactly why it was missed when
  // the customer field was fixed. `colors.surface` + `shadows.card` is a white
  // elevated card in light (#FFFFFF on a #F4F1E8 ground) and very nearly
  // nothing in dark, because a #10261D shadow at 0.08 opacity over #02110D has
  // no contrast to spend. That is two designs sharing one token, not one
  // design in two palettes.
  const field = /searchField: \{([^}]*)\}/.exec(screen)[1];
  assert.match(field, /backgroundColor: 'transparent'/, 'the field must not carry a fill');
  assert.doesNotMatch(field, /shadows\.card|elevation|shadowOpacity/, 'an outlined field does not float');
  assert.match(field, /borderWidth: 1/);
  assert.match(field, /borderColor: colors\.border/, 'the hairline is the palette border in both themes');
});

test('the service row mirrors customer Home and lands on WorkerResults seeded', async () => {
  // 2026-08-22: the row under the worker search bar is customer Home's row.
  // It was two rows of chips held byte-identical across the two stylesheets;
  // 2026-09-17 RE-POINTED this test, on operator instruction, at what
  // replaced them — ONE shared component, components/ServiceTileRow.tsx, a
  // sliding row of every service — so the purpose is unchanged (the two rows
  // cannot drift) and the mechanism is now a single file rather than two
  // copies the fence had to hold together.
  //
  // 1. BOTH SCREENS RENDER THE SHARED COMPONENT, and neither keeps a chip row
  //    or its styles. Customer Home passes the heading; worker Home passes
  //    none (its row sits under its search field).
  const customer = stripComments(await read('screens/HomeScreen.tsx'));
  for (const [path, source] of [
    ['screens/WorkerHomeScreen.tsx', code],
    ['screens/HomeScreen.tsx', customer],
  ]) {
    assert.match(source, /import \{ ServiceTileRow \} from '\.\.\/components\/ServiceTileRow';/, path);
    assert.match(source, /<ServiceTileRow\b/, `${path} must render the shared row`);
    assert.doesNotMatch(source, /HOME_SERVICE_ROWS|<Chip\b|components\/Chip'/, `${path} must not keep a chip row`);
    assert.doesNotMatch(
      source,
      /serviceRows:|serviceRow:|serviceChip:|compactServiceChip:|goldOutlineChip:|otherChip:/,
      `${path} must not keep a chip-row style — an entry that draws nothing is a lie`
    );
    // Each screen's tap lands on ITS OWN action, and "Other" still opens ITS
    // OWN sheet — the row hands both taps back. 2026-09-26 (the refresh,
    // audit M-12): customer Home's action is a job draft in that category
    // (Home is posting); worker Home's is still its search.
    const action = path === 'screens/HomeScreen.tsx' ? 'startCategoryDraft' : 'searchCategory';
    const element = /<ServiceTileRow\b([\s\S]*?)\/>/.exec(source)?.[1];
    assert.ok(element, `${path}: the row element must close`);
    assert.match(element, new RegExp(`onSelect=\\{${action}\\}`), `${path}: a tile runs the screen's ${action}`);
    assert.match(element, /onOther=\{\(\) => setMoreOpen\(true\)\}/, `${path}: Other opens the screen's sheet`);
    assert.match(source, /<ServicePickerSheet/);
    // 2026-09-28 (LUX-LIST-64 #13): the customer Home's sheet is "All services"
    // for real — every tile in the row's order, then Other (lib/skillCategories
    // ALL_SERVICES), behind both "View all →" and the Other tile; worker Home's
    // sheet keeps the eighteen.
    assert.match(
      source,
      path === 'screens/HomeScreen.tsx' ? /services=\{ALL_SERVICES\}/ : /services=\{MORE_SERVICES\}/
    );
    assert.match(
      source,
      new RegExp(`onSelect=\\{\\(categoryKey\\) => \\{\\s*setMoreOpen\\(false\\);\\s*${action}\\(categoryKey\\);\\s*\\}\\}`),
      `${path}: the sheet's rows run the same ${action} a tile does`
    );
  }
  const customerRow = /<ServiceTileRow\b([\s\S]*?)\/>/.exec(customer)[1];
  const workerRow = /<ServiceTileRow\b([\s\S]*?)\/>/.exec(code)[1];
  assert.match(customerRow, /heading="Popular services"/);
  assert.doesNotMatch(workerRow, /heading=/, 'worker Home passes no heading');
  assert.match(customerRow, /inset=\{design\.screenPadding\}/, "the customer inset is the column's own padding");
  assert.match(workerRow, /inset=\{contentPaddingX\}/, "the worker inset is the column's own padding");

  // 2. THE TILE SET is built from the two shared lists, in their order, and
  //    the component draws "Other" last. lib/skillCategories.ts is EXECUTED
  //    so the list is proven on the real constants, not on a regex.
  const { stripTypeScriptTypes } = await import('node:module');
  const categoriesJs = stripTypeScriptTypes(await read('lib/skillCategories.ts'), { mode: 'strip' });
  const { HOME_QUICK_SERVICES, MORE_SERVICES, HOME_SERVICE_TILES } = await import(
    'data:text/javascript;charset=utf-8;base64,' + Buffer.from(categoriesJs, 'utf8').toString('base64')
  );
  assert.deepEqual(
    HOME_SERVICE_TILES.map(({ key, label, icon }) => ({ key, label, icon })),
    [...HOME_QUICK_SERVICES, ...MORE_SERVICES],
    'every tile carries an entry\'s own key, label and icon, in the two lists\' order'
  );
  // The operator's 25 labels (docs/dispatch/home-slider-and-subcopy.md B2),
  // the twenty-fifth being the component's own "Other".
  assert.deepEqual(HOME_SERVICE_TILES.map((t) => t.tileLabel), [
    'Assembly', 'Moving', 'Cleaning', 'TV mounting', 'Plumbing', 'Yard work',
    'Repairs', 'Electrical', 'Painting', 'Appliances', 'Junk removal', 'Shelf hanging',
    'Pressure washing', 'Gutters', 'Carpet cleaning', 'Windows', 'Pest control', 'Organizing',
    'Landscaping', 'Snow removal', 'Pet sitting', 'Errands', 'Packing', 'Drywall',
  ]);
  assert.equal(HOME_SERVICE_TILES.length, 24);
  assert.doesNotMatch(
    stripComments(categoriesJs),
    /HOME_SERVICE_ROWS/,
    'the two-row arrangement is gone with the chips'
  );

  const row = stripComments(await read('components/ServiceTileRow.tsx'));
  assert.match(row, /HOME_SERVICE_TILES\.map\(\(service\) =>/);
  const tiles = row.indexOf('HOME_SERVICE_TILES.map(');
  const other = row.indexOf('accessibilityLabel="Other services"');
  assert.ok(tiles > 0 && other > tiles, 'the "Other" tile is drawn after every service tile');
  assert.match(row, /name="ellipsis-horizontal"/, 'Other carries the mockup\'s glyph');
  assert.match(row.slice(other), /Other\s*<\/Text>/);
  assert.match(row, /onPress=\{onOther\}/);
  assert.match(row, /onPress=\{\(\) => onSelect\(service\.key\)\}/);
  assert.match(row, /accessibilityHint="Opens the full list of services"/);
  // The tile draws the short label and announces the full name.
  assert.match(row, /\{service\.tileLabel\}/);
  assert.match(row, /accessibilityLabel=\{service\.label\}/);
  // The heading is the customer Home's own section heading, and both are the
  // ONE eyebrow (2026-09-27, the Lux remake, ruling 4: every small section
  // heading is the Lux eyebrow — gold in dark, emerald in light through the
  // `eyebrow` role — one measure, lib/theme.ts EYEBROW_TYPE), so the two
  // cannot drift.
  assert.match(customer, /sectionTitle: \{\s*\.\.\.EYEBROW_TYPE,\s*(?:\/\/[^\n]*\s*)?color: colors\.eyebrowGold,/ /* 2026-09-29 (LUX-LIST-2 #4): Home's section titles are kept-gold labels */);
  // 2026-09-29 (LUX-LIST-2 #4): POPULAR SERVICES is one of the 25 kept-gold labels.
  assert.match(row, /heading: \{\s*\.\.\.EYEBROW_TYPE,\s*(?:\/\/[^\n]*\s*)?color: colors\.eyebrowGold,/);

  // 3. THE DISPATCH: the existing WorkerResults surface with a category seed —
  //    no new screen — and the seed is allow-listed against the category map,
  //    feeding the SAME filter model the sheet's own category chips drive.
  assert.match(
    code,
    /navigation\.navigate\('WorkerResults', \{ mode: 'all', category: categoryKey \}\)/
  );
  const results = stripComments(await read('screens/WorkerResultsScreen.tsx'));
  assert.match(results, /params\.category != null && params\.category in JOB_CATEGORY_LABELS/);
  assert.match(results, /categories: new Set<JobCategory>\(\[params\.category as JobCategory\]\)/);
});

test('the toggle is phase53 accepting_work through the existing profile path', () => {
  assert.match(code, /profile\?\.accepting_work \?\? true/);
  assert.match(code, /updateProfile\(user\.id, \{ accepting_work: next \}\)/);
  // The status words render the SAME availability fact. 2026-09-26 (the
  // refresh, audit M-13): 4D-6's "Online"/"Offline" and "Visible to
  // customers" promised a consequence the flag never had — accepting_work is
  // shown on the profile and never hides anyone — so the card now says what
  // Services & availability says. (The device-local presence hook was
  // deleted in Batch F.)
  assert.match(code, /\{accepting \? 'Open' : 'Paused'\}/);
  assert.match(
    code,
    /\{accepting \? 'Shown as available on your profile' : 'Offers still reach you'\}/
  );
  assert.doesNotMatch(code, /Visible to customers|Not visible to customers|'Online'|'Offline'/, 'the untrue words stay gone');
  // The toggle keeps its accessible name — the heading it echoed is gone.
  assert.match(screen, /accessibilityLabel="Taking new work"/);
});

test('every figure derives from an existing source, none is invented', () => {
  assert.match(code, /openJobsPotential\(jobs, profile\?\.id\)/);
  assert.match(code, /jobMatchesSkills\(job, myCategories\)/);
  assert.match(code, /fetchJobsWithinRadius\(/);
  assert.match(code, /NEARBY_RADIUS_MILES/);
  // The nearby check never prompts on mount — permission is only read.
  assert.match(code, /getForegroundPermissionsAsync\(\)/);
  // No placeholder marketplace data: the skill pill degrades to an honest
  // instruction, not a fake count — and since 2026-09-26 (the refresh, audit
  // M-29) that instruction opens the profile editor where skills are picked.
  assert.match(screen, /: 'Add your skills';/);
  assert.match(code, /: navigateAcrossTabs\('Profile', 'ProfileMain', \{ edit: true \}\)/);
});

test('mode changes only through switchMode(), and layout follows the tab rules', () => {
  // 2026-09-28 (LUX-LIST-64 #61): Worker Home no longer changes mode at all —
  // its "Switch to Customer" pill left, and the way back is Profile's mode row,
  // which confirms through switchMode() (tests/emeraldFences home(17)).
  assert.doesNotMatch(code, /switchMode|useMode\(/);
  assert.doesNotMatch(code, /useModeTransition/);
  assert.match(code, /edges=\{\['top'\]\}/);
  assert.match(screen, /paddingBottom: 0/);
});

// ===========================================================================
// 4D-4 device pass — the approved worker-home anatomy (mockup 43), with the
// presence vocabulary still banned and the dark-palette defect resolved by
// construction: the summary card sits on surface with a gold hairline, so
// gold-family text can never land on a forest fill (gold in dark) here.
// ===========================================================================

test('the hero headline and subtitle render, second sentence on the GREEN accent', () => {
  assert.match(screen, /Get hired\./);
  assert.match(screen, /Get paid\./);
  assert.match(screen, /Grow your reputation\./);
  // The serif treatment is the customer Home headline's token usage,
  // mirrored: display face, 39/45, -0.3 tracking, ink.
  assert.match(code, /heroHeadline: \{\s*fontFamily: fonts\.display,\s*fontSize: 39,\s*lineHeight: 45,\s*fontWeight: '600',\s*letterSpacing: -0\.3,\s*color: colors\.ink,/);
  // The accent is emerald — the palette's green in BOTH modes — never
  // forest, which is the gold primary under Prestige.
  assert.match(code, /heroHeadlineAccent: \{ color: colors\.emerald \}/);
  // The toolbox art beside the master's headline is the OPERATOR's asset,
  // now placed (assets/prestige). Nothing is invented or sourced elsewhere.
  // Home parity 2026-08-22: the art renders in BOTH themes — one composition,
  // one 58% copy column — and its baked halo is recorded as an asset property
  // for the operator's light device pass, not re-gated here.
  const assets = [...code.matchAll(/require\('([^']*\.(?:png|jpe?g|webp|gif))'\)/g)]
    .map((m) => m[1]);
  assert.deepEqual(assets, ['../assets/prestige/hero_toolbox_worker.webp']);
  assert.match(code, /<Image\s+source=\{PRESTIGE_TOOLBOX_ART\}/);
  assert.doesNotMatch(code, /\{isDark \? \(\s*<Image/, 'the art is one composition, both themes');
  assert.match(code, /heroCopy: \{ gap: spacing\.sm, maxWidth: '58%' \}/);
  assert.doesNotMatch(code, /heroCopyDark/);
  assert.doesNotMatch(code, /ImageBackground/);
});

test('the summary card: surface fill, card-rim hairline, divided halves, chips inside', () => {
  // Surface + hairline — the e195012 construction. Nothing on this
  // screen may fill with forest at all. 2026-09-27 (the Lux remake): the
  // hairline is the card rim (`colors.border`), never the gold line — gold
  // is for labels, eyebrows, money and the name in dark (ruling 4).
  assert.match(code, /summaryCard: \{[^}]*borderColor: colors\.border/s);
  assert.match(code, /summaryCard: \{[^}]*backgroundColor: colors\.surface/s);
  assert.doesNotMatch(code, /backgroundColor: colors\.forest/);
  // The money figure is the green accent, the section label gold — both on
  // surface, both palette reads; money still formats only through
  // formatBudget().
  // 2026-09-28 (LUX-LIST-64 #40, #48): money is white (`money`); the label reads
  // the eyebrow role (gold in dark, the antique gold #86641A in light).
  assert.match(code, /earningsAmount: \{[^}]*color: colors\.money/s);
  assert.match(code, /summaryEyebrow: \{[^}]*color: colors\.eyebrow/s);
  assert.match(code, /formatBudget\(potential\.cents\)/);
  // The divided row: two halves split by a vertical divider.
  const order = ['styles.summaryRow', 'styles.availabilityHalf', 'styles.summaryDivider', 'styles.earningsHalf']
    .map((marker) => screen.indexOf(marker));
  assert.ok(order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    'the summary row must hold availability, the divider, then earnings');
  // Both count chips sit INSIDE the summary card: walk the card's <View>
  // extent by tag balance and require the pill row before it closes.
  // RUN GROUND1 (C4) added the dark card shadow beside the style key here, so
  // the container is found by its style KEY rather than by the whole prop. The
  // walk below is unchanged and still proves the pills sit inside it.
  const keyAt = screen.indexOf('styles.summaryCard');
  assert.ok(keyAt > 0, 'the summary card container must exist');
  const open = screen.lastIndexOf('<View', keyAt);
  assert.ok(open > 0, 'the summary card style must sit on a <View>');
  const tags = [...screen.slice(open).matchAll(/<View\b[^>]*\/>|<View\b|<\/View>/g)];
  let depth = 0;
  let end = -1;
  for (const tag of tags) {
    if (tag[0].endsWith('/>')) continue;
    depth += tag[0] === '</View>' ? -1 : 1;
    if (depth === 0) {
      end = open + tag.index;
      break;
    }
  }
  assert.ok(end > open, 'the summary card container must close');
  const pillRow = screen.indexOf('<View style={styles.pillRow}>');
  assert.ok(pillRow > open && pillRow < end, 'the count chips must render inside the summary card');
  assert.match(screen, /match your skills/);
  assert.match(screen, /within \$\{NEARBY_RADIUS_MILES\} miles|within \$\{NEARBY_RADIUS_MILES\}/);
});

test('the section heading reads Available Jobs, with no dot; retired copy stays gone', () => {
  assert.match(screen, /<Text accessibilityRole="header" style=\{styles\.sectionTitle\}>Available Jobs<\/Text>/);
  // 2026-09-28 (LUX-LIST-64 #51): the feed dot mockup 43 put before the heading
  // is gone, style and all — the heading stands alone.
  assert.doesNotMatch(code, /feedDot/);
  // 4D-6 removed the "Taking new work" HEADING and its explanatory
  // paragraph; neither may come back. The dot's caption is a different
  // thing — master 43 draws it as "Not visible to customers", so the guard
  // names the retired sentences rather than banning the word "visible".
  assert.doesNotMatch(code, /Taking new work<\/Text>/);
  assert.doesNotMatch(code, /Shown on your public profile/);
  assert.doesNotMatch(code, /You are visible to customers/i);
  assert.doesNotMatch(code, /so customers can find you/i);
});

// ===========================================================================
// 4D-6 — the summary card rebuilt to the operator's spec. The mockup is a
// pixel target for THIS ONE CARD only (operator override of the
// references-are-direction rule); the numbers below are the acceptance
// criteria, pinned as source facts because nothing here can render.
// ===========================================================================

test('4D-6 left column: shared eyebrow, serif status word beside the toggle, pulse dot row', async () => {
  // One eyebrow style for both columns: 11/700/1.2, gold.
  assert.match(screen, />TAKING NEW WORK<\/Text>/);
  assert.match(screen, />NEARBY DEMAND<\/Text>/);
  assert.match(
    code,
    // 2026-09-28 (LUX-LIST-64 #48): the eyebrow role, gold in dark and #86641A in light.
    // Fix run D7: the one section-label measure (EYEBROW_TYPE), no size of its own.
    /summaryEyebrow: \{\s*\.\.\.EYEBROW_TYPE,\s*color: colors\.eyebrow,\s*\}/
  );
  // Status word: serif, 30pt, primary ink — sharing one vertically centred
  // row with the SAME control contract (handler, state source, disabled gate
  // all preserved). Prestige 0c swapped the RN Switch for the shared Toggle
  // (ui/primitives): pre-made decision 7 owns the toggle's colours at the
  // component, so there are no per-site track colours left to pin.
  assert.match(
    code,
    /statusWord: \{[^}]*fontFamily: fonts\.display,\s*fontSize: 30,[^}]*color: colors\.ink,/s
  );
  assert.match(code, /statusRow: \{ flexDirection: 'row', alignItems: 'center', gap: spacing\.sm \}/);
  assert.match(code, /onValueChange=\{\(value\) => void saveAcceptingWork\(value\)\}/);
  assert.match(code, /disabled=\{savingAvailability \|\| !profile\}/);
  // RUN GROUND1 (C3) added the clearance hook to this import: the nav pill is
  // out of layout flow on this route now, so the screen reserves its footprint
  // itself. 2026-09-21: the hook is useScrollClearance — by route, the bar's
  // footprint on the two homes and one spacing step everywhere else. The
  // assertion this line makes is unchanged — the shared Toggle and SearchBar
  // come from ui/primitives, not from a local re-implementation. Fix run D12
  // adds the Divider (the summary card's column rule) to the same import.
  assert.match(
    code,
    /import \{ Divider, SearchBar, Toggle, useScrollClearance \} from '\.\.\/ui\/primitives'/
  );
  assert.match(code, /<Toggle\b/);
  assert.doesNotMatch(code, /<Switch\b/);
  // The continue-path floor is built in: 30pt auto-fits no lower than
  // 0.87 × 30 ≈ 26pt before the row could ever clip.
  assert.match(code, /adjustsFontSizeToFit\s*minimumFontScale=\{0\.87\}/);
  // 2026-09-28 (LUX-LIST-64 #50): "Paused" is SET to fit — 24, 0.8 × 30, the
  // 91pt the column leaves beside the 52pt toggle — so the word is whole
  // without the platform's shrink (which web never runs, and a larger text size
  // outgrew on the operator's phone), and it never scales past the toggle.
  assert.match(code, /style=\{\[styles\.statusWord, !accepting && styles\.statusWordPaused\]\}/);
  assert.match(code, /statusWordPaused: \{ fontSize: 24 \}/);
  // The dot row: green when available, red when not — both palette reads.
  //
  // RUN H2 moved the OFFLINE half from `danger` to `referenceCoral`. It is the
  // same assertion with the recorded value updated, not a relaxed one: master
  // 43 draws this dot in #D54C2C — the master set's only UI red — and `danger`
  // was rendering it as a terracotta in light and a different red in dark. Both
  // branches are still palette reads and neither may be a hex here.
  //
  // 2026-09-28 (LUX-LIST-64 #50): the dot is the shared LiveDot — paused, it
  // takes the Sonar (a ring travelling out every 2 s); open, it holds still —
  // and LiveDot itself honours reduced motion: the still dot, nothing moving.
  assert.match(
    code,
    /<LiveDot\s+color=\{accepting \? colors\.emerald : colors\.referenceCoral\}\s+size=\{10\}\s+motion=\{accepting \? 'still' : 'sonar'\}\s+\/>/
  );
  const liveDot = stripComments(await read('components/LiveDot.tsx'));
  assert.match(liveDot, /useReducedMotion\(\)/);
  assert.match(liveDot, /const moving = motion !== 'still' && reducedMotion === false;/);
  assert.match(code, /statusCaption: \{ fontSize: 13, color: colors\.textMuted \}/);
});

test('4D-6 right column: serif emerald amount via formatBudget, "across N jobs"', () => {
  assert.match(
    code,
    // 2026-09-28 (LUX-LIST-64 #40): money is white — the `money` role.
    /earningsAmount: \{\s*fontFamily: fonts\.display,\s*fontSize: 30,\s*fontWeight: '700',\s*color: colors\.money,\s*\}/
  );
  assert.match(code, /formatBudget\(potential\.cents\)/);
  // "open" dropped from the caption; the count stays dynamic and singular
  // stays handled.
  assert.match(code, /`across \$\{potential\.count\} \$\{potential\.count === 1 \? 'job' : 'jobs'\}`/);
  assert.doesNotMatch(code, /open \$\{potential\.count/);
  // The loading gate still pulses instead of faking $0.
  assert.match(code, /<Skeleton style=\{styles\.earningsAmountLoading\} \/>/);
  assert.match(code, /<Skeleton style=\{styles\.earningsCaptionLoading\} \/>/);
});

test('4D-6 card geometry: padding 14, 14pt row gap, 1pt divider at 14pt margins, 6pt columns', () => {
  assert.match(
    code,
    // 2026-09-27 (the Lux remake): the rim is `colors.border`, not gold.
    /summaryCard: \{\s*padding: layout\.cardPadding,\s*borderWidth: 1,\s*borderColor: colors\.border,\s*backgroundColor: colors\.surface,/
  );
  // RUN T2 (C2): the row gap and the corner are spelled at the wearer instead
  // of in the stylesheet — ONCE. Both numbers are still pinned here; only
  // their address moved.
  assert.match(code, /const summaryCardGap = 14;/);
  assert.match(code, /const summaryCardRadius = radius\.lg;/);
  // Fix run D12: the 1 pt vertical rule is the Divider now (its width, its stretch, the border
  // role); the style keeps only its 14 of air either side.
  assert.match(code, /<Divider orientation="vertical" thickness=\{1\} style=\{styles\.summaryDivider\} \/>/);
  assert.match(code, /summaryDivider: \{\s*marginHorizontal: 14,\s*\}/);
  assert.match(code, /summaryRow: \{ flexDirection: 'row' \}/);
  assert.match(code, /availabilityHalf: \{ flex: 1, gap: 6 \}/);
  assert.match(code, /earningsHalf: \{ flex: 1, gap: 6 \}/);
});

test('4D-6 pills: 40pt capsules, 12pt gap, two-tone counts, 44pt touch kept by slop', () => {
  assert.match(
    code,
    /pill: \{\s*flex: 1,\s*flexDirection: 'row',\s*alignItems: 'center',\s*justifyContent: 'center',\s*gap: spacing\.sm,\s*height: 40,\s*paddingHorizontal: spacing\.md,\s*borderRadius: radius\.pill,\s*borderWidth: 1,\s*borderColor: colors\.mint2,\s*backgroundColor: colors\.surface,\s*\}/
  );
  assert.match(code, /pillRow: \{ flexDirection: 'row', gap: spacing\.md \}/);
  // Two-tone: the count emerald, the rest of the label primary ink.
  assert.match(code, /pillText: \{ flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors\.ink \}/);
  assert.match(code, /pillCount: \{ color: colors\.emerald \}/);
  assert.match(code, /<Text style=\{styles\.pillCount\}>\{skillMatchCount\}<\/Text>/);
  assert.match(code, /<Text style=\{styles\.pillCount\}>\{nearbyCount\}<\/Text>/);
  // Sparkle + location pin, both 16pt.
  assert.match(code, /name="sparkles-outline" size=\{16\}/);
  assert.match(code, /name="location-outline" size=\{16\}/);
  // 40pt visual height + 2pt slop each side = the 44pt floor (CLAUDE.md).
  assert.match(code, /hitSlop=\{\{ top: 2, bottom: 2 \}\}/);
  // The honest degraded labels survive; no count is ever invented.
  assert.match(screen, /: 'Add your skills';/);
  assert.match(screen, /Enable location/);
});

test('4D-6 light palette: every value the card reads is byte-identical', async () => {
  // The card touches only these tokens; their LIGHT values must not move.
  // Brand hues live once, in ui/tokens.ts `brand` (spread into lib/theme).
  const tokens = await read('ui/tokens.ts');
  assert.match(tokens, /forest: '#064C3B'/);
  assert.match(tokens, /emerald: '#0D6B52'/);
  assert.match(tokens, /gold: '#C8A15B'/);
  assert.match(tokens, /mint2: '#D3E8DF'/);
  assert.match(tokens, /ink: '#13201B'/);
  // The light-only keys the card reads come from lib/theme's `colors`.
  const theme = await read('lib/theme.ts');
  assert.match(theme, /textMuted: '#4E5949'/);
  assert.match(theme, /border: '#DDD6C4'/);
  assert.match(theme, /danger: '#A8432B'/);
  assert.match(theme, /surface: '#FFFFFF'/);
});

// ===========================================================================
// 4D-1b — one worker home. The atlas-48 browse screen was UNMOUNTED in 4D-1b
// and DELETED in Batch F: no navigator registers a BrowseJobs route, nothing
// dispatches to it, and no landing value can resolve to it. T1–T7 are that
// contract.
// ===========================================================================

const SOURCE_DIRS = ['screens', 'components', 'lib', 'hooks', 'modes', 'ui', 'navigation'];
const sourceFiles = SOURCE_DIRS.flatMap((d) =>
  readdirSync(new URL(`../${d}`, import.meta.url), { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => `${d}/${f.replace(/\\/g, '/')}`)
);

test('T1: the worker tree registers no route named BrowseJobs', () => {
  assert.doesNotMatch(workerRoot, /name="BrowseJobs"/);
});

test('T2+T3: nothing dispatches to BrowseJobs, and no landing value resolves to it', async () => {
  assert.ok(sourceFiles.length > 100, 'the source sweep must actually see the tree');
  const offenders = [];
  for (const file of sourceFiles) {
    const src = stripComments(await read(file));
    // T2 — every dispatch shape that has ever existed in this repo.
    if (/navigate\(\s*['"]BrowseJobs['"]/.test(src)) offenders.push(`${file}: navigate()`);
    if (/navigateAcrossTabs\([^)]*['"]BrowseJobs['"]/.test(src)) {
      offenders.push(`${file}: navigateAcrossTabs()`);
    }
    if (/screen:\s*['"]BrowseJobs['"]/.test(src)) offenders.push(`${file}: nested target`);
    // T3 — no landing-route, initial-route or mode-landing value. This is the
    // assertion that pins the reported wrong-landing symptom shut.
    if (/initialRouteName\s*=\s*["'{]?\s*["']BrowseJobs["']/.test(src)) {
      offenders.push(`${file}: initialRouteName`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('T3: landing decisions resolve modes, never route names', async () => {
  // A cold-start landing is a MODE (consumed by ModeProvider into
  // resolveInitialMode), not a navigation instruction — there is no route
  // name anywhere on that path for a stale screen to hide behind.
  const setupLanding = stripComments(await read('lib/setupLanding.ts'));
  assert.doesNotMatch(setupLanding, /navigate|BrowseJobs/);
  const types = await read('modes/types.ts');
  assert.match(types, /return landing === 'work' \? 'worker' : 'customer';/);
});

test('T4: the explicit initial route and declaration order agree — on WorkerHome', () => {
  const stripped = stripComments(workerRoot);
  const declared = stripped.match(/initialRouteName="([^"]+)"/);
  const firstRegistered = stripped.match(/<WorkerHomeStack\.Screen\s+name="([^"]+)"/);
  assert.ok(declared, 'the worker Home stack must declare initialRouteName');
  assert.ok(firstRegistered, 'the worker Home stack must register screens');
  // switchMode() mounts a TREE rather than resolving a route name
  // (ModeShell), so what a fresh worker mount lands on IS this stack's
  // initial route. The two values that could disagree — the explicit
  // contract and the declaration order — are compared, not hardcoded twice.
  assert.equal(declared[1], firstRegistered[1]);
  assert.equal(declared[1], 'WorkerHome');
  // …and Home is the worker tree's first tab, so the mount arrives here.
  assert.match(stripped, /<Tab\.Navigator[\s\S]*?<Tab\.Screen name="Home"/);
});

test('T5: WorkerResults mode:all is reachable from View all and from the Map header', async () => {
  assert.match(code, /navigation\.navigate\('WorkerResults', \{ mode: 'all' \}\)/);
  const map = stripComments(await read('screens/MapScreen.tsx'));
  // The gate is `isWorker`, derived once from useMode(). It was written inline
  // as `mode === 'worker' ?` until 2026-08-24, when the header's ScreenHeader
  // and its `right=` slot were replaced by the search capsule; the mode
  // question did not move, only the expression that reads it.
  assert.match(map, /const isWorker = mode === 'worker';/);
  assert.match(map, /\{isWorker \? \(/);
  assert.match(map, /navigateAcrossTabs\('Home', 'WorkerResults', \{ mode: 'all' \}\)/);
});

test('T6: one availability writer — the server-side accepting_work path', () => {
  // The dashboard writes phase53 profiles.accepting_work through the
  // existing updateProfile() path. The device-local AsyncStorage hook was
  // deleted with the atlas-48 screen in Batch F, so no surface can show a
  // second, disagreeing availability truth.
  assert.match(code, /updateProfile\(user\.id, \{ accepting_work: next \}\)/);
});

// ---------------------------------------------------------------------------
// emerald D5 — the shared toggle, and the bug underneath it
// ---------------------------------------------------------------------------
//
// The device pass found Worker Home's "Online" and Services & availability's
// "Taking new work" disagreeing. They are the SAME phase53 accepting_work
// fact. D5 requires that track colour and knob position derive from one
// boolean in one place, and that the two surfaces cannot diverge. Both halves
// are asserted here: the control cannot express a contradiction, and the fact
// behind it is singular.

test('D5: the toggle track is state-blind in dark, and only the knob carries state', async () => {
  const toggle = stripComments(await read('ui/primitives/Toggle.tsx'));

  // THE TRACK. In dark it is a neutral surface under the ordinary hairline,
  // identical ON and OFF — written without a `value` term at all, so it is not
  // merely the same colour today but structurally unable to carry state.
  const trackColor = toggle.match(/const trackColor = ([^;]+);/);
  assert.ok(trackColor, 'Toggle must resolve a track colour');
  const darkBranch = trackColor[1].slice(0, trackColor[1].indexOf('?') + 1 || undefined);
  assert.match(trackColor[1], /isDark \? palette\.neutralBg/);
  assert.doesNotMatch(
    darkBranch,
    /\bvalue\b/,
    'the dark track must not depend on the toggle value'
  );
  // D5 retires red from this control outright, and no emerald track in dark.
  assert.doesNotMatch(
    trackColor[1].split(':')[0] + trackColor[1].match(/isDark \? [^:]+/)[0],
    /palette\.danger|palette\.emerald/,
    'the dark track may be neither the danger red nor emerald'
  );

  // THE KNOB. Gold when ON in BOTH palettes since 2026-08-23 (light was a
  // plain white disc, so the same state read two different ways depending on
  // the theme); each palette's own quiet disc when OFF; every part of it
  // reading the same `value`, and the position doing the same.
  const knobColor = /const knobColor = ([\s\S]+?);/.exec(toggle);
  assert.ok(knobColor, 'Toggle must resolve a knob colour');
  assert.match(
    knobColor[1],
    /^\s*value\b/,
    'the knob colour must branch on `value` FIRST — theme-first is how the two palettes drifted apart'
  );
  assert.match(
    knobColor[1],
    /withAlpha\(palette\.gold, 0\.92\)/,
    'the ON face is the gold tint, and it is not inside an isDark branch'
  );
  assert.doesNotMatch(
    knobColor[1].slice(0, knobColor[1].indexOf('withAlpha')),
    /isDark/,
    'nothing may gate the gold face on the theme'
  );
  // Fix run D6: the dark OFF face is the Lux muted (`textMuted`), visible on
  // the dark track — `onPrimary` went near-black in the 09-26 refresh.
  assert.match(knobColor[1], /isDark[\s\S]*?palette\.textMuted[\s\S]*?palette\.white/);
  assert.doesNotMatch(knobColor[1], /palette\.onPrimary/, 'the near-black onPrimary disc vanished on the dark track');
  assert.match(toggle, /const knobBorder = value \? palette\.gold : 'transparent';/);
  // The halo stays DARK-ONLY and deliberately so: a glow is an atmosphere the
  // dark ground has and the cream one does not.
  assert.match(toggle, /const knobGlow = isDark && value \? glow\.halo\(withAlpha\(palette\.gold, 0\.55\)\) : null;/);
  assert.match(toggle, /toValue: value \? 1 : 0/);
  assert.match(toggle, /outputRange: \[0, TRAVEL\]/);
  // Fix run D6 (smooth): the knob springs on the native driver, and Reduce
  // Motion lands it at once rather than animating.
  assert.match(toggle, /Animated\.spring\(position, \{[\s\S]*?stiffness: 320,\s*damping: 26,[\s\S]*?useNativeDriver: USE_NATIVE_DRIVER,/);
  assert.match(toggle, /if \(reduceMotion !== false\) \{\s*position\.setValue\(value \? 1 : 0\);/);
  assert.doesNotMatch(toggle, /Animated\.timing\(position/, 'the knob no longer slides on a fixed 160 ms timing');

  // GOLD IS LINE-WORK. The knob's face is a TINT and its ring is the metal, so
  // tests/goldOnForest.test.mjs's "no gold fill" rule holds without an
  // allowlist entry — the compromise D5 names.
  assert.doesNotMatch(
    toggle,
    /backgroundColor:\s*\w+\.gold\b/,
    'the ON knob must be a gold ring over a gold tint, never a gold fill'
  );

  // LIGHT'S TRACK IS UNTOUCHED: the Heritage arrangement is still emerald
  // when ON, border when OFF. Only the knob crossed over.
  assert.match(trackColor[1], /value \? palette\.emerald : palette\.border/);
  assert.match(toggle, /: palette\.white;/, "light's OFF knob is still the plain white disc");
});

test('D5: the two availability toggles cannot show different states', async () => {
  const [servicesScreen, useProfileHook] = await Promise.all([
    read('screens/ServicesPricingScreen.tsx'),
    read('hooks/useProfile.ts'),
  ]);
  const servicesCode = stripComments(servicesScreen);
  const hookCode = stripComments(useProfileHook);

  // 1. ONE EXPRESSION. Both screens derive the boolean the same way from the
  //    same field, and hand it to the same shared control unmodified.
  for (const [path, source] of [
    ['screens/WorkerHomeScreen.tsx', code],
    ['screens/ServicesPricingScreen.tsx', servicesCode],
  ]) {
    assert.match(
      source,
      /const accepting = profile\?\.accepting_work \?\? true;/,
      `${path} must read the availability fact exactly one way`
    );
    assert.match(source, /<Toggle\s+value=\{accepting\}/, `${path} must pass it unmodified`);
  }

  // 2. ONE COPY OF THE ROW. This is what actually diverged: each screen used
  //    to hold its own profile state, and Services & availability re-fetches
  //    on focus while Worker Home did not — so a write on one was invisible to
  //    the other until the app restarted. useProfile is a shared store now.
  assert.match(hookCode, /useSyncExternalStore\(subscribe, getSnapshot\)/);
  assert.match(hookCode, /const listeners = new Set<\(\) => void>\(\);/);
  assert.match(hookCode, /function publish\(next: Partial<ProfileSnapshot>\)/);
  assert.doesNotMatch(
    servicesCode,
    /useState<Profile \| null>/,
    'Services & availability must not hold a private copy of the profile row'
  );
  assert.match(servicesCode, /const \{ profile, setProfile \} = useProfile\(\);/);
  assert.match(code, /const \{ profile, setProfile \} = useProfile\(\);/);

  // 3. AND BOTH WRITES PUBLISH. A save on either screen reaches the other
  //    without a round-trip, which is the half a shared read alone misses.
  assert.match(code, /if \(data\) setProfile\(data\);/);
  assert.match(servicesCode, /if \(data\) setProfile\(data\);/);
});

test('D5: every notification preference uses the same shared toggle', async () => {
  // D5 covers Worker Home availability, Services & availability, and all five
  // notification preferences — so none of them may be a hand-rolled switch
  // with its own state colours.
  const prefs = stripComments(await read('screens/NotificationSettingsScreen.tsx'));
  assert.match(prefs, /import \{ Toggle, useScrollClearance \} from '\.\.\/ui\/primitives';/);
  assert.doesNotMatch(prefs, /<Switch\b/, 'no screen may reintroduce the native Switch');
  // The five rows are ONE <Toggle> mapped over the preference list, which is
  // why they cannot drift from each other in the first place.
  assert.match(prefs, /NOTIFICATION_TOGGLES\.map\(\(item, index\) => \{/);
  assert.match(prefs, /<Toggle\b/);
  const keys = [
    ...stripComments(await read('lib/notificationPrefs.ts')).matchAll(/^\s{4}key: '(\w+)'/gm),
  ];
  assert.ok(keys.length >= 5, `expected the five preference keys, saw ${keys.length}`);
  // Every surface D5 NAMES is on the shared control, and the native Switch
  // survives in exactly one place, outside that scope (the atlas-48 screen's
  // Switch was deleted with it in Batch F). Pinned as a set rather than
  // asserted empty, so a NEW hand-rolled switch is still a failure while
  // this one stays honestly recorded:
  //   - SetupScreen: the onboarding permission rows. Part of the auth flow,
  //     which has no dark treatment at all (see themeResolution's auth test),
  //     so a dark toggle there would be the only dark control on a light
  //     screen. Logged for the operator rather than converted under D5.
  const switchUsers = [];
  for (const file of sourceFiles) {
    if (/<Switch\b/.test(stripComments(await read(file)))) switchUsers.push(file);
  }
  // n5 (2026-09-04): SetupScreen's permission rows are gone (permissions are
  // asked at first need), so the set is EMPTY — still pinned as a set.
  assert.deepEqual(switchUsers.sort(), []);
  for (const path of [
    'screens/WorkerHomeScreen.tsx',
    'screens/ServicesPricingScreen.tsx',
    'screens/NotificationSettingsScreen.tsx',
  ]) {
    assert.doesNotMatch(
      stripComments(await read(path)),
      /<Switch\b/,
      `${path} is in D5's scope and must use the shared Toggle`
    );
  }
});

test('T7: the worker Home stack keeps its routes, in order, minus BrowseJobs', () => {
  const names = [
    ...stripComments(workerRoot).matchAll(/<WorkerHomeStack\.Screen\s+name="([^"]+)"/g),
  ].map((m) => m[1]);
  assert.deepEqual(names, [
    'WorkerHome',
    // 2026-09-26 (the refresh, audit M-24): the feed, from the bell.
    'Notifications',
    // 2026-09-29 (LUX-LIST-2 #8): the feed's header gear opens its settings.
    'NotificationSettings',
    'WorkerResults',
    'JobDetail',
    'SubmitBid',
    'BidSent',
    'Chat',
    'PostJob',
    'WorkerProfile',
    'ProfileReviews',
  ]);
});
