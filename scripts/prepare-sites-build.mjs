import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const clientDir = resolve(projectRoot, 'dist', 'client');
const serverDir = resolve(projectRoot, 'dist', 'server');
const workerSource = resolve(projectRoot, 'hosting', 'sites-worker.js');
const workerTarget = resolve(serverDir, 'index.js');

await mkdir(serverDir, { recursive: true });
await copyFile(workerSource, workerTarget);

const manifest = JSON.parse(await readFile(resolve(clientDir, 'manifest.json'), 'utf8'));
const indexHtml = await readFile(resolve(clientDir, 'index.html'), 'utf8');

if (manifest.display !== 'standalone' || !indexHtml.includes('rel="manifest"')) {
  throw new Error('PWA metadata is missing from the production web build.');
}

for (const requiredFile of ['icon-192.png', 'icon-512.png', 'sw.js', 'config.js']) {
  await readFile(resolve(clientDir, requiredFile));
}

console.log('Prepared BRAZOS for Sites hosting.');
