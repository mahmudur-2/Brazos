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
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * The fabricated publishable key, in ONE place because it is now needed in
 * two: seedPage() puts it in `__BRAZOS_CONFIG__`, and buildExport() puts it in
 * the export's environment. It is deliberately long enough to satisfy the
 * app's own configuration schema (config/env.ts requires twenty characters, a
 * cheap way to catch a placeholder) and deliberately unmistakable for a real
 * one. Nothing authenticates with it: every request is stubbed.
 */
const HARNESS_KEY = 'harness-anon-key-not-a-real-key';

/** A stable synthetic account id. Nothing is written anywhere it could escape. */
const USER_ID = '00000000-0000-4000-8000-000000000001';

// ===========================================================================
// THE FLOW'S INPUTS.
//
// Pinned so two runs of a Post-a-Job target type the same characters and
// produce the same pixels. These are the harness's OWN inputs — a person
// filling in a form — not marketplace data.
//
// THAT SENTENCE USED TO COVER THE WHOLE FILE, AND NO LONGER DOES. Four
// invented job rows now live below, under THE SEEDED JOB ROWS, and they are
// marketplace data by any honest reading. What the opt-in there buys, and what
// is still true of this file: no worker, rating, review, history or image is
// invented anywhere in it, and every list requested by a target that does not
// ask for those four rows still comes back empty.
//
// DESCRIPTION reuses the title verbatim. lib/validation.ts sets a 20-character
// floor that gates Continue, so the step cannot be passed without one, and
// restating the title adds no fact that was not already pinned — which is why
// the seeded rows describe themselves the same way.
// ===========================================================================
const JOB_TITLE = 'Dog walking - twice this week';
const JOB_DESCRIPTION = JOB_TITLE;
/**
 * The dog-walking category, in both spellings the file needs: the recipe TAPS
 * the label, and the seeded row below CARRIES the key, which is the pairing
 * lib/jobs.ts (JOB_CATEGORY_LABELS) holds. Restating either one somewhere else
 * is how the two would drift apart.
 */
const JOB_CATEGORY = 'dog_walking';
const JOB_CATEGORY_LABEL = 'Dog walking';
const JOB_AREA = 'East Flatbush, Brooklyn, NY';
const JOB_BUDGET = '75';

// ===========================================================================
// THE SEEDED JOB ROWS — the one place this harness answers with invented
// marketplace data. It is recorded here rather than buried, because the file
// spent its whole life claiming the opposite.
//
// WHY THEY EXIST. jobs, bids and counts all came back empty, so customer Home
// photographed its honest empty state and its job card had never once been
// rendered. A card that has never been drawn cannot be traced, measured or
// rebuilt as editable layers, so these four rows give that card something to
// draw. That is the operator's decision, taken knowingly.
//
// HOW NARROW THE EXCEPTION IS. It is OPT-IN PER TARGET (`jobs: true` on a
// registry entry): every target that does not ask keeps the empty answer, and
// its PNG stays byte-identical. It is four job rows and nothing else — no
// worker, rating, review, profile or photo is invented alongside them. Nothing
// here is written anywhere it could escape.
//
// THE ROW SHAPE IS THE SERVER'S, NOT THIS FILE'S. Each row carries every
// column supabase/migrations/20260901000000_baseline.sql gives public.jobs,
// holding either the value create_job() would have written or that column's
// own default — including the legacy mirror, where a RANGE's CEILING is what
// lands in the single budget_cents (create_job:
// `coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents)`). The
// answer is then projected down to the columns the request's own `select`
// names, exactly as PostgREST would, so a column dropped from
// OPEN_JOB_COLUMNS stops arriving here too instead of being quietly supplied
// by the harness.
//
// TIMESTAMPS ARE OFFSETS FROM NOW, NOT FIXED DATES — the opposite of the
// create_job echo further down, for the very same reason. That card renders no
// relative age, so a PINNED date is what makes two runs agree there. These
// rows feed a list sorted by age whose cards are one line away from spelling
// one, so an OFFSET is what makes two runs agree here: a pinned date would
// read "2 hours ago" on the day it was written and "seven months ago" today.
//
// NO IMAGES. `photos` and `videos` are empty on all four, so every card falls
// back to its category glyph. An image URL would be a request to a host
// outside the harness, and the escape assertion at the end of main() would
// rightly fail the run for it.
//
// SCHEDULING STAYS NULL on all four. "Flexible" is a real and common answer —
// lib/jobs.ts says so where it declares those columns — and a fixed date would
// age exactly the way a fixed created_at would.
// ===========================================================================

/** A second stable synthetic account id, and NOT the harness's own USER_ID:
 *  HomeScreen computes `isOwn` against the signed-in id, so seeding these
 *  under USER_ID would render all four as the operator's own posts, with the
 *  "Your job" chip and "No bids yet" in place of a browsing worker's view. No
 *  profile row is seeded for it and no name is attached to it anywhere. */
const POSTER_ID = '00000000-0000-4000-8000-000000000002';

const HOUR_MS = 60 * 60 * 1000;

/**
 * The four postings, held as the ARGUMENTS create_job() would have been
 * called with rather than as finished rows, so the server's rules are applied
 * below instead of being pre-computed by hand. Declared newest first, which is
 * the order `fetchOpenJobs()` asks for (`order=created_at.desc`).
 */
const SEEDED_JOBS = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    title: JOB_TITLE,
    category: JOB_CATEGORY,
    location: JOB_AREA,
    budget_cents: Number(JOB_BUDGET) * 100,
    budget_min_cents: null,
    budget_max_cents: null,
    offers: 0,
    agedHours: 2,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    title: 'Mount a 55-inch TV in the living room',
    category: 'tv_mounting',
    location: 'Bed-Stuy, Brooklyn, NY',
    budget_cents: null,
    budget_min_cents: 9_000,
    budget_max_cents: 12_000,
    offers: 2,
    agedHours: 6,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    title: 'Help moving boxes into a third-floor walk-up',
    category: 'packing',
    location: 'Crown Heights, Brooklyn, NY',
    budget_cents: null,
    budget_min_cents: 14_000,
    budget_max_cents: 18_000,
    offers: 5,
    agedHours: 24,
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    title: 'Paint one bedroom, walls only',
    category: 'painting',
    location: 'Prospect Heights, Brooklyn, NY',
    budget_cents: null,
    budget_min_cents: 20_000,
    budget_max_cents: 26_000,
    offers: 1,
    agedHours: 72,
  },
];

/** Every column public.jobs has, carrying what create_job() writes or what the
 *  table itself defaults to — never a third, invented value. */
function seededJobRows() {
  const now = Date.now();
  return SEEDED_JOBS.map((seed) => ({
    // Written by create_job() from the poster's answers.
    id: seed.id,
    client_id: POSTER_ID,
    title: seed.title,
    description: seed.title,
    category: seed.category,
    location: seed.location,
    // create_job()'s legacy single-budget mirror, transcribed:
    //   coalesce(p_budget_max_cents, p_budget_min_cents, p_budget_cents)
    budget_cents: seed.budget_max_cents ?? seed.budget_min_cents ?? seed.budget_cents,
    budget_min_cents: seed.budget_min_cents,
    budget_max_cents: seed.budget_max_cents,
    scheduled_date: null,
    arrival_start_hour: null,
    arrival_end_hour: null,
    photos: [],
    videos: [],
    // Written by create_job() as a literal.
    status: 'open',
    // now − agedHours, in the ISO form PostgREST returns for a timestamptz.
    created_at: new Date(now - seed.agedHours * HOUR_MS).toISOString(),
    // The remaining columns of public.jobs, at the table's own defaults. None
    // of the four needs one, so none of them gets a value anybody chose.
    location_text: null,
    completion_photo_url: null,
    completion_photos: [],
    completion_videos: [],
    visibility: 'open_market',
    assigned_worker_id: null,
    accepted_bid_id: null,
    accepted_offer_id: null,
    final_amount_cents: null,
    scheduled_for: null,
    en_route_at: null,
    arrived_at: null,
    completed_at: null,
    property_id: null,
    area_code: null,
  }));
}

/**
 * PostgREST returns the columns the request's own `select` names and no
 * others, so this does too. That is the stronger arrangement: a column dropped
 * from OPEN_JOB_COLUMNS stops arriving in the harness as well, instead of
 * being handed over anyway and hiding the regression. An embed
 * (`job_offers!fk(count)`) is not a column of this row and is skipped, which
 * leaves bid_count on mapJobRow's own zero fallback exactly as a real embed-
 * less read would.
 */
function projectColumns(row, select) {
  if (!select) return row;
  const picked = {};
  for (const raw of select.split(',')) {
    const name = raw.trim();
    if (!name || name.includes('(')) continue;
    if (name in row) picked[name] = row[name];
  }
  return picked;
}

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
//   jobs         optional. `true` opts this target in to the four seeded job
//                rows (see THE SEEDED JOB ROWS) — the one place this harness
//                answers with invented marketplace data. Absent everywhere
//                else, and absence is what keeps every other target on the
//                empty answer it has always had, with its PNG unchanged.
//   session      optional. `false` seeds NO session, setup record or mode
//                key, so the app lands on Welcome — the signed-out tree.
//                Absent is today's seeding, and every existing PNG stays
//                byte-identical.
//   setup        optional. `false` seeds the session and the mode key but
//                NOT the setup record, so the app lands on Setup — the
//                signed-in, not-yet-set-up tree. Absent is today's seeding.
//   accepting    optional. `true` answers the profile fixture with
//                `accepting_work: true`, so worker Home renders ONLINE
//                ("Shown as available on your profile"). Absent keeps the
//                fixture's `false` — OFFLINE, which every worker target has
//                always photographed — so every existing PNG stays
//                byte-identical. A fixture rather than a tap on the toggle:
//                the toggle writes through update_my_profile, whose empty
//                stubbed answer would replace the whole profile (name
//                included) instead of flipping one field. RUN figma-extract.
//
// FLAGS (2026-09-21): `--design <file.json>` renders every selected target
// under that override set — a lib/designOverrides.ts DesignOverrides object
// (materials, palette.dark['app.*' | 'emerald.*'], …), seeded as a global the
// bundle reads at load — and `--suffix <x>` writes the PNGs as
// `<name><x>.png` so a direction's renders sit beside the baseline's. The
// app's look never changes: the seed is the harness page's alone.
//
//   landmarks    optional. Texts whose bounding boxes are written beside the
//                PNG as `<name>.landmarks.json` (the LAST exact match of
//                each — a sheet over a screen renders later in the DOM than
//                the screen's own chips — in CSS px of the 393x852 frame), AFTER the shutter so
//                nothing photographed is perturbed. The colour loop
//                (docs/dispatch/NEXT-RUN-2026-09-21.md item 9) samples the
//                app render and the reference beside the same texts. 2026-09-21.
//
// A target with no recipe is photographed exactly where the app lands. The
// four original Home targets do that, and their capture path is the one
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
  { expect: 'Show the job' },
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

const HOME_LANDMARKS = [
  'Mahmudur',
  'Take a task\noff your plate',
  'Describe it.\nHire help.\nGet it handled.',
  'What do you need done?',
  'Post a job ›',
  'Popular services',
  'Assembly',
  'Your jobs',
  "You haven't posted any jobs yet",
];

const TARGETS = [
  // 2026-09-21: the landmarks are the Home loop's — the greeting's name, the
  // headline and the sub-copy (their full strings, newlines included), the
  // card's title and pill, the two section titles, the first tile's label,
  // the empty row's title — against docs/mockups/html/home-redesign.html.
  { name: 'customer-home-dark', mode: 'customer', colorScheme: 'dark', wait: 'Take a task', landmarks: HOME_LANDMARKS },
  { name: 'customer-home-light', mode: 'customer', colorScheme: 'light', wait: 'Take a task', landmarks: HOME_LANDMARKS },
  // Worker Home in its OFFLINE state — the profile fixture's `accepting_work:
  // false` — and its empty feed. The ONLINE and populated states are their
  // own entries (RUN figma-extract, at the end of the registry). The wait is
  // the status word only the offline card draws, so this entry proves its
  // state and not just its arrival; "Get hired." is still on the page.
  { name: 'worker-home-dark', mode: 'worker', colorScheme: 'dark', wait: 'Offers still reach you' },
  { name: 'worker-home-light', mode: 'worker', colorScheme: 'light', wait: 'Offers still reach you' },

  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      name: `postjob-media-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      recipe: TO_MEDIA,
      wait: 'Show the job',
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
      // The harness invents no WORKER — the seeded job rows are the whole of
      // its invented data, and this target does not opt in to them anyway — so
      // an empty result is the EXPECTED end state here and says nothing about
      // what staging holds.
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
  // RUN SHOTS1 — customer-mode coverage. Every surface IN THIS BLOCK is
  // reached the way a customer reaches it, from where the app lands, with the
  // fixtures the harness already seeds — so list-shaped screens photograph
  // their honest EMPTY state, named per entry. No entry here opts in to the
  // seeded job rows, so nothing in this block is fed invented marketplace
  // data. (RUN JOBS1, at the end of the registry, is where that changed.)
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
      // state, and it stays empty by the opt-in alone: this target does not
      // set `jobs: true`, so the own-jobs read customer Home's "Your jobs"
      // section now answers comes back empty here, exactly as it always has.
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
      // state: this target does not opt in to the seeded job rows, so the feed
      // it reads still answers empty. Neither the header title nor any part
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
      // 2026-09-21 — THE FILTERS SHEET over the open-jobs list (the map has
      // no target: tile hosts fail the escape assertion). The sheet's tint,
      // its chosen and unchosen pills and its popup are what the colour loop
      // measures against docs/mockups/html/map-explore-filters-*.html; the
      // landmarks are the texts the loop samples beside. The wait is the
      // Minimum budget eyebrow, which only the sheet renders (uppercased by
      // the Section, matched case-insensitively).
      name: `worker-results-filters-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      recipe: [{ expect: 'Get hired.' }, { press: 'View all open jobs' }, { press: 'Filters' }],
      wait: 'Minimum budget',
      landmarks: ['Filters', 'Done', 'DISTANCE', 'Any', '2 mi', 'MINIMUM BUDGET', '$25', 'Reset'],
    },
    {
      // The same sheet with the Minimum budget popup open, on its first six
      // values (nothing chosen, so the list opens at the top); the wait is
      // the sixth row, which only the open popup renders.
      name: `worker-results-filters-budget-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      recipe: [
        { expect: 'Get hired.' },
        { press: 'View all open jobs' },
        { press: 'Filters' },
        { press: 'Custom minimum budget' },
      ],
      wait: '$30',
      landmarks: ['$10', '$15', '$20', '$25', '$30'],
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

  // =========================================================================
  // RUN JOBS1 — the POPULATED customer Home, and the only two targets in this
  // registry that opt in to the seeded job rows. Every entry above keeps the
  // empty answer.
  //
  // No recipe: Home is where the app lands, and the cards are the whole
  // surface. 2026-09-17: the section they fill is "Your jobs" — the customer's
  // OWN postings, read by client_id — where it used to be "Nearby", the open
  // market. The same four rows answer both reads (see THE CUSTOMER'S OWN
  // POSTED JOBS in stubResponse); the section draws the three most recent.
  // =========================================================================
  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      name: `customer-home-jobs-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      jobs: true,
      // The LAST card the section DRAWS. It has to be text only a populated
      // card shows — never something Home spells anyway — or a target that
      // failed to populate would quietly photograph the empty state and pass.
      // Taking it from the end of what is drawn rather than the start also
      // means a list that arrives short fails loudly instead of being
      // photographed short. Index 2 is the third of the four seeded rows,
      // which are declared newest first, and "Your jobs" draws three.
      wait: SEEDED_JOBS[2].title,
    },
  ]),

  // =========================================================================
  // RUN n2 — the signed-out and the not-yet-set-up trees, both schemes. These
  // are the only entries that set `session: false` or `setup: false`; every
  // entry above keeps the seeded landing it has always had, PNG unchanged.
  //
  // The auth flow is a native stack: a screen navigated away from stays in
  // the DOM, hidden, and first — so every wait here is a sentence only the
  // arriving screen renders, never the eyebrow or the headline the two
  // sign-in screens share ("WELCOME BACK", "Sign in to BRAZOS").
  //
  // Not here, and why (docs/GATES.md Gate 2 box 2 carries the whole list):
  // Verify phone, because phone auth resolves to `disabled` outside
  // development (lib/phoneAuth/mode.ts) and no challenge is ever issued; and
  // the legal gate, which needs the acceptance read answered EMPTY for one
  // target — a third stub flag this run does not add.
  // =========================================================================
  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      // Where the app lands with no session at all.
      name: `auth-welcome-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      session: false,
      wait: 'Hire local help or find nearby work.',
    },
    {
      // Sign in, by Welcome's own ghost button. FIX-RUN B2: with phone auth
      // off (every non-development build, this export included) it opens the
      // email sign-in directly — the phone-first targets that stood here
      // would have photographed the same screen twice, so they went.
      name: `auth-email-signin-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      session: false,
      recipe: [
        { expect: 'Hire local help or find nearby work.' },
        { pressText: 'I already have an account' },
      ],
      wait: 'The email and password on your account.',
    },
    {
      // Create account, by Welcome's primary button — the email + phone
      // sign-up while phone auth is off (B2, the operator's ruling).
      name: `auth-email-create-account-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      session: false,
      recipe: [{ expect: 'Hire local help or find nearby work.' }, { press: 'Continue with phone' }],
      wait: 'Sign up with your email',
    },
    {
      // Signed in, mode seeded, setup record absent: the one-time Setup step.
      // Its legal row reads as reviewed because the acceptance read is
      // answered with the current versions here, as it is for every target.
      name: `auth-setup-${colorScheme}`,
      mode: 'customer',
      colorScheme,
      setup: false,
      // 2026-09-28 (LUX-LIST-64 #9): the eyebrow left; the headline proves arrival.
      wait: 'Set up your experience',
    },
  ]),

  // =========================================================================
  // RUN n5 — Submit Bid, the OfferComposer's host, and the second target that
  // opts in to the seeded job rows. Reached the way a worker reaches it: the
  // first seeded card on Worker Home (its accessibility label is the job
  // title) opens the worker's job detail, and "Write a bid" opens the
  // composer. NOT through "View all open jobs": with the rows seeded, the same
  // title also sits on Worker Home, which stays in the DOM, hidden and FIRST,
  // once the results screen is pushed over it — the hazard the worker-results
  // entry records — so the card is tapped where it is visible.
  //
  // The worker's job detail re-reads its job by id on focus; stubResponse
  // answers that read from the same four rows (THE ONE-ROW READ), which is
  // what keeps the screen on the job it painted long enough to be tapped.
  //
  // The take-home line ("You receive … after the fee") is ABSENT here by
  // design: quote_job_price gets the empty answer every other RPC gets, and
  // null renders nothing. Its copy is proven by tests/offerComposer.test.mjs;
  // this render proves the host still renders.
  // =========================================================================
  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      name: `worker-submit-bid-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      jobs: true,
      recipe: [
        { expect: 'Get hired.' },
        { press: SEEDED_JOBS[0].title },
        { press: 'Write a bid' },
      ],
      // A chip-group label only the bid composer draws.
      wait: 'When can you start',
    },
  ]),

  // =========================================================================
  // RUN figma-extract — STATE VARIANTS. Worker Home's ONLINE state, and the
  // POPULATED worker surfaces: the two screens whose populated state the four
  // seeded rows can reach. Every other empty-state surface in this registry
  // (inboxes, the job hubs, the notification feed, earnings, services, saved
  // workers, profile details, discovery) is populated only by people, offers,
  // conversations, payments or profile facts this harness deliberately does
  // not invent, so it stays at its one honest empty entry.
  // =========================================================================
  ...['dark', 'light'].flatMap((colorScheme) => [
    {
      // Worker Home ONLINE, by the profile fixture (see `accepting` in the
      // registry header). Empty feed, exactly as the OFFLINE entry. The wait
      // is the status word ONLY this state draws: "Visible to customers" is
      // a substring of the offline caption and could not prove it.
      name: `worker-home-online-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      accepting: true,
      wait: 'Shown as available on your profile',
    },
    {
      // Worker Home POPULATED (offline, as the baseline is): the third
      // target that opts in to the seeded rows. WorkerHomeScreen slices its
      // preview to PREVIEW_COUNT, which is 3, sorted skill matches first
      // then newest; the fixture profile has no categories, so the three
      // newest draw. The wait is the LAST of those three — text only a
      // populated preview draws, taken from the end so a short feed fails
      // loudly rather than photographing short.
      name: `worker-home-jobs-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      jobs: true,
      wait: SEEDED_JOBS[2].title,
    },
    {
      // The open-jobs list POPULATED, by worker Home's own "view all" path.
      // Mode 'all' with no persisted radius reads the plain feed, so all four
      // rows draw as full cards. The wait is the FOURTH seeded title: worker
      // Home — hidden but first in the DOM once this screen is pushed over
      // it — spells only the three its preview draws, so the fourth is text
      // this screen alone renders.
      name: `worker-results-jobs-${colorScheme}`,
      mode: 'worker',
      colorScheme,
      jobs: true,
      recipe: [{ expect: 'Get hired.' }, { press: 'View all open jobs' }],
      wait: SEEDED_JOBS[SEEDED_JOBS.length - 1].title,
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
  // THE EXPORT GETS ITS OWN ENVIRONMENT, and that is the point. The Expo CLI
  // loads .env files and inlines every EXPO_PUBLIC_ value at bundle time, so a
  // spawn that merely inherited the operator's shell would bake whatever
  // project THEY happen to be pointed at into the bundle these screenshots are
  // taken from — a different bundle on every machine, and a real project ref
  // in a harness whose whole premise is that it reaches none. The two values
  // below are the same fabricated pair seedPage() puts in __BRAZOS_CONFIG__:
  // a host that resolves nowhere, and a key long enough to satisfy the app's
  // own configuration schema without being mistaken for a real one.
  //
  // THE OBSERVABILITY CREDENTIALS ARE BLANKED FOR THE SAME REASON, ONE LAYER
  // LATER. R2 gave the app a crash reporter and a product-analytics client,
  // both of which initialise from an EXPO_PUBLIC_ variable and start talking
  // to a vendor the moment one is present. The operator's own dotenv has real
  // values for both, so an inherited environment baked them into the bundle
  // and the render reached out to three vendor hosts — caught, correctly, by
  // the escaped-host check at the end of main(). Nothing had actually left the
  // machine (every request is stubbed by the route handler above), but a
  // harness whose premise is that it reaches nothing must not certify a run
  // that tried.
  //
  // An EMPTY STRING rather than a deletion, because that is the spelling
  // config/env.ts already normalises: `unset()` maps '' to undefined, both
  // fields are optional, and an absent DSN or key is the documented "off"
  // state for each. So this does not special-case the harness inside the app —
  // it exercises the guards those two modules already have, which is the
  // stronger arrangement: if either guard regressed, this export would start
  // reaching vendor hosts again and the check below would fail.
  const run = spawnSync(
    process.execPath,
    [cli, 'export', '--platform', 'web', '--output-dir', exportDir, '--clear'],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        EXPO_PUBLIC_SUPABASE_URL: HARNESS_URL,
        EXPO_PUBLIC_SUPABASE_KEY: HARNESS_KEY,
        EXPO_PUBLIC_SENTRY_DSN: '',
        EXPO_PUBLIC_POSTHOG_KEY: '',
      },
    },
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
 *
 * `session` and `setup` are the target's two landing opt-outs (RUN n2),
 * threaded from the registry entry exactly as `jobs` is into stubResponse.
 * Both true is the seeding every target has always had. `session` false
 * writes none of the three keys, so the app lands on Welcome; `setup` false
 * writes the session and the mode key but not the setup record, so it lands
 * on Setup. The runtime configuration is supplied either way.
 */
function seedPage({ mode, url, key, sessionKey, userId, session, setup, design }) {
  globalThis.__BRAZOS_CONFIG__ = { SUPABASE_URL: url, SUPABASE_KEY: key };
  // 2026-09-21: a candidate design, applied by lib/designOverrides.ts at load.
  if (design) globalThis.__BRAZOS_DESIGN_OVERRIDES__ = design;
  if (!session) return;

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
  if (setup) {
    window.localStorage.setItem(
      `brazos.setup.v1.${userId}`,
      JSON.stringify({ completed: true, landing: mode === 'worker' ? 'work' : 'hire' }),
    );
  }
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

/**
 * Everything the app asks the network for, answered locally.
 *
 * `jobs` is the target's opt-in, threaded down from the registry entry: false
 * for every target but the two RUN JOBS1 ones, the two RUN n5 ones and the
 * four RUN figma-extract populated-worker ones, and the branches it guards are
 * unreachable without it. `accepting` is threaded the same way and flips one
 * field of the profile fixture, nothing else.
 */
function stubResponse({ pathname, query, headers, postData, jobs, accepting, setupTrace = true }) {
  const single = String(headers.accept ?? '').includes('vnd.pgrst.object');

  // FIX-RUN B16: with no device record, useSetupStatus asks whether this
  // account EVER accepted (lib/legal hasAnyLegalAcceptance, the one `limit=1`
  // read of this table). A target that opts out of the setup record is an
  // account that never finished Setup, so that read is answered empty; the
  // version read below still passes, so Setup's legal row reads as reviewed.
  if (pathname.includes('/rest/v1/legal_acceptances') && !setupTrace && query.get('limit') === '1') {
    return { status: 200, body: [] };
  }

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
  //
  // `accepting_work` is the one field a target may flip (`accepting: true`
  // on the registry entry): false is the OFFLINE state every worker target
  // photographed before RUN figma-extract, and it stays the answer for every
  // entry that does not opt in.
  if (
    pathname.includes('/rest/v1/profiles') ||
    pathname.endsWith('/rest/v1/rpc/get_my_profile')
  ) {
    const profile = {
      id: USER_ID,
      full_name: 'Mahmudur Rahman',
      active_mode: null,
      accepting_work: accepting === true,
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

  // THE ONE-ROW READ, for a target that opted in. The worker's job detail
  // re-reads its job by id on focus (hooks/useJobDetail.ts → fetchOpenJobById:
  // `id=eq.<id>`, no status filter); answered from the SAME four rows and
  // nothing else, so a row the feed served cannot flip the screen to "This
  // job is no longer available" after its first paint. An id outside the
  // four falls through to the empty answer at the bottom. RUN n5.
  if (jobs && pathname.endsWith('/rest/v1/jobs') && (query.get('id') ?? '').startsWith('eq.')) {
    const wanted = query.get('id').slice('eq.'.length);
    const row = seededJobRows().find((seed) => seed.id === wanted);
    if (row) {
      const projected = projectColumns(row, query.get('select'));
      return { status: 200, body: single ? projected : [projected] };
    }
  }

  // THE CUSTOMER'S OWN POSTED JOBS, for a target that opted in. 2026-09-17:
  // customer Home's "Your jobs" section reads hooks/useMyJobsHub.ts, which
  // asks lib/jobs.ts's fetchJobsByClient — `client_id=eq.<me>`, drafts
  // excluded, newest first — and that is a DIFFERENT read from the feed
  // below. Until Nearby left that screen the feed was the only job read Home
  // made, and this one went unanswered; answering it is what keeps the
  // populated Home target populated.
  //
  // THE SAME FOUR ROWS AND NOTHING ELSE. No fifth row, no new field, no
  // invented fact — only the ownership changes, and it has to: these rows
  // ARE the signed-in customer's postings in this read, where in the feed
  // below they are a stranger's (POSTER_ID, so a browsing worker's view is
  // what the feed target photographs). One set of facts, read from two sides,
  // which is exactly what the two queries mean.
  //
  // Gated on the predicate the hub itself sends, so it answers THAT read and
  // no other: the feed carries `status=eq.open` and never a client_id, and a
  // target that did not opt in still gets the empty answer at the bottom.
  if (jobs && pathname.endsWith('/rest/v1/jobs') && query.get('client_id') === `eq.${USER_ID}`) {
    const select = query.get('select');
    const rows = seededJobRows().map((row) =>
      projectColumns({ ...row, client_id: USER_ID }, select)
    );
    return { status: 200, body: single ? (rows[0] ?? {}) : rows };
  }

  // THE OPEN-JOBS FEED, for a target that opted in. Gated on the predicate
  // the feed itself sends (lib/jobs.ts, fetchOpenJobs: status=eq.open), so
  // this answers THAT read and no other read of the same table: the own-jobs
  // query above carries a client_id instead, and every other read of this
  // table still comes back empty.
  if (jobs && pathname.endsWith('/rest/v1/jobs') && query.get('status') === 'eq.open') {
    const select = query.get('select');
    const rows = seededJobRows().map((row) => projectColumns(row, select));
    return { status: 200, body: single ? (rows[0] ?? {}) : rows };
  }

  // The batched count behind each card's interest line (lib/offers.ts,
  // fetchOfferCounts → job_offer_counts). Two details of the real RPC are kept
  // rather than smoothed over, because the card reads them: it filters by the
  // ids it was handed, and it leaves a job with NO offers out of the result
  // entirely — the caller fills those in as zero — so the dog-walking row is
  // deliberately absent here instead of being sent as an explicit 0.
  if (jobs && pathname.endsWith('/rest/v1/rpc/job_offer_counts')) {
    let asked = [];
    try {
      asked = JSON.parse(postData ?? '{}').p_job_ids ?? [];
    } catch {
      asked = [];
    }
    return {
      status: 200,
      body: SEEDED_JOBS.filter((seed) => seed.offers > 0 && asked.includes(seed.id)).map(
        (seed) => ({ job_id: seed.id, offer_count: seed.offers }),
      ),
    };
  }

  // Everything else comes back EMPTY — and for every target that did not set
  // `jobs: true`, "everything else" still includes the jobs feed and its offer
  // counts, so those screens draw the same honest empty state they always did.
  // The two branches above are the whole of the exception.
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
  // `--only` takes a substring, or several separated by commas (2026-09-21).
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const wanted = only ? only.split(',').filter(Boolean) : null;
  const selected = wanted ? TARGETS.filter((target) => wanted.some((part) => target.name.includes(part))) : TARGETS;
  // 2026-09-21: a candidate design (see FLAGS above) and the suffix its PNGs take.
  const designFile = argv.includes('--design') ? argv[argv.indexOf('--design') + 1] : null;
  const design = designFile ? JSON.parse(readFileSync(designFile, 'utf8')) : null;
  const suffix = argv.includes('--suffix') ? argv[argv.indexOf('--suffix') + 1] : '';
  if (suffix && !/^[\w.-]+$/.test(suffix)) throw new Error(`--suffix ${suffix}: letters, digits, . _ - only`);

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
        let query = new URLSearchParams();
        try {
          const parsed = new URL(url);
          pathname = parsed.pathname;
          // PostgREST puts the select list, the filters and the ordering in
          // the query string, and the jobs branch reads two of them.
          query = parsed.searchParams;
          if (parsed.hostname !== HARNESS_HOST) escaped.add(parsed.hostname);
        } catch {
          escaped.add(url);
        }
        const stub = stubResponse({
          pathname,
          query,
          headers: route.request().headers(),
          postData: route.request().postData(),
          // THE OPT-IN, per target and nowhere else.
          jobs: shot.jobs === true,
          // THE AVAILABILITY FIXTURE, read the same way (RUN figma-extract).
          accepting: shot.accepting === true,
          // B16: the setup opt-out also means no server trace of Setup.
          setupTrace: shot.setup !== false,
        });
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
        key: HARNESS_KEY,
        sessionKey: HARNESS_SESSION_KEY,
        userId: USER_ID,
        // THE TWO LANDING OPT-OUTS, per target and nowhere else — read off
        // the registry entry exactly the way `jobs` is above.
        session: shot.session !== false,
        setup: shot.setup !== false,
        design,
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

      const file = join(shotsDir, `${shot.name}${suffix}.png`);
      await page.screenshot({ path: file, animations: 'disabled' });
      if (shot.landmarks) {
        // After the shutter: the boxes of the named texts, for the loop.
        const boxes = {};
        for (const text of shot.landmarks) {
          boxes[text] = await page.getByText(text, { exact: true }).last().boundingBox();
        }
        writeFileSync(join(shotsDir, `${shot.name}${suffix}.landmarks.json`), JSON.stringify(boxes, null, 2));
      }
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
