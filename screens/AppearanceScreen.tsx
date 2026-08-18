import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../components/Card';
import { ScreenHeader } from '../components/ScreenHeader';
import { goBackOrHome } from '../lib/navigationRef';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/themePreference';

/**
 * Profile → Appearance (4D-4). Three options, the current one indicated; a
 * tap applies immediately through setPreference — which repaints the app,
 * persists the choice (lib/themePreferenceStorage.ts, so it survives a
 * restart), and steers native surfaces via Appearance.setColorScheme.
 *
 * Deliberately no copy beyond the option labels: the screen is the setting.
 */

const OPTION_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function AppearanceScreen() {
  const { palette, preference, setPreference } = useThemeColors();
  const styles = stylesFor(palette);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Appearance" onBack={goBackOrHome} palette={palette} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card palette={palette}>
          {THEME_PREFERENCES.map((option, index) => {
            const selected = option === preference;
            return (
              <Pressable
                key={option}
                style={[styles.row, index > 0 && styles.rowDivider]}
                onPress={() => setPreference(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <Text style={styles.label}>{OPTION_LABELS[option]}</Text>
                {selected ? (
                  <Ionicons name="checkmark" size={20} color={palette.primary} />
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    label: {
      fontSize: 15,
      color: colors.text,
    },
  }),
);
