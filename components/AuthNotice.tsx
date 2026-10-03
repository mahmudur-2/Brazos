import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { authRadius, authSpacing, authType } from '../lib/authTheme';
import { authSurface, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

type AuthNoticeProps = {
  tone: 'info' | 'danger';
  children: string;
};

/**
 * The auth flow's inline message strip — a suspended-account warning, or a
 * statement about what a control can and can't do yet.
 *
 * Shared because both sign-in screens show one and they must not drift apart
 * visually. Announced politely rather than assertively: it appears in response
 * to something the user just did, so it doesn't need to interrupt them.
 *
 * Fix run D9 (2026-10-03): it follows the theme. Every screen that shows it is
 * on the themed auth path, so a light-only strip was a pale band on the dark
 * ground. Info is the mint well with the auth muted ink and the field glyph's
 * mint; danger is the palette's danger ground and ink. No literal is left —
 * the two hexes it carried were the light rendering's.
 */
export function AuthNotice({ tone, children }: AuthNoticeProps) {
  const { palette, isDark } = useThemeColors();
  const styles = stylesFor(palette);
  const surface = authSurface(palette, isDark);
  const danger = tone === 'danger';

  return (
    <View
      style={[styles.strip, danger ? styles.danger : styles.info]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons
        name={danger ? 'alert-circle-outline' : 'information-circle-outline'}
        size={18}
        color={danger ? surface.danger : surface.fieldLabel}
      />
      <Text style={[styles.text, { color: danger ? surface.danger : surface.muted }]}>
        {children}
      </Text>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    strip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: authSpacing.sm,
      padding: authSpacing.md,
      borderRadius: authRadius.field,
    },
    info: {
      backgroundColor: colors.mint,
    },
    danger: {
      backgroundColor: colors.dangerBg,
    },
    text: {
      ...authType.note,
      flex: 1,
    },
  }),
);
