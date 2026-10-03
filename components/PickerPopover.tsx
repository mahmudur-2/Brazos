import { useEffect, useRef, useState, type ComponentProps } from 'react';
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
 * sort row carries its rule as a second line. The panel wears the MENU
 * material — flat: the glass ink at .82 under the mint hairline, no sheen,
 * no gradient — which is the recipe the approved mockup names for its popup
 * ("the app's menu material"); the operator ruled the sheet's gradient off
 * the popups ("don't add the gradients to the popups", DECISIONS 2026-09-20
 * sitting 3, (3)). It wore the sheet's `pane` glass until then.
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
 *
 * 2026-09-21 — THE VALUES SIT IN THE MIDDLE OF THE ROW (the operator's
 * "center the numbers", DECISIONS 2026-09-20 sitting 3, (4)): the row centres
 * its content — a date row's calendar and text as one group — and the tick
 * is pinned at the left edge, so nothing shifts when it appears; the padding
 * is the tick's zone on BOTH sides, which keeps the centre honest. The Sort
 * popup keeps its left layout (`contentAlign="start"`), the operator's call.
 * THE SCROLL BAR IS THE iPHONE'S OWN — white on the dark glass, black in
 * light, shown while scrolling, flashed once when the list opens so it is
 * seen "just enough to realize it's there" (asked: the built-in one over a
 * custom bar). The dividers are light grey — white at .10 in dark, the ink
 * at .07 in light — never the warm gold hairline `border` (the operator's
 * red box, (7) of the same date).
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
  /** Drawn grey — a row that clears rather than chooses (the Sort popup's
   *  Reset). Ticked, its tick is still the chosen green; the label stays grey. */
  muted?: boolean;
  /** 2026-09-28 (LUX-LIST-64 #36) — an ACTION row rather than a value (Post a
   *  Job's "Enter your own amount"): a small glyph before the label, both in the
   *  mint, never ticked. */
  icon?: ComponentProps<typeof Ionicons>['name'];
  accent?: boolean;
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
  /** Where a row's content sits: centred (default) or at the left, after the
   *  tick's zone — the Sort popup's two-line rows keep the left. */
  contentAlign?: 'center' | 'start';
  accessibilityLabel: string;
};

/** The design's panel: 168 wide, 44pt rows, six showing. */
export const POPOVER_WIDTH = 168;
export const POPOVER_ROW_HEIGHT = 44;
export const POPOVER_VISIBLE_ROWS = 6;
/** The tick's zone at the row's left edge: its inset plus its box. A centred
 *  row pads BOTH sides by it, so the content's centre is the row's. */
const TICK_INSET = 10;
const TICK_SIZE = 18;
const TICK_ZONE = TICK_INSET + TICK_SIZE;
/** The row dividers: white on the dark glass, the ink on the light panel,
 *  each at the strength that reads as a light-grey hairline (the reference's
 *  rgba(255,255,255,.10) and #EEF1EC). */
const DIVIDER_ALPHA_DARK = 0.1;
const DIVIDER_ALPHA_LIGHT = 0.07;
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
  contentAlign = 'center',
  accessibilityLabel,
}: PickerPopoverProps<V>) {
  const { palette: colors, isDark } = useThemeColors();
  const centred = contentAlign === 'center';
  // The dividers: light grey at the same subtlety in both themes.
  const divider = withAlpha(isDark ? colors.white : colors.ink, isDark ? DIVIDER_ALPHA_DARK : DIVIDER_ALPHA_LIGHT);
  const styles = stylesFor(colors);
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
        <Surface material="menu" radius={radius.lg} corners="all" opaque style={styles.material}>
          <FlatList
            ref={listRef}
            data={options}
            keyExtractor={(option) => String(option.value)}
            getItemLayout={(_, index) => ({ length: rowHeight, offset: rowHeight * index, index })}
            initialScrollIndex={initialIndex}
            initialNumToRender={rows + 4}
            contentOffset={{ x: 0, y: initialOffset }}
            onLayout={() => {
              listRef.current?.scrollToOffset({ offset: initialOffset, animated: false });
              // iOS's bar, once, so a list that scrolls says so on opening.
              listRef.current?.flashScrollIndicators();
            }}
            indicatorStyle={isDark ? 'white' : 'black'}
            scrollIndicatorInsets={{ top: spacing.xs, bottom: spacing.xs, right: 2 }}
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
                    centred ? styles.rowCentred : styles.rowStart,
                    { height: rowHeight },
                    index > 0 && [styles.rowDivided, { borderTopColor: divider }],
                    pressed && styles.rowPressed,
                    item.disabled && styles.rowDisabled,
                  ]}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on, disabled: !!item.disabled }}
                  accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label}
                >
                  <View style={styles.tick}>
                    {on ? <Ionicons name="checkmark" size={16} color={colors.emeraldBright} /> : null}
                  </View>
                  {item.icon ? (
                    <Ionicons name={item.icon} size={18} color={item.accent ? colors.emeraldBright : colors.textMuted} />
                  ) : null}
                  {item.dayNumber != null ? (
                    <View style={styles.calendar}>
                      <View style={styles.calendarBar} />
                      <Text style={styles.calendarDay}>{item.dayNumber}</Text>
                    </View>
                  ) : null}
                  <View style={centred ? styles.textCentred : styles.text}>
                    <Text
                      style={[styles.label, centred && styles.centredType, on && styles.labelOn, item.muted && styles.labelMuted, item.accent && styles.labelAccent]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                    {item.hint ? (
                      <Text style={[styles.hint, centred && styles.centredType]} numberOfLines={1}>
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
    },
    // Centred: the tick's zone on both sides, the content in the middle.
    rowCentred: {
      justifyContent: 'center',
      paddingHorizontal: TICK_ZONE,
    },
    // At the left: after the tick's zone and the row's gap (the tick is out
    // of the flow now), today's right padding — the Sort rows as they were.
    rowStart: {
      justifyContent: 'flex-start',
      paddingLeft: TICK_ZONE + spacing.sm,
      paddingRight: spacing.md + 2,
    },
    // Light grey at the same subtlety, never the warm `border` hairline —
    // the colour is set at the row, per theme (DIVIDER_ALPHA).
    rowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowPressed: { backgroundColor: colors.primarySoft },
    rowDisabled: { opacity: 0.4 },
    // Pinned at the left edge, the row's full height, so the content's
    // centre never moves when the tick appears.
    tick: {
      position: 'absolute',
      left: TICK_INSET,
      top: 0,
      bottom: 0,
      width: TICK_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      minWidth: 0,
    },
    textCentred: {
      flexShrink: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    centredType: {
      textAlign: 'center',
    },
    label: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.ink,
    },
    labelOn: {
      fontWeight: '600',
      color: colors.emeraldBright,
    },
    // #36 — an action row ("Enter your own amount"): the mint, at the row's weight.
    labelAccent: {
      fontWeight: '600',
      color: colors.emeraldBright,
    },
    // After labelOn, so a muted row stays grey even when it is the one ticked.
    labelMuted: {
      fontWeight: '500',
      color: colors.textMuted,
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
