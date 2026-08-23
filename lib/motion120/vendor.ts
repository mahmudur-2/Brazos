import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';
import { resolveCapability, type MotionCapability } from './types';

/**
 * The ONE place in the codebase permitted to load react-native-reanimated or
 * react-native-gesture-handler.
 *
 * This is lib/voiceSearch/index.ts's arrangement applied to a second pair of
 * native packages, for the same reason and with the same shape: ./types.ts is
 * pure and executed directly by the tests, this file is the only impure
 * module, and a static scan in tests/motion120.test.mjs enforces that nothing
 * else in the tree names either package in an import or require position.
 *
 * WHY THE LOAD IS LAZY AND CAUGHT. Neither package is import-safe on a binary
 * without its native module. react-native-reanimated's entry initialises its
 * native proxy at import time and react-native-gesture-handler's registers a
 * native module of its own; on a JS bundle running against a build that has
 * neither, a STATIC import at the top of any file on the startup path takes
 * the whole app down before the first frame. The operator's current dev build
 * is exactly that binary. A lazy require inside try/catch resolves it to
 * `unavailable` instead, and every consumer takes its fallback.
 *
 * THIS IS NOT A TRANSITIONAL SHIM. It stays after the packages are installed
 * and the next EAS build ships them: the flags simply start coming back true,
 * and the fast paths that were dark start resolving. Nothing downstream has to
 * change when that happens, which is the property the boundary exists to buy.
 *
 * AT THE TIME OF WRITING neither package is in package.json — the install was
 * refused by the repository's dependency guard (see HANDOFF.md's operator
 * steps). Both capabilities therefore resolve false on every build today, the
 * app boots, and every surface runs its fallback. That is the designed state,
 * not a degraded one.
 */

function loadReanimated(): unknown {
  try {
    return require('react-native-reanimated');
  } catch {
    return null;
  }
}

function loadGestureHandler(): unknown {
  try {
    return require('react-native-gesture-handler');
  } catch {
    return null;
  }
}

/**
 * Resolved ONCE per process, deliberately.
 *
 * A native module cannot appear or disappear while the app is running, so
 * re-probing per render would burn a try/catch on every frame of a gesture
 * and could not produce a different answer. It also means every consumer sees
 * the same capability for the whole session — a swipe surface and the
 * long-press fallback for the same action can never both be live.
 */
export const motionCapability: MotionCapability = resolveCapability({
  loadReanimated,
  loadGestureHandler,
});

/**
 * gesture-handler's root view, or null on a binary without it.
 *
 * The package requires this to wrap the whole tree before ANY of its
 * recognisers work. It is exported as a component reference rather than
 * rendered here so this module stays JSX-free and can be read as what it is:
 * the vendor seam.
 */
export const GestureHandlerRootView: ComponentType<ViewProps> | null = (() => {
  if (!motionCapability.gestures) return null;
  const vendor = loadGestureHandler() as {
    GestureHandlerRootView?: ComponentType<ViewProps>;
  } | null;
  return vendor?.GestureHandlerRootView ?? null;
})();
