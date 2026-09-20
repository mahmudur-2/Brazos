import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Surface } from '../ui/primitives/Surface';
import { fonts, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * THE PEEK SHEET'S SHARED BODY — everything a user can name, in one module
 * both drivers import (the arrangement of SwipeableRow.shared.tsx, for the
 * same reason: two binaries, one component).
 *
 * WHAT IT IS. The approved Map design's floating jobs pane
 * (docs/mockups/html/map-explore-{dark,light}.html, operator 2026-09-19): a
 * rounded pane inset from the screen's sides and floating a gap above the
 * nav bar, wearing the `pane` material — liquid glass in dark, flat white in
 * light. At rest it PEEKS: a grab handle, the count, the reach it was taken
 * under, "View ›", and ONE job row. Pulled up (the operator's "Draggable"
 * ruling) it grows to the room the parent measured for it and the same list
 * scrolls; the first row never moves, because the list IS the peek — the
 * pane simply reveals more of it.
 *
 * HOW IT MOVES, and why it is a transform. The pane is laid out ONCE at its
 * open height inside a clip the same size, and slides by `translateY`: closed
 * is `expandedHeight - peekHeight` (only the peek shows above the clip's
 * floor), open is 0. Nothing is re-laid-out per frame — not the pane, not the
 * list, not a card — which is what lets the fast path follow a finger at
 * 120Hz and the fallback ride the native driver. Animating `height` instead
 * would be a layout animation on every frame, which tests/motion120 forbids
 * for exactly this reason. The clip has rounded corners of its own, so the
 * pane's visible bottom edge is a corner and not a cut, wherever the top is.
 *
 * THE PEEK HEIGHT IS MEASURED, never assumed: the head block and the first
 * row (or the loading / empty slot standing in for it) report their layout,
 * and until both have, the frame is transparent — one unpainted frame on
 * mount rather than a pane that jumps. A one-line title under Dynamic Type
 * is taller than this file could know.
 *
 * NO DROP SHADOW, deliberately. A shadow on the clip would have to be
 * rasterised from its content — the pane is translucent and the clip has no
 * fill of its own — and iOS re-rasterises such a shadow on every frame the
 * content moves, which is the whole drag. The hairline and the material do
 * the lifting instead.
 */

export type PeekSheetProps<T> = {
  /** The pane's height when open: the room the parent measured, in points.
   *  Zero means "not measured yet" and the parent should not mount the sheet. */
  expandedHeight: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "6 open jobs". */
  title: string;
  /** "Near you" — leads the subtitle, before the emerald dot. */
  subtitleLead?: string;
  /** "Within 5 miles". */
  subtitle: string;
  data: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** The slot's stand-in while data is on its way. */
  loading?: boolean;
  renderLoading?: () => ReactNode;
  /** The slot's stand-in when there is nothing to list. */
  empty?: ReactNode;
  /** The open list's last row (a link to the full results, say). */
  footer?: ReactNode;
  /** The pane's corner. */
  radius: number;
  /** Inside the pane, left and right of everything. */
  paddingX: number;
  /** The pane's side inset, and its gap above the screen's bottom edge. */
  inset: number;
  /** The toggle's word when closed ("View") and open ("Hide"). */
  openLabel?: string;
  closeLabel?: string;
};

/** The grab handle: the design's 44 by 4, in the muted ink at under half. */
export const PEEK_GRAB_WIDTH = 44;
export const PEEK_GRAB_HEIGHT = 4;
export const PEEK_GRAB_ALPHA = 0.45;

/** How far past open a finger may pull before the rubber gives. */
export const OVERDRAG = 16;
/** The share of the travel a release must have covered to change state. */
export const OPEN_THRESHOLD = 0.35;
/** A flick faster than this decides on its own, whatever it covered. */
export const FLING_VELOCITY = 600;

/**
 * The settle. Firmer than the swipe row's — a pane this size overshooting
 * reads as loose, not springy — and ONE set of numbers for both drivers:
 * core `Animated.spring` and reanimated's `withSpring` read the same keys.
 */
export const SHEET_SPRING = { damping: 26, stiffness: 280, mass: 0.9 } as const;

/** Between the rows of the open list. Read at use time, never frozen. */
const rowGap = () => spacing.sm + 2;
/** Under the last row, and under the peek row: the design's 22. */
const paneBottom = () => spacing.xl - 2;

/**
 * Where the pane rests when closed, from what its parts measured. Both
 * drivers read this and neither computes it: the head, the first row and the
 * paddings are the same points on either binary.
 */
export function usePeekMetrics(expandedHeight: number) {
  const [headHeight, setHeadHeight] = useState<number | null>(null);
  const [firstHeight, setFirstHeight] = useState<number | null>(null);

  const onHeadLayout = useCallback((event: LayoutChangeEvent) => {
    setHeadHeight(event.nativeEvent.layout.height);
  }, []);
  const onFirstLayout = useCallback((event: LayoutChangeEvent) => {
    setFirstHeight(event.nativeEvent.layout.height);
  }, []);

  return useMemo(() => {
    const ready = expandedHeight > 0 && headHeight !== null && firstHeight !== null;
    // The pane's 1pt top hairline sits above the head; the bottom one is
    // under the clip's floor and never shows, so only one is counted.
    const peekHeight = ready ? 1 + headHeight + firstHeight + paneBottom() : 0;
    const closedOffset = ready ? Math.max(0, expandedHeight - peekHeight) : 0;
    return { ready, peekHeight, closedOffset, onHeadLayout, onFirstLayout };
  }, [expandedHeight, headHeight, firstHeight, onHeadLayout, onFirstLayout]);
}

/**
 * The clip: the pane's visible frame, at the open size, with the pane's
 * own corners so the floor reads as a rounded edge. `box-none`, so the map
 * keeps every touch above the pane's actual top; `overflow: hidden` keeps the
 * hit test inside the frame too.
 */
export function PeekSheetFrame({
  expandedHeight,
  radius,
  inset,
  ready,
  children,
}: {
  expandedHeight: number;
  radius: number;
  inset: number;
  ready: boolean;
  children: ReactNode;
}) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.frame,
        { left: inset, right: inset, bottom: inset, height: expandedHeight, borderRadius: radius },
        !ready && styles.frameUnmeasured,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * The pane and everything in it. `wrapHead` is the fast path's seam: it
 * hands the head block to a gesture detector; the fallback leaves it as it
 * is. The head is ALSO a button on both — a tap toggles — so no binary
 * needs the drag to reach the list.
 */
export function PeekSheetPane<T>({
  expandedHeight,
  open,
  onOpenChange,
  title,
  subtitleLead,
  subtitle,
  data,
  keyExtractor,
  renderItem,
  loading = false,
  renderLoading,
  empty,
  footer,
  radius,
  paddingX,
  openLabel = 'View',
  closeLabel = 'Hide',
  onHeadLayout,
  onFirstLayout,
  wrapHead = (head) => head,
}: PeekSheetProps<T> & {
  onHeadLayout: (event: LayoutChangeEvent) => void;
  onFirstLayout: (event: LayoutChangeEvent) => void;
  wrapHead?: (head: ReactNode) => ReactNode;
}) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const toggleLabel = open ? closeLabel : openLabel;
  const toggle = () => onOpenChange(!open);

  const head = (
    <View onLayout={onHeadLayout} style={styles.head}>
      <Pressable
        onPress={toggle}
        style={styles.headPress}
        accessibilityRole="button"
        accessibilityLabel={`${toggleLabel} the jobs list`}
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.grab} />
        <View style={styles.headRow}>
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.subtitleRow}>
              {subtitleLead ? (
                <>
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitleLead}
                  </Text>
                  <View style={styles.subtitleDot} />
                </>
              ) : null}
              <Text style={[styles.subtitle, styles.subtitleTail]} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>
          <View style={styles.viewLink}>
            <Text style={[styles.viewText, isDark && styles.viewTextDark]}>{toggleLabel}</Text>
            <Ionicons
              name={open ? 'chevron-down' : 'chevron-forward'}
              size={20}
              color={isDark ? colors.gold : colors.ink}
              style={styles.viewChevron}
            />
          </View>
        </View>
      </Pressable>
    </View>
  );

  const slot = loading ? renderLoading?.() ?? null : empty ?? null;

  return (
    <Surface
      material="pane"
      radius={radius}
      corners="all"
      style={[styles.pane, { height: expandedHeight, paddingHorizontal: paddingX }]}
    >
      {wrapHead(head)}
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={({ item, index }) => (
          // The first row reports its height: it is the one the peek shows.
          <View onLayout={index === 0 ? onFirstLayout : undefined}>{renderItem(item, index)}</View>
        )}
        ItemSeparatorComponent={RowGap}
        ListEmptyComponent={
          slot ? <View onLayout={onFirstLayout}>{slot}</View> : <View onLayout={onFirstLayout} />
        }
        ListFooterComponent={footer ? <View style={styles.footer}>{footer}</View> : null}
        // Closed, the list is the peek and must not scroll under a finger
        // that meant the map; open, it is a list.
        scrollEnabled={open}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />
    </Surface>
  );
}

function RowGap() {
  const { palette: colors } = useThemeColors();
  return <View style={stylesFor(colors).rowGap} />;
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    frame: {
      position: 'absolute',
      overflow: 'hidden',
    },
    frameUnmeasured: {
      opacity: 0,
    },
    // Above the grab handle: the design's 12.
    pane: {
      paddingTop: spacing.md,
    },
    rowGap: {
      height: rowGap(),
    },
    head: {
      paddingBottom: spacing.md + 2,
    },
    headPress: {
      gap: spacing.md,
    },
    grab: {
      alignSelf: 'center',
      width: PEEK_GRAB_WIDTH,
      height: PEEK_GRAB_HEIGHT,
      borderRadius: PEEK_GRAB_HEIGHT / 2,
      backgroundColor: colors.textMuted,
      opacity: PEEK_GRAB_ALPHA,
    },
    headRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    headText: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '700',
      letterSpacing: -0.5,
      color: colors.ink,
    },
    subtitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 1,
      marginTop: spacing.xs + 1,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textMuted,
    },
    subtitleTail: {
      flexShrink: 1,
    },
    subtitleDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.emerald,
    },
    viewLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs - 1,
      marginTop: spacing.sm,
      minHeight: 28,
    },
    viewText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.ink,
    },
    viewTextDark: {
      color: colors.gold,
    },
    viewChevron: {
      marginTop: 1,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: paneBottom(),
    },
    footer: {
      paddingTop: rowGap(),
    },
  }),
);
