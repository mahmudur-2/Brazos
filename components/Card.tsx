import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PropsWithChildren } from 'react';
import {
  litRowStyle,
  metricStyles,
  radius,
  spacing,
  useThemeColors,
  wellStyle,
  type ColorPalette,
} from '../lib/theme';
import { usePressFeedback } from '../hooks/usePressFeedback';
import { Surface } from '../ui/primitives/Surface';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  /** What a pressable card can DO, for a screen reader. A long-press is
   *  invisible without one — there is nothing on screen that says the gesture
   *  exists. Ignored on a card with no press handler at all. */
  accessibilityHint?: string;
  /** Overrides the material's fill and rim, e.g. for the Map tab's dark mode. */
  palette?: ColorPalette;
  /**
   * A2-M3 — the card's depth (UI-DIRECTION §3). `lit`, the default, is the card exactly as it has
   * always drawn. `well` sinks a part INTO the card it sits in (a quote, a price box, a group of
   * pills): lib/theme `wellStyle`, corner 12, no shadow; never a well inside a well. `row` is the lit
   * card for one row of a long list (lib/theme `litRowStyle`: a solid fill, the rim, one shadow
   * layer), used only where a phone measurement shows the full card dropping frames.
   */
  level?: 'lit' | 'well' | 'row';
}>;

/**
 * 2026-09-27 (the Lux remake, ruling 8) — THE ONE CARD: ui/primitives/Surface
 * wearing the flat `card` material (ui/tokens.ts) — a fill lighter than the
 * ground, the 1px mint-neutral rim, the white specular edge and the drop
 * shadow in dark; a white card under the soft shadow in light. Every panel,
 * row card, hub tile and field group is this, so nothing invents a second
 * card. A pressable card sinks under the finger through the shared press
 * spring (ruling 14: press scale on cards and buttons).
 */
export function Card({
  children,
  style,
  onPress,
  onLongPress,
  accessibilityHint,
  palette: paletteProp,
  level = 'lit',
}: CardProps) {
  const styles = stylesFor();
  const press = usePressFeedback();
  const { palette: colors, isDark } = useThemeColors();
  const paletteStyle = paletteProp
    ? { backgroundColor: paletteProp.surface, borderColor: paletteProp.border }
    : null;
  const surface =
    level === 'lit' ? (
      <Surface material="card" style={[styles.card, paletteStyle, style]}>
        {children}
      </Surface>
    ) : (
      <View
        style={[
          styles.card,
          level === 'well' ? [styles.well, wellStyle(paletteProp ?? colors, isDark)] : [styles.row, litRowStyle(isDark)],
          style,
        ]}
      >
        {children}
      </View>
    );

  if (onPress || onLongPress) {
    return (
      <Animated.View style={press.style}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          accessibilityHint={accessibilityHint}
          delayLongPress={350}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
        >
          {surface}
        </Pressable>
      </Animated.View>
    );
  }
  return surface;
}

const stylesFor = metricStyles(() => StyleSheet.create({
  card: {
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.92,
  },
  well: {
    borderRadius: radius.md,
  },
  row: {
    borderRadius: radius.card,
  },
}));
