// Inlines the real dark Home render (.shots/customer-home-dark.png, produced by
// scripts/shots.mjs) into create-sheet.html as the dimmed backdrop, so the popup
// is drawn over the screen it actually appears on. Idempotent.
//
//   node docs/mockups/html/embed-backdrop.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const file = join(here, 'create-sheet.html');
const png = join(root, '.shots', 'customer-home-dark.png');

const b64 = readFileSync(png).toString('base64');
let html = readFileSync(file, 'utf8');
const before = html;
html = html.split('__HOME_DARK__').join(`data:image/png;base64,${b64}`);
html = html.replace(/src="data:image\/png;base64,[A-Za-z0-9+/=]+"/g, `src="data:image/png;base64,${b64}"`);
writeFileSync(file, html);
console.log(before === html ? 'nothing to embed' : `embedded backdrop; ${(html.length / 1024).toFixed(0)} KB`);
