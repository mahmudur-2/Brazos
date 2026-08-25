import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

/**
 * LIVE_LOCATION (phase77, S-7) — a time-bounded position share.
 *
 * The properties pinned here are the ones a later run could plausibly undo
 * while believing it was making the feature more reliable:
 *
 *   1. AN EARLY STOP DELIVERS NO REALTIME EVENT. stop_live_location() sets
 *      expires_at = now(), and the updated row immediately fails the SELECT
 *      policy's expiry term, so realtime DROPS it. A build that waits for an
 *      event leaves a stale pin on screen forever. The refetch-on-focus and
 *      the local expiry clock are what actually clear a card.
 *   2. THE HEARTBEAT'S RAISE IS THE END, NOT A FAILURE. Retrying it would
 *      raise for the same reason every time, and a share cannot be revived by
 *      a heartbeat — only start_live_location() inserts.
 *   3. FOREGROUND ONLY. No TaskManager, no background task, no "Always".
 *   4. NEVER PAST EIGHT HOURS. The server caps it in the RPC and in a CHECK,
 *      so a client that asks for more is asking to be refused.
 *   5. A SHARE IS NOT A MESSAGE. Nothing inserts into `messages` when one
 *      starts or stops.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const MIGRATION = 'supabase/phase77_conversation_features.sql';
const LIB = 'lib/liveLocation.ts';
const HOOK = 'hooks/useLiveLocation.ts';

// lib/liveLocation.ts EXECUTED against a recording stub of the supabase
// client, so the RPC NAMES and ARGUMENT NAMES are checked by calling them
// rather than by reading them. There are no generated database types in this
// repo, so a misspelled argument is a runtime failure with no build signal —
// which makes this the assertion that matters most in the file.
const libModule = (async () => {
  const calls = [];
  const js = stripTypeScriptTypes(await read(LIB), { mode: 'strip' });
  const stubbed = js
    .replace(
      /import \{ supabase \} from '\.\/supabase';/,
      `const supabase = {
         rpc: async (fn, args) => {
           globalThis.__rpc.push({ fn, args });
           return globalThis.__rpcResult ?? { data: 'share-1', error: null };
         },
         from: (table) => ({
           select: (columns) => ({
             eq: async (column, value) => {
               globalThis.__rpc.push({ from: table, columns, column, value });
               return globalThis.__selectResult ?? { data: [], error: null };
             },
           }),
         }),
       };`
    )
    // Matched loosely on purpose: stripTypeScriptTypes() runs FIRST and
    // removes `type ChatTarget` from this import, so a regex naming it can
    // never match the source this actually sees.
    .replace(
      /import \{[^}]*\} from '\.\/messages';/,
      `const chatTargetFilter = (t) => t.jobId ? 'job_id=eq.' + t.jobId : 'direct_thread_id=eq.' + t.directThreadId;
       const chatTargetKey = (t) => t.jobId ? 'job:' + t.jobId : 'direct:' + t.directThreadId;`
    );
  assert.match(stubbed, /const supabase = \{/, 'the supabase import must be stubbed');
  assert.doesNotMatch(stubbed, /from '\.\/messages'/, 'the messages import must be stubbed');
  globalThis.__rpc = calls;
  return { mod: await import(toDataUrl(stubbed)), calls };
})();

// ---------------------------------------------------------------------------
// 1 — THE RPC CONTRACT, read back off the migration that is applied
// ---------------------------------------------------------------------------

test('[executed] every RPC name and argument name matches the applied migration', async () => {
  const { mod, calls } = await libModule;
  const sql = await read(MIGRATION);
  const jobTarget = { jobId: 'job-1' };
  const directTarget = { directThreadId: 'thread-1' };

  calls.length = 0;
  await mod.startLiveLocation(jobTarget, 40.65, -73.94, '2026-08-25T18:00:00.000Z');
  await mod.updateLiveLocation(jobTarget, 40.66, -73.95);
  await mod.stopLiveLocation(directTarget);

  const [start, beat, stop] = calls;
  assert.equal(start.fn, 'start_live_location');
  assert.equal(beat.fn, 'update_live_location');
  assert.equal(stop.fn, 'stop_live_location');

  // Every argument the client sends is a parameter the function declares. A
  // name that is right here and wrong there fails at runtime and never at
  // build time, because lib/supabase.ts is created with no type parameter.
  const declared = (fn) => {
    const at = sql.indexOf(`create or replace function public.${fn}(`);
    assert.ok(at > -1, `${fn} must be declared in the migration`);
    const head = sql.slice(at, sql.indexOf(')\nreturns', at));
    return [...head.matchAll(/(p_[a-z_]+)\s+(?:double precision|timestamptz|uuid)/g)].map((m) => m[1]);
  };
  for (const call of calls) {
    const params = declared(call.fn);
    assert.ok(params.length > 0, `${call.fn} must declare parameters`);
    for (const name of Object.keys(call.args)) {
      assert.ok(params.includes(name), `${call.fn} has no parameter ${name}`);
    }
  }

  // BOTH THREAD KINDS, and exactly one at a time — the table's own
  // live_location_shares_one_thread CHECK.
  assert.deepEqual(start.args, {
    p_lat: 40.65,
    p_lng: -73.94,
    p_expires_at: '2026-08-25T18:00:00.000Z',
    p_job_id: 'job-1',
    p_direct_thread_id: null,
  });
  assert.deepEqual(stop.args, { p_job_id: null, p_direct_thread_id: 'thread-1' });

  // The three functions are reachable from the app at all (phase32 revoked
  // the default EXECUTE), and none of them is left open to anon.
  for (const [fn, signature] of [
    ['start_live_location', 'double precision, double precision, timestamptz, uuid, uuid'],
    ['update_live_location', 'double precision, double precision, uuid, uuid'],
    ['stop_live_location', 'uuid, uuid'],
  ]) {
    assert.ok(
      sql.includes(`revoke all on function public.${fn}(${signature}) from public, anon;`),
      `${fn} must revoke from public and anon`
    );
    assert.ok(
      sql.includes(`grant execute on function public.${fn}(${signature}) to authenticated;`),
      `${fn} must grant execute to authenticated`
    );
  }
});

test('[executed] the read is an explicit projection on the thread column', async () => {
  const { mod, calls } = await libModule;
  calls.length = 0;
  await mod.fetchActiveShares({ jobId: 'job-1' });
  await mod.fetchActiveShares({ directThreadId: 'thread-1' });

  assert.equal(calls[0].from, 'live_location_shares');
  assert.equal(calls[0].column, 'job_id');
  assert.equal(calls[0].value, 'job-1');
  assert.equal(calls[1].column, 'direct_thread_id');
  assert.equal(calls[1].value, 'thread-1');

  // Never select('*'): the table is ours today, but a widened one must not
  // silently start shipping new columns to every chat.
  assert.doesNotMatch(calls[0].columns, /\*/);
  for (const column of [
    'id', 'sharer_id', 'job_id', 'direct_thread_id',
    'lat', 'lng', 'started_at', 'updated_at', 'expires_at',
  ]) {
    assert.ok(calls[0].columns.split(', ').includes(column), `the projection selects ${column}`);
  }

  // NO client-side expiry filter, and its absence is deliberate: the SELECT
  // policy's own `expires_at > now()` term means an expired row cannot come
  // back, and a second copy of that rule here is the P3-31 duplication.
  const lib = stripComments(await read(LIB));
  assert.doesNotMatch(lib, /\.gt\(/, 'expiry on the fetch belongs to the policy, not the client');
});

// ---------------------------------------------------------------------------
// 2 — NEVER PAST EIGHT HOURS
// ---------------------------------------------------------------------------

test('[executed] the picker offers exactly 15m / 1h / 8h, and nothing computes past 8 hours', async () => {
  const { mod } = await libModule;
  const HOUR = 60 * 60 * 1000;

  assert.equal(mod.MAX_SHARE_MS, 8 * HOUR);
  assert.deepEqual(
    mod.SHARE_DURATIONS.map((d) => d.key),
    ['15m', '1h', '8h'],
    'three choices, in ascending order'
  );
  assert.deepEqual(
    mod.SHARE_DURATIONS.map((d) => d.label),
    ['15 minutes', '1 hour', '8 hours']
  );
  assert.deepEqual(
    mod.SHARE_DURATIONS.map((d) => d.ms),
    [15 * 60 * 1000, HOUR, 8 * HOUR]
  );
  // No fourth choice may exceed the cap, now or later.
  for (const duration of mod.SHARE_DURATIONS) {
    assert.ok(duration.ms <= mod.MAX_SHARE_MS, `${duration.key} must not exceed the cap`);
    assert.ok(duration.ms > 0, `${duration.key} must be a real window`);
  }

  // THE CLAMP, which is what makes the cap hold however this is called. The
  // server refuses `p_expires_at > now() + interval '8 hours'`, so an expiry
  // computed past that is a request to be refused.
  const now = Date.UTC(2026, 7, 25, 12, 0, 0);
  for (const duration of mod.SHARE_DURATIONS) {
    const at = new Date(mod.shareExpiryFor(duration.ms, now)).getTime();
    assert.ok(at > now, `${duration.key} must end in the future`);
    assert.ok(at <= now + mod.MAX_SHARE_MS, `${duration.key} must not end past the cap`);
  }
  // Even asked for a week, or a year.
  for (const absurd of [24 * HOUR, 365 * 24 * HOUR, Number.MAX_SAFE_INTEGER]) {
    const at = new Date(mod.shareExpiryFor(absurd, now)).getTime();
    assert.ok(at <= now + mod.MAX_SHARE_MS, 'the clamp holds for any input');
    assert.ok(at > now);
  }
  // A negative or zero window still produces a parseable instant rather than
  // an Invalid Date the RPC would receive as null.
  assert.ok(Number.isFinite(new Date(mod.shareExpiryFor(-1, now)).getTime()));

  // The 8h choice lands within a minute of the ceiling — the skew margin is
  // seconds, not a materially shorter share.
  const eight = new Date(mod.shareExpiryFor(8 * HOUR, now)).getTime();
  assert.ok(now + 8 * HOUR - eight < 60_000, 'the skew margin is seconds, not minutes');

  // And the server's own ceiling is still stated in both places it lives.
  const sql = await read(MIGRATION);
  assert.match(sql, /expires_at <= started_at \+ interval '8 hours'/);
  assert.match(sql, /p_expires_at > now\(\) \+ interval '8 hours'/);
});

// ---------------------------------------------------------------------------
// 3 — AN EXPIRED SHARE CLEARS THE CARD WITH NO REALTIME EVENT
// ---------------------------------------------------------------------------

test('[executed] a share expires against the clock the client already holds', async () => {
  const { mod } = await libModule;
  const now = Date.UTC(2026, 7, 25, 12, 0, 0);
  const at = (offsetMs) => ({ expires_at: new Date(now + offsetMs).toISOString() });

  assert.equal(mod.isShareActive(at(60_000), now), true);
  assert.equal(mod.isShareActive(at(1), now), true);
  // THE BOUNDARY IS THE SERVER'S: the policy is `expires_at > now()`, so a
  // share expiring exactly now is already gone, not still live.
  assert.equal(mod.isShareActive(at(0), now), false);
  assert.equal(mod.isShareActive(at(-1), now), false);
  assert.equal(mod.isShareActive(at(-60_000), now), false);
  // A row with an unparseable timestamp is treated as ended rather than
  // eternal — fail towards showing less, never towards a pin that never goes.
  assert.equal(mod.isShareActive({ expires_at: 'nonsense' }, now), false);

  // The label that rides the card, and it never reads as a bug at the edges.
  assert.equal(mod.formatTimeRemaining(at(8 * 60 * 60 * 1000 - 60_000).expires_at, now), '7h 59m');
  assert.equal(mod.formatTimeRemaining(at(60 * 60 * 1000).expires_at, now), '1h 0m');
  assert.equal(mod.formatTimeRemaining(at(14 * 60_000).expires_at, now), '14m');
  assert.equal(mod.formatTimeRemaining(at(30_000).expires_at, now), 'under a minute');
  // Ended is EMPTY, never "0m" and never negative — there is no card to label.
  assert.equal(mod.formatTimeRemaining(at(0).expires_at, now), '');
  assert.equal(mod.formatTimeRemaining(at(-60_000).expires_at, now), '');
  assert.equal(mod.formatTimeRemaining('nonsense', now), '');
});

test('[static] the card is cleared by a clock and a refetch, never by waiting for an event', async () => {
  const hook = stripComments(await read(HOOK));
  const flat = flatten(await read(HOOK));

  // THE LOCAL CLOCK. `now` is state, ticked on an interval, and every derived
  // list filters against it — so a card whose held expires_at has passed goes
  // without anything arriving from the server.
  assert.match(hook, /const \[now, setNow\] = useState\(\(\) => Date\.now\(\)\);/);
  assert.match(flat, /setInterval\(\(\) => setNow\(Date\.now\(\)\), EXPIRY_TICK_MS\)/);
  assert.match(flat, /shares\.filter\(\(share\) => isShareActive\(share, now\)\)/);
  // ...and it only runs while there is something to expire.
  assert.match(hook, /if \(shares\.length === 0\) return;/);
  assert.match(flat, /return \(\) => clearInterval\(timer\);/, 'the interval is torn down');

  // THE FOCUS REFETCH — the other half, and the one that catches a share that
  // ended while this screen was away.
  assert.match(flat, /useFocusEffect\(\s*useCallback\(\(\) => \{ void refresh\(\); \}/);

  // A failed read is NOT "no shares": blanking on a blip would hide a live
  // share, and the local clock will expire it honestly anyway.
  assert.match(hook, /share read failed/);
  const refreshBody = hook.slice(hook.indexOf('const refresh ='), hook.indexOf('// Initial load'));
  assert.match(refreshBody, /if \(error\) \{[\s\S]*?return;\s*\}/);
  assert.doesNotMatch(refreshBody, /setShares\(\[\]\);\s*\n\s*}\s*\n\s*setShares/);

  // The subscription exists for the MOVING pin, not for the ending one.
  assert.match(hook, /table: 'live_location_shares', filter/);
  assert.match(hook, /event: '\*'/);
  // Per-mount topic: channel() dedupes by topic and removeChannel() tears down
  // asynchronously, so every mount needs a string that has never existed.
  assert.match(hook, /\$\{instanceId\}:\$\{runRef\.current\+\+\}/);
  assert.match(hook, /supabase\.removeChannel\(channel\);/);
});

// ---------------------------------------------------------------------------
// 4 — THE HEARTBEAT TEARS DOWN ON A RAISE
// ---------------------------------------------------------------------------

test('[static] the heartbeat treats a raise as the end of the share, and never retries', async () => {
  const hook = stripComments(await read(HOOK));

  const beat = hook.slice(
    hook.indexOf('void updateLiveLocation('),
    hook.indexOf('return null;', hook.indexOf('void updateLiveLocation('))
  );
  assert.ok(beat.length > 0, 'the heartbeat must call updateLiveLocation');
  // The raise IS the end: tear the watcher down and resync, in that order.
  assert.match(beat, /if \(!beatError\) return;/);
  assert.match(beat, /stopWatching\(\);/);
  assert.match(beat, /void refresh\(\);/);
  // NEVER a retry. update_live_location() raises once the share has expired or
  // was stopped, so a retry raises for the same reason every time — and a
  // share cannot be revived by a heartbeat, only by start_live_location().
  assert.doesNotMatch(beat, /setTimeout|retry|attempt/i);
  assert.doesNotMatch(beat, /startLiveLocation/);

  // And the watcher dies with the share however it ended — an expiry this
  // device noticed, a stop from another device, or a block that landed
  // mid-share. `mine` going away is that one fact.
  assert.match(hook, /if \(!mine && watcher\.current\) stopWatching\(\);/);
  // Unmount tears it down too, or a backgrounded screen keeps the GPS on.
  assert.match(hook, /useEffect\(\(\) => stopWatching, \[stopWatching\]\);/);
  // Stopping removes the watcher BEFORE the RPC, so an update already in
  // flight cannot land after the stop and be refused.
  const stopBody = hook.slice(hook.indexOf('const stop = useCallback'));
  assert.ok(
    stopBody.indexOf('stopWatching();') < stopBody.indexOf('await stopLiveLocation('),
    'the watcher goes before the stop RPC'
  );
});

test('[static] the cadence stays inside its stated bounds', async () => {
  const { mod } = await libModule;
  // The BOUNDS are the contract, not the number: no more often than every ten
  // seconds (battery) and no further apart than every sixty (a pin that has
  // not moved in over a minute is a position, not a movement).
  assert.equal(mod.HEARTBEAT_MIN_MS, 10_000);
  assert.equal(mod.HEARTBEAT_MAX_MS, 60_000);
  assert.ok(mod.HEARTBEAT_MS >= mod.HEARTBEAT_MIN_MS, 'no more often than the floor');
  assert.ok(mod.HEARTBEAT_MS <= mod.HEARTBEAT_MAX_MS, 'no further apart than the ceiling');
  assert.ok(mod.HEARTBEAT_DISTANCE_M > 0);
  assert.ok(mod.EXPIRY_TICK_MS > 0 && mod.EXPIRY_TICK_MS <= mod.HEARTBEAT_MAX_MS);

  const hook = stripComments(await read(HOOK));
  assert.match(hook, /timeInterval: HEARTBEAT_MS,/);
  assert.match(hook, /distanceInterval: HEARTBEAT_DISTANCE_M,/);
});

// ---------------------------------------------------------------------------
// 5 — FOREGROUND ONLY, AND A SHARE IS NOT A MESSAGE
// ---------------------------------------------------------------------------

test('[static] foreground only: no background task, no Always permission', async () => {
  // COMMENT-STRIPPED, because the docblocks NAME what must not be reached for
  // — that is the record of the decision, and a sweep over raw text would go
  // red on the prose explaining why it is red.
  const hook = stripComments(await read(HOOK));
  const lib = stripComments(await read(LIB));

  assert.match(hook, /Location\.requestForegroundPermissionsAsync\(\)/);
  assert.match(hook, /Location\.watchPositionAsync\(/);

  // The four things this feature must never reach for. Background location is
  // the most invasive permission iOS asks for, and it would be asked for a
  // feature whose whole point is that it is bounded — a share whose updates
  // stop because iOS suspended the app is an ACCEPTED outcome, because the
  // counterparty's honest upper bound is always the expires_at they hold.
  for (const [name, source] of [[HOOK, hook], [LIB, lib]]) {
    assert.doesNotMatch(source, /expo-task-manager/, `${name} must not import a task manager`);
    assert.doesNotMatch(source, /TaskManager/, `${name} must define no background task`);
    assert.doesNotMatch(source, /requestBackgroundPermissionsAsync/, `${name} must not ask for Always`);
    assert.doesNotMatch(source, /startLocationUpdatesAsync/, `${name} must not start background updates`);
  }

  // And the decision is WRITTEN where the next reader will be, so a later run
  // does not "fix" the suspended-app case by reaching for the permission this
  // one deliberately refused.
  assert.match(await read(HOOK), /FOREGROUND ONLY/);
  assert.match(await read(HOOK), /an accepted outcome/);
});

test('[static] every failure is handed on whole, never unwrapped into a sentence', async () => {
  const hook = stripComments(await read(HOOK));

  // D9's rule. phase77's three RPCs raise sentences that are already written
  // for users — 'Location sharing is not available', 'No active location
  // share', 'Sharing must end in the future, at most 8 hours from now' — so
  // the error OBJECT travels to the screen and lib/errorMessage decides what
  // is shown. Reading `.message` here would strip that classification and is
  // what tests/errorMessage.test.mjs sweeps this directory for.
  assert.match(hook, /if \(error\) return error;/, 'the RPC error is returned unchanged');
  assert.match(hook, /return err instanceof Error \? err : \{ message: null \};/);
  // A non-Error throw must not read as SUCCESS — silence after a share that
  // did not start is worse than a generic sentence.
  assert.doesNotMatch(hook, /return err instanceof Error \? err : null;/);

  // Only console calls may touch raw text, which is the one exemption the
  // sweep allows and the reason a failure stays observable at all.
  for (const line of hook.split('\n')) {
    if (!/\b\w*[Ee]rr\w*\??\.message\b/.test(line)) continue;
    assert.ok(line.includes('console.'), `raw error text outside a console call: ${line.trim()}`);
  }
});

test('[static] a share is not a message: nothing here writes to messages', async () => {
  const hook = stripComments(await read(HOOK));
  const lib = stripComments(await read(LIB));

  for (const [name, source] of [[HOOK, hook], [LIB, lib]]) {
    assert.doesNotMatch(source, /sendMessage\(/, `${name} must not insert a message`);
    assert.doesNotMatch(source, /from\('messages'\)/, `${name} must not touch messages`);
  }
  // The table has its own row, and the migration says so.
  const sql = await read(MIGRATION);
  assert.match(sql, /create table if not exists public\.live_location_shares \(/);
  assert.match(sql, /constraint live_location_shares_one_thread check \(/);
  // One row per sharer per thread, so ended shares never accumulate.
  assert.match(sql, /create unique index if not exists live_location_shares_sharer_job_key/);
  assert.match(sql, /create unique index if not exists live_location_shares_sharer_direct_key/);
  // Published to realtime, unlike job_locations — a moving pin is a live feed.
  assert.match(sql, /alter publication supabase_realtime add table public\.live_location_shares;/);
  // Read-only to the client: the three RPCs are the only writers.
  assert.match(sql, /revoke all on table public\.live_location_shares from authenticated;/);
  assert.match(sql, /grant select on table public\.live_location_shares to authenticated;/);
});

test('[static] the layer takes a ChatTarget, so both thread kinds are one path', async () => {
  const lib = stripComments(await read(LIB));
  // The same either-or shape sendMessage() already takes, so there is one
  // vocabulary for "which conversation" across the whole screen.
  assert.match(lib, /type ChatTarget \} from '\.\/messages';/);
  for (const fn of ['startLiveLocation', 'updateLiveLocation', 'stopLiveLocation', 'fetchActiveShares']) {
    assert.match(
      lib,
      new RegExp(`export async function ${fn}\\(\\s*target: ChatTarget`),
      `${fn} must take a ChatTarget`
    );
  }
  // The pair is built ONCE, so no call site can send both ids or neither.
  assert.equal(
    (lib.match(/p_job_id: target\.jobId \?\? null,/g) ?? []).length,
    1,
    'the thread argument pair is built in exactly one place'
  );
  // The realtime filter is the SAME rule the message channels use rather than
  // a second copy — the two tables carry the same two columns.
  assert.match(lib, /return chatTargetFilter\(target\);/);
});
