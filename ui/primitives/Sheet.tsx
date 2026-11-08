import { useModalPresence } from '../../hooks/useModalPresence';
import { useSheetPresence } from '../../hooks/useSheetPresence';
import { SheetCard } from '../../components/SheetCard';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  layout,
  radius,
  spacing,
  withAlpha,
  type EmeraldPalette,
  type MaterialName,
} from '../tokens';
import { scrimInDark, themedStyles, useThemeColors, type PaneFill, type PaneRim } from '../../lib/theme';
import { BlurLayer } from '../../lib/blur';
import { Surface } from './Surface';
import { SheetHeader, type SheetDismissWord } from './SheetHeader';

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
  /** 2026-09-28 (LUX-LIST-64 #64, audit M-31): the header's one word — "Done"
   *  where closing applies what the sheet holds, "Close" (the default) where
   *  it only dismisses. The backdrop means the same. */
  dismissWord?: SheetDismissWord;
  /** A second way out that DISCARDS ("Cancel" on the left); with it, the
   *  backdrop and Android's back mean Cancel, not the word on the right. */
  onCancel?: () => void;
  /** The card's material. `sheet` is every dialog's; the Filters sheet
   *  (2026-09-19) wears `pane`, the approved Map design's deeper glass. */
  material?: MaterialName;
  /** The top corners, when a design names its own (the Filters sheet's 28);
   *  the studio dial and the xl default (24) otherwise. */
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
  dismissWord = 'Close',
  onCancel,
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
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const presence = useSheetPresence(visible);
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();

  const topRadius = topRadiusProp ?? radius.xl;
  const headerHairline = hairline != null ? { borderBottomColor: hairline } : null;
  const footerHairline = hairline != null ? { borderTopColor: hairline } : null;

  return (
    <Modal
      visible={presence.mounted}
      transparent
      animationType="none"
      // Android's hardware back must close the sheet, not the screen behind it —
      // discarding, where the sheet can (#64).
      onRequestClose={onCancel ?? onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* 2026-09-29 (LUX-LIST-2 #3): the dim covers the screen at once; only the card moves (hooks/useSheetPresence). */}
        {presence.dimVisible ? (
        <Pressable
          style={[styles.backdrop, isDark && styles.backdropDark]}
          onPress={dismissOnBackdropPress ? onCancel ?? onClose : undefined}
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
        ) : null}
        {/* The card's frame carries the height cap now (a percentage of the screen), so the card
            inside can shrink to it while the frame moves. */}
        <SheetCard
          visible={visible}
          onClosed={presence.onClosed}
          style={styles.cardFrame}
        >
        {/* G1 (C5): the docked card wears the sheet material — the top
            corners keep their xl radius via the props; in light this adds
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
            // 2026-09-21: a FOOTER brings its own air — with one, the sheet keeps
            // only the safe inset below it, so the button sits centred between
            // the footer's divider and the home indicator (22 above it, 21 to
            // the bar's top; DECISIONS 2026-09-20 sitting 3, (7)). Without one,
            // the padding is what it has always been.
            { paddingBottom: insets.bottom + (footer ? 0 : spacing.lg) },
          ]}
        >
          {/* #64 (M-31) — the one sheet header: the handle, the title, and the
              one word that closes it (Master 11's gold in dark, the Heritage
              emerald in light), with Cancel on the left where the sheet can
              throw its draft away. */}
          <SheetHeader
            title={title}
            dismissWord={dismissWord}
            onDismiss={onClose}
            onCancel={onCancel}
            rowStyle={headerHairline}
          />
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={[styles.footer, footerHairline]}>{footer}</View> : null}
        </Surface>
        </SheetCard>
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
  // Never taller than most of the screen, whatever the content — on the moving frame (#3).
  cardFrame: { maxHeight: '88%' },
  sheet: {
    flexShrink: 1,
    paddingTop: spacing.sm,
  },
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
    // 22 — the button centred between the divider and the home indicator.
    paddingTop: spacing.lg + spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  }),
);
