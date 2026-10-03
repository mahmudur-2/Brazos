import { useEffect } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** How long a message must hold before it is spoken: a count that ticks while a filter settles,
 *  or an error that lands while VoiceOver is still reading the button just pressed, is said once. */
export const ANNOUNCE_SETTLE_MS = 350;

/**
 * Fix run E4 — speak, on iOS, a line VoiceOver would otherwise miss.
 * `accessibilityLiveRegion` is Android-only: on iOS an error, a count or a
 * toast that appears is silent until the user swipes onto it. Call this beside
 * every live region with the text that region shows; each time it becomes a
 * new non-empty string and holds for ANNOUNCE_SETTLE_MS, iOS announces it once.
 * Android keeps its live region, so nothing is ever spoken twice.
 */
export function useAnnounce(message: string | null | undefined | false): void {
  useEffect(() => {
    if (Platform.OS !== 'ios' || !message) return;
    const timer = setTimeout(() => AccessibilityInfo.announceForAccessibility(message), ANNOUNCE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [message]);
}

/**
 * The same, as an element: for a live region that renders inside a condition,
 * where a hook cannot be called. Place it beside the region; it draws nothing.
 */
export function Announce({ message }: { message: string | null | undefined | false }): null {
  useAnnounce(message);
  return null;
}
