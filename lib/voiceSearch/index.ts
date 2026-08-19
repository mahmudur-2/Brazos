import { Platform } from 'react-native';
import { createVoiceSearchProvider } from './provider';
import type { VendorSpeechModule } from './types';

/**
 * The ONE place in the codebase permitted to import expo-speech-recognition
 * (the lib/phoneAuth/index.ts arrangement: this file is the boundary's only
 * impure module; ./types.ts and ./provider.ts are pure so the tests execute
 * them directly). A static scan in tests/voiceSearch.test.mjs enforces the
 * exclusivity.
 *
 * The vendor import is guarded because the package is NOT import-safe on a
 * binary without its native module: its entry calls
 * `requireNativeModule("ExpoSpeechRecognition")` at import time (installed
 * source, src/ExpoSpeechRecognitionModule.ts), which throws — and the
 * operator's current dev build has no such module. A static `import` here
 * would crash the whole app at startup; the lazy, caught require resolves
 * that binary to `unavailable` instead. The platform gate in the provider
 * runs before any vendor load, so web and Android never touch the package.
 */
function loadVendor(): VendorSpeechModule | null {
  try {
    const vendorPackage = require('expo-speech-recognition') as {
      ExpoSpeechRecognitionModule?: VendorSpeechModule;
    };
    return vendorPackage.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

export const voiceSearch = createVoiceSearchProvider({
  platformOS: Platform.OS,
  loadVendor,
});

export { VOICE_SEARCH_LOCALE } from './types';
export type {
  VoiceAvailability,
  VoiceHoldHandlers,
  VoiceHoldSession,
  VoiceSearchProvider,
  VoiceUnavailableReason,
} from './types';
