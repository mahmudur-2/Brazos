import {
  VOICE_MAX_SESSION_MS,
  VOICE_SEARCH_LOCALE,
  VOICE_SILENCE_MS,
  type VendorEventSubscription,
  type VendorSpeechModule,
  type VoiceAvailability,
  type VoiceSession,
  type VoiceSessionHandlers,
  type VoiceSearchProvider,
} from './types';

/**
 * The whole decision surface of the voice-search boundary, pure so the tests
 * execute it (the lib/phoneAuth/supabase.ts arrangement): the platform, the
 * vendor module, and the timers arrive injected, no React Native import, no
 * side effect at module scope.
 *
 * Invariants the tests hold this file to:
 *
 * - `start()` is called with `requiresOnDeviceRecognition: true`, always —
 *   and never at all unless every availability probe passed first. The
 *   installed vendor silently drops that flag when the recognizer lacks
 *   on-device support (recognition would silently go over the network), so
 *   the probe is the enforcement, not the flag.
 * - Every degraded state resolves to `unavailable` / a session that ends
 *   without starting. There is no network-fallback branch to take.
 * - A session is bounded: it ends on ~2s of silence after speech has begun
 *   (app-side — the installed vendor exposes no silence signal on iOS, see
 *   VOICE_SILENCE_MS), on a second tap, and unconditionally at the 30s
 *   ceiling, which is armed synchronously before the first vendor call and
 *   fires even if the recognizer never reports anything at all.
 * - No vendor error payload escapes: the error listener ignores its event,
 *   and onEnd carries no message.
 */

export type VoiceSearchDeps = {
  /** Platform.OS, injected. Anything but 'ios' is unavailable. */
  platformOS: string;
  /** Returns the vendor module, or null on a binary without it. May throw;
   *  a throw is treated as null (the import-safety contract). */
  loadVendor: () => VendorSpeechModule | null;
  /** setTimeout, injected so the tests drive both timers by hand. */
  setTimer: (callback: () => void, delayMs: number) => unknown;
  /** clearTimeout for a handle setTimer returned. */
  clearTimer: (handle: unknown) => void;
};

/** "en_US" and "en-US" name the same locale; compare them as one. */
function normalizeLocaleTag(tag: string): string {
  return tag.replace(/_/g, '-').toLowerCase();
}

export function createVoiceSearchProvider(deps: VoiceSearchDeps): VoiceSearchProvider {
  // undefined = never probed; null = probed and absent/broken.
  let vendor: VendorSpeechModule | null | undefined;
  let permissionGranted = false;

  function vendorModule(): VendorSpeechModule | null {
    if (vendor === undefined) {
      try {
        vendor = deps.loadVendor();
      } catch {
        vendor = null;
      }
    }
    return vendor;
  }

  async function getAvailability(): Promise<VoiceAvailability> {
    // Platform first: on web/Android the vendor module is never even loaded.
    if (deps.platformOS !== 'ios') {
      return { status: 'unavailable', reason: 'not-ios' };
    }
    const mod = vendorModule();
    if (!mod) {
      return { status: 'unavailable', reason: 'module-missing' };
    }
    try {
      if (!mod.isRecognitionAvailable()) {
        return { status: 'unavailable', reason: 'recognizer-unavailable' };
      }
      if (!mod.supportsOnDeviceRecognition()) {
        return { status: 'unavailable', reason: 'no-on-device-support' };
      }
      const { installedLocales } = await mod.getSupportedLocales({});
      const wanted = normalizeLocaleTag(VOICE_SEARCH_LOCALE);
      if (!installedLocales.some((locale) => normalizeLocaleTag(locale) === wanted)) {
        return { status: 'unavailable', reason: 'locale-not-installed' };
      }
    } catch {
      return { status: 'unavailable', reason: 'module-error' };
    }
    return { status: 'available' };
  }

  /** Requested on first use, per the boundary contract. A denial (or a
   *  throw) is `false` — the session ends quietly, no raw error surfaces. */
  async function ensurePermission(mod: VendorSpeechModule): Promise<boolean> {
    if (permissionGranted) return true;
    try {
      const response = await mod.requestPermissionsAsync();
      permissionGranted = response.granted === true;
    } catch {
      permissionGranted = false;
    }
    return permissionGranted;
  }

  function beginSession(handlers: VoiceSessionHandlers): VoiceSession {
    let phase: 'pending' | 'listening' | 'done' = 'pending';
    let stoppedWhilePending = false;
    let committed = false;
    let subscriptions: VendorEventSubscription[] = [];
    let ceilingTimer: unknown = null;
    let silenceTimer: unknown = null;

    const clearSilenceTimer = () => {
      if (silenceTimer != null) {
        deps.clearTimer(silenceTimer);
        silenceTimer = null;
      }
    };

    const finish = () => {
      if (phase === 'done') return;
      phase = 'done';
      if (ceilingTimer != null) {
        deps.clearTimer(ceilingTimer);
        ceilingTimer = null;
      }
      clearSilenceTimer();
      for (const subscription of subscriptions) {
        try {
          subscription.remove();
        } catch {
          // Already removed; nothing to unwind.
        }
      }
      subscriptions = [];
      handlers.onEnd();
    };

    /** Polite stop: the vendor finishes the task, emits the final result
     *  (committed below), then 'end' closes the session. */
    const stopListening = () => {
      try {
        vendorModule()?.stop();
      } catch {
        finish();
      }
    };

    /** Silence detection, app-side (see VOICE_SILENCE_MS): each recognized
     *  phrase restarts the clock; ~2s after the last one, stop. Never armed
     *  before speech has begun — the vendor's own no-speech timeout and the
     *  ceiling cover a session in which nothing is ever said. */
    const restartSilenceTimer = () => {
      clearSilenceTimer();
      silenceTimer = deps.setTimer(stopListening, VOICE_SILENCE_MS);
    };

    // The hard ceiling, armed before the first vendor call and dependent on
    // nothing the recognizer reports. If it fires, the session is torn down
    // unconditionally — abort is REQUESTED of the vendor, but finish() does
    // not wait for its 'end' event, because a wedged recognizer that never
    // delivers one is exactly the case this timer exists for.
    ceilingTimer = deps.setTimer(() => {
      if (phase === 'listening') {
        try {
          vendorModule()?.abort();
        } catch {
          // finish() below tears down regardless.
        }
      }
      finish();
    }, VOICE_MAX_SESSION_MS);

    void (async () => {
      const availability = await getAvailability();
      if (availability.status !== 'available') {
        finish();
        return;
      }
      // Availability passed, so the vendor is already loaded and cached; the
      // null check only narrows the type.
      const mod = vendorModule();
      if (!mod) {
        finish();
        return;
      }
      if (!(await ensurePermission(mod))) {
        finish();
        return;
      }
      // The user may have tapped stop (or the ceiling may have fired) during
      // the permission round-trip; honoring that here keeps a stopped session
      // from ever opening the microphone.
      if (phase !== 'pending' || stoppedWhilePending) {
        finish();
        return;
      }

      try {
        subscriptions = [
          mod.addListener('result', (event) => {
            if (phase === 'done' || committed) return;
            // Any recognized speech is the silence detector's input: interim
            // results arrive for this (interimResults: true below), are never
            // committed, and only restart the clock.
            if (event.results[0]?.transcript) restartSilenceTimer();
            if (!event.isFinal) return;
            const transcript = event.results[0]?.transcript ?? '';
            if (!transcript) return;
            committed = true;
            clearSilenceTimer();
            handlers.onTranscript(transcript);
          }),
          // The vendor's error payload dies here, unread: 'end' follows every
          // error (installed source: sendErrorAndStop pairs them), and finish
          // surfaces no message — so no vendor text can reach a screen.
          mod.addListener('error', () => {}),
          mod.addListener('end', () => finish()),
        ];
        phase = 'listening';
        mod.start({
          lang: VOICE_SEARCH_LOCALE,
          interimResults: true,
          continuous: false,
          requiresOnDeviceRecognition: true,
        });
      } catch {
        finish();
      }
    })();

    return {
      stop() {
        if (phase === 'listening') {
          clearSilenceTimer();
          stopListening();
        } else if (phase === 'pending') {
          stoppedWhilePending = true;
        }
      },
      cancel() {
        if (phase === 'listening') {
          try {
            vendorModule()?.abort();
          } catch {
            // finish() below tears down regardless.
          }
        }
        finish();
      },
    };
  }

  return { getAvailability, beginSession };
}
