// Renders a mockup page to a PNG at phone size and 2x, with the harness's own
// browser, so a mockup can be reviewed as a picture (or sent to a phone).
//
//   node docs/mockups/html/shoot.mjs map-explore-dark.html [more.html …]
//   → .shots/mockups/<name>.png

import { mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', '..', '.shots', 'mockups');
mkdirSync(out, { recursive: true });

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 425, height: 908 }, deviceScaleFactor: 2 });
for (const file of process.argv.slice(2)) {
  await page.goto(pathToFileURL(join(here, file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const phone = page.locator('.phone').first();
  const target = join(out, basename(file, '.html') + '.png');
  await phone.screenshot({ path: target, omitBackground: false });
  console.log('wrote', target);
}
await browser.close();
