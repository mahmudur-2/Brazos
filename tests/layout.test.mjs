import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Home feed does not reserve a redundant gap above the safe tab bar', async () => {
  const [homeScreen, app] = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('App.tsx'),
  ]);

  assert.match(homeScreen, /paddingBottom: 0/);
  assert.match(app, /const tabBarHeight = TAB_BAR_CONTENT_HEIGHT \+ bottomInset/);
  assert.match(app, /paddingBottom: bottomInset/);
});
