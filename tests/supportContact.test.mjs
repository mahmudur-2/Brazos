import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// a1 (2026-09-05) — the published support contact.
//
// docs/DECISIONS.md 2026-09-05 entry (3): brazosmvp@gmail.com is the contact,
// reached as a mailto link, as one row on the profile's Settings list. The
// address is spelled ONCE, in lib/appLinks.ts, so moving it to the domain's
// mailbox (docs/BACKLOG.md side backlog 7) is one edit — the census at the
// bottom of this file is what keeps that true.
// ---------------------------------------------------------------------------

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ADDRESS = 'brazosmvp@gmail.com';

// lib/appLinks.ts executed for real. It imports nothing, so it loads straight
// from its own file URL the way tests/errorMessage.test.mjs loads
// lib/errorMessage.ts — no data-URL rewrite is needed here.
const { SUPPORT_EMAIL, supportMailtoUrl, PROFILE_WEB_BASE_URL } = await import(
  pathToFileURL(join(root, 'lib/appLinks.ts')).href
);

test('a1 · lib/appLinks.ts publishes the address and assembles the mailto in one place', () => {
  assert.equal(SUPPORT_EMAIL, ADDRESS);
  assert.equal(supportMailtoUrl(), `mailto:${ADDRESS}`);
  // Nothing else in the module moved.
  assert.equal(PROFILE_WEB_BASE_URL, 'https://brazos.app');

  // Import-free, which is the property that lets the import above work.
  const code = stripComments(read('lib/appLinks.ts'));
  assert.deepEqual([...code.matchAll(/^import .*$/gm)].map((m) => m[0]), []);
});

test('a1 · the Profile hub carries Contact support as a row that opens the mailto', () => {
  const code = stripComments(read('screens/ProfileScreen.tsx'));

  // The screen imports the address; it never retypes it.
  assert.match(code, /import \{ SUPPORT_EMAIL, supportMailtoUrl \} from '\.\.\/lib\/appLinks';/);
  assert.doesNotMatch(code, /brazosmvp/, 'the address reaches the screen only through the constant');

  // One opener, the house shape (screens/PayoutsScreen.tsx). canOpenURL would
  // need an LSApplicationQueriesSchemes entry app.config.ts does not carry.
  assert.equal(
    (code.match(/Linking\.openURL\(supportMailtoUrl\(\)\)/g) ?? []).length,
    1,
    'exactly one Linking.openURL(supportMailtoUrl())'
  );
  assert.doesNotMatch(code, /canOpenURL/);

  // The failure still publishes the contact, through lib/dialog (never Alert).
  assert.match(
    code,
    /alertAsync\(\s*'Could not open your mail app',\s*`Write to \$\{SUPPORT_EMAIL\}\.`\s*\)/
  );
  assert.doesNotMatch(code, /Alert\.alert\(/);

  // Every row the hub opens, in one table.
  const start = code.indexOf('const HUB_SETTINGS: SettingsRow[] = [');
  assert.ok(start > 0, 'HUB_SETTINGS is typed SettingsRow[]');
  const block = code.slice(start, code.indexOf('\n];', start));
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  // 2026-09-26 (the refresh, audits M-16/M-22/M-24): rows renamed so each
  // names its destination ('Earnings & payouts'). 2026-09-29 (LUX-LIST-2 #7,
  // the rebuilt hub): the two notification rows are ONE, 'Notifications' —
  // the feed, the name its screen wears, whose header gear opens Notification
  // settings — and Payment methods and Account & safety joined the table
  // (Payment methods moved off Account & safety).
  assert.deepEqual(labels, [
    'Saved & past workers',
    'Services & availability',
    'Earnings & payouts',
    'Payment methods',
    'Notifications',
    'Account & safety',
    'Contact support',
  ]);
  // M-22, kept — each mode leads with its own rows (HUB_LAYOUT: YOUR PROFILE,
  // MONEY) and puts the other mode's behind one row that opens in place; with
  // NOTIFICATIONS and ACCOUNT, which both modes share, EVERY row is drawn
  // exactly once in each mode, and Contact support is the ACCOUNT card's.
  const layout = code.slice(code.indexOf('const HUB_LAYOUT'), code.indexOf('\n};', code.indexOf('const HUB_LAYOUT')));
  const listOf = (text, name) => {
    const at = text.indexOf(`${name}: [`);
    assert.ok(at >= 0, `${name} is listed`);
    return [...text.slice(at, text.indexOf(']', at)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  const notifications = [...code.slice(code.indexOf('const HUB_NOTIFICATIONS = ['), code.indexOf('];', code.indexOf('const HUB_NOTIFICATIONS = ['))).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const account = [...code.slice(code.indexOf('const HUB_ACCOUNT = ['), code.indexOf('];', code.indexOf('const HUB_ACCOUNT = ['))).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(notifications, ['Notifications']);
  assert.deepEqual(account, ['Account & safety', 'Contact support']);
  for (const mode of ['customer', 'worker']) {
    const own = layout.slice(layout.indexOf(`${mode}: {`), layout.indexOf('},', layout.indexOf(`${mode}: {`)));
    const drawn = [...listOf(own, 'profile'), ...listOf(own, 'money'), ...listOf(own, 'tools'), ...notifications, ...account];
    assert.deepEqual([...drawn].sort(), [...labels].sort(), `${mode} draws every row exactly once`);
  }
  assert.match(block, /mailto: true,\s*icon: 'mail-outline',\s*label: 'Contact support',/);
  assert.match(block, /sub: `Email \$\{SUPPORT_EMAIL\}`/);

  // One renderer still draws every row, and every route dispatches through it.
  assert.match(code, /key=\{row\.label\}/);
  assert.match(
    code,
    /onPress=\{\s*'route' in row\s*\?\s*\(\) => navigation\.navigate\(row\.route\)\s*:\s*\(\) => void openSupportMail\(\)\s*\}/
  );
  for (const route of [
    'Notifications',
    'Earnings',
    'ServicesPricing',
    'SavedWorkers',
    'PaymentMethods',
    'AccountSafety',
  ]) {
    assert.ok(block.includes(`route: '${route}'`), `${route} is still a row`);
  }
});

/** Every tree that holds app code; the frozen web surface is never product
 *  code, and dev-tools/ is excluded wherever it sits — the walk
 *  tests/legacyAggregateFence.test.mjs uses. */
const APP_TREES = ['lib', 'screens', 'components', 'hooks'];

function appSources(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) {
      if (entry === 'dev-tools') continue;
      out.push(...appSources(rel));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.web\.tsx?$/.test(entry)) continue;
    out.push(rel);
  }
  return out;
}

test('a1 · the address is spelled in exactly one app file, and it is lib/appLinks.ts', () => {
  const carriers = APP_TREES.flatMap(appSources).filter((rel) => read(rel).includes(ADDRESS));
  assert.deepEqual(
    carriers,
    ['lib/appLinks.ts'],
    'one constant is the whole edit when the domain mailbox exists'
  );
});
