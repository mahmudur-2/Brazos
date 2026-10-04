/**
 * THE TEST ROBOT — the demo link's gate. Walks the whole loop in the browser
 * copy, two people side by side (a customer and a worker, each in a browser of
 * their own, as two phones would be): post → bid → accept → practice-money
 * hold → start → complete → approve & release → both reviews. Every step is
 * waited on by the words the screen shows; any uncaught page error fails it.
 *
 * Runs against the LOCAL stack only (127.0.0.1, the seed's own accounts) —
 * never staging: a run never contacts a remote project (CLAUDE.md §Supabase),
 * and any request to a *.supabase.co host is aborted and fails the walk.
 *
 * A green walk writes .shots/demo-link/robot-pass.json, tied to the bundle's
 * hash; deploy.mjs refuses any bundle without one.
 *
 *   node scripts/demo-link/robot.mjs [--headed] [--keep]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleSite, bundleHash, localConfig, root, serve, siteDir, stampFile, workDir } from './lib.mjs';

const shotsDir = join(workDir, 'robot');
const headed = process.argv.includes('--headed');

/** The seed's identities (supabase/seed.sql), local stack only. */
const seed = readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8');
const PASSWORD = seed.match(/password for all three: (\S+?)\)?:?\s*$/m)?.[1];
const CUSTOMER = 'phase6.customer@brazos.test';
const WORKER = 'phase6.worker@brazos.test';
if (!PASSWORD) throw new Error('Seed password not found in supabase/seed.sql.');

const TITLE = `Demo walk ${Date.now()}`;
const STEP_MS = 30_000;

const log = (msg) => console.log(`[robot] ${msg}`);
const errors = [];
const offHost = new Set();
/** Storage writes the walk made — the finished-work photo is proven stored, not just picked. */
const uploads = [];

rmSync(shotsDir, { recursive: true, force: true });
mkdirSync(shotsDir, { recursive: true });

assembleSite(localConfig());
const server = await serve(siteDir);
const origin = `http://127.0.0.1:${server.address().port}`;

const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless: !headed });

async function person(name) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 1000 },
    geolocation: { latitude: 40.584, longitude: -73.9539 },
    permissions: ['geolocation'],
    colorScheme: name === 'worker' ? 'light' : 'dark',
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (/\.supabase\.(co|in)$/i.test(url.hostname)) {
      errors.push(`${name}: a request reached a remote Supabase host (${url.hostname})`);
      return route.abort();
    }
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') offHost.add(url.hostname);
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${name}: page error — ${error.message}`));
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/storage/v1/object/') && res.request().method() === 'POST') {
      uploads.push({ who: name, status: res.status(), path: new URL(url).pathname });
    }
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[robot] ${name} console: ${msg.text().slice(0, 240)}`);
  });
  await page.goto(`${origin}/`);
  const app = page.frameLocator('#app');
  return { name, page, app };
}

let shot = 0;
async function snap(who, label) {
  shot += 1;
  await who.page.screenshot({ path: join(shotsDir, `${String(shot).padStart(2, '0')}-${who.name}-${label}.png`) });
}

async function step(who, label, fn) {
  log(`${who.name}: ${label}`);
  try {
    await fn(who.app);
  } catch (error) {
    await snap(who, `FAILED-${label.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
    const text = await who.page
      .frame({ url: /app\.html/ })
      ?.evaluate(() => document.body.innerText)
      .catch(() => '');
    throw new Error(`${who.name} — ${label}: ${error.message.split('\n').slice(0, 12).join('\n  ')}\n--- screen text ---\n${(text ?? '').slice(0, 1500)}`);
  }
}

/**
 * What a person would call "the thing that says X": its words, its spoken
 * label, or its placeholder — as Maestro's tapOn reads them. A string matches
 * whole (so "Finish setup" is the button, not the "Finish Setup" header); a
 * regex matches anywhere.
 */
const things = (app, text) => {
  const opts = typeof text === 'string' ? { exact: true } : {};
  return app
    .getByText(text, opts)
    .or(app.getByLabel(text, opts))
    .or(app.getByPlaceholder(text, opts))
    .filter({ visible: true });
};
const see = (app, text, timeout = STEP_MS) => things(app, text).first().waitFor({ state: 'visible', timeout });

/**
 * Whether a finger on this element's centre would land on it: enabled, and
 * not covered — a dialog's "Send bid" over the screen's own disabled one,
 * a sheet over the list behind it.
 */
const reachable = (el) => {
  // Disabled is the CONTROL's own state — the nearest button, or the element
  // itself. A disabled ancestor further up is not: React Native Web marks a
  // dialog card aria-disabled so a tap on the card cannot close it, and the
  // card's own buttons still take a real click (Playwright alone counts the
  // ancestor, so the click below is forced once this check has passed).
  const control = el.closest('[role="button"], button, input, textarea') ?? el;
  if (control.getAttribute('aria-disabled') === 'true' || control.hasAttribute('disabled')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
};

/** The first match a person could actually tap, scrolled into view. */
async function reach(app, text, timeout) {
  const all = things(app, text);
  const deadline = Date.now() + timeout;
  for (;;) {
    const n = await all.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = all.nth(i);
      await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
      if (await el.evaluate(reachable).catch(() => false)) return el;
    }
    if (Date.now() > deadline) {
      const why = [];
      for (let i = 0; i < n; i++) {
        why.push(
          await all
            .nth(i)
            .evaluate((el) => {
              const r = el.getBoundingClientRect();
              const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              const name = (e) => (e ? `${e.tagName}[${e.getAttribute('aria-label') ?? ''}|${(e.textContent ?? '').slice(0, 30)}]` : 'none');
              return `${name(el)} at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} hit ${name(hit)} disabled-by=${(() => { const d = el.closest('[aria-disabled="true"], [disabled]'); return d ? d.tagName + '[' + (d.getAttribute('aria-label') ?? '') + '|' + (d.textContent ?? '').slice(0, 40) + '] depth ' + (() => { let k = 0, e = el; while (e && e !== d) { e = e.parentElement; k++; } return k; })() : 'none'; })()}`;
            })
            .catch((e) => e.message)
        );
      }
      throw new Error(`nothing tappable says ${text} (${n} found, none reachable)\n  ${why.join('\n  ')}`);
    }
    await new Promise((ok) => setTimeout(ok, 250));
  }
}
const tap = async (app, text, timeout = STEP_MS) => (await reach(app, text, timeout)).click({ force: true });
const field = (app, placeholder) => app.getByPlaceholder(placeholder).first();
/** Optional prompts ("Not now", "OK") that may or may not appear. */
async function dismiss(app, texts, ms = 2500) {
  for (const text of texts) {
    const target = await reach(app, text, ms).catch(() => null);
    if (target) await target.click({ force: true }).catch(() => {});
  }
}

/** The legal gate: both documents read to the end by scrolling, as a reader would. */
async function readTerms(who) {
  const { app, page } = who;
  await tap(app, 'Terms & Privacy');
  await see(app, 'BEFORE YOU START');
  const box = await page.locator('#app').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55);
  const agree = app.getByRole('checkbox').first();
  for (let i = 0; i < 400; i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(60);
    if (i % 10 === 9 && (await agree.isEnabled().catch(() => false))) break;
  }
  await agree.click();
  await tap(app, 'Agree and continue');
  await see(app, 'Terms and Privacy reviewed', 60_000);
}

async function signIn(who, email, startIn, homeMark) {
  await step(who, 'sign in', async (app) => {
    await tap(app, 'I already have an account', 60_000);
    await field(app, 'Email').waitFor({ timeout: STEP_MS }).catch(() => {});
    const email$ = app.locator('input[type="email"], input[autocomplete="email"], input[placeholder*="mail" i]').first();
    await email$.fill(email);
    await app.locator('input[type="password"]').first().fill(PASSWORD);
    await tap(app, /^Continue$/);
    await see(app, /Set up your experience|Post a job|Search for jobs or areas/, 60_000);
    if (await app.getByText('Set up your experience').first().isVisible().catch(() => false)) {
      if (await app.getByText('Review both documents to continue').first().isVisible().catch(() => false)) {
        await readTerms(who);
      }
      await tap(app, new RegExp(startIn));
      await tap(app, 'Finish setup');
    }
    await see(app, homeMark, 60_000);
    await dismiss(app, ['Not now']);
  });
  await snap(who, 'home');
}

let failure = null;
try {
  const customer = await person('customer');
  const worker = await person('worker');

  await signIn(customer, CUSTOMER, 'Hire help', 'Post a job');
  await signIn(worker, WORKER, 'Find work', 'Search for jobs or areas');

  // ---- Customer posts the job -------------------------------------------
  await step(customer, 'post a job', async (app) => {
    await tap(app, 'Post a job');
    await field(app, 'e.g. Walk my dog on weekdays').fill(TITLE);
    await field(app, 'Describe what you need done…').fill('Cleaning of a two bedroom apartment, for the demo link walk.');
    await tap(app, 'Cleaning');
    await tap(app, 'Continue to Media');
    await tap(app, 'Continue to Location');
    await field(app, 'e.g. Sheepshead Bay').fill('Sheepshead Bay, Brooklyn');
    await tap(app, 'Use my current location');
    await dismiss(app, ['OK']);
    await field(app, 'e.g. 2410 Emmons Ave, Apt 3B').fill('2017 Emmons Ave, Brooklyn, NY 11235');
    await tap(app, /^Today$/);
    await tap(app, /^Morning/);
    await tap(app, 'Continue to Review');
    await tap(app, 'Edit budget');
    await tap(app, 'Enter your own amount');
    await field(app, 'Maximum budget in dollars').fill('50').catch(async () => {
      await app.getByLabel('Maximum budget in dollars').first().fill('50');
    });
    await tap(app, /^Done$/);
    await tap(app, /^Publish$/);
    await dismiss(app, ['Not now'], 5000);
    await see(app, /Your job is live\./, 60_000);
  });
  await snap(customer, 'posted');
  await step(customer, 'back home', (app) => tap(app, 'Back to Home'));

  // ---- Worker finds it and bids -----------------------------------------
  await step(worker, 'find the job and bid', async (app) => {
    const search = app.getByPlaceholder(/Search for jobs or areas/).first();
    if (await search.isVisible().catch(() => false)) await search.click();
    else await tap(app, 'Search for jobs or areas');
    await app.getByPlaceholder(/Search/).first().fill(TITLE);
    await app.getByPlaceholder(/Search/).first().press('Enter');
    await tap(app, TITLE, 60_000);
    await tap(app, /I.ll do it for \$50/);
    await tap(app, 'Send bid');
    await dismiss(app, ['OK', 'Not now'], 5000);
    await see(app, 'Bid Sent', 60_000);
  });
  await snap(worker, 'bid');

  // ---- Customer accepts and holds practice money ------------------------
  await step(customer, 'accept the bid', async (app) => {
    await tap(app, 'Create');
    await tap(app, 'My jobs');
    await tap(app, TITLE, 60_000);
    await see(app, /^Job & Bids$/i);
    await tap(app, /^Accept (bid|offer)/, 60_000);
    // Hiring keeps its confirm (SCOPE.md): the price, the fee and the total, said before the tap.
    await see(app, /^Accept this bid for \$50\?$/);
    await see(app, /Total charged \$53\.75/);
    await tap(app, /^Accept & pay \$53\.75$/);
    await see(app, /^Protected Checkout$/i, 60_000);
    // Practice money says so, in words, before anything is pressed.
    await see(app, /TEST MODE — no real money moves\./, 30_000);
  });
  await snap(customer, 'checkout');
  await step(customer, 'hold the practice money', async (app) => {
    await tap(app, /^Pay & protect .*\(test\)$/, 60_000);
    await see(app, /for this job\?$/);
    await tap(app, /^Pay & protect$/);
    await see(app, /^Job Confirmed$/i, 60_000);
    await see(app, /^Held in protection/);
    await see(app, /^Test mode — no real money moved\.$/);
  });
  await snap(customer, 'held');

  // ---- Worker does the work ---------------------------------------------
  await step(worker, 'start and complete', async (app) => {
    // No push reaches a browser, and a push is what tells the phone app that
    // someone else changed a job (lib/queryClient.ts invalidateAfterPush). The
    // copy relies on the cache's freshness window instead (HUB_STALE_MS, 20 s):
    // a focus after it re-reads. Wait it out, as a viewer would see it.
    await worker.page.waitForTimeout(21_000);
    await tap(app, 'My Jobs');
    await see(app, /^YOU.RE WORKING/i);
    await snap(worker, 'my-jobs');
    await tap(app, TITLE, 60_000);
    // The stage taps the customer sees: on the way → here → working.
    await tap(app, /^I.m on my way$/, 60_000);
    await tap(app, /^I.m here$/, 60_000);
    await tap(app, 'Start job', 60_000);
    await snap(worker, 'working');
    // A photo of the finished work is required to complete (transition_job_status).
    const chooser = worker.page.waitForEvent('filechooser', { timeout: 60_000 });
    await tap(app, /^Add photos or video/, 60_000);
    await (await chooser).setFiles(join(root, 'assets', 'icon.png'));
    await see(app, /^Mark complete$/, 60_000);
    await worker.page.waitForTimeout(3000); // the upload settles before the tap
    await tap(app, /^Mark complete$/);
    await dismiss(app, ['OK'], 3000);
    await see(app, /approve|Waiting for|completed/i, 60_000);
  });
  await snap(worker, 'completed');

  // ---- Customer approves and releases -----------------------------------
  await step(customer, 'approve and release', async (app) => {
    // The worker's "done" reaches this browser by the freshness window, not a push.
    await customer.page.waitForTimeout(21_000);
    await tap(app, 'View job');
    await tap(app, /^Review & approve/, 60_000);
    await see(app, /^Finished Work$/i);
    await tap(app, /^Approve & release payment$/, 60_000);
    // Money keeps its confirm (SCOPE.md).
    await see(app, /^Release the payment to the worker\?$/);
    await tap(app, /^Approve & release$/);
    await see(app, /^Review & Tip$/i, 60_000);
    // Released, and said so: never "paid" before the release (CLAUDE.md).
    await see(app, /^Released on your approval\. Test mode — no real money moved\.$/);
  });
  await snap(customer, 'released');
  await step(customer, 'review the worker', async (app) => {
    await tap(app, '5 stars');
    await tap(app, 'Yes').catch(() => {});
    await tap(app, /^Submit review$/);
    await see(app, /has been rated\.$/, 60_000);
  });
  await snap(customer, 'reviewed');

  // ---- The worker is paid, and reviews the customer ---------------------
  await step(worker, 'see the release and review', async (app) => {
    // The release reaches this browser by the freshness window, not a push.
    await worker.page.waitForTimeout(21_000);
    await tap(app, 'Home');
    await tap(app, 'My Jobs');
    await see(app, /^You received$/, 60_000);
    await see(app, /approved the finished work and the funds were released\. Test mode — no real money\.$/);
    await see(app, /^How was working with /);
    // The finished-work photo: uploaded (the storage write answered 200) and on
    // the card. Whether it then DRAWS is the bucket's business, not the copy's:
    // the local stack's buckets are private by design (supabase/seed.sql, R7b)
    // while the app reads job photos by public URL — so locally no photo draws,
    // on the phone either. Staging decides for the live link (HANDOFF: "is
    // photo storage public?").
    if (!uploads.some((u) => u.who === 'worker' && u.status === 200 && u.path.includes('/job-photos/'))) {
      throw new Error('the finished-work photo was never stored');
    }
    await app.getByLabel('Open photo').first().waitFor({ state: 'visible', timeout: STEP_MS });
    await tap(app, '5 stars');
    await tap(app, /^Submit review$/);
    await see(app, /rated|Thanks/i, 60_000);
  });
  await snap(worker, 'reviewed');
} catch (error) {
  failure = error;
} finally {
  await browser.close();
  server.close();
}

if (offHost.size) log(`hosts other than this machine: ${[...offHost].sort().join(', ')}`);
for (const e of errors) log(`ERROR ${e}`);

if (failure || errors.length) {
  rmSync(stampFile, { force: true });
  console.error(`\n[robot] FAILED${failure ? `: ${failure.message}` : ''}`);
  process.exit(1);
}
writeFileSync(stampFile, JSON.stringify({ bundle: bundleHash(), at: new Date().toISOString(), title: TITLE }, null, 2));
log(`PASSED — the whole loop, both sides. Screens: ${shotsDir}`);
