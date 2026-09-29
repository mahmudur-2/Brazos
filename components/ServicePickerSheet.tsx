import { useModalPresence } from '../hooks/useModalPresence';
import { useSheetPresence } from '../hooks/useSheetPresence';
import {
  Animated,
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
import { SheetHeader } from '../ui/primitives/SheetHeader';
import type { SkillCategory } from '../lib/skillCategories';
import { CategoryGlyph } from './CategoryGlyph';
import {
  fonts,
  radius,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
  scrimInDark,
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
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const presence = useSheetPresence(visible);
  const styles = stylesFor(colors);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // The sheet is allowed most of the screen but never all of it — leaving the
  // backdrop visible is what tells the user this is a layer they can dismiss
  // rather than a screen they navigated to.
  const maxHeight = height * 0.78;

  return (
    <Modal
      visible={presence.mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      // Android hardware back closes the sheet via onRequestClose above.
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* 2026-09-29 (LUX-LIST-2 #3): the dim covers the screen at once; only the card moves (hooks/useSheetPresence). */}
        {presence.dimVisible ? (
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdrop, isDark && styles.backdropDark]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        ) : null}
        <Animated.View style={presence.cardStyle}>
        <Pressable
          style={[styles.sheet, { maxHeight, paddingBottom: insets.bottom + spacing.sm }]}
          // Absorbs taps so a press inside the sheet can't reach the backdrop.
          onPress={() => {}}
        >
          {/* #64 (M-31) — the one sheet header: "Close" on the right, in place
              of the X; picking a service is the action. */}
          <SheetHeader
            title={title}
            subtitle={subtitle}
            dismissWord="Close"
            onDismiss={onClose}
            titleStyle={styles.title}
            subtitleStyle={styles.subtitle}
          />

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {services.map((service, index) => (
              <Pressable
                // Several rows deliberately share a category key (see
                // MORE_SERVICES), so the label is what makes a row unique.
                key={service.label}
                style={({ pressed }) => [styles.row, index > 0 && styles.rowDivided, pressed && styles.rowPressed]}
                onPress={() => onSelect(service.key)}
                accessibilityRole="button"
                accessibilityLabel={service.label}
              >
                {/* 2026-09-28 (LUX-LIST-64 #13, #14): sim.html's list row — the
                    service's own line glyph in the mint, its name, a chevron. */}
                <CategoryGlyph name={service.icon} size={22} color={colors.emerald} />
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {service.label}
                </Text>
                <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} />
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // D7 — the scrim dims the parent. `ink` is the CREAM in dark, so the one
  // expression that dims in light lightens in dark; dark scrims with the page
  // ground instead.
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.ink, 0.42),
    justifyContent: 'flex-end',
  },
  backdropDark: { backgroundColor: scrimInDark(colors.background) },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.raised,
  },
  // #13 — sim.html's "All services" type, kept inside the one header (#64).
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    color: colors.ink,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  list: {
    // flexGrow:0 so the ScrollView measures to its content and the sheet hugs
    // a short list instead of always standing at full maxHeight.
    flexGrow: 0,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  // 2026-09-28 (LUX-LIST-64 #13) — sim.html's "All services" LIST. RUN H2 had
  // made each row a card (the page ground under a hairline, an icon tile); the
  // approved sheet is a plain list instead: no card per row, a hairline between
  // rows, 12 by 4 of padding, the service's own line glyph in the mint (no
  // tile), its name at 16, a chevron.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md + 2,
    minHeight: 48,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.mint,
  },
  // The icon tile (`rowIcon`, RUN H2's mint square) is gone with the cards:
  // the glyph sits bare in the row, the emerald in each palette.
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: colors.ink,
  },
  }),
);
