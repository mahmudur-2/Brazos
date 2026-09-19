// Inlines the real dark AND light Home renders into glass-sheet.html as the
// dimmed backdrops. Run after glass-sheet.build.mjs. Idempotent.
//
//   node docs/mockups/html/embed-backdrop-glass.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const file = join(here, 'glass-sheet.html');
const dark = readFileSync(join(root, '.shots', 'customer-home-dark.png')).toString('base64');
const light = readFileSync(join(root, '.shots', 'customer-home-light.png')).toString('base64');

let html = readFileSync(file, 'utf8');
html = html.split('__HOME_DARK__').join(`data:image/png;base64,${dark}`);
html = html.split('__HOME_LIGHT__').join(`data:image/png;base64,${light}`);
writeFileSync(file, html);
console.log(`embedded both backdrops; ${(html.length / 1024).toFixed(0)} KB`);
