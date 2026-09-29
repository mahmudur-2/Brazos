import { type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/**
 * ONE ACTION, described once, reachable by either mechanic.
 *
 * This is deliberately the same shape as `ActionSheetItem` (key, label, icon,
 * destructive, onPress) because it IS the same action: the inbox builds its
 * row actions once and hands the identical objects to the long-press sheet and
 * to the swipe surface. An action reachable by one mechanic and not the other
 * is two apps, which is the rule lib/motion120's `canSwipe` exists to state.
 *
 * `tone` is the only addition, and it is presentational: the swipe surface
 * paints a coloured tile per action where the sheet paints a row.
 */
export type SwipeAction = {
  key: string;
  label: string;
  icon?: IoniconName;
  destructive?: boolean;
  onPress: () => void;
  /** 'gold' marks the overflow tile — the one that opens the full sheet. */
  tone?: 'gold';
};

export type SwipeableRowProps = {
  children: ReactNode;
  actions: SwipeAction[];
  /** A self-conversation has no counterparty to act on, so it does not swipe. */
  enabled?: boolean;
};

/** Each tile's width. Three of them is what the row opens to. */
export const ACTION_WIDTH = 76;

export function actionsWidth(actions: SwipeAction[]): number {
  return actions.length * ACTION_WIDTH;
}

/**
 * The tiles revealed behind a swiped row.
 *
 * Rendered by the fast path only — a build with no gesture recogniser never
 * shows these at all and reaches every one of these actions by long-press
 * instead. They are here rather than in the `.motion120` sibling so the tile's
 * geometry, colour and accessibility are not written inside the file that also
 * owns a gesture, where they would be invisible to a reader checking parity.
 */
export function SwipeActionTiles({
  actions,
  onAction,
}: {
  actions: SwipeAction[];
  onAction: (action: SwipeAction) => void;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);

  return (
    <View style={styles.actions} pointerEvents="box-none">
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => onAction(action)}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          {action.icon ? (
            <Ionicons
              name={action.icon}
              size={20}
              color={
                action.tone === 'gold'
                  ? colors.mark
                  : action.destructive
                    ? colors.danger
                    : colors.text
              }
            />
          ) : null}
          <Text
            style={[
              styles.tileLabel,
              action.tone === 'gold' && styles.tileLabelGold,
              action.destructive && styles.tileLabelDestructive,
            ]}
            numberOfLines={1}
          >
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    // Clips the row to its own box, so a row dragged past the tiles does not
    // paint over its neighbours.
    container: {
      overflow: 'hidden',
    },
    // #28 — the tiles' clip and the track inside it (SwipeableRow.motion120):
    // pinned to the row's right edge, the clip cutting the tiles to the strip
    // the row has uncovered.
    tilesClip: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      overflow: 'hidden',
    },
    tilesTrack: {
      ...StyleSheet.absoluteFillObject,
    },
    // The tiles sit BEHIND the row, pinned to its right edge, and the row
    // slides left off them. Absolute so revealing costs no relayout.
    actions: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    tile: {
      width: ACTION_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    tilePressed: { opacity: 0.7 },
    tileLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    tileLabelGold: { color: colors.mark },
    tileLabelDestructive: { color: colors.danger },
  })
);
