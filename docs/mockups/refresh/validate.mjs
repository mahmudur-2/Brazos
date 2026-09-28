// Opens every screen of screens.js in one app of the refresh viewer, the way the viewer does, and
// reports for each: did the taps arrive, what the screen shows first, and anything that broke
// (a page error, a failed request to the sample world). Four at a time.
//   node docs/mockups/refresh/validate.mjs before|after [dark|light] [id …]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, '..', '..', '..', '.shots', 'refresh');
const [which = 'before', scheme = 'dark', ...only] = process.argv.slice(2);
const win = {};
new Function('window', readFileSync(join(here, 'screens.js'), 'utf8'))(win);
const screens = win.REFRESH_SCREENS.filter((s) => !only.length || only.includes(s.id));
const browser = await chromium.launch();

async function run(s) {
  const steps = which === 'after' && s.afterSteps ? s.afterSteps : s.steps;
  const q = `app=${which}&scheme=${scheme}&land=${s.land || 'app'}&mode=${s.mode || 'customer'}` + (s.draft ? '&draft=' + (s.draft === 2 ? 2 : 1) : '') + (s.fresh ? '&fresh=1' : '') + (steps && steps.length ? '&steps=' + encodeURIComponent(JSON.stringify(steps)) : '');
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  await page.addInitScript(() => { window.addEventListener('message', (e) => { if (e.data && e.data.source === 'refresh-app' && e.data.type !== 'error') window.__outcome = e.data; }); });
  await page.goto(pathToFileURL(join(base, which, 'index.html')).href + '?' + q);
  let outcome = null;
  for (let i = 0; i < 200 && !outcome; i++) { await page.waitForTimeout(150); outcome = await page.evaluate(() => window.__outcome || null).catch(() => null); }
  await page.waitForTimeout(900);
  const view = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!(r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && cs.visibility !== 'hidden' && +cs.opacity > 0)) return false;
      const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 20), 1), innerHeight - 1);
      const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    };
    const out = []; const seen = new Set();
    for (const el of document.querySelectorAll('body *')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (!own || own.length < 2 || seen.has(own) || !vis(el)) continue; seen.add(own); out.push(own.slice(0, 40));
    }
    const failed = (window.__REFRESH_MOCK__?.log || []).filter((l) => l.status >= 400).map((l) => `${l.status} ${l.method} ${l.path.split('?')[0]}`);
    return { texts: out.slice(0, 9), failed: [...new Set(failed)] };
  });
  await page.close();
  return { s, outcome, errors, view };
}

let bad = 0;
for (let i = 0; i < screens.length; i += 4) {
  const batch = await Promise.all(screens.slice(i, i + 4).map(run));
  for (const r of batch) {
    const ok = r.outcome && r.outcome.type === 'arrived' && !r.errors.length;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${r.s.id.padEnd(18)} ${r.outcome ? r.outcome.type + (r.outcome.error ? ' (' + r.outcome.error + ')' : '') : 'no outcome'} | ${r.view.texts.join(' · ')}${r.errors.length ? ' | ERR ' + r.errors.join(' ; ') : ''}${r.view.failed.length ? ' | 4xx/5xx ' + r.view.failed.join(', ') : ''}`);
  }
}
console.log(`\n${screens.length - bad}/${screens.length} arrived in ${which} (${scheme})`);
await browser.close();
