/**
 * THE REFRESH — run with each phone update (operator, 2026-10-04: "with each
 * phone update"), right after `npm run update:preview`:
 *
 *   npm run demo:refresh            export → robot → staging config → deploy
 *   npm run demo:refresh -- --no-deploy   everything but the upload
 *
 * Needs the local stack running (`supabase start`; the robot runs on it) and
 * the machine's EAS login (the deploy and the staging values come from EAS).
 *
 * THE GATE. The robot walks the exact bundle that ships; its pass is written
 * against that bundle's hash, and the deploy refuses a bundle with no pass.
 * A red robot leaves the live link on the last green version.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEV_DOMAIN, bundleHash, ensureWorkDir, exportDir, exportWeb, root, siteDir, stampFile } from './lib.mjs';
import { STAGING_REF } from '../supabase-ref.mjs';

const args = new Set(process.argv.slice(2));
const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} exited ${r.status}`);
};

ensureWorkDir();
console.log('[demo-link] 1/4 exporting the web copy');
exportWeb();

console.log('[demo-link] 2/4 the test robot (local stack)');
run('npm', ['run', 'db:reset']);
run(process.execPath, [join('scripts', 'demo-link', 'robot.mjs')], { shell: false });
const stamp = existsSync(stampFile) ? JSON.parse(readFileSync(stampFile, 'utf8')) : null;
if (!stamp || stamp.bundle !== bundleHash(exportDir)) {
  throw new Error('Refused: no robot pass for this exact bundle.');
}

console.log('[demo-link] 3/4 pointing the copy at staging');
run('npx', ['eas', 'env:exec', 'preview', '"node scripts/demo-link/write-config.mjs"', '--non-interactive']);
const config = readFileSync(join(siteDir, 'config.js'), 'utf8');
if (!config.includes(`${STAGING_REF}.supabase.co`)) throw new Error('Refused: the site is not pointed at staging.');
if (bundleHash(siteDir) !== stamp.bundle) throw new Error('Refused: the site bundle is not the one the robot passed.');

if (args.has('--no-deploy')) {
  console.log(`[demo-link] built and checked; not deployed (--no-deploy). Site: ${siteDir}`);
  process.exit(0);
}
console.log('[demo-link] 4/4 deploying');
// Relative and forward-slashed: eas deploy appends "/" to the folder it is given, which breaks an
// absolute Windows path.
const exportArg = relative(root, siteDir).split('\\').join('/');
run('npx', ['eas', 'deploy', '--prod', '--export-dir', exportArg, '--dev-domain', DEV_DOMAIN, '--non-interactive']);
console.log(`[demo-link] live: https://${DEV_DOMAIN}.expo.app`);
