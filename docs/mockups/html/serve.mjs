// Serves this folder on http://127.0.0.1:4173 so the mockup can be viewed in a
// browser or the preview pane. Static, read-only, no dependencies.
//
//   node docs/mockups/html/serve.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.mjs': 'text/javascript' };

createServer(async (req, res) => {
  const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '') || 'home-redesign.html';
  try {
    const body = await readFile(join(here, name));
    res.writeHead(200, { 'content-type': types[extname(name)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(4173, '127.0.0.1', () => console.log('mockup at http://127.0.0.1:4173/home-redesign.html'));
