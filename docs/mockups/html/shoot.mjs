// Renders a mockup page to PNGs at phone size and 2x, with the harness's own
// browser, so a mockup can be reviewed as a picture (or sent to a phone).
// Every `.phone` on the page is shot separately, named by its data-shot
// attribute (or the file's name when it has none).
//
//   node docs/mockups/html/shoot.mjs map-explore-dark.html [more.html …]
//   → .shots/mockups/<data-shot or name>.png

import { mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', '..', '.shots', 'mockups');
mkdirSync(out, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, deviceScaleFactor: 2 });
for (const file of process.argv.slice(2)) {
  await page.goto(pathToFileURL(join(here, file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const phones = page.locator('.phone');
  const n = await phones.count();
  for (let i = 0; i < n; i++) {
    const phone = phones.nth(i);
    const name = (await phone.getAttribute('data-shot')) || basename(file, '.html');
    const target = join(out, `${name}.png`);
    await phone.scrollIntoViewIfNeeded();
    await phone.screenshot({ path: target });
    console.log('wrote', target);
  }
}
await browser.close();
