import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authColors, authRadius, authShadows, authSpacing, authType } from '../lib/authTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const SELECT_MS = 170;

type SetupChoiceCardProps = {
  icon: IoniconName;
  title: string;
  subtitle: string;
  selected: boolean;
  onSelect: () => void;
  /** Skips the crossfade; the end state is applied immediately. */
  reducedMotion: boolean;
};

/**
 * One of the two "Start in" cards.
 *
 * Both cards are always the same size and always carry a 1pt border — the
 * selected state changes the border's colour and the surface fill, never the
 * geometry. That is what stops the pair shifting on the page when the choice
 * changes, which a border that appears only when selected would do.
 *
 * WHY THE SELECTED LOOK IS A PLAIN STYLE AND NOT AN ANIMATED COLOUR.
 *
 * The obvious implementation interpolates backgroundColor and borderColor from
 * one animated value. It is also broken here: selecting a card re-renders it,
 * and on react-native-web the animated colour nodes stop being applied across
 * that re-render — the card's inline style freezes at whatever it had on first
 * paint. The state was right and the pixels never moved, which is the worst
 * kind of wrong for a control whose entire job is to show what is selected.
 * Memoising the interpolations did not fix it.
 *
 * So the selected appearance is ordinary conditional styling, which cannot
 * drift from `selected`, and the animation is a separate overlay that only
 * fades. If that fade ever failed the card would still be visibly correct —
 * the motion is decoration, and it is built so it can only ever be decoration.
 */
export function SetupChoiceCard({
  icon,
  title,
  subtitle,
  selected,
  onSelect,
  reducedMotion,
}: SetupChoiceCardProps) {
  const fade = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    const to = selected ? 1 : 0;
    if (reducedMotion) {
      fade.setValue(to);
      return;
    }
    Animated.timing(fade, {
      toValue: to,
      duration: SELECT_MS,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [fade, reducedMotion, selected]);

  return (
    <Pressable
      onPress={onSelect}
      style={styles.pressable}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      // react-native-web does not map accessibilityState.selected on a radio;
      // the W3C prop is what a browser screen reader actually reads.
      aria-checked={selected}
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={[styles.card, selected && styles.cardSelected]}>
        {/* Purely the crossfade. Inset by the border width so it covers the
            base card's outline exactly rather than sitting inside it. */}
        <Animated.View
          style={[styles.fill, { opacity: fade }]}
          pointerEvents="none"
        />
        <Ionicons
          name={icon}
          size={26}
          color={selected ? authColors.forest : authColors.ink}
        />
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    // The pair splits the row evenly at every width.
    flex: 1,
  },
  card: {
    borderRadius: authRadius.card,
    // Always present, so selecting cannot change the card's size.
    borderWidth: 1,
    borderColor: authColors.line,
    backgroundColor: authColors.surface,
    paddingHorizontal: authSpacing.lg - 2,
    paddingTop: authSpacing.lg,
    paddingBottom: authSpacing.lg,
    gap: authSpacing.xs,
    minHeight: 128,
    justifyContent: 'flex-end',
    ...authShadows.card,
  },
  cardSelected: {
    borderColor: authColors.forest,
    backgroundColor: authColors.mint,
  },
  fill: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: authRadius.card,
    borderWidth: 1,
    borderColor: authColors.forest,
    backgroundColor: authColors.mint,
  },
  title: {
    ...authType.title,
    fontSize: 19,
    lineHeight: 24,
    color: authColors.ink,
    marginTop: authSpacing.sm,
  },
  subtitle: {
    ...authType.note,
    color: authColors.muted,
  },
});
