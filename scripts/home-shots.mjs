#!/usr/bin/env node
// shot(0) — THE AGENT GETS EYES.
//
// One non-interactive command that produces PNGs of Customer Home and Worker
// Home at 393x852 CSS px, in dark and light, so a Home change can be compared
// against docs/mockups/44_customer_home_dark.png without a device.
//
//   node scripts/home-shots.mjs            reuse the export if one is present
//   node scripts/home-shots.mjs --build    force a fresh web export first
//
// Output: .shots/*.png  (gitignored, never committed)
//
// -------------------------------------------------------------------------
// WHY A STATIC EXPORT AND NOT THE DEV SERVER + HomeDesignStudio.
//
// dev-tools/HomeDesignStudio.tsx renders the real Home in a 393x852 viewport,
// and it was the first thing tried. It cannot be used here: App.tsx gates it
// on `__DEV__ && Platform.OS === 'web' && ?studio=home`, and `expo export` is
// a PRODUCTION bundle, so `__DEV__` is false and the studio never mounts. The
// alternatives were a long-lived `expo start --web` dev server (a second
// process to babysit, and hot-reload frames to race) or setting the browser
// viewport to the same 393x852 the studio's phone shell provides. The viewport
// is the smaller surface — it touches nothing under screens/, dev-tools/ or
// lib/, and it is the same number — so that is what this does. No second
// preview surface is built: this drives the real navigation tree.
//
// WHY NO CREDENTIALS ARE INVOLVED.
//
// The web build does not read `.env`: lib/supabase.web.ts takes its URL and key
// from `globalThis.__BRAZOS_CONFIG__`, which public/config.js leaves empty for
// hosting to fill in at runtime. This harness fills it in with a project that
// does not exist, so the real staging and production refs are never even
// spelled — and every request that is not to this script's own server is
// intercepted and answered locally, so nothing leaves the machine at all. Both
// halves are asserted below rather than assumed.
//
// Reaching Home then means passing three gates, all three of which read
// AsyncStorage — which on web IS window.localStorage. Setup completion, the
// mode cache and the Supabase session are seeded there directly. The session's
// key is derived from the URL above, so it is known rather than guessed.
//
// The only fixture with a value in it is the profile name, which exists so the
// greeting sets on two lines exactly as master 44 does. Jobs come back EMPTY:
// this harness never invents marketplace data, and Home's honest empty state is
// what it draws.
// -------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shotsDir = join(root, '.shots');
const exportDir = join(shotsDir, 'web');

/** The production project. It must never be contacted; see CLAUDE.md. */
const FORBIDDEN_REF = 'avkighsiufeefyycbebf';

/**
 * A project that does not exist, so no real ref is named anywhere in this file
 * and no request could reach one even if the interception below were removed.
 * supabase-js derives its session storage key from this host's first label.
 */
const HARNESS_URL = 'https://harness.supabase.co';
const HARNESS_SESSION_KEY = 'sb-harness-auth-token';

/** A stable synthetic account id. Nothing is written anywhere it could escape. */
const USER_ID = '00000000-0000-4000-8000-000000000001';

const SHOTS = [
  { name: 'customer-home-dark', mode: 'customer', colorScheme: 'dark', wait: 'Take a task' },
  { name: 'customer-home-light', mode: 'customer', colorScheme: 'light', wait: 'Take a task' },
  { name: 'worker-home-dark', mode: 'worker', colorScheme: 'dark', wait: 'Get hired.' },
  { name: 'worker-home-light', mode: 'worker', colorScheme: 'light', wait: 'Get hired.' },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function buildExport() {
  console.log('[shots] exporting the web bundle (this takes a couple of minutes)…');
  // The local CLI entry point, run on this Node — not `npx expo`, which on
  // Windows is a .cmd shim that spawnSync cannot start without a shell and
  // which reports `status: null` with no output when it fails to.
  const cli = join(root, 'node_modules', 'expo', 'bin', 'cli');
  if (!existsSync(cli)) throw new Error(`expo CLI not found at ${cli}; run npm install`);
  const run = spawnSync(
    process.execPath,
    [cli, 'export', '--platform', 'web', '--output-dir', exportDir, '--clear'],
    { cwd: root, stdio: 'inherit' },
  );
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`expo export failed with status ${run.status}`);
}

function serve(dir) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    // Expo Router-less SPA: anything that is not a real file is index.html.
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

/**
 * Runs before any of the app's own code — including public/config.js, which
 * only fills `__BRAZOS_CONFIG__` in when it is still unset. Supplies the web
 * build's runtime configuration and seeds the three AsyncStorage-backed gates.
 */
function seedPage({ mode, url, sessionKey, userId }) {
  globalThis.__BRAZOS_CONFIG__ = { SUPABASE_URL: url, SUPABASE_KEY: 'harness-anon-key' };

  const now = Math.floor(Date.now() / 1000);
  window.localStorage.setItem(
    sessionKey,
    JSON.stringify({
      access_token: 'harness',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      refresh_token: 'harness',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'harness@localhost',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date(0).toISOString(),
      },
    }),
  );
  window.localStorage.setItem(
    `brazos.setup.v1.${userId}`,
    JSON.stringify({ completed: true, landing: mode === 'worker' ? 'work' : 'hire' }),
  );
  window.localStorage.setItem(`brazos.mode.v1.${userId}`, mode);
}

/** Everything the app asks the network for, answered locally. */
function stubResponse(pathname, headers) {
  const single = String(headers.accept ?? '').includes('vnd.pgrst.object');

  // The legal gate is answered by FAILING it, deliberately. fetchLegalStatus()
  // returns 'unknown' when the read errors and useLegalGate() lets 'unknown'
  // through — the app's own documented fail-open path. Answering with rows
  // instead would mean restating TERMS_VERSION and PRIVACY_VERSION here, and
  // this harness would then need editing every time either document is bumped.
  if (pathname.includes('/rest/v1/legal_acceptances')) {
    return { status: 503, body: { message: 'harness: legal check not answered' } };
  }

  // The greeting sets on two lines in master 44 only when a name resolves, so
  // the profile is the one fixture that carries a value. It is the operator's
  // own name, it lives only in this file, and nothing writes it anywhere.
  // fetchMyProfile() tries the get_my_profile RPC before the table, so both
  // shapes have to answer or the name never arrives.
  if (
    pathname.includes('/rest/v1/profiles') ||
    pathname.endsWith('/rest/v1/rpc/get_my_profile')
  ) {
    const profile = {
      id: USER_ID,
      full_name: 'Mahmudur Rahman',
      active_mode: null,
      accepting_work: false,
    };
    return { status: 200, body: single ? profile : [profile] };
  }

  // Everything else — jobs, bids, counts — comes back EMPTY. Home draws its
  // honest empty state; no marketplace data is invented to fill a screenshot.
  return { status: 200, body: single ? {} : [] };
}

async function main() {
  mkdirSync(shotsDir, { recursive: true });
  if (process.argv.includes('--build') || !existsSync(join(exportDir, 'index.html'))) {
    buildExport();
  }

  const { chromium } = await import('playwright');
  const server = await serve(exportDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const escaped = [];

  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 1,
        colorScheme: shot.colorScheme,
        // The Live Nearby halo is an infinite Animated loop; reduced motion is
        // the app's own switch for it, and it is what makes two consecutive
        // runs produce the same pixels.
        reducedMotion: 'reduce',
      });

      await context.route('**/*', async (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) {
          return route.continue();
        }
        if (url.includes(FORBIDDEN_REF)) escaped.push(url);
        const pathname = (() => {
          try {
            return new URL(url).pathname;
          } catch {
            return url;
          }
        })();
        const stub = stubResponse(pathname, route.request().headers());
        return route.fulfill({
          status: stub.status,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify(stub.body),
        });
      });

      await context.addInitScript(seedPage, {
        mode: shot.mode,
        url: HARNESS_URL,
        sessionKey: HARNESS_SESSION_KEY,
        userId: USER_ID,
      });

      const page = await context.newPage();
      const failures = [];
      page.on('pageerror', (error) => failures.push(String(error)));
      await page.goto(origin, { waitUntil: 'load' });
      await page.getByText(shot.wait, { exact: false }).first().waitFor({ timeout: 45_000 });
      // The launch layer crossfades over the tree; wait it out, then let fonts
      // and the last layout settle so two runs agree.
      await page.waitForTimeout(2_500);
      await page.evaluate(async () => {
        await document.fonts?.ready;
      });

      const file = join(shotsDir, `${shot.name}.png`);
      await page.screenshot({ path: file, animations: 'disabled' });
      console.log(`[shots] ${shot.name} -> ${file}${failures.length ? ` (${failures.length} page errors)` : ''}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (escaped.length) {
    throw new Error(`a request addressed the production project: ${escaped[0]}`);
  }
}

main().catch((error) => {
  console.error('[shots] FAILED:', error?.message ?? error);
  process.exit(1);
});
