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

  // The [ + ] is absent, not empty, when the thread can take no attachment.
  assert.match(source, /\{menuItems\.length > 0 && \(/);
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
