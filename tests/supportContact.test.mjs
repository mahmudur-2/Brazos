import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
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

// lib/appLinks.ts executed for real. T3 (production-36h): it now holds the one support-mail opener,
// so its two imports (react-native's Linking, lib/dialog's alertAsync) are replaced by stand-ins
// that log what the opener does.
let appLinksJs = stripTypeScriptTypes(read('lib/appLinks.ts'), { mode: 'strip' });
for (const [from, to] of [
  ["import { Linking } from 'react-native';", 'const Linking = { openURL: (url) => globalThis.__support_mail.openURL(url) };'],
  ["import { alertAsync } from './dialog';", 'const alertAsync = (title, message) => globalThis.__support_mail.alert(title, message);'],
]) {
  assert.ok(appLinksJs.includes(from), `expected the import: ${from}`);
  appLinksJs = appLinksJs.replace(from, () => to);
}
const { SUPPORT_EMAIL, supportMailtoUrl, openSupportMail } = await import(
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(appLinksJs, 'utf8').toString('base64')
);

test('a1 · lib/appLinks.ts publishes the address and assembles the mailto in one place', () => {
  assert.equal(SUPPORT_EMAIL, ADDRESS);
  assert.equal(supportMailtoUrl(), `mailto:${ADDRESS}`);
  // (Lean D5 removed the public profile link, PROFILE_WEB_BASE_URL with it.)

  // T3: the only imports are the two the opener needs.
  const code = stripComments(read('lib/appLinks.ts'));
  assert.deepEqual([...code.matchAll(/^import .*$/gm)].map((m) => m[0]), [
    "import { Linking } from 'react-native';",
    "import { alertAsync } from './dialog';",
  ]);
  assert.doesNotMatch(code, /canOpenURL|Alert\./);
});

test('T3 · the one support-mail opener: the mailto opens; when it cannot, the address is published through lib/dialog', async () => {
  const run = async (opens) => {
    const log = [];
    globalThis.__support_mail = {
      openURL: async (url) => {
        log.push(`open ${url}`);
        if (!opens) throw new Error('No mail app');
      },
      alert: async (title, message) => log.push(`alert ${title}: ${message}`),
    };
    await openSupportMail();
    return log;
  };
  assert.deepEqual(await run(true), [`open mailto:${ADDRESS}`]);
  assert.deepEqual(await run(false), [`open mailto:${ADDRESS}`, `alert Could not open your mail app: Write to ${ADDRESS}.`]);
  // The three places use this one opener and keep no copy of their own.
  for (const file of ['screens/ProfileScreen.tsx', 'screens/DeleteAccountScreen.tsx', 'screens/SuspendedAccountScreen.tsx']) {
    const screen = stripComments(read(file));
    assert.match(screen, /import \{ openSupportMail, SUPPORT_EMAIL \} from '\.\.\/lib\/appLinks';/, file);
    assert.doesNotMatch(screen, /function openSupportMail|Linking\.openURL|supportMailtoUrl|canOpenURL/, file);
    assert.match(screen, /void openSupportMail\(\)/, file);
  }
});

test('a1 · the Profile hub carries Contact support as a row that opens the mailto', () => {
  const code = stripComments(read('screens/ProfileScreen.tsx'));

  // The screen imports the address and the one opener (T3, lib/appLinks.ts, executed above); it
  // never retypes either. canOpenURL would need an LSApplicationQueriesSchemes entry app.config.ts
  // does not carry; the opener's failure still publishes the contact, through lib/dialog.
  assert.match(code, /import \{ openSupportMail, SUPPORT_EMAIL \} from '\.\.\/lib\/appLinks';/);
  assert.doesNotMatch(code, /brazosmvp/, 'the address reaches the screen only through the constant');
  assert.doesNotMatch(code, /canOpenURL/);
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
  // (Payment methods moved off Account & Safety).
  assert.deepEqual(labels, [
    'Services & Availability',
    'Earnings & Payouts',
    'Payment Methods',
    'Notifications',
    'Account & Safety',
    'Contact Support',
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
  assert.deepEqual(account, ['Account & Safety', 'Contact Support']);
  for (const mode of ['customer', 'worker']) {
    const own = layout.slice(layout.indexOf(`${mode}: {`), layout.indexOf('},', layout.indexOf(`${mode}: {`)));
    const drawn = [...listOf(own, 'profile'), ...listOf(own, 'money'), ...listOf(own, 'tools'), ...notifications, ...account];
    assert.deepEqual([...drawn].sort(), [...labels].sort(), `${mode} draws every row exactly once`);
  }
  assert.match(block, /mailto: true,\s*icon: 'mail-outline',\s*label: 'Contact Support',/);
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
    'PaymentMethods',
    'AccountSafety',
  ]) {
    assert.ok(block.includes(`route: '${route}'`), `${route} is still a row`);
  }
});

/** Every tree that holds app code; the frozen web surface is never product
 *  code — the walk tests/legacyAggregateFence.test.mjs uses. */
const APP_TREES = ['lib', 'screens', 'components', 'hooks'];

function appSources(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) {
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
