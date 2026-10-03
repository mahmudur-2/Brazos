import type { ComponentType, PropsWithChildren } from 'react';
import { TurboModuleRegistry, type ViewProps } from 'react-native';
import { resolveCapability, type MotionCapability } from './types';

/**
 * The ONE place in the codebase permitted to load react-native-reanimated,
 * react-native-gesture-handler or react-native-keyboard-controller.
 *
 * This is lib/voiceSearch/index.ts's arrangement applied to a set of native
 * packages, for the same reason and with the same shape: ./types.ts is pure
 * and executed directly by the tests, this file is the only impure module, and
 * a static scan in tests/motion120.test.mjs enforces that nothing else in the
 * tree names any of them in an import or require position.
 *
 * WHY THE LOAD IS LAZY AND CAUGHT. None of the three is safe to STATICALLY
 * import on a binary without its native module. react-native-reanimated's
 * entry initialises its native proxy at import time and
 * react-native-gesture-handler's registers a native module of its own; on a JS
 * bundle running against a build that has neither, a static import at the top
 * of any file on the startup path takes the whole app down before the first
 * frame. The operator's current dev build is exactly that binary. A lazy
 * require inside try/catch resolves it to `unavailable` instead, and every
 * consumer takes its fallback.
 *
 * THE THIRD PACKAGE FAILS DIFFERENTLY and a caught require is not enough for
 * it — see `loadKeyboardController` below, which is the only loader here that
 * asks the native registry before it asks the bundler.
 *
 * THIS IS NOT A TRANSITIONAL SHIM. It stays now that the packages are
 * installed and it stays after the next EAS build ships their native halves:
 * the flags simply start coming back true, and the fast paths that were dark
 * start resolving. Nothing downstream has to change when that happens, which
 * is the property the boundary exists to buy.
 *
 * All three are in package.json. Reanimated, worklets and gesture-handler are
 * in every binary built since d2ccc7f; keyboard-controller's native module is
 * detected at run time below. A binary without one still boots and runs that
 * surface's fallback — the state `npm run verify` and the fences below hold
 * the tree to. (Corrected by fix run F22: this paragraph used to say no native
 * module was in the installed binary.)
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
 * The name react-native-keyboard-controller registers its native module under
 * — read from the package's own spec, which ends
 * `TurboModuleRegistry.get<Spec>("KeyboardController")`.
 */
const KEYBOARD_CONTROLLER_NATIVE_MODULE = 'KeyboardController';

/**
 * THE ONE LOADER THAT ASKS A SECOND QUESTION, and it has to.
 *
 * The two vendors above are import-unsafe by construction: without their
 * native module the entry throws, the catch fires, and `null` is the honest
 * answer. react-native-keyboard-controller is import-SAFE and that is the
 * problem. Its native entry calls `TurboModuleRegistry.get(...)` — the
 * nullable getter, not `getEnforcing` — and when the module is missing it
 * substitutes a Proxy whose every property access throws a linking error. So
 * the require SUCCEEDS on a binary that cannot run a single one of its
 * features, `resolveCapability` would read that as a capability, `KeyboardProvider`
 * would mount, and the first property access inside it would take the app
 * down at render. That is the same SIGABRT class the whole boundary exists to
 * prevent, arriving one layer later than the boundary was built to catch it.
 *
 * So presence is asked of the REGISTRY, which is where the answer actually
 * lives, and only then is the package required. `TurboModuleRegistry.get`
 * returns null rather than throwing when the module is absent, and it consults
 * the legacy `NativeModules` map as well as the TurboModule proxy, so it
 * answers correctly on both architectures. The try/catch still wraps
 * everything: on a runtime with no `TurboModuleRegistry` at all — web among
 * them — the property access throws and this reads as absent, which is again
 * the correct answer.
 */
function loadKeyboardController(): unknown {
  try {
    if (!TurboModuleRegistry.get(KEYBOARD_CONTROLLER_NATIVE_MODULE)) return null;
    return require('react-native-keyboard-controller');
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
  loadKeyboardController,
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

/**
 * keyboard-controller's provider, or null on a binary without its native
 * module.
 *
 * Same shape and same reason as `GestureHandlerRootView` above: the package
 * requires this above the tree before any of its hooks report anything, and it
 * is handed over as a component REFERENCE rather than rendered here so this
 * module stays JSX-free and reads as what it is — the vendor seam. The null
 * branch is the common one today and `MotionRoot` renders a Fragment for it,
 * so the tree below is the same shape on either binary.
 */
export const KeyboardProvider: ComponentType<PropsWithChildren> | null = (() => {
  if (!motionCapability.keyboard) return null;
  const vendor = loadKeyboardController() as {
    KeyboardProvider?: ComponentType<PropsWithChildren>;
  } | null;
  return vendor?.KeyboardProvider ?? null;
})();
