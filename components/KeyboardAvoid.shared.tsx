/**
 * FIX-RUN F9 — A VIEW THAT MAKES ROOM FOR THE KEYBOARD: what both paths share.
 *
 * Every screen with a text input wraps its scroller (and any pinned bar) in one of these, the
 * `behavior="padding"` contract React Native's KeyboardAvoidingView has always kept here: the
 * view pads its bottom by however much of it the keyboard covers, so the bar above the padding
 * rides up and the scroller ends where the keyboard begins.
 *
 * The 120 Hz path (`KeyboardAvoid.motion120.tsx`) computes that padding on the UI thread from
 * keyboard-controller's frame-by-frame keyboard height, so the bar moves WITH the keyboard —
 * through an interactive drag-to-dismiss too, which the system reports to no one else. The
 * fallback (`KeyboardAvoid.tsx`) is React Native's own view, on the keyboard's will-change
 * events. Both pad by the same arithmetic, `keyboardPadding` below.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type KeyboardAvoidProps = {
  /** 'padding' on iOS; undefined on Android, where the system already resizes the window. */
  behavior?: 'padding';
  /** Distance from the screen's top to this view's parent, or a negative reserve already held below. */
  keyboardVerticalOffset?: number;
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * How much bottom padding the keyboard asks of a view whose bottom edge sits at `frameBottom`
 * (React Native's `onLayout` y + height): the overlap with a keyboard `keyboardHeight` tall,
 * moved by `offset` — React Native's own `_relativeKeyboardHeight` for `padding`. No keyboard,
 * no padding, whatever the offset (React Native's view sets 0 when the keyboard hides).
 */
export function keyboardPadding(frameBottom: number, screenHeight: number, keyboardHeight: number, offset: number): number {
  'worklet';
  if (keyboardHeight <= 0) return 0;
  return Math.max(frameBottom - (screenHeight - keyboardHeight - offset), 0);
}
