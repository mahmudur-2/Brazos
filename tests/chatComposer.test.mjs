import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const flatten = (source) => stripComments(source).replace(/\s+/g, ' ');

// ===========================================================================
// THE REBUILT CHAT COMPOSER — 2026-08-23.
//
// Four naked controls (camera, photo library, record-mic, filled send disc)
// plus a fixed-height quick-reply row above them became three zones: the
// [ + ] drop-up, the field, and ONE control that morphs between a dictation
// mic and the send arrow.
//
// The properties below are the ones a later run could plausibly undo while
// believing it was fixing something, so each is pinned with the reason:
//
//   1. THE TWO MICS ARE DIFFERENT MICS. Right = dictation (speech into the
//      field, through lib/voiceSearch, sends nothing). [ + ] > Voice Message
//      = an audio clip that becomes a bubble. They were ONE glyph doing the
//      second job, and a user reaching for the first got an audio file.
//   2. NEVER A DEAD CONTROL, in both directions — the mic waits on the
//      boundary AFFIRMING recognition, and the [ + ] renders only if its menu
//      would have an entry.
//   3. THE ATTACHMENT GATE SURVIVED THE REDESIGN. A direct thread has no job
//      id to key storage on, so its media entries stay hidden.
//   4. A FLAGGED ENTRY NEEDS ITS HANDLER TOO, so flipping a flag without
//      wiring the action still cannot produce a row that does nothing.
//   5. QUICK REPLIES ARE GONE, tree-wide, component and templates together.
// ===========================================================================

const COMPOSER = 'components/ChatComposer.tsx';
const DROPMENU = 'components/DropMenu.tsx';
const DROPMENU_SHARED = 'components/DropMenu.shared.tsx';
const DROPMENU_FAST = 'components/DropMenu.motion120.tsx';
const METER = 'components/AudioMeterBars.tsx';
const RECORDER = 'hooks/useVoiceRecorder.ts';
const CHAT = 'screens/ChatScreen.tsx';

const meter = await import('../lib/audioMeter.ts');
const ticks = await import('../lib/messageTicks.ts');
const webRoute = await import('../lib/webRoute.ts');
const inbox = await import('../lib/inboxFilters.ts');
const menus = await import('../lib/chatMenus.ts');
const translate = await import('../lib/translateRules.ts');

test('[static] the composer is three zones, and every glyph is bare', () => {
  const flat = flatten(read(COMPOSER));

  // ZONE 1 — the [ + ]. `colors.ink` is the palette's strongest content
  // colour: the cream that reads as WHITE in dark, its opposite number in
  // light. One token, both themes, no isDark fork on this glyph.
  assert.match(flat, /<Ionicons name="add" size=\{ICON_GLYPH_SIZE \+ 4\} color=\{colors\.ink\} \/>/);
  // ZONE 2 — the field, and it FLEXES: the row's whole point is that the
  // input gets the width the four old controls were taking.
  assert.match(flat, /input: \{ flex: 1,/);
  // ZONE 3 — one fixed box holding two layers, so the row's width cannot
  // change as the text does.
  assert.match(flat, /morphSlot: \{ width: COMPOSER_CONTROL_SIZE, height: COMPOSER_CONTROL_SIZE,? \}/);
  assert.match(flat, /morphLayer: \{ \.\.\.StyleSheet\.absoluteFillObject,/);

  // NO DISC BEHIND THE GLYPHS. The old send button was a filled primary
  // circle (and a gold-ringed one in dark); that ring is what made the row
  // read as a toolbar rather than as a text field.
  assert.doesNotMatch(flat, /sendBtn|sendBtnDark/, 'the filled send disc is retired');
  const iconBtn = /iconBtn: \{([^}]*)\}/.exec(flat);
  assert.ok(iconBtn, 'the shared control box must stay a plain style');
  assert.doesNotMatch(
    iconBtn[1],
    /backgroundColor|borderWidth/,
    'the control box is a touch target, not a chrome — no fill, no ring'
  );

  // THE MORPH runs on transform + opacity, which is what keeps it on the
  // native driver while someone is typing into the field beside it.
  assert.match(flat, /useNativeDriver: USE_NATIVE_DRIVER/);
  assert.match(flat, /opacity: morph\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[1, 0\] \}\)/);
  assert.match(flat, /opacity: morph,/);
  // Only the visible layer takes touches, or a fading-out mic eats the send.
  assert.match(flat, /pointerEvents=\{showSend \? 'none' : 'auto'\}/);
  assert.match(flat, /pointerEvents=\{showSend \? 'auto' : 'none'\}/);
});

test('[static] the right mic is DICTATION and the voice MESSAGE moved into the menu', () => {
  const source = stripComments(read(COMPOSER));

  // Dictation goes through the same on-device boundary the search bars use.
  assert.match(source, /import \{ voiceSearch, type VoiceSession \} from '\.\.\/lib\/voiceSearch'/);
  assert.match(source, /voiceSearch\.beginSession\(\{/);
  // The transcript's ONE egress is the caller's onChangeText — the boundary's
  // own contract, and it must not gain a second consumer here.
  assert.match(source, /onTranscript: \(phrase\) => onChangeText\(joinDictation\(baseTextRef\.current, phrase\)\)/);
  // A second tap stops and commits, and an unmount cancels without committing.
  assert.match(source, /sessionRef\.current\.stop\(\);/);
  assert.match(source, /return \(\) => sessionRef\.current\?\.cancel\(\);/);

  // Dictation APPENDS. A search field replaces; someone half-way through a
  // sentence means "and then this", not "instead".
  assert.match(source, /function joinDictation\(base: string, phrase: string\): string \{/);

  // The voice MESSAGE recorder is now a menu entry, and `onMicTap` — the prop
  // that arms it — is reached from there and nowhere else in this row.
  assert.match(source, /key: 'voice', label: 'Voice Message', icon: 'mic-outline', onPress: onMicTap/);
  const micGlyphs = [...source.matchAll(/name=\{listening \? 'mic' : 'mic-outline'\}/g)];
  assert.equal(micGlyphs.length, 1, 'exactly one mic glyph renders in the row, and it is the dictation one');
});

test('[static] no dead control: the mic waits on the boundary, the [ + ] on having an entry', () => {
  const source = stripComments(read(COMPOSER));

  // False until the boundary AFFIRMS recognition on this binary; every
  // degraded case leaves the mic unrendered rather than disabled.
  assert.match(source, /const \[dictationReady, setDictationReady\] = useState\(false\);/);
  assert.match(source, /setDictationReady\(availability\.status === 'available'\)/);
  assert.match(source, /\{dictationReady && \(/, 'the mic layer must be conditional on readiness');
  // With no dictation the send arrow still appears — with text, and only then.
  assert.match(source, /const showSend = !listening && text\.trim\(\)\.length > 0;/);
  assert.match(source, /const sendDisabled = !text\.trim\(\) \|\| sending \|\| busy \|\| isPreviewing;/);

  // The [ + ] is absent, not empty, when the thread can take no attachment —
  // and absent again while a take is running, where a greyed-out button beside
  // a live recording would take space the waveform can use.
  assert.match(source, /\{!isRecording && menuItems\.length > 0 && \(/);
});

test('[static] the attachment gate survived the redesign, and the flags need their handlers', () => {
  const source = stripComments(read(COMPOSER));

  // A direct thread (no job) has no path to key an upload on, so its media
  // entries are hidden rather than offered and then failing. Camera and the
  // recorder are additionally native-only.
  assert.match(source, /if \(allowAttachments && showCameraAndMic\) \{\s*menuItems\.push\(\{ key: 'camera'/);
  assert.match(source, /if \(allowAttachments\) \{\s*menuItems\.push\(\{ key: 'photos'/);
  assert.match(source, /if \(allowAttachments && showCameraAndMic\) \{\s*menuItems\.push\(\{\s*key: 'voice'/);

  // FLAG **AND** HANDLER. The flag alone is not enough: a flipped flag with
  // no wired action would be exactly the dead row featureFlags.ts exists to
  // prevent.
  assert.match(source, /if \(LIVE_LOCATION && onShareLiveLocation\) \{/);
  assert.match(source, /if \(DOCUMENTS && onPickDocument\) \{/);
  assert.match(source, /import \{ DOCUMENTS, LIVE_LOCATION \} from '\.\.\/lib\/featureFlags';/);
});

test('[static] the drop-up is the shared DropMenu, on the boundary timings', () => {
  const composer = stripComments(read(COMPOSER));
  const menu = stripComments(read(DROPMENU));

  assert.match(composer, /<DropMenu\s+visible=\{menuOpen\}/);
  assert.match(composer, /direction="up"/, 'the composer sits at the bottom of the screen');
  // Anchored, not measured: a measured menu flickers on its first frame.
  assert.match(composer, /anchor: \{\s*position: 'relative',/);

  // ONE menu for the app — the composer's drop-up, the chat header's dropdown
  // and the inbox row's actions. Three of these written three times would be
  // three tempos.
  //
  // 2026-08-23 — THE MENU SPLIT INTO TWO DRIVERS AND ONE BODY. DropMenu.tsx
  // still holds the core-Animated fallback, DropMenu.motion120.tsx holds the
  // worklet-spring fast path, and everything a user can NAME — items,
  // backdrop, geometry, colours, dismissal — moved to DropMenu.shared.tsx so
  // the two binaries cannot drift into two menus. These assertions moved with
  // the code they describe; none of them was dropped.
  const shared = stripComments(read(DROPMENU_SHARED));

  assert.match(menu, /MENU_MOTION_MS,\s*MENU_MOTION_OUT_MS,/);
  assert.match(menu, /from '\.\.\/lib\/motion120'/);
  assert.match(menu, /duration: reducedMotion \? 0 : visible \? MENU_MOTION_MS : MENU_MOTION_OUT_MS/);
  assert.match(menu, /useNativeDriver: USE_NATIVE_DRIVER/);
  // It grows FROM the anchor in both directions, so the origin of the motion
  // is the button either way — and the travel is stated ONCE, in the shared
  // module, so both drivers move the same distance.
  assert.match(shared, /export const PANEL_TRAVEL = 8;/);
  assert.match(
    shared,
    /return direction === 'up' \? PANEL_TRAVEL : -PANEL_TRAVEL;/,
    'the direction rule belongs to both paths',
  );
  assert.match(menu, /const travel = panelTravelFor\(direction\);/);
  // Kept mounted through the exit, or every dismissal is a hard cut.
  assert.match(menu, /if \(finished && !visible\) setMounted\(false\);/);
  // Outside-tap dismissal exists and is announced.
  assert.match(shared, /accessibilityLabel=\{closeLabel\}/);
  // Rows meet the touch floor by their DRAWN height — adjacent rows with
  // overlapping hitSlop would steal each other's taps.
  assert.match(shared, /minHeight: 46,/);
});

// ---------------------------------------------------------------------------
// THE VOICE RECORDER — three phases, a REAL waveform, and no invented one.
// ---------------------------------------------------------------------------

test('[static] metering is asked for explicitly, because every preset has it off', () => {
  const recorder = stripComments(read(RECORDER));
  // expo-audio's own createRecordingOptions does `options.isMeteringEnabled ??
  // false`, so RecordingPresets.HIGH_QUALITY alone reports no levels at all
  // and the waveform would be permanently indeterminate.
  assert.match(
    recorder,
    /useAudioRecorder\(\{ \.\.\.RecordingPresets\.HIGH_QUALITY, isMeteringEnabled: true \}\)/,
    'the live waveform needs metering turned on by name'
  );
  // The window advances on the POLL, not on the level changing: a run of
  // identical readings is exactly what silence is, and a component watching
  // `metering` alone would freeze the waveform through it.
  assert.match(recorder, /recorderState\.durationMillis, recorderState\.metering\]/);
  // Each take starts from silence rather than inheriting the last one's shape.
  assert.match(recorder, /resetMeter\(\);\s*setPhase\('recording'\)/);
  // "No metering on this binary" is a latched fact, not a per-frame guess.
  assert.match(recorder, /meterLevels: phase === 'recording' && meteringSeen \? meterLevels : null/);
});

test('[executed] the meter maps dBFS honestly, and NULL never collapses into silence', () => {
  // The floor is what makes speech use the height: iOS reports down to -160,
  // and mapping the full range pins every ordinary voice in the top sixth.
  assert.equal(meter.METER_FLOOR_DB, -60);

  // The two facts that must stay distinct.
  assert.equal(meter.normalizeMeter(undefined), null, 'no reading is not silence');
  assert.equal(meter.normalizeMeter(null), null);
  assert.equal(meter.normalizeMeter(NaN), null, 'a NaN reading is no reading');
  assert.equal(meter.normalizeMeter(-Infinity), null, 'and neither is an infinite one');
  assert.equal(meter.normalizeMeter(-60), 0, 'the floor IS silence, and it is a real 0');
  assert.equal(meter.normalizeMeter(-160), 0, 'below the floor clamps rather than going negative');

  // The range in between, and both ends of it.
  assert.equal(meter.normalizeMeter(0), 1);
  assert.equal(meter.normalizeMeter(12), 1, 'a positive reading clamps rather than overflowing the bar');
  assert.equal(meter.normalizeMeter(-30), 0.5);
  assert.ok(Math.abs(meter.normalizeMeter(-15) - 0.75) < 1e-9);

  // The window is fixed-width BY CONSTRUCTION, so no caller can grow it into
  // an unbounded recording of the take.
  const start = meter.emptyMeterWindow();
  assert.equal(start.length, meter.METER_BAR_COUNT);
  assert.ok(start.every((v) => v === 0));
  let window = start;
  for (const level of [0.2, 0.4, 0.9]) window = meter.advanceMeterWindow(window, level);
  assert.equal(window.length, meter.METER_BAR_COUNT);
  assert.deepEqual(window.slice(-3), [0.2, 0.4, 0.9], 'newest samples arrive at the RIGHT');
  assert.deepEqual(start, meter.emptyMeterWindow(), 'and the previous window is not mutated');
});

test('[static] the waveform is never synthesised, and silence still draws', () => {
  const bars = stripComments(read(METER));

  // THE LINE THIS FENCE EXISTS FOR. A pseudo-random or sine-driven "waveform"
  // over a mic nobody is measuring is a picture of nothing presented as a
  // picture of your voice.
  assert.doesNotMatch(bars, /Math\.random|Math\.sin|Math\.cos/, 'no invented amplitude, ever');

  // No metering -> an INDETERMINATE pulse, visibly not a waveform.
  assert.match(bars, /const indeterminate = levels === null;/);
  assert.match(bars, /opacity: pulse\.interpolate\(\{ inputRange: \[0, 1\], outputRange: \[0\.35, 1\] \}\)/);
  // ...and it is announced as something different, too.
  assert.match(bars, /indeterminate \? 'Recording' : 'Recording, microphone level'/);

  // Silence draws a floor: a flat line reads as "broken", not as "quiet".
  assert.match(bars, /const BAR_MIN_SCALE = 0\.12;/);
  assert.match(bars, /scaleY: Math\.max\(BAR_MIN_SCALE, Math\.min\(1, level\)\)/);
  // SCALE, not height — ten updates a second must cost zero Yoga passes.
  assert.doesNotMatch(bars, /height: [\d.]+ \+ /, 'bars are scaled, not re-laid-out');
  assert.match(bars, /useNativeDriver: USE_NATIVE_DRIVER/);
});

test('[static] the three recorder phases each render their own controls', () => {
  const flat = flatten(read(COMPOSER));

  // RECORDING — one pill holding the live dot, the waveform and the elapsed
  // time, with the stop OUTSIDE it, so the pill is a readout and the row keeps
  // exactly one button.
  assert.match(flat, /<View style=\{styles\.recordingPill\}> <View style=\{styles\.recordingDot\} \/> <AudioMeterBars levels=\{recorderLevels\} \/>/);
  assert.match(flat, /<Text style=\{styles\.recordingTime\}>\{formatClipDuration\(recorderDurationMs\)\}<\/Text>/);
  assert.match(flat, /accessibilityLabel="Stop recording"/);
  // The pill is EMERALD, not danger: a take in progress is not an error. The
  // one red thing in it is the universal live-dot.
  const pill = /recordingPill: \{([^}]*)\}/.exec(flat);
  assert.ok(pill, 'the recording pill must stay a plain style');
  assert.match(pill[1], /borderColor: withAlpha\(colors\.emerald, 0\.45\)/);
  assert.match(pill[1], /backgroundColor: withAlpha\(colors\.emerald, 0\.1\)/);
  // Tabular figures, or the pill's width jitters once a second and the
  // waveform appears to slide.
  assert.match(flat, /recordingTime: \{[^}]*fontVariant: \['tabular-nums'\]/);

  // PREVIEW — X to discard, the clip's own scrubber, arrow-up to send.
  assert.match(flat, /accessibilityLabel="Discard recording" > <Ionicons name="close"/);
  assert.match(flat, /<VoiceNote url=\{previewUri\} durationMs=\{recorderDurationMs\} isOwn=\{false\} \/>/);
  assert.match(flat, /accessibilityLabel="Send voice message" > <Ionicons name="arrow-up"/);

  // And the levels come from the recorder rather than from the composer, so
  // there is one source for what the bars mean.
  assert.match(stripComments(read('screens/ChatScreen.tsx')), /recorderLevels=\{recorder\.meterLevels\}/);
});

// ---------------------------------------------------------------------------
// THE CHAT HEADER — 2026-08-23. Avatar, serif name, three gold dots.
// ---------------------------------------------------------------------------

test('[static] the header carries the face on the left and one affordance on the right', () => {
  const chat = stripComments(read(CHAT));
  const header = stripComments(read('components/ScreenHeader.tsx'));

  // The shared header gained a LEADING slot rather than chat growing a
  // bespoke header of its own and losing the serif-title convention with it.
  assert.match(header, /leading\?: ReactNode;/);
  assert.match(header, /\{leading\}\s*\{onPressTitle \?/, 'leading sits between the back control and the title');

  // The avatar opens the SAME view-only viewer the message avatars open.
  assert.match(chat, /<Avatar uri=\{counterparty\.avatar_url\} name=\{counterparty\.full_name\} size=\{34\} \/>/);
  assert.match(chat, /allowShare=\{false\}/, 'a profile photo is view-only — forwarding it is not an affordance');
  // No photo is a real state and it must not be a dead button.
  assert.match(chat, /disabled=\{!counterparty\.avatar_url\}/);

  // The chip is gone; the dots are gold LINE-WORK, not a filled pill.
  assert.doesNotMatch(chat, /hireAgainButton|hireAgainLabel/, 'the Hire Again chip is retired from the header');
  assert.match(chat, /<Ionicons name="ellipsis-horizontal" size=\{22\} color=\{colors\.gold\} \/>/);
  const dots = /headerDots: \{([^}]*)\}/.exec(chat.replace(/\s+/g, ' '));
  assert.ok(dots, 'the dots must stay a plain style');
  assert.doesNotMatch(dots[1], /backgroundColor|borderWidth/, 'gold is line-work here too');

  // zIndex is load-bearing: the menu drops DOWN out of the header and the
  // message column is a LATER sibling, so without it the dropdown would
  // render beneath the messages it covers.
  assert.match(chat, /headerLayer: \{\s*zIndex: 20,\s*\}/);
  assert.match(chat, /<View style=\{styles\.headerLayer\}>/);
  assert.match(chat, /headerMenuAnchor: \{\s*position: 'relative',\s*\}/);
  assert.match(chat, /direction="down"/);
  assert.match(chat, /align="right"/);
});

test('[static] the overflow menu is MODE-shaped, and perspective comes from ModeContext', () => {
  const chat = stripComments(read(CHAT));

  // Repo rule: perspective is never a hand-passed prop.
  assert.match(chat, /import \{ useMode \} from '\.\.\/modes';/);
  assert.match(chat, /const \{ mode \} = useMode\(\);/);
  assert.match(chat, /if \(mode === 'customer'\) \{/);

  // The customer's set. Hire Again is gated on the relationship, and Save is
  // gated on the read having landed — a row that cannot say which way it
  // would toggle is not offered yet.
  const customer = chat.slice(chat.indexOf("if (mode === 'customer') {"), chat.indexOf('} else {'));
  for (const key of ['hire-again', 'reviews', 'save-worker', 'share-profile']) {
    assert.match(customer, new RegExp(`key: '${key}'`), `the customer menu must offer ${key}`);
  }
  assert.match(customer, /if \(savedWorker !== null\) \{/);
  assert.match(customer, /label: savedWorker \? 'Saved — tap to remove' : 'Save Worker'/);

  // The worker's set. There is deliberately no "save a customer": no such
  // list exists in this product, and inventing one to balance the two menus
  // would be inventing a feature.
  const worker = chat.slice(chat.indexOf('} else {', chat.indexOf("if (mode === 'customer') {")));
  for (const key of ['view-profile', 'reviews']) {
    assert.match(worker, new RegExp(`key: '${key}'`), `the worker menu must offer ${key}`);
  }
  assert.doesNotMatch(worker, /key: 'save-worker'|key: 'hire-again'|key: 'share-profile'/);

  // MUTE IS LIVE IN BOTH MENUS, not flagged. The dispatch expected a flag; the
  // repo already had `mutes` (phase13) and lib/moderation's muteUser/unmuteUser
  // wired into the inbox, and a conversation in BRAZOS IS a person — the inbox
  // is keyed by counterparty — so per-user and per-conversation mute are the
  // same feature. Flagging it would have hidden working behaviour.
  assert.equal((chat.match(/headerMenuItems\.push\(muteMenuItem\);/g) ?? []).length, 2);
  assert.match(chat, /label: relation\.muted \? 'Unmute' : 'Mute'/);
  assert.match(chat, /await unmuteUser\(user\.id, counterpartyId\)/);
  assert.match(chat, /await muteUser\(user\.id, counterpartyId\)/);
  // ...and it re-reads rather than flipping a local copy: the same relation
  // carries the block state the composer gate reads.
  assert.match(chat, /setRelation\(await fetchRelation\(user\.id, counterpartyId\)\)/);

  // Nothing was extracted or duplicated for Save: lib/savedWorkers was
  // already shared, and this calls it directly — with a rollback.
  assert.match(chat, /import \{ fetchSavedWorkerIds, saveWorker, unsaveWorker \} from '\.\.\/lib\/savedWorkers';/);
  assert.match(chat, /setSavedWorker\(!next\);/, 'an optimistic toggle owes a rollback');
});

test('[static] Share Profile builds its URL from ONE constant and shares a name with it', () => {
  const chat = stripComments(read(CHAT));
  // RAW, not comment-stripped: the naive stripper every fence in this repo
  // uses eats `//` wherever it appears, and a URL literal contains one.
  const links = read('lib/appLinks.ts');
  const sharing = stripComments(read('lib/sharing.ts'));

  // One constant, one path shape, one place to change when the domain exists.
  assert.match(links, /export const PROFILE_WEB_BASE_URL = '[^']+';/);
  assert.match(links, /return `\$\{PROFILE_WEB_BASE_URL\}\/profile\/\$\{encodeURIComponent\(userId\)\}`;/);
  // The id is the ONLY user datum in the URL, and it is encoded.
  assert.doesNotMatch(links, /full_name|email|phone/);

  // React Native's own Share for a LINK — the download-then-share dance
  // sharePhoto needs would buy no extra target here.
  assert.match(sharing, /export async function shareProfileLink\(/);
  assert.match(sharing, /const url = profileUrl\(userId\);/);
  assert.match(sharing, /await Share\.share\(\{ url, message \}\)/);
  // A bare URL is a grey rectangle in Messages, and the name is also the part
  // that still works before the domain resolves.
  assert.match(sharing, /const message = name \? `\$\{name\} on BRAZOS: \$\{url\}` : url;/);
  // Dismissing the browser's own share UI is a cancellation, not a failure.
  assert.match(sharing, /if \(err instanceof Error && err\.name === 'AbortError'\) return \{ ok: true \};/);

  assert.match(chat, /await shareProfileLink\(counterpartyId, counterparty\?\.full_name\)/);
  assert.match(chat, /if \(!result\.ok\) await alertAsync\('Could not share', result\.message\);/);
});

test('[static] the report sheet can block in the same breath, and says so when it is done', () => {
  const dialog = stripComments(read('components/ReportDialog.tsx'));

  // The EXISTING permanent block, opt-in. No new store, and no timed variant
  // implied — that one waits on TIMED_BLOCK.
  assert.match(dialog, /import \{ blockUser, createReport, REPORT_REASONS, type ReportReason \}/);
  assert.match(dialog, /const \[alsoBlock, setAlsoBlock\] = useState\(false\);/);
  assert.match(dialog, /if \(alsoBlock\) \{\s*const \{ error: blockError \} = await blockUser\(reporterId, reportedId\);/);
  // THE REPORT IS THE PRIMARY ACTION: a failed block is named on its own, or
  // someone files the same report twice believing the first did not land.
  assert.match(dialog, /alertAsync\('Reported, but not blocked', userMessage\(blockError\)\)/);
  assert.match(dialog, /Also block this person/);

  // THE SENT STATE replaces the sheet's body rather than firing an alert
  // after the sheet has already closed — a confirmation that appears
  // somewhere else once the thing you were looking at is gone reads as an
  // interruption rather than as an answer.
  assert.match(dialog, /const \[sent, setSent\] = useState\(false\);/);
  assert.match(dialog, /\{sent \? \(/);
  assert.match(dialog, /<Ionicons name="checkmark" size=\{26\}/);
  assert.match(dialog, /Sent to the Brazos team/);
  assert.match(dialog, /const SENT_DISMISS_MS = 1600;/);
  assert.match(dialog, /dismissTimer\.current = setTimeout\(/);
  // A sheet unmounted mid-confirmation must not close something else later.
  assert.match(dialog, /if \(dismissTimer\.current\) clearTimeout\(dismissTimer\.current\);/);
  // The old fire-and-forget alert is gone.
  assert.doesNotMatch(dialog, /alertAsync\(\s*'Report sent'/);
});

// ---------------------------------------------------------------------------
// THE DELIVERY TICKS — all three states drawn and tested, ONE of them wired.
//
// The element has to be able to draw all three long before two of them can be
// produced from live data, or the day the schema lands is the day the UI gets
// written under time pressure. The flags carry the verdicts; these carry the
// behaviour.
// ---------------------------------------------------------------------------

test('[executed] the tick state is the strongest the evidence supports, never stronger', () => {
  // SENT is the floor and the only state today's schema can prove.
  assert.equal(ticks.tickStateFor({}), 'sent');
  assert.equal(ticks.tickStateFor({ deliveredAt: null, readAt: null }), 'sent');
  assert.equal(ticks.tickStateFor({ deliveredAt: undefined, readAt: undefined }), 'sent');

  assert.equal(ticks.tickStateFor({ deliveredAt: '2026-08-23T10:00:00Z' }), 'delivered');
  assert.equal(
    ticks.tickStateFor({ deliveredAt: '2026-08-23T10:00:00Z', readAt: '2026-08-23T10:01:00Z' }),
    'read'
  );
  // READ IMPLIES DELIVERED: a message someone opened reached their device by
  // definition, so a gap in delivery plumbing must not silently downgrade a
  // fact we actually know.
  assert.equal(ticks.tickStateFor({ readAt: '2026-08-23T10:01:00Z' }), 'read');
  // The reverse is NOT assumed.
  assert.notEqual(ticks.tickStateFor({ deliveredAt: '2026-08-23T10:00:00Z' }), 'read');
});

test('[executed] the read watermark covers what it covers, and a missing one covers nothing', () => {
  const at = '2026-08-23T12:00:00Z';
  assert.equal(ticks.coveredByReadWatermark('2026-08-23T11:59:59Z', at), true);
  assert.equal(ticks.coveredByReadWatermark(at, at), true, 'the boundary is inclusive');
  assert.equal(ticks.coveredByReadWatermark('2026-08-23T12:00:01Z', at), false);
  // A missing watermark reads as NOT READ, never as read — the direction that
  // matters, because the other way round claims someone saw something.
  assert.equal(ticks.coveredByReadWatermark(at, null), false);
  assert.equal(ticks.coveredByReadWatermark(at, undefined), false);
  assert.equal(ticks.coveredByReadWatermark(at, ''), false);
});

test('[static] the element draws all three states, own bubbles only, from palette tokens', () => {
  const el = stripComments(read('components/MessageTicks.tsx'));
  const bubble = stripComments(read('components/ChatBubble.tsx'));

  // One tick for sent, two for the other two, gold for read.
  assert.match(el, /const read = state === 'read';/);
  assert.match(el, /const double = state !== 'sent';/);
  assert.match(el, /const color = read \? colors\.gold : withAlpha\(colors\.onPrimary, 0\.75\);/);
  // Palette tokens, not white literals: `onPrimary` at the same 0.75 the
  // timestamp beside it uses IS what "white" means on a filled own-bubble.
  assert.doesNotMatch(el, /#[0-9a-fA-F]{3,8}|'white'/, 'no colour literals in a tick');
  // All three states are announced, so the mark is not sighted-only.
  assert.match(el, /read \? 'Read' : state === 'delivered' \? 'Delivered' : 'Sent'/);

  // OWN MESSAGES ONLY, and unsent messages carry no tick at all — there is
  // nothing left to have delivered.
  assert.match(bubble, /\{isOwn && !isUnsent \? <MessageTicks state=\{tickStateFor\(delivery \?\? \{\}\)\} \/> : null\}/);
  // Absent delivery info resolves to `sent`, which is every message today.
  assert.match(bubble, /delivery\?: MessageDelivery;/);
});

test('[static] a quoted bubble widens to fit its quote; an unquoted bubble is untouched', () => {
  const bubble = stripComments(read('components/ChatBubble.tsx'));

  // THE QUOTE STRIP MUST CONTRIBUTE INTRINSIC WIDTH. Written as `flex: 1` the
  // body resolved to flexBasis 0, and Yoga measures a fit-content row from the
  // sum of its children's flex BASES — so the strip measured to its rail, its
  // gaps and the thumbnail, the bubble sized to the MESSAGE text instead, and
  // the quote was truncated into the remainder: "HE…" over a "Hello sir" that
  // wrapped onto two lines.
  const quoteBody = bubble.match(/quoteBody: \{([^}]*)\}/);
  assert.ok(quoteBody, 'ChatBubble must still have a quoteBody style');
  assert.match(
    quoteBody[1],
    /flexBasis: 'auto'/,
    'the quote body needs a content-sized basis or the bubble cannot widen to fit it'
  );
  assert.doesNotMatch(
    quoteBody[1],
    /flex: 1/,
    'shorthand `flex: 1` is flexBasis 0 — the zero contribution this fixed'
  );
  // Grow and shrink are both load-bearing and both stay: grow holds the
  // thumbnail on the row's right edge when the quote is shorter than the
  // message, shrink is what lets numberOfLines={1} ellipsize past the cap.
  assert.match(quoteBody[1], /flexGrow: 1/, 'the thumbnail must stay right-aligned');
  assert.match(quoteBody[1], /flexShrink: 1/, 'an over-long quote must shrink, not overflow');

  // THE UNQUOTED PATH IS UNCHANGED. The strip is the only thing that widens a
  // bubble, and it renders only when there IS a quote — so a bubble without
  // one measures exactly as it did before.
  assert.match(bubble, /\{replyTo && \(/, 'the quote strip is conditional on replyTo');
  const bubbleStyle = bubble.match(/\n {2}bubble: \{([^}]*)\}/);
  assert.ok(bubbleStyle, 'ChatBubble must still have a bubble style');
  assert.doesNotMatch(
    bubbleStyle[1],
    /minWidth|replyTo/,
    'the bubble box itself must not grow a quote-conditional width'
  );

  // The visual design the widening serves is NOT what changed: one accent
  // rail, one line of name, one line of preview, still through the shared
  // preview helper.
  assert.match(bubble, /styles\.quoteBar, isOwn \? styles\.quoteBarOwn : styles\.quoteBarOther/);
  assert.equal(
    (bubble.match(/numberOfLines=\{1\}/g) ?? []).length,
    2,
    'the quote keeps exactly two one-line texts: the name and the preview'
  );
  assert.match(bubble, /\{messagePreviewText\(replyTo\)\}/);
});

test('[static] the read-model verdicts are recorded where the next run will look', () => {
  // The two flags this investigation produced must carry the EVIDENCE, not a
  // shrug: the daytime schema run reads these to know what to build.
  const flags = read('lib/featureFlags.ts');
  assert.match(flags, /export const READ_TICKS = false as boolean;/);
  // Read: readable on direct threads, not on job threads — both halves named
  // with the migration that decides them.
  assert.match(flags, /direct_threads_select_party/);
  assert.match(flags, /message_reads_select_own/);
  // Mark-as-unread: rewindable on job threads, not on direct threads.
  assert.match(flags, /message_reads_update_own/);
  assert.match(flags, /mark_direct_thread_read\(\), hard-codes `now\(\)`/);
});

// ---------------------------------------------------------------------------
// THE SHARED LINK'S LANDING PAGE — /profile/{id} on the web build.
// ---------------------------------------------------------------------------

test('[executed] the web route matches /profile/{id} and nothing near it', () => {
  assert.deepEqual(webRoute.parseWebRoute('/profile/abc-123'), { kind: 'profile', userId: 'abc-123' });
  // A trailing slash is the same address.
  assert.deepEqual(webRoute.parseWebRoute('/profile/abc-123/'), { kind: 'profile', userId: 'abc-123' });
  // Percent-encoding is undone, because lib/appLinks.ts applies it on the way out.
  assert.deepEqual(webRoute.parseWebRoute('/profile/a%20b'), { kind: 'profile', userId: 'a b' });

  // STRICT: everything else belongs to the navigator, and a too-permissive
  // match here would swallow paths it should have had.
  for (const path of [
    '/',
    '/profile',
    '/profile/',
    '/profiles/abc',
    '/profile/abc/extra',
    '/x/profile/abc',
    '/PROFILE/abc',
    '/profile/%',
    '/profile/%E0%A4%A',
    '/profile/   ',
  ]) {
    assert.equal(webRoute.parseWebRoute(path), null, `${path} must not resolve to a profile`);
  }
});

test('[static] the public page is honest about what an anonymous visitor can see', () => {
  const app = stripComments(read('App.tsx'));
  const page = stripComments(read('screens/PublicProfileScreen.tsx'));

  // Resolved BEFORE the navigator, and native is gated out by construction.
  assert.match(app, /Platform\.OS === 'web' && typeof window !== 'undefined'/);
  assert.match(app, /parseWebRoute\(window\.location\.pathname\)/);
  assert.match(app, /if \(webRoute\?\.kind === 'profile'\) \{/);
  // No launch layer for a visitor with no account to restore — but the
  // session still matters, so AuthProvider stays.
  const branch = /if \(webRoute\?\.kind === 'profile'\) \{([\s\S]*?)\n  \}/.exec(app);
  assert.ok(branch, 'the public-page branch must stay a plain if block');
  assert.doesNotMatch(branch[1], /LaunchGate|ModeShell|ThemedNavigation/);
  assert.match(branch[1], /<AuthProvider>/);
  assert.match(branch[1], /<PublicProfileScreen userId=\{webRoute\.userId\} \/>/);

  // NOTHING IS INVENTED. The rating block renders only on a real positive
  // count — an unrated person gets no stars, no "New" badge and no zero.
  assert.match(page, /state\.profile\.rating_count > 0/);
  assert.match(page, /typeof state\.profile\.rating_avg === 'number'/);
  assert.match(page, /\{rated \? \(/);

  // An empty read is ONE state whether the cause is RLS or a missing id: the
  // page must not tell strangers which user ids exist.
  assert.match(page, /setState\(data \? \{ status: 'ready', profile: data \} : \{ status: 'unavailable' \}\)/);
  assert.match(page, /Profiles live in the app/);
  assert.match(page, /Get the app/);
  // The repo's verbatim label for an absent account — taken from the constant
  // since 2026-08-23 (audit F4), not spelled out again here. The wording is
  // still pinned, one layer up: tests/conversion.test.mjs asserts
  // DELETED_USER_LABEL === 'Deleted user' and that phase67 writes that exact
  // string, so this assertion is strictly stronger than the literal it
  // replaces — it now also rules out a SECOND spelling drifting from the one
  // isDeletedUser() compares against.
  assert.match(page, /state\.profile\.full_name \?\? DELETED_USER_LABEL/);
  // Read through the EXISTING public read, not a new one.
  assert.match(page, /import \{ fetchProfileById, type Profile \} from '\.\.\/lib\/profiles';/);
});

// ---------------------------------------------------------------------------
// THE INBOX — five pills, one action model, two entry mechanics.
// ---------------------------------------------------------------------------

test('[executed] two pills filter live state and three are honestly empty', () => {
  const rows = [
    { key: 'a', unread: true, awaitingRequest: false },
    { key: 'b', unread: false, awaitingRequest: true },
    { key: 'c', unread: false, awaitingRequest: false },
    { key: 'd', unread: true, awaitingRequest: true },
  ];

  assert.deepEqual(inbox.filterRows(rows, 'all').map((r) => r.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual(inbox.filterRows(rows, 'unread').map((r) => r.key), ['a', 'd']);
  assert.deepEqual(inbox.filterRows(rows, 'requests').map((r) => r.key), ['b', 'd']);
  // Nothing can be archived and there is no support conversation, so these
  // return NOTHING rather than quietly falling through to everything — which
  // is the failure mode a default case invites.
  assert.deepEqual(inbox.filterRows(rows, 'archived'), []);
  assert.deepEqual(inbox.filterRows(rows, 'support'), []);
  // 'all' preserves the order the inbox already built; the pills are a VIEW,
  // never a re-sort and never a second fetch.
  assert.deepEqual(inbox.filterRows(rows, 'all'), rows);

  // Five pills, in order, with the labels the dispatch named.
  assert.deepEqual(
    inbox.INBOX_FILTERS.map((p) => p.key),
    ['all', 'unread', 'archived', 'requests', 'support']
  );
  assert.deepEqual(
    inbox.INBOX_FILTERS.map((p) => p.label),
    ['All', 'Unread', 'Archived', 'Requests', 'Support']
  );
});

test('[executed] every pill has its OWN empty state, and each one is true', () => {
  // "No messages yet" under the Archived pill would be a different and untrue
  // statement, which is why this is per-filter rather than one shared line.
  const seen = new Set();
  for (const { key } of inbox.INBOX_FILTERS) {
    const state = inbox.emptyStateFor(key);
    assert.ok(state.title && state.body, `${key} needs a title and a body`);
    assert.ok(!seen.has(state.title), `${key} must not reuse another pill's empty title`);
    seen.add(state.title);
  }
  assert.equal(inbox.emptyStateFor('archived').title, 'Nothing archived yet');
  assert.equal(inbox.emptyStateFor('requests').title, 'No requests yet');
  assert.equal(inbox.emptyStateFor('support').title, 'Support coming soon');
});

test('[executed] a refresh between opening the sheet and tapping it moves the action', () => {
  // AUDIT F2, played out. The sheet used to copy { muted, blocking } out of
  // the long-pressed row. Those two values decide what the row SAYS and which
  // call the tap MAKES, so a realtime refresh landing in between left the
  // sheet offering "Mute" for somebody already muted — and the tap then
  // unmuted them. The user read one thing and got its opposite.
  const { resolveSheetTarget, muteActionFor, blockActionFor } = inbox;

  const row = (over = {}) => ({
    otherId: 'u1',
    rawName: 'Sam',
    jobId: 'job-1',
    blocking: false,
    muted: false,
    ...over,
  });

  // OPEN. The user long-presses an unmuted row; the sheet offers to mute.
  let rows = [row(), row({ otherId: 'u2', rawName: 'Alex', muted: true })];
  const opened = resolveSheetTarget(rows, 'u1');
  assert.equal(opened.muted, false);
  assert.equal(muteActionFor(opened), 'mute');

  // REFRESH. Another device mutes Sam and blocks them while the sheet is up.
  // This is the whole point: `rows` is a NEW array, exactly as a realtime
  // refresh produces, and the sheet is still open on the same id.
  rows = [row({ muted: true, blocking: true }), row({ otherId: 'u2', rawName: 'Alex', muted: true })];

  // TAP. The action follows the LIVE row, not the one that was on screen when
  // the sheet opened. Under the old snapshot this said 'mute' and would have
  // unmuted somebody who was already muted.
  const tapped = resolveSheetTarget(rows, 'u1');
  assert.equal(tapped.muted, true);
  assert.equal(muteActionFor(tapped), 'unmute', 'the tap must not invert the intent');
  assert.equal(blockActionFor(tapped), 'unblock');
  // Identity is stable across the refresh — it is only the mutable facts that
  // moved.
  assert.equal(tapped.userId, 'u1');
  assert.equal(tapped.name, 'Sam');
  assert.equal(tapped.jobId, 'job-1');

  // The label and the call read the SAME value, which is the property that
  // makes the inversion impossible rather than merely unlikely.
  for (const muted of [true, false]) {
    const target = resolveSheetTarget([row({ muted })], 'u1');
    const label = target.muted ? 'Unmute' : 'Mute';
    assert.equal(muteActionFor(target), label.toLowerCase());
  }

  // A row that has GONE closes the sheet rather than acting on a conversation
  // that is no longer there.
  assert.equal(resolveSheetTarget(rows, 'nobody'), null);
  assert.equal(resolveSheetTarget([], 'u1'), null);
  assert.equal(resolveSheetTarget(rows, null), null);
});

test('[static] the inbox sheet holds an id, and re-reads the row it acts on', () => {
  const screen = stripComments(read('screens/MessagesInboxScreen.tsx'));

  // The state is the identity only. The snapshot that carried the two mutable
  // facts must not come back.
  assert.match(screen, /const \[sheetUserId, setSheetUserId\] = useState<string \| null>\(null\)/);
  assert.doesNotMatch(screen, /const \[sheetTarget, setSheetTarget\]/, 'the snapshot must not return');
  assert.doesNotMatch(
    screen,
    /setSheetUserId\(\{|setSheetTarget\(\{/,
    'opening the sheet must pass an id, never a copy of the row',
  );
  assert.match(screen, /setSheetUserId\(item\.otherId\)/, 'the long press stores the id');

  // And the row is resolved live, from the rows the inbox just built.
  assert.match(
    screen,
    /const sheetTarget = useMemo\(\(\) => resolveSheetTarget\(rows, sheetUserId\), \[rows, sheetUserId\]\)/,
    'the sheet must re-read its row rather than remember it',
  );
});

test('[static] the composer row sits on the thread, not on a band of its own', () => {
  // The device walk: the voice-recording bar in light sat on a full-width
  // WHITE band; dark appeared to have none. One token, `colors.surface`, doing
  // two different things — #FFFFFF against a #F4F1E8 thread reads as a bar,
  // #0A1813 against #02110D is a step too small to see. Light must be dark's
  // palette, not dark's design plus a bar.
  const composer = stripComments(read(COMPOSER));
  const row = /\n  row: \{([^}]*)\}/.exec(composer);
  assert.ok(row, 'the composer row style must exist');
  assert.match(
    row[1],
    /backgroundColor: 'transparent'/,
    'the row must show the thread ground, so the recorder floats in both themes',
  );
  assert.doesNotMatch(
    row[1],
    /backgroundColor: colors\.surface/,
    'the band is what made light a different design',
  );

  // Removing the band is only safe because everything IN the row draws its own
  // edge. If either of these loses its outline the field stops being findable
  // on a groundless row, so they are pinned here with the removal.
  assert.match(
    /\n  input: \{([^}]*)\}/.exec(composer)[1],
    /borderWidth: 1,[^]*borderColor: colors\.border/,
    'the input must stay an outlined pill',
  );
  assert.match(
    /recordingPill: \{([^}]*)\}/.exec(composer)[1],
    /borderWidth: 1,\s*borderColor: withAlpha\(colors\.emerald/,
    'the recording pill must stay an emerald hairline',
  );
});

test('[executed] one slot, so opening either menu closes the other', () => {
  // The defect this encodes: the header dropdown and the composer drop-up each
  // had their own boolean, and a device walk photographed both panels open at
  // once. Two booleans have four states and one of them is illegal; one value
  // naming the open menu has three states and all of them are legal.
  const { nextMenu, isMenuOpen } = menus;

  // Opening from rest.
  assert.equal(nextMenu(null, 'header'), 'header');
  assert.equal(nextMenu(null, 'composer'), 'composer');

  // THE INVARIANT: B opening IS A closing, in one assignment.
  assert.equal(nextMenu('header', 'composer'), 'composer');
  assert.equal(nextMenu('composer', 'header'), 'header');

  // The control that opens a menu dismisses it.
  assert.equal(nextMenu('header', 'header'), null);
  assert.equal(nextMenu('composer', 'composer'), null);

  // `null` is every dismissal that is not a tap on a trigger: the outside tap,
  // the keyboard appearing, navigating away, and choosing an item.
  assert.equal(nextMenu('header', null), null);
  assert.equal(nextMenu('composer', null), null);
  assert.equal(nextMenu(null, null), null);

  // There is no reachable value in which two menus are open, because the
  // carrier cannot express one. Exhaustive over the whole transition table.
  for (const current of [null, 'header', 'composer']) {
    for (const requested of [null, 'header', 'composer']) {
      const result = nextMenu(current, requested);
      assert.ok(
        result === null || result === 'header' || result === 'composer',
        `nextMenu(${current}, ${requested}) left the slot holding ${result}`,
      );
      const openCount = ['header', 'composer'].filter((m) => isMenuOpen(result, m)).length;
      assert.ok(openCount <= 1, `nextMenu(${current}, ${requested}) reports ${openCount} menus open`);
    }
  }
});

test('[static] both chat menus read the one owner, and nothing keeps a private copy', () => {
  const chat = stripComments(read('screens/ChatScreen.tsx'));
  const composer = stripComments(read(COMPOSER));

  // The owner lives on the screen, and it is the shared transition rather than
  // a second copy of the rule.
  assert.match(chat, /import \{ nextMenu, type ChatMenu \} from '\.\.\/lib\/chatMenus';/);
  assert.match(chat, /const \[openMenu, setOpenMenu\] = useState<ChatMenu \| null>\(null\)/);
  assert.match(chat, /setOpenMenu\(\(current\) => nextMenu\(current, menu\)\)/);

  // The two booleans are GONE, not merely unused.
  assert.doesNotMatch(chat, /headerMenuOpen/, 'the header kept its own boolean');
  assert.doesNotMatch(composer, /const \[menuOpen/, 'the composer kept its own boolean');
  assert.doesNotMatch(composer, /setMenuOpen/, 'the composer kept its own setter');
  assert.match(composer, /menuOpen: boolean;/, 'the composer takes the open state as a prop');
  assert.match(composer, /onToggleMenu: \(\) => void;/);
  assert.match(composer, /onCloseMenu: \(\) => void;/);

  // Both DropMenu instances read the same value and close through the same
  // function — the two halves of "one owner".
  assert.match(chat, /visible=\{openMenu === 'header'\}/);
  assert.match(chat, /menuOpen=\{openMenu === 'composer'\}/);
  assert.match(chat, /onClose=\{closeMenus\}/);
  assert.match(chat, /onCloseMenu=\{closeMenus\}/);
  assert.match(composer, /onClose=\{onCloseMenu\}/, 'the drop-up closes through the owner');
  assert.match(composer, /onPress=\{onToggleMenu\}/, 'the \\[ + \\] asks the owner');

  // THE OUTSIDE TAP. It is DropMenu's own backdrop, and it dismisses — this is
  // where "tap outside closes" actually lives, for both menus at once.
  // It lives in DropMenu.shared.tsx since the driver split, which is the point
  // of that file: BOTH paths dismiss through the same backdrop rather than
  // each growing one.
  assert.match(
    stripComments(read(DROPMENU_SHARED)),
    /<Pressable\s+style=\{\[styles\.backdrop[^]*?onPress=\{onClose\}/,
    'the backdrop must dismiss the menu',
  );
  for (const path of [DROPMENU, DROPMENU_FAST]) {
    assert.match(
      stripComments(read(path)),
      /<DropMenuBackdrop direction=\{direction\} onClose=\{onClose\} closeLabel=\{closeLabel\} \/>/,
      `${path} must mount the shared backdrop, not one of its own`,
    );
  }

  // THE DISMISSALS THAT ARE NOT TAPS, and the teardown that clears on unmount.
  assert.match(chat, /Keyboard\.addListener\('keyboardDidShow', closeMenus\)/);
  assert.match(chat, /navigation\.addListener\('blur', closeMenus\)/);
  assert.match(
    chat,
    /return \(\) => \{\s*onKeyboard\.remove\(\);\s*onBlur\(\);\s*\}/,
    'both subscriptions must be removed on unmount',
  );

  // WHY NEITHER BACKDROP SWALLOWS THE OTHER TRIGGER'S TAP, which is a layout
  // fact rather than a handler: the composer's backdrop opens UPWARD 900pt,
  // but it lives inside `keyboardClip`, which clips, so it cannot reach the
  // header's dots. The header's opens DOWNWARD over the composer, but the clip
  // is a LATER sibling and paints above it, so the [ + ] stays hit-testable.
  // Remove either property and one menu starts eating the other's opening tap.
  assert.match(
    chat,
    /keyboardClip: \{\s*flex: 1,\s*overflow: 'hidden',\s*\}/,
    "the clip is what keeps the composer's backdrop off the header",
  );
  assert.ok(
    chat.indexOf('styles.headerMenuAnchor') < chat.indexOf('styles.keyboardClip'),
    'the header must render BEFORE the clip, or its backdrop would cover the [ + ]',
  );
});

test('[static] the filter pills measure themselves, not their scroller', () => {
  // WHAT WENT WRONG, so it cannot go wrong the same way twice. The pills live
  // in a horizontal ScrollView. React Native styles that view with
  // `baseHorizontal = { flexGrow: 1, flexShrink: 1 }`, so it grew into all the
  // free vertical space between the header and the list; the content
  // container's cross-axis default of `stretch` then gave that entire height
  // to every pill. The style block read `minHeight: 32` throughout and was
  // never wrong — a floor cannot cap a stretch — and both themes rendered
  // half-screen ovals.
  //
  // So this fence pins the two properties that CAUSE the stretch, not the
  // height that suffers it. Capping the height alone would go green while the
  // scroller still ate the column.
  const source = read('screens/MessagesInboxScreen.tsx');
  const screen = stripComments(source);
  const flat = flatten(source);

  const filterScroll = /filterScroll: \{([^}]*)\}/.exec(screen);
  assert.ok(filterScroll, 'the filter scroller needs its own style to refuse RN flexGrow of 1');
  assert.match(
    filterScroll[1],
    /flexGrow: 0/,
    "the scroller must not grow — RN's baseHorizontal gives it flexGrow: 1 otherwise",
  );
  assert.match(flat, /<ScrollView horizontal[^>]*style=\{styles\.filterScroll\}/, 'and it must be mounted');

  const filterRow = /filterRow: \{([^}]*)\}/.exec(screen);
  assert.ok(filterRow, 'the filter row style must exist');
  assert.match(
    filterRow[1],
    /alignItems: 'center'/,
    "a row's cross-axis default is stretch, which is what made the pills full-height",
  );

  // ONE named constant owns the height, and it sits in the WhatsApp-subtle
  // band the row was measured against rather than being a free number.
  const declared = /const FILTER_PILL_HEIGHT = (\d+);/.exec(screen);
  assert.ok(declared, 'the pill height belongs to a single named constant');
  const height = Number(declared[1]);
  assert.ok(
    height >= 32 && height <= 36,
    `a filter pill above a list reads at 32-36pt; this one is ${height}pt`,
  );

  const pill = /\n  pill: \{([^}]*)\}/.exec(screen);
  assert.ok(pill, 'the pill style must exist');
  assert.match(pill[1], /height: FILTER_PILL_HEIGHT/, 'the pill takes the named height');
  assert.doesNotMatch(
    pill[1],
    /minHeight/,
    'a minHeight is the floor that failed to cap the stretch; it must not come back',
  );
  assert.match(pill[1], /borderRadius: radius\.pill/, 'radius.pill is 999, so the corner is half the height');
  assert.match(pill[1], /borderWidth: 1/);
  assert.match(pill[1], /backgroundColor: 'transparent'/, 'the resting pill is a hairline on the page ground');

  // Label metrics, and the selected treatment as a RECOLOUR: the active pill
  // changes two colours and nothing structural, so light is dark's palette
  // rather than a second design. `primarySoft` is the pale emerald in light
  // and the deep one in dark, which is the per-theme fill the row wants.
  const label = /pillLabel: \{([^}]*)\}/.exec(screen)[1];
  assert.match(label, /fontSize: 13/);
  assert.match(label, /fontWeight: '600'/);
  assert.match(/pillLabelActive: \{([^}]*)\}/.exec(screen)[1], /color: colors\.emerald/);

  const active = /pillActive: \{([^}]*)\}/.exec(screen)[1];
  assert.match(active, /borderColor: colors\.emerald/);
  assert.match(active, /backgroundColor: colors\.primarySoft/);
  assert.doesNotMatch(
    active,
    /height|padding|margin|borderWidth|borderRadius|shadow|elevation/,
    'selecting a pill recolours it; it must not resize or re-elevate it',
  );
});

test('[static] one action model, two entry mechanics, and no empty second sheet', () => {
  const screen = stripComments(read('screens/MessagesInboxScreen.tsx'));

  // The pills are a VIEW over the rows already built.
  assert.match(screen, /const visibleRows = useMemo\(\(\) => filterRows\(rows, filter\), \[rows, filter\]\);/);
  assert.match(screen, /data=\{visibleRows\}/);
  assert.match(screen, /emptyStateFor\(filter\)\.title/);

  // MUTE IS LIVE and always was — `mutes` has shipped since phase13. It is not
  // flagged, and flagging it would have hidden working behaviour.
  // The labels now read a `target` because the action model became a function
  // both mechanics call — see the swipe fence below. Same rule, one caller.
  assert.match(screen, /label: target\.muted \? 'Unmute' : 'Mute'/);
  assert.doesNotMatch(screen, /\bMUTE\b/, 'the retired MUTE flag must not come back');

  // The PERMANENT block stays exactly where it lives today, in the first
  // sheet. The timed variant is a separate, flagged row so shipping it cannot
  // quietly change what the existing one does.
  assert.match(screen, /key: 'block',\s*label: target\.blocking \? 'Unblock' : 'Block'/);
  assert.match(screen, /if \(TIMED_BLOCK\) \{/);
  assert.match(screen, /key: 'block-timed'/);

  // MORE renders only if it would have something in it — an empty second
  // sheet behind a visible button is the dead control this repo refuses.
  assert.match(screen, /\.\.\.\(moreItems\.length > 0/);
  for (const flag of ['MARK_UNREAD', 'CLEAR_CHAT', 'HIDDEN_CHATS', 'ARCHIVE', 'DELETE_CHAT']) {
    assert.ok(screen.includes(`if (${flag}) {`), `More must carry a ${flag} row`);
  }

  // The MECHANIC is capability-chosen; the ACTIONS are not. An action
  // reachable by one mechanic and not the other would be two apps.
  assert.match(screen, /import \{ canSwipe \} from '\.\.\/lib\/motion120';/);
  assert.match(screen, /const rowActionHint = canSwipe\(\)/);
  assert.match(screen, /'Press and hold for mute, block, report and more'/);
  assert.match(screen, /accessibilityHint=\{item\.isSelf \? undefined : rowActionHint\}/);
});

// ---------------------------------------------------------------------------
// TRANSLATION — a complete UI in front of an UNDEPLOYED function.
// ---------------------------------------------------------------------------

test('[executed] the client refuses locally what the server would refuse remotely', () => {
  // Nothing to send: refused without a round trip.
  assert.deepEqual(translate.prepareBatch([]), { ok: false, reason: 'empty' });
  assert.deepEqual(translate.prepareBatch(['   ', '']), { ok: false, reason: 'empty' });

  // The cap is counted across the WHOLE batch. Capping per item would let a
  // 200-message conversation through one item at a time — the same money
  // spent and none of the bound.
  const long = 'x'.repeat(translate.TRANSLATE_CHAR_CAP + 1);
  assert.deepEqual(translate.prepareBatch([long]), { ok: false, reason: 'too-long' });
  assert.deepEqual(
    translate.prepareBatch(['y'.repeat(1200), 'z'.repeat(1200)]),
    { ok: false, reason: 'too-long' }
  );
  assert.equal(translate.TRANSLATE_CHAR_CAP, 2000);

  // A legal batch comes back trimmed, with the empties dropped and the order
  // kept — the sheet pairs results to inputs by position.
  assert.deepEqual(translate.prepareBatch(['  hola  ', '', 'que tal']), {
    ok: true,
    texts: ['hola', 'que tal'],
  });
});

test('[executed] a half-built response is a failure, never a rendered undefined', () => {
  // Shape-checked rather than cast: this is data crossing a network boundary.
  for (const bad of [
    null,
    undefined,
    {},
    { items: null },
    { items: [] },
    { items: [{ source: 'a' }] },
    { items: [{ translated: 'b' }] },
    { items: [{ source: 1, translated: 'b' }] },
    { items: [{ source: 'a', translated: 'b' }, { source: 'c' }] },
  ]) {
    assert.deepEqual(
      translate.parseTranslateResponse(bad),
      { ok: false, reason: 'failed' },
      `${JSON.stringify(bad)} must not parse as a translation`
    );
  }

  // A good one keeps both halves, so the sheet can show the original beside
  // the translation.
  assert.deepEqual(
    translate.parseTranslateResponse({
      detectedLanguage: 'es',
      items: [{ source: 'hola', translated: 'hello' }],
    }),
    { ok: true, detectedLanguage: 'es', items: [{ source: 'hola', translated: 'hello' }] }
  );
  // A missing or empty detection is NULL, never a guess — the sheet then
  // shows no language label at all rather than a confident wrong one.
  assert.equal(
    translate.parseTranslateResponse({ items: [{ source: 'a', translated: 'b' }] }).detectedLanguage,
    null
  );
  assert.equal(
    translate.parseTranslateResponse({ detectedLanguage: '', items: [{ source: 'a', translated: 'b' }] })
      .detectedLanguage,
    null
  );
});

test('[executed] the device language is a bare subtag, and never throws', () => {
  const language = translate.deviceLanguage();
  assert.match(language, /^[a-z]{2,3}$/, 'the region is dropped on purpose');
  // The fallback is a fallback, not a crash: a device that cannot answer is
  // not a reason to fail a translation someone asked for.
  assert.equal(typeof translate.deviceLanguage('pt'), 'string');
});

test('[executed] every failure has a message, and none of them is vendor text', () => {
  for (const reason of ['unavailable', 'too-long', 'empty', 'failed']) {
    const message = translate.translateFailureMessage(reason);
    assert.ok(message.length > 0, `${reason} needs a message`);
    // Closed set: nothing from Azure, the function, or the network can cross
    // this boundary as prose, which is the lib/errorMessage contract.
    assert.doesNotMatch(message, /azure|translator|http|status|token|key/i);
  }
});

test('[static] the sheet renders from a result and owns none of the fetching', () => {
  const sheet = stripComments(read('components/TranslationSheet.tsx'));

  // PRESENTATION ONLY — which is how it is testable at all, given the
  // function behind it cannot answer.
  assert.doesNotMatch(sheet, /supabase|functions\.invoke|translateTexts/);
  assert.match(sheet, /from '\.\.\/lib\/translateRules'/, 'the sheet reads the RULES, not the caller');
  assert.match(sheet, /result: TranslateResult \| null;/);
  assert.match(sheet, /\{result === null \? \(/, 'null is the loading state');
  assert.match(sheet, /\) : result\.ok \? \(/);
  assert.match(sheet, /translateFailureMessage\(result\.reason\)/);

  // The DETECTED language, and only when the service detected one. There is
  // no client-side language guessing anywhere in this path.
  assert.match(sheet, /\{result\.detectedLanguage \? \(/);
  assert.match(sheet, /Detected \{result\.detectedLanguage\.toUpperCase\(\)\}/);

  // The original stays visible: a translation that replaces what someone
  // actually wrote removes the ability to check it.
  assert.match(sheet, /\{item\.original\}|\{item\.source\}/);

  // COPY renders only when a handler exists — nothing in this project can
  // write the clipboard yet, so today it does not render.
  assert.match(sheet, /\{onCopy \? \(/);
  assert.match(sheet, /onCopy\?: \(text: string\) => void;/);
});

test('[static] the translate entries are flagged, text-only, and batch the conversation', () => {
  const chat = stripComments(read(CHAT));

  assert.match(chat, /import \{ TRANSLATION \} from '\.\.\/lib\/featureFlags';/);
  // Behind the flag AND requiring content: there is nothing to translate in a
  // photo or a voice note.
  assert.match(chat, /\.\.\.\(TRANSLATION && menuTarget\.content/);
  assert.match(chat, /label: 'Translate This Message'/);
  assert.match(chat, /label: 'Translate Conversation'/);
  // ONE request with N strings, not N requests — one rate-limit decision on
  // the server rather than N.
  assert.match(chat, /void runTranslation\(\s*messages/);
  assert.match(chat, /\.filter\(\(m\) => !m\.unsent_at && !!m\.content\)/);
  // The sheet's loading state is a real state, not a spinner bolted on.
  assert.match(chat, /setTranslateResult\(null\);\s*setTranslateOpen\(true\);/);
});

test('[static] the edge function is a DRAFT and says so where nobody can miss it', () => {
  const fn = read('supabase/functions/translate/index.ts');
  const header = fn.slice(0, 2000);

  assert.match(header, /D R A F T/);
  assert.match(header, /N O T\s+D E P L O Y E D/);
  assert.match(header, /S E C U R I T Y\s+R E V I E W\s+P E N D I N G/);

  // THE BLOCKING ITEM is named as blocking, not buried.
  assert.match(fn, /RATE LIMITING IS NOT IMPLEMENTED, and this is the blocking item/);
  // The platform's JWT verification is the real gate, and the in-function
  // check must not be mistaken for one.
  assert.match(fn, /--no-verify-jwt/);
  assert.match(fn, /it reads the header, it does not validate a signature/);
  // Input is bounded three ways, and characters are counted in CODE POINTS so
  // astral text cannot cost double what it counts.
  assert.match(fn, /const CHAR_CAP = 2000;/);
  assert.match(fn, /const MAX_ITEMS = 50;/);
  assert.match(fn, /const MAX_ITEM_CHARS = 1000;/);
  assert.match(fn, /return \[\.\.\.text\]\.length;/);
  // No vendor text ever reaches the caller, and the body is not logged either.
  assert.doesNotMatch(fn, /await upstream\.text\(\)/);
  assert.match(fn, /console\.error\('\[translate\] upstream status', upstream\.status\)/);
  // The secrets are read from the environment and never returned or named.
  assert.match(fn, /Deno\.env\.get\('AZURE_TRANSLATOR_KEY'\)/);
  assert.match(fn, /Deno\.env\.get\('AZURE_TRANSLATOR_REGION'\)/);

  // tsconfig excludes supabase/functions, so a Deno file cannot break verify.
  const tsconfig = JSON.parse(read('tsconfig.json'));
  assert.ok(tsconfig.exclude.includes('supabase/functions'));
});

test('[static] the quick-reply row and its templates are gone from the whole tree', () => {
  assert.ok(
    !existsSync(join(root, 'components/QuickReplies.tsx')),
    'components/QuickReplies.tsx must be deleted, not merely unreferenced'
  );

  const dirs = ['lib', 'screens', 'components', 'hooks', 'ui', 'navigation', 'modes', 'dev-tools'];
  const files = ['App.tsx', 'index.ts'];
  for (const dir of dirs) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
    }
  }
  assert.ok(files.length > 100, `the sweep must enumerate the app source (saw ${files.length})`);

  const offenders = [];
  for (const path of files) {
    // Comment-stripped: the retirement notes in lib/messages.ts and
    // screens/ChatScreen.tsx NAME what was removed, on purpose.
    const source = stripComments(read(path));
    if (/QuickReplies|chatTemplatesForMode|WORKER_CHAT_TEMPLATES|CUSTOMER_CHAT_TEMPLATES/.test(source)) {
      offenders.push(path);
    }
  }
  assert.deepEqual(offenders, [], 'the component and both template sets are retired together');

  // screens/RouteArrivalScreen.tsx has its own "On my way" control. It is a
  // different feature with its own literal and is deliberately untouched —
  // asserted so a later sweep for that string does not delete it by mistake.
  assert.match(read('screens/RouteArrivalScreen.tsx'), /label="On my way"/);
});

// ---------------------------------------------------------------------------
// THE CLIPBOARD, THE TOMBSTONE, AND THE LATE TRANSLATION — 2026-08-23.
// ---------------------------------------------------------------------------

test('[executed] copying is guarded on both sides — no module, and no empty write', async () => {
  const clip = await import('../lib/clipboard.ts');

  // On THIS binary there is no ExpoClipboard native module, so the lazy
  // require throws, `canCopy()` is false, and the caller renders no control.
  // That is the state the test runs in and it is the honest one: a Copy button
  // that cannot copy is worse than no Copy button, because the user believes
  // the text is on their clipboard and pastes something else.
  assert.equal(typeof clip.canCopy, 'function');
  assert.equal(typeof clip.copyText, 'function');
  assert.equal(clip.canCopy(), false, 'no native module here, so nothing may claim it can copy');

  // Absent module: false rather than a throw. The whole point of the boundary
  // is that a caller never has to catch.
  assert.equal(await clip.copyText('hello'), false);
  // Empty and whitespace-only never write. Putting an empty string on
  // somebody's clipboard silently destroys whatever they had there, which is
  // worse than doing nothing.
  assert.equal(await clip.copyText(''), false);
  assert.equal(await clip.copyText('   \n  '), false);
});

test('[static] the clipboard is loaded lazily and caught, like every other native', () => {
  // expo-clipboard's entry does requireNativeModule('ExpoClipboard') at module
  // scope, so a STATIC import anywhere on the startup path takes the app down
  // on a binary without it — the operator's current dev build, since the
  // package landed today and the build predates it. Same failure mode as
  // reanimated, same arrangement.
  const lib = stripComments(read('lib/clipboard.ts'));
  assert.doesNotMatch(
    lib,
    /import[^\n]*from\s*'expo-clipboard'/,
    'a static import of expo-clipboard crashes a binary without the native module'
  );
  assert.match(
    lib,
    /try \{[\s\S]{0,240}?require\('expo-clipboard'\)[\s\S]{0,240}?\} catch \{[\s\S]{0,60}?return null;/,
    'the require must be lazy AND caught AND resolve to null'
  );
  // Resolved once: a native module cannot appear mid-session.
  assert.match(lib, /const clipboard = load\(\);/);

  // NOWHERE ELSE may load it.
  const offenders = [];
  for (const dir of ['components', 'screens', 'hooks', 'lib', 'ui', 'navigation', 'modes']) {
    for (const entry of readdirSync(join(root, dir))) {
      if (!/\.tsx?$/.test(entry)) continue;
      const rel = `${dir}/${entry}`;
      if (rel === 'lib/clipboard.ts') continue;
      if (/(?:from\s*['"]|require\(['"])expo-clipboard/.test(read(rel))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], 'only lib/clipboard.ts may load expo-clipboard');
});

test('[static] Copy renders only where it works, and says so when it fails', () => {
  const chat = stripComments(read('screens/ChatScreen.tsx'));
  const sheet = stripComments(read('components/TranslationSheet.tsx'));

  // The handler is passed ONLY when this build can write — the sheet already
  // renders the control on the presence of a handler, which is the
  // never-a-dead-control rule it was written with.
  assert.match(chat, /import \{ canCopy, copyText \} from '\.\.\/lib\/clipboard';/);
  assert.match(chat, /onCopy=\{canCopy\(\) \? handleCopyTranslation : undefined\}/);
  assert.match(sheet, /\{onCopy \?/, 'the control renders on the handler, not unconditionally');

  // And a refusal is reported rather than swallowed: silence would leave the
  // user believing the translation is on their clipboard.
  assert.match(chat, /if \(!\(await copyText\(text\)\)\) \{/);
  assert.match(chat, /alertAsync\('Could not copy'/);
});

test('[executed] a translation that arrives after the sheet closed is dropped', () => {
  // AUDIT F5, as a sequence rather than a shape. `runTranslation` awaits the
  // fetch, so the sheet can be closed — or a SECOND translation started on
  // another message — while the first is in flight. Without a guard the stale
  // answer lands in the sheet's state, and the user re-opens it later onto a
  // translation of a message they have moved on from.
  //
  // The guard is a counter, so the rule can be run here directly: an answer is
  // shown only if the run that produced it is still the current one.
  let current = 0;
  const shown = [];
  const start = () => ++current;
  const land = (runId, value) => {
    if (runId !== current) return;
    shown.push(value);
  };

  // Closed mid-flight — closing bumps the counter, so the answer is dropped.
  const a = start();
  current += 1; // closeTranslation()
  land(a, 'stale');
  assert.deepEqual(shown, [], 'an answer for a closed sheet must not land');

  // Two requests racing: only the LATEST is shown, whichever returns first.
  const b = start();
  const c = start();
  land(b, 'first request, late');
  assert.deepEqual(shown, [], 'the superseded request must not overwrite the current one');
  land(c, 'current');
  assert.deepEqual(shown, ['current']);
});

test('[static] the translation sheet invalidates on close, and the tombstone has one spelling', () => {
  const chat = stripComments(read('screens/ChatScreen.tsx'));

  assert.match(chat, /const translateRunRef = useRef\(0\);/);
  assert.match(chat, /const runId = \+\+translateRunRef\.current;/);
  assert.match(chat, /if \(runId !== translateRunRef\.current\) return;/);
  // Closing must BUMP the counter, or the guard would only cover the raced
  // case and not the closed-mid-flight one the finding actually describes.
  assert.match(chat, /function closeTranslation\(\) \{\s*translateRunRef\.current \+= 1;/);
  assert.match(chat, /onClose=\{closeTranslation\}/);

  // AUDIT F4 — one spelling of the tombstone, in one place. A second literal
  // is a second thing to get wrong the day the wording changes, and
  // isDeletedUser() compares against the constant.
  const profile = read('screens/PublicProfileScreen.tsx');
  assert.match(profile, /import \{ DELETED_USER_LABEL \} from '\.\.\/lib\/rebook';/);
  assert.match(profile, /state\.profile\.full_name \?\? DELETED_USER_LABEL/);
  assert.doesNotMatch(profile, /'Deleted user'/, 'the inline literal must not come back');
  assert.match(read('lib/rebook.ts'), /export const DELETED_USER_LABEL = 'Deleted user';/);
});
