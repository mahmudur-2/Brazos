import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('main tab screens do not reserve redundant gaps above the safe tab bar', async () => {
  const [homeScreen, myJobs, messages, profile, app] = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('screens/MyJobsHubScreen.tsx'),
    read('screens/MessagesInboxScreen.tsx'),
    read('screens/ProfileScreen.tsx'),
    read('App.tsx'),
  ]);

  for (const screen of [homeScreen, myJobs, messages, profile]) {
    assert.match(screen, /paddingBottom: 0/);
  }
  assert.match(app, /const tabBarHeight = TAB_BAR_CONTENT_HEIGHT \+ bottomInset/);
  assert.match(app, /paddingBottom: bottomInset/);
});
