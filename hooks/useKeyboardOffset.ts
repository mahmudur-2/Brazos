import { useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { riseFor } from '../components/KeyboardRisingColumn.shared';

/**
 * How far a bottom-anchored column must rise to sit on the keyboard, as an
 * `Animated.Value` that can be driven by the NATIVE driver.
 *
 * WHY THIS EXISTS — the root cause of the chat composer's slow rise.
 *
 * `KeyboardAvoidingView behavior="padding"` animates `paddingBottom`. Padding
 * is a LAYOUT property: every frame of the keyboard's rise re-runs Yoga over
 * the whole column — the message FlatList, its cells, the reply chip, the
 * composer — and none of that can leave the JS thread, because the native
 * animated module only drives `transform` and `opacity`. So the animation
 * competes with rendering, with the FlatList's own windowing work, and with
 * whatever the keyboard's appearance triggered, and it arrives late and
 * uneven. That is not a tuning problem; padding cannot be made smooth.
 *
 * A `translateY` transform is the same visual result with none of that: no
 * relayout, no measurement, and the interpolation runs on the UI thread, so it
 * holds its frame budget while JS is busy. This hook is the seam that produces
 * it — and it is where a reanimated `.motion120` sibling plugs in when the
 * package lands, since a worklet reading the keyboard frame directly is the
 * only thing better than this.
 *
 * TIMING COMES FROM THE SYSTEM, not from us. iOS reports the keyboard's own
 * duration on `keyboardWillShow`/`WillHide` and the animation matches it, so
 * the column and the keyboard move as one object rather than two things that
 * happen to overlap. The easing is the usual approximation of UIKit's private
 * keyboard curve; a value of our own would drift out of step with the system
 * on every OS revision.
 *
 * `insetBelow` is whatever already holds the column clear of the screen
 * bottom — the floating nav pill's clearance in chat's case. The keyboard
 * covers that clearance completely once it is up, so the rise is the keyboard
 * height MINUS it. Without that subtraction the column stops a nav-pill's
 * height above the keyboard, which is the dead band the padding version has
 * always had.
 */

/** iOS gets the WILL events, which fire with the system's own curve and
 *  duration BEFORE the keyboard moves — that is what makes the two look like
 *  one motion. Android has no reliable will-events, so it takes the DID pair
 *  and the fallback duration below. */
const SHOW_EVENT = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE_EVENT = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/** Used only when the platform reports no duration of its own. */
export const KEYBOARD_FALLBACK_MS = 250;

/** UIKit's keyboard curve is a private easing (animation curve 7) that no
 *  public API exposes; this bezier is the long-standing approximation of it. */
const KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77);

export function useKeyboardOffset(insetBelow = 0): Animated.Value {
  const offset = useRef(new Animated.Value(0)).current;
  // Read through a ref so a changing inset (the nav clearance depends on the
  // device's safe area) never re-subscribes the listeners mid-animation.
  const inset = useRef(insetBelow);
  inset.current = insetBelow;

  useEffect(() => {
    const drive = (toValue: number, event: KeyboardEvent | undefined) => {
      Animated.timing(offset, {
        toValue,
        duration: event?.duration && event.duration > 0 ? event.duration : KEYBOARD_FALLBACK_MS,
        easing: KEYBOARD_EASING,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    };

    const show = Keyboard.addListener(SHOW_EVENT, (event) => {
      // `riseFor` rather than the arithmetic inline: the reanimated sibling
      // computes the same rise on the UI thread, and a column that stopped at
      // a different height on one binary than the other would be the exact
      // drift the motion boundary exists to prevent. One function, both
      // drivers. It is also where "never negative" is stated — on a device
      // whose clearance exceeds the keyboard the column simply stays put.
      drive(riseFor(event.endCoordinates.height, inset.current), event);
    });
    const hide = Keyboard.addListener(HIDE_EVENT, (event) => drive(0, event));

    return () => {
      show.remove();
      hide.remove();
    };
  }, [offset]);

  return offset;
}
