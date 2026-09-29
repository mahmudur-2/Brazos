import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/** How long a note WITHOUT an Undo stands. One with an Undo is timed by whoever
 *  raised it, since its end is when the undone thing is let go. */
const PLAIN_NOTE_MS = 1800;

/**
 * 2026-09-28 (LUX-LIST-64 #38) — A SMALL FLOATING NOTE, with an optional Undo:
 * "Photo removed · Undo" after a remove, "Upload canceled" after cancelling one
 * (refs/job-summary.html `.toast`). The inverse of the page — cream on the dark
 * ground, the dark ink on the light one — so it reads as a note over the screen
 * rather than a part of it. It rises and fades in on the native driver; Reduce
 * Motion places it. A plain note times itself (`onExpire`); an Undo note is the
 * caller's to clear.
 */
export function UndoToast({
  message,
  onUndo,
  onExpire,
  bottom,
}: {
  message: string | null;
  onUndo?: () => void;
  /** A note without an Undo has stood its moment. */
  onExpire?: () => void;
  /** Its distance from the bottom of the screen it floats in. */
  bottom: number;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const reducedMotion = useReducedMotion();
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message || onUndo || !onExpire) return;
    const timer = setTimeout(onExpire, PLAIN_NOTE_MS);
    return () => clearTimeout(timer);
  }, [message, onUndo, onExpire]);

  useEffect(() => {
    Animated.timing(shown, {
      toValue: message ? 1 : 0,
      duration: reducedMotion === false ? 200 : 0,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [message, reducedMotion, shown]);

  return (
    <Animated.View
      pointerEvents={message ? 'box-none' : 'none'}
      style={[
        styles.toast,
        {
          bottom,
          opacity: shown,
          transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <Text style={styles.message} numberOfLines={1}>
        {message ?? ''}
      </Text>
      {onUndo && message ? (
        <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo">
          <Text style={styles.undo}>Undo</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: colors.ink,
      zIndex: 30,
      shadowColor: colors.black,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    message: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.background,
    },
    undo: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.background,
      textDecorationLine: 'underline',
      paddingHorizontal: spacing.xs,
    },
  })
);
