import {
  VOICE_SEARCH_LOCALE,
  type VendorEventSubscription,
  type VendorSpeechModule,
  type VoiceAvailability,
  type VoiceHoldHandlers,
  type VoiceHoldSession,
  type VoiceSearchProvider,
} from './types';

/**
 * The whole decision surface of the voice-search boundary, pure so the tests
 * execute it (the lib/phoneAuth/supabase.ts arrangement): the platform and
 * the vendor module arrive injected, no React Native import, no side effect
 * at module scope.
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
 * - Recognition runs only between press-in and release: a hold released
 *   before the permission round-trip finished never starts at all.
 * - No vendor error payload escapes: the error listener ignores its event,
 *   and onEnd carries no message.
 */

export type VoiceSearchDeps = {
  /** Platform.OS, injected. Anything but 'ios' is unavailable. */
  platformOS: string;
  /** Returns the vendor module, or null on a binary without it. May throw;
   *  a throw is treated as null (the import-safety contract). */
  loadVendor: () => VendorSpeechModule | null;
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
   *  throw) is `false` — the hold ends quietly, no raw error surfaces. */
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

  function beginHold(handlers: VoiceHoldHandlers): VoiceHoldSession {
    let phase: 'pending' | 'listening' | 'done' = 'pending';
    let releasedWhilePending = false;
    let committed = false;
    let subscriptions: VendorEventSubscription[] = [];

    const finish = () => {
      if (phase === 'done') return;
      phase = 'done';
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
      // The user may have let go during the permission round-trip; honoring
      // that here is what keeps "only while you hold" literally true.
      if (phase !== 'pending' || releasedWhilePending) {
        finish();
        return;
      }

      try {
        subscriptions = [
          mod.addListener('result', (event) => {
            if (phase === 'done' || committed || !event.isFinal) return;
            const transcript = event.results[0]?.transcript ?? '';
            if (!transcript) return;
            committed = true;
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
          interimResults: false,
          continuous: false,
          requiresOnDeviceRecognition: true,
        });
      } catch {
        finish();
      }
    })();

    return {
      release() {
        if (phase === 'listening') {
          try {
            vendorModule()?.stop();
          } catch {
            finish();
          }
        } else if (phase === 'pending') {
          releasedWhilePending = true;
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

  return { getAvailability, beginHold };
}
