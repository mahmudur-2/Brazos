// THE METRO CONFIG EXISTS FOR ONE REASON: DEBUG IDS.
//
// A source map is useless unless the bundle it belongs to can be matched to
// it. Sentry matches them by a debug ID stamped into both, and the thing that
// stamps it is this serializer. Without this file the native builds upload
// source maps that never resolve, every crash report is a wall of minified
// frames, and the whole of R2 is unverifiable — the reports arrive and say
// nothing.
//
// `getSentryExpoConfig` is the installed @sentry/react-native 7.2.0's own
// helper (exported from @sentry/react-native/metro, verified against the
// package rather than assumed). It calls Expo's `getDefaultConfig` itself and
// returns the wrapped result, which is why Expo's default is not required
// here separately — wrapping it twice would be the mistake, not the omission.
//
// This is also the file in R2 most likely to disturb the screenshot harness,
// because it changes what `expo export` produces for every platform including
// web. It landed together with the App.tsx wiring, under one acceptance gate:
// a fresh export plus a real render of customer Home in both colour schemes.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
