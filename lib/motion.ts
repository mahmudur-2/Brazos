import { Platform } from 'react-native';

/**
 * The one Animated-driver gate. The web target has no native animated
 * module, so transform/opacity animations run natively everywhere except
 * web. Import this constant — never redeclare it and never write a
 * `useNativeDriver:` literal at a call site; tests/motionDriver.test.mjs
 * fences both, so the platform decision cannot drift file by file again.
 */
export const USE_NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Color props (an interpolated borderColor) are outside the native animated
 * module on EVERY platform, so those few animations stay on the JS driver
 * unconditionally. Named here so the call site says why and the no-literal
 * fence can still hold everywhere else.
 */
export const JS_DRIVER = false;
