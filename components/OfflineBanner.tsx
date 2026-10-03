import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DropdownBody } from './DropdownReveal';
import { useOnline } from '../hooks/useOnline';
import { useAnnounce } from '../hooks/useAnnounce';
import { radius, spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * FIX-RUN B6 — a slim "You're offline" pill under the status bar while the
 * device has no internet, over every signed-in screen. Mounted once (App.tsx
 * MainTabs). It never takes a tap — pointerEvents none — so nothing under it
 * is blocked, and it arrives and leaves on the shared 120 Hz reveal
 * (DropdownBody: fade and a 6pt settle, a plain switch under Reduce Motion).
 */
const OFFLINE_LINE = 'You’re offline. Some things may be out of date.';

export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  // Spoken on iOS when the connection drops (E4); the banner itself never takes focus.
  useAnnounce(online ? null : OFFLINE_LINE);
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.xs }]}>
      <DropdownBody open={!online} style={styles.pill}>
        <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
        <Text style={styles.text} accessibilityRole="alert" accessibilityLiveRegion="polite">
          {OFFLINE_LINE}
        </Text>
      </DropdownBody>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      zIndex: 50,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: colors.warningBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.warning,
    },
    text: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
  })
);
