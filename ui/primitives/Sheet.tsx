import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PropsWithChildren } from 'react';
import { colors, controls, layout, radius, spacing, type as typeScale, withAlpha } from '../tokens';

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
          style={styles.backdrop}
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
                <Text style={styles.closeLabel}>Done</Text>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(colors.ink, 0.45),
  },
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
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: layout.screenGutter,
    gap: spacing.md,
  },
});
