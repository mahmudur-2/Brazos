import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PropsWithChildren } from 'react';
import {
  controls,
  layout,
  radius,
  spacing,
  withAlpha,
  type EmeraldPalette,
  type as typeScale,
} from '../tokens';
import { scrimInDark, themedStyles, useThemeColors } from '../../lib/theme';

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
}>;

export function Sheet({
  visible,
  onClose,
  title,
  dismissOnBackdropPress = true,
  children,
}: SheetProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();

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
          style={[styles.backdrop, isDark && styles.backdropDark]}
          onPress={dismissOnBackdropPress ? onClose : undefined}
          // The backdrop is a dismiss affordance, not content — it should not
          // be announced as a button when it does nothing.
          accessibilityElementsHidden={!dismissOnBackdropPress}
          importantForAccessibility={dismissOnBackdropPress ? 'yes' : 'no-hide-descendants'}
          accessibilityRole={dismissOnBackdropPress ? 'button' : undefined}
          accessibilityLabel={dismissOnBackdropPress ? 'Close' : undefined}
        />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.header}>
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
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
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
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
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
  },
  scrollContent: {
    padding: layout.screenGutter,
    gap: spacing.md,
  },
  }),
);
