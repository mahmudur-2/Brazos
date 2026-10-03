import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * 2026-09-19 — THE WORKER FILTER'S RULES, EXECUTED.
 *
 * The operator ruled the five sorts, the date window, the Custom lists and
 * the chip names on the Map mockups (docs/mockups/html/map-explore-filters-*).
 * Each ruling is a sentence in docs/DECISIONS.md; each sentence is a test
 * here, run against the real lib/jobFilters.ts and lib/discoveryFilter.ts.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');
// F19: lib/jobFilters.ts formats its day word through lib/time.ts. node resolves
// relative specifiers literally, so the module runs from a data URL with that one
// value import pointed at the file (lib/time.ts imports nothing).
const jobFiltersUrl =
  'data:text/javascript;charset=utf-8;base64,' +
  Buffer.from(
    (await import('node:module'))
      .stripTypeScriptTypes(await readFile(new URL('../lib/jobFilters.ts', import.meta.url), 'utf8'), { mode: 'strip' })
      .replace("from './time'", `from '${new URL('../lib/time.ts', import.meta.url).href}'`),
    'utf8',
  ).toString('base64');

const {
  DEFAULT_JOB_FILTERS,
  JOB_SORTS,
  BUDGET_FILTER_MAX_CENTS,
  BUDGET_FILTER_PRESETS_CENTS,
  BUDGET_CUSTOM_VALUES_CENTS,
  applyJobFilters,
  completedByCategory,
  customDateKeys,
  dateWindowPreset,
  localDateKeyAfter,
  isDefaultJobFilters,
  activeJobFilterCount,
} = await import(jobFiltersUrl);
const { DISTANCE_CUSTOM_VALUES, DISTANCE_FILTER_MAX, DISTANCE_FILTER_OPTIONS, isDistanceFilterMiles, distanceChipLabel } =
  await import(pathToFileURL(join(root, 'lib/discoveryFilter.ts')).href);
// lib/jobs.ts reaches ui/tokens without an extension, which node's loader
// refuses, so its two tables are read from the source (the way every other
// fence reads it).
const jobsSource = await read('lib/jobs.ts');
const listOf = (name) => {
  const block = new RegExp('export const ' + name + '[^=]*= \\[([^\\]]*)\\]').exec(jobsSource)?.[1] ?? '';
  return [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};
const JOB_CATEGORIES = listOf('JOB_CATEGORIES');
const JOB_CATEGORY_CHIP_ORDER = listOf('JOB_CATEGORY_CHIP_ORDER');
const JOB_CATEGORY_CHIP_LABELS = Object.fromEntries(
  [...(/export const JOB_CATEGORY_CHIP_LABELS[^{]*\{([^}]*)\}/.exec(jobsSource)?.[1] ?? '').matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]),
);

const job = (id, o = {}) => ({
  id,
  client_id: 'c',
  title: id,
  description: '',
  category: o.category ?? 'other',
  location: null,
  budget_cents: o.budget_cents ?? null,
  budget_min_cents: null,
  budget_max_cents: o.budget_max_cents ?? null,
  pricing_mode: 'open_bids',
  scheduled_date: o.scheduled_date ?? null,
  arrival_start_hour: null,
  arrival_end_hour: null,
  status: 'open',
  created_at: o.created_at ?? '2026-09-10T00:00:00Z',
  photos: [],
  videos: [],
  ...(o.distance_miles != null ? { distance_miles: o.distance_miles } : {}),
});
const ids = (rows) => rows.map((r) => r.id);

// ---------------------------------------------------------------------------
// The sorts
// ---------------------------------------------------------------------------

test('the sheet lists six sorts in the ruled order, Smart Match first and default, Reset last', () => {
  // 2026-09-21: 'reset' — the latest job added first and nothing else — is
  // the sixth and last (DECISIONS 2026-09-20 sitting 3, (7)).
  assert.deepEqual([...JOB_SORTS], ['smart', 'newest', 'pay', 'distance', 'bids', 'reset']);
  assert.equal(DEFAULT_JOB_FILTERS.sort, 'smart');
  assert.equal(DEFAULT_JOB_FILTERS.scheduledUntil, null);
  assert.equal(isDefaultJobFilters(DEFAULT_JOB_FILTERS), true);
  assert.equal(activeJobFilterCount({ ...DEFAULT_JOB_FILTERS, sort: 'newest' }), 1, 'any other sort counts as a filter');
});

test('newest: dated jobs first, soonest first; then the undated, newest-posted first', () => {
  const rows = [
    job('undated-old', { created_at: '2026-09-01T00:00:00Z' }),
    job('sat', { scheduled_date: '2026-09-26', created_at: '2026-09-02T00:00:00Z' }),
    job('undated-new', { created_at: '2026-09-18T00:00:00Z' }),
    job('mon', { scheduled_date: '2026-09-21', created_at: '2026-09-01T00:00:00Z' }),
    job('mon-later-post', { scheduled_date: '2026-09-21', created_at: '2026-09-15T00:00:00Z' }),
  ];
  assert.deepEqual(ids(applyJobFilters(rows, { ...DEFAULT_JOB_FILTERS, sort: 'newest' })), [
    'mon-later-post', 'mon', 'sat', 'undated-new', 'undated-old',
  ]);
});

test('reset: the latest job added first and nothing else — no date, no skill, no distance', () => {
  const rows = [
    job('dated-soon', { scheduled_date: '2026-09-21', created_at: '2026-09-01T00:00:00Z', distance_miles: 0.5 }),
    job('newest-posted', { created_at: '2026-09-18T00:00:00Z', distance_miles: 40 }),
    job('middle', { scheduled_date: '2026-10-30', created_at: '2026-09-10T00:00:00Z' }),
  ];
  assert.deepEqual(ids(applyJobFilters(rows, { ...DEFAULT_JOB_FILTERS, sort: 'reset' })), [
    'newest-posted', 'middle', 'dated-soon',
  ]);
});

test('fewest bids: fewest live offers first, ties by distance, then the newest rule', () => {
  const rows = [
    job('busy-near', { distance_miles: 1 }),
    job('quiet-far', { distance_miles: 9 }),
    job('quiet-near', { distance_miles: 2 }),
    job('quiet-unknown'),
  ];
  const offerCounts = { 'busy-near': 5, 'quiet-far': 0, 'quiet-near': 0 };
  assert.deepEqual(ids(applyJobFilters(rows, { ...DEFAULT_JOB_FILTERS, sort: 'bids' }, { offerCounts })), [
    'quiet-near', 'quiet-far', 'quiet-unknown', 'busy-near',
  ]);
  // Without counts every job ties at zero and the tie-breakers decide.
  assert.deepEqual(ids(applyJobFilters(rows, { ...DEFAULT_JOB_FILTERS, sort: 'bids' })), [
    'busy-near', 'quiet-near', 'quiet-far', 'quiet-unknown',
  ]);
});

test('smart match: strongest categories first, then other skills, then the rest', () => {
  const rows = [
    job('other-near', { category: 'other', distance_miles: 0.5 }),
    job('paint', { category: 'painting', distance_miles: 3 }),
    job('clean-far', { category: 'cleaning', distance_miles: 8 }),
    job('clean-near', { category: 'cleaning', distance_miles: 2 }),
    job('assemble', { category: 'furniture_assembly', distance_miles: 6 }),
  ];
  const context = {
    skills: new Set(['cleaning', 'furniture_assembly', 'painting']),
    completedByCategory: { cleaning: 4, furniture_assembly: 1 },
  };
  assert.deepEqual(ids(applyJobFilters(rows, DEFAULT_JOB_FILTERS, context)), [
    'clean-near', 'clean-far', // most completed, closest first inside
    'assemble', // completed once
    'paint', // a skill with no completions
    'other-near', // not a skill, however close
  ]);
  // No context at all: Smart Match IS the newest rule.
  const undated = [job('a', { created_at: '2026-09-01T00:00:00Z' }), job('b', { created_at: '2026-09-09T00:00:00Z' })];
  assert.deepEqual(ids(applyJobFilters(undated, DEFAULT_JOB_FILTERS)), ['b', 'a']);
});

test('completedByCategory counts only jobs that reached completed', () => {
  const counts = completedByCategory([
    { category: 'cleaning', status: 'completed' },
    { category: 'cleaning', status: 'completed' },
    { category: 'cleaning', status: 'in_progress' },
    { category: 'moving', status: 'completed' },
  ]);
  assert.deepEqual(counts, { cleaning: 2, moving: 1 });
});

// ---------------------------------------------------------------------------
// The date window
// ---------------------------------------------------------------------------

test('a window keeps dated jobs inside it, inclusive, and never an undated one', () => {
  const rows = [
    job('fri', { scheduled_date: '2026-09-18' }),
    job('sat', { scheduled_date: '2026-09-19' }),
    job('thu', { scheduled_date: '2026-09-24' }),
    job('next', { scheduled_date: '2026-09-25' }),
    job('undated'),
  ];
  const week = { ...DEFAULT_JOB_FILTERS, scheduledOn: '2026-09-19', scheduledUntil: '2026-09-24' };
  assert.deepEqual(ids(applyJobFilters(rows, week)).sort(), ['sat', 'thu']);
  const oneDay = { ...DEFAULT_JOB_FILTERS, scheduledOn: '2026-09-24', scheduledUntil: null };
  assert.deepEqual(ids(applyJobFilters(rows, oneDay)), ['thu']);
});

test('the When presets and the Custom date list are built from the caller’s day', () => {
  const sat = new Date(2026, 8, 19);
  assert.deepEqual(dateWindowPreset('today', sat), { scheduledOn: '2026-09-19', scheduledUntil: null });
  assert.deepEqual(dateWindowPreset('tomorrow', sat), { scheduledOn: '2026-09-20', scheduledUntil: null });
  assert.deepEqual(dateWindowPreset('week', sat), { scheduledOn: '2026-09-19', scheduledUntil: '2026-09-25' });
  const keys = customDateKeys(sat);
  assert.equal(keys.length, 30);
  assert.equal(keys[0], '2026-09-20', 'the list starts tomorrow — Today and Tomorrow are pills');
  assert.equal(keys[29], '2026-10-19');
  assert.equal(localDateKeyAfter(new Date(2026, 11, 31), 1), '2027-01-01', 'crosses a year without a timezone');
});

// ---------------------------------------------------------------------------
// The Custom lists and the chips
// ---------------------------------------------------------------------------

test('distance: the ruled steps, 1 to 3,000, every value a valid radius', () => {
  const v = DISTANCE_CUSTOM_VALUES;
  assert.equal(v.length, 34); // 10 + 8 + 5 + 9 + 2
  assert.deepEqual(v.slice(0, 11), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15]);
  assert.deepEqual(v.filter((m) => m > 45 && m < 70), [50, 60]);
  assert.deepEqual(v.filter((m) => m >= 100 && m <= 300), [100, 200, 300]);
  assert.deepEqual(v.slice(-3), [1000, 2000, 3000]);
  assert.equal(DISTANCE_FILTER_MAX, 3000);
  for (const m of v) assert.ok(isDistanceFilterMiles(m), `${m} must validate`);
  for (const m of DISTANCE_FILTER_OPTIONS) assert.ok(v.includes(m), `preset ${m} must be on the list`);
  assert.equal(distanceChipLabel(3000), '3,000 mi');
});

test('budget: the ruled steps, $5 to $10,000', () => {
  const dollars = BUDGET_CUSTOM_VALUES_CENTS.map((c) => c / 100);
  assert.equal(dollars.length, 126); // 10 + 5 + 16 + 95
  assert.deepEqual(dollars.slice(0, 3), [5, 10, 15]);
  assert.deepEqual(dollars.filter((d) => d >= 45 && d <= 70), [45, 50, 60, 70]);
  assert.deepEqual(dollars.filter((d) => d >= 100 && d <= 150), [100, 125, 150]);
  assert.deepEqual(dollars.filter((d) => d >= 500 && d <= 700), [500, 600, 700]);
  assert.equal(dollars[dollars.length - 1], 10_000);
  assert.equal(BUDGET_FILTER_MAX_CENTS, 1_000_000);
  assert.deepEqual([...BUDGET_FILTER_PRESETS_CENTS], [2_500, 5_000, 10_000, 25_000]);
  for (const c of BUDGET_CUSTOM_VALUES_CENTS) assert.ok(Number.isInteger(c) && c <= BUDGET_FILTER_MAX_CENTS);
});

test('the chips name the eleven real categories, once each, in the ruled order', () => {
  assert.deepEqual([...JOB_CATEGORY_CHIP_ORDER].sort(), [...JOB_CATEGORIES].sort(), 'every category, no extras');
  assert.deepEqual(
    JOB_CATEGORY_CHIP_ORDER.map((k) => JOB_CATEGORY_CHIP_LABELS[k]),
    ['Assembly', 'Moving', 'Cleaning', 'TV mounting', 'Handyman / Repairs', 'Yard work', 'Painting', 'Packing', 'Pet care', 'Errands', 'Other'],
  );
});

// ---------------------------------------------------------------------------
// The server keeps up
// ---------------------------------------------------------------------------

test('the radius RPC’s clamp rose to 3,000 in an additive migration that restates its grants', async () => {
  const sql = await read('supabase/migrations/20260930000500_radius_cap_3000.sql');
  assert.match(sql, /least\(greatest\(coalesce\(nullif\(p_radius_miles, 0\), 25\), 0\.5\), 3000\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION "public"\."jobs_within_radius"/);
  assert.doesNotMatch(sql, /drop |rename |truncate |delete from/i, 'additive: nothing the pipeline’s destructive scan stops on');
  assert.match(sql, /REVOKE ALL ON FUNCTION "public"\."jobs_within_radius"[^;]*FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION "public"\."jobs_within_radius"[^;]*TO authenticated;/);
  assert.match(sql, /SECURITY DEFINER/);
  // The client's ceiling and the server's clamp are one number.
  assert.match(sql, new RegExp(`0\\.5\\), ${DISTANCE_FILTER_MAX}\\)`));
});

// ---------------------------------------------------------------------------
// The card's day word (2026-09-19, the Map design's "Assembly · Today").
// ---------------------------------------------------------------------------
const { scheduledDayLabel, localDateKey } = await import(jobFiltersUrl);

test('the day word is Today, Tmrw, the short date, or nothing — in the local calendar', () => {
  const now = new Date(2026, 8, 19, 22, 30); // late evening, so UTC would already be the 20th
  assert.equal(scheduledDayLabel(localDateKey(now), now), 'Today');
  // Short, by the 2026-09-20 ruling: the row may not grow a line and the
  // day may not reach the pay column.
  assert.equal(scheduledDayLabel(localDateKeyAfter(now, 1), now), 'Tmrw');
  assert.equal(scheduledDayLabel('2026-09-26', now), 'Sep 26');
  // No date is no word — never a guess — and a malformed key is treated the same.
  assert.equal(scheduledDayLabel(null, now), null);
  assert.equal(scheduledDayLabel('not-a-date', now), null);
  // The word and the Today filter agree on what today is: the same key function.
  assert.equal(scheduledDayLabel(dateWindowPreset('today', now).scheduledOn, now), 'Today');
  assert.equal(scheduledDayLabel(dateWindowPreset('tomorrow', now).scheduledOn, now), 'Tmrw');
});

// ---------------------------------------------------------------------------
// The peek row's location (2026-09-20): the neighbourhood alone.
// ---------------------------------------------------------------------------
const { neighbourhoodLabel, publicLocationLabel } = await import(pathToFileURL(join(root, 'lib/locationPrivacy.ts')).href);

test('the neighbourhood is the public label cut at its first comma, never something more precise', () => {
  assert.equal(neighbourhoodLabel('Brighton Beach, Brooklyn, NY'), 'Brighton Beach');
  assert.equal(neighbourhoodLabel('Bedford-Stuyvesant, Brooklyn'), 'Bedford-Stuyvesant');
  assert.equal(neighbourhoodLabel('Downtown'), 'Downtown');
  assert.equal(neighbourhoodLabel(', Brooklyn'), ', Brooklyn', 'an empty first part keeps the label');
  assert.equal(neighbourhoodLabel(null), null);
  // Coordinates never become a label here either: the same refusal publicLocationLabel makes.
  assert.equal(publicLocationLabel('40.6265, -73.9465'), null);
  assert.equal(neighbourhoodLabel('40.6265, -73.9465'), null);
});

// ---------------------------------------------------------------------------
// THE FILTERS SHEET (2026-09-19) — static: the approved design's rows are the
// ruled values from lib, never a typed list, and the sheet's mechanics hold.
// ---------------------------------------------------------------------------
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('the Filters sheet draws the five rows from the ruled lists, and every close applies the draft', async () => {
  const sheet = stripComments(await read('components/JobFilterSheet.tsx'));
  const popover = stripComments(await read('components/PickerPopover.tsx'));

  // THE ROWS, in the design's order, each labelled as the design labels it.
  const labels = [...sheet.matchAll(/<Section\s+label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(labels, ['Distance', 'Minimum budget', 'When', 'Categories', 'Sort']);

  // THE VALUES COME FROM LIB — presets and Custom lists alike — so a pill can
  // never offer a number the filter or the server would not accept.
  for (const name of [
    'DISTANCE_FILTER_OPTIONS',
    'DISTANCE_CUSTOM_VALUES',
    'BUDGET_FILTER_PRESETS_CENTS',
    'BUDGET_CUSTOM_VALUES_CENTS',
    'customDateKeys',
    'dateWindowPreset',
    'JOB_CATEGORY_CHIP_ORDER',
    'JOB_CATEGORY_CHIP_LABELS',
    'JOB_SORTS',
  ]) {
    assert.ok(sheet.includes(name), `the sheet must read ${name} from lib`);
  }
  assert.doesNotMatch(sheet, /\[\s*2,\s*5,\s*10,\s*25\s*\]|2500|5000|10000/, 'no preset is typed into the sheet');
  // Money through formatBudget only.
  assert.match(sheet, /formatBudget\(cents\)/);
  assert.doesNotMatch(sheet, /toFixed\(2\)|\$\$\{/);

  // THE CUSTOM PILLS wear the value once one is picked, and open the popup.
  assert.match(sheet, /label=\{distanceIsPreset \? 'Custom' : distanceChipLabel\(draftDistance\)\}/);
  assert.match(sheet, /label=\{budgetIsPreset \? 'Custom' : formatBudget\(draft\.minBudgetCents\)\}/);
  assert.match(sheet, /shortDate\(draft\.scheduledOn\)/);
  // ONE popup (2026-09-20), in the Sheet's overlay, fed by whichever pill
  // opened it — four popups in four nested Modals showed the first one's
  // list under every pill on the phone. The date and sort popups open
  // upward, as the design draws them.
  assert.equal((sheet.match(/<PickerPopover/g) ?? []).length, 1, 'one popup, in the overlay');
  assert.match(sheet, /overlay=\{\s*<PickerPopover/);
  assert.match(sheet, /const openKind = popover\?\.kind \?\? lastKindRef\.current;/);
  assert.equal((sheet.match(/direction: 'up' as const/g) ?? []).length, 2);
  assert.equal((sheet.match(/direction: 'down' as const/g) ?? []).length, 2);
  // The sheet's own design props: 28pt corners, the sage hairline in dark,
  // the actions pinned as the footer, the When row scrolling.
  assert.match(sheet, /topRadius=\{SHEET_TOP_RADIUS\}/);
  assert.match(sheet, /hairline=\{isDark \? withAlpha\(paneRim, SHEET_HAIRLINE_ALPHA\) : undefined\}/);
  assert.match(sheet, /footer=\{actions\}/);
  // 2026-09-20 (sitting 2): the rim rings the top edge only (the operator's
  // "no outline on the sides / bottom"), the hairline at 0.20 with recipe D.
  assert.match(sheet, /const SHEET_EDGE = 'top' as const;/);
  assert.match(sheet, /const SHEET_HAIRLINE_ALPHA = 0\.2;/);
  assert.match(sheet, /edge=\{SHEET_EDGE\}/);
  // The same sitting: Distance, Minimum budget and When FILL their row (one
  // rule — each pill keeps its label width, the spare room is shared, a row
  // wider than the sheet scrolls, never wraps); Categories scrolls; Sort's one
  // pill never grows.
  assert.match(sheet, /<Section label="Distance" fill /);
  assert.match(sheet, /<Section label="Minimum budget" fill /);
  assert.match(sheet, /<Section label="When" fill>/);
  assert.match(sheet, /<Section\s+label="Categories"[\s\S]*?\n\s*scroll\n\s*>/);
  assert.match(sheet, /<Section label="Sort">/);
  assert.match(sheet, /contentContainerStyle=\{\[styles\.scrollRowContent, fill && styles\.fillRowContent\]\}/);
  assert.match(sheet, /fillRowContent: \{\s*flexGrow: 1,\s*\}/);
  assert.match(sheet, /fillCell: \{\s*flexGrow: 1,\s*flexBasis: 'auto',\s*\}/);
  // A fill row is the scrolling row (a horizontal ScrollView), never the wrap row.
  assert.match(sheet, /\{scroll \|\| fill \? \(\s*<ScrollView\s+horizontal/);
  // The Show button is the mockup's capsule in the Post-a-job green.
  assert.match(sheet, /show: \{\s*flex: 1,\s*borderRadius: radius\.pill,\s*backgroundColor: colors\.postPillGreen,\s*\}/);
  // The note tells the worker why My skills is absent.
  assert.match(sheet, /Pick job categories on your profile to filter by your skills\./);
  // The sort popup carries the six rules with their sentences; Reset alone
  // carries a pill wording and is drawn grey.
  for (const sort of JOB_SORTS) {
    assert.ok(
      new RegExp(sort + ": \\{ label: '[^']+', hint: '[^']+'(, pill: '[^']+', muted: true)? \\}").test(sheet),
      `the sheet must name the ${sort} sort with its sentence`
    );
  }
  assert.match(sheet, /hint: 'Matches based on your skills'/);
  // 2026-09-21: the Newest hint, shortened twice on the operator's crops; the
  // Reset row: grey, "Latest added first", the pill "Sort by Latest added".
  assert.match(sheet, /newest: \{ label: 'Newest', hint: 'Earliest jobs first' \}/);
  assert.match(sheet, /reset: \{ label: 'Reset', hint: 'Latest added first', pill: 'Latest added', muted: true \}/);
  assert.match(sheet, /label=\{sortNow\.pill \?\? sortNow\.label\}/);
  assert.match(sheet, /muted: JOB_SORT_LABELS\[sort\]\.muted,/);
  assert.match(popover, /item\.muted && styles\.labelMuted/);
  assert.match(popover, /labelMuted: \{\s*fontWeight: '500',\s*color: colors\.textMuted,\s*\}/);

  // BEST MATCH is the worker's skills, exactly — every one of them and no other.
  assert.match(sheet, /draft\.categories\.size === skills\.size &&\s*\[\.\.\.skills\]\.every\(\(category\) => draft\.categories\.has\(category\)\)/);
  assert.match(sheet, /categories: bestMatchOn \? new Set<JobCategory>\(\) : new Set\(skills\)/);

  // EVERY CLOSE APPLIES: Done and the backdrop go through the same function
  // the button does, and the distance writes only when it changed.
  // 2026-09-28 (LUX-LIST-64 #64, audit M-25) — THE ONE BEND, the operator's:
  // Done (the header's word) and "Show N jobs" still apply the draft; a
  // CANCEL on the header's left discards it, and with it the backdrop and
  // Android's back mean Cancel (ui/primitives/Sheet.tsx `onCancel`).
  assert.match(
    sheet,
    /<Sheet\s+visible=\{visible\}\s+onClose=\{applyAndClose\}\s+dismissWord="Done"\s+onCancel=\{discardAndClose\}\s+title="Filters"\s+material="pane"/
  );
  assert.match(sheet, /function discardAndClose\(\) \{\s*setPopover\(null\);\s*onClose\(\);\s*\}/, 'Cancel applies nothing');
  const primitive = stripComments(await read('ui/primitives/Sheet.tsx'));
  assert.match(primitive, /onPress=\{dismissOnBackdropPress \? onCancel \?\? onClose : undefined\}/);
  assert.match(primitive, /onRequestClose=\{onCancel \?\? onClose\}/);
  // 2026-09-21 — THE SHEET'S TINT IS THE MOCKUP'S GRADIENT: paneFills.filters,
  // drawn by Surface as the tint itself (no scrim, no sheen) — this sheet
  // alone; the values live in ui/tokens.ts, never here.
  assert.match(sheet, /rim=\{paneEdges\.filters\.rim\}\s*fill=\{paneFills\.filters\}/);
  assert.doesNotMatch(sheet, /linear-gradient|#0[0-9A-F]{5}/i, 'no gradient or hex at the call site');
  assert.match(sheet, /<Button title=\{showTitle\} onPress=\{applyAndClose\}/);
  assert.match(sheet, /if \(distance && draftDistance !== distance\.value\) distance\.onChange\(draftDistance\);/);
  // The count is asked of the caller, and "Show jobs" stands in when unknown.
  assert.match(sheet, /count === null \? 'Show jobs' : `Show \$\{count\} \$\{count === 1 \? 'job' : 'jobs'\}`/);

  // THE SELECTED PILL is the emerald tint in both themes (the operator's
  // exception to D6), and only colours fork between them.
  assert.match(sheet, /pillOn: \{\s*backgroundColor: colors\.mint,\s*borderColor: colors\.secondaryBorder,\s*\}/);
  // 2026-09-21: the chosen green is emeraldBright — the mockup's #84dfaa in
  // dark, the emerald in light — at the mockup's own alphas; the tick and
  // the caret wear it too, and `emerald` itself is untouched.
  assert.match(sheet, /pillOnDark: \{\s*backgroundColor: withAlpha\(colors\.emeraldBright, 0\.16\),\s*borderColor: withAlpha\(colors\.emeraldBright, 0\.48\),\s*\}/);
  assert.match(sheet, /pillTextOn: \{\s*fontWeight: '600',\s*color: colors\.emeraldBright,\s*\}/);
  assert.match(sheet, /name="checkmark" size=\{15\} color=\{colors\.emeraldBright\}/);
  assert.match(sheet, /name="chevron-down" size=\{14\} color=\{colors\.emeraldBright\}/);
  const tokens = await read('ui/tokens.ts');
  assert.match(tokens, /emeraldBright: '#84DFAA',/);
  assert.match(tokens, /emeraldBright: '#0D6B52',/);
  assert.match(tokens, /filters: \{\s*angle: 125,\s*from: \{ color: FILTERS_INK_TOP, alpha: 0\.95 \},\s*to: \{ color: FILTERS_INK_BOTTOM, alpha: 0\.91 \},\s*\} as PaneFill,/);
  assert.match(tokens, /const FILTERS_INK_TOP = '#031810';\s*const FILTERS_INK_BOTTOM = '#0A3020';/);

  // THE POPUP renders in the Sheet's overlay — NO Modal of its own, since
  // 2026-09-20 — anchored in window coordinates, opened on the current value
  // three ways, moved by the native driver on DropMenu's own constants.
  // 2026-09-21: FLAT, on the menu material (no sheen, no fill — the operator's
  // "don't add the gradients to the popups"); the rows centred with the tick
  // pinned at the left edge (Sort keeps the left through contentAlign); iOS's
  // own bar, flashed once on open; light-grey dividers; the date popup 192.
  assert.match(sheet, /ref\.current\?\.measureInWindow\(\(x, y, width, height\) => \{/);
  assert.doesNotMatch(popover, /<Modal/, 'a nested Modal is what broke the popups on the phone');
  // Fix run D11: and OPAQUE — the menu's solid fallback, so the rows behind a
  // picker never read through the rows in front (the see-through budget list).
  assert.match(popover, /<Surface material="menu" radius=\{radius\.lg\} corners="all" opaque style=\{styles\.material\}>/);
  assert.doesNotMatch(popover, /material="pane"|fill=\{/, 'the popup never wears the sheet\'s glass or its gradient');
  assert.match(popover, /const TICK_ZONE = TICK_INSET \+ TICK_SIZE;/);
  assert.match(popover, /rowCentred: \{\s*justifyContent: 'center',\s*paddingHorizontal: TICK_ZONE,\s*\}/);
  assert.match(popover, /tick: \{\s*position: 'absolute',\s*left: TICK_INSET,\s*top: 0,\s*bottom: 0,\s*width: TICK_SIZE,/);
  assert.match(popover, /centred \? styles\.textCentred : styles\.text/);
  assert.match(popover, /listRef\.current\?\.flashScrollIndicators\(\);/);
  assert.match(popover, /indicatorStyle=\{isDark \? 'white' : 'black'\}/);
  assert.doesNotMatch(popover, /showsVerticalScrollIndicator=\{false\}/, 'the bar is iOS\'s own, shown');
  assert.match(popover, /const divider = withAlpha\(isDark \? colors\.white : colors\.ink, isDark \? DIVIDER_ALPHA_DARK : DIVIDER_ALPHA_LIGHT\);/);
  assert.doesNotMatch(popover, /borderTopColor: colors\.border/, 'never the warm gold hairline');
  assert.match(sheet, /const DATE_POPOVER_WIDTH = 192;/);
  assert.match(sheet, /width: DATE_POPOVER_WIDTH,\s*rowHeight: POPOVER_ROW_HEIGHT,\s*visibleRows: POPOVER_VISIBLE_ROWS - 1,/);
  assert.match(sheet, /visibleRows: JOB_SORTS\.length,\s*(\/\/[^\n]*\n\s*)?contentAlign: 'start' as const,/);
  assert.match(popover, /initialScrollIndex=\{initialIndex\}/);
  assert.match(popover, /contentOffset=\{\{ x: 0, y: initialOffset \}\}/);
  assert.match(popover, /scrollToOffset\(\{ offset: initialOffset, animated: false \}\)/);
  const sheetPrimitive = stripComments(await read('ui/primitives/Sheet.tsx'));
  assert.match(sheetPrimitive, /<View style=\{StyleSheet\.absoluteFill\} pointerEvents="box-none">\s*\{overlay\}/);
  assert.match(popover, /useNativeDriver: USE_NATIVE_DRIVER/);
  assert.match(popover, /import \{ PANEL_SCALE_FROM, panelTravelFor \} from '\.\/DropMenu\.shared';/);
  assert.match(popover, /name="checkmark"/);
});
