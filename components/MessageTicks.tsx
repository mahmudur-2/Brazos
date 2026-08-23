import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { MessageTickState } from '../lib/messageTicks';
import { themedStyles, useThemeColors, withAlpha, type ColorPalette } from '../lib/theme';

/**
 * The delivery ticks on your OWN message bubble.
 *
 *   sent       one cream tick
 *   delivered  two cream ticks
 *   read       two GOLD ticks
 *
 * OWN MESSAGES ONLY, and the caller enforces that — a tick on someone else's
 * message would be claiming to know what YOU did with THEIR message, which is
 * both meaningless and, on a bubble that is not yours, unreadable.
 *
 * THE COLOURS ARE THE PALETTE'S, not white literals. Cream (`onPrimary` at the
 * same 0.75 the timestamp beside it uses) is what "white" means on a filled
 * own-bubble in both palettes; gold is the one state worth looking at twice.
 * The two-tick states OVERLAP their glyphs rather than spacing them, which is
 * what makes the pair read as one mark at 11pt instead of as two separate
 * checks.
 *
 * TWO OF THE THREE CANNOT BE PRODUCED FROM LIVE DATA YET (see DELIVERED_TICKS
 * and READ_TICKS in lib/featureFlags.ts, and the read-model verdicts in
 * HANDOFF.md). They are drawn and tested here anyway: the day the schema lands
 * should be a wiring change, not a design one.
 */

const TICK_SIZE = 13;
/** How far the second tick sits behind the first. Overlapping is what makes
 *  the pair read as a single mark at this size. */
const TICK_OVERLAP = -6;

type MessageTicksProps = {
  state: MessageTickState;
};

export function MessageTicks({ state }: MessageTicksProps) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const read = state === 'read';
  const double = state !== 'sent';
  const color = read ? colors.gold : withAlpha(colors.onPrimary, 0.75);

  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel={
        read ? 'Read' : state === 'delivered' ? 'Delivered' : 'Sent'
      }
    >
      <Ionicons name="checkmark" size={TICK_SIZE} color={color} />
      {double ? (
        <Ionicons
          name="checkmark"
          size={TICK_SIZE}
          color={color}
          style={styles.second}
        />
      ) : null}
    </View>
  );
}

const stylesFor = themedStyles((_colors: ColorPalette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    second: {
      marginLeft: TICK_OVERLAP,
    },
  })
);
