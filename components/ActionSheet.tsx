import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type ActionSheetItem = {
  key: string;
  label: string;
  icon?: IoniconName;
  /** Renders in the danger color — for block/report style actions. */
  destructive?: boolean;
  onPress: () => void;
};

type ActionSheetProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
  items: ActionSheetItem[];
  onClose: () => void;
};

/** Bottom-sheet list of actions, used for the Messages long-press menu. */
export function ActionSheet({
  visible,
  title,
  subtitle,
  items,
  onClose,
}: ActionSheetProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, isDark && styles.backdropDark]} onPress={onClose}>
        {/* Empty onPress absorbs taps so they don't dismiss the sheet. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          {(title || subtitle) && (
            <View style={styles.header}>
              {title ? <Text style={styles.title}>{title}</Text> : null}
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
          )}

          {items.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={item.onPress}
            >
              {item.icon && (
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.destructive ? colors.danger : colors.text}
                />
              )}
              <Text style={[styles.itemText, item.destructive && styles.destructive]}>
                {item.label}
              </Text>
            </Pressable>
          ))}

          <Pressable
            style={({ pressed }) => [styles.cancel, pressed && styles.itemPressed]}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // D7 — a modal scrim DIMS the parent. `text` is the CREAM in dark, so the
  // one expression that dims in light lightens in dark; dark scrims with the
  // page ground instead.
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.text, 0.35),
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  backdropDark: { backgroundColor: withAlpha(colors.background, 0.7) },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.raised,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemPressed: {
    backgroundColor: colors.neutralBg,
  },
  itemText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  destructive: {
    color: colors.danger,
  },
  cancel: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textMuted,
  },
  }),
);
