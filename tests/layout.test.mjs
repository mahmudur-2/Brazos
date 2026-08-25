import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const dir = (path) => readdirSync(new URL(`../${path}`, import.meta.url));

test('main tab screens do not reserve redundant gaps above the safe tab bar', async () => {
  // Phase 2 extracted the tab bar's sizing into the BottomNav primitive, which
  // both mode trees consume. The arithmetic being asserted is byte-identical;
  // only its file moved.
  const [homeScreen, myJobs, messages, profile, bottomNav] = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('screens/MyJobsHubScreen.tsx'),
    read('screens/MessagesInboxScreen.tsx'),
    read('screens/ProfileScreen.tsx'),
    read('ui/primitives/BottomNav.tsx'),
  ]);

  for (const screen of [homeScreen, myJobs, messages, profile]) {
    assert.match(screen, /paddingBottom: 0/);
  }
  // Prestige 0d: the pill floats by MARGIN (in normal layout flow, so the
  // margins reserve real space); its height is the content height verbatim
  // and the library's own insets.bottom padding is zeroed out.
  assert.match(bottomNav, /const bottomMargin = Math\.max\(insetBottom, TAB_BAR_FLOAT_MARGIN\)/);
  assert.match(bottomNav, /height: TAB_BAR_CONTENT_HEIGHT,\s*marginHorizontal: TAB_BAR_FLOAT_MARGIN,\s*marginBottom: bottomMargin,/);
  assert.match(bottomNav, /paddingBottom: 0/);
});

// ---------------------------------------------------------------------------
// RUN H3 (C3) — THE GROUND OUTSIDE THE PILL IS THE PAGE'S, NOT A SECOND IVORY.
//
// MEASURED: on the light customer Home render the pill's 12pt side margins and
// the 12pt gap under it (y 770..851 at 393x852) painted #F4F1E8 while the page
// above painted #FAF5F1 — a band across the full width. On the WORKER Home
// render, whose page ground IS `background`, the same rows are one continuous
// colour and there is no band. So the defect was never the shell's paint; it
// was a screen whose page ground the shell could not know.
//
// CATCHES: a screen that introduces its own ground token and forgets to tell
// the shell — which is the exact shape of the original defect, and the only
// way it can come back.
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
  // The dark device pass photographed a white band around the floating pill.
  // Nothing of ours was painting it: the pill floats by margins in normal
  // layout flow and every ancestor of that gap was a colourless `flex: 1`, so
  // the iOS root view (white by platform default) showed through. The ground
  // now lives on ModeShell, the single parent of both trees.
  const [shell, bottomNav, customerRoot, workerRoot] = await Promise.all([
    read('navigation/ModeShell.tsx'),
    read('ui/primitives/BottomNav.tsx'),
    read('navigation/CustomerRoot.tsx'),
    read('navigation/WorkerRoot.tsx'),
  ]);

  // One ground, resolved from the palette, wrapping BOTH trees — so a theme
  // change repaints it and neither mode can be left transparent.
  //
  // RUN H3 (C3) MADE THE VALUE A VARIABLE. emerald D2 fixed the bar row falling
  // through to the iOS root view; it did not make the ground the right COLOUR
  // on a screen whose page is not `palette.background`, and on light customer
  // Home that showed as a full-width band of #F4F1E8 under a #FAF5F1 page. The
  // ground is now whatever the focused screen declares. The claim here is
  // unchanged — ONE painted View, resolved from the palette, wrapping both
  // trees — and the fallback is pinned so "no screen declared one" still
  // paints.
  assert.match(shell, /<View style=\{\[styles\.tree, \{ backgroundColor: treeGround \}\]\}>/);
  assert.match(shell, /const treeGround = ground \? palette\[ground\] : palette\.background;/);
  // Exactly one painted tree View — a second would be a second ground.
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

  // The pill is the ONLY painted surface in the bar row. tabBarStyle carries
  // exactly one backgroundColor and it is the pill's own.
  const options = bottomNav.slice(
    bottomNav.indexOf('export function bottomNavScreenOptions'),
    bottomNav.indexOf('Registration options for a tab')
  );
  assert.equal(
    (options.match(/backgroundColor:/g) ?? []).length,
    1,
    'the bar options must declare one background — the pill'
  );
  assert.match(options, /backgroundColor: palette\.surface/);
  // No second ground may be introduced through the library's own hook for one.
  // Comments are stripped first — the D2 audit above this line in BottomNav.tsx
  // NAMES that hook while recording that it is deliberately not used.
  const codeOnly = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const [path, source] of [
    ['ui/primitives/BottomNav.tsx', bottomNav],
    ['navigation/CustomerRoot.tsx', customerRoot],
    ['navigation/WorkerRoot.tsx', workerRoot],
  ]) {
    assert.doesNotMatch(
      codeOnly(source),
      /tabBarBackground/,
      `${path} must not add a tabBarBackground layer behind the pill`
    );
  }
  // The pill's ring is one weight. BottomTabBar.tsx sets borderTopWidth to a
  // hairline before tabBarStyle merges, and a specific edge beats the
  // shorthand, so the top arc drew at 0.5 against 1 everywhere else.
  assert.match(options, /borderTopWidth: 1,/);
});

test('the nav glyphs are D3 size and every slot still fits its label', async () => {
  const [bottomNav, tokens] = await Promise.all([
    read('ui/primitives/BottomNav.tsx'),
    read('ui/tokens.ts'),
  ]);

  const numberIn = (source, where, name) => {
    const match = source.match(new RegExp(`${name} = (\\d+)`));
    assert.ok(match, `${name} must be a plain number in ${where}`);
    return Number(match[1]);
  };
  const number = (name) => numberIn(bottomNav, 'ui/primitives/BottomNav.tsx', name);
  // Since emerald(3) the pill's geometry lives in ui/tokens.ts, so both the bar
  // and every screen that clears it read one number each.
  const geometry = (name) => numberIn(tokens, 'ui/tokens.ts', name);

  // emerald D3's explicit values. Recorded as a 1pt REDUCTION from the 29/12
  // that shipped, not an increase — see the constant's comment.
  assert.equal(number('const TAB_ICON_SIZE'), 28);
  assert.equal(number('const TAB_LABEL_FONT_SIZE'), 11);

  // The bar grows only as much as the content needs. Ionicons renders in a box
  // of about size + 3; the label adds its lineHeight (size + 2) plus a 2pt
  // margin; TAB_BOTTOM_GAP closes it. BottomTabItem's non-overridable 5pt
  // padding costs 10 of the bar's height.
  const barHeight = geometry('const FLOATING_NAV_HEIGHT');
  const stack =
    number('const TAB_ICON_SIZE') +
    3 +
    (number('const TAB_LABEL_FONT_SIZE') + 2 + 2) +
    number('const TAB_BOTTOM_GAP');
  assert.ok(
    stack <= barHeight - 10,
    `the icon+label stack (${stack}) must fit the usable slot (${barHeight - 10}) ` +
      'or a label clips through the top hairline'
  );

  // D3: a label may not clip or truncate. numberOfLines={1} turns an overrun
  // into an ellipsis, so the scale is capped the way iOS tab bars cap it.
  assert.match(bottomNav, /numberOfLines=\{1\}\s*\/\/[\s\S]{0,600}?maxFontSizeMultiplier=\{1\.2\}/);

  // Even distribution, and a ≥44pt target on the narrowest supported width.
  // Both bars draw five slots: the worker's five tabs, and the customer's four
  // destinations plus the centre action.
  const floatMargin = geometry('const FLOATING_NAV_GAP');
  const narrowestScreen = 320;
  const slotWidth = (narrowestScreen - floatMargin * 2) / 5;
  assert.ok(slotWidth >= 44, `slot width ${slotWidth} must clear the 44pt touch floor`);
  assert.ok(
    barHeight >= 44,
    'the slot is the full bar height, which must also clear the touch floor'
  );
  // Equal flex is the library's own `styles.bottomItem` on every item; the
  // centre action must match it rather than sizing itself.
  assert.match(bottomNav, /createSlot: \{\s*flex: 1,/);
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
    'screens/HomeScreen.tsx',
    'screens/PostJobScreen.tsx',
    'screens/ProfileReviewsScreen.tsx',
    'screens/WorkerProfileScreen.tsx',
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
  // emerald(3). The old §I token was a flat 68 against a pill that occupies its
  // 70pt height PLUS the margin that floats it — up to the device's 34pt
  // home-indicator inset. That is why surfaces which DID apply the token still
  // had content under the pill on the device pass. A static token cannot see a
  // runtime inset, so the clearance is a hook now.
  const [tokens, bottomNav, primitivesIndex] = await Promise.all([
    read('ui/tokens.ts'),
    read('ui/primitives/BottomNav.tsx'),
    read('ui/primitives/index.ts'),
  ]);

  // The token is gone, so nothing can quietly go back to the flat number.
  assert.doesNotMatch(
    tokens,
    /floatingNavClearance:/,
    'floatingNavClearance must not come back as a static token'
  );
  // The two design values it derives from live in tokens, and the bar reads
  // them — so the bar and the screens can never disagree about the geometry.
  assert.match(tokens, /floatingNavHeight: FLOATING_NAV_HEIGHT,/);
  assert.match(tokens, /floatingNavGap: FLOATING_NAV_GAP,/);
  assert.match(bottomNav, /export const TAB_BAR_CONTENT_HEIGHT = layout\.floatingNavHeight;/);
  assert.match(bottomNav, /export const TAB_BAR_FLOAT_MARGIN = layout\.floatingNavGap;/);
  // The hook is the height plus the margin that floats it, read from the
  // device — not a second copy of the arithmetic.
  assert.match(
    bottomNav,
    /export function useFloatingNavClearance\(\): number \{\s*const insets = useSafeAreaInsets\(\);\s*return bottomNavHeight\(insets\.bottom\);\s*\}/
  );
  assert.match(
    bottomNav,
    /return TAB_BAR_CONTENT_HEIGHT \+ Math\.max\(insetBottom, TAB_BAR_FLOAT_MARGIN\);/
  );
  assert.match(primitivesIndex, /useFloatingNavClearance,/);
});

test('every tab-contained scroll surface clears the floating pill', async () => {
  // emerald(3): the named device-pass surfaces plus the peers found with them.
  // A screen qualifies by having the clearance reach whichever element is LAST
  // above the pill — the scroller when there is no footer, the composer when
  // there is one.
  //
  // home(7) SPLIT THIS ROSTER. It used to also accept a PINNED footer carrying
  // the clearance, which is how the double count survived: a pinned action bar
  // is laid out above the bar, permanently, so giving it the pill's whole
  // footprint reserved that space twice. Pinned footers are now checked by the
  // test below instead — with the opposite assertion — and this list is
  // scrolling surfaces and the chat composer only. screens/PostJobScreen.tsx
  // left it entirely: everything on that screen sits above a footer that is
  // always rendered, so nothing there travels under the pill.
  const surfaces = [
    // Templates — these carry 17 screens between them, including the device
    // pass's Notifications feed, Services & availability and Delete account.
    // FormScreen and DetailScreen are here for their NO-footer branch.
    'ui/templates/FormScreen.tsx',
    'ui/templates/DetailScreen.tsx',
    'ui/templates/SuccessScreen.tsx',
    // Hand-rolled surfaces.
    'screens/ProfileDetailsScreen.tsx',
    'screens/ClientJobDetailScreen.tsx',
    'screens/ChatScreen.tsx',
    'screens/AccountSafetyScreen.tsx',
    'screens/NotificationSettingsScreen.tsx',
    'screens/JobDetailScreen.tsx',
    'screens/WorkerJobScreen.tsx',
    'screens/SubmitBidScreen.tsx',
    'screens/CounterofferScreen.tsx',
    'screens/LegalDocumentScreen.tsx',
    'screens/ProfileReviewsScreen.tsx',
    'screens/WorkerProfileScreen.tsx',
    'screens/AppearanceScreen.tsx',
    'screens/AdminReportsScreen.tsx',
    'screens/CellJobsScreen.tsx',
    'screens/WorkerResultsScreen.tsx',
    'screens/WorkerSearchScreen.tsx',
  ];

  for (const path of surfaces) {
    const source = await read(path);
    assert.match(
      source,
      /useFloatingNavClearance\(\)/,
      `${path} must take its bottom clearance from the shared hook`
    );
    // Applied directly, OR handed to the shared rising column — 2026-08-23,
    // when chat's keyboard rise moved into components/KeyboardRisingColumn.tsx
    // so a reanimated build could track the keyboard instead of imitating its
    // curve. What the column DOES with it is the block below the loop, and the
    // answer changed: chat's bottom element is pinned, so the clearance is the
    // rise's subtrahend rather than padding. Nothing here got weaker — a
    // surface that neither applies it nor hands it over still fails.
    assert.ok(
      /paddingBottom: navClearance/.test(source) ||
        /insetBelow=\{navClearance\}/.test(source),
      `${path} must apply the clearance to whatever sits last above the pill`
    );
    // The double count cannot come back HERE either: a clearance that has
    // something added to it is a footer's arithmetic, not a scroller's.
    assert.doesNotMatch(
      source,
      /paddingBottom: [\w.]+ \+ navClearance/,
      `${path} adds to the clearance — that is the pinned-footer double count (home(7))`
    );
  }

  // CHAT SPENDS ITS CLEARANCE ON THE RISE, NOT ON PADDING — corrected 2026-08-23.
  //
  // This block used to require the opposite, and requiring it was the chat
  // double count. Chat's bottom element is PINNED, not scrolling: the composer
  // (or the locked / blocked notice) never travels under the pill, and the bar
  // sits in normal flow beneath the scene, so the scene already ends at the
  // pill's top edge — the very reasoning the pinned-footer test below states.
  // Applying the whole footprint again inside the column held the composer a
  // pill's height clear of a pill that was no longer there, in BOTH states:
  // at rest above the pill, and risen above the keyboard, because `riseFor`
  // had already subtracted the clearance.
  //
  // So the clearance is still read, still handed over, and still subtracted
  // from the rise — the loop above requires all of that, unchanged. What the
  // column applies below itself is a pinned element's own breathing room.
  // Nothing here got weaker: a path that re-applied the footprint, or that
  // applied no padding at all, now fails.
  for (const path of [
    'components/KeyboardRisingColumn.tsx',
    'components/KeyboardRisingColumn.motion120.tsx',
  ]) {
    const source = await read(path);
    assert.match(
      source,
      /\{ paddingBottom: COLUMN_BOTTOM_PADDING \}/,
      `${path} must apply the pinned-column padding on the view that rises`
    );
    assert.doesNotMatch(
      source,
      /paddingBottom: insetBelow/,
      `${path} re-reserves the pill's footprint — that is the chat clearance double count`
    );
  }

  // ONE VALUE, ONE PLACE, so the two binaries cannot land differently — and
  // DERIVED from the quantity home(7) already defined for a pinned composer
  // rather than being a fresh number.
  const shared = await read('components/KeyboardRisingColumn.shared.tsx');
  assert.match(
    shared,
    /export const COLUMN_BOTTOM_PADDING = PINNED_FOOTER_BOTTOM_PADDING;/,
    'the column padding must be home(7)s pinned-footer padding, not a new literal'
  );
  // The rise arithmetic did NOT move: insetBelow is still the subtrahend.
  assert.match(shared, /return Math\.max\(0, keyboardHeight - insetBelow\);/);
});

test('a PINNED footer takes its own padding, never the scroll clearance', async () => {
  // home(7) — the distinguishing assertion. Two kinds of bottom element, two
  // different quantities, and they must not be confused again:
  //
  //   SCROLLING content passes UNDER the pill, so it reserves the pill's whole
  //   footprint — height plus the margin that floats it, read from the device.
  //   That is useFloatingNavClearance(), and the test above still requires it.
  //
  //   A PINNED footer never travels. The bar is laid out in normal flow
  //   beneath the scene, so its space is already reserved; a footer that also
  //   reserved it put ~104pt of empty chrome under every action button.
  const pinned = [
    ['ui/templates/FormScreen.tsx', 'footer'],
    ['ui/templates/DetailScreen.tsx', 'actionBar'],
    ['screens/PostJobScreen.tsx', 'footer'],
  ];

  // The shared value, and that it is DERIVED from the bar's own geometry
  // rather than being a fresh literal — the same rule the clearance follows.
  const bottomNav = await read('ui/primitives/BottomNav.tsx');
  assert.match(
    bottomNav,
    /export const PINNED_FOOTER_BOTTOM_PADDING = layout\.floatingNavGap;/,
    'the pinned footer padding must derive from the pill geometry, not be hardcoded'
  );
  assert.match(await read('ui/primitives/index.ts'), /PINNED_FOOTER_BOTTOM_PADDING,/);

  for (const [path, styleName] of pinned) {
    const flat = (await read(path)).replace(/\s+/g, ' ');

    // The footer's style is whatever the STYLESHEET declares plus whatever the
    // JSX layers on top. Importing the constant is not applying it, so both
    // halves are gathered and the assertion is made against them — not against
    // the file at large.
    const declAt = flat.indexOf(` ${styleName}: { `);
    assert.notEqual(declAt, -1, `${path} must still declare a ${styleName} style`);
    const declEnd = flat.indexOf(' }, ', declAt);
    assert.notEqual(declEnd, -1, `${path}: ${styleName} must stay a flat style object`);
    const declared = flat.slice(declAt, declEnd);

    // Only the templates layer an inline override; PostJobScreen puts the
    // padding in the stylesheet and passes `style={styles.footer}` bare.
    const useAt = flat.indexOf(`styles.${styleName},`);
    let applied = '';
    if (useAt !== -1) {
      const useEnd = flat.indexOf(']}', useAt);
      assert.notEqual(useEnd, -1, `${path}: the ${styleName} style array must close`);
      applied = flat.slice(useAt, useEnd);
    }
    const footerStyle = `${declared} ${applied}`;

    assert.match(
      footerStyle,
      /paddingBottom: PINNED_FOOTER_BOTTOM_PADDING/,
      `${path}'s pinned ${styleName} must APPLY the shared pinned-footer padding, not just import it`
    );
    assert.doesNotMatch(
      footerStyle,
      /navClearance/,
      `${path}: the pinned ${styleName} must not reserve the pill's footprint a second time`
    );
  }

  // The hook itself is untouched — scrolling surfaces still need it, and
  // home(7) explicitly does not retire it or reintroduce a static token.
  assert.match(bottomNav, /export function useFloatingNavClearance\(\): number \{/);
  assert.doesNotMatch(
    await read('ui/tokens.ts'),
    /floatingNavClearance/,
    'the static clearance token must not return as a side effect of home(7)'
  );
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
