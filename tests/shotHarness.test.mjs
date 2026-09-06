// s1 — THE CHIP'S DESTINATION HAS EYES ON IT.
//
// scripts/shots.mjs gained a target that photographs WHERE A CATEGORY CHIP
// LANDS: customer Home -> the "Other" sheet -> "Pet Sitting & Dog Walking" ->
// WorkerSearchScreen. It is reached by TAPPING, never by navigating to the
// route, because a hand-seeded `category` param would prove only that the
// destination reads a param someone handed it — not that the chip hands it one.
//
// So the fences here are of two kinds:
//
//   1. The recipe's locators are strings the app actually renders. A
//      declarative recipe fails at RENDER time, minutes into a capture run,
//      and only when somebody runs it. Renaming an accessibility label is a
//      silent break otherwise, so every locator this target introduces is
//      checked against the source it drives.
//
//   2. The tapped category reaches the SEARCH. That is what the shot is
//      evidence about, and it is verifiable offline: Home passes `category`,
//      all three param lists declare it, the destination seeds its pinned chip
//      from it AND feeds it to the search on arrival, and the search puts it in
//      the table read. Every link is asserted; none of it inferred from pixels.
//
// NOTHING HERE ASSERTS THAT THE SCREEN NAMES THE APPLIED CATEGORY. It does not:
// the selected service tile is the only marker, and for a category outside the
// first three it renders off the right edge of a 393pt viewport. Whether to say
// so on screen is an appearance decision and is not this file's to make.
//
// RUN JOBS1 added a third kind of fence, at the bottom of this file. The
// harness now seeds four job rows so that customer Home's job card can be
// photographed at all — an exception to the rule it otherwise keeps, and one
// that is only as narrow as its OPT-IN. A third target carrying `jobs: true`
// would change a PNG that is supposed to be byte-identical, silently, minutes
// into a capture run and only when somebody runs one. That is what the last
// test here turns into an offline failure.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const SHOTS = fileURLToPath(new URL('../scripts/shots.mjs', import.meta.url));

/** Comments are prose. A fence a comment can satisfy is not a fence. */
const codeOnly = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** The substring the shutter waits on for the category target. It has to be a
 *  substring of BOTH empty-state wordings — the plain one and the one naming
 *  the applied category — or the capture hangs on whichever it is not. */
const WORKER_SEARCH_WAIT = 'workers matched';

/** `--list` returns before the export, the browser and the shutter, so this
 *  reads the REAL registry rather than a regex's opinion of it. */
function registry() {
  const run = spawnSync(process.execPath, [SHOTS, '--list'], { encoding: 'utf8' });
  assert.equal(run.status, 0, `shots.mjs --list failed: ${run.stderr}`);
  return run.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

test('the registry photographs where a category chip lands, in both schemes', () => {
  const names = registry();
  for (const scheme of ['dark', 'light']) {
    assert.ok(
      names.includes(`workersearch-category-${scheme}`),
      `no workersearch-category-${scheme} target`
    );
  }

  // The targets that were already there are UNCHANGED — adding eyes to one
  // surface may not quietly rename or drop another's.
  for (const existing of [
    'customer-home-dark',
    'customer-home-light',
    'worker-home-dark',
    'worker-home-light',
    'postjob-media-dark',
    'postjob-location-dark',
    'postjob-review-dark',
    'postjob-budget-dialog-dark',
    'postjob-published-dark',
    'postjob-media-light',
    'postjob-location-light',
    'postjob-review-light',
    'postjob-budget-dialog-light',
    'postjob-published-light',
    // RUN SHOTS1 — customer-mode coverage, both schemes.
    'customer-discover-dark',
    'customer-discover-light',
    'customer-create-sheet-dark',
    'customer-create-sheet-light',
    'customer-services-sheet-dark',
    'customer-services-sheet-light',
    'customer-inbox-dark',
    'customer-inbox-light',
    'customer-myjobs-dark',
    'customer-myjobs-light',
    'customer-profile-dark',
    'customer-profile-light',
    'customer-profile-details-dark',
    'customer-profile-details-light',
    'customer-account-safety-dark',
    'customer-account-safety-light',
    'customer-notification-settings-dark',
    'customer-notification-settings-light',
    'customer-notification-feed-dark',
    'customer-notification-feed-light',
    'customer-earnings-dark',
    'customer-earnings-light',
    'customer-services-pricing-dark',
    'customer-services-pricing-light',
    'customer-saved-workers-dark',
    'customer-saved-workers-light',
    'customer-appearance-dark',
    'customer-appearance-light',
    'customer-payment-methods-dark',
    'customer-payment-methods-light',
    'customer-legal-terms-dark',
    'customer-legal-terms-light',
    'customer-delete-account-dark',
    'customer-delete-account-light',
    // RUN SHOTS1 — worker-mode coverage, both schemes.
    'worker-services-sheet-dark',
    'worker-services-sheet-light',
    'worker-results-dark',
    'worker-results-light',
    'worker-myjobs-dark',
    'worker-myjobs-light',
    'worker-inbox-dark',
    'worker-inbox-light',
    'worker-profile-dark',
    'worker-profile-light',
    // RUN JOBS1 — the populated customer Home, both schemes. Listed here so
    // they are protected from a silent rename or drop exactly like the rest;
    // what makes them DIFFERENT from the rest is asserted in the last test.
    'customer-home-jobs-dark',
    'customer-home-jobs-light',
    // RUN figma-extract — the state variants, both schemes.
    'worker-home-online-dark',
    'worker-home-online-light',
    'worker-home-jobs-dark',
    'worker-home-jobs-light',
    'worker-results-jobs-dark',
    'worker-results-jobs-light',
  ]) {
    assert.ok(names.includes(existing), `${existing} disappeared from the registry`);
  }
  // 60 through RUN SHOTS1, plus the two RUN JOBS1 populated-Home targets,
  // plus RUN n2's twelve signed-out and not-yet-set-up targets, plus RUN n5's
  // two Submit Bid targets, plus RUN figma-extract's six state variants.
  assert.equal(names.length, 82, `registry is ${names.length} targets, expected 82`);
});

test('that target is reached by tapping a chip, never by naming the route', async () => {
  const harness = codeOnly(await read('scripts/shots.mjs'));

  const recipe = harness.match(/const TO_WORKER_SEARCH = \[([\s\S]*?)\n\];/);
  assert.ok(recipe, 'TO_WORKER_SEARCH recipe is gone');
  const steps = recipe[1];

  // Home first, then the sheet, then the dog-walking row. Order matters: the
  // sheet is Home's only tap path to a category outside the four visible pills.
  assert.match(steps, /\{ expect: 'Take a task' \}/);
  assert.match(steps, /\{ press: 'Other services' \}/);
  assert.match(steps, /\{ expect: 'All services' \}/);
  assert.match(steps, /\{ press: 'Pet Sitting & Dog Walking' \}/);

  // Every step is a tap, a type or a wait — the recipe's whole vocabulary.
  // Anything else would be a way of arriving that a customer has no access to.
  for (const step of steps.split('},')) {
    if (!step.trim()) continue;
    assert.match(step, /\{\s*(expect|press|pressText|fill):/, `odd step: ${step.trim()}`);
  }

  // The route name never appears in the harness at all, which is what makes
  // "arrived at by tapping" a fact rather than an intention.
  assert.doesNotMatch(harness, /WorkerSearch/);

  // The shutter waits on the post-search state, so it can never photograph the
  // spinner and call it a result.
  assert.match(harness, /name: `workersearch-category-\$\{colorScheme\}`/);
  const targetStart = harness.indexOf('name: `workersearch-category-');
  assert.ok(targetStart > -1, 'the category target is gone from the registry');
  const categoryTarget = harness.slice(targetStart, harness.indexOf('},', targetStart));
  assert.ok(
    categoryTarget.includes('recipe: TO_WORKER_SEARCH,'),
    'the category target no longer arrives by the chip recipe'
  );
  assert.ok(
    categoryTarget.includes(`wait: '${WORKER_SEARCH_WAIT}',`),
    `the category target's wait is not '${WORKER_SEARCH_WAIT}'`
  );
});

test('every locator that recipe introduces is a string the app renders', async () => {
  const [home, sheet, categories, search, lib] = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('components/ServicePickerSheet.tsx'),
    read('lib/skillCategories.ts'),
    read('screens/WorkerSearchScreen.tsx'),
    read('lib/workerSearch.ts'),
  ]);

  // `press` matches an accessibility label; `expect`/`pressText` match rendered
  // text. Each locator is checked against the file that actually carries it.
  assert.match(codeOnly(home), /accessibilityLabel="Other services"/);
  assert.match(codeOnly(home), /title="All services"/);
  assert.match(codeOnly(sheet), /accessibilityLabel=\{service\.label\}/);
  // The empty-state title IS the shutter's wait, and it is no longer a literal
  // on the screen: the lib words it, with or without the applied category. So
  // the fence follows it there and checks that BOTH wordings still contain the
  // substring the shutter waits on — otherwise a labelled title would sail
  // past this test and hang the capture instead.
  assert.match(codeOnly(search), /title=\{emptyResultTitle\(appliedCategoryLabel\)\}/);
  const emptyFn = codeOnly(lib).slice(codeOnly(lib).indexOf('export function emptyResultTitle'));
  assert.ok(
    emptyFn.startsWith('export function emptyResultTitle'),
    'emptyResultTitle() is gone from lib/workerSearch.ts'
  );
  for (const wording of ['No workers matched', 'No ${categoryLabel} workers matched']) {
    assert.ok(emptyFn.includes(wording), `emptyResultTitle no longer renders "${wording}"`);
    assert.ok(wording.includes(WORKER_SEARCH_WAIT), `"${wording}" cannot satisfy the wait`);
  }

  // The tapped row must still BE the dog-walking category, or the shot is of
  // some other search.
  assert.match(
    codeOnly(categories),
    /\{ key: 'dog_walking', label: 'Pet Sitting & Dog Walking'/
  );
});

test('a tapped category reaches the search, not just the destination state', async () => {
  const [home, nav, search, lib] = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('lib/navigation.ts'),
    read('screens/WorkerSearchScreen.tsx'),
    read('lib/workerSearch.ts'),
  ]);

  // Home hands the key over under the name the destination reads.
  assert.match(
    codeOnly(home),
    /function searchCategory\(categoryKey: string\) \{\s*navigation\.navigate\('WorkerSearch', \{ category: categoryKey \}\);/
  );

  // All three param lists that mount this route declare it — the customer Home
  // stack, the Discover tab, and the screen's own standalone route type. A
  // param declared in two of the three is a param dropped on the third.
  assert.equal(
    codeOnly(nav).match(
      /WorkerSearch: \{ query\?: string; category\?: string; autoFocus\?: boolean \}/g
    )?.length,
    3
  );

  // The destination READS it — and reading is not enough, so it also runs the
  // search with it on arrival rather than only parking it in state.
  const screen = codeOnly(search);
  assert.match(screen, /useState<string \| null>\(\s*params\?\.category \?\? null\s*\)/);
  assert.match(screen, /run\(params\?\.query \?\? '', params\?\.category \?\? null\)/);

  // …and that run puts it in the categories it hands to the matcher.
  assert.match(screen, /const categories = category \? \[category\] : interpretQuery\(trimmed\)/);
  assert.match(screen, /await findWorkers\(\{\s*query: searchText,\s*categories,/);

  // …which is a real filter on the read, not a label carried alongside it.
  assert.match(codeOnly(lib), /\.overlaps\('categories', searchedCategories\)/);
});

// RUN JOBS1 — THE POPULATED HOME, AND THE FENCE AROUND ITS OPT-IN.
test('the populated Home targets exist, and are the only ones seeded with jobs', async () => {
  const names = registry();
  for (const scheme of ['dark', 'light']) {
    assert.ok(
      names.includes(`customer-home-jobs-${scheme}`),
      `no customer-home-jobs-${scheme} target`
    );
  }

  const harness = await read('scripts/shots.mjs');

  // The new field is documented where the other five are. A registry field
  // that cannot be found by reading the registry's own header is a field the
  // next person adds a target without.
  const header = harness.slice(
    harness.indexOf('// THE TARGET REGISTRY.'),
    harness.indexOf('const TARGETS = [')
  );
  assert.ok(header.length > 0, 'the registry header comment is gone');
  const documented = header
    .split('\n')
    .map((line) => line.match(/^\/\/ {3}(\w+) {2,}\S/)?.[1])
    .filter(Boolean);
  for (const field of [
    'name',
    'mode',
    'colorScheme',
    'recipe',
    'wait',
    'jobs',
    'session',
    'setup',
    'accepting',
  ]) {
    assert.ok(
      documented.includes(field),
      `the registry header does not document \`${field}\``
    );
  }

  // OPT-IN, and the opt-in IS the byte-identity guarantee. RUN n2 turned the
  // exactly-once count into an ALLOW-LIST: every registry entry carrying
  // `jobs: true` is named below in its source form, and the set has to match
  // exactly, so a `jobs: true` that drifts onto any other entry fails offline
  // rather than changing a PNG minutes into a capture run. The promise the
  // count made is kept because no PRE-EXISTING entry changed: the list still
  // names the one RUN JOBS1 entry and, since RUN n5, the Submit Bid entry —
  // n2 registered no further opted-in target (its two candidates, the
  // worker's job detail and Submit Bid, were UNRENDERED at its HEAD because
  // the by-id read went unanswered); n5 answered that read from the same
  // rows and registered Submit Bid; figma-extract registered the populated
  // worker Home and the populated open-jobs list, the two surfaces whose
  // populated state the same four rows reach. Comments are stripped first,
  // so the prose explaining the flag cannot be what satisfies this.
  const code = codeOnly(harness);
  const optedIn = [...code.matchAll(/jobs:\s*true/g)].map((match) => {
    const nameAt = code.lastIndexOf('name:', match.index);
    assert.ok(nameAt > -1, 'a `jobs: true` with no registry entry name before it');
    return code
      .slice(nameAt, code.indexOf('\n', nameAt))
      .replace(/^name:\s*/, '')
      .replace(/,\s*$/, '');
  });
  assert.deepEqual(
    optedIn.sort(),
    [
      '`customer-home-jobs-${colorScheme}`',
      '`worker-home-jobs-${colorScheme}`',
      '`worker-results-jobs-${colorScheme}`',
      '`worker-submit-bid-${colorScheme}`',
    ],
    '`jobs: true` appears on an entry outside the allow-list'
  );

  // …and it is that entry, bounded by its own braces, so a `jobs: true` that
  // drifted onto some other target could never satisfy the assertion above by
  // standing in for this one.
  const start = code.indexOf('name: `customer-home-jobs-${colorScheme}`');
  assert.ok(start > -1, 'the populated Home target is gone from the registry');
  const entry = code.slice(start, code.indexOf('},', start));
  assert.match(entry, /mode: 'customer',/);
  assert.match(entry, /jobs: true,/);

  // The wait is the LAST seeded card's title, read from the data rather than
  // restated as a literal: text only a populated card draws, so a target that
  // failed to populate fails loudly instead of photographing the empty state
  // and passing — and taken from the END of the list, so a feed that arrives
  // short fails too rather than being photographed short.
  assert.match(entry, /wait: SEEDED_JOBS\[SEEDED_JOBS\.length - 1\]\.title,/);

  // Both stub branches are guarded by the flag, and the flag is read off the
  // registry entry — which is what makes "every other target still gets the
  // empty answer" a fact rather than an intention.
  assert.match(code, /if \(jobs && pathname\.endsWith\('\/rest\/v1\/jobs'\)/);
  assert.match(code, /if \(jobs && pathname\.endsWith\('\/rest\/v1\/rpc\/job_offer_counts'\)/);
  assert.match(code, /jobs: shot\.jobs === true,/);
});

// RUN n2 — THE SIGNED-OUT AND NOT-YET-SET-UP TREES, AND THE TWO OPT-OUTS
// THAT REACH THEM.
test('the auth and setup targets are listed, both schemes, and reach their trees by the two landing opt-outs', async () => {
  const names = registry();
  for (const scheme of ['dark', 'light']) {
    for (const surface of [
      'welcome',
      'signin',
      'email-signin',
      'create-account',
      'email-create-account',
      'setup',
    ]) {
      assert.ok(names.includes(`auth-${surface}-${scheme}`), `no auth-${surface}-${scheme} target`);
    }
  }

  // The opt-outs are read off the registry entry the way `jobs` is, and only
  // an explicit `false` opts out — so every entry that predates them keeps
  // the seeding it always had, which is the byte-identity promise for their
  // PNGs. seedPage() then honours each flag at the key it governs: no
  // session means none of the three keys; no setup means no setup record.
  const code = codeOnly(await read('scripts/shots.mjs'));
  assert.match(code, /session: shot\.session !== false,/);
  assert.match(code, /setup: shot\.setup !== false,/);
  assert.match(code, /function seedPage\(\{ mode, url, key, sessionKey, userId, session, setup \}\)/);
  assert.match(code, /if \(!session\) return;/);
  assert.match(code, /if \(setup\) \{\s*window\.localStorage\.setItem\(\s*`brazos\.setup\.v1\.\$\{userId\}`/);

  // Every locator the auth recipes introduce is a string the app renders —
  // a renamed button is an offline failure here, not a timeout minutes into
  // a capture run.
  const [welcome, signIn, createAccount, authButton, setup] = await Promise.all([
    read('screens/WelcomeScreen.tsx'),
    read('screens/SignInScreen.tsx'),
    read('screens/CreateAccountScreen.tsx'),
    read('components/AuthButton.tsx'),
    read('screens/SetupScreen.tsx'),
  ]);
  // `press` matches the accessibility label, which AuthButton sets to its title.
  assert.match(codeOnly(authButton), /accessibilityLabel=\{title\}/);
  assert.match(codeOnly(welcome), /title="Continue with phone"/);
  assert.match(codeOnly(welcome), /title="I already have an account"/);
  assert.match(codeOnly(signIn), /title="Use Email Instead"/);
  assert.match(codeOnly(createAccount), /title="Use Email Instead"/);
  assert.match(codeOnly(setup), />FINAL SETUP</);
});

// RUN n5 — SUBMIT BID, THE COMPOSER'S HOST, AND THE ONE-ROW READ THAT KEEPS
// THE WORKER'S JOB DETAIL ON THE JOB IT PAINTED.
test('the Submit Bid targets are listed, both schemes, reach the composer through a visible card, and the by-id read is answered from the seeded rows', async () => {
  const names = registry();
  for (const scheme of ['dark', 'light']) {
    assert.ok(names.includes(`worker-submit-bid-${scheme}`), `no worker-submit-bid-${scheme} target`);
  }

  const code = codeOnly(await read('scripts/shots.mjs'));
  const start = code.indexOf('name: `worker-submit-bid-${colorScheme}`');
  assert.ok(start > -1, 'the Submit Bid target is gone from the registry');
  const waitAt = code.indexOf('wait:', start);
  assert.ok(waitAt > start, 'the Submit Bid target has no wait');
  const entry = code.slice(start, code.indexOf('\n', waitAt));
  assert.match(entry, /mode: 'worker',/);
  assert.match(entry, /jobs: true,/);
  // The card is tapped on Worker Home, where it is visible — never after
  // "View all open jobs", where the same title also sits on the hidden Home
  // screen first in the DOM.
  assert.match(entry, /\{ press: SEEDED_JOBS\[0\]\.title \}/);
  assert.doesNotMatch(entry, /View all open jobs/);
  assert.match(entry, /\{ press: 'Write a bid' \}/);
  assert.match(entry, /wait: 'When can you start',/);

  // Every locator is a string the app renders.
  const [card, detail, composer] = await Promise.all([
    read('components/WorkerJobCard.tsx'),
    read('screens/JobDetailScreen.tsx'),
    read('components/OfferComposer.tsx'),
  ]);
  assert.match(codeOnly(card), /accessibilityLabel=\{job\.title\}/);
  assert.match(codeOnly(detail), /title="Write a bid"/);
  assert.match(codeOnly(composer), />When can you start</);

  // The one-row read: flag-guarded, answered from the same rows, and only for
  // an id among them — anything else falls through to the empty answer.
  assert.match(
    code,
    /if \(jobs && pathname\.endsWith\('\/rest\/v1\/jobs'\) && \(query\.get\('id'\) \?\? ''\)\.startsWith\('eq\.'\)\)/
  );
  assert.match(code, /seededJobRows\(\)\.find\(\(seed\) => seed\.id === wanted\)/);
});

// RUN figma-extract — THE STATE VARIANTS: worker Home ONLINE by the profile
// fixture, and the two populated worker surfaces the seeded rows reach. Each
// entry's wait is text ONLY its state renders, so a variant that failed to
// take its state fails loudly instead of photographing the baseline.
test('the state variants are listed, both schemes, each proven by text only its state renders', async () => {
  const names = registry();
  for (const scheme of ['dark', 'light']) {
    for (const surface of ['worker-home-online', 'worker-home-jobs', 'worker-results-jobs']) {
      assert.ok(names.includes(`${surface}-${scheme}`), `no ${surface}-${scheme} target`);
    }
  }

  const code = codeOnly(await read('scripts/shots.mjs'));
  // Name through wait, so a recipe's own braces cannot end the slice early.
  const entryOf = (name) => {
    const start = code.indexOf(`name: \`${name}-\${colorScheme}\``);
    assert.ok(start > -1, `the ${name} target is gone from the registry`);
    const waitAt = code.indexOf('wait:', start);
    assert.ok(waitAt > start, `the ${name} target has no wait`);
    return code.slice(start, code.indexOf('\n', waitAt));
  };

  // The availability fixture: read off the entry the way `jobs` is, answered
  // by the profile fixture as a boolean and nothing else, and `true` only on
  // the ONLINE entry — so the OFFLINE baseline every worker target has always
  // photographed keeps its fixture, and its PNG.
  assert.match(code, /accepting: shot\.accepting === true,/);
  assert.match(code, /accepting_work: accepting === true,/);
  const optedIn = [...code.matchAll(/accepting:\s*true/g)].map((match) => {
    const nameAt = code.lastIndexOf('name:', match.index);
    return code.slice(nameAt, code.indexOf('\n', nameAt)).replace(/^name:\s*/, '').replace(/,\s*$/, '');
  });
  assert.deepEqual(optedIn, ['`worker-home-online-${colorScheme}`']);

  // Both availability states are proven by the status word, which the screen
  // renders from the one accepting_work fact; the baseline entry proves
  // OFFLINE the same way.
  const online = entryOf('worker-home-online');
  assert.match(online, /mode: 'worker',/);
  assert.match(online, /wait: 'Online',/);
  assert.doesNotMatch(online, /jobs: true/);
  assert.match(code, /name: 'worker-home-dark', mode: 'worker', colorScheme: 'dark', wait: 'Offline'/);
  const workerHome = codeOnly(await read('screens/WorkerHomeScreen.tsx'));
  assert.match(workerHome, /\{accepting \? 'Online' : 'Offline'\}/);
  assert.match(workerHome, /const accepting = profile\?\.accepting_work \?\? true;/);
  assert.match(workerHome, /const PREVIEW_COUNT = 3;/);

  // The populated worker Home waits on the LAST card its three-card preview
  // draws; the populated list waits on the FOURTH title, which the hidden
  // Home beneath it never spells.
  const homeJobs = entryOf('worker-home-jobs');
  assert.match(homeJobs, /mode: 'worker',/);
  assert.match(homeJobs, /jobs: true,/);
  assert.match(homeJobs, /wait: SEEDED_JOBS\[2\]\.title,/);
  const resultsJobs = entryOf('worker-results-jobs');
  assert.match(resultsJobs, /mode: 'worker',/);
  assert.match(resultsJobs, /jobs: true,/);
  assert.match(resultsJobs, /\{ press: 'View all open jobs' \}/);
  assert.match(resultsJobs, /wait: SEEDED_JOBS\[SEEDED_JOBS\.length - 1\]\.title,/);
  assert.match(workerHome, /accessibilityLabel="View all open jobs"/);
  const seeded = code.slice(code.indexOf('const SEEDED_JOBS = ['), code.indexOf('\n];', code.indexOf('const SEEDED_JOBS = [')));
  assert.equal((seeded.match(/\n  \{/g) ?? []).length, 4, 'the seeded rows are no longer four');
});
