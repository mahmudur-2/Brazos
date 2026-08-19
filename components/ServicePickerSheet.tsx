import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { SkillCategory } from '../lib/skillCategories';
import {
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

type ServicePickerSheetProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  services: SkillCategory[];
  /** Handed the chosen row's category key — the same key a visible quick chip
   *  would pass, so the caller's downstream flow needs no special case. */
  onSelect: (categoryKey: string) => void;
  onClose: () => void;
};

/**
 * A scrolling bottom sheet for choosing one service from a long list.
 *
 * Deliberately separate from components/ActionSheet.tsx rather than a variant
 * of it: ActionSheet lays its items out in a fixed, unscrollable column, which
 * is right for a four-item long-press menu and cannot show eighteen rows on
 * any phone. The two solve different problems and merging them would make the
 * short menu carry a scroll container it never needs.
 */
export function ServicePickerSheet({
  visible,
  title,
  subtitle,
  services,
  onSelect,
  onClose,
}: ServicePickerSheetProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // The sheet is allowed most of the screen but never all of it — leaving the
  // backdrop visible is what tells the user this is a layer they can dismiss
  // rather than a screen they navigated to.
  const maxHeight = height * 0.78;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // Android hardware back closes the sheet via onRequestClose above.
      statusBarTranslucent
    >
      <Pressable
        style={[styles.backdrop, isDark && styles.backdropDark]}
        onPress={onClose}
        accessibilityRole="button"
      >
        <Pressable
          style={[styles.sheet, { maxHeight, paddingBottom: insets.bottom + spacing.sm }]}
          // Absorbs taps so a press inside the sheet can't reach the backdrop.
          onPress={() => {}}
        >
          <View style={styles.grabber} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {services.map((service) => (
              <Pressable
                // Several rows deliberately share a category key (see
                // MORE_SERVICES), so the label is what makes a row unique.
                key={service.label}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelect(service.key)}
                accessibilityRole="button"
                accessibilityLabel={service.label}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name={service.icon} size={19} color={colors.forest} />
                </View>
                <Text style={styles.rowLabel} numberOfLines={2}>
                  {service.label}
                </Text>
                <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // D7 — the scrim dims the parent. `ink` is the CREAM in dark, so the one
  // expression that dims in light lightens in dark; dark scrims with the page
  // ground instead.
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.ink, 0.42),
    justifyContent: 'flex-end',
  },
  backdropDark: { backgroundColor: withAlpha(colors.background, 0.7) },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.raised,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '700',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  list: {
    // flexGrow:0 so the ScrollView measures to its content and the sheet hugs
    // a short list instead of always standing at full maxHeight.
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  rowPressed: {
    backgroundColor: colors.mint,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  }),
);
