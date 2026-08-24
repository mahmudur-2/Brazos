import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { goBackOrHome } from '../lib/navigationRef';
import {
  fonts,
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  type ColorPalette,
} from '../lib/theme';
import { useFloatingNavClearance } from '../ui/primitives';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/themePreference';

/**
 * Profile → Appearance (4D-4). Three options, the current one indicated; a
 * tap applies immediately through setPreference — which repaints the app,
 * persists the choice (lib/themePreferenceStorage.ts, so it survives a
 * restart), and steers native surfaces via Appearance.setColorScheme.
 *
 * Deliberately no copy beyond the option labels: the screen is the setting.
 *
 * D4 (dark device pass): this screen has no golden master, so it received
 * only the token shift and none of the conversions. It now carries what every
 * converted settings surface does — a gold section eyebrow, the icon tile +
 * serif label row anatomy of masters 41 and 45, and a selection mark in a
 * colour that is actually visible on a dark ground. The LAYOUT is unchanged:
 * three rows in one card, exactly as before.
 */

const OPTION_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/** One honest glyph per option — what the setting follows, not decoration. */
const OPTION_ICONS: Record<ThemePreference, ComponentProps<typeof Ionicons>['name']> = {
  system: 'phone-portrait-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
};

export function AppearanceScreen() {
  const { palette, isDark, preference, setPreference } = useThemeColors();
  const styles = stylesFor(palette);
  // emerald(3): the floating pill's real footprint.
  const navClearance = useFloatingNavClearance();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Appearance" onBack={goBackOrHome} palette={palette} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: navClearance }]}>
        <Card palette={palette} style={styles.card}>
          <Text style={[styles.eyebrow, isDark && styles.eyebrowDark]}>THEME</Text>
          {THEME_PREFERENCES.map((option, index) => {
            const selected = option === preference;
            return (
              <Pressable
                key={option}
                style={({ pressed }) => [
                  styles.row,
                  index > 0 && styles.rowDivider,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => setPreference(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={[styles.rowGlyph, isDark && styles.rowGlyphDark]}>
                  <Ionicons
                    name={OPTION_ICONS[option]}
                    size={20}
                    color={isDark ? palette.gold : palette.primary}
                  />
                </View>
                <Text style={styles.label}>{OPTION_LABELS[option]}</Text>
                {selected ? (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    // `primary` is the deep forest FILL under Prestige, so the
                    // mark had been drawing itself in a colour one step off
                    // the card behind it. Dark takes the live-state emerald —
                    // the same green light's `primary` reads as.
                    color={isDark ? palette.emerald : palette.primary}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
    },
    card: {
      gap: spacing.sm,
    },
    eyebrow: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.4,
      color: colors.textMuted,
    },
    eyebrowDark: { color: colors.gold },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: spacing.sm,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowPressed: { opacity: 0.82 },
    rowGlyph: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.mint,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowGlyphDark: {
      backgroundColor: 'transparent',
      borderColor: colors.gold,
    },
    label: {
      flex: 1,
      fontFamily: fonts.display,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
  }),
);
