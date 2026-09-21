import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  controls,
  layout,
  radius,
  spacing,
  withAlpha,
  type EmeraldPalette,
  type MaterialName,
  type as typeScale,
} from '../tokens';
import { SCRIM_DARK_ALPHA, scrimInDark, themedStyles, useThemeColors, type PaneFill, type PaneRim } from '../../lib/theme';
import { useOverrideNumber, useOverrideString } from '../../lib/designOverrides';
import { BlurLayer } from '../../lib/blur';
import { Surface } from './Surface';

/**
 * The generic bottom sheet / modal (§I).
 *
 * This is the scrollable, arbitrary-height sheet. It does NOT replace
 * components/ActionSheet.tsx, which is a fixed short menu whose unscrollable
 * column is correct for a four-item long-press menu (DECISIONS.md D7 already
 * settled that those are two different things, not a duplication). Nor does it
 * replace components/ServicePickerSheet.tsx, which is that decision's other
 * half. New screens needing a sheet of unknown length use this one.
 *
 * Bottom inset is read from the device rather than assumed, and the content
 * area is capped at 88% of the screen so the sheet can never grow past the
 * top of the display on a small phone.
 */

type SheetProps = PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Set false for a step the user must resolve with an explicit control. */
  dismissOnBackdropPress?: boolean;
  /** The card's material. `sheet` is every dialog's; the Filters sheet
   *  (2026-09-19) wears `pane`, the approved Map design's deeper glass. */
  material?: MaterialName;
  /** The top corners, when a design names its own (the Filters sheet's 28);
   *  the studio dial and the xxl default otherwise. */
  topRadius?: number;
  /** The header's hairline and the footer's — `line` unless a design
   *  names its own (the Filters sheet's sage in dark). */
  hairline?: string;
  /** A row pinned under the scrolling content, above the home indicator,
   *  under its own hairline — the Filters sheet's Reset and Show. */
  footer?: ReactNode;
  /**
   * 2026-09-20 (sitting 2) — WHICH EDGES OF THE CARD DRAW THE RIM. `'all'`,
   * the default every other sheet keeps, rings the card; `'top'` draws the
   * rim along the top edge alone (corners included) — the Filters sheet's,
   * where the operator read the side rims and the bottom rim (the line at
   * the very foot of the screen) as excess on a docked, edge-to-edge sheet.
   * The header and footer hairlines are separate and unaffected.
   */
  edge?: 'all' | 'top';
  /** The card's own rim in place of the material's (ui/tokens.ts `paneEdges`)
   *  — the Filters sheet's hairline, 2026-09-20 sitting 2, item 13. */
  rim?: PaneRim;
  /** The card's own fill in place of the material's scrim and sheen
   *  (ui/tokens.ts `paneFills`) — the Filters sheet's gradient, 2026-09-21. */
  fill?: PaneFill;
  /**
   * 2026-09-20 — A LAYER OVER THE WHOLE SHEET, inside this Modal: what a
   * popup anchored to a control in the scrolling content renders into.
   * Absolute, full-window, `box-none`, so it takes no touch of its own and
   * window coordinates from `measureInWindow` land where they should. It
   * exists because a second Modal nested in this one misbehaves on iOS —
   * the first one's content persists and everything behind it is
   * re-composited to a different tint while it is up.
   */
  overlay?: ReactNode;
}>;

export function Sheet({
  visible,
  onClose,
  title,
  dismissOnBackdropPress = true,
  material = 'sheet',
  topRadius: topRadiusProp,
  hairline,
  footer,
  edge = 'all',
  rim,
  fill,
  overlay,
  children,
}: SheetProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();

  // RUN S2 (C7) — the sheet dials, each defaulting to today's shipped value.
  // The card's fill, blur and hairline are the sheet MATERIAL's dials (Blur &
  // Material); what lives here is the geometry and the backdrop scrim.
  const topRadiusDial = useOverrideNumber('sheet.topRadius');
  const topRadius = topRadiusProp ?? topRadiusDial ?? radius.xxl;
  const headerHairline = hairline != null ? { borderBottomColor: hairline } : null;
  const footerHairline = hairline != null ? { borderTopColor: hairline } : null;
  const maxHeightPct = useOverrideNumber('sheet.maxHeightPct');
  const headerPad = useOverrideNumber('sheet.headerPad');
  const contentPad = useOverrideNumber('sheet.contentPad');
  const footerPad = useOverrideNumber('sheet.footerPad') ?? spacing.lg;
  const sectionGap = useOverrideNumber('sheet.sectionGap');
  const handleWidth = useOverrideNumber('sheet.handleWidth');
  const handleHeight = useOverrideNumber('sheet.handleHeight');
  const handleColor = useOverrideString('sheet.handleColor');
  const handleAlpha = useOverrideNumber('sheet.handleAlpha');
  const handleAbove = useOverrideNumber('sheet.handleSpaceAbove');
  const handleBelow = useOverrideNumber('sheet.handleSpaceBelow');
  const backdropColorDial = useOverrideString('sheet.backdropColor');
  const backdropAlphaDial = useOverrideNumber('sheet.backdropAlpha');
  const backdropDial =
    backdropColorDial != null || backdropAlphaDial != null
      ? {
          backgroundColor: withAlpha(
            backdropColorDial ?? (isDark ? colors.bg : colors.ink),
            backdropAlphaDial ?? (isDark ? SCRIM_DARK_ALPHA : 0.45),
          ),
        }
      : null;
  const handleDial =
    handleWidth != null ||
    handleHeight != null ||
    handleColor != null ||
    handleAlpha != null ||
    handleBelow != null
      ? {
          width: handleWidth ?? 40,
          height: handleHeight ?? 4,
          backgroundColor: withAlpha(handleColor ?? colors.line, handleAlpha ?? 1),
          marginBottom: handleBelow ?? spacing.sm,
        }
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android's hardware back must close the sheet, not the screen behind it.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={[styles.backdrop, isDark && styles.backdropDark, backdropDial]}
          onPress={dismissOnBackdropPress ? onClose : undefined}
          // The backdrop is a dismiss affordance, not content — it should not
          // be announced as a button when it does nothing.
          accessibilityElementsHidden={!dismissOnBackdropPress}
          importantForAccessibility={dismissOnBackdropPress ? 'yes' : 'no-hide-descendants'}
          accessibilityRole={dismissOnBackdropPress ? 'button' : undefined}
          accessibilityLabel={dismissOnBackdropPress ? 'Close' : undefined}
        >
          {/* MOTION1 (C3): frosted over the scrim this backdrop already paints.
              Absent on web and on any binary without expo-blur, where the
              scrim alone is the backdrop it has always been. */}
          <BlurLayer />
        </Pressable>
        {/* G1 (C5): the docked card wears the sheet material — the top
            corners keep their xxl radius via the props; in light this adds
            the material hairline. The backdrop above and every open/close
            mechanic are byte-identical. */}
        <Surface
          material={material}
          corners="top"
          radius={topRadius}
          border={edge}
          rim={rim}
          fill={fill}
          style={[
            styles.sheet,
            // Written as base + delta so the D8 fence's pinned expression
            // (inset + spacing.lg) survives verbatim; the dial replaces the
            // spacing.lg portion and the default delta is zero.
            { paddingBottom: insets.bottom + spacing.lg + (footerPad - spacing.lg) },
            maxHeightPct != null ? { maxHeight: `${maxHeightPct}%` as `${number}%` } : null,
            handleAbove != null ? { paddingTop: handleAbove } : null,
          ]}
        >
          <View style={[styles.handle, handleDial]} />
          {title ? (
            <View
              style={[
                styles.header,
                headerHairline,
                headerPad != null ? { paddingHorizontal: headerPad } : null,
              ]}
            >
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                {/* Master 11 draws the sheet's Done in gold; light keeps
                    the Heritage emerald. */}
                <Text style={[styles.closeLabel, isDark && styles.closeLabelDark]}>Done</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              contentPad != null ? { padding: contentPad } : null,
              sectionGap != null ? { gap: sectionGap } : null,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, footerHairline]}>{footer}</View> : null}
        </Surface>
        {overlay ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {overlay}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // D7 — a modal scrim DIMS the parent (master 11 draws the filter sheet over
  // a darkened header). `ink` is the CREAM in the dark palette, so the one
  // expression that dims in light lightens in dark; dark therefore scrims
  // with the page ground instead.
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(colors.ink, 0.45),
  },
  backdropDark: { backgroundColor: scrimInDark(colors.bg) },
  // G1 (C5): fill, top radius and hairline are the sheet material's now.
  sheet: {
    // Never taller than most of the screen, whatever the content.
    maxHeight: '88%',
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: layout.screenGutter,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: {
    ...typeScale.h2,
    color: colors.ink,
    // flex so a long title truncates rather than shoving Done off-screen.
    flex: 1,
  },
  close: {
    minHeight: controls.minTouchTarget,
    justifyContent: 'center',
    flexShrink: 0,
  },
  closeLabel: {
    ...typeScale.title,
    color: colors.emerald,
  },
  closeLabelDark: { color: colors.gold },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    padding: layout.screenGutter,
    gap: spacing.md,
  },
  footer: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.md + 2,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  }),
);
