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
 *   - "…only while you hold the mic button…"  → recognition runs only inside
 *     a hold session: begin on press-in, stop on release, never a toggle.
 *   - "Speech is recognized on your device … Nothing is sent to a server."
 *     → recognition is REQUIRED to be on-device. Any state in which that
 *     cannot be guaranteed is `unavailable` — there is no network fallback
 *     path anywhere in this module, and no code path that could send audio
 *     off the device.
 */

/** en-US only this run — locale selection is deliberately not built. */
export const VOICE_SEARCH_LOCALE = 'en-US';

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

export type VoiceHoldHandlers = {
  /**
   * The recognized phrase, at most once per hold. The ONLY egress for a
   * transcript: it goes to the caller's onChangeText and nowhere else — never
   * stored, logged, or sent anywhere by this module.
   */
  onTranscript: (transcript: string) => void;
  /**
   * The hold ended, whatever the cause (released, denied, unavailable,
   * recognizer error, cancelled). Fires exactly once. Carries no message by
   * design: no vendor or device error text can cross this boundary, which is
   * how the lib/errorMessage.ts contract (no raw error text reaches a
   * screen) is satisfied here — nothing crosses at all.
   */
  onEnd: () => void;
};

export type VoiceHoldSession = {
  /** The user let go: stop listening and commit the final phrase, if any. */
  release(): void;
  /** Tear down without committing (unmount). */
  cancel(): void;
};

export type VoiceSearchProvider = {
  /** Whether the mic may render at all. Permission is NOT probed here — it
   *  is requested on first use, inside beginHold. */
  getAvailability(): Promise<VoiceAvailability>;
  /** Press-in → beginHold; release() on press-out. Never throws; a degraded
   *  state simply ends the session (onEnd) without starting recognition. */
  beginHold(handlers: VoiceHoldHandlers): VoiceHoldSession;
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
