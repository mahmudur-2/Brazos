import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const dir = (path) => readdirSync(new URL(`../${path}`, import.meta.url));

test('main tab screens do not reserve redundant gaps above the safe tab bar', async () => {
  // Phase 2 extracted the tab bar's sizing into the BottomNav primitive. 2026-09-30 (the build run,
  // docs/dispatch/MELT-TAB-BAR.md): the bar is the floating Melt-through pill — 16pt in from each
  // side, its bottom edge max(inset − 10, 12) above the screen's — and these four roots scroll under
  // it, ending above it with the clearance (the next fences) rather than with a gap of their own.
  const [homeScreen, myJobs, messages, profile, geometry, shared, tokens] = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('screens/MyJobsHubScreen.tsx'),
    read('screens/MessagesInboxScreen.tsx'),
    read('screens/ProfileScreen.tsx'),
    read('lib/meltBarGeometry.ts'),
    read('components/MeltTabBar.shared.tsx'),
    read('ui/tokens.ts'),
  ]);

  for (const screen of [homeScreen, myJobs, messages, profile]) {
    assert.match(screen, /paddingBottom: 0/);
  }
  assert.match(geometry, /return Math\.max\(insetBottom - tuck, min\);/);
  assert.match(tokens, /sideInset: 16,/);
  assert.match(tokens, /bottomTuck: 10,\s*bottomMin: 12,/);
  assert.match(
    shared,
    /pill: \{ position: 'absolute', left: meltBar\.sideInset, height: meltBar\.height \}/,
    'the pill is placed by its side inset and its offset'
  );
  assert.ok(!/margin(Bottom|Horizontal)/.test(shared), 'the pill is never floated by margins');
});

// ---------------------------------------------------------------------------
test('a screen with its own page ground declares it to the shell (RUN H3)', async () => {
  const hook = await read('lib/shellGround.tsx');

  // FOCUS-SCOPED, and it RELEASES. React Navigation keeps a blurred screen
  // mounted, so a mount-scoped ground would latch on the first Home render and
  // paint every later screen's bar row wrong — the same band, relocated.
  assert.match(hook, /useFocusEffect\(/, 'the ground must be scoped to focus, not to mount');
  assert.match(
    hook,
    /return \(\) => setGround\(null\);/,
    'blur must release the ground, or the next screen inherits this one'
  );
  // A palette KEY, never a colour: the shell resolves it, so light and dark
  // cannot disagree and CLAUDE.md's literal ban cannot be routed around here.
  assert.match(hook, /export type ShellGroundToken = keyof ColorPalette;/);
  // CODE only — the docblock quotes the measured hexes on purpose, because the
  // numbers are the evidence for why this exists.
  const codeOf = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codeOf(hook), /#[0-9A-Fa-f]{6}\b/, 'the hook carries token names, never hexes');

  // EVERY screen that paints a ground token of its own must declare that SAME
  // token. Derived from the sources rather than listed, so a fourth such screen
  // is caught the day it is written.
  const screens = dir('screens').filter((name) => name.endsWith('.tsx'));
  const declared = [];
  for (const name of screens) {
    const source = await read(`screens/${name}`);
    const grounds = new Set(
      [...source.matchAll(/backgroundColor: colors\.(\w*[Bb]ackground)\b/g)]
        .map((hit) => hit[1])
        .filter((token) => token !== 'background')
    );
    for (const token of grounds) {
      declared.push(`${name}:${token}`);
      assert.match(
        source,
        new RegExp(`useShellGround\\('${token}'\\)`),
        `screens/${name} paints ${token} as a page ground but never declares it — the ` +
          "floating pill's margins will paint palette.background and a band comes back"
      );
    }
  }
  // The three that exist today, so a screen losing its ground is also a failure
  // rather than one fewer thing to check.
  assert.deepEqual(declared.sort(), [
    'HomeScreen.tsx:homeBackground',
    'JobDetailScreen.tsx:homeBackground',
    'WorkerResultsScreen.tsx:homeBackground',
  ]);
});

test('the bar row paints nothing but the pill (emerald D2)', async () => {
  // emerald D2's finding stands: one painted layer, the pill. 2026-09-30: the pill is the Melt bar's
  // lit card (components/MeltTabBar.shared.tsx pillStyle); the bar's root and the navigator's
  // options paint nothing, and the trees add no ground behind it.
  const [shell, bottomNav, customerRoot, workerRoot, shared] = await Promise.all([
    read('navigation/ModeShell.tsx'),
    read('ui/primitives/BottomNav.tsx'),
    read('navigation/CustomerRoot.tsx'),
    read('navigation/WorkerRoot.tsx'),
    read('components/MeltTabBar.shared.tsx'),
  ]);

  assert.match(shell, /<View style=\{\[styles\.tree, \{ backgroundColor: treeGround \}, luxGround\]\}>/);
  assert.match(shell, /const treeGround = ground \? palette\[ground\] : palette\.background;/);
  assert.equal(
    (shell.match(/styles\.tree, \{ backgroundColor: treeGround \}/g) ?? []).length,
    1,
    'the tree ground must be painted once'
  );
  assert.match(
    shell,
    /\{treeMode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>\}/,
    'the ground must wrap the tree swap, not replace it'
  );

  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(
    codeOnly(bottomNav),
    /tabBarBackground|tabBarStyle|backgroundColor/,
    'the bar options style nothing — the Melt bar draws itself'
  );
  for (const path of ['components/MeltTabBar.tsx', 'components/MeltTabBar.motion120.tsx']) {
    const code = codeOnly(await read(path));
    assert.match(
      code,
      /root: \{ position: 'absolute', left: 0, right: 0, bottom: 0 \}/,
      path + ": the bar's root paints nothing"
    );
    assert.match(code, /pillStyle\(m\.isDark, m\.pillWidth, m\.bottom\)/, path + ': the pill is the painted layer');
  }
  assert.match(
    codeOnly(shared).replace(/\s+/g, ' '),
    /return \[styles\.pill, \{ width, bottom \}, litCardStyle\(isDark\), \{ borderRadius: meltBar\.radius \}\];/,
    "the pill wears the lit card, at the bar's own corner"
  );
  const blur = codeOnly(await read('lib/blur.tsx'));
  assert.doesNotMatch(
    blur,
    /backgroundColor/,
    'the blur layer must paint no ground of its own'
  );
  for (const [tree, source] of [
    ['navigation/CustomerRoot.tsx', customerRoot],
    ['navigation/WorkerRoot.tsx', workerRoot],
  ]) {
    assert.doesNotMatch(
      codeOnly(source),
      /tabBarBackground/,
      tree + ' must not add a tabBarBackground layer behind the pill'
    );
  }
});

test('the nav glyphs are D3 size and every slot still fits its label', async () => {
  // 2026-09-30: the Melt bar's glyph is 25pt over an 11pt name in a 64pt column (ui/tokens.ts
  // meltBar, the handoff page's numbers). The stack must fit the column, and the chosen tab's icon
  // must drop onto the pill's centre line — the bubble's centre — or it sits off-centre in it.
  const [tokens, shared] = await Promise.all([read('ui/tokens.ts'), read('components/MeltTabBar.shared.tsx')]);
  const melt = tokens.slice(tokens.indexOf('export const meltBar = {'));
  const n = (key) => {
    const match = melt.match(new RegExp('\\b' + key + ': ([\\d.]+)'));
    assert.ok(match, 'meltBar.' + key + ' must be a plain number in ui/tokens.ts');
    return Number(match[1]);
  };
  assert.equal(n('icon'), 25);
  assert.equal(n('labelSize'), 11);
  assert.equal(n('column'), 64);
  assert.equal(n('height'), 64);

  const labelLine = Number(shared.match(/const LABEL_LINE = (\d+);/)[1]);
  const stack = n('icon') + n('labelGap') + labelLine;
  assert.ok(stack <= n('column'), 'the icon+name stack (' + stack + ') must fit the ' + n('column') + 'pt column');
  const top = (n('column') - stack) / 2;
  assert.equal(
    top + n('icon') / 2 + n('iconDrop'),
    n('height') / 2,
    "the chosen tab's icon drops onto the pill's centre line"
  );
  assert.match(shared, /numberOfLines=\{1\} maxFontSizeMultiplier=\{1\.2\}/);

  const touch = Number(shared.match(/const SLOT_TOUCH = (\d+);/)[1]);
  assert.ok(touch >= 44 && n('height') >= 44, 'every slot clears the 44pt touch floor');
  const narrowest = (320 - 2 * n('sideInset')) / 5;
  assert.ok(narrowest >= 44, 'slot width ' + narrowest + ' on a 320pt phone must clear the 44pt floor');
});

test('every screen inside the tab bar leaves the bottom safe-area inset to it', async () => {
  // The regression f3e75d0 was written to fix, confirmed still live on six
  // screens by the Phase 0 audit and re-applied by hand in Phase 2 (the patch
  // itself no longer applies — two of the files were rewritten since).
  //
  // MainTabs' tab bar already folds insets.bottom into its own height, so a
  // tab-contained screen that ALSO asks SafeAreaView for the bottom edge
  // reserves it twice and shows a blank cream band above the bar.
  const tabContained = [
    'screens/AdminReportsScreen.tsx',
    'screens/CellJobsScreen.tsx',
    // 2026-09-26 (the refresh): the three job screens that pin an action bar
    // above the tabs — a reserved inset there is a blank band under the bar.
    'screens/ClientJobDetailScreen.tsx',
    'screens/HomeScreen.tsx',
    'screens/JobDetailScreen.tsx',
    'screens/PostJobScreen.tsx',
    'screens/ProfileReviewsScreen.tsx',
    'screens/WorkerProfileScreen.tsx',
    'screens/WorkerJobScreen.tsx',
    'screens/WorkerResultsScreen.tsx',
    'screens/WorkerSearchScreen.tsx',
  ];

  for (const path of tabContained) {
    const source = await read(path);
    assert.doesNotMatch(
      source,
      /edges=\{\['top', 'bottom'\]\}/,
      `${path} must not reserve the bottom inset the tab bar already owns`
    );
  }
});

test('the floating-nav clearance is derived from the bar, in one place', async () => {
  // emerald(3): a static token cannot see a runtime inset, so the clearance is a hook. 2026-09-30:
  // derived from the Melt pill — its height, its offset and the breathing room above it — by the
  // one piece of arithmetic the bar itself draws with (lib/meltBarGeometry.ts).
  const [tokens, bottomNav, primitivesIndex, hook, geometry] = await Promise.all([
    read('ui/tokens.ts'),
    read('ui/primitives/BottomNav.tsx'),
    read('ui/primitives/index.ts'),
    read('hooks/useNavInset.ts'),
    read('lib/meltBarGeometry.ts'),
  ]);

  assert.doesNotMatch(tokens, /floatingNavClearance:/, 'floatingNavClearance must not come back as a static token');
  assert.match(tokens, /floatingNavGap: FLOATING_NAV_GAP,/);
  assert.match(
    bottomNav,
    /export function useFloatingNavClearance\(\): number \{\s*return useNavInset\(\);\s*\}/
  );
  assert.match(hook, /return pillFootprint\(insets\.bottom, meltBar\);/);
  assert.match(
    geometry,
    /return m\.height \+ pillBottomOffset\(insetBottom, m\.bottomTuck, m\.bottomMin\) \+ m\.breathing;/
  );
  assert.match(primitivesIndex, /useFloatingNavClearance,/);
});

test('every tab-contained scroll surface clears the floating pill', async () => {
  // emerald(3), home(7) and the 2026-09-21 by-route rule, redone 2026-09-30 for the floating Melt
  // pill: it floats over EVERY tab screen, so every scroller whose end would travel under it pads
  // that end with useScrollClearance() — the pill's footprint under the tab navigator, one spacing
  // step outside it. Pinned footers are the next fence. The four tab roots that leaned on the
  // attached bar sitting in the layout flow (Inbox, My Jobs, Profile, hidden chats) and Post a
  // job's footer-less steps joined the roster.
  const surfaces = [
    'ui/templates/FormScreen.tsx',
    'ui/templates/DetailScreen.tsx',
    'ui/templates/SuccessScreen.tsx',
    'screens/ProfileDetailsScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/AccountSafetyScreen.tsx',
    'screens/NotificationSettingsScreen.tsx',
    'screens/JobDetailScreen.tsx',
    'screens/WorkerJobScreen.tsx',
    'screens/LegalDocumentScreen.tsx',
    'screens/ProfileReviewsScreen.tsx',
    'screens/WorkerProfileScreen.tsx',
    'screens/AppearanceScreen.tsx',
    'screens/AdminReportsScreen.tsx',
    'screens/CellJobsScreen.tsx',
    'screens/WorkerResultsScreen.tsx',
    'screens/WorkerSearchScreen.tsx',
    'screens/MessagesInboxScreen.tsx',
    'screens/MyJobsHubScreen.tsx',
    'screens/ProfileScreen.tsx',
    'screens/HiddenChatsScreen.tsx',
    'screens/PostJobScreen.tsx',
  ];
  for (const path of surfaces) {
    const source = await read(path);
    assert.match(source, /useScrollClearance\(\)/, path + ' must take its bottom clearance from useScrollClearance()');
    assert.doesNotMatch(source, /useFloatingNavClearance/, path + " pads a scroller with the bar's raw footprint");
    assert.match(source, /paddingBottom: navClearance/, path + ' must apply the clearance to whatever sits last above the pill');
    assert.doesNotMatch(
      source,
      /paddingBottom: [\w.]+ \+ navClearance/,
      path + ' adds to the clearance — that is the pinned-footer double count (home(7))'
    );
  }

  // The chat column is pinned, not scrolled: it RESERVES the pill beneath its composer and the
  // keyboard's rise takes it back out (tests/motion120.test.mjs has the arithmetic).
  const chat = await read('screens/ChatScreen.tsx');
  assert.match(chat, /const pillReserve = usePillReserve\(\);/);
  assert.match(chat, /insetBelow=\{0\}\s+reserveBelow=\{pillReserve\}/);
  assert.doesNotMatch(chat, /useFloatingNavClearance|useScrollClearance/);

  // The by-route rule, now "under the tab navigator or not".
  const bottomNav = await read('ui/primitives/BottomNav.tsx');
  assert.match(
    bottomNav,
    /export function useScrollClearance\(\): number \{\s*const inTabs = useContext\(BottomTabBarHeightContext\) !== undefined;\s*const inset = useNavInset\(\);\s*return inTabs \? inset : spacing\.lg;\s*\}/
  );
  const shared = await read('components/KeyboardRisingColumn.shared.tsx');
  assert.match(shared, /return Math\.max\(0, keyboardHeight - insetBelow\);/);
});

test('a PINNED footer takes its own padding, never the scroll clearance', async () => {
  // home(7)'s rule, redone 2026-09-30: a pinned footer sits at the foot of a full-height scene now
  // the pill floats, so it lifts its controls over the pill and keeps its own breathing room above
  // it — usePinnedFooterPadding(), the pill's top edge plus PINNED_FOOTER_BOTTOM_PADDING — and never
  // the scroll clearance, which would count the breathing room twice.
  const pinned = [
    ['ui/templates/FormScreen.tsx', 'footer'],
    ['ui/templates/DetailScreen.tsx', 'actionBar'],
    ['components/OfferComposer.tsx', 'footer'],
    ['screens/ClientJobDetailScreen.tsx', 'actionBar'],
    ['screens/JobDetailScreen.tsx', 'bidBar'],
    ['screens/WorkerJobScreen.tsx', 'actionBar'],
    ['screens/ReviewAndTipScreen.tsx', 'doneBar'],
  ];
  const bar = (await read('components/PostJobBar.tsx')).replace(/\s+/g, ' ');
  const barStyle = / bar: \{([^}]*)\}/.exec(bar);
  assert.ok(barStyle, 'the posting bar must keep a flat bar style');
  assert.doesNotMatch(barStyle[1], /paddingBottom|paddingVertical|paddingTop/, 'the posting bar style itself carries no space above or below its buttons');
  assert.match(bar, /const footerPad = usePinnedFooterPadding\(\);/, 'the posting bar lifts over the pill like every pinned footer');
  assert.match(bar, /<View style=\{\[styles\.bar, \{ paddingBottom: footerPad \}\]\}>/);
  assert.doesNotMatch(bar, /navClearance|useScrollClearance/, "and it never reserves the pill's footprint");

  const bottomNav = await read('ui/primitives/BottomNav.tsx');
  assert.match(
    bottomNav,
    /export const PINNED_FOOTER_BOTTOM_PADDING = layout\.floatingNavGap;/,
    'the pinned footer padding must derive from the pill geometry, not be hardcoded'
  );
  assert.match(
    bottomNav,
    /export function usePinnedFooterPadding\(\): number \{\s*return usePillReserve\(\) \+ PINNED_FOOTER_BOTTOM_PADDING;\s*\}/
  );
  const index = await read('ui/primitives/index.ts');
  assert.match(index, /PINNED_FOOTER_BOTTOM_PADDING,/);
  assert.match(index, /usePinnedFooterPadding,/);

  for (const [path, styleName] of pinned) {
    const source = await read(path);
    const flat = source.replace(/\s+/g, ' ');
    assert.match(source, /const footerPad = usePinnedFooterPadding\(\);/, path + ' must read the pinned-footer padding');
    const useAt = flat.indexOf('styles.' + styleName + ',');
    assert.notEqual(useAt, -1, path + ' must still apply its ' + styleName + ' style');
    const applied = flat.slice(useAt, flat.indexOf(']}', useAt));
    assert.match(applied, /paddingBottom: footerPad/, path + "'s pinned " + styleName + ' must APPLY the pinned-footer padding');
    assert.doesNotMatch(applied, /navClearance/, path + ": the pinned " + styleName + " must not reserve the pill's footprint a second time");
  }

  assert.match(bottomNav, /export function useFloatingNavClearance\(\): number \{/);
  assert.match(index, /useScrollClearance,/);
  assert.doesNotMatch(
    await read('ui/tokens.ts'),
    /floatingNavClearance/,
    'the static clearance token must not return'
  );
});

test('the flush arithmetic lives in hooks/useNavInset.ts alone (G1 C6)', async () => {
  // G1 (C6)'s rule — ONE home for the bar's inset arithmetic — kept for the floating pill
  // (2026-09-30): hooks/useNavInset.ts answers with lib/meltBarGeometry.ts, and no screen or
  // template does bar arithmetic of its own. The attached bar's flush formula and its studio dials
  // are retired with it.
  const hook = await read('hooks/useNavInset.ts');
  assert.match(
    hook,
    /return meltBar\.height \+ pillBottomOffset\(insets\.bottom, meltBar\.bottomTuck, meltBar\.bottomMin\);/
  );
  assert.match(hook, /return pillFootprint\(insets\.bottom, meltBar\);/);
  const codeOf = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codeOf(hook), /NAV_FLUSH_TUCK|navBottomPad|useDesignDial|useOverrideNumber/, "the attached bar's flush formula and dials are retired");

  for (const [root, files] of [
    ['screens', dir('screens').filter((name) => name.endsWith('.tsx'))],
    ['ui/templates', dir('ui/templates').filter((name) => name.endsWith('.tsx'))],
  ]) {
    for (const name of files) {
      const code = codeOf(await read(root + '/' + name));
      assert.doesNotMatch(
        code,
        /meltBar\.|pillFootprint|pillBottomOffset|layout\.floatingNavHeight|TAB_BAR_CONTENT_HEIGHT/,
        root + '/' + name + ': bar arithmetic belongs to the hook, never a screen'
      );
    }
  }
});

test('no screen skips the top inset the status bar needs', async () => {
  // The other half of the same rule. JobDetailScreen shipped
  // `edges={['bottom']}` on its main render, so on the worker Job details
  // screen the "Job details" title drew straight over the system clock and
  // location indicator. Every ui/templates/* screen resolves to
  // `insideTabs ? ['top'] : ['top', 'bottom']`, and every hand-rolled
  // SafeAreaView in screens/ is expected to name 'top' the same way.
  //
  // The one sanctioned exception is a full-bleed hero image that is SUPPOSED
  // to sit under the status bar, which is why this looks for the unconditional
  // literal rather than for the absence of the word 'top': a screen that
  // chooses its edges per render (JobDetailScreen does, on whether the job has
  // photos) is making the decision deliberately.
  const offenders = [];
  for (const file of dir('screens').filter((f) => f.endsWith('.tsx'))) {
    const source = await read(`screens/${file}`);
    if (/edges=\{\['bottom'\]\}/.test(source)) offenders.push(`screens/${file}`);
  }

  assert.deepEqual(
    offenders,
    [],
    'a SafeAreaView that asks only for the bottom edge lets its header render ' +
      'under the status bar'
  );
});
