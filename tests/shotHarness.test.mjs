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
  ]) {
    assert.ok(names.includes(existing), `${existing} disappeared from the registry`);
  }
  // 60 through RUN SHOTS1, plus the two RUN JOBS1 populated-Home targets.
  assert.equal(names.length, 62, `registry is ${names.length} targets, expected 62`);
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
  for (const field of ['name', 'mode', 'colorScheme', 'recipe', 'wait', 'jobs']) {
    assert.ok(
      documented.includes(field),
      `the registry header does not document \`${field}\``
    );
  }

  // OPT-IN, and the opt-in IS the byte-identity guarantee: exactly one
  // occurrence in code — the single flatMap entry that produces both schemes.
  // Comments are stripped first, so the prose explaining the flag cannot be
  // what satisfies this.
  const code = codeOnly(harness);
  assert.equal(
    (code.match(/jobs:\s*true/g) ?? []).length,
    1,
    '`jobs: true` appears on more than the one opted-in registry entry'
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
