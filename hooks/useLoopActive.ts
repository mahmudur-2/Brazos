import { useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

/**
 * FIX-RUN F16 — MAY AN ENDLESS LOOP RUN RIGHT NOW? True while the screen that holds it is the
 * focused screen AND the app is in the foreground; false the moment either stops being true.
 *
 * A loop (a live dot's sonar, a rail's shimmer, a rim light's lap, a skeleton's pulse) is only
 * worth its frames while someone can see it. Native-driver loops keep ticking under a pushed
 * screen and behind the home screen, which is battery and frame budget spent on nothing, so
 * every `Animated.loop(` / `withRepeat(` in the tree starts on this and stops when it turns false
 * (tests/smoothPass.test.mjs holds the census).
 *
 * FOCUS IS READ FROM THE CONTEXT, NOT `useIsFocused`, which throws outside a navigator: a loop in
 * a modal, an overlay or the dev catalog has no screen around it, and there it counts as focused.
 * The first value is `navigation.isFocused()`, so a loop on the screen already on top starts on its
 * first render rather than one event later.
 */
export function useLoopActive(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);
  const [foreground, setForeground] = useState(() => AppState.currentState !== 'background');

  useEffect(() => {
    if (!navigation) return;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  return focused && foreground;
}
