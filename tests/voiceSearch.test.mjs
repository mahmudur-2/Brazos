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
// Tap-to-talk since the 4D-4 device pass.
//
// The two iOS usage strings in app.json are a behavioural contract: a bounded
// tap session that stops when you finish speaking, on-device only, nothing
// sent to a server. These tests hold lib/voiceSearch/ to it by EXECUTING the
// real provider against injected vendor doubles and hand-driven timers (the
// tests/phoneOtp.test.mjs technique) and by scanning the source contracts the
// runtime behavior depends on.
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

const { VOICE_MAX_SESSION_MS, VOICE_SEARCH_LOCALE, VOICE_SILENCE_MS } = await import(typesUrl);
const { createVoiceSearchProvider } = await import(providerUrl);

/** Flush the provider's internal await chain (availability → permission →
 *  start); each round of setImmediate drains the pending microtasks. */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** Hand-driven timers: nothing fires unless a test fires it, which is what
 *  lets the ceiling be proven against a recognizer that reports nothing. */
function fakeTimers() {
  let nextId = 1;
  const pending = new Map();
  return {
    setTimer: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { callback, delayMs });
      return id;
    },
    clearTimer: (id) => {
      pending.delete(id);
    },
    /** The delays still armed, in registration order — the assertion surface. */
    delays: () => [...pending.values()].map((timer) => timer.delayMs),
    /** Fire the one pending timer with this delay; ambiguity is a test bug. */
    fire: (delayMs) => {
      const matches = [...pending.entries()].filter(([, timer]) => timer.delayMs === delayMs);
      assert.equal(matches.length, 1, `expected exactly one ${delayMs}ms timer armed`);
      const [id, timer] = matches[0];
      pending.delete(id);
      timer.callback();
    },
  };
}

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

function iosProvider(vendor, timers = fakeTimers()) {
  return createVoiceSearchProvider({
    platformOS: 'ios',
    loadVendor: () => vendor,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
}

/** A tap session with recording handlers, so assertions read declaratively. */
function tap(provider) {
  const transcripts = [];
  const interims = [];
  let ends = 0;
  const session = provider.beginSession({
    onTranscript: (transcript) => transcripts.push(transcript),
    onInterimTranscript: (transcript) => interims.push(transcript),
    onEnd: () => {
      ends += 1;
    },
  });
  return { session, transcripts, interims, ended: () => ends };
}

// ===========================================================================
// On-device is always requested — and never trusted alone
// ===========================================================================

test('every start() requires on-device recognition, en-US, non-continuous', async () => {
  const { vendor, calls, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = tap(provider);
  await settle();

  assert.equal(calls.start.length, 1);
  const options = calls.start[0];
  // The flag the permission string stands on. The vendor SILENTLY DROPS it
  // when the recognizer lacks on-device support, which is why the probe
  // tests below refuse to start at all in that state.
  assert.equal(options.requiresOnDeviceRecognition, true);
  assert.equal(options.lang, VOICE_SEARCH_LOCALE);
  assert.equal(options.lang, 'en-US');
  // Tap-to-talk is still a bounded session, never a continuous stream.
  assert.equal(options.continuous, false);
  // Interim results are the silence detector's input (the installed vendor
  // exposes no silence signal on iOS); they are never committed.
  assert.equal(options.interimResults, true);

  h.session.stop();
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
    const timers = fakeTimers();
    const provider = createVoiceSearchProvider({
      platformOS,
      loadVendor: () => {
        loads += 1;
        return fakeVendor().vendor;
      },
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    assert.deepEqual(await provider.getAvailability(), {
      status: 'unavailable',
      reason: 'not-ios',
    });
    const h = tap(provider);
    await settle();
    assert.equal(h.ended(), 1, `${platformOS}: the session must end by itself`);
    assert.deepEqual(h.transcripts, []);
    assert.equal(loads, 0, `${platformOS}: the vendor must never be loaded`);
    assert.deepEqual(timers.delays(), [], `${platformOS}: no timer may outlive the session`);
  }
});

test('a missing or throwing native module is unavailable, not a crash', async () => {
  const missingTimers = fakeTimers();
  const missing = createVoiceSearchProvider({
    platformOS: 'ios',
    loadVendor: () => null,
    setTimer: missingTimers.setTimer,
    clearTimer: missingTimers.clearTimer,
  });
  assert.deepEqual(await missing.getAvailability(), {
    status: 'unavailable',
    reason: 'module-missing',
  });

  const throwingTimers = fakeTimers();
  const throwing = createVoiceSearchProvider({
    platformOS: 'ios',
    loadVendor: () => {
      throw new Error('requireNativeModule: ExpoSpeechRecognition is not available');
    },
    setTimer: throwingTimers.setTimer,
    clearTimer: throwingTimers.clearTimer,
  });
  assert.deepEqual(await throwing.getAvailability(), {
    status: 'unavailable',
    reason: 'module-missing',
  });
  const h = tap(throwing);
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
    const h = tap(provider);
    await settle();
    assert.equal(h.ended(), 1, `${reason}: the session must end by itself`);
    assert.equal(calls.start.length, 0, `${reason}: start() must be unreachable`);
  }
});

test('an underscore locale spelling still counts as installed', async () => {
  const { vendor } = fakeVendor({
    getSupportedLocales: async () => ({ locales: ['en_US'], installedLocales: ['en_US'] }),
  });
  assert.deepEqual(await iosProvider(vendor).getAvailability(), { status: 'available' });
});

test('a permission denial (or a throwing request) ends the session without starting', async () => {
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
    // requested on first use, inside the session.
    assert.deepEqual(await provider.getAvailability(), { status: 'available' });
    const h = tap(provider);
    await settle();
    assert.equal(h.ended(), 1);
    assert.deepEqual(h.transcripts, []);
    assert.equal(calls.start.length, 0);
  }
});

test('a grant is remembered; a denial is re-asked on the next session', async () => {
  const granting = fakeVendor();
  const provider = iosProvider(granting.vendor);
  const first = tap(provider);
  await settle();
  granting.emit('end', null);
  const second = tap(provider);
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
  tap(denied);
  await settle();
  tap(denied);
  await settle();
  assert.equal(denying.calls.permissionRequests, 2, 'a denial must ask again next time');
});

// ===========================================================================
// No network-fallback branch exists
// ===========================================================================

test('without on-device support nothing starts — no fallback path to a network recognizer', async () => {
  const { vendor, calls } = fakeVendor({ supportsOnDeviceRecognition: () => false });
  const provider = iosProvider(vendor);
  const h = tap(provider);
  await settle();
  h.session.stop();
  await settle();
  assert.equal(calls.start.length, 0);
  assert.equal(calls.stop, 0);
  assert.equal(h.ended(), 1);
  assert.deepEqual(h.transcripts, []);
});

// ===========================================================================
// Tap-to-talk semantics
// ===========================================================================

test('a session stopped before permission resolves never starts recognition', async () => {
  let resolvePermission;
  const { vendor, calls } = fakeVendor({
    requestPermissionsAsync: () =>
      new Promise((resolve) => {
        resolvePermission = resolve;
      }),
  });
  const provider = iosProvider(vendor);
  const h = tap(provider);
  await settle();
  // Second tap landed while the iOS permission dialog was up.
  h.session.stop();
  resolvePermission({ granted: true });
  await settle();
  assert.equal(calls.start.length, 0, 'a stopped session must never start listening');
  assert.equal(h.ended(), 1);
});

test('a final result mid-session commits once; a second tap stops; end closes', async () => {
  const { vendor, calls, emit } = fakeVendor();
  const timers = fakeTimers();
  const provider = iosProvider(vendor, timers);
  const h = tap(provider);
  await settle();
  // iOS non-continuous mode can finalize on its own while the session is
  // still open (the iOS 18 speechDuration workaround in the installed
  // source reports isFinal mid-stream).
  emit('result', { isFinal: false, results: [{ transcript: 'plu' }] });
  emit('result', { isFinal: true, results: [{ transcript: 'plumber' }] });
  emit('result', { isFinal: true, results: [{ transcript: 'plumber again' }] });
  assert.deepEqual(h.transcripts, ['plumber'], 'exactly one commit per session');
  h.session.stop();
  assert.equal(calls.stop, 1);
  emit('end', null);
  assert.equal(h.ended(), 1);
  assert.deepEqual(timers.delays(), [], 'no timer may outlive the session');
});

test('an empty final transcript commits nothing', async () => {
  const { vendor, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = tap(provider);
  await settle();
  emit('result', { isFinal: true, results: [{ transcript: '' }] });
  emit('result', { isFinal: true, results: [] });
  emit('end', null);
  assert.deepEqual(h.transcripts, []);
  assert.equal(h.ended(), 1);
});

// ===========================================================================
// Live interim text (4D-6) — provisional phrases reach the display-only
// handler while the session runs; committing stays exclusive to the final
// result, exactly once, through onTranscript.
// ===========================================================================

test('interim phrases reach the display handler only — the commit path stays final-only', async () => {
  const { vendor, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = tap(provider);
  await settle();
  emit('result', { isFinal: false, results: [{ transcript: 'plu' }] });
  emit('result', { isFinal: false, results: [{ transcript: 'plumber ne' }] });
  assert.deepEqual(h.interims, ['plu', 'plumber ne'], 'each interim paints, in order');
  assert.deepEqual(h.transcripts, [], 'no interim may commit');
  emit('result', { isFinal: true, results: [{ transcript: 'plumber near me' }] });
  emit('end', null);
  assert.deepEqual(h.transcripts, ['plumber near me']);
  assert.deepEqual(h.interims, ['plu', 'plumber ne'], 'the final is not an interim');
  assert.equal(h.ended(), 1);
});

test('an empty interim paints nothing, and a session without the handler still works', async () => {
  const empty = fakeVendor();
  const h = tap(iosProvider(empty.vendor));
  await settle();
  empty.emit('result', { isFinal: false, results: [{ transcript: '' }] });
  empty.emit('result', { isFinal: false, results: [] });
  assert.deepEqual(h.interims, []);

  // The handler is optional (the boundary contract): a caller that omits it
  // gets exactly the pre-4D-6 behaviour, no crash on an interim.
  const bare = fakeVendor();
  const transcripts = [];
  let ends = 0;
  iosProvider(bare.vendor).beginSession({
    onTranscript: (transcript) => transcripts.push(transcript),
    onEnd: () => {
      ends += 1;
    },
  });
  await settle();
  bare.emit('result', { isFinal: false, results: [{ transcript: 'plu' }] });
  bare.emit('result', { isFinal: true, results: [{ transcript: 'plumber' }] });
  bare.emit('end', null);
  assert.deepEqual(transcripts, ['plumber']);
  assert.equal(ends, 1);
});

test('a cancelled session that saw interims commits nothing and paints nothing more', async () => {
  const { vendor, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = tap(provider);
  await settle();
  emit('result', { isFinal: false, results: [{ transcript: 'plumb' }] });
  assert.deepEqual(h.interims, ['plumb']);
  h.session.cancel();
  emit('result', { isFinal: false, results: [{ transcript: 'stale interim' }] });
  emit('result', { isFinal: true, results: [{ transcript: 'stale' }] });
  assert.deepEqual(h.transcripts, [], 'a cancelled session commits nothing');
  assert.deepEqual(h.interims, ['plumb'], 'a dead session paints nothing more');
  assert.equal(h.ended(), 1);
});

test('cancel aborts, removes listeners, and a late result cannot commit', async () => {
  const { vendor, calls, emit, listenerCount } = fakeVendor();
  const provider = iosProvider(vendor);
  const h = tap(provider);
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
// Silence ends the session — app-side, because the installed vendor exposes
// no silence signal on iOS: its "speechend" event is registered but never
// sent (no sendEvent("speechend") exists in ExpoSpeechRecognitionModule.swift,
// and the speechStartHandler that would pair with it has no call site), and
// its own non-continuous stop is a fixed, unobservable 3s no-result timer in
// ExpoSpeechRecognizer.swift. So the boundary times result events itself.
// ===========================================================================

test('~3s of silence after speech has begun stops listening and commits the final phrase', async () => {
  const { vendor, calls, emit } = fakeVendor();
  const timers = fakeTimers();
  const provider = iosProvider(vendor, timers);
  const h = tap(provider);
  await settle();

  // Before any speech, no silence timer: only the ceiling is armed. The
  // no-speech case belongs to the vendor's own timeout and the ceiling.
  assert.deepEqual(timers.delays(), [VOICE_MAX_SESSION_MS]);

  // Speech begins: the silence clock arms…
  emit('result', { isFinal: false, results: [{ transcript: 'plu' }] });
  assert.deepEqual(timers.delays(), [VOICE_MAX_SESSION_MS, VOICE_SILENCE_MS]);
  // …and every further recognized phrase restarts it rather than stacking.
  emit('result', { isFinal: false, results: [{ transcript: 'plumber ne' }] });
  assert.deepEqual(timers.delays(), [VOICE_MAX_SESSION_MS, VOICE_SILENCE_MS]);

  // ~3s pass with nothing recognized: the boundary stops listening, which
  // makes the vendor deliver the final result and then end — the normal
  // commit path, not a second one.
  timers.fire(VOICE_SILENCE_MS);
  assert.equal(calls.stop, 1);
  emit('result', { isFinal: true, results: [{ transcript: 'plumber near me' }] });
  emit('end', null);
  assert.deepEqual(h.transcripts, ['plumber near me']);
  assert.equal(h.ended(), 1);
  assert.deepEqual(timers.delays(), [], 'no timer may outlive the session');
  // 3000ms matches the vendor's own internal no-result timer; 2000ms cut the
  // operator off mid-sentence in real use (4D-6).
  assert.equal(VOICE_SILENCE_MS, 3000);
});

test('an empty interim result does not count as speech', async () => {
  const { vendor, emit } = fakeVendor();
  const timers = fakeTimers();
  const provider = iosProvider(vendor, timers);
  tap(provider);
  await settle();
  emit('result', { isFinal: false, results: [{ transcript: '' }] });
  emit('result', { isFinal: false, results: [] });
  assert.deepEqual(timers.delays(), [VOICE_MAX_SESSION_MS], 'the silence clock must not arm');
});

// ===========================================================================
// The 30-second ceiling — an independent timer, armed before the first
// vendor call and keyed to NOTHING the recognizer reports. A microphone that
// stays open because a callback never arrived is the failure it prevents.
// ===========================================================================

test('the ceiling is armed synchronously at tap, before any vendor event', () => {
  const timers = fakeTimers();
  const provider = iosProvider(fakeVendor().vendor, timers);
  tap(provider);
  // No settle(): the availability probe has not even resolved yet.
  assert.deepEqual(timers.delays(), [VOICE_MAX_SESSION_MS]);
  assert.equal(VOICE_MAX_SESSION_MS, 30000);
});

test('the ceiling fires while the recognizer reports nothing at all — the session still ends', async () => {
  const { vendor, calls, emit, listenerCount } = fakeVendor();
  const timers = fakeTimers();
  const provider = iosProvider(vendor, timers);
  const h = tap(provider);
  await settle();
  assert.equal(calls.start.length, 1, 'listening began');

  // 30 seconds of nothing: no result, no error, no end — a silence callback
  // that never arrives must not keep the microphone open.
  timers.fire(VOICE_MAX_SESSION_MS);
  assert.equal(calls.abort, 1, 'the vendor is asked to abort');
  assert.equal(h.ended(), 1, 'the session ends without waiting for the vendor');
  assert.equal(listenerCount('result'), 0);
  assert.equal(listenerCount('error'), 0);
  assert.equal(listenerCount('end'), 0);
  assert.deepEqual(h.transcripts, []);
  assert.deepEqual(timers.delays(), []);

  // Even a vendor that wakes up late changes nothing.
  emit('result', { isFinal: true, results: [{ transcript: 'stale' }] });
  emit('end', null);
  assert.deepEqual(h.transcripts, []);
  assert.equal(h.ended(), 1, 'onEnd fires exactly once');
});

test('the ceiling ends even a session still waiting on permission', async () => {
  const { vendor, calls } = fakeVendor({
    // The permission round-trip never resolves at all.
    requestPermissionsAsync: () => new Promise(() => {}),
  });
  const timers = fakeTimers();
  const provider = iosProvider(vendor, timers);
  const h = tap(provider);
  await settle();
  timers.fire(VOICE_MAX_SESSION_MS);
  assert.equal(h.ended(), 1);
  assert.equal(calls.start.length, 0, 'a ceilinged session must never start listening');
});

// ===========================================================================
// No raw vendor error text can escape the boundary
// ===========================================================================

test('a vendor error surfaces nothing — the session just ends', async () => {
  const { vendor, emit } = fakeVendor();
  const provider = iosProvider(vendor);
  const seen = [];
  let ends = 0;
  provider.beginSession({
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

test('[static] the real provider runs on real timers', () => {
  // The injected pair must be setTimeout/clearTimeout and nothing cleverer:
  // the ceiling's independence is a plain wall-clock guarantee.
  const source = read('lib/voiceSearch/index.ts');
  assert.match(source, /setTimer: \(callback, delayMs\) => setTimeout\(callback, delayMs\)/);
  assert.match(source, /clearTimer: \(handle\) => clearTimeout\(/);
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
      'BRAZOS uses your microphone only while you are searching by voice, and stops listening when you finish speaking.',
    speechRecognitionPermission:
      'Speech is recognized on your device to turn what you say into a search. Nothing is sent to a server.',
  });
});

// ===========================================================================
// The SearchBar mic — tap-to-talk behind the onChangeText contract, scanned
// as source facts (the component cannot render here).
// ===========================================================================

const searchBar = read('ui/primitives/SearchBar.tsx');
const searchBarCode = stripCommentsForScan(searchBar);

test('[static] voice text arrives through onChangeText and no second write path exists', () => {
  // The transcript handler IS the typed-text callback — not a wrapper that
  // could store, log, or fork the phrase.
  assert.match(searchBarCode, /onTranscript: onChangeText,/);
  // One session entry point, and the recognized phrase never drives submit:
  // typed text does not auto-submit, so neither may voice.
  assert.equal(searchBarCode.match(/beginSession\(/g)?.length, 1);
  assert.doesNotMatch(searchBarCode, /onSubmit\(\)/);
  assert.equal(
    (searchBarCode.match(/\bonSubmit\b/g) ?? []).length,
    3,
    'onSubmit appears as prop type, destructure, and onSubmitEditing only'
  );
  // Still fully controlled: no internal copy of the query text exists.
  assert.doesNotMatch(searchBarCode, /useState<string>|useState\(''\)|useState\(value\)/);
});

test('[static] interim text is presentation-only: painted while live, never through onChangeText', () => {
  // The provisional phrase lives in its own nullable state — not query state.
  assert.match(
    searchBarCode,
    /const \[interimTranscript, setInterimTranscript\] = useState<string \| null>\(null\)/
  );
  // The boundary's display-only handler IS the state setter — no wrapper
  // exists that could fork an interim into onChangeText (which would fire
  // the consumer's debounced query once per interim).
  assert.match(searchBarCode, /onInterimTranscript: setInterimTranscript,/);
  assert.doesNotMatch(searchBarCode, /onChangeText\((interimTranscript|displayValue)/);
  // The field shows the interim only while a session is live, the parent's
  // value the rest of the time.
  assert.match(searchBarCode, /const showingInterim = listening && interimTranscript != null;/);
  assert.match(searchBarCode, /const displayValue = showingInterim \? interimTranscript : value;/);
  assert.match(searchBarCode, /value=\{displayValue\}/);
  // Session end (stop, cancel, ceiling alike) clears the interim inside the
  // boundary's onEnd, snapping the field back to the parent-controlled value
  // with nothing committed.
  assert.match(searchBarCode, /setInterimTranscript\(null\);/);
  // Provisional styling: the palette's muted (placeholder) treatment while
  // interim, the normal input treatment for committed text.
  assert.match(searchBarCode, /style=\{\[styles\.input, showingInterim && styles\.inputInterim\]\}/);
  assert.match(searchBarCode, /inputInterim: \{\s*color: colors\.muted,\s*\}/);
});

test('[static] the mic renders only when the boundary reports available, absent otherwise', () => {
  assert.match(searchBarCode, /const \[voiceReady, setVoiceReady\] = useState\(false\)/);
  assert.match(searchBarCode, /availability\.status === 'available'/);
  assert.match(searchBarCode, /\{voiceReady && !disableVoiceSearch \? \(/);
  // Unavailable means ABSENT: no disabled state, no ghost, no banner.
  assert.doesNotMatch(searchBarCode, /disabled=|ghost|unavailable/i);
});

test('[static] the opt-out prop suppresses the mic and defaults to present', () => {
  assert.match(searchBar, /disableVoiceSearch\?: boolean;/);
  assert.match(searchBarCode, /disableVoiceSearch = false,/);
  // Opting out also skips the availability probe, not just the render.
  assert.match(searchBarCode, /if \(disableVoiceSearch \|\| isButton\) return;/);
});

test('[static] tap-to-talk: one tap toggles, and every exit path ends the session', () => {
  // The mic is a plain tap target now — the hold handlers are gone entirely.
  assert.match(searchBarCode, /onPress=\{toggleVoiceSession\}/);
  assert.doesNotMatch(searchBarCode, /onPressIn=|onPressOut=/);
  // Second tap: stop-and-commit through the boundary, never a re-start.
  assert.match(searchBarCode, /sessionRef\.current\.stop\(\);/);
  // Unmount, screen blur, and app backgrounding all cancel without
  // committing — the microphone cannot outlive what the user can see.
  assert.match(searchBarCode, /sessionRef\.current\?\.cancel\(\);/);
  assert.match(searchBarCode, /navigation\.addListener\('blur'/);
  assert.match(searchBarCode, /AppState\.addEventListener\('change'/);
  assert.match(searchBarCode, /state !== 'active'/);
  // The blur hook must not hard-require a navigator: the raw context read
  // (undefined outside one) keeps the primitive mountable anywhere.
  assert.match(searchBarCode, /useContext\(NavigationContext\)/);
  assert.doesNotMatch(searchBarCode, /useNavigation\(/);
});

test('[static] the mic is palette-fed and holds the 44pt touch floor', () => {
  // Both mic states read the resolved palette (tests/themeResolution.test.mjs
  // separately guarantees no raw literal anywhere in ui/).
  assert.match(searchBarCode, /color=\{listening \? colors\.emerald : colors\.navInactive\}/);
  assert.match(searchBarCode, /withAlpha\(colors\.emerald, 0\.15\)/);
  // 20pt glyph + spacing.xs (4pt) padding + 8pt hitSlop = 44pt effective.
  assert.match(searchBarCode, /hitSlop=\{8\}/);
  assert.match(searchBarCode, /size=\{20\}/);
  assert.match(searchBarCode, /padding: spacing\.xs,/);
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

// ===========================================================================
// 4D-4 tail — voice search is REACHABLE: the live search surfaces render the
// shared SearchBar (mic on for every one of them), each conversion pinned as
// behaviour-preserving. The locked search surfaces (HomeScreen,
// BrowseJobsScreen) are deliberately absent from this list until unlocked.
// ===========================================================================

const CONVERTED_SURFACES = ['screens/WorkerSearchScreen.tsx', 'screens/WorkerHomeScreen.tsx'];

test('[static] each converted surface renders SearchBar and keeps no raw search TextInput', () => {
  for (const path of CONVERTED_SURFACES) {
    const source = read(path);
    const code = stripCommentsForScan(source);
    assert.match(
      source,
      /import \{ SearchBar \} from '\.\.\/ui\/primitives';/,
      `${path} must import the shared SearchBar from the primitives barrel`
    );
    assert.match(code, /<SearchBar\b/, `${path} must mount the shared SearchBar`);
    // No parallel raw input: neither a second search field nor a leftover.
    assert.doesNotMatch(code, /\bTextInput\b/, `${path} must not keep a raw TextInput`);
  }
});

test('[static] the mic is on for every converted surface — no opt-out, no side channel', () => {
  for (const path of CONVERTED_SURFACES) {
    const code = stripCommentsForScan(read(path));
    assert.doesNotMatch(code, /disableVoiceSearch/, `${path} must not opt out of the mic`);
    // The screen reaches voice only through SearchBar's onChangeText contract.
    assert.doesNotMatch(code, /voiceSearch|beginSession/, `${path} must not touch the boundary itself`);
  }
});

test('[static] WorkerSearch keeps its exact search behaviour behind the conversion', () => {
  const source = read('screens/WorkerSearchScreen.tsx');
  const code = stripCommentsForScan(source);
  // Verbatim copy: placeholder and accessibility label unchanged.
  assert.match(source, /placeholder="What do you need help with\?"/);
  assert.match(source, /accessibilityLabel="Describe the help you need"/);
  // Sentence-typing posture preserved through the new additive props.
  assert.match(code, /autoCapitalize="sentences"/);
  assert.match(code, /autoCorrect\b/);
  // Submit-driven, not search-as-you-type: keyboard return and the retained
  // arrow button both land on the same submit().
  assert.match(code, /onSubmit=\{submit\}/);
  assert.match(code, /onPress=\{submit\}/);
  assert.match(code, /accessibilityLabel="Search workers"/);
  // Typing still resets the run guard, the results, and the pinned chip —
  // which is also exactly what SearchBar's clear control now performs.
  assert.match(
    code,
    /runRef\.current \+= 1;\s*setQuery\(text\);\s*setState\(\{ kind: 'idle' \}\);\s*if \(pinnedCategory\) setPinnedCategory\(null\);/
  );
  // The Discover tab-root mount still opens without stealing the keyboard.
  assert.match(
    code,
    /autoFocus=\{params\?\.autoFocus !== false && !params\?\.query && !params\?\.category\}/
  );
});

test('[static] WorkerHome keeps the locked-48 mirror behind the conversion', () => {
  const source = read('screens/WorkerHomeScreen.tsx');
  const code = stripCommentsForScan(source);
  assert.match(source, /placeholder="Search for jobs or areas"/);
  assert.match(code, /autoCapitalize="sentences"/);
  // The locked twin renders no clear control; the mirror keeps that.
  assert.match(code, /disableClear/);
  // The divider + arrow submit stay, and keyboard return and the arrow both
  // land on the same submitSearch().
  assert.match(code, /onSubmit=\{submitSearch\}/);
  assert.match(code, /onPress=\{submitSearch\}/);
  assert.match(code, /styles\.searchDivider/);
  assert.match(code, /arrow-forward-circle/);
});

test("[static] SearchBar's additive props default to the exact posture existing consumers had", () => {
  // Each default reproduces the previously hardcoded value, so a consumer
  // passing nothing new (the catalog) renders byte-identically.
  assert.match(searchBarCode, /autoCapitalize = 'none',/);
  assert.match(searchBarCode, /autoCorrect = false,/);
  assert.match(searchBarCode, /disableClear = false,/);
  // The knobs feed the same TextInput attributes the literals fed before.
  assert.match(searchBarCode, /autoCapitalize=\{autoCapitalize\}/);
  assert.match(searchBarCode, /autoCorrect=\{autoCorrect\}/);
  assert.match(searchBarCode, /\{value\.length > 0 && !disableClear \? \(/);
  // The trailing slot renders inside the field; absent by default renders
  // nothing at all.
  assert.match(searchBarCode, /\{trailing\}/);
});
