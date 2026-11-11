// The public website (scripts/build-site.mjs): Support, Privacy and Terms for App Store Connect.
// The legal text has ONE source, lib/legal/: the site is generated from it and never hand-copied,
// and a page may hold no script, no tracker and no address on another host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'brazos-site-'));
const run = spawnSync(process.execPath, ['scripts/build-site.mjs', '--out', out], { encoding: 'utf8' });
const page = (file) => fs.readFileSync(path.join(out, file), 'utf8');
const read = (file) => fs.readFileSync(file, 'utf8');
const PAGES = ['index.html', 'support.html', 'privacy.html', 'terms.html', '404.html'];

test.after(() => fs.rmSync(out, { recursive: true, force: true }));

test('[run] the site builds: five pages and the headers file', () => {
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(fs.readdirSync(out).sort(), [...PAGES, '_headers'].sort());
});

test('[run] no page holds a script, a cookie, a tracker or an address on another host', () => {
  for (const file of PAGES) {
    const html = page(file);
    assert.doesNotMatch(html, /<script|<iframe|<img|<link rel="stylesheet"|document\.cookie/i, `${file} loads nothing`);
    assert.doesNotMatch(html, /https?:\/\//i, `${file} names no other host`);
    assert.match(html, /prefers-color-scheme:dark/, `${file} follows the device's light or dark setting`);
    assert.doesNotMatch(html, /Working draft/i, `${file} carries no draft notice`);
  }
  // Every page but the 404 links relatively, so the folder works under any address.
  for (const file of PAGES.filter((f) => f !== '404.html')) {
    assert.doesNotMatch(page(file), /href="\//, `${file} links relatively`);
  }
});

test('[run] the legal pages are the lib/legal text: every section, the date and the version reach the page', () => {
  const index = read('lib/legal/index.ts');
  for (const [source, file, constant] of [
    ['lib/legal/termsOfService.ts', 'terms.html', 'TERMS_VERSION'],
    ['lib/legal/privacyPolicy.ts', 'privacy.html', 'PRIVACY_VERSION'],
  ]) {
    const text = read(source);
    const html = page(file).replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    const heads = [...text.matchAll(/^## (?:\d+\. )?(.+)$/gm)].map((m) => m[1].trim());
    assert.ok(heads.length >= 10, `${source} has its sections`);
    for (const head of heads) assert.ok(html.includes(`<h2>${head}</h2>`), `${file} carries "${head}"`);
    const updated = text.match(/^Last updated: .+$/m)[0];
    assert.ok(html.includes(updated), `${file} shows "${updated}"`);
    const version = index.match(new RegExp(`export const ${constant} = '([^']+)';`))[1];
    assert.ok(html.includes(`Version ${version}`), `${file} shows version ${version}`);
    assert.doesNotMatch(html, /\$\{/, `${file} leaves no template unfilled`);
  }
});

test('[static] the support address comes from lib/appLinks.ts, and the built folder is never committed', () => {
  const script = read('scripts/build-site.mjs');
  const address = read('lib/appLinks.ts').match(/export const SUPPORT_EMAIL = '([^']+)';/)[1];
  assert.ok(!script.includes(address), 'the script never spells the address');
  assert.ok(page('support.html').includes(`mailto:${address}`), 'the Support page mails the published address');
  assert.match(read('.gitignore'), /^site\/$/m);
});
