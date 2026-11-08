import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * THE APP CONFIG, replacing app.json so that three build variants can live on
 * one device at once.
 *
 * IT IMPORTS NOTHING BUT A TYPE, AND THAT IS LOAD-BEARING. `import type` is
 * erased at compile time, so this file pulls in no runtime module at all. In
 * particular it must never import config/env.ts: that module validates the
 * environment at import time and THROWS on a malformed one, and this file is
 * evaluated by `expo start`, `expo export` and every EAS build. A throw here
 * breaks all three before anything can report why. So the two variables below
 * are read straight off process.env and nothing is validated.
 *
 * WHAT DECIDES A VARIANT is APP_VARIANT, a build-time variable set by the
 * eas.json profile. It is deliberately NOT the EXPO_PUBLIC_ one: this file
 * runs on the build machine, not in the bundle. eas.json sets both names to
 * the same value, because the app reads EXPO_PUBLIC_APP_VARIANT at runtime
 * (config/env.ts) and would otherwise think every build was a development one.
 *
 * AN UNKNOWN VARIANT RESOLVES TO development rather than to undefined. That is
 * not validation — nothing here can throw — it just keeps a typo out of the
 * bundle identifier, where it would produce a build whose identity is the
 * string "undefined".
 */

const VARIANTS = ['development', 'preview', 'production'] as const;
type Variant = (typeof VARIANTS)[number];

const requested = process.env.APP_VARIANT;
const VARIANT: Variant = (VARIANTS as readonly string[]).includes(requested ?? '')
  ? (requested as Variant)
  : 'development';

/**
 * Suffixes, so a developer build, a beta and the store build coexist on one
 * device. Production carries NO suffix: its identifiers are the ones the App
 * Store and Play Console already know, and changing either is a new app.
 */
const BUNDLE_SUFFIX: Record<Variant, string> = {
  development: '.dev',
  preview: '.preview',
  production: '',
};

const DISPLAY_NAME: Record<Variant, string> = {
  development: 'BRAZOS Dev',
  preview: 'BRAZOS Beta',
  production: 'BRAZOS',
};

/**
 * ALL THREE VARIANTS SHARE ONE ICON, and that is a deliberate stop rather than
 * an oversight. Distinct dev/beta icons were specified, but the two files they
 * named do not exist in assets/brand/ and this run does not invent artwork.
 * Shipping a variant pointed at a missing asset fails the build; shipping the
 * real icon three times does not. Giving the dev and beta builds their own
 * badge remains an operator task.
 */
const ICON: Record<Variant, string> = {
  development: './assets/brand/app-icon-b-leaf.png',
  preview: './assets/brand/app-icon-b-leaf.png',
  production: './assets/brand/app-icon-b-leaf.png',
};

export default (_context: ConfigContext): ExpoConfig => ({
  name: DISPLAY_NAME[VARIANT],
  slug: 'BRAZOS',
  version: '1.0.0',
  // appVersion, not fingerprint: an OTA update is compatible with a binary
  // when their `version` matches, which is a fact a human can read off this
  // file. A fingerprint is recomputed from the whole native dependency graph,
  // so an unrelated dependency bump silently orphans every installed build
  // from its update channel.
  runtimeVersion: {
    policy: 'appVersion',
  },
  orientation: 'portrait',
  icon: ICON[VARIANT],
  userInterfaceStyle: 'automatic',
  scheme: 'brazos',
  ios: {
    // Phone-only. There is no tablet layout in this app, and declaring tablet
    // support obliges every screen to work at iPad geometry.
    supportsTablet: false,
    bundleIdentifier: `app.brazos.mobile${BUNDLE_SUFFIX[VARIANT]}`,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSPhotoLibraryAddUsageDescription:
        'Brazos saves job and work photos you choose to share to your photo library.',
      NSFaceIDUsageDescription: 'Unlock hidden chats with Face ID.',
      // NSLocationAlwaysAndWhenInUseUsageDescription and UIBackgroundModes are
      // BOTH GONE, and they were removed together because they were one
      // request. Nothing reads location in the background (live location
      // sharing was removed in lean D3b), and App Review asks what uses them.
    },
    // FIX-RUN B13 (2026-10-03, the operator switched it on): no entitlements
    // block. R6a (D8) declared Time Sensitive notifications here, but nothing
    // ever sends one (no interruptionLevel anywhere in lib/ or
    // supabase/functions/), and App Review asks what a declared capability is
    // for. expo-notifications still writes aps-environment itself.
  },
  // Carried over whole from app.json: same entries, same order. The usage
  // strings say "Brazos" (operator decision 2026-08-29, D17: the all-caps
  // form is the app's NAME — DISPLAY_NAME and slug — never its prose voice).
  // A usage string is what App Review reads out loud.
  plugins: [
    'expo-font',
    [
      'expo-image-picker',
      {
        photosPermission:
          'Brazos uses your photo library so you can attach photos and videos to jobs, messages, reviews, and your profile.',
        // FIX-RUN B12: the camera takes photos only (launchCameraAsync in Chat
        // and Profile); videos come from the library, which the line above says.
        cameraPermission:
          'Brazos uses the camera to take photos of jobs, completed work, and your profile.',
        microphonePermission:
          'Brazos uses your microphone only while you search or dictate by voice, and stops listening when you finish.',
      },
    ],
    [
      'expo-location',
      {
        // Lean D3b: live location sharing is gone; when-in-use only, no Always.
        locationWhenInUsePermission:
          'Brazos uses your location to show nearby jobs and to place jobs on the map.',
      },
    ],
    [
      'expo-notifications',
      {
        color: '#1F4D3A',
      },
    ],
    // 2026-09-30 (the build run, idea 18): expo-image-picker and this plugin each write
    // NSMicrophoneUsageDescription and one wins at prebuild, so both carry the one complete
    // sentence — search and dictation into Post a job (FIX-RUN B12: nothing films a video;
    // lean D3a: no voice messages, so the sentence says neither).
    [
      'expo-speech-recognition',
      {
        microphonePermission:
          'Brazos uses your microphone only while you search or dictate by voice, and stops listening when you finish.',
        speechRecognitionPermission:
          'Speech is recognized on your device to turn what you say into a search, or into the words of a job you post. Nothing is sent to a server.',
      },
    ],
    'expo-video',
    'expo-secure-store',
    // AN OPTIONS OBJECT, NOT A BARE STRING, and the difference is a crash:
    // withStripeIos destructures props.merchantIdentifier, so a bare string
    // passes undefined and `expo export` dies with a TypeError before Metro
    // starts. FIX-RUN B13 (2026-10-03): no merchantIdentifier, so the plugin
    // writes no Apple Pay (in-app-payments) entitlement — the payment sheet is
    // initialised without any applePay parameter (lib/payments/stripe.ts) and
    // offers cards only. Enabling Apple Pay later is the processing
    // certificate, this identifier back, the sheet parameter and a new build.
    // enableGooglePay: false actively REMOVES the Google Pay meta-data from
    // the Android manifest.
    ['@stripe/stripe-react-native', { enableGooglePay: false }],
    // SOURCE-MAP UPLOAD IS ON NOW, which is the whole reason this stopped
    // being a bare string. The plugin writes a sentry.properties the native
    // build steps read, and without the three values below sentry-cli has no
    // idea which project to upload to — an uploaded bundle whose source map
    // never resolves is a stack trace of minified frames, which is the same as
    // no crash reporting at all.
    //
    // THE AUTH TOKEN IS DELIBERATELY ABSENT. The plugin accepts an `authToken`
    // prop and it must never be used: this file is committed, and the token is
    // a credential. It lives as SENTRY_AUTH_TOKEN, a sensitive variable in
    // each EAS environment, which is where sentry-cli looks for it anyway.
    //
    // `@sentry/react-native/expo` rather than the bare name, and the two are
    // interchangeable by construction: the package ships no `exports` map, so
    // the subpath resolves to its own expo.js, and app.plugin.js — what Expo
    // loads for the bare name — is nothing but `require('./expo')`. Both
    // spellings were resolved against the installed 7.2.0 and returned the
    // identical module object. The explicit subpath is the one Sentry's Expo
    // documentation uses, so it is the one that stays readable.
    [
      '@sentry/react-native/expo',
      {
        organization: 'brazos-32',
        project: 'react-native',
        url: 'https://sentry.io/',
      },
    ],
    'expo-localization',
  ],
  extra: {
    eas: {
      projectId: 'c870820e-40cf-4367-9ae5-3eb2c6c8c481',
    },
  },
  owner: 'mah_r2',
  updates: {
    url: 'https://u.expo.dev/c870820e-40cf-4367-9ae5-3eb2c6c8c481',
  },
});
