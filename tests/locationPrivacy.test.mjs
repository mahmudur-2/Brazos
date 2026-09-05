import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';

/**
 * GPS-coordinate location leak (P0). The chain this pins shut:
 * on double reverse-geocode failure lib/geolocation.ts used to label the
 * place "40.6501, -73.9496"; the post flow accepted it; create_job stored it
 * in public.jobs.location; the browse feed showed it to every signed-in
 * user. Four decimals ≈ 10 m — a home address on the open market, violating
 * the job_locations privacy invariant.
 *
 * lib/locationPrivacy.ts is pure and EXECUTED here. toOpenJob is executed by
 * verbatim extraction from lib/jobs.ts (the moneyCeiling.test.mjs pattern —
 * lib/jobs.ts imports the supabase client, which node cannot load). Screen
 * and call-site wiring is pinned [static].
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFile(join(root, rel), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const privacyUrl = pathToFileURL(join(root, 'lib/locationPrivacy.ts')).href;
const { isCoordinateShapedLocation, coordinateLocationError, publicLocationLabel } =
  await import(privacyUrl);

// ---------------------------------------------------------------------------
// (a) Double geocode failure can never yield a coordinate-shaped label
// ---------------------------------------------------------------------------

test('a · double geocode failure yields an EMPTY label, never coordinates', () => {
  // lib/geolocation.ts's exact final expression with both tiers failed
  // (label still null): the label the post flow receives is ''.
  const label = publicLocationLabel(null) ?? '';
  assert.equal(label, '');
  assert.equal(isCoordinateShapedLocation(label), false);
});

test('a · a coordinate-shaped string from a geocode tier is scrubbed the same way', () => {
  // Even if Nominatim or the native geocoder somehow returned raw
  // coordinates as the "place name", the same one rule empties it.
  const label = publicLocationLabel('40.6501, -73.9496') ?? '';
  assert.equal(label, '');
});

test('[static] a · lib/geolocation.ts has no coordinate-label fallback left', async () => {
  const src = stripComments(await read('lib/geolocation.ts'));
  assert.doesNotMatch(src, /toFixed/, 'no coordinate formatting may remain');
  assert.match(
    src,
    /publicLocationLabel\(label\) \?\? ''/,
    'the returned label must route through the one privacy rule'
  );
  assert.match(src, /from '\.\/locationPrivacy'/);
});

test('[static] a · the post flow never blanks typed text with an empty label', async () => {
  const src = await read('screens/PostJobScreen.tsx');
  assert.match(
    src,
    /if \(result\.place\.label\) \{\s*setLocation\(result\.place\.label\);/,
    'setLocation must be guarded on a non-empty label'
  );
});

// ---------------------------------------------------------------------------
// (b) The write-boundary validator: coordinate pairs refused, addresses pass
// ---------------------------------------------------------------------------

test('b · coordinate-shaped locations are refused with a written sentence', () => {
  for (const bad of [
    '40.6501, -73.9496',
    '-73.9496, 40.6501',
    ' 40.650 , -73.949 ',
    '1.123,-2.456',
    '40.650100, -73.949600',
  ]) {
    assert.equal(isCoordinateShapedLocation(bad), true, `${bad} must match`);
    const error = coordinateLocationError(bad);
    assert.equal(typeof error, 'string', `${bad} must be refused`);
  }
});

test('b · real location text passes — the shape is never broader than a GPS pair', () => {
  for (const fine of [
    'Flatbush, Brooklyn',
    'Flatbush, Brooklyn, NY',
    '123 Main St',
    'Apt 4.5, Midwood',
    'Route 9, mile 12',
    // Only 2 decimal places — deliberately outside the refused shape, so a
    // legitimate short-decimal string in an address can never be blocked.
    '40.65, -73.94',
    // Integers — not the refused shape either.
    '40, -73',
    // A trailing word breaks the full-string match.
    '40.6501, -73.9496 Brooklyn',
    '',
  ]) {
    assert.equal(isCoordinateShapedLocation(fine), false, `${fine || '(empty)'} must pass`);
    assert.equal(coordinateLocationError(fine), null, `${fine || '(empty)'} must not error`);
  }
});

test('b · the refusal passes isSafeToShow so userMessage() hands it through', () => {
  const msg = coordinateLocationError('40.6501, -73.9496');
  assert.ok(msg.length <= 160, 'must stay under isSafeToShow()’s length gate');
  assert.doesNotMatch(
    msg,
    /\b(column|relation|table|constraint|schema|function|type|operator|syntax|null value|violates|pg_|public\.)\b/i
  );
});

function sliceOf(source, from, to) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `${from} must exist`);
  const end = to ? source.indexOf(to, start) : source.length;
  assert.ok(end > start, `${to} must follow ${from}`);
  return source.slice(start, end);
}

function assertRefusesBeforeRpc(slice, checkNeedle, rpcNeedle) {
  const check = slice.indexOf(checkNeedle);
  const rpc = slice.indexOf(rpcNeedle);
  assert.ok(check >= 0, `${checkNeedle} must be called`);
  assert.ok(rpc >= 0, `${rpcNeedle} must be called`);
  assert.ok(check < rpc, `${checkNeedle} must run before ${rpcNeedle}`);
}

test('[static] b · every p_location write boundary refuses before its RPC', async () => {
  const jobs = stripComments(await read('lib/jobs.ts'));
  const createJob = sliceOf(jobs, 'export async function createJob', 'export async function updateJob');
  assertRefusesBeforeRpc(createJob, 'coordinateLocationError(input.location)', ".rpc('create_job'");
  const updateJob = sliceOf(jobs, 'export async function updateJob', 'export async function deleteJob');
  assertRefusesBeforeRpc(updateJob, 'coordinateLocationError(input.location)', ".rpc('update_job_details'");

  const offers = stripComments(await read('lib/offers.ts'));
  const direct = sliceOf(offers, 'export async function createDirectOffer', 'export async function counterOffer');
  assertRefusesBeforeRpc(direct, 'coordinateLocationError(input.location)', ".rpc('create_offer'");
});

// ---------------------------------------------------------------------------
// (c) Open-market rendering masks a coordinate-shaped stored location
// ---------------------------------------------------------------------------

// toOpenJob executed with the REAL source: lib/locationPrivacy.ts (pure) +
// the verbatim toPhotoArray and toOpenJob spans from lib/jobs.ts.
const openJobModule = (async () => {
  const privacyJs = stripTypeScriptTypes(await read('lib/locationPrivacy.ts'), { mode: 'strip' });
  const jobsJs = stripTypeScriptTypes(await read('lib/jobs.ts'), { mode: 'strip' });

  const photoStart = jobsJs.indexOf('function toPhotoArray');
  const photoEnd = jobsJs.indexOf('\n}', photoStart);
  assert.ok(photoStart > 0 && photoEnd > photoStart, 'toPhotoArray must exist in lib/jobs.ts');

  const openStart = jobsJs.indexOf('export function toOpenJob');
  const openEnd = jobsJs.indexOf('\n}', openStart);
  assert.ok(openStart > 0 && openEnd > openStart, 'toOpenJob must exist in lib/jobs.ts');

  // RUN a4 (2026-09-05): toOpenJob now resolves the posting choice through
  // lib/pricingMode.ts, so that function is extracted the same verbatim way
  // and prepended — the span stays the shipped code, not a stub of it.
  const modeJs = stripTypeScriptTypes(await read('lib/pricingMode.ts'), { mode: 'strip' });
  const modeStart = modeJs.indexOf('export function pricingModeFrom');
  const modeEnd = modeJs.indexOf('\n}', modeStart);
  assert.ok(modeStart > 0 && modeEnd > modeStart, 'pricingModeFrom must exist in lib/pricingMode.ts');
  const defaultStart = modeJs.indexOf('export const DEFAULT_PRICING_MODE');
  const defaultEnd = modeJs.indexOf('\n', defaultStart);
  assert.ok(defaultStart > 0 && defaultEnd > defaultStart, 'DEFAULT_PRICING_MODE must exist');

  const js = [
    privacyJs,
    modeJs.slice(defaultStart, defaultEnd),
    modeJs.slice(modeStart, modeEnd + 2),
    jobsJs.slice(photoStart, photoEnd + 2),
    jobsJs.slice(openStart, openEnd + 2),
  ].join('\n');
  return import(toDataUrl(js));
})();

const marketRow = (location) => ({
  id: 'j1',
  client_id: 'c1',
  title: 'Mount a TV',
  description: 'Living room, 55 inch',
  category: 'tv_mounting',
  location,
  budget_cents: 12000,
  status: 'open',
  created_at: '2026-08-18T00:00:00Z',
  photos: [],
  videos: [],
});

test('c · toOpenJob renders a coordinate-shaped stored location as absent', async () => {
  const { toOpenJob } = await openJobModule;
  assert.equal(toOpenJob(marketRow('40.6501, -73.9496')).location, null);
});

test('c · toOpenJob passes a real area label through unchanged', async () => {
  const { toOpenJob } = await openJobModule;
  assert.equal(toOpenJob(marketRow('Flatbush, Brooklyn, NY')).location, 'Flatbush, Brooklyn, NY');
  assert.equal(toOpenJob(marketRow(null)).location, null);
});

test('[static] c · every open-market read maps through toOpenJob, and the cards guard on location', async () => {
  const jobs = await read('lib/jobs.ts');
  // The three OPEN_JOB_COLUMNS fetches all map with toOpenJob.
  for (const fetcher of ['fetchOpenJobs', 'fetchOpenJobById', 'fetchOpenJobsByIds']) {
    assert.ok(jobs.includes(fetcher), `${fetcher} must exist`);
  }
  assert.match(jobs, /\.map\(toOpenJob\)/);

  const hotspots = await read('lib/hotspots.ts');
  assert.match(hotspots, /\.map\(toOpenJob\)/); // jobs_in_cell
  assert.match(hotspots, /\.\.\.toOpenJob\(row\)/); // jobs_within_radius

  // Open-market surfaces render the location only when present — masked
  // rows show nothing, the same convention as unknown distance.
  assert.match(await read('components/BrowseJobCard.tsx'), /job\.location \?/);
  assert.match(await read('components/WorkerJobCard.tsx'), /job\.location \?/);
  assert.match(await read('components/MarketJobPreview.tsx'), /job\.location \?/);
});
