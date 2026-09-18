// Inlines the three prestige assets into home-redesign.html as data URIs so the
// file is self-contained — it renders anywhere (browser, preview pane, a chat
// upload) with no path to resolve. The original path is kept on each <img> as
// data-asset="…" so the implementer still sees which real file it is.
//
//   node docs/mockups/html/embed-assets.mjs
//
// Idempotent: an <img> already carrying a data: URI is left alone.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const file = join(here, 'home-redesign.html');

let html = readFileSync(file, 'utf8');
let count = 0;

html = html.replace(/src="\.\.\/\.\.\/\.\.\/(assets\/prestige\/[A-Za-z0-9_]+\.png)"/g, (_m, rel) => {
  const b64 = readFileSync(join(root, rel)).toString('base64');
  count += 1;
  return `data-asset="${rel}" src="data:image/png;base64,${b64}"`;
});

writeFileSync(file, html);
console.log(`embedded ${count} image(s); ${(html.length / 1024).toFixed(0)} KB`);
