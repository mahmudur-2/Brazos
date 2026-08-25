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
  ]) {
    assert.ok(names.includes(existing), `${existing} disappeared from the registry`);
  }
  assert.equal(names.length, 16, `registry is ${names.length} targets, expected 16`);
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
  assert.match(harness, /recipe: TO_WORKER_SEARCH,\s*\n\s*wait: 'No workers matched',/);
});

test('every locator that recipe introduces is a string the app renders', async () => {
  const [home, sheet, categories, search] = await Promise.all([
    read('screens/HomeScreen.tsx'),
    read('components/ServicePickerSheet.tsx'),
    read('lib/skillCategories.ts'),
    read('screens/WorkerSearchScreen.tsx'),
  ]);

  // `press` matches an accessibility label; `expect`/`pressText` match rendered
  // text. Each locator is checked against the file that actually carries it.
  assert.match(codeOnly(home), /accessibilityLabel="Other services"/);
  assert.match(codeOnly(home), /title="All services"/);
  assert.match(codeOnly(sheet), /accessibilityLabel=\{service\.label\}/);
  assert.match(codeOnly(search), /title="No workers matched"/);

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
