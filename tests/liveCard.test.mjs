// 2026-09-30 (the build run, idea 9) — THE LOCK-SCREEN LIVE CARD: the worker's stage taps and the
// arrival time on the customer's lock screen. The words are the server's (live_card_state()); the app
// starts, updates and ends the card while it is open; Apple's push service carries it while the app
// is closed, once Apple's key is on the project. The card is drawn by a Live Activities add-on whose
// install is the operator's: until a build carries it, every path here is inert — and an update
// delivered over the air can never reach for a module the binary lacks.
// The database half is supabase/tests/210_live_card.sql.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');
const MIGRATION = 'supabase/migrations/20260930001300_live_card.sql';
const APP_DIRS = ['lib', 'hooks', 'screens', 'components', 'navigation', 'ui', 'modes', 'dev-tools'];

function appFiles() {
  const out = [join(root, 'App.tsx')];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(name)) out.push(full);
    }
  };
  for (const dir of APP_DIRS) {
    try {
      walk(join(root, dir));
    } catch {
      // A directory this checkout does not have.
    }
  }
  return out;
}

test('[static] one file names the native module, and nothing imports the add-on\'s JavaScript', () => {
  const naming = [];
  const importing = [];
  for (const file of appFiles()) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(root, file).replace(/\\/g, '/');
    if (source.includes('ExpoLiveActivity')) naming.push(rel);
    if (/from ['"]expo-live-activity['"]|require\(['"]expo-live-activity['"]\)|import\(['"]expo-live-activity['"]\)/.test(source)) importing.push(rel);
  }
  assert.deepEqual(naming, ['lib/liveCard.ts'], 'the module is named in one place');
  assert.deepEqual(importing, [], 'a bundle over the air never imports what the binary may lack');
  const lib = read('lib/liveCard.ts');
  assert.match(lib, /export const LIVE_ACTIVITY_MODULE = 'ExpoLiveActivity';/);
  assert.match(lib, /import \{ requireOptionalNativeModule \} from 'expo';/);
  // iOS only, looked up inside a try, and taken only when all three calls are there.
  assert.match(
    lib,
    /if \(Platform\.OS !== 'ios'\) return cached;\s*try \{\s*const native = requireOptionalNativeModule<NativeLiveActivity>\(LIVE_ACTIVITY_MODULE\);\s*if \(native && typeof native\.startActivity === 'function' && typeof native\.updateActivity === 'function' && typeof native\.stopActivity === 'function'\) \{/
  );
  // Every call into the module is guarded: a card the system already ended must not throw into a screen.
  assert.equal((lib.match(/\btry \{/g) ?? []).length, 5, 'lookup, start, update, end, token listener');
  // The card's look from the tokens, never a literal colour.
  assert.doesNotMatch(lib, /#[0-9A-Fa-f]{3,8}\b/);
  assert.match(lib, /backgroundColor: darkColors\.background,/);
});

test('[static] the add-on is installed whole or not at all — a plugin line without its package breaks the build', () => {
  const config = read('app.config.ts');
  const pkg = JSON.parse(read('package.json'));
  const plugin = /['"]expo-live-activity['"]/.test(config);
  const dependency = Boolean(pkg.dependencies?.['expo-live-activity']);
  assert.equal(plugin, dependency, 'app.config.ts names the plugin exactly when package.json carries the package');
  if (plugin) assert.match(config, /enablePushNotifications: true/, 'the card follows by push while the app is closed');
});

test('[static] the hook: no query without the module, the customer\'s own jobs, the server\'s words, a card that stays', () => {
  const hook = read('hooks/useLiveJobCard.ts');
  const body = flat(hook);
  assert.match(body, /useEffect\(\(\) => \{ if \(!userId \|\| !liveCardAvailable\(\)\) return;/, 'not even a query on a binary without the module');
  assert.match(body, /\.eq\('client_id', userId\) \.in\('status', \['assigned', 'in_progress', 'completed'\]\)/, 'an allow-list');
  assert.match(hook, /\.or\(`status\.neq\.completed,completed_at\.gte\."\$\{since\}"`\)\s*\.order\('created_at', \{ ascending: false \}\)\s*\.limit\(LIVE_LIMIT\);/, 'the instant quoted for PostgREST, newest first (jobs has no updated_at)');
  assert.match(body, /const complete = \(data \?\? \[\]\)\.length < LIVE_LIMIT;/, 'a cut-off list ends no card');
  assert.match(hook, /supabase\.rpc\('live_card_state', \{ p_job_id: job\.id \}\)/);
  assert.doesNotMatch(hook, /en_route_at|arrived_at|'on_the_way'|'arrived'/, 'the stage is the server\'s to derive');
  // A finished job's card is updated, not ended: ending dismisses at once.
  assert.match(body, /if \(existing\) \{ \/\/ [^]*?updateLiveCard\(existing\.id, state\); cards\[job\.id\] = \{ id: existing\.id, last: state \}; \} else if \(!state\.ended\) \{/);
  assert.match(body, /for \(const jobId of Object\.keys\(cards\)\) \{ if \(keep\.has\(jobId\) \|\| !complete\) continue; endLiveCard\(cards\[jobId\]\.id, cards\[jobId\]\.last\);/);
  // One map in memory, shared with the token listener, so a token issued at start finds its job.
  assert.match(body, /const cardsNow = \(\) => \(loaded \?\?= readCards\(\)\);/);
  assert.match(body, /const cards = await cardsNow\(\); const jobId = Object\.keys\(cards\)\.find\(\(key\) => cards\[key\]\.id === activityId\);/);
  assert.match(hook, /supabase\.rpc\('register_live_activity', \{\s*p_job_id: jobId,\s*p_activity_id: activityId,\s*p_push_token: pushToken,\s*\}\)/);
  // Signed out: the account's cards leave the lock screen.
  assert.match(body, /void cardsNow\(\)\.then\(\(cards\) => \{ for \(const jobId of Object\.keys\(cards\)\) endLiveCard\(cards\[jobId\]\.id, cards\[jobId\]\.last\); void writeCards\(\{\}\); \}\);/);
  // The finished card stays the same two hours on both paths.
  const windowMs = hook.match(/export const FINISHED_WINDOW_MS = 2 \* 60 \* 60_000;/);
  const fn = read('supabase/functions/send-live-cards/index.ts');
  assert.ok(windowMs && /const FINISHED_WINDOW_S = 2 \* 60 \* 60;/.test(fn), 'two hours, in the app and in the push');
  assert.match(fn, /'dismissal-date': row\.state\.stage === 'cancelled' \? now : now \+ FINISHED_WINDOW_S/, 'a cancelled job\'s card goes at once');
  // Mounted once, at the root.
  assert.equal((read('App.tsx').match(/useLiveJobCard\(user\?\.id\);/g) ?? []).length, 1);
});

test('[static] the server: the customer\'s card only, a narrow token path, the outbox the service role\'s alone', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /if auth\.uid\(\) is not null and auth\.uid\(\) is distinct from v_job\.client_id then\s*return null;/);
  assert.match(sql, /when v_job\.status = 'completed' then 'finished'\s*when v_job\.status = 'in_progress' then 'started'\s*when v_job\.status = 'assigned' and v_job\.arrived_at is not null then 'arrived'\s*when v_job\.status = 'assigned' and v_job\.en_route_at is not null then 'on_the_way'/, 'an allow-list of stages');
  assert.match(sql, /revoke all on function public\.live_card_state\(uuid\) from public, anon;\s*grant execute on function public\.live_card_state\(uuid\) to authenticated, service_role;/);
  assert.match(sql, /if not exists \(select 1 from public\.jobs j where j\.id = p_job_id and j\.client_id = v_actor\) then/);
  assert.match(sql, /p_push_token !~ '\^\[0-9A-Fa-f\]\+\$' or length\(p_push_token\) not between 16 and 512/);
  assert.match(sql, /revoke all on function public\.register_live_activity\(uuid, text, text\) from public, anon;\s*grant execute on function public\.register_live_activity\(uuid, text, text\) to authenticated;/);
  for (const table of ['live_activity_tokens', 'live_card_outbox']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;\\s*revoke all on table public\\.${table} from public, anon, authenticated, service_role;\\s*grant select on table public\\.${table} to service_role;`));
  }
  for (const fn of ['claim_live_card_batch\\(integer\\)', 'resolve_live_card\\(uuid, text, text\\)', 'drain_live_cards\\(\\)', 'install_live_card_schedule\\(\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated;\\s*grant execute on function public\\.${fn} to service_role;`));
  }
  assert.match(sql, /if not public\.pg_function_present\('cron', 'schedule'\) then/);
  assert.match(sql, /perform cron\.schedule\('brazos-live-cards', '\* \* \* \* \*', \$cron\$select public\.drain_live_cards\(\);\$cron\$\);/);
  assert.match(sql, /if not exists \(select 1 from public\.live_card_outbox where status = 'pending' and attempts < 5\) then\s*return null;/, 'a call only when a row waits');
  // The group 5 review: a change during a send gets its own row; a row that never resolves gives up.
  assert.match(sql, /o\.status = 'pending' and o\.attempts = 0\) then/);
  assert.match(sql, /set status = 'failed', last_error = coalesce\(last_error, 'no answer after five tries'\)\s*where status = 'pending' and attempts >= 5;/);
  assert.match(sql, /if v_job\.status = 'cancelled' then\s*return jsonb_build_object\(\s*'stage', 'cancelled',/);
  assert.doesNotMatch(sql, /\b(drop table|drop column|rename to|rename column|truncate|delete from)\b/i, 'additive');
});

test('[static] send-live-cards: the service role first, off until Apple\'s key, the add-on\'s own content shape', () => {
  const fn = read('supabase/functions/send-live-cards/index.ts');
  const guard = fn.indexOf("!== `Bearer ${SERVICE_KEY}`");
  assert.ok(guard > 0 && guard < fn.indexOf("rpc('claim_live_card_batch'"), 'nothing is claimed before the caller is checked');
  assert.match(fn, /if \(!APNS_KEY_P8 \|\| !APNS_KEY_ID \|\| !APNS_TEAM_ID\) \{[^]*?await resolve\(row, 'skipped', 'no Apple push key on this project yet'\);/);
  // The add-on's ContentState is { title, subtitle?, progress?, … } — flat, as its widget decodes it.
  assert.match(fn, /'content-state': \{\s*title: String\(row\.state\.title \?\? ''\),\s*subtitle: String\(row\.state\.subtitle \?\? ''\),\s*progress: Number\(row\.state\.progress \?\? 0\),\s*\}/);
  assert.match(fn, /event: row\.state\.ended \? 'end' : 'update',/);
  assert.match(fn, /'apns-push-type': 'liveactivity'/);
  for (const line of fn.split('\n').filter((l) => /console\.(log|error|warn)/.test(l))) {
    assert.doesNotMatch(line, /APNS_KEY_P8|privateKey|jwt/i, 'the key is never logged');
  }
});
