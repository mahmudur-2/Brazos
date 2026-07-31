import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
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
const staticConfigPath = resolve(clientDir, 'config.js');

if (manifest.display !== 'standalone' || !indexHtml.includes('rel="manifest"')) {
  throw new Error('PWA metadata is missing from the production web build.');
}

for (const requiredFile of [
  'icon-192.png',
  'icon-512.png',
  'sw.js',
  'vendor/maplibre-gl-csp.js',
  'vendor/maplibre-gl-csp-worker.js',
  'vendor/maplibre-gl.css',
]) {
  await readFile(resolve(clientDir, requiredFile));
}

// Expo copies the local placeholder from public/. It is useful in development,
// but production must leave /config.js to the Worker so Sites can inject the
// hosted Supabase client configuration at request time.
await readFile(staticConfigPath);
await rm(staticConfigPath);

console.log('Prepared BRAZOS for Sites hosting.');
