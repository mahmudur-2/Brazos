// Inlines the real dark AND light Home renders into glass-sheet.html (or the
// file named as the one argument) as the dimmed backdrops. Run after
// glass-sheet.build.mjs. Idempotent.
//
//   node docs/mockups/html/embed-backdrop-glass.mjs
//   node docs/mockups/html/embed-backdrop-glass.mjs create-sheet-decide.html

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const name = process.argv[2] ?? 'glass-sheet.html';
const file = join(here, name);
const dark = readFileSync(join(root, '.shots', 'customer-home-dark.png')).toString('base64');
const light = readFileSync(join(root, '.shots', 'customer-home-light.png')).toString('base64');

let html = readFileSync(file, 'utf8');
html = html.split('__HOME_DARK__').join(`data:image/png;base64,${dark}`);
html = html.split('__HOME_LIGHT__').join(`data:image/png;base64,${light}`);
writeFileSync(file, html);
console.log(`embedded both backdrops into ${name}; ${(html.length / 1024).toFixed(0)} KB`);
