import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const maplibreDist = resolve(projectRoot, 'node_modules', 'maplibre-gl', 'dist');
const vendorDir = resolve(projectRoot, 'public', 'vendor');

await mkdir(vendorDir, { recursive: true });

await Promise.all([
  copyFile(
    resolve(maplibreDist, 'maplibre-gl-csp.js'),
    resolve(vendorDir, 'maplibre-gl-csp.js')
  ),
  copyFile(
    resolve(maplibreDist, 'maplibre-gl-csp-worker.js'),
    resolve(vendorDir, 'maplibre-gl-csp-worker.js')
  ),
  copyFile(
    resolve(maplibreDist, 'maplibre-gl.css'),
    resolve(vendorDir, 'maplibre-gl.css')
  ),
]);

console.log('Synced same-origin MapLibre assets.');
