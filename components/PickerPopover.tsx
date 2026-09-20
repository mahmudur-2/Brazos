import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { MENU_MOTION_MS, MENU_MOTION_OUT_MS } from '../lib/motion120';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { useMaterials } from '../lib/designOverrides';
import { PANEL_SCALE_FROM, panelTravelFor } from './DropMenu.shared';
import { Surface } from '../ui/primitives/Surface';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * A CHECKMARK LIST UNDER A PILL — the approved Filters design's popup
 * (docs/mockups/html/map-explore-filters-*.html, operator 2026-09-19: "Menu
 * list with a checkmark", "the value itself" on the pill).
 *
 * WHAT IT IS. A scrolling list of options anchored to the pill that opened
 * it: below it and flush with its right edge for the Distance and Budget
 * pills, above it for the When pill and the Sort pill (which sit at the foot
 * of the sheet). Six rows show; the list opens on the current value, which
 * carries the tick. A date row draws a small calendar with its day number; a
 * sort row carries its rule as a second line. The panel wears the SHEET'S
 * OWN GLASS (the `pane` material) under the menu's thinner rim, so the popup
 * and the sheet read as one material — the mockup draws them from one ink.
 *
 * WHERE IT RENDERS, and why that changed on 2026-09-20. The pills live inside
 * the Filters sheet's ScrollView, which clips, so the popup has to render
 * above the sheet's content. The first build made it a second Modal nested
 * in the sheet's, and the phone walk showed what iOS does with that: the
 * first popup's content persisted under every later pill, and everything
 * behind the popup was re-composited to a different tint while it was up.
 * So the popup now renders into the Sheet's `overlay` slot — a full-window
 * layer INSIDE the sheet's own Modal — positioned from the pill's
 * `measureInWindow`, with the whole window as its backdrop. No second Modal,
 * nothing re-composited, one green.
 *
 * WHY NOT A DropMenu. That surface is a fixed row of ACTIONS laid out inside
 * its anchor's parent; this is a scrolling row of VALUES with a current one.
 * Its constants are reused (the travel, the scale, the two durations) so the
 * two panels move alike.
 */

export type PickerOption<V> = {
  value: V;
  label: string;
  /** A second, smaller line under the label (the sort rules). */
  hint?: string;
  /** Drawn as a small calendar glyph before the label (the date rows). */
  dayNumber?: number;
  /** Rendered dimmed and inert, with `hint` saying why. */
  disabled?: boolean;
};

/** Where the pill is, in window points — from `measureInWindow`. */
export type PopoverAnchor = { x: number; y: number; width: number; height: number };

export type PickerPopoverProps<V> = {
  visible: boolean;
  anchor: PopoverAnchor | null;
  onClose: () => void;
  options: readonly PickerOption<V>[];
  value: V | null;
  onSelect: (value: V) => void;
  /** Below the pill (default) or above it. */
  direction?: 'up' | 'down';
  /** Which edge of the pill the panel lines up with. */
  align?: 'left' | 'right';
  width?: number;
  rowHeight?: number;
  /** How many rows show before the list scrolls. */
  visibleRows?: number;
  accessibilityLabel: string;
};

/** The design's panel: 168 wide, 44pt rows, six showing. */
export const POPOVER_WIDTH = 168;
export const POPOVER_ROW_HEIGHT = 44;
export const POPOVER_VISIBLE_ROWS = 6;
/** Between the pill and the panel. */
const ANCHOR_GAP = 6;
/** The panel never comes closer than this to the window's edge. */
const EDGE_MARGIN = 12;

export function PickerPopover<V>({
  visible,
  anchor,
  onClose,
  options,
  value,
  onSelect,
  direction = 'down',
  align = 'right',
  width = POPOVER_WIDTH,
  rowHeight = POPOVER_ROW_HEIGHT,
  visibleRows = POPOVER_VISIBLE_ROWS,
  accessibilityLabel,
}: PickerPopoverProps<V>) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const menu = useMaterials().menu;
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const listRef = useRef<FlatList<PickerOption<V>>>(null);

  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : visible ? MENU_MOTION_MS : MENU_MOTION_OUT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [progress, reducedMotion, visible]);

  if (!mounted || !anchor || options.length === 0) return null;

  // THE FRAME. Height is the rows that show plus the panel's own padding;
  // the edges clamp inside the window's safe area, so a pill at the sheet's
  // edge still gets a whole panel.
  const rows = Math.min(visibleRows, options.length);
  const height = rows * rowHeight + spacing.xs * 2 + 2;
  const maxLeft = window.width - width - EDGE_MARGIN;
  const wantedLeft = align === 'right' ? anchor.x + anchor.width - width : anchor.x;
  const left = Math.max(EDGE_MARGIN, Math.min(wantedLeft, maxLeft));
  const wantedTop =
    direction === 'down' ? anchor.y + anchor.height + ANCHOR_GAP : anchor.y - ANCHOR_GAP - height;
  const top = Math.max(
    insets.top + EDGE_MARGIN,
    Math.min(wantedTop, window.height - insets.bottom - height - EDGE_MARGIN)
  );

  // The list opens with the current value one row down from the top, the
  // way a wheel shows what is chosen with what comes next under it. The
  // offset is set three ways because none is reliable alone on a list that
  // mounts inside an animating panel: the initial index for the render
  // window, the content offset for the first paint, and a scroll on layout
  // for the frames where the first two are ignored.
  const currentIndex = options.findIndex((option) => Object.is(option.value, value));
  const initialIndex =
    currentIndex < 0 ? 0 : Math.max(0, Math.min(currentIndex - 1, options.length - rows));
  const initialOffset = initialIndex * rowHeight;

  const travel = panelTravelFor(direction);
  const panelStyle = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [PANEL_SCALE_FROM, 1] }) },
    ],
  };

  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <Animated.View
        style={[styles.panel, { left, top, width, height }, panelStyle]}
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
      >
        <Surface
          material="pane"
          radius={radius.lg}
          corners="all"
          style={[styles.material, { borderColor: withAlpha(menu.borderColor, menu.borderAlpha) }]}
        >
          <FlatList
            ref={listRef}
            data={options}
            keyExtractor={(option) => String(option.value)}
            getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
            initialScrollIndex={initialIndex}
            initialNumToRender={rows + 4}
            contentOffset={{ x: 0, y: initialOffset }}
            onLayout={() => listRef.current?.scrollToOffset({ offset: initialOffset, animated: false })}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => {
              const on = Object.is(item.value, value);
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.value);
                    onClose();
                  }}
                  disabled={item.disabled}
                  style={({ pressed }) => [
                    styles.row,
                    { height: rowHeight },
                    index > 0 && styles.rowDivided,
                    pressed && styles.rowPressed,
                    item.disabled && styles.rowDisabled,
                  ]}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on, disabled: !!item.disabled }}
                  accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label}
                >
                  <View style={styles.tick}>
                    {on ? <Ionicons name="checkmark" size={16} color={colors.emerald} /> : null}
                  </View>
                  {item.dayNumber != null ? (
                    <View style={styles.calendar}>
                      <View style={styles.calendarBar} />
                      <Text style={styles.calendarDay}>{item.dayNumber}</Text>
                    </View>
                  ) : null}
                  <View style={styles.text}>
                    <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.hint ? (
                      <Text style={styles.hint} numberOfLines={1}>
                        {item.hint}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        </Surface>
      </Animated.View>
    </>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    panel: {
      position: 'absolute',
      ...shadows.raised,
    },
    material: {
      flex: 1,
      overflow: 'hidden',
    },
    list: {
      paddingVertical: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingLeft: spacing.sm + 2,
      paddingRight: spacing.md + 2,
    },
    rowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowPressed: { backgroundColor: colors.primarySoft },
    rowDisabled: { opacity: 0.4 },
    tick: {
      width: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      minWidth: 0,
    },
    label: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.ink,
    },
    labelOn: {
      fontWeight: '600',
      color: colors.emerald,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    // The date rows' calendar: a 20pt page with a 4pt header bar and the day.
    calendar: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.4,
      borderColor: colors.textMuted,
      alignItems: 'center',
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    calendarBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: colors.textMuted,
    },
    calendarDay: {
      fontSize: 9,
      lineHeight: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
  })
);
