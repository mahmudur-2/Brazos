import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

// ---------------------------------------------------------------------------
// 4D-3 — conversion and rebook. §3 post flow, §4 rebook, §5 compare bids,
// §6 worker-side conversion. Pure lib modules are EXECUTED (the moneyCeiling
// pattern); screen wiring that node cannot render is pinned against source.
// ---------------------------------------------------------------------------

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

/** lib/jobs.ts's REAL formatBudget, extracted verbatim at test time so money
 *  strings asserted here are the ones users see. */
const formatBudgetSource = (async () => {
  const jobsJs = stripTypeScriptTypes(await read('lib/jobs.ts'), { mode: 'strip' });
  const start = jobsJs.indexOf('export function formatBudget');
  const end = jobsJs.indexOf('\n}', start);
  assert.ok(start > 0 && end > start, 'formatBudget must exist in lib/jobs.ts');
  return jobsJs.slice(start, end + 2);
})();

/** Execute a lib module, replacing its `import ... from './jobs'` line (if
 *  any) with the real formatBudget so the module stays pure and runnable. */
async function importLibModule(path) {
  const js = stripTypeScriptTypes(await read(path), { mode: 'strip' });
  const inlined = js.replace(
    /import \{ formatBudget \} from '\.\/jobs';/,
    () => '',
  );
  const withHelper = inlined.includes('formatBudget')
    ? `${await formatBudgetSource}\n${inlined}`
    : inlined;
  assert.ok(!withHelper.includes("from './jobs'"), `${path}: the jobs import must be inlined`);
  return import(toDataUrl(withHelper));
}

const skillCategoriesModule = importLibModule('lib/skillCategories.ts');
const priceGuidanceModule = importLibModule('lib/priceGuidance.ts');
const validationModule = importLibModule('lib/validation.ts');

// ---------------------------------------------------------------------------
// §3.1 — the static price table, keyed by the real category list
// ---------------------------------------------------------------------------

test('§3.1 · every skill category resolves to a range or an explicit null', async () => {
  const { SKILL_CATEGORIES } = await skillCategoriesModule;
  const { PRICE_GUIDANCE, priceGuidanceFor } = await priceGuidanceModule;

  assert.equal(SKILL_CATEGORIES.length, 10, 'the §1.2 list is the ten skill keys');

  const expectedNulls = new Set(['dog_walking', 'packing']);
  for (const { key } of SKILL_CATEGORIES) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(PRICE_GUIDANCE, key),
      `category "${key}" must be an explicit table entry, range or null`
    );
    const range = priceGuidanceFor(key);
    if (expectedNulls.has(key)) {
      assert.equal(range, null, `"${key}" has no seeded range and must stay null`);
    } else {
      assert.ok(range, `"${key}" must carry a seeded range`);
    }
  }

  const actualNulls = Object.entries(PRICE_GUIDANCE)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
    .sort();
  assert.deepEqual(actualNulls, [...expectedNulls].sort(), 'exactly the reported nulls');

  // 'other' is a JOB_CATEGORIES-only key — absent from the table, null from
  // the lookup, so the post flow's eleventh chip renders no guidance.
  assert.equal(priceGuidanceFor('other'), null);
  assert.equal(priceGuidanceFor(null), null);
  assert.equal(priceGuidanceFor('not-a-category'), null);
});

test('§3.1 · every range is ordered and inside the phase75 money ceiling', async () => {
  const { PRICE_GUIDANCE } = await priceGuidanceModule;
  const { MONEY_CEILING_CENTS } = await validationModule;

  for (const [key, range] of Object.entries(PRICE_GUIDANCE)) {
    if (range === null) continue;
    assert.ok(Number.isInteger(range.minCents) && Number.isInteger(range.maxCents), key);
    assert.ok(range.minCents > 0, `${key}: min must be positive cents`);
    assert.ok(range.minCents < range.maxCents, `${key}: min must be strictly under max`);
    assert.ok(range.maxCents <= MONEY_CEILING_CENTS, `${key}: max must be under the ceiling`);
  }
});

test('§3.2 · the guidance copy is exact, formatBudget-formatted, and claims no locality', async () => {
  const { SKILL_CATEGORIES } = await skillCategoriesModule;
  const { priceGuidanceLines } = await priceGuidanceModule;

  const cleaning = priceGuidanceLines('cleaning');
  assert.ok(cleaning);
  assert.equal(cleaning[0], 'Typical range: $60–$120');
  assert.equal(cleaning[1], 'A guide, not a quote. You set the budget.');

  for (const { key } of SKILL_CATEGORIES) {
    const lines = priceGuidanceLines(key);
    if (!lines) continue;
    const joined = lines.join(' ');
    assert.match(lines[0], /^Typical range: \$[\d,]+–\$[\d,]+$/);
    assert.doesNotMatch(
      joined,
      /\b(here|nearby|in your area|near you|local|locally|around you)\b/i,
      `${key}: a static table cannot support a locality claim`
    );
  }

  assert.equal(priceGuidanceLines('dog_walking'), null, 'a null category renders NO guidance');
});

// ---------------------------------------------------------------------------
// §3.3 — the 20-trimmed-character description floor
// ---------------------------------------------------------------------------

test('§3.3 · the floor is 20 trimmed characters — 19 fails, 20 passes', async () => {
  const { JOB_DESCRIPTION_MIN_CHARS, descriptionCharsNeeded } = await validationModule;

  assert.equal(JOB_DESCRIPTION_MIN_CHARS, 20);
  assert.equal(descriptionCharsNeeded('a'.repeat(19)), 1, '19 characters fails');
  assert.equal(descriptionCharsNeeded('a'.repeat(20)), 0, '20 characters passes');
  assert.equal(
    descriptionCharsNeeded(`   ${'a'.repeat(19)}   `),
    1,
    'whitespace padding cannot buy the last character'
  );
  assert.equal(descriptionCharsNeeded(''), 20);
  assert.equal(descriptionCharsNeeded('a'.repeat(500)), 0);
});

test('§3.3 · the advance control is disabled by the floor, with the written count [static]', async () => {
  const screen = await read('screens/PostJobScreen.tsx');

  // The footer button's disabled expression carries the floor…
  assert.match(screen, /disabled=\{uploadingPhoto \|\| uploadingVideo \|\| \(step === 0 && descNeeded > 0\)\}/);
  // …and the count is written next to the field, never a raw error.
  assert.match(screen, /more \{descNeeded === 1 \? 'character' : 'characters'\} needed/);
});

// ---------------------------------------------------------------------------
// §3.4 — the photo nudge is a nudge, not a gate
// ---------------------------------------------------------------------------

test('§3.4 · the nudge renders, dismisses per-draft, and never blocks advancing [static]', async () => {
  const screen = await read('screens/PostJobScreen.tsx');
  const draft = await read('lib/postJobDraft.ts');

  assert.match(screen, /Jobs with a photo get more bids\./);
  assert.match(screen, /setPhotoNudgeDismissed\(true\)/, 'the nudge is dismissible');

  // The advance control's disabled expression must not mention the nudge or
  // the photo count — advancing with zero photos stays possible.
  const disabledExpr = screen.match(/disabled=\{uploadingPhoto[^}]*\}/)?.[0] ?? '';
  assert.ok(disabledExpr.length > 0, 'the footer disabled expression exists');
  assert.ok(!disabledExpr.includes('photoNudge'), 'nudge state cannot gate advancing');
  assert.ok(!disabledExpr.includes('photos.length'), 'photo count cannot gate advancing');

  // Dismissal is stored ON THE DRAFT (dies with it), not in a global setting.
  assert.match(draft, /photoNudgeDismissed: boolean/);
  assert.match(draft, /photoNudgeDismissed: parsed\.photoNudgeDismissed === true/);
  assert.ok(
    !draft.includes('brazos.photoNudge'),
    'no dedicated global storage key for the nudge'
  );
});

// ---------------------------------------------------------------------------
// §3.2 — guidance visibility predicate (empty or unfocused, fresh posts only)
// ---------------------------------------------------------------------------

test('§3.2 · guidance shows only for a seeded category while the budget is empty or unfocused [static]', async () => {
  const screen = await read('screens/PostJobScreen.tsx');

  assert.match(screen, /const guidanceLines = isFreshPost \? priceGuidanceLines\(category\) : null;/);
  assert.match(screen, /\(bothBudgetsEmpty \|\| !budgetFocused\)/);
});
