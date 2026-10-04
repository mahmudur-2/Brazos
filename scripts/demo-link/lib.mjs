/**
 * THE DEMO LINK — a browser copy of the app, shareable by URL (operator,
 * 2026-10-04: "an html build that's shareable via link", "safe copy + test
 * robot", refreshed with each phone update).
 *
 * WHAT THIS IS NOT. It is not the frozen web/PWA surface and it changes none of
 * it: public/, hosting/, dist/, *.web.ts(x) and the service worker are read,
 * exported and served exactly as they are. Everything here is additive and
 * lives in scripts/demo-link/ and the gitignored .shots/demo-link/.
 *
 * ONE BUNDLE, TWO SERVERS. The export carries a placeholder project and NO
 * server setting of any kind (lib/supabase.web.ts ignores the inlined
 * variables outside development and reads /config.js instead). So the test
 * robot and the deployed link run the SAME JavaScript file, byte for byte —
 * only /config.js differs: the local stack for the robot, staging for the
 * link. What the robot proved is what ships.
 *
 * PRACTICE MONEY. EXPO_PUBLIC_PAYMENTS_MODE=sandbox — the clearly-labelled
 * simulated ledger (lib/adapters/paymentsMode.ts). A browser has no card sheet
 * and create-payment answers no browser, so the card path cannot run here;
 * the sandbox path is RPC-only and is the beta's own labelled mode.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_REF, STAGING_REF, keyKind, refFromJwt, refFromRestUrl } from '../supabase-ref.mjs';

export const root = fileURLToPath(new URL('../..', import.meta.url));
export const workDir = join(root, '.shots', 'demo-link');
export const exportDir = join(workDir, 'web');
export const siteDir = join(workDir, 'site');
export const stampFile = join(workDir, 'robot-pass.json');
export const DEV_DOMAIN = 'brazos-demo';

/** The export's environment: a placeholder project, practice money, no vendors. */
export const DEMO_ENV = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://web-copy.invalid',
  EXPO_PUBLIC_SUPABASE_KEY: 'web-copy-placeholder-key-unused',
  EXPO_PUBLIC_PAYMENTS_MODE: 'sandbox',
  EXPO_PUBLIC_APP_VARIANT: 'preview',
  // Off: the copy's visitors are not the app's users, and their crashes and
  // taps must not land in the phone app's reports.
  EXPO_PUBLIC_SENTRY_DSN: '',
  EXPO_PUBLIC_POSTHOG_KEY: '',
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: '',
  EXPO_PUBLIC_PHONE_AUTH_MODE: '',
};

export function exportWeb() {
  const cli = join(root, 'node_modules', 'expo', 'bin', 'cli');
  const run = spawnSync(process.execPath, [cli, 'export', '--platform', 'web', '--output-dir', exportDir, '--clear'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...DEMO_ENV },
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`expo export failed with status ${run.status}`);
}

/** The one JavaScript bundle, by content hash — what the robot's pass is tied to. */
export function bundleHash(dir = exportDir) {
  const html = readFileSync(join(dir, existsSync(join(dir, 'app.html')) ? 'app.html' : 'index.html'), 'utf8');
  const src = html.match(/src="(\/_expo\/static\/js\/web\/[^"]+\.js)"/)?.[1];
  if (!src) throw new Error('No app bundle referenced by the exported index.html.');
  return createHash('sha256').update(readFileSync(join(dir, src))).digest('hex');
}

/**
 * The site: the export as it is, its shell moved to /app.html, the phone frame
 * at /, and /config.js naming the server. `config` is { SUPABASE_URL, SUPABASE_KEY }.
 */
export function assembleSite(config) {
  if (!existsSync(join(exportDir, 'index.html'))) throw new Error('Export missing — run the export first.');
  rmSync(siteDir, { recursive: true, force: true });
  cpSync(exportDir, siteDir, { recursive: true });
  renameSync(join(siteDir, 'index.html'), join(siteDir, 'app.html'));
  copyFileSync(join(root, 'scripts', 'demo-link', 'frame.html'), join(siteDir, 'index.html'));
  writeFileSync(join(siteDir, 'config.js'), configScript(config));
}

export function configScript({ SUPABASE_URL, SUPABASE_KEY }) {
  return `globalThis.__BRAZOS_CONFIG__ = ${JSON.stringify({ SUPABASE_URL, SUPABASE_KEY })};\n`;
}

/**
 * The deployed link may name STAGING and nothing else. Refs only are compared,
 * as scripts/supabase-ref.mjs requires; a secret-shaped key is refused, since
 * /config.js is a public file.
 */
export function assertStagingConfig({ SUPABASE_URL, SUPABASE_KEY }) {
  const ref = refFromRestUrl(SUPABASE_URL);
  if (!ref) throw new Error('The link config has no Supabase project URL.');
  if (ref === PRODUCTION_REF) throw new Error('Refused: the link config names the production project.');
  if (ref !== STAGING_REF) throw new Error(`Refused: the link config names project ${ref}, not staging.`);
  const kind = keyKind(SUPABASE_KEY);
  if (kind === 'unknown') throw new Error('Refused: the link key is not a publishable client key.');
  if (kind === 'legacy-jwt') {
    const keyRef = refFromJwt(SUPABASE_KEY);
    if (keyRef !== STAGING_REF) throw new Error('Refused: the link key belongs to a different project.');
    const role = JSON.parse(Buffer.from(String(SUPABASE_KEY).split('.')[1], 'base64').toString('utf8')).role;
    if (role !== 'anon') throw new Error('Refused: the link key is not the anon key.');
  }
}

/** The local stack's API URL and anon key, read from the CLI — the robot's server. */
export function localConfig() {
  const run = spawnSync('npx', ['supabase', 'status', '-o', 'json'], { cwd: root, encoding: 'utf8', shell: true });
  const text = run.stdout ?? '';
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(json.API_URL ?? '')) throw new Error('The local stack is not running (supabase start).');
  return { SUPABASE_URL: json.API_URL, SUPABASE_KEY: json.ANON_KEY };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serves the site on 127.0.0.1 the way the host does: files, then the frame. */
export function serve(dir = siteDir, port = 0) {
  const base = resolve(dir);
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = resolve(join(base, decodeURIComponent(url.pathname)));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(base, 'index.html');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

export function ensureWorkDir() {
  mkdirSync(workDir, { recursive: true });
}
