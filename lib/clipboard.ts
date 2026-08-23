/**
 * THE ONE PLACE PERMITTED TO LOAD expo-clipboard.
 *
 * WHY IT IS A BOUNDARY AND NOT AN IMPORT. expo-clipboard's entry does
 * `requireNativeModule('ExpoClipboard')` at MODULE SCOPE
 * (node_modules/expo-clipboard/build/ExpoClipboard.js:2), so importing it
 * statically anywhere on the startup path throws on a binary that does not
 * carry the native module — which is the operator's current dev build, since
 * the package landed in package.json today and the build predates it. That is
 * the same failure mode lib/motion120/vendor.ts exists for, so this is the
 * same arrangement: one lazy, caught require, resolved once.
 *
 * `Clipboard` left React Native core, so there is no core fallback to reach
 * for. A build without the module cannot write the clipboard at all, and the
 * honest response is to not offer the control — see `canCopy`.
 */

type ClipboardModule = {
  setStringAsync: (text: string) => Promise<boolean>;
};

function load(): ClipboardModule | null {
  try {
    const vendor = require('expo-clipboard') as Partial<ClipboardModule> | null;
    return typeof vendor?.setStringAsync === 'function' ? (vendor as ClipboardModule) : null;
  } catch {
    return null;
  }
}

/**
 * Resolved ONCE per process. A native module cannot appear or disappear while
 * the app is running, so re-probing per render would burn a try/catch for an
 * answer that cannot change.
 */
const clipboard = load();

/**
 * Whether this binary can write the clipboard at all.
 *
 * Callers render their copy affordance only when this is true — the same
 * never-a-dead-control rule the composer's dictation mic follows. A Copy
 * button that cannot copy is worse than no Copy button, because the user
 * believes the text is on their clipboard and pastes something else.
 */
export function canCopy(): boolean {
  return clipboard != null;
}

/**
 * Write text to the clipboard, reporting whether it actually landed.
 *
 * Returns false rather than throwing, for the two ways this fails that a
 * caller has to handle identically: the module is absent, or the native call
 * rejected. Empty text is also false — putting an empty string on someone's
 * clipboard silently destroys whatever they had there, which is a worse
 * outcome than doing nothing.
 */
export async function copyText(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (!clipboard || !trimmed) return false;
  try {
    // expo-clipboard resolves `false` on a platform that refused the write;
    // anything other than an explicit false counts as written.
    const wrote = await clipboard.setStringAsync(trimmed);
    return wrote !== false;
  } catch {
    return false;
  }
}
