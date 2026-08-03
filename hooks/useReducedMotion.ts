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
 * react-native-web maps this onto the `prefers-reduced-motion` media query, so
 * the same code path covers Expo web.
 */
export function useReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        // Platform doesn't expose it — motion stays on, which is the
        // pre-existing behaviour everywhere else in the app.
        if (active) setReduced(false);
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => setReduced(value)
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
