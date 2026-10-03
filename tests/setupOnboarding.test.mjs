import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Normalised to LF. Several assertions below carve a function apart with
// indexOf('...\n...') string literals, and on a CRLF checkout those needles
// simply never match — indexOf returns -1, slice(start, -1) silently returns
// the whole rest of the function instead of the intended fragment, and the
// assertion then reports on code it was never meant to see. That is what made
// 'navigation only ever follows a successful write' a standing red: the
// failure-branch slice was actually the entire handler, success path included.
// The repo has no .gitattributes normalising the worktree, so tests must not
// depend on which line ending a given checkout produced.
const read = (path) => readFileSync(join(root, path), 'utf8').replace(/\r\n/g, '\n');

// ===========================================================================
// The persistence rules, executed rather than restated
// ===========================================================================
// lib/setupState.ts is deliberately free of React Native imports so the
// keying and parsing can be run here. The AsyncStorage half lives in
// lib/setupStorage.ts and is checked as source below.
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const { DEFAULT_LANDING, isLandingPreference, parseSetupRecord, serializeSetupRecord, setupStorageKey, setupStateFrom } =
  await import(toDataUrl(stripTypeScriptTypes(read('lib/setupState.ts'), { mode: 'strip' })));

// FIX-RUN B16 — Setup is no longer remembered on the device alone.
test('B16 · setupStateFrom: the device record first, then any server acceptance, else Setup', () => {
  assert.deepEqual(setupStateFrom({ completed: true, landing: 'work' }, false), { completed: true, landing: 'work', restored: false });
  assert.deepEqual(setupStateFrom({ completed: true, landing: 'work' }, true), { completed: true, landing: 'work', restored: false });
  // A reinstall or a second phone: the acceptance row restores completion (and the record is written back).
  assert.deepEqual(setupStateFrom(null, true), { completed: true, landing: DEFAULT_LANDING, restored: true });
  // No trace anywhere, or a failed read (answered false): Setup shows — the safe direction.
  assert.deepEqual(setupStateFrom(null, false), { completed: false, landing: DEFAULT_LANDING, restored: false });
});

test('B16 · useSetupStatus asks the server only without a device record, and writes the restored record back', () => {
  const src = read('hooks/useSetupStatus.ts');
  assert.match(src, /const accepted = record\?\.completed \? false : await hasAnyLegalAcceptance\(userId\);/);
  assert.match(src, /if \(next\.restored\) void writeSetupRecord\(userId, \{ completed: true, landing: next\.landing \}\);/);
  const legal = read('lib/legal/index.ts');
  assert.match(legal, /\.from\('legal_acceptances'\)\s*\.select\('document'\)\s*\.eq\('user_id', userId\)\s*\.limit\(1\);/);
  assert.match(legal, /return !error && \(data \?\? \[\]\)\.length > 0;/);
});

const app = read('App.tsx');
const setup = read('screens/SetupScreen.tsx');
const flow = read('screens/OnboardingFlow.tsx');
const routes = read('lib/navigation.ts');
const status = read('hooks/useSetupStatus.ts');
const perms = read('hooks/useSetupPermissions.ts');
const storage = read('lib/setupStorage.ts');
const row = read('components/SetupRow.tsx');
const choice = read('components/SetupChoiceCard.tsx');

// ---------------------------------------------------------------------------
// Per-user scoping and safe parsing
// ---------------------------------------------------------------------------

test('setup completion is scoped to one authenticated user', () => {
  const a = setupStorageKey('user-a');
  const b = setupStorageKey('user-b');
  assert.notEqual(a, b, 'two accounts must not share a key');
  assert.match(a, /user-a$/);
  // Namespaced and versioned, so it cannot collide with another feature's
  // key and a future shape change can simply use a new one.
  assert.match(a, /^brazos\.setup\.v1\./);
});

test('one user’s completed setup never applies to another', () => {
  const stored = { [setupStorageKey('user-a')]: serializeSetupRecord({ completed: true, landing: 'work' }) };
  // Reading as a different user finds nothing, so that account sees Setup.
  assert.equal(parseSetupRecord(stored[setupStorageKey('user-b')]), null);
  assert.deepEqual(parseSetupRecord(stored[setupStorageKey('user-a')]), {
    completed: true,
    landing: 'work',
  });
});

test('anything unreadable means "not set up", never "set up"', () => {
  // The safe direction: an extra screen, rather than skipping the legal step.
  for (const bad of [
    null,
    undefined,
    '',
    'not json',
    '{',
    '[]',
    '"a string"',
    '42',
    'null',
    JSON.stringify({}),
    JSON.stringify({ completed: false, landing: 'hire' }),
    JSON.stringify({ completed: 'yes', landing: 'hire' }),
    JSON.stringify({ landing: 'hire' }),
  ]) {
    assert.equal(parseSetupRecord(bad), null, `${JSON.stringify(bad)} must not read as complete`);
  }
});

test('a valid completion with a broken choice keeps the completion', () => {
  // Losing the preference is cosmetic; losing the completion would re-run the
  // legal step for someone who already accepted.
  for (const landing of ['sideways', '', null, 7, undefined]) {
    assert.deepEqual(parseSetupRecord(JSON.stringify({ completed: true, landing })), {
      completed: true,
      landing: DEFAULT_LANDING,
    });
  }
});

test('the record round-trips, and only the two known choices are choices', () => {
  for (const landing of ['hire', 'work']) {
    assert.deepEqual(parseSetupRecord(serializeSetupRecord({ completed: true, landing })), {
      completed: true,
      landing,
    });
    assert.equal(isLandingPreference(landing), true);
  }
  for (const not of ['worker', 'customer', 'admin', '', null, {}, 0]) {
    assert.equal(isLandingPreference(not), false);
  }
  // The reference screen shows Hire help pre-selected.
  assert.equal(DEFAULT_LANDING, 'hire');
});

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

test('nothing authenticated renders until both gates have answered', () => {
  // The flash this prevents: Home mounting on a default, then being pulled
  // away when the real answer lands a tick later.
  assert.match(
    app,
    /if \(loading \|\| \(user && \(legal\.state === 'loading' \|\| setup\.state === 'loading'\)\)\)/
  );
  // Order matters: signed out is answered before either gate is consulted.
  assert.ok(
    app.indexOf("if (!user) return <AuthFlow />;") < app.indexOf("setup.state === 'incomplete'"),
    'the signed-out branch must come first'
  );
});

test('an incomplete user gets Setup, a completed one goes straight through', () => {
  assert.match(app, /if \(setup\.state === 'incomplete'\) \{\s*\n\s*return \(\s*\n\s*<OnboardingFlow/);
  assert.match(app, /return <MainTabs \/>;/);
  // The version-bump re-prompt survives as its own branch, after setup.
  assert.ok(
    app.indexOf("setup.state === 'incomplete'") < app.indexOf("legal.state === 'needs_acceptance'"),
    'setup fronts the gate; the bare gate is the leftover case'
  );
  assert.match(app, /if \(legal\.state === 'needs_acceptance'\) \{\s*\n\s*return <LegalGateScreen/);
});

test('a signed-out user is never asked to set anything up', () => {
  // Mock phone verification creates no session, so `user` stays null and this
  // is the branch it lands on — Setup is unreachable without a real session.
  assert.match(status, /if \(!userId\) \{[\s\S]*?setState\('complete'\);/);
  assert.match(setup, /const \{ user, logout \} = useAuth\(\)/);
  // No write is even attempted without one.
  assert.match(setup, /if \(!legalComplete \|\| saving \|\| !user\) return;/);
});

test('setup status is re-read when the account changes', () => {
  assert.match(status, /\}, \[userId\]\);/, 'the read must depend on which user is signed in');
  assert.match(status, /if \(!active\) return;/, 'a late read for a previous user is dropped');
});

// ---------------------------------------------------------------------------
// Routes and destinations
// ---------------------------------------------------------------------------

test('the onboarding stack is two screens and reuses the real legal gate', () => {
  assert.match(routes, /export type OnboardingStackParamList = \{\s*\n\s*Setup: undefined;\s*\n\s*LegalGate: undefined;/);
  assert.match(flow, /<Stack\.Screen name="Setup">/);
  assert.match(flow, /<Stack\.Screen\s*\n\s*name="LegalGate"/);
  // The existing screen, imported — not a copy of it.
  assert.match(flow, /import \{ LegalGateScreen \} from '\.\/LegalGateScreen'/);
  assert.doesNotMatch(flow, /TERMS_OF_SERVICE|PRIVACY_POLICY|MarkdownText/);
});

test('acceptance is reported up to the one gate the app already reads', () => {
  // Not tracked in the stack: a second source of truth for "has this user
  // accepted" is exactly how the two could disagree.
  assert.match(flow, /onLegalAccepted\(\);/);
  assert.match(app, /onLegalAccepted=\{legal\.markAccepted\}/);
  assert.match(app, /legalComplete=\{legal\.state === 'accepted'\}/);
  assert.doesNotMatch(flow, /useState/, 'the flow holds no legal state of its own');
});

test('Terms & Privacy opens the route once, and cannot double-push', () => {
  assert.match(setup, /if \(navigation\.isFocused\(\)\) navigation\.navigate\('LegalGate'\)/);
  assert.match(setup, /onPress=\{openLegal\}/);
});

test('the landing choice resolves a mode, and creates no screen', () => {
  // Phase 2: "Start in: Find work" is a MODE choice, not a one-shot navigate.
  // It used to push the old browse screen onto the shared customer Home stack,
  // which is the same mechanism that made mode a navigation illusion. The
  // landing preference simply decides which tree the app opens in, and the
  // worker tree's Home stack lands on WorkerHome — explicitly, so the landing
  // cannot drift back into being a declaration-order accident (4D-1b).
  assert.match(read('modes/types.ts'), /export function modeFromLanding\(landing: 'hire' \| 'work'\)/);
  assert.match(read('modes/ModeProvider.tsx'), /modeFromLanding\(landingPreference\)/);
  assert.match(read('lib/navigation.ts'), /WorkerHome: undefined;/);
  assert.doesNotMatch(read('lib/navigation.ts'), /BrowseJobs: undefined;/);
  assert.match(read('navigation/WorkerRoot.tsx'), /initialRouteName="WorkerHome"/);
  // Hire help is simply DEFAULT_MODE — nothing to navigate to, as before.
  assert.match(read('modes/types.ts'), /export const DEFAULT_MODE: AppMode = 'customer';/);
});

test('the landing handoff is consumed once, before anything can await', () => {
  const landing = read('lib/setupLanding.ts');
  assert.match(landing, /const landing = pending;\s*\n\s*pending = null;\s*\n\s*return landing;/);
  // Read synchronously at the top of the resolution effect: an await before it
  // would let a second pass interleave and take the same one-shot value.
  const provider = read('modes/ModeProvider.tsx');
  // F1: the reads start early (readModeSources, no await of its own); the
  // resolution effect takes the landing before it awaits them.
  assert.ok(
    provider.indexOf('consumePendingLanding()') > 0 &&
      provider.indexOf('consumePendingLanding()') < provider.indexOf('await reads'),
    'the landing must be taken before the first await'
  );
  assert.doesNotMatch(
    provider.slice(provider.indexOf('function readModeSources'), provider.indexOf('const MODE_PREFETCH_FRESH_MS')),
    /\bawait\b/,
    'the early reads start without waiting on anything'
  );
  // And exactly one consumer exists, so a remount cannot replay it.
  assert.equal(provider.split('consumePendingLanding()').length - 1, 1);
});

// ---------------------------------------------------------------------------
// Finish setup
// ---------------------------------------------------------------------------

test('Finish setup is gated on legal completion and nothing else', () => {
  assert.match(setup, /const canFinish = legalComplete && !saving;/);
  assert.match(setup, /disabled=\{!canFinish\}/);
  // Permissions are deliberately not in that expression.
  assert.doesNotMatch(setup, /canFinish = .*permission/i);
  assert.match(setup, /Review Terms & Privacy to finish setup\./);
});

test('a double tap cannot write twice or navigate twice', () => {
  assert.match(setup, /if \(!legalComplete \|\| saving \|\| !user\) return;/);
  assert.match(setup, /loading=\{saving\}/);
});

test('navigation only ever follows a successful write', () => {
  const handler = setup.slice(setup.indexOf('async function handleFinish()'));
  const body = handler.slice(0, handler.indexOf('\n  }'));

  // The failure branch returns before the handoff and before onFinished.
  assert.match(body, /if \(writeError\) \{[\s\S]*?return;\s*\n\s*\}/);
  assert.ok(
    body.indexOf('writeSetupRecord') < body.indexOf('onFinished(landing)'),
    'the write must precede the transition'
  );
  const failureEnd = body.indexOf('}\n\n');
  // Guard the guard. A needle that stops matching turns slice(start, -1) into
  // "everything to the end", and this assertion would then be reporting on the
  // success path it is supposed to exclude — passing or failing for reasons
  // that have nothing to do with the code under test.
  assert.notEqual(failureEnd, -1, 'the failure-branch slice must actually terminate');
  const failure = body.slice(body.indexOf('if (writeError)'), failureEnd);
  assert.doesNotMatch(failure, /onFinished|setPendingLanding/);
  // A resolve that lands after the screen is gone writes nothing.
  assert.match(body, /if \(!mounted\.current\) return;/);
});

test('a failed write keeps the user’s choices and stays retryable', () => {
  const handler = setup.slice(setup.indexOf('async function handleFinish()'));
  const body = handler.slice(0, handler.indexOf('\n  }'));
  assert.doesNotMatch(body, /setLanding\(/, 'the chosen destination survives a failure');
  assert.match(body, /setSaving\(false\);/);
  assert.match(setup, /accessibilityLiveRegion="assertive"/);
});

test('the write is idempotent and reports its own failure', () => {
  assert.match(storage, /AsyncStorage\.setItem\(setupStorageKey\(userId\), serializeSetupRecord\(record\)\)/);
  assert.match(storage, /return \{ error: err instanceof Error \? err : new Error\(String\(err\)\) \};/);
  // A read failure is survivable; a write failure is not silently swallowed.
  assert.match(storage, /catch \{\s*\n\s*return null;\s*\n\s*\}/);
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

test('permissions are read on mount and only ever requested on tap', () => {
  // iOS spends its one prompt per install; mounting a screen must not burn it.
  assert.match(perms, /Location\.getForegroundPermissionsAsync\(\)/);
  assert.match(perms, /Notifications\.getPermissionsAsync\(\)/);

  const mountEffect = perms.slice(perms.indexOf('useEffect(() => {'), perms.indexOf('const actOnLocation'));
  assert.doesNotMatch(mountEffect, /requestForegroundPermissionsAsync|requestPermissionsAsync/);
  assert.doesNotMatch(mountEffect, /openAppSettings/, 'mounting must not navigate away either');
});

test('a permission request cannot be started twice', () => {
  // A ref, not state: the state update has not landed when a second tap
  // arrives on the same frame.
  assert.match(perms, /if \(inFlight\.current\.location\) return;/);
  assert.match(perms, /if \(inFlight\.current\.notifications \|\| Platform\.OS === 'web'\) return;/);
  assert.match(perms, /inFlight\.current\.location = false;/);
  assert.match(perms, /inFlight\.current\.notifications = false;/);
});

test('the four permission states are distinguished, and blocked is one of them', () => {
  // Denied can be asked again; blocked cannot, and a switch that silently
  // does nothing is the worst outcome of the three.
  assert.match(perms, /return canAskAgain \? 'denied' : 'blocked';/);
  // n5 (2026-09-04): Setup renders no permission row any more, so the
  // distinction is pinned on the hook that still draws it — the union names
  // blocked and unavailable, and a throw becomes 'unavailable', not a crash.
  assert.match(perms, /\| 'blocked'/);
  assert.match(perms, /\| 'unavailable';/);
  assert.match(perms, /setLocation\('unavailable'\)/);
  assert.match(perms, /setNotifications\('unavailable'\)/);
  assert.doesNotMatch(setup, /state === 'blocked'|Turn this on in device Settings|Not available on this device/);
});

test('a permission row is never a dead control', () => {
  // The regression: once a permission was denied for good, the switch was
  // disabled and the row did nothing — a control that cannot be operated and
  // does not say where the real one is.
  assert.match(perms, /if \(needsSettings\(location\)\) \{\s*\n\s*void openAppSettings\(\);/);
  assert.match(perms, /if \(needsSettings\(notifications\)\) \{\s*\n\s*void openAppSettings\(\);/);
  // Granted counts too: the app cannot revoke what it holds, so Settings is
  // the only place that answer can change.
  assert.match(perms, /return state === 'granted' \|\| state === 'blocked';/);
  assert.match(perms, /Linking\.openSettings\(\)/);

  // n5 (2026-09-04): the rows left Setup — permissions are asked at first
  // need — so the row half of this fence is that Setup draws none: no
  // PermissionSetupRow, no hook, no hand-rolled switch. The hook keeps one
  // action per row (`act`), which is what a row that returns would wire.
  assert.match(perms, /act: actOnLocation,/);
  assert.match(perms, /act: actOnNotifications,/);
  // Usage forms, not the name in prose: the header comment says where the
  // hook went, and that sentence must not be what fails this.
  assert.doesNotMatch(setup, /<PermissionSetupRow|useSetupPermissions\(|hooks\/useSetupPermissions'|<Switch\b/);
});

test('the row says which of the two things a tap will do', () => {
  // n5 (2026-09-04): the permission rows left Setup, so the "which of the
  // two" answer is pinned on the hook: `opensSettings` is true exactly when
  // `act` leaves for Settings rather than prompting, for both permissions.
  assert.match(perms, /opensSettings: boolean;/);
  assert.match(perms, /opensSettings: needsSettings\(location\),/);
  assert.match(perms, /opensSettings: needsSettings\(notifications\),/);
  // And Setup carries neither the row copy nor an appended hint.
  assert.doesNotMatch(setup, /settingsHint|Opens your device settings|Asks for \$\{title/);
  assert.doesNotMatch(setup, /\$\{subtitle\} ·/, 'no appended hint');
});

test('an unsupported environment fails safely rather than crashing', () => {
  assert.match(perms, /if \(Platform\.OS === 'web'\) \{[\s\S]*?setNotifications\('unavailable'\);/);
  // Every read and request is wrapped; a throw becomes a state, not a crash.
  assert.ok((perms.match(/catch \{/g) ?? []).length >= 4);
  assert.match(perms, /if \(active && mounted\.current\)/);
});

test('permissions never block finishing setup', () => {
  const handler = setup.slice(setup.indexOf('async function handleFinish()'));
  assert.doesNotMatch(handler.slice(0, handler.indexOf('\n  }')), /permission/i);
});

// ---------------------------------------------------------------------------
// The screen itself
// ---------------------------------------------------------------------------

test('the Terms row is present, uses the shared SetupRow, and no permission row renders on Setup', () => {
  // n5 (2026-09-04): Location and Notifications left this screen —
  // permissions are asked at first need (lib/geolocation.ts
  // resolveCurrentPlace() where coordinates are first needed;
  // maybePromptForPush after the first post or bid). Terms stays, on the
  // shared row, exactly as it was.
  assert.match(setup, /title="Terms & Privacy"/);
  assert.match(setup, /import \{ SetupRow \} from '\.\.\/components\/SetupRow';/);
  assert.match(setup, /<SetupRow\b/);
  assert.match(setup, /Review both documents to continue/);
  assert.match(setup, /Terms and Privacy reviewed/);
  for (const gone of [
    'title="Location"',
    'title="Notifications"',
    'Required for nearby jobs and workers',
    'Messages, bids and arrival updates',
  ]) {
    assert.ok(!setup.includes(gone), `${gone} must not render on Setup`);
  }
  // Usage forms only — the header comment names the hook file in prose.
  assert.doesNotMatch(setup, /<PermissionSetupRow|useSetupPermissions\(|hooks\/useSetupPermissions'/);
  // One row component, sized to hold one line, so a row that returns cannot
  // drift from the one that stayed.
  assert.match(row, /minHeight: 72/);
  assert.match(row, /minWidth: 46/);
  assert.match(row, /fontSize: 12,\s*\n\s*lineHeight: 16\.5,/);
});

test('the legal row is a status, never a switch', () => {
  const legalRow = setup.slice(setup.indexOf('title="Terms & Privacy"'));
  const block = legalRow.slice(0, legalRow.indexOf('</Animated.View>'));
  assert.doesNotMatch(block, /<Switch/);
  assert.match(block, /name="checkmark-circle"/);
  assert.match(block, /name="chevron-forward"/);
});

test('the two destination cards are exclusive and default to Hire help', () => {
  assert.match(setup, /useState<LandingPreference>\(DEFAULT_LANDING\)/);
  assert.match(setup, /selected=\{landing === 'hire'\}/);
  assert.match(setup, /selected=\{landing === 'work'\}/);
  // One value, so two selected cards is not a representable state, and a
  // rapid switch settles on exactly one.
  assert.match(setup, /onSelect=\{\(\) => setLanding\('hire'\)\}/);
  assert.match(setup, /onSelect=\{\(\) => setLanding\('work'\)\}/);
  assert.match(setup, /accessibilityRole="radiogroup"/);
  assert.match(choice, /accessibilityRole="radio"/);
  assert.match(choice, /aria-checked=\{selected\}/);
});

test('selecting a card changes its colours, never its size', () => {
  // A border that appeared only when selected would shift the pair on the page.
  assert.match(choice, /borderWidth: 1,/);
  const card = choice.slice(choice.indexOf('  card: {'));
  assert.doesNotMatch(card.slice(0, card.indexOf('  },')), /borderWidth: 0/);
  // 2026-09-27 (the Lux remake, ruling 15): the colours are palette roles now
  // — the same pair, resolved per theme.
  assert.match(choice, /cardSelected: \{[\s\S]*?borderColor: colors\.forest,[\s\S]*?backgroundColor: colors\.mint,/);
});

test('what a card looks like cannot drift from what it is', () => {
  // The regression this guards: an interpolated backgroundColor/borderColor
  // stops being applied across the re-render that selecting a card causes, so
  // the card freezes at its first paint — right state, wrong pixels. The
  // selected look is therefore plain conditional styling, and the animation is
  // an opacity-only overlay that can only ever be decoration.
  // 2026-09-27 (the Lux remake, ruling 8): the pop-out shadow rides the same
  // array in dark; the selected look is still plain conditional styling.
  assert.match(choice, /style=\{\[styles\.card, litCardStyle\(isDark\), selected && styles\.cardSelected\]\}/ /* 2026-09-29 (LUX-LIST-2 #6): the lit card, the chosen rim still last */);
  assert.doesNotMatch(choice, /interpolate\(/, 'no animated colour on this card');
  assert.match(choice, /style=\{\[styles\.fill, \{ opacity: fade \}\]\}/);
  assert.match(choice, /pointerEvents="none"/);

  // Same reasoning for the completion pulse on the setup screen.
  assert.match(setup, /const pulseStyle = \{ opacity: pulse \};/);
  assert.doesNotMatch(setup, /outputRange: \['rgba/);
});

test('primary text is the ink token and nothing is a raw hex', () => {
  for (const path of [
    'screens/SetupScreen.tsx',
    'components/SetupRow.tsx',
    'components/SetupChoiceCard.tsx',
    'screens/OnboardingFlow.tsx',
  ]) {
    assert.doesNotMatch(read(path), /#[0-9A-Fa-f]{6}/, `${path} must use tokens`);
  }
  // Titles on the ink, supporting copy muted — palette roles since 2026-09-27
  // (the Lux remake, ruling 15), so both themes resolve them.
  assert.match(row, /title: \{[\s\S]*?color: colors\.ink,/);
  assert.match(row, /subtitle: \{[\s\S]*?color: colors\.textMuted,/);
  assert.match(choice, /title: \{[\s\S]*?color: colors\.ink,/);
});

test('the screen scrolls and stays reachable on a short viewport', () => {
  // AuthScaffold owns the safe area, the scroll fallback and the centred
  // max-width column, so none of it is re-derived here.
  // 2026-09-27 (the Lux remake, ruling 15): themed — Setup follows the scheme.
  // 2026-09-28 (LUX-LIST-64 #9, #23): the bar says "Finish Setup".
  assert.match(setup, /<AuthScaffold title="Finish Setup" titleVariant="large" backdrop="soft" themed>/);
  assert.match(read('components/AuthScaffold.tsx'), /keyboardShouldPersistTaps="handled"/);
  assert.match(read('components/AuthScaffold.tsx'), /maxWidth: authSizes\.maxContentWidth/);
  // The CTA is pushed off the bottom edge rather than pinned to it.
  assert.match(setup, /marginTop: 'auto'/);
});

test('the bar title is a step up, and the CTA a step down', () => {
  const theme = read('lib/authTheme.ts');
  const base = Number(theme.match(/navTitle: \{ fontSize: (\d+)/)[1]);
  const large = Number(theme.match(/navTitleLarge: \{ fontSize: (\d+)/)[1]);
  assert.ok(large > base, 'the Setup title must be larger than the default bar');
  assert.match(setup, /titleVariant="large"/);

  // Semibold, not the default bold: the button sits under a lot of quiet copy.
  assert.match(setup, /weight="semibold"/);
  assert.match(read('components/AuthButton.tsx'), /labelSemibold: \{\s*\n\s*fontWeight: '600',/);
  // …and the shared button was extended, not forked.
  assert.match(read('components/AuthButton.tsx'), /weight\?: 'bold' \| 'semibold';/);
  assert.equal((read('components/AuthButton.tsx').match(/export function AuthButton/g) ?? []).length, 1);
});

test('a mandatory step still has a way out', () => {
  // There is nothing behind Setup, so there is no back button — but a user
  // who cannot finish must not be trapped.
  assert.doesNotMatch(setup, /onBack=/);
  assert.match(setup, /onPress=\{\(\) => logout\(\)\}/);
});

// ---------------------------------------------------------------------------
// Motion and accessibility
// ---------------------------------------------------------------------------

test('the entrance is one animation, and never blocks a tap', () => {
  assert.match(setup, /const enter = useRef\(new Animated\.Value\(0\)\)\.current;/);
  assert.match(setup, /extrapolate: 'clamp'/);
  // Opacity and transform only, so it can run on the native driver.
  assert.match(setup, /useNativeDriver: USE_NATIVE_DRIVER/);
  // The only thing that opts out of touch is the decorative pulse underlay,
  // and it sits behind the row rather than over it.
  assert.equal((setup.match(/pointerEvents="none"/g) ?? []).length, 1);
  assert.match(setup, /styles\.pulseOverlay/);
  assert.match(setup, /pulseOverlay: \{\s*\n\s*\.\.\.StyleSheet\.absoluteFillObject/);
  // It plays once, not again on the way back from the legal gate.
  assert.match(setup, /if \(reducedMotion === null \|\| entered\.current\) return;/);
});

test('reduced motion keeps every state reachable', () => {
  assert.match(setup, /if \(reducedMotion\) \{\s*\n\s*enter\.setValue\(1\);/);
  assert.match(choice, /if \(reducedMotion\) \{\s*\n\s*fade\.setValue\(to\);/);
  assert.match(setup, /if \(reducedMotion\) return;/);
});

test('completion is announced, not only animated', () => {
  assert.match(setup, /Terms and Privacy complete\. Finish setup is now available\./);
  assert.match(setup, /AccessibilityInfo\.announceForAccessibility/);
  // The pulse never runs on arrival for a user who already accepted.
  assert.match(setup, /if \(legalComplete === wasLegalComplete\.current\) return;/);
});

test('no animation writes state after the screen is gone', () => {
  assert.match(setup, /mounted\.current = false;/);
  assert.match(perms, /mounted\.current = false;/);
  // App.tsx's requestAnimationFrame landing jump is gone with the mechanism it
  // served (see "the landing choice resolves a mode"); the equivalent guard is
  // now the resolution effect's own `active` flag.
  assert.match(read('modes/ModeProvider.tsx'), /if \(!active\) return;/);
});

// ---------------------------------------------------------------------------
// Static security properties
// ---------------------------------------------------------------------------

const surface = [
  'screens/SetupScreen.tsx',
  'screens/OnboardingFlow.tsx',
  'components/SetupRow.tsx',
  'components/SetupChoiceCard.tsx',
  'hooks/useSetupStatus.ts',
  'hooks/useSetupPermissions.ts',
  'lib/setupState.ts',
  'lib/setupStorage.ts',
  'lib/setupLanding.ts',
];

test('nothing here holds a secret or reaches for an admin API', () => {
  for (const path of surface) {
    const source = read(path);
    assert.doesNotMatch(source, /service_role|SERVICE_ROLE/, path);
    assert.doesNotMatch(source, /TWILIO_[A-Z]|AUTH_TOKEN|ACCOUNT_SID/i, path);
    assert.doesNotMatch(source, /auth\.admin/, path);
  }
});

test('only setup completion and the chosen destination are stored', () => {
  // Never a credential, a code, a session, or a stand-in for legal acceptance.
  assert.match(read('lib/setupState.ts'), /completed: record\.completed, landing: record\.landing/);
  for (const path of surface) {
    const source = read(path);
    assert.doesNotMatch(source, /password|otp|token|session/i, `${path} must store none of these`);
  }
});

test('legal acceptance is never mirrored locally', () => {
  // The one durable record stays in legal_acceptances, where the version
  // check can see it. Matched as usage, not as prose — setupState.ts names
  // the table in the comment explaining why it stays out of it.
  for (const path of surface) {
    const source = read(path);
    assert.doesNotMatch(source, /acceptCurrentDocuments\(/, path);
    assert.doesNotMatch(source, /from\('legal_acceptances'\)/, path);
    assert.doesNotMatch(source, /setItem\([^)]*legal/i, `${path} must not store acceptance`);
  }
  assert.match(setup, /legalComplete/, 'the screen reads the state, it does not own it');
});

test('no schema change, no second profile system, no new client', () => {
  for (const path of surface) {
    const source = read(path);
    assert.doesNotMatch(source, /from '\.\.\/lib\/supabase'|from '\.\/supabase'/, path);
    assert.doesNotMatch(source, /updateProfile|from\('profiles'\)|\.rpc\(/, path);
    assert.doesNotMatch(source, /createClient/, path);
  }
});

test('the new code carries no escape hatches', () => {
  for (const path of [...surface, 'App.tsx']) {
    const source = read(path);
    assert.doesNotMatch(source, /@ts-ignore|@ts-expect-error|eslint-disable/, path);
    assert.doesNotMatch(source, /:\s*any\b|as any\b/, `${path} must not widen to any`);
  }
});
