import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMode, useModeSwitch } from '../modes/ModeProvider';
import {
  emeraldRadius,
  litCardStyle,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * 2026-09-26 (the refresh, audit M-8) — THE MODE SWITCH'S STANDING HOME.
 *
 * One row, the same in both trees: it says which mode you are in and switches
 * to the other through the same switchMode() the [+] sheet's row calls — so it
 * confirms first and swaps the tree exactly as that does. The sheet row stays
 * the shortcut it was. 2026-09-28 (LUX-LIST-64 #61): Worker Home's "Switch to
 * Customer" pill is gone, so in worker mode this row is the way back.
 *
 * 2026-09-29 (LUX-LIST-2 #7): it lives on the Profile hub only, right under
 * your own card — Account & safety's copy left with the rest of that page's
 * duplicates. It is drawn as the hub's cards are (#6's lit card): a round swap
 * disc, "You're in Customer mode" over "Switch to Worker · confirms first",
 * and a chevron. The confirm itself is unchanged.
 */
export function ModeSwitchRow() {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const { mode } = useMode();
  const { target, switching, switchToOtherMode } = useModeSwitch();
  const targetLabel = target === 'worker' ? 'Switch to Worker' : 'Switch to Customer';

  return (
    <Pressable
      onPress={() => void switchToOtherMode()}
      disabled={switching}
      style={({ pressed }) => [styles.row, litCardStyle(isDark), pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={targetLabel}
      accessibilityHint="Confirms first"
      accessibilityState={{ disabled: switching }}
    >
      <View style={[styles.disc, isDark && styles.discDark]}>
        <Ionicons name="swap-horizontal" size={20} color={colors.emerald} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {mode === 'worker' ? 'You’re in Worker mode' : 'You’re in Customer mode'}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {targetLabel} · confirms first
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: 14,
      paddingHorizontal: spacing.lg,
      // The card corner — the one scale's xl (24) since fix run D8; it was §I's 22.
      borderRadius: emeraldRadius.xl,
    },
    pressed: { opacity: 0.82 },
    disc: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(colors.emerald, 0.4),
    },
    discDark: { borderColor: withAlpha(colors.emerald, 0.45) },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    title: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '700',
      color: colors.ink,
    },
    sub: {
      fontSize: 13,
      lineHeight: 17,
      color: colors.textMuted,
    },
  })
);
