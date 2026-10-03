import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Fix run, group F (built better) — the source fences for the F items.
 * Each test names the item it holds.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');

test('[static] F2: the boot path never statically imports the design studio or the catalog', () => {
  const boot = {
    'navigation/ModeShell.tsx': /components\/DesignStudioPanel/,
    'App.tsx': /dev-tools\/HomeDesignStudio/,
    'navigation/sharedStacks.tsx': /dev-tools\/ComponentCatalog/,
  };
  for (const [file, module] of Object.entries(boot)) {
    const src = strip(read(file));
    const statics = src.split('\n').filter((line) => /^\s*import\b/.test(line) && module.test(line));
    assert.deepEqual(statics, [], `${file} must not import ${module} at module scope`);
    assert.match(src, new RegExp(`require\\('[./]*${module.source}'\\)`), `${file} requires it lazily`);
  }
  // Each lazy require sits behind its own gate.
  assert.match(
    strip(read('navigation/ModeShell.tsx')),
    /const DesignStudioPanel = designStudioAvailable\s*\?\s*\(require\('\.\.\/components\/DesignStudioPanel'\)/,
  );
  assert.match(
    strip(read('App.tsx')),
    /const HomeDesignStudio = SHOW_HOME_DESIGN_STUDIO\s*\?\s*\(require\('\.\/dev-tools\/HomeDesignStudio'\)/,
  );
  assert.match(
    strip(read('navigation/sharedStacks.tsx')),
    /function ComponentCatalog\(\) \{\s*const \{ ComponentCatalog: Catalog \} =\s*require\('\.\.\/dev-tools\/ComponentCatalog'\)/,
  );
  assert.match(
    strip(read('navigation/sharedStacks.tsx')),
    /\{__DEV__ \? \(\s*<ProfileStack\.Screen name="ComponentCatalog" component=\{ComponentCatalog\} \/>/,
  );
});

test('[static] F18: the shell ground re-renders only its own view, and PostJob builds its dates once a day', () => {
  const shell = strip(read('navigation/ModeShell.tsx'));
  const modeShell = shell.slice(shell.indexOf('export function ModeShell()'), shell.indexOf('function ShellGroundView('));
  assert.ok(modeShell.length > 0, 'ModeShell precedes ShellGroundView');
  assert.doesNotMatch(modeShell, /useShellGroundState\(/, 'ModeShell holds no ground state');
  assert.match(shell, /function ShellGroundView\(\{ children \}: PropsWithChildren\) \{[\s\S]*?useShellGroundState\(\)/);
  // (F1 put the launch signal first, in the same painted view.)
  assert.match(modeShell, /<ShellGroundView>\s*(\{\}\s*)?<LaunchReadySignal \/>\s*\{treeMode === 'worker' \? <WorkerRoot \/> : <CustomerRoot \/>\}/);

  const post = strip(read('screens/PostJobScreen.tsx'));
  assert.match(post, /const dayKey = toLocalIsoDate\(new Date\(\)\);\s*const scheduleDates = useMemo\(upcomingDates, \[dayKey\]\);/);
  assert.doesNotMatch(post, /const scheduleDates = upcomingDates\(\)/);
});

test('[static] F24: the completed count names its unit, ReviewSection takes no prompt, the orphan bar tokens are gone', () => {
  assert.match(strip(read('screens/ProfileDetailsScreen.tsx')), /\{completed\} \{completed === 1 \? 'job' : 'jobs'\} completed/);
  const section = strip(read('components/ReviewSection.tsx'));
  assert.doesNotMatch(section, /\bprompt\??:/, 'the dead prop is gone from the props type');
  assert.match(section, /Thanks for rating \{revieweeFirstName\}\./);
  assert.match(section, /placeholder=\{`Share how it went with \$\{revieweeFirstName\}…`\}/);
  for (const host of ['screens/ClientJobDetailScreen.tsx', 'screens/ReviewAndTipScreen.tsx', 'screens/WorkerJobScreen.tsx']) {
    const src = strip(read(host));
    const block = src.slice(src.indexOf('<ReviewSection'));
    assert.doesNotMatch(block.slice(0, block.indexOf('/>')), /\bprompt=/, `${host} passes no prompt`);
  }
  const tokens = strip(read('ui/tokens.ts'));
  const bar = tokens.slice(tokens.indexOf('export const navBar = {'));
  assert.doesNotMatch(bar.slice(0, bar.indexOf('\n} as const;')), /\n\s*(gold|glyphColorDark):/);
});

// ---------------------------------------------------------------------------
// F19 — one date formatter. lib/time.ts imports nothing, so it loads from its
// file URL; the formatters run against fixed dates and a fixed "now".
// ---------------------------------------------------------------------------
const time = await import(new URL('../lib/time.ts', import.meta.url).href);

test('F19: formatDay and formatShortDay print one shape, with the year only when it is another one', () => {
  const now = new Date(2026, 9, 3, 12);
  assert.equal(time.formatDay(new Date(2026, 8, 30), { now }), 'Wed, Sep 30');
  assert.equal(time.formatDay(new Date(2025, 8, 30), { now }), 'Tue, Sep 30, 2025');
  assert.equal(time.formatShortDay(new Date(2026, 8, 30), { now }), 'Sep 30');
  assert.equal(time.formatShortDay(new Date(2027, 0, 4), { now }), 'Jan 4, 2027');
  assert.equal(time.formatWeekday(new Date(2026, 8, 30)), 'Wed');
  assert.equal(time.formatMonthYear(new Date(2026, 7, 15)), 'Aug 2026');
  assert.equal(time.formatClock(new Date(2026, 8, 30, 9, 30)), '9:30 AM');
  assert.equal(time.formatClock(new Date(2026, 8, 30, 21, 5)), '9:05 PM');
  // An unparseable date prints nothing, never "Invalid Date".
  assert.equal(time.formatDay(new Date('nope')), '');
  assert.equal(time.formatClock(new Date('nope')), '');
});

test('F19: a day key is read in the local calendar, and a bad key is null', () => {
  const now = new Date(2026, 9, 3);
  assert.equal(time.formatDayKey('2026-08-12', { now }), 'Wed, Aug 12');
  assert.equal(time.dateOfDayKey('2026-08-12').getDate(), 12, 'never shifted a day west of UTC');
  assert.equal(time.formatDayKey('not-a-date'), null);
  assert.equal(time.formatDayKey(null), null);
});

test('F19: a time zone moves the day and the year rule with it', () => {
  // 02:30 UTC on Jan 1 2027 is still Dec 31 2026 in New York.
  const instant = new Date(Date.UTC(2027, 0, 1, 2, 30));
  const now = new Date(Date.UTC(2026, 11, 31, 18));
  assert.equal(time.formatDay(instant, { timeZone: 'America/New_York', now }), 'Thu, Dec 31');
  assert.equal(time.formatClock(instant, { timeZone: 'America/New_York' }), '9:30 PM');
});

test('F19: the inbox stamp and the relative age fall back to the shared shapes', () => {
  const now = new Date(2026, 9, 3, 12).getTime();
  assert.equal(time.formatInboxStamp(new Date(2026, 8, 30, 12).toISOString(), now), 'Wed');
  assert.equal(time.formatInboxStamp(new Date(2026, 8, 12, 12).toISOString(), now), 'Sep 12');
  assert.equal(time.formatInboxStamp(new Date(2025, 8, 12, 12).toISOString(), now), '9/12/25');
});

test('[static] F19: no date or clock is formatted outside lib/time.ts', () => {
  const files = execFileSync('git', ['ls-files', '--', '*.ts', '*.tsx'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !f.startsWith('supabase/') && !/\.web\.tsx?$/.test(f) && f !== 'lib/time.ts');
  // lib/repeatJobs.ts imports nothing by its own fence (tests/jobSeries.test.mjs), so it spells formatDay's shape itself.
  const EXEMPT = new Set(['lib/repeatJobs.ts']);
  const offenders = files.filter((f) => !EXEMPT.has(f) && /\.toLocale(Date|Time)String\(/.test(strip(read(f))));
  assert.deepEqual(offenders, [], 'format a day or a clock through lib/time.ts');
  assert.equal((strip(read('lib/repeatJobs.ts')).match(/\.toLocaleDateString\(/g) ?? []).length, 1);
});

// ---------------------------------------------------------------------------
// F6 — one rule set. lib/jobLifecycle.ts's imports are type-only, so it loads
// from its file URL.
// ---------------------------------------------------------------------------
const lifecycle = await import(new URL('../lib/jobLifecycle.ts', import.meta.url).href);

test('F6: nextWorkerStep — nothing on the trip before held, and the trip is optional once held', () => {
  const { nextWorkerStep } = lifecycle;
  const at = '2026-10-03T15:00:00Z';
  const rows = [
    // [job, held, step]
    [{ status: 'open' }, true, null],
    [{ status: 'completed' }, true, null],
    [{ status: 'cancelled' }, true, null],
    [{ status: 'assigned' }, false, 'message'],
    [{ status: 'assigned', en_route_at: at }, false, 'message'],
    [{ status: 'assigned', en_route_at: at, arrived_at: at }, false, 'message'], // arrived but unpaid
    [{ status: 'assigned' }, true, 'en_route'],
    [{ status: 'assigned', en_route_at: at }, true, 'arrived'],
    [{ status: 'assigned', arrived_at: at }, true, 'start'],
    [{ status: 'assigned', en_route_at: at, arrived_at: at }, true, 'start'],
    [{ status: 'in_progress' }, true, 'complete'],
  ];
  for (const [job, held, step] of rows) {
    assert.equal(nextWorkerStep({ job, held }), step, `${JSON.stringify(job)} held=${held}`);
  }
});

test('F6: isLiveJob is assigned or in progress, and nothing else', () => {
  const { isLiveJob, LIVE_JOB_STATUSES } = lifecycle;
  assert.deepEqual([...LIVE_JOB_STATUSES], ['assigned', 'in_progress']);
  for (const status of ['assigned', 'in_progress']) assert.equal(isLiveJob({ status }), true);
  for (const status of ['draft', 'open', 'completed', 'cancelled', '', null, undefined]) assert.equal(isLiveJob({ status }), false);
  assert.equal(isLiveJob(null), false);
});

test('[static] F6: no screen re-decides "held" or "live" inline', () => {
  const screens = execFileSync('git', ['ls-files', '--', 'screens/*.tsx', 'components/*.tsx'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && !/\.web\.tsx$/.test(f));
  const heldInline = [];
  const liveInline = [];
  for (const file of screens) {
    const src = strip(read(file));
    if (/\.status === 'held'/.test(src)) heldInline.push(file);
    // The exact live pair. Checkout's three-status gate (assigned, in progress, completed) is the
    // phase58 fundable set, a different rule fenced in tests/fundingPath.test.mjs.
    if (/status === 'assigned' \|\| [\w?.]*status === 'in_progress'\)|status !== 'assigned' && [\w?.]*status !== 'in_progress'\)/.test(src)) liveInline.push(file);
  }
  assert.deepEqual(heldInline, [], 'read isHeld / isReleased / isReleaseRequested (lib/paymentRules.ts)');
  assert.deepEqual(liveInline, [], 'read isLiveJob (lib/jobLifecycle.ts)');
});

// ---------------------------------------------------------------------------
// F20 — duplicate screens and menus.
// ---------------------------------------------------------------------------
test('[static] F20: Route & arrival is registered nowhere, and Your job is the one stage surface', () => {
  const tracked = execFileSync('git', ['ls-files', '--', '*.ts', '*.tsx'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.ok(!tracked.includes('screens/RouteArrivalScreen.tsx'), 'the duplicate screen is gone');
  for (const file of ['navigation/sharedStacks.tsx', 'navigation/CustomerRoot.tsx', 'navigation/WorkerRoot.tsx', 'lib/navigation.ts', 'screens/WorkerJobScreen.tsx']) {
    assert.doesNotMatch(strip(read(file)), /RouteArrival/, `${file} still names RouteArrival`);
  }
  // The YOUR PROGRESS head is a heading now, not a door.
  assert.match(strip(read('screens/WorkerJobScreen.tsx')), /<View style=\{styles\.stageHead\} accessibilityRole="header">/);
});

test('F20: both person menus draw the same safety rows, in the same order, from one builder', async () => {
  const { personSafetyItems } = await import(new URL('../lib/chatMenus.ts', import.meta.url).href);
  const calls = [];
  const handlers = {
    onMute: () => calls.push('mute'),
    onBlock: () => calls.push('block'),
    onUnblock: () => calls.push('unblock'),
    onReport: () => calls.push('report'),
  };
  const open = personSafetyItems({ muted: false, blocking: false, ...handlers });
  assert.deepEqual([open.mute, ...open.safety].map((i) => [i.key, i.label, !!i.destructive]), [
    ['mute', 'Mute', false],
    ['block', 'Block', true],
    ['report', 'Report', true],
  ]);
  const blocked = personSafetyItems({ muted: true, blocking: true, ...handlers });
  assert.deepEqual([blocked.mute, ...blocked.safety].map((i) => [i.key, i.label]), [
    ['mute', 'Unmute'],
    ['block', 'Unblock'],
    ['report', 'Report'],
  ]);
  for (const item of [open.mute, ...open.safety, ...blocked.safety]) item.onPress();
  assert.deepEqual(calls, ['mute', 'block', 'report', 'unblock', 'report']);

  assert.match(strip(read('screens/ChatScreen.tsx')), /headerMenuItems\.push\(\.\.\.personRows\.safety\);/);
  assert.match(strip(read('screens/MessagesInboxScreen.tsx')), /const safety: GlassDropdownItem\[\] = \[\.\.\.person\.safety\];/);
});

test('[static] F20: ProfileDetails keeps one door to the editor — the header pencil', () => {
  const details = strip(read('screens/ProfileDetailsScreen.tsx'));
  assert.equal((details.match(/navigation\.navigate\('ProfileMain', \{ edit: true \}\)/g) ?? []).length, 1);
  assert.doesNotMatch(details, />Edit profile</, 'the card chip is gone');
});

// ---------------------------------------------------------------------------
// F3 — the chat draft lives in the composer.
// ---------------------------------------------------------------------------
test('[static] F3: a keystroke re-renders the composer, not the chat screen; a failed send restores the words', () => {
  const chat = strip(read('screens/ChatScreen.tsx'));
  const composer = strip(read('components/ChatComposer.tsx'));
  assert.doesNotMatch(chat, /const \[text, setText\] = useState/, 'the screen holds no draft state');
  assert.match(chat, /<ChatComposer\s+onSend=\{handleSendText\}\s+draft=\{draftRef\}/);
  assert.match(chat, /async function handleSendText\(content: string\): Promise<boolean> \{/);
  // A failure keeps the reply target and the words (the slot covers an unmounted composer).
  assert.match(chat, /draftRef\.current = content;\s*setReplyTo\(quoted\);\s*return false;/);
  assert.match(composer, /onSend: \(content: string\) => Promise<boolean>;/);
  assert.match(composer, /setText\(''\);\s*const sent = await onSend\(content\);\s*if \(!sent\) setText\(\(current\) => \(current\.trim\(\) \? current : content\)\);/);
  assert.match(composer, /if \(draft\) draft\.current = latestText\.current;/);
});

test('[static] F3: the rows are memoised — one stable renderer, memo bubbles, one chain map', () => {
  const chat = strip(read('screens/ChatScreen.tsx'));
  assert.match(chat, /const renderItem = useCallback\(\s*\(\{ item: entry \}: ListRenderItemInfo<TimelineItem>\) => \{/);
  assert.match(chat, /renderItem=\{renderItem\}/);
  assert.doesNotMatch(chat, /threadOffers\.filter\(/, 'a chain is looked up, not filtered per row');
  assert.match(chat, /chain=\{request \? chainsByRoot\[request\.root_offer_id\] \?\? NO_OFFERS : NO_OFFERS\}/);
  // The bubble's long-press handlers are one stable function each, given the message or the URI.
  assert.match(chat, /onLongPressMessage=\{setMenuTarget\}/);
  assert.match(chat, /onLongPressAvatarUri=\{setAvatarUri\}/);
  const bubble = strip(read('components/ChatBubble.tsx'));
  assert.match(bubble, /export const ChatBubble = memo\(function ChatBubble\(/);
  // An unsent placeholder still offers no long-press: the rule moved into the bubble, intact.
  assert.match(bubble, /const onLongPress = onLongPressMessage && !isUnsent \? \(\) => onLongPressMessage\(message\) : undefined;/);
  assert.match(strip(read('components/OfferCard.tsx')), /export const OfferCard = memo\(function OfferCard\(/);
});

test('[static] F4: one scroll path — an inverted list, an own send goes to the bottom', () => {
  const chat = strip(read('screens/ChatScreen.tsx'));
  assert.equal((chat.match(/scrollToOffset\(\{ offset: 0, animated: true \}\)/g) ?? []).length, 1, 'one own-send scroll');
  assert.match(chat, /function addOwnMessage\(message: Message\) \{\s*addLocal\(message\);/);
  assert.equal((chat.match(/if \(data\) addOwnMessage\(data\);/g) ?? []).length, 4, 'every send path takes the reader to its message');
  assert.doesNotMatch(chat, /if \(data\) addLocal\(data\);/);
  // FlashList 2 has no `inverted`; the chat stays on FlatList.
  assert.doesNotMatch(chat, /FlashList/);
});

// ---------------------------------------------------------------------------
// F5 — fifty at a time, batched signing, a stable image cache key.
// ---------------------------------------------------------------------------
const { stripTypeScriptTypes } = await import('node:module');
const toDataUrl = (js) => 'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const messagesLib = await import(
  toDataUrl(
    stripTypeScriptTypes(read('lib/messages.ts'), { mode: 'strip' })
      .replace(/import \{ supabase \} from '\.\/supabase';/, 'const supabase = null;')
      .replace(
        /import \{ resolveChatMediaUrl, resolveChatMediaUrls \} from '\.\/storage';/,
        'const resolveChatMediaUrl = async (_b, v) => v; const resolveChatMediaUrls = async (_b, vs) => vs.map((v) => v ?? null);'
      )
  )
);

test('F5: visibleWindow — a busy thread and a quiet one leave no gap', () => {
  const { visibleWindow } = messagesLib;
  const at = (iso, id) => ({ id, created_at: iso });
  // The busy thread's page reaches back to 10:00 and it holds more; the quiet
  // thread reached its start in July.
  const byThread = {
    busy: [at('2026-10-03T10:00:00Z', 'b1'), at('2026-10-03T11:00:00Z', 'b2')],
    quiet: [at('2026-07-01T09:00:00Z', 'q1'), at('2026-10-03T10:30:00Z', 'q2')],
  };
  const cursor = { busy: '2026-10-03T10:00:00Z', quiet: '2026-07-01T09:00:00Z' };
  const shown = visibleWindow(byThread, cursor, { busy: true, quiet: false }).map((m) => m.id);
  assert.deepEqual(shown, ['b1', 'q2', 'b2'], 'July waits until the busy thread has loaded back to it');
  // Once the busy thread has reached its start, everything shows, in order.
  assert.deepEqual(visibleWindow(byThread, cursor, { busy: false, quiet: false }).map((m) => m.id), ['q1', 'b1', 'q2', 'b2']);
  // An exact tie is broken by id, so the order is stable.
  const tie = visibleWindow({ a: [at('2026-10-03T10:00:00Z', 'z')], b: [at('2026-10-03T10:00:00Z', 'a')] }, {}, {});
  assert.deepEqual(tie.map((m) => m.id), ['a', 'z']);
});

async function storageWith(signedUrlsFor) {
  const calls = [];
  globalThis.__f5calls = calls;
  globalThis.__f5signed = signedUrlsFor;
  const js = stripTypeScriptTypes(read('lib/storage.ts'), { mode: 'strip' })
    .replace(
      /import \{ supabase \} from '\.\/supabase';/,
      `const supabase = { storage: { from: (bucket) => ({
        createSignedUrls: async (paths, ttl) => { globalThis.__f5calls.push({ bucket, paths, ttl }); return globalThis.__f5signed(bucket, paths); },
        createSignedUrl: async () => ({ data: null, error: new Error('single path not expected') }),
      }) } };`
    )
    .replace(/import type \{ ImagePickerAsset \} from 'expo-image-picker';\n?/, '')
    // A fresh module per case, so one case's kept URLs never answer another's.
    .concat(`\n// ${Math.random()}`);
  return { mod: await import(toDataUrl(js)), calls };
}

test('F5: the batch signer makes one call per bucket, reuses what it signed, and never hands back a raw reference', async () => {
  const { mod, calls } = await storageWith((bucket, paths) => ({
    data: paths.map((path) => ({ path, error: null, signedUrl: `https://x.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t1` })),
    error: null,
  }));
  const values = ['storage://chat-photos/j/u/1.jpg', null, 'storage://chat-photos/j/u/2.jpg', 'storage://chat-photos/j/u/1.jpg'];
  const urls = await mod.resolveChatMediaUrls('chat-photos', values);
  assert.equal(calls.length, 1, 'one signing call for the whole page');
  assert.deepEqual(calls[0].paths, ['j/u/1.jpg', 'j/u/2.jpg'], 'each object signed once');
  assert.equal(urls[1], null);
  assert.equal(urls[0], urls[3]);
  // The same objects again: kept, not re-signed — so the URL, and the image cache, are stable.
  const again = await mod.resolveChatMediaUrls('chat-photos', values);
  assert.equal(calls.length, 1);
  assert.deepEqual(again, urls);
  assert.equal(await mod.resolveChatMediaUrl('chat-photos', values[2]), urls[2], 'the single resolver reads the same keep');
});

test('F5: a failed batch resolves to null, never the storage:// reference', async () => {
  const { mod } = await storageWith(() => ({ data: null, error: new Error('denied') }));
  const urls = await mod.resolveChatMediaUrls('chat-documents', ['storage://chat-documents/j/u/1.pdf']);
  assert.deepEqual(urls, [null]);
  // A legacy public URL still falls back to itself, as the single resolver does.
  const legacy = 'https://x.supabase.co/storage/v1/object/public/chat-photos/j/u/3.jpg';
  assert.deepEqual(await mod.resolveChatMediaUrls('chat-photos', [legacy]), [legacy]);
});

test('F5: the cache key strips only a signed URL’s token', async () => {
  const { mod } = await storageWith(() => ({ data: [], error: null }));
  assert.equal(
    mod.signedUrlCacheKey('https://x.supabase.co/storage/v1/object/sign/chat-photos/j/u/1.jpg?token=abc'),
    'https://x.supabase.co/storage/v1/object/sign/chat-photos/j/u/1.jpg'
  );
  assert.equal(mod.signedUrlCacheKey('https://x.supabase.co/storage/v1/object/public/avatars/u.jpg?v=3'), undefined);
  assert.equal(mod.signedUrlCacheKey(null), undefined);
});

test('[static] F5: a page is fifty, the realtime path keeps its single resolver, the bubble keys its photo', () => {
  const lib = strip(read('lib/messages.ts'));
  assert.match(lib, /export const MESSAGE_PAGE_SIZE = 50;/);
  assert.match(lib, /resolveChatMediaUrl\('chat-documents', message\.document_url\),/);
  assert.match(strip(read('hooks/useConversationChat.ts')), /const message = await resolveMessageMedia\(payload\.new as Message\);/);
  assert.match(strip(read('components/ChatBubble.tsx')), /cacheKey=\{signedUrlCacheKey\(message\.image_url\)\}/);
  assert.match(strip(read('components/RemoteImage.tsx')), /source=\{cacheKey \? \{ uri, cacheKey \} : \{ uri \}\}/);
  assert.match(strip(read('screens/ChatScreen.tsx')), /onEndReached=\{\(\) => void loadOlder\(\)\}/);
});

test('[static] F8: Discover listens on the iOS WILL events and fades its blocks instead of snapping', () => {
  const search = strip(read('screens/WorkerSearchScreen.tsx'));
  assert.match(search, /Platform\.OS === 'ios' \? 'keyboardWillShow' : 'keyboardDidShow'/);
  assert.match(search, /Platform\.OS === 'ios' \? 'keyboardWillHide' : 'keyboardDidHide'/);
  assert.doesNotMatch(search, /addListener\('keyboardDidHide'|addListener\('keyboardDidShow'/, 'no DID event on the iOS path');
  // The two blocks leave by fading over the keyboard's duration; the blocks below travel.
  assert.match(search, /<KeyboardAway hidden=\{keyboardVisible \|\| windowHeight < 650\} durationMs=\{keyboardMs\} style=\{styles\.intro\}>/);
  assert.match(search, /<KeyboardAway hidden=\{keyboardVisible\} durationMs=\{keyboardMs\} style=\{styles\.serviceSection\}>/);
  assert.equal((search.match(/<KeyboardShift durationMs=\{keyboardMs\}/g) ?? []).length, 2);
  assert.doesNotMatch(search, /\{!keyboardVisible \? \(/, 'no block mounts and unmounts on the keyboard flag');
  // The KeyboardAvoidingView stays until F9 swaps it (the native-ui rule still asks for one).
  assert.match(search, /<KeyboardAvoidingView/);
  // The fast path is a Reanimated layout animation, never React Native's LayoutAnimation.
  const fast = strip(read('components/KeyboardAway.motion120.tsx'));
  assert.match(fast, /entering=\{reduced \|\| firstMount\.current \? undefined : entering\}/);
  assert.match(fast, /function fadeOutOver\(durationMs: number\) \{\s*return \(\) => \{\s*'worklet';/);
  assert.match(fast, /layout=\{reduced \? undefined : LinearTransition\.duration\(durationMs\)\}/);
  assert.doesNotMatch(fast, /LayoutAnimation\./);
});

// ---------------------------------------------------------------------------
// F13 — one cache (React Query), keyed per account, emptied on account change.
// ---------------------------------------------------------------------------
const queryRules = await import(new URL('../lib/queryKeys.ts', import.meta.url).href);

test('F13: the cache empties whenever the account changes or signs out — never across accounts', () => {
  const { cacheBelongsToSomeoneElse } = queryRules;
  assert.equal(cacheBelongsToSomeoneElse('a', 'a'), false, 'the same account keeps its cache');
  assert.equal(cacheBelongsToSomeoneElse('a', 'b'), true, 'another account never sees the first one’s rows');
  assert.equal(cacheBelongsToSomeoneElse('a', null), true, 'signing out empties it');
  assert.equal(cacheBelongsToSomeoneElse(null, 'b'), true, 'a fresh sign-in starts empty');
  assert.equal(cacheBelongsToSomeoneElse(null, null), false);
  // Every per-account key carries the account.
  assert.deepEqual(queryRules.queryKeys.myJobsHub('u1'), ['myJobsHub', 'u1']);
  assert.deepEqual(queryRules.queryKeys.unreadNotifications('u1'), ['notifications', 'unread', 'u1']);
});

test('F13: keep-on-error keeps a failed source’s last good rows, field by field', () => {
  const { mergeKeepOnError } = queryRules;
  const previous = { posted: ['p1'], working: ['w1'] };
  const next = { posted: [], working: ['w2'] };
  assert.deepEqual(mergeKeepOnError(previous, next, new Set(['posted'])), { posted: ['p1'], working: ['w2'] });
  assert.deepEqual(mergeKeepOnError(previous, next, new Set()), next, 'nothing failed: the new snapshot wins');
  assert.deepEqual(mergeKeepOnError(undefined, next, new Set(['posted'])), next, 'no snapshot yet: nothing to keep');
});

test('[static] F13: one client, provided inside AuthProvider around the launch gate, nothing persisted', () => {
  const app = strip(read('App.tsx'));
  assert.match(app, /<AuthProvider>\s*<QueryClientProvider client=\{queryClient\}>\s*<QueryAuthBridge \/>\s*<LaunchGate>/);
  assert.match(app, /if \(cacheBelongsToSomeoneElse\(previous\.current, userId\)\) queryClient\.clear\(\);/);
  const client = strip(read('lib/queryClient.ts'));
  assert.match(client, /staleTime: 30_000,\s*gcTime: 10 \* 60_000,\s*retry: 1,/);
  assert.match(client, /AppState\.addEventListener\('change', \(state\) => handleFocus\(state === 'active'\)\)/);
  assert.match(client, /onlineManager\.setEventListener\(\(setOnline\) => subscribeOnline\(setOnline\)\)/);
  // No persistence this run: the hub carries names and payment state.
  for (const file of execFileSync('git', ['ls-files', '--', '*.ts', '*.tsx'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)) {
    if (file.startsWith('supabase/')) continue;
    assert.doesNotMatch(strip(read(file)), /query-async-storage-persister|react-query-persist-client/, `${file} persists the cache`);
  }
  // The banner and the cache share the one NetInfo subscription.
  assert.match(strip(read('hooks/useOnline.ts')), /return subscribeOnline\(setOnline\);/);
});

test('F13: the bell asks for a count — head, exact, unread only — and every way it changes refreshes it', async () => {
  const calls = [];
  const builder = {
    select: (columns, options) => (calls.push(['select', columns, options]), builder),
    eq: (column, value) => (calls.push(['eq', column, value]), builder),
    is: (column, value) => (calls.push(['is', column, value]), Promise.resolve({ count: 140, error: null })),
  };
  globalThis.__f13supabase = { from: (table) => (calls.push(['from', table]), builder) };
  const js = stripTypeScriptTypes(read('lib/notifications.ts'), { mode: 'strip' }).replace(
    /import \{ supabase \} from '\.\/supabase';/,
    'const supabase = globalThis.__f13supabase;'
  );
  const lib = await import(toDataUrl(js));
  const { count, error } = await lib.fetchUnreadNotificationCount('u1');
  assert.equal(count, 140, 'no cap at 100');
  assert.equal(error, null);
  assert.deepEqual(calls, [
    ['from', 'notification_outbox'],
    ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'recipient_id', 'u1'],
    ['is', 'read_at', null],
  ]);

  const hook = strip(read('hooks/useUnreadNotificationCount.ts'));
  assert.match(hook, /queryKey: key, queryFn, enabled: !!userId/);
  assert.doesNotMatch(hook, /fetchNotifications\(/, 'the bell never reads rows to count them');
  const feed = strip(read('screens/NotificationsScreen.tsx'));
  assert.match(feed, /void Promise\.all\(writes\)\.then\(invalidateNotifications\);/);
  assert.match(feed, /await markAllNotificationsRead\(user\.id\);\s*void invalidateNotifications\(\);/);
  assert.match(strip(read('hooks/usePushNotifications.ts')), /addNotificationReceivedListener\(\(\) => \{\s*void invalidateNotifications\(\);/);
});

test('[static] F13: the feed is one cached query with one counted channel, and its writes land in the cache', () => {
  const feed = strip(read('hooks/useOpenJobs.ts'));
  assert.match(feed, /useQuery\(\{ queryKey: queryKeys\.openJobs, queryFn: readFeed \}\)/);
  assert.match(feed, /feedMounts \+= 1;\s*if \(feedMounts === 1\) \{\s*feedChannel = supabase\s*\.channel\(`public:jobs:open:\$\{instanceId\}:\$\{runRef\.current\+\+\}`\)/);
  assert.match(feed, /feedMounts -= 1;\s*if \(feedMounts === 0 && feedChannel\) \{\s*supabase\.removeChannel\(feedChannel\);/);
  assert.equal((feed.match(/\.channel\(/g) ?? []).length, 1, 'one channel for every mount');
  assert.doesNotMatch(feed, /useState/, 'no per-mount copy of the rows');
  assert.match(feed, /queryClient\.setQueryData<OpenJob\[\]>\(queryKeys\.openJobs,/);
  assert.match(feed, /const error = query\.error \? userMessage\(query\.error\) : null;/);
});

// ---------------------------------------------------------------------------
// F15 — Smart Match reads the worker's past jobs.
// ---------------------------------------------------------------------------
test('F15: a worker with a finished Assembly job sees Assembly first under Smart Match', async () => {
  const filters = await import(
    toDataUrl(
      stripTypeScriptTypes(read('lib/jobFilters.ts'), { mode: 'strip' }).replace(
        "from './time'",
        `from '${new URL('../lib/time.ts', import.meta.url).href}'`
      )
    )
  );
  const job = (id, category, distance) => ({ id, category, distance_miles: distance, created_at: '2026-10-01T00:00:00Z', budget_cents: null, scheduled_date: null });
  const working = [
    { category: 'furniture_assembly', status: 'completed' },
    { category: 'cleaning', status: 'in_progress' },
  ];
  const rows = [job('clean', 'cleaning', 1), job('assemble', 'furniture_assembly', 5), job('other', 'other', 0.5)];
  const context = { skills: new Set(['cleaning']), completedByCategory: filters.completedByCategory(working) };
  assert.deepEqual(
    filters.applyJobFilters(rows, filters.DEFAULT_JOB_FILTERS, context).map((j) => j.id),
    ['assemble', 'clean', 'other']
  );
});

test('[static] F15: every screen that ranks by the worker’s history reads the hub query, which loads on mount', () => {
  for (const file of ['screens/WorkerResultsScreen.tsx', 'screens/MapScreen.tsx']) {
    const src = strip(read(file));
    assert.match(src, /const \{ working \} = useMyJobsHub\(\);/, `${file} reads the hub`);
    assert.match(src, /completedByCategory\(working\)/, `${file} ranks by it`);
  }
  const hub = strip(read('hooks/useMyJobsHub.ts'));
  // The query reads on mount when there is nothing cached (React Query's default), so a screen that
  // never refreshes still gets the worker's jobs — Worker Home's focus read usually has them cached.
  assert.match(hub, /useQuery\(\{/);
  assert.doesNotMatch(hub, /refetchOnMount: false|enabled: false/);
  // Every own mutation invalidates it at its call site.
  const sites = {
    'components/OfferComposer.tsx': 2,
    'components/ReviewSection.tsx': 1,
    'hooks/useJobOwnerActions.ts': 1,
    'screens/ApproveOrDisputeScreen.tsx': 3,
    'screens/BidDetailScreen.tsx': 2,
    'screens/ChatScreen.tsx': 1,
    'screens/ClientJobDetailScreen.tsx': 2,
    'screens/JobConfirmedScreen.tsx': 1,
    'screens/JobDetailScreen.tsx': 4,
    'screens/PostJobScreen.tsx': 3,
    'screens/ReviewAndTipScreen.tsx': 1,
    'screens/WorkerJobScreen.tsx': 5,
  };
  for (const [file, count] of Object.entries(sites)) {
    assert.equal((strip(read(file)).match(/invalidateJobs\(\);/g) ?? []).length, count, `${file} invalidates after each own mutation`);
  }
});

// ---------------------------------------------------------------------------
// F1 — cold start: the launch layer waits for the first real screen; the mode
// reads start with the session.
// ---------------------------------------------------------------------------
test('[static] F1: the layer holds for real content, capped by a named constant; every branch reports', () => {
  const app = strip(read('App.tsx'));
  assert.match(app, /const LAUNCH_HOLD_CAP_MS = 2500;/);
  assert.match(app, /const cap = setTimeout\(\(\) => setHoldCapped\(true\), LAUNCH_HOLD_CAP_MS\);/);
  assert.match(app, /<LaunchHoldContext\.Provider value=\{reportLaunchReady\}>/);
  assert.match(app, /sessionReady=\{!loading && \(contentReady \|\| holdCapped\)\}/);
  // Every RootNavigator branch but the loader and the tabs reports; the tabs report from ModeShell.
  assert.match(app, /const holdsLoader = loading \|\| \(!!user && \(legal\.state === 'loading' \|\| setup\.state === 'loading'\)\);/);
  assert.match(app, /const reachesTabs = !!user && !recoveryPending && setup\.state === 'complete' && legal\.state === 'accepted';/);
  assert.match(app, /const drawsContent = !holdsLoader && !reachesTabs;\s*useEffect\(\(\) => \{\s*if \(drawsContent\) reportLaunchReady\(\);/);
  const shell = strip(read('navigation/ModeShell.tsx'));
  assert.match(shell, /function LaunchReadySignal\(\) \{\s*const report = useReportLaunchReady\(\);\s*return <View style=\{styles\.signal\} pointerEvents="none" onLayout=\{report\} \/>;/);
  // LaunchScreen itself is untouched: the exit condition is still the one flag it is handed.
  assert.match(strip(read('screens/LaunchScreen.tsx')), /if \(!sessionReady \|\| exitStarted\.current\) return;/);
});

test('[static] F1: the mode reads start with the session; the decision and the landing stay at arm time', () => {
  const provider = strip(read('modes/ModeProvider.tsx'));
  assert.match(provider, /function readModeSources\(userId: string\) \{\s*return Promise\.all\(\[readCachedMode\(userId\), fetchMyActiveMode\(\), readPendingModeWrite\(userId\)\]\);/);
  assert.match(provider, /prefetchRef\.current = \{ userId, startedAt: Date\.now\(\), reads: readModeSources\(userId\) \};/);
  assert.match(provider, /const MODE_PREFETCH_FRESH_MS = 10_000;/);
  // The landing is still consumed synchronously when the shell arms, before the reads are awaited.
  const armed = provider.slice(provider.indexOf('if (!armed || !userId || resolvedFor === userId) return;'));
  assert.ok(armed.indexOf('consumePendingLanding()') < armed.indexOf('await reads'), 'the landing is taken at arm time');
});

// ---------------------------------------------------------------------------
// F7 — the typed client.
// ---------------------------------------------------------------------------
test('[static] F7: the client is typed over the generated types, with one stated correction', () => {
  const client = strip(read('lib/supabase.ts'));
  assert.match(client, /export const supabase = createClient<Database>\(/);
  assert.match(client, /import type \{ Database \} from '\.\/supabaseTypes';/);
  assert.equal((client.match(/storage: secureSessionStorage/g) ?? []).length, 1);
  const types = strip(read('lib/supabaseTypes.ts'));
  assert.match(types, /import type \{ Database as GeneratedDatabase \} from '\.\.\/types\/database';/);
  // The one correction: a function argument also accepts null. Rows, inserts, updates,
  // views, enums and returns are the generator's own.
  assert.match(types, /type NullableArgs<A> = A extends Record<string, unknown> \? \{ \[K in keyof A\]: A\[K\] \| null \} : A;/);
  assert.match(types, /P extends 'Args' \? NullableArgs<F\[N\]\[P\]> : F\[N\]\[P\]/);
  assert.match(types, /P extends 'Functions' \? WithNullableFunctionArgs<F> : GeneratedDatabase\[S\]\[P\]/);
  // The frozen web client stays untyped and untouched.
  assert.doesNotMatch(read('lib/supabase.web.ts'), /createClient</);
  // No `as any` stands at a .from / .rpc call site.
  for (const file of execFileSync('git', ['ls-files', '--', 'lib/*.ts', 'hooks/*.ts', 'screens/*.tsx', 'components/*.tsx'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)) {
    if (/\.web\.tsx?$/.test(file)) continue;
    assert.doesNotMatch(strip(read(file)), /\.(from|rpc)\([^)]*\)[^;]*\bas any\b/, `${file} casts a query to any`);
  }
});
