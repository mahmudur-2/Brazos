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
    'screens/BrowseJobsScreen.tsx',
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
