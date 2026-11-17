import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * A4-R1 (A4-01, A4-09) - THE SERVER'S CLOCK. lib/serverClock.ts runs here as written (it has no
 * imports): the offset from an answer's Date header, the wrapper around the client's one fetch, and
 * the booked-window rule read with the server's time on a phone whose clock is wrong.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');
const { jobWindowEndMs, jobWindowOver } = await import(pathToFileURL(join(root, 'lib/paymentRules.ts')).href);
let noteServerDate, serverNowMs, watchServerClock;
let instance = 0;
/** UA-03: a fresh copy of the module (no header accepted yet), because the clock keeps the newest header. */
const fresh = async () =>
  ({ noteServerDate, serverNowMs, watchServerClock } = await import(
    `${pathToFileURL(join(root, 'lib/serverClock.ts')).href}?instance=${(instance += 1)}`
  ));
await fresh();

const HOUR = 3_600_000;
/** A Date header that is `skewMs` ahead of the phone's clock, answered at once. */
const noteSkew = (skewMs) => {
  const at = Date.now();
  noteServerDate(new Date(at + skewMs).toUTCString(), at, at);
};
const offset = () => serverNowMs() - Date.now();
const near = (actual, expected, why) => assert.ok(Math.abs(actual - expected) <= 1_500, `${why}: ${actual} vs ${expected}`);

test('noteServerDate: a skew of 60 s or more either way is kept; a smaller one is 0', async () => {
  await fresh();
  noteSkew(-2 * HOUR);
  near(offset(), -2 * HOUR, 'a phone 2 hours fast');
  noteSkew(90_000);
  near(offset(), 90_000, 'a phone 90 s slow');
  await fresh();
  noteSkew(30_000);
  assert.equal(offset(), 0, 'under 60 s is the network and the header, not a wrong clock');
});

test('noteServerDate ignores a missing or unreadable header and a round trip over 5 s', async () => {
  await fresh();
  noteSkew(-2 * HOUR);
  const at = Date.now();
  noteServerDate(null, at, at);
  noteServerDate(undefined, at, at);
  noteServerDate('', at, at);
  noteServerDate('not a date', at, at);
  noteServerDate(new Date(at).toUTCString(), at, at + 5_001);
  noteServerDate(new Date(at).toUTCString(), at, at - 1);
  near(offset(), -2 * HOUR, 'every one ignored: the last good offset stays');
  // Exactly 5 s is still read; the skew is measured from the middle of the round trip.
  noteServerDate(new Date(at + 2_500 + 120_000).toUTCString(), at, at + 5_000);
  near(offset(), 120_000, 'a 5 s round trip counts');
});

test('UA-03: a Date header older than the newest one accepted (a cached or replayed answer) is ignored; an equal one counts', async () => {
  await fresh();
  const at = Date.now();
  const header = new Date(at + 120_000).toUTCString();
  const headerMs = Date.parse(header);
  noteServerDate(header, at, at);
  near(offset(), headerMs - at, 'the first header is accepted');
  // A cached answer: its header is 10 minutes old and its round trip is 0 ms.
  noteServerDate(new Date(headerMs - 600_000).toUTCString(), at, at);
  near(offset(), headerMs - at, 'the old header is ignored: the offset does not become -8 minutes');
  // One second older (the header's grain) is still older.
  noteServerDate(new Date(headerMs - 1_000).toUTCString(), at, at);
  near(offset(), headerMs - at, 'one second older is ignored');
  // The same header 30 s later by the phone: equal counts, and the offset follows it.
  noteServerDate(header, at + 30_000, at + 30_000);
  near(offset(), headerMs - at - 30_000, 'an equal header is accepted');
  // A header refused for its round trip does not become the newest.
  noteServerDate(new Date(headerMs + HOUR).toUTCString(), at, at + 5_001);
  noteServerDate(new Date(headerMs + 1_000).toUTCString(), at, at);
  near(offset(), headerMs + 1_000 - at, 'a newer header is accepted after a refused one');
});

test('watchServerClock: the answer and the failure go back as they came; only the Date header is read', async () => {
  await fresh();
  const header = new Date(Date.now() - 2 * HOUR).toUTCString();
  const answer = { status: 200, headers: { get: (name) => (name === 'date' ? header : null) } };
  const seen = [];
  const watched = watchServerClock(async (input, init) => {
    seen.push([input, init]);
    return answer;
  });
  const init = { method: 'POST', body: '{}' };
  assert.equal(await watched('https://p.supabase.co/rest/v1/jobs', init), answer, 'the same answer');
  assert.deepEqual(seen, [['https://p.supabase.co/rest/v1/jobs', init]], 'the request unchanged');
  assert.equal(seen[0][1], init);
  near(offset(), -2 * HOUR, 'the header was read');
  // No headers, a throwing header read, a null answer: no throw, the answer as it came.
  for (const odd of [{ status: 200 }, { headers: { get: () => { throw new Error('x'); } } }, null]) {
    assert.equal(await watchServerClock(async () => odd)('u'), odd);
  }
  const failure = new Error('network');
  await assert.rejects(watchServerClock(async () => { throw failure; })('u'), (e) => e === failure);
});

test('A4-01: on a phone 2 hours fast, the booked window is still open by the server\'s time', async () => {
  await fresh();
  noteSkew(-2 * HOUR);
  const phone = Date.now();
  const server = serverNowMs();
  // A window that ends between the server's now and the phone's now (the hours are whole, the gap is 2 h).
  let job = null;
  for (const day of [-1, 0, 1]) {
    for (let hour = 1; hour <= 24 && !job; hour += 1) {
      const candidate = { scheduled_date: new Date(phone + day * 24 * HOUR).toISOString().slice(0, 10), arrival_end_hour: hour };
      const end = jobWindowEndMs(candidate);
      if (end > server + 60_000 && end <= phone - 60_000) job = candidate;
    }
  }
  assert.ok(job, 'a window inside the gap');
  assert.equal(jobWindowOver({ job, nowMs: phone }), true, 'the phone\'s clock says over');
  assert.equal(jobWindowOver({ job, nowMs: serverNowMs() }), false, 'the server\'s clock says open: Accept and Counter stay');
  noteSkew(0);
});

test('[static] the client\'s one fetch reads the server\'s clock inside the timeout, and no phone clock decides a window', () => {
  const client = read('lib/supabase.ts');
  assert.match(client, /import \{ watchServerClock \} from '\.\/serverClock';/);
  assert.match(client, /global: \{ fetch: watchSuspension\(withRequestTimeout\(watchServerClock\(fetch\)\)\) \}/);
  assert.doesNotMatch(read('lib/serverClock.ts'), /^import /m, 'no imports: the tests run it as written');
  // Every booked-window check on a screen passes the server's time.
  for (const file of ['screens/BidDetailScreen.tsx', 'screens/ClientJobDetailScreen.tsx', 'screens/CompareBidsScreen.tsx', 'screens/JobDetailScreen.tsx', 'components/OfferComposer.tsx']) {
    const src = read(file);
    assert.match(src, /import \{ serverNowMs \} from '\.\.\/lib\/serverClock';/, file);
    const calls = src.match(/jobWindowOver\(\{[^}]*\}[^)]*\)/g) ?? [];
    assert.ok(calls.length > 0, file);
    for (const call of calls) assert.match(call, /nowMs: serverNowMs\(\)/, `${file}: ${call}`);
  }
  // lib/offers.ts reads it for an offer's deadline.
  const offers = read('lib/offers.ts');
  assert.match(offers, /import \{ serverNowMs \} from '\.\/serverClock';/);
  assert.equal((offers.match(/nowMs: number = serverNowMs\(\)/g) ?? []).length, 3);
  assert.doesNotMatch(offers, /Date\.now\(\)/);
});
