import { useModalPresence } from '../hooks/useModalPresence';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import {
  radius,
  scrimInDark,
  shadows,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';
import { SCRIM_DARK_ALPHA } from '../lib/theme';
import { useOverrideNumber, useOverrideString } from '../lib/designOverrides';
import { BlurLayer } from '../lib/blur';
import { SheetHeader } from '../ui/primitives/SheetHeader';
import { Surface } from '../ui/primitives/Surface';

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

/**
 * Bottom-sheet list of actions — the Messages long-press menu, and the
 * customer bar's [ + ] creation sheet.
 *
 * emerald D8 — THE BAND UNDER "Cancel". The dark device pass photographed an
 * unthemed light-grey band spanning the full width below Cancel. It was not
 * this component's: the sheet's own surfaces are all on the palette. It was
 * the app's UNPAINTED ground showing through the scrim — the same missing
 * ground emerald(2) found under the floating nav pill, where the iOS root
 * view's platform white was reaching the screen. A 70% near-black scrim over
 * a white strip renders as exactly that: a light-grey band, full width, at the
 * bottom. Painting the ground in navigation/ModeShell.tsx removed the source;
 * what this file adds is the safe-area handling it never had, so the sheet
 * clears the home indicator instead of ending on top of it and leaving that
 * strip to whatever is behind.
 */
export function ActionSheet({
  visible,
  title,
  subtitle,
  items,
  onClose,
}: ActionSheetProps) {
  const { palette: colors, isDark } = useThemeColors();
  // #64 (M-31): on screen or not — the one confirm engine never stacks a second modal on iOS.
  useModalPresence(visible);
  const styles = stylesFor(colors);
  // ui/primitives/Sheet.tsx has always done this; this one never did.
  const insets = useSafeAreaInsets();
  // RUN S2 (C7) — the shared sheet-family dials: backdrop scrim and the
  // dialog-card radius. Fill, blur and hairline are the sheet MATERIAL's.
  const dialogRadius = useOverrideNumber('sheet.dialogRadius') ?? radius.xl;
  const sheetShadowDial = useOverrideNumber('sheet.shadowOpacity');
  const backdropColorDial = useOverrideString('sheet.backdropColor');
  const backdropAlphaDial = useOverrideNumber('sheet.backdropAlpha');
  const backdropDial =
    backdropColorDial != null || backdropAlphaDial != null
      ? {
          backgroundColor: withAlpha(
            backdropColorDial ?? (isDark ? colors.background : colors.text),
            backdropAlphaDial ?? (isDark ? SCRIM_DARK_ALPHA : 0.35),
          ),
        }
      : null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[
          styles.backdrop,
          isDark && styles.backdropDark,
          backdropDial,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
        onPress={onClose}
        // E2E5: a Pressable is accessible by default, and on iOS an accessible
        // view is ONE element that folds its children's text and hides them —
        // so the backdrop and card below folded the whole sheet into a single
        // element with no reachable row (EAS run 01a064ef, "Element not found:
        // Text matching regex: My jobs"). Neither container is a control.
        accessible={false}
      >
        {/* MOTION1 (C3): the frosted layer sits over the scrim this backdrop
            already paints, and under the sheet. Absent on web and on any
            binary without expo-blur, where the scrim alone is the backdrop. */}
        <BlurLayer />
        {/* Empty onPress absorbs taps so they don't dismiss the sheet.
            G1 (C5): the card SURFACE wears the sheet material — fill,
            hairline and blur from ui/tokens.ts's table, geometry unchanged
            via the radius prop. The backdrop above and every open/close
            mechanic are byte-identical. */}
        <Pressable accessible={false} onPress={() => {}}>
          <Surface material="menu" corners="all" radius={dialogRadius} style={[styles.sheet, sheetShadowDial != null && { shadowOpacity: sheetShadowDial }]}>
          {/* 2026-09-28 (LUX-LIST-64 #64, audit M-31) — the one sheet header:
              the handle, the title (and its line), and "Close" on the right —
              choosing a row is the action, closing only dismisses. The
              bottom Cancel row is gone; the backdrop means Close. */}
          <View style={styles.headerWrap}>
            <SheetHeader title={title} subtitle={subtitle} dismissWord="Close" onDismiss={onClose} />
          </View>

          {items.map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
              onPress={item.onPress}
              // E2E5: the row's own folded label would be glyph + text; the
              // explicit label is the text alone, so an exact match hits it.
              accessibilityRole="button"
              accessibilityLabel={item.label}
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

          </Surface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  // D7 — a modal scrim DIMS the parent. `text` is the CREAM in dark, so the
  // one expression that dims in light lightens in dark; dark scrims with the
  // page ground instead, at the shared strength (emerald D8).
  // paddingBottom is applied at render from the safe-area inset.
  backdrop: {
    flex: 1,
    backgroundColor: withAlpha(colors.text, 0.35),
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  backdropDark: { backgroundColor: scrimInDark(colors.background) },
  // G1 (C5): fill, hairline and radius are the sheet MATERIAL's now — only
  // the clip and the lift stay here. (overflow already cancelled this shadow
  // on iOS before the material arrived; behaviour is unchanged.)
  sheet: {
    overflow: 'hidden',
    ...shadows.raised,
  },
  // The one header's handle sits a little in from the card's top edge.
  headerWrap: {
    paddingTop: spacing.sm,
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
  }),
);
