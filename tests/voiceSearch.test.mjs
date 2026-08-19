import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// ===========================================================================
// Stage 4D-4 Block 2 — the voice-search boundary, executed and scanned.
//
// The two iOS usage strings in app.json are a behavioural contract:
// hold-to-talk only, on-device only, nothing sent to a server. These tests
// hold lib/voiceSearch/ to it by EXECUTING the real provider against injected
// vendor doubles (the tests/phoneOtp.test.mjs technique) and by scanning the
// source contracts the runtime behavior depends on.
// ===========================================================================

const strip = (path) => stripTypeScriptTypes(read(path), { mode: 'strip' });
const toDataUrl = (js) =>
  'data:text/javascript;charset=utf-8;base64,' + Buffer.from(js, 'utf8').toString('base64');

const link = (path, links = {}) => {
  let js = strip(path);
  for (const [specifier, url] of Object.entries(links)) {
    js = js.replaceAll(`from '${specifier}'`, `from '${url}'`);
  }
  return toDataUrl(js);
};

const typesUrl = link('lib/voiceSearch/types.ts');
const providerUrl = link('lib/voiceSearch/provider.ts', { './types': typesUrl });

const { VOICE_SEARCH_LOCALE } = await import(typesUrl);
const { createVoiceSearchProvider } = await import(providerUrl);

/** Flush the provider's internal await chain (availability → permission →
 *  start); each round of setImmediate drains the pending microtasks. */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** A recording vendor double with drivable events. */
function fakeVendor(overrides = {}) {
  const calls = { start: [], stop: 0, abort: 0, permissionRequests: 0 };
  const listeners = new Map();
  const vendor = {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    getSupportedLocales: async () => ({
      locales: ['en-US', 'es-ES'],
      installedLocales: ['en-US', 'es-ES'],
    }),
    requestPermissionsAsync: async () => {
      calls.permissionRequests += 1;
      return { granted: true };
    },
    start: (options) => calls.start.push(options),
    stop: () => {
      calls.stop += 1;
    },
    abort: () => {
      calls.abort += 1;
    },
    addListener: (name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
      return {
        remove: () => {
          listeners.get(name).delete(listener);
        },
      };
    },
    ...overrides,
  };
  const emit = (name, event) => {
    for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
  };
  const listenerCount = (name) => (listeners.get(name) ?? new Set()).size;
  return { vendor, calls, emit, listenerCount };
}

function iosProvider(vendor) {
  return createVoiceSearchProvider({ platformOS: 'ios', loadVendor: () => vendor });
}

/** A hold with recording handlers, so assertions read declaratively. */
function hold(provider) {
  const transcripts = [];
  let ends = 0;
  const session = provider.beginHold({
    onTranscript: (transcript) => transcripts.push(transcript),
    onEnd: () => {
      ends += 1;
    },
  });
  return { session, transcripts, ended: () => ends };
}

// ===========================================================================
// On-device is always requested — and never trusted alone
// ===========================================================================

test('every start() requires on-device recognition, en-US, non-continuous', async () => {
  const { vendor, calls, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = hold(provider);
  await settle();

  assert.equal(calls.start.length, 1);
  const options = calls.start[0];
  // The flag the permission string stands on. The vendor SILENTLY DROPS it
  // when the recognizer lacks on-device support, which is why the probe
  // tests below refuse to start at all in that state.
  assert.equal(options.requiresOnDeviceRecognition, true);
  assert.equal(options.lang, VOICE_SEARCH_LOCALE);
  assert.equal(options.lang, 'en-US');
  // Hold-to-talk is a bounded session, never a continuous stream.
  assert.equal(options.continuous, false);
  assert.equal(options.interimResults, false);

  h.session.release();
  assert.equal(calls.stop, 1);
  emit('result', { isFinal: true, results: [{ transcript: 'plumber near me' }] });
  emit('end', null);
  assert.deepEqual(h.transcripts, ['plumber near me']);
  assert.equal(h.ended(), 1);
});

/** Comment-stripped, so prose may NAME an identifier without matching. */
const stripCommentsForScan = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('[static] the on-device flag is written true, once, and never false', () => {
  const source = stripCommentsForScan(read('lib/voiceSearch/provider.ts'));
  const writes = source.match(/requiresOnDeviceRecognition\s*:\s*\w+/g) ?? [];
  assert.deepEqual(writes, ['requiresOnDeviceRecognition: true']);
});

// ===========================================================================
// Every degraded case is unavailable — and start() is unreachable
// ===========================================================================

test('any platform but iOS is unavailable and never loads the vendor', async () => {
  for (const platformOS of ['web', 'android', 'windows', 'macos']) {
    let loads = 0;
    const provider = createVoiceSearchProvider({
      platformOS,
      loadVendor: () => {
        loads += 1;
        return fakeVendor().vendor;
      },
    });
    assert.deepEqual(await provider.getAvailability(), {
      status: 'unavailable',
      reason: 'not-ios',
    });
    const h = hold(provider);
    await settle();
    assert.equal(h.ended(), 1, `${platformOS}: the hold must end by itself`);
    assert.deepEqual(h.transcripts, []);
    assert.equal(loads, 0, `${platformOS}: the vendor must never be loaded`);
  }
});

test('a missing or throwing native module is unavailable, not a crash', async () => {
  const missing = createVoiceSearchProvider({ platformOS: 'ios', loadVendor: () => null });
  assert.deepEqual(await missing.getAvailability(), {
    status: 'unavailable',
    reason: 'module-missing',
  });

  const throwing = createVoiceSearchProvider({
    platformOS: 'ios',
    loadVendor: () => {
      throw new Error('requireNativeModule: ExpoSpeechRecognition is not available');
    },
  });
  assert.deepEqual(await throwing.getAvailability(), {
    status: 'unavailable',
    reason: 'module-missing',
  });
  const h = hold(throwing);
  await settle();
  assert.equal(h.ended(), 1);
});

test('every degraded vendor state maps to its own unavailable reason', async () => {
  const cases = [
    [{ isRecognitionAvailable: () => false }, 'recognizer-unavailable'],
    [{ supportsOnDeviceRecognition: () => false }, 'no-on-device-support'],
    [
      {
        getSupportedLocales: async () => ({
          locales: ['en-US'],
          installedLocales: ['es-ES'],
        }),
      },
      'locale-not-installed',
    ],
    [
      {
        isRecognitionAvailable: () => {
          throw new Error('native probe blew up');
        },
      },
      'module-error',
    ],
    [
      {
        getSupportedLocales: async () => {
          throw new Error('error_1');
        },
      },
      'module-error',
    ],
  ];
  for (const [overrides, reason] of cases) {
    const { vendor, calls } = fakeVendor(overrides);
    const provider = iosProvider(vendor);
    assert.deepEqual(await provider.getAvailability(), { status: 'unavailable', reason });
    const h = hold(provider);
    await settle();
    assert.equal(h.ended(), 1, `${reason}: the hold must end by itself`);
    assert.equal(calls.start.length, 0, `${reason}: start() must be unreachable`);
  }
});

test('an underscore locale spelling still counts as installed', async () => {
  const { vendor } = fakeVendor({
    getSupportedLocales: async () => ({ locales: ['en_US'], installedLocales: ['en_US'] }),
  });
  assert.deepEqual(await iosProvider(vendor).getAvailability(), { status: 'available' });
});

test('a permission denial (or a throwing request) ends the hold without starting', async () => {
  for (const overrides of [
    { requestPermissionsAsync: async () => ({ granted: false }) },
    {
      requestPermissionsAsync: async () => {
        throw new Error('permissions module not found');
      },
    },
  ]) {
    const { vendor, calls } = fakeVendor(overrides);
    const provider = iosProvider(vendor);
    // Render-time availability deliberately excludes permission — it is
    // requested on first use, inside the hold.
    assert.deepEqual(await provider.getAvailability(), { status: 'available' });
    const h = hold(provider);
    await settle();
    assert.equal(h.ended(), 1);
    assert.deepEqual(h.transcripts, []);
    assert.equal(calls.start.length, 0);
  }
});

test('a grant is remembered; a denial is re-asked on the next hold', async () => {
  const granting = fakeVendor();
  const provider = iosProvider(granting.vendor);
  const first = hold(provider);
  await settle();
  granting.emit('end', null);
  const second = hold(provider);
  await settle();
  granting.emit('end', null);
  assert.equal(granting.calls.permissionRequests, 1, 'a grant must not re-prompt');
  assert.equal(first.ended(), 1);
  assert.equal(second.ended(), 1);

  const denying = fakeVendor({
    requestPermissionsAsync: async () => {
      denying.calls.permissionRequests += 1;
      return { granted: false };
    },
  });
  // The override above increments itself, so start from the double's count.
  denying.calls.permissionRequests = 0;
  const denied = iosProvider(denying.vendor);
  hold(denied);
  await settle();
  hold(denied);
  await settle();
  assert.equal(denying.calls.permissionRequests, 2, 'a denial must ask again next time');
});

// ===========================================================================
// No network-fallback branch exists
// ===========================================================================

test('without on-device support nothing starts — no fallback path to a network recognizer', async () => {
  const { vendor, calls } = fakeVendor({ supportsOnDeviceRecognition: () => false });
  const provider = iosProvider(vendor);
  const h = hold(provider);
  await settle();
  h.session.release();
  await settle();
  assert.equal(calls.start.length, 0);
  assert.equal(calls.stop, 0);
  assert.equal(h.ended(), 1);
  assert.deepEqual(h.transcripts, []);
});

// ===========================================================================
// Hold-to-talk semantics
// ===========================================================================

test('a hold released before permission resolves never starts recognition', async () => {
  let resolvePermission;
  const { vendor, calls } = fakeVendor({
    requestPermissionsAsync: () =>
      new Promise((resolve) => {
        resolvePermission = resolve;
      }),
  });
  const provider = iosProvider(vendor);
  const h = hold(provider);
  await settle();
  // Finger already lifted while the iOS permission dialog was up.
  h.session.release();
  resolvePermission({ granted: true });
  await settle();
  assert.equal(calls.start.length, 0, 'a released hold must never start listening');
  assert.equal(h.ended(), 1);
});

test('a final result before release commits once; release stops; end closes', async () => {
  const { vendor, calls, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = hold(provider);
  await settle();
  // iOS non-continuous mode can finalize on its own silence timeout while
  // the finger is still down.
  emit('result', { isFinal: false, results: [{ transcript: 'plu' }] });
  emit('result', { isFinal: true, results: [{ transcript: 'plumber' }] });
  emit('result', { isFinal: true, results: [{ transcript: 'plumber again' }] });
  assert.deepEqual(h.transcripts, ['plumber'], 'exactly one commit per hold');
  h.session.release();
  assert.equal(calls.stop, 1);
  emit('end', null);
  assert.equal(h.ended(), 1);
});

test('an empty final transcript commits nothing', async () => {
  const { vendor, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = hold(provider);
  await settle();
  emit('result', { isFinal: true, results: [{ transcript: '' }] });
  emit('result', { isFinal: true, results: [] });
  emit('end', null);
  assert.deepEqual(h.transcripts, []);
  assert.equal(h.ended(), 1);
});

test('cancel aborts, removes listeners, and a late result cannot commit', async () => {
  const { vendor, calls, emit, listenerCount } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = hold(provider);
  await settle();
  assert.equal(listenerCount('result'), 1);
  h.session.cancel();
  assert.equal(calls.abort, 1);
  assert.equal(h.ended(), 1);
  assert.equal(listenerCount('result'), 0);
  assert.equal(listenerCount('error'), 0);
  assert.equal(listenerCount('end'), 0);
  emit('result', { isFinal: true, results: [{ transcript: 'stale' }] });
  emit('end', null);
  assert.deepEqual(h.transcripts, []);
  assert.equal(h.ended(), 1, 'onEnd fires exactly once');
});

// ===========================================================================
// No raw vendor error text can escape the boundary
// ===========================================================================

test('a vendor error surfaces nothing — the session just ends', async () => {
  const { vendor, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const seen = [];
  let ends = 0;
  provider.beginHold({
    onTranscript: (transcript) => seen.push(transcript),
    onEnd: (...args) => {
      ends += 1;
      seen.push(...args);
    },
  });
  await settle();
  emit('error', {
    error: 'service-not-allowed',
    message: 'SFSpeechRecognitionErrorDomain error 102 — kAFAssistantErrorDomain',
  });
  emit('end', null);
  assert.equal(ends, 1);
  assert.deepEqual(seen, [], 'no transcript, no message, no payload of any kind');
});

test('[static] the boundary never reads or forwards a vendor error message', () => {
  const source = read('lib/voiceSearch/provider.ts');
  assert.doesNotMatch(source, /\.message\b/, 'the error payload must die unread');
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(stripped, /console\./, 'no transcript or error may be logged');
});

// ===========================================================================
// Import safety and boundary exclusivity
// ===========================================================================

test('[static] the vendor import is lazy and guarded — import-safe without the native module', () => {
  const source = read('lib/voiceSearch/index.ts');
  assert.doesNotMatch(
    source,
    /import[^\n]*from\s+['"]expo-speech-recognition['"]/,
    'a static import executes requireNativeModule at startup and crashes a binary without the module'
  );
  assert.match(
    source,
    /try\s*\{[\s\S]*?require\('expo-speech-recognition'\)[\s\S]*?\}\s*catch[\s\S]*?return null;/,
    'the require must be inside try/catch resolving to null'
  );
});

test('[static] nothing outside lib/voiceSearch/index.ts touches expo-speech-recognition', () => {
  const dirs = ['lib', 'screens', 'components', 'hooks', 'ui', 'navigation', 'modes', 'dev-tools'];
  const files = ['App.tsx', 'index.ts'];
  for (const dir of dirs) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true, recursive: true })) {
      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(relative(root, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
    }
  }
  assert.ok(files.length > 100, `the sweep must enumerate the app source (saw ${files.length})`);
  // Import/require forms only: prose may NAME the package (the boundary's own
  // docblocks do), but only lib/voiceSearch/index.ts may LOAD it.
  const loadsVendor = /(?:from\s+['"]|require\(['"])expo-speech-recognition/;
  const offenders = files.filter(
    (path) => path !== 'lib/voiceSearch/index.ts' && loadsVendor.test(read(path))
  );
  assert.deepEqual(offenders, [], 'only the boundary may import the vendor package');
});

// ===========================================================================
// The two iOS usage strings — proven against app.json and the installed
// plugin source (the `npx expo config --type introspect` substitution: that
// command reads .env, which this suite must not, so the resolution path is
// proven statically instead).
// ===========================================================================

test('[static] app.json registers the plugin with the two verbatim usage strings', () => {
  const app = JSON.parse(read('app.json'));
  const entry = app.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-speech-recognition'
  );
  assert.ok(entry, 'the expo-speech-recognition config plugin must be registered');
  assert.deepEqual(entry[1], {
    microphonePermission:
      'BRAZOS uses your microphone only while you hold the mic button to search by voice.',
    speechRecognitionPermission:
      'Speech is recognized on your device to turn what you say into a search. Nothing is sent to a server.',
  });
});

test('[static] the installed plugin resolves those options into the two Info.plist keys', () => {
  // The installed package is the authority (dispatch): its root app.plugin.js
  // assigns each option onto config.ios.infoPlist, options winning over any
  // pre-existing value. If a future upgrade renames an option, this fails
  // before a build silently ships the fallback copy.
  const plugin = read('node_modules/expo-speech-recognition/app.plugin.js');
  assert.match(
    plugin,
    /config\.ios\.infoPlist\.NSSpeechRecognitionUsageDescription =\s*\n?\s*props\?\.speechRecognitionPermission \|\|/
  );
  assert.match(
    plugin,
    /config\.ios\.infoPlist\.NSMicrophoneUsageDescription =\s*\n?\s*props\?\.microphonePermission \|\|/
  );
  const installed = JSON.parse(read('node_modules/expo-speech-recognition/package.json'));
  assert.equal(installed.version, '3.1.3');
  assert.equal(JSON.parse(read('package.json')).dependencies['expo-speech-recognition'], '3.1.3');
});
