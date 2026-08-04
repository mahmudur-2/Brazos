import type { ComponentProps, ReactNode } from 'react';
import { useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authColors, authRadius, authSpacing } from '../lib/authTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const USE_NATIVE_DRIVER = Platform.OS !== 'web';
const PRESS_IN_MS = 90;
const PRESS_OUT_MS = 110;
const PRESS_SCALE = 0.99;

type SetupRowProps = {
  icon: IoniconName;
  title: string;
  subtitle: string;
  /** Tints the icon tile — the row's quiet "this one is done" signal. */
  done?: boolean;
  /** The control or status indicator on the right. */
  control: ReactNode;
  /** Hairline above, for every row after the first. */
  divider?: boolean;
  /** Omit to make the row inert; the control can still be interactive. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * One row of the setup card: icon tile, title, subtitle, right-hand control.
 *
 * All three rows share this so their heights, icon tiles, text baselines and
 * control alignment cannot drift apart — the reference's card reads as one
 * block precisely because nothing in it is individually positioned.
 *
 * The whole row is the press target where it has an action, which is what
 * makes the Terms & Privacy row tappable along its full width rather than
 * only on its indicator.
 */
export function SetupRow({
  icon,
  title,
  subtitle,
  done = false,
  control,
  divider = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: SetupRowProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number, duration: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

  const body = (
    <>
      <View style={[styles.iconTile, done && styles.iconTileDone]}>
        <Ionicons name={icon} size={20} color={done ? authColors.emerald : authColors.forest} />
      </View>

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.control}>{control}</View>
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, divider && styles.divider]}>{body}</View>;
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(PRESS_SCALE, PRESS_IN_MS)}
        onPressOut={() => animate(1, PRESS_OUT_MS)}
        style={({ pressed }) => [
          styles.row,
          divider && styles.divider,
          pressed && styles.rowPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${title}. ${subtitle}`}
        accessibilityHint={accessibilityHint}
      >
        {body}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: authSpacing.md,
    // One height for all three rows. Comfortably past the 44pt minimum, and
    // reached by every row because the subtitles are sized to fit on one line
    // — a row that wrapped stood 11pt taller than its neighbours.
    minHeight: 72,
    paddingHorizontal: authSpacing.md + 2,
    paddingVertical: authSpacing.md,
  },
  rowPressed: {
    backgroundColor: authColors.mint,
  },
  divider: {
    borderTopWidth: 1,
    // Barely there: the reference separates the rows without drawing a table.
    borderTopColor: authColors.line,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: authRadius.field,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authColors.mint,
  },
  iconTileDone: {
    backgroundColor: authColors.mint2,
  },
  // flex + numberOfLines on the children: a long subtitle truncates rather
  // than pushing the control off the row.
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: authColors.ink,
  },
  subtitle: {
    // Under the note scale, which is what lets the longest of these
    // ("Required for nearby jobs and workers") hold one line at 390pt. It
    // still wraps at large system text sizes, and the row simply grows —
    // the fixed height is for the default case, not a clamp on the text.
    fontSize: 12,
    lineHeight: 16.5,
    color: authColors.muted,
  },
  // Fixed width so all three controls line up on one right edge whatever
  // they are — a switch, a check, or a chevron. No wider than the switch
  // actually needs, because every point here comes out of the subtitle.
  control: {
    minWidth: 46,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
