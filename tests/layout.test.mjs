import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

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
  assert.match(bottomNav, /const tabBarHeight = TAB_BAR_CONTENT_HEIGHT \+ bottomInset/);
  assert.match(bottomNav, /paddingBottom: bottomInset/);
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
