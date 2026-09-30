import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system "reduce motion" preference.
 *
 * Returns `null` until the setting has actually been read — callers gate the
 * start of an animation on a non-null value so the first frames can't play
 * with motion and then snap. The read resolves within a tick; nothing visible
 * waits on it, because the screens render their static background immediately
 * and only the transforms are held back.
 *
 * 2026-09-30 (the build run, the Fable review): the value is also kept for the
 * whole process, read once as the app starts. Every mount after that first read
 * starts WITH the answer instead of null, so an entrance never shows its resting
 * frame, vanishes and fades back in, and the tab bar never mounts one motion
 * path only to swap to the other a tick later.
 *
 * react-native-web maps this onto the `prefers-reduced-motion` media query, so
 * the same code path covers Expo web.
 */
let lastKnown: boolean | null = null;

// Read as early as the module loads, so the first screens usually mount knowing it.
AccessibilityInfo.isReduceMotionEnabled()
  .then((value) => {
    lastKnown = value;
  })
  .catch(() => {
    // Platform doesn't expose it — motion stays on (the hook below says the same).
  });

export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(lastKnown);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        lastKnown = value;
        if (active) setReduced(value);
      })
      .catch(() => {
        // Platform doesn't expose it — motion stays on, which is the
        // pre-existing behaviour everywhere else in the app.
        if (active) setReduced(lastKnown ?? false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        lastKnown = value;
        setReduced(value);
      }
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
