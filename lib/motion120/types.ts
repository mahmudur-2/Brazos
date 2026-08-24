/**
 * The motion boundary's PURE half. No vendor package is named here and no
 * module is loaded — everything below is a function of its arguments, so the
 * tests execute it directly rather than mocking a native module.
 *
 * (The arrangement is lib/voiceSearch's, deliberately: ./vendor.ts is the one
 * impure module, this file and the resolver it exports are pure, and a static
 * scan in tests/motion120.test.mjs enforces the exclusivity.)
 */

/**
 * What a binary can actually run. All three start false and only a successful,
 * caught vendor load turns one on — a missing native module must read as
 * "cannot", never as "unknown, try anyway".
 */
export type MotionCapability = {
  /**
   * react-native-reanimated resolved: animation can be driven from the UI
   * thread by worklets, which is what a 120Hz gesture-following surface
   * needs. False means core `Animated` with `USE_NATIVE_DRIVER`, which is
   * smooth for transform/opacity but cannot follow a finger frame-for-frame.
   */
  reanimated: boolean;
  /**
   * react-native-gesture-handler resolved: real pan/swipe recognisers and the
   * root view they require. False means the app has no swipe surfaces at all
   * and every action reachable by a swipe must ALSO be reachable another way.
   */
  gestures: boolean;
  /**
   * react-native-keyboard-controller resolved AND its native module actually
   * registered in this binary: the keyboard's own frame, per frame, on the UI
   * thread — in both directions and through an interactive drag-to-dismiss,
   * which emits no event for anyone to imitate. False means the core
   * `Keyboard` events and a timing curve aimed at the same destination.
   *
   * THE SECOND HALF OF THAT SENTENCE IS LOAD-BEARING and this flag is the one
   * place in the boundary where "the require resolved" is NOT the question.
   * The other two vendors throw on import without their native module, so a
   * caught require answers honestly for them. This one does not: its entry
   * reads `TurboModuleRegistry.get('KeyboardController')` — the NULLABLE
   * getter — and wraps the miss in a Proxy that throws on first property
   * access, so the import succeeds on a binary that cannot run it and the
   * crash arrives later, at render, inside the provider. `./vendor.ts`'s
   * loader therefore asks the registry itself before it requires anything.
   */
  keyboard: boolean;
};

/** What a capability probe hands the resolver. Each loader returns the vendor
 *  module, or null if this binary has no native module behind it. */
export type VendorProbe = {
  loadReanimated: () => unknown;
  loadGestureHandler: () => unknown;
  loadKeyboardController: () => unknown;
};

/**
 * Turn three guarded loads into the capability set.
 *
 * A vendor counts as PRESENT only if its load returned a non-null object. A
 * package that is installed in node_modules but has no native module in the
 * binary throws on load; its loader catches and returns null, and this reads
 * that as absent — which is the correct answer, because the JavaScript being
 * resolvable is not the question.
 *
 * That last sentence is the whole contract, and `keyboard` is why it is
 * phrased about the LOADER rather than about the require: a vendor whose
 * import survives without its native module has to be probed some other way,
 * and this resolver neither knows nor cares which way — it asks each loader
 * and believes a null.
 */
export function resolveCapability(probe: VendorProbe): MotionCapability {
  return {
    reanimated: isUsableModule(probe.loadReanimated()),
    gestures: isUsableModule(probe.loadGestureHandler()),
    keyboard: isUsableModule(probe.loadKeyboardController()),
  };
}

function isUsableModule(loaded: unknown): boolean {
  return loaded != null && (typeof loaded === 'object' || typeof loaded === 'function');
}

/**
 * Choose between a `.motion120` fast path and its fallback.
 *
 * `load` is the caller's own guarded `require` of its sibling implementation.
 * It runs ONLY when the named capability is true, and a throw inside it
 * resolves to the fallback rather than propagating: a fast path that cannot
 * load is a fast path this binary does not have, not a crash.
 *
 * WHY THE CALLER OWNS THE REQUIRE. Metro resolves `require` statically at
 * bundle time, so the path cannot be passed in as a string — a sibling that
 * does not exist on disk fails the whole build, in every theme and on every
 * platform (the same class of fault home(1) recorded for a deleted PNG). The
 * caller writing its own literal require is what keeps that resolvable.
 */
export function resolveMotion120<T>(
  capability: MotionCapability,
  needs: keyof MotionCapability,
  load: () => T,
  fallback: T
): T {
  if (!capability[needs]) return fallback;
  try {
    const loaded = load();
    return loaded ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * The drop-up / dropdown / sheet timing this app uses for a menu that grows
 * out of the control that opened it. 200ms sits inside the 180–220 the
 * dispatch named; it is one constant so the composer's menu, the chat
 * overflow menu and the inbox row actions cannot drift into three tempos.
 */
export const MENU_MOTION_MS = 200;

/** The same motion, reversed. A dismissal that takes as long as an entrance
 *  reads as sluggish; two thirds is the convention this app already follows
 *  in its sheets. */
export const MENU_MOTION_OUT_MS = 130;
