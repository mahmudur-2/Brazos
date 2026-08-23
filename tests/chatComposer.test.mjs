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
const METER = 'components/AudioMeterBars.tsx';
const RECORDER = 'hooks/useVoiceRecorder.ts';

const meter = await import('../lib/audioMeter.ts');

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
  assert.match(menu, /import \{ MENU_MOTION_MS, MENU_MOTION_OUT_MS \} from '\.\.\/lib\/motion120';/);
  assert.match(menu, /duration: reducedMotion \? 0 : visible \? MENU_MOTION_MS : MENU_MOTION_OUT_MS/);
  assert.match(menu, /useNativeDriver: USE_NATIVE_DRIVER/);
  // It grows FROM the anchor in both directions, so the origin of the motion
  // is the button either way.
  assert.match(menu, /const travel = direction === 'up' \? 8 : -8;/);
  // Kept mounted through the exit, or every dismissal is a hard cut.
  assert.match(menu, /if \(finished && !visible\) setMounted\(false\);/);
  // Outside-tap dismissal exists and is announced.
  assert.match(menu, /accessibilityLabel=\{closeLabel\}/);
  // Rows meet the touch floor by their DRAWN height — adjacent rows with
  // overlapping hitSlop would steal each other's taps.
  assert.match(menu, /minHeight: 46,/);
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
