/**
 * THE ONE PLACE PERMITTED TO LOAD expo-haptics.
 *
 * WHY IT IS A BOUNDARY AND NOT AN IMPORT. Same arrangement, and the same two
 * reasons, as lib/clipboard.ts — one lazy, caught `require`, resolved once.
 *
 * A BINARY THAT PREDATES THE PACKAGE. expo-haptics entered package.json in the
 * run that created this file, so the operator's current dev build carries no
 * ExpoHaptics native module. The vendor entry uses
 * `requireOptionalNativeModule`, which resolves to null rather than throwing,
 * and its call sites then REJECT with UnavailabilityError. A synchronous throw
 * and a rejected promise are two different failure shapes and `fire()` swallows
 * both — a buzz that did not happen is never worth an error a user can see,
 * and no caller should have to guard a haptic.
 *
 * NO CALLERS YET. Nothing imports this. It exists so that the screens which
 * will call it do not each grow their own try/catch around the same vendor.
 */

/**
 * Only what this wrapper actually calls. The two enums are optional because a
 * caller must never depend on their presence to get a defensible default: the
 * enum members ARE the wire strings ('light', 'success'), so the fallback is
 * the same value the enum would have produced.
 */
type HapticsModule = {
  impactAsync: (style: string) => Promise<void>;
  notificationAsync: (type: string) => Promise<void>;
  selectionAsync: () => Promise<void>;
  ImpactFeedbackStyle?: Record<string, string>;
  NotificationFeedbackType?: Record<string, string>;
};

function load(): HapticsModule | null {
  try {
    const vendor = require('expo-haptics') as Partial<HapticsModule> | null;
    return typeof vendor?.impactAsync === 'function' ? (vendor as HapticsModule) : null;
  } catch {
    return null;
  }
}

/**
 * Resolved ONCE per process. A native module cannot appear or disappear while
 * the app is running, so re-probing per tap would burn a try/catch for an
 * answer that cannot change.
 */
const haptics: HapticsModule | null = load();

/**
 * Run one vendor call so that nothing it does can reach the caller.
 *
 * The try/catch covers a synchronous throw; the `.catch` covers the rejected
 * promise `UnavailabilityError` actually arrives as. Neither is logged: this
 * fires on ordinary taps, and a build without the native module would print
 * once per interaction.
 */
function fire(call: (module: HapticsModule) => Promise<void>): void {
  if (!haptics) return;
  try {
    void call(haptics).catch(() => {});
  } catch {
    /* a haptic that did not happen is not an error */
  }
}

/** A light impact — the acknowledgement for an ordinary press. */
export function tap(): void {
  fire((h) => h.impactAsync(h.ImpactFeedbackStyle?.Light ?? 'light'));
}

/** The success notification — an action completed, not merely registered. */
export function confirm(): void {
  fire((h) => h.notificationAsync(h.NotificationFeedbackType?.Success ?? 'success'));
}

/** The selection tick — the value under the finger changed. */
export function select(): void {
  fire((h) => h.selectionAsync());
}
