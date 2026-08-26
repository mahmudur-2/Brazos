#!/usr/bin/env node
// shot(1) — THE AGENT GETS EYES.
//
// One non-interactive command that renders REAL app surfaces at 393x852 CSS px,
// in dark and light, so a UI change can be LOOKED AT before it is committed
// instead of being described.
//
//   node scripts/shots.mjs              reuse the export if one is present
//   node scripts/shots.mjs --build      force a fresh web export first
//   node scripts/shots.mjs --only home  capture only targets whose name contains
//   node scripts/shots.mjs --list       print the registry and exit
//
// Output: .shots/*.png  (gitignored, never committed)
//
// -------------------------------------------------------------------------
// WHAT THIS IS, AND WHAT IT REPLACED.
//
// scripts/home-shots.mjs rendered four Home targets and nothing else. Every
// guarantee it made is kept here and is now ASSERTED rather than assumed (see
// assertGuarantees) — 393x852, deviceScaleFactor 1, reduced motion, animations
// disabled at capture, fonts settled, every non-local request answered locally,
// and no request allowed to escape to a real project. What is new is the
// TARGETS registry: a surface is reached by a declarative RECIPE of taps and
// types, so adding a screen is a data change, not a new script.
//
// home-shots.mjs is now a thin shim over this file. It is documented in
// CLAUDE.md and named by a dozen historical records, so the command keeps
// working and those records stay true.
//
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
// The web build does not read the env file: lib/supabase.web.ts takes its URL
// and key from `globalThis.__BRAZOS_CONFIG__`, which public/config.js leaves
// empty for hosting to fill in at runtime. This harness fills it in with a
// project that does not exist, so no real ref — staging or production — is
// spelled anywhere in this file, and every request that is not to this
// script's own server is intercepted and answered locally, so nothing leaves
// the machine at all. Both halves are asserted below rather than assumed.
//
// Reaching the authed tree means passing four gates, three of which read
// AsyncStorage — which on web IS window.localStorage. Setup completion, the
// mode cache and the Supabase session are seeded there directly. The session's
// key is derived from the URL above, so it is known rather than guessed. The
// fourth is the legal gate, which is answered over the network — see
// legalVersions().
// -------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shotsDir = join(root, '.shots');
const exportDir = join(shotsDir, 'web');

/**
 * A project that does not exist. supabase-js derives its session storage key
 * from this host's first label.
 *
 * THE ESCAPE ASSERTION IS AN ALLOW-LIST, NOT A BLOCK-LIST. The old script
 * carried the production ref as a literal so it could look for it. That put a
 * real ref in a file whose whole point is that it names none, and it could
 * only ever catch the one ref it spelled — staging would have sailed straight
 * through. What is asserted instead is that the ONLY host any request ever
 * addressed is this fake one. That is strictly stronger: it still throws if
 * the production project is ever addressed, and it also throws for staging,
 * for a CDN, and for anything else nobody thought to enumerate.
 */
const HARNESS_HOST = 'harness.supabase.co';
const HARNESS_URL = `https://${HARNESS_HOST}`;
const HARNESS_SESSION_KEY = 'sb-harness-auth-token';

/** A stable synthetic account id. Nothing is written anywhere it could escape. */
const USER_ID = '00000000-0000-4000-8000-000000000001';

// ===========================================================================
// THE FLOW'S INPUTS.
//
// Pinned so two runs of a Post-a-Job target type the same characters and
// produce the same pixels. These are the harness's OWN inputs — a person
// filling in a form — not marketplace data: no job, worker, rating or review
// is invented anywhere in this file, and every list the app asks for still
// comes back empty.
//
// DESCRIPTION reuses the title verbatim. lib/validation.ts sets a 20-character
// floor that gates Continue, so the step cannot be passed without one, and
// restating the title adds no fact that was not already pinned.
// ===========================================================================
const JOB_TITLE = 'Dog walking - twice this week';
const JOB_DESCRIPTION = JOB_TITLE;
/** The dog-walking category. lib/jobs.ts spells its own label 'Dog walking'. */
const JOB_CATEGORY_LABEL = 'Dog walking';
const JOB_AREA = 'East Flatbush, Brooklyn, NY';
const JOB_BUDGET = '75';

// ===========================================================================
// THE TARGET REGISTRY.
//
// TO ADD A TARGET: append an entry. Nothing else in this file changes.
//
//   name         the PNG basename under .shots/
//   mode         'customer' | 'worker' — which tree is seeded
//   colorScheme  'dark' | 'light'
//   recipe       optional ordered steps that navigate to the surface:
//                  { press: 'Accessible Name' }   press by accessibility label
//                  { pressText: 'Visible text' }  press by rendered text
//                  { fill: 'placeholder', text }  type into the field carrying
//                                                 that placeholder
//                  { expect: 'Visible text' }     wait for it, then continue
//   wait         the text that PROVES the surface arrived. Waited for after
//                the recipe and before the shutter, so a target that never
//                shows it fails loudly instead of photographing the wrong
//                screen.
//
// A target with no recipe is photographed exactly where the app lands, which
// is what the four Home targets do — and their capture path is the one
// home-shots.mjs used, which is what the byte-identity gate checks.
// ===========================================================================

/** Reaches step 1 (Media) of a fresh post from Customer Home. */
const TO_MEDIA = [
  { expect: 'Take a task' },
  { press: 'Create' },
  { pressText: 'Post a job' },
  { expect: 'What needs doing?' },
  { fill: 'e.g. Walk my dog on weekday mornings', text: JOB_TITLE },
  { fill: 'Describe what you need done…', text: JOB_DESCRIPTION },
  { pressText: JOB_CATEGORY_LABEL },
  { press: 'Continue to Media' },
];

/** …then step 2 (Location), with the area typed in. */
const TO_LOCATION = [
  ...TO_MEDIA,
  { expect: 'Show the task' },
  { press: 'Continue to Location' },
  { expect: 'Where and when?' },
  { fill: 'e.g. Sheepshead Bay, Brooklyn', text: JOB_AREA },
];

/** …then step 3 (Review), with the budget saved through the one editor. */
const TO_REVIEW = [
  ...TO_LOCATION,
  { press: 'Continue to Review' },
  { expect: 'Review and publish' },
  { press: 'Edit budget' },
  { expect: 'Edit Budget' },
  { fill: 'e.g. 60', text: JOB_BUDGET },
  { pressText: 'Save' },
];

/**
 * Reaches worker search from customer Home the way a customer reaches it: by
 * tapping a service chip.
 *
 * Dog walking is not one of the four pills HOME_SERVICE_ROWS draws (those are
 * the first four of HOME_QUICK_SERVICES), so Home's "Other" sheet is its only
 * tap path — and the sheet's rows call the SAME searchCategory() the visible
 * pills do, so this is the chip path rather than a detour around it.
 */
const TO_WORKER_SEARCH = [
  { expect: 'Take a task' },
  { press: 'Other services' },
  { expect: 'All services' },
  { press: 'Pet Sitting & Dog Walking' },
];

/**
 * Reaches the customer Profile tab root. The proof string is a Settings-card
 * row's sub-line rather than the word "Profile", because the bottom bar spells
 * "Profile" on every screen and could satisfy a wait without arriving.
 */
const TO_CUSTOMER_PROFILE = [
  { expect: 'Take a task' },
  { pressText: 'Profile' },
  { expect: 'Choose which events can alert you.' },
];

/**
 * …then the account & safety page behind the Settings card's "Account" chip.
 * "Log out" lives only on that page, never on the Profile root.
 */
const TO_ACCOUNT_SAFETY = [
  ...TO_CUSTOMER_PROFILE,
  { press: 'Account and safety' },
  { expect: 'Log out' },
];

const TARGETS = [
  { name: 'customer-home-dark', mode: 'customer', colorScheme: 'dark', wait: 'Take a task' },
  { name: 'customer-home-light', mode: 'customer', colorScheme: 'light', wait: 'Take a task' },
  { name: 'worker-home-dark', mode: 'worker', colorScheme: 'dark', wait: 'Get hired.' },
  { name: 'worker-home-light', mode: 'worker', colorScheme: 'light', wait: 'Get hired.' },

  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      name: `postjob-media-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: TO_MEDIA,
      wait: 'Show the task',
    },
    {
      name: `postjob-location-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: TO_LOCATION,
      wait: 'Where and when?',
    },
    {
      name: `postjob-review-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: TO_REVIEW,
      wait: 'Review and publish',
    },
    {
      // The editor reopened over the finished review step, so it is
      // photographed carrying the amount rather than empty.
      name: `postjob-budget-dialog-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_REVIEW, { expect: 'Review and publish' }, { press: 'Edit budget' }],
      wait: 'Edit Budget',
    },
    {
      name: `postjob-published-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_REVIEW, { expect: 'Review and publish' }, { pressText: 'Publish' }],
      wait: 'Your job is live.',
    },
  ]),

  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      // WHERE A CATEGORY CHIP LANDS. Reached by TAPPING, not by navigating to
      // the route: the question is what the destination shows about the
      // category it was handed, and a direct navigate would seed that param by
      // hand instead of proving the chip carries it.
      //
      // The harness invents no marketplace data, so an empty result is the
      // EXPECTED end state here and says nothing about what staging holds.
      // The wait is the SUBSTRING 'workers matched' because that title now
      // names the applied category — "No Dog Walking/Pet Care workers
      // matched" — and the unlabelled "No workers matched" is still what an
      // unfiltered search renders. It cannot appear until the search has run
      // to completion either way, so the shutter never catches the spinner.
      name: `workersearch-category-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: TO_WORKER_SEARCH,
      wait: 'workers matched',
    },
  ]),

  // =========================================================================
  // RUN SHOTS1 — customer-mode coverage. Every surface below is reached the
  // way a customer reaches it, from where the app lands, with the fixtures
  // the harness already seeds — so list-shaped screens photograph their
  // honest EMPTY state, named per entry. No marketplace data is invented.
  // =========================================================================
  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      // The browse tab root on a plain tab visit — no query, no category,
      // keyboard down. Photographs the IDLE state ("Describe what you need"):
      // an empty query never runs a search, so the no-matches card is not
      // this surface's resting state and its prompt card is.
      name: `customer-discover-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [{ expect: 'Take a task' }, { pressText: 'Discover' }],
      wait: 'Describe what you need',
    },
    {
      // The [ + ] creation sheet, open over customer Home.
      name: `customer-create-sheet-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [{ expect: 'Take a task' }, { press: 'Create' }],
      wait: 'What do you need?',
    },
    {
      // Home's "Other" services sheet, open over customer Home.
      name: `customer-services-sheet-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [{ expect: 'Take a task' }, { press: 'Other services' }],
      wait: 'All services',
    },
    {
      // The messages tab root. EMPTY state: no conversation fixtures exist.
      name: `customer-inbox-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [{ expect: 'Take a task' }, { pressText: 'Inbox' }],
      wait: 'No messages yet',
    },
    {
      // The customer's job hub, by its standing customer path: the [ + ]
      // sheet's "My jobs" action (the hub has no customer bar item). EMPTY
      // state: no job fixtures exist.
      name: `customer-myjobs-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [
        { expect: 'Take a task' },
        { press: 'Create' },
        { pressText: 'My jobs' },
      ],
      wait: 'Nothing here yet',
    },
    {
      // The Profile tab root. EMPTY-leaning state: a name, no reviews, no
      // portfolio.
      name: `customer-profile-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [{ expect: 'Take a task' }, { pressText: 'Profile' }],
      wait: 'Choose which events can alert you.',
    },
    {
      // Profile → the details page. "No bio yet" is that page's own honest
      // empty value for the seeded profile, which carries a name and nothing
      // else.
      name: `customer-profile-details-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_CUSTOMER_PROFILE, { press: 'Profile details' }],
      wait: 'No bio yet',
    },
    {
      // Profile → the account & safety page ("Account" chip on the Settings
      // card).
      name: `customer-account-safety-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_CUSTOMER_PROFILE, { press: 'Account and safety' }],
      wait: 'Log out',
    },
    {
      // Profile → notification preferences. The wait is a preference row's
      // own label, absent from the Profile root.
      name: `customer-notification-settings-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_CUSTOMER_PROFILE, { press: 'Notifications' }],
      wait: 'Bids on my jobs',
    },
    {
      // Profile → the notification feed. EMPTY state: nothing has happened
      // to the seeded account.
      name: `customer-notification-feed-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_CUSTOMER_PROFILE, { press: 'Notification feed' }],
      wait: 'Nothing yet',
    },
    {
      // Profile → earnings. The wait is the header's own sandbox subtitle;
      // the ledger below it photographs EMPTY.
      name: `customer-earnings-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_CUSTOMER_PROFILE, { press: 'Earnings' }],
      wait: 'Sandbox — no real money',
    },
    {
      // Profile → services & availability. EMPTY state: no services are
      // seeded, so the add-service form is the surface.
      name: `customer-services-pricing-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_CUSTOMER_PROFILE, { press: 'Services & availability' }],
      wait: 'Add service',
    },
    {
      // Profile → saved & past workers. EMPTY state: no people fixtures.
      name: `customer-saved-workers-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_CUSTOMER_PROFILE, { press: 'Saved & past workers' }],
      wait: 'No one here yet',
    },
    {
      // Account & safety → appearance. The wait is the page's own eyebrow.
      name: `customer-appearance-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_ACCOUNT_SAFETY, { press: 'Appearance' }],
      wait: 'THEME',
    },
    {
      // Account & safety → payment methods, told honestly by the build.
      name: `customer-payment-methods-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_ACCOUNT_SAFETY, { press: 'Payment methods' }],
      wait: 'Honest by design.',
    },
    {
      // Account & safety → the Terms document. The privacy document renders
      // through the same template, so terms stands for both.
      name: `customer-legal-terms-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_ACCOUNT_SAFETY, { press: 'Terms of Service' }],
      wait: 'Last updated',
    },
    {
      // Account & safety → delete account. Photographed at the explanation,
      // before any confirmation.
      name: `customer-delete-account-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: [...TO_ACCOUNT_SAFETY, { press: 'Delete account' }],
      wait: 'What is removed',
    },
  ]),

  // =========================================================================
  // RUN SHOTS1 — worker-mode coverage. Only surfaces whose render is not
  // already photographed above earn a frame: the shared settings pages are
  // the same screens in both modes and are covered once, in customer mode.
  // The map tab is deliberately absent — its web implementation addresses
  // external tile hosts, which the escape assertion (rightly) fails.
  // =========================================================================
  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      // Worker Home's "Other" services sheet, open over worker Home.
      name: `worker-services-sheet-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      recipe: [{ expect: 'Get hired.' }, { press: 'Other services' }],
      wait: 'All services',
    },
    {
      // The open-jobs list, by worker Home's own "view all" path. EMPTY
      // state: no job fixtures exist. Neither the header title nor any part
      // of the empty-state copy can be the wait — worker Home spells both,
      // hidden but first in DOM once this screen is pushed over it, and the
      // non-exact text match is case-insensitive — so the wait is a distance
      // chip, which only this screen draws.
      name: `worker-results-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      recipe: [{ expect: 'Get hired.' }, { press: 'View all open jobs' }],
      wait: '10 mi',
    },
    {
      // The worker's job-hub tab root. EMPTY state, worker wording.
      name: `worker-myjobs-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      recipe: [{ expect: 'Get hired.' }, { pressText: 'My Jobs' }],
      wait: 'Nothing here yet',
    },
    {
      // The worker's messages tab root. EMPTY state.
      name: `worker-inbox-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      recipe: [{ expect: 'Get hired.' }, { pressText: 'Inbox' }],
      wait: 'No messages yet',
    },
    {
      // The worker's Profile tab root — the same shared screen, but worker
      // mode adds the profile-completeness prompt, so it earns its own frame.
      name: `worker-profile-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      recipe: [{ expect: 'Get hired.' }, { pressText: 'Profile' }],
      wait: 'Choose which events can alert you.',
    },
  ]),
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

/**
 * The current legal versions, read from the app's own source at run time.
 *
 * WHY THIS EXISTS. The legal gate FAILS CLOSED (F-013, hooks/useLegalGate.ts):
 * an unanswered acceptance read parks the app on "The Terms of Service check
 * didn't load" and nothing behind it can be photographed. home-shots.mjs
 * predates that decision and deliberately answered the read with a 503 to ride
 * a fail-open path that no longer exists, which is why it renders an error
 * screen at HEAD.
 *
 * Reading TERMS_VERSION and PRIVACY_VERSION out of lib/legal/index.ts rather
 * than restating them here is what keeps that from recurring: bumping either
 * document cannot silently blind this harness, and a rename fails loudly on the
 * next run instead of quietly answering with a stale version.
 */
function legalVersions() {
  const source = readFileSync(join(root, 'lib', 'legal', 'index.ts'), 'utf8');
  const pick = (name) => {
    const found = source.match(new RegExp(`export const ${name} = '([^']+)'`));
    if (!found) throw new Error(`could not read ${name} from lib/legal/index.ts`);
    return found[1];
  };
  return { terms: pick('TERMS_VERSION'), privacy: pick('PRIVACY_VERSION') };
}

/** Everything the app asks the network for, answered locally. */
function stubResponse(pathname, headers, postData) {
  const single = String(headers.accept ?? '').includes('vnd.pgrst.object');

  // The legal gate, answered by PASSING it with the versions the app itself
  // considers current — see legalVersions() for why they are read, not
  // restated.
  if (pathname.includes('/rest/v1/legal_acceptances')) {
    const version = legalVersions();
    return {
      status: 200,
      body: [
        { document: 'terms', version: version.terms },
        { document: 'privacy', version: version.privacy },
      ],
    };
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

  // The publish step's ECHO. create_job() is an RPC whose returned row becomes
  // the success screen's "PUBLISHED" card, so an empty answer photographs a
  // card with no title, no category and no area. This hands back the row the
  // call just asked to insert — exactly what INSERT … RETURNING would — so the
  // card shows what the harness typed and not one invented fact. The id and the
  // timestamp are fixed rather than generated: a clock in here would make two
  // runs differ.
  if (pathname.endsWith('/rest/v1/rpc/create_job')) {
    let sent = {};
    try {
      sent = JSON.parse(postData ?? '{}');
    } catch {
      sent = {};
    }
    const row = {
      id: '00000000-0000-4000-8000-00000000000b',
      client_id: USER_ID,
      title: sent.p_title ?? null,
      description: sent.p_description ?? null,
      category: sent.p_category ?? null,
      location: sent.p_location ?? null,
      // The server mirrors the range's ceiling into the legacy single column.
      budget_cents: sent.p_budget_max_cents ?? sent.p_budget_cents ?? null,
      budget_min_cents: sent.p_budget_min_cents ?? null,
      budget_max_cents: sent.p_budget_max_cents ?? null,
      status: 'open',
      created_at: '2026-01-01T00:00:00.000Z',
      scheduled_date: sent.p_scheduled_date ?? null,
      arrival_start_hour: sent.p_arrival_start_hour ?? null,
      arrival_end_hour: sent.p_arrival_end_hour ?? null,
      address_line: sent.p_address_line ?? null,
      photos: sent.p_photos ?? [],
      videos: sent.p_videos ?? [],
    };
    return { status: 200, body: single ? row : [row] };
  }

  // Everything else — jobs, bids, counts — comes back EMPTY. Every screen
  // draws its honest empty state; no marketplace data is invented to fill a
  // screenshot.
  return { status: 200, body: single ? {} : [] };
}

/** One recipe step. Every locator is scoped to the first match, as a tap is. */
async function runStep(page, step) {
  const timeout = 20_000;
  if (step.expect) {
    await page.getByText(step.expect, { exact: false }).first().waitFor({ timeout });
    return;
  }
  if (step.press) {
    await page.getByLabel(step.press, { exact: true }).first().click({ timeout });
    return;
  }
  if (step.pressText) {
    await page.getByText(step.pressText, { exact: true }).first().click({ timeout });
    return;
  }
  if (step.fill) {
    await page.getByPlaceholder(step.fill, { exact: true }).first().fill(step.text, { timeout });
    return;
  }
  throw new Error(`unrecognised recipe step: ${JSON.stringify(step)}`);
}

/**
 * The guarantees, checked on the live page instead of trusted to the context
 * options that were meant to produce them. Runs AFTER the shutter, so nothing
 * here can perturb what was photographed.
 */
async function assertGuarantees(page, name) {
  const seen = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    ratio: window.devicePixelRatio,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    fonts: document.fonts ? document.fonts.status : 'unsupported',
  }));
  const wrong = [];
  if (seen.width !== 393 || seen.height !== 852) {
    wrong.push(`viewport ${seen.width}x${seen.height}, expected 393x852`);
  }
  if (seen.ratio !== 1) wrong.push(`deviceScaleFactor ${seen.ratio}, expected 1`);
  if (!seen.reduced) wrong.push('reduced motion is not in effect');
  if (seen.fonts !== 'loaded') wrong.push(`fonts ${seen.fonts}, expected loaded`);
  if (wrong.length) throw new Error(`${name}: ${wrong.join('; ')}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const selected = only ? TARGETS.filter((target) => target.name.includes(only)) : TARGETS;

  if (argv.includes('--list')) {
    for (const target of TARGETS) console.log(target.name);
    return;
  }
  if (!selected.length) throw new Error(`--only ${only} matched no target`);

  mkdirSync(shotsDir, { recursive: true });
  if (argv.includes('--build') || !existsSync(join(exportDir, 'index.html'))) {
    buildExport();
  }

  const { chromium } = await import('playwright');
  const server = await serve(exportDir);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  /** Every host addressed that was not this script's own server. */
  const escaped = new Set();

  try {
    for (const shot of selected) {
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
        let pathname = url;
        try {
          const parsed = new URL(url);
          pathname = parsed.pathname;
          if (parsed.hostname !== HARNESS_HOST) escaped.add(parsed.hostname);
        } catch {
          escaped.add(url);
        }
        const stub = stubResponse(
          pathname,
          route.request().headers(),
          route.request().postData(),
        );
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
      if (shot.recipe) {
        for (const step of shot.recipe) await runStep(page, step);
      }
      await page.getByText(shot.wait, { exact: false }).first().waitFor({ timeout: 45_000 });
      // The launch layer crossfades over the tree; wait it out, then let fonts
      // and the last layout settle so two runs agree.
      await page.waitForTimeout(2_500);
      await page.evaluate(async () => {
        await document.fonts?.ready;
      });

      const file = join(shotsDir, `${shot.name}.png`);
      await page.screenshot({ path: file, animations: 'disabled' });
      await assertGuarantees(page, shot.name);
      console.log(
        `[shots] ${shot.name} -> ${file}${failures.length ? ` (${failures.length} page errors)` : ''}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  if (escaped.size) {
    throw new Error(`a request addressed a host outside the harness: ${[...escaped].join(', ')}`);
  }
}

main().catch((error) => {
  console.error('[shots] FAILED:', error?.message ?? error);
  process.exit(1);
});
