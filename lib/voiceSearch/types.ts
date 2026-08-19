/**
 * The voice-search boundary the search UI talks to.
 *
 * SearchBar calls this interface and nothing else — never
 * `expo-speech-recognition` directly (the lib/phoneAuth arrangement: a narrow
 * typed surface, so the vendor API stays swappable and the tests can execute
 * the whole decision surface against an injected double).
 *
 * The two iOS usage strings in app.json are a behavioural contract this
 * boundary enforces, not copy:
 *
 *   - "…only while you are searching by voice, and stops listening when you
 *     finish speaking." → recognition runs only inside a bounded tap session:
 *     one tap starts it, and it ends on ~3s of silence after speech has
 *     begun, a hard 30s ceiling, a second tap, focus loss, backgrounding, or
 *     unmount — never an open-ended stream.
 *   - "Speech is recognized on your device … Nothing is sent to a server."
 *     → recognition is REQUIRED to be on-device. Any state in which that
 *     cannot be guaranteed is `unavailable` — there is no network fallback
 *     path anywhere in this module, and no code path that could send audio
 *     off the device.
 */

/** en-US only this run — locale selection is deliberately not built. */
export const VOICE_SEARCH_LOCALE = 'en-US';

/**
 * Continuous silence after speech has begun that ends the session. App-side:
 * the installed vendor exposes NO usable silence signal on iOS — its
 * `speechend` event is registered but never sent (no `sendEvent("speechend")`
 * exists in ios/ExpoSpeechRecognitionModule.swift), and its own non-continuous
 * stop is a fixed 3s no-result timer buried in ios/ExpoSpeechRecognizer.swift
 * (`invalidateAndScheduleTimer`, `withTimeInterval: 3`), neither configurable
 * nor observable — so the boundary times result events itself. 3000ms matches
 * that internal vendor timer; 2000ms proved short enough to cut the operator
 * off mid-sentence in real use.
 */
export const VOICE_SILENCE_MS = 3000;

/**
 * Hard ceiling on any session, from the moment it begins. An independent
 * app-side timer, armed synchronously before the first vendor call and keyed
 * to NOTHING the recognizer reports: a microphone that stays open because a
 * vendor callback never arrived is the failure this constant exists to
 * prevent.
 */
export const VOICE_MAX_SESSION_MS = 30000;

/**
 * Every degraded state is a first-class `unavailable`, never an error the
 * user sees raw and never a fallback to a network recognizer:
 *
 * - `not-ios` — iOS only. On web the underlying Web Speech API streams audio
 *   to a browser vendor's servers in most browsers, which would break the
 *   permission-string contract outright; Android is deferred (CLAUDE.md).
 * - `module-missing` — the native module is absent (the operator's current
 *   dev build). The vendor package throws at import time on such a binary,
 *   so the boundary guards the import and lands here instead of crashing.
 * - `recognizer-unavailable` — SFSpeechRecognizer reports unavailable.
 * - `no-on-device-support` — the device cannot recognize on-device. The
 *   installed vendor source silently DROPS `requiresOnDeviceRecognition`
 *   when the recognizer lacks support (ios/ExpoSpeechRecognizer.swift,
 *   prepareRequest) — recognition would silently go over the network — so
 *   this boundary refuses to start at all rather than trust the flag alone.
 * - `locale-not-installed` — en-US is not in the device's installed locales
 *   (the verification step the vendor's own option docs require before
 *   enabling `requiresOnDeviceRecognition`).
 * - `permission-denied` — the user declined the microphone or speech
 *   recognition permission; resolves to unavailable, not a raw error.
 * - `module-error` — a vendor probe threw; fail closed.
 */
export type VoiceUnavailableReason =
  | 'not-ios'
  | 'module-missing'
  | 'recognizer-unavailable'
  | 'no-on-device-support'
  | 'locale-not-installed'
  | 'permission-denied'
  | 'module-error';

export type VoiceAvailability =
  | { status: 'available' }
  | { status: 'unavailable'; reason: VoiceUnavailableReason };

export type VoiceSessionHandlers = {
  /**
   * The recognized phrase, at most once per session. The ONLY egress for a
   * transcript: it goes to the caller's onChangeText and nowhere else — never
   * stored, logged, or sent anywhere by this module.
   */
  onTranscript: (transcript: string) => void;
  /**
   * A provisional phrase while recognition is still running — zero or more
   * per session, each superseding the last. Display-only egress: a caller may
   * paint it, but it is never committed (the final phrase arrives once,
   * through onTranscript) and, like the final, is never stored, logged, or
   * sent anywhere by this module. Optional; omitting it changes nothing.
   */
  onInterimTranscript?: (transcript: string) => void;
  /**
   * The session ended, whatever the cause (stopped, silence, ceiling, denied,
   * unavailable, recognizer error, cancelled). Fires exactly once. Carries no
   * message by design: no vendor or device error text can cross this
   * boundary, which is how the lib/errorMessage.ts contract (no raw error
   * text reaches a screen) is satisfied here — nothing crosses at all.
   */
  onEnd: () => void;
};

export type VoiceSession = {
  /** Second tap: stop listening and commit the final phrase, if any. */
  stop(): void;
  /** Tear down without committing (unmount, screen blur, backgrounding). */
  cancel(): void;
};

export type VoiceSearchProvider = {
  /** Whether the mic may render at all. Permission is NOT probed here — it
   *  is requested on first use, inside beginSession. */
  getAvailability(): Promise<VoiceAvailability>;
  /** Tap → beginSession; stop() on the second tap, cancel() on blur,
   *  background, or unmount. Never throws; a degraded state simply ends the
   *  session (onEnd) without starting recognition. */
  beginSession(handlers: VoiceSessionHandlers): VoiceSession;
};

// ---------------------------------------------------------------------------
// The narrow vendor surface — hand-typed from the INSTALLED package
// (node_modules/expo-speech-recognition/src/ExpoSpeechRecognitionModule.types.ts
// and expo-modules-core's EventEmitter declaration), which is the only
// authority on this API. Only what the boundary uses is typed.
// ---------------------------------------------------------------------------

export type VendorEventSubscription = { remove(): void };

export type VendorResultEvent = {
  isFinal: boolean;
  results: Array<{ transcript: string }>;
};

export type VendorErrorEvent = { error: string; message: string };

export type VendorStartOptions = {
  lang?: string;
  interimResults?: boolean;
  continuous?: boolean;
  /** Vendor doc: "Prevent device from sending audio over the network." */
  requiresOnDeviceRecognition?: boolean;
};

export type VendorSpeechModule = {
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  getSupportedLocales(options: {
    androidRecognitionServicePackage?: string;
  }): Promise<{ locales: string[]; installedLocales: string[] }>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: VendorStartOptions): void;
  stop(): void;
  abort(): void;
  addListener: {
    (
      eventName: 'result',
      listener: (event: VendorResultEvent) => void
    ): VendorEventSubscription;
    (
      eventName: 'error',
      listener: (event: VendorErrorEvent) => void
    ): VendorEventSubscription;
    (eventName: 'end', listener: (event: null) => void): VendorEventSubscription;
  };
};
