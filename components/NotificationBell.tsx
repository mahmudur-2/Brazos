import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUnreadNotificationCount } from '../hooks/useUnreadNotificationCount';
import { spacing, themedStyles, useThemeColors, type ColorPalette } from '../lib/theme';

/**
 * 2026-09-26 (the refresh, audit M-24) — THE FEED, ONE TAP FROM HOME.
 *
 * The notification feed lived only as a row inside Profile, with no signal
 * that anything was waiting. Both Homes carry this bell in their greeting row;
 * the dot is the same unread fact the feed's own "Mark all read" counts (rows
 * without read_at), re-read whenever Home regains focus. A failed read shows
 * no dot rather than a guessed one. 2026-09-27 (the operator's review): the
 * signal is the unread COUNT in a small mint pill at the ring's corner, "9+"
 * past nine so it never outgrows the corner — not a dot.
 *
 * 2026-09-28 (LUX-LIST-64 #11, #52): a BARE bell — no round background, no
 * ring — gold in dark and the forest mark in light (#47), inside the same 44pt
 * tap area; the count sits in the error red with a white number, at the
 * bell's corner as the approved Home page draws it (refs/home-tucked-in.html
 * `.bell b`).
 *
 * 2026-09-29 (LUX-LIST-2 #7): the count comes from hooks/useUnreadNotificationCount.ts, the one read
 * Profile's "Notifications" row shows too.
 */
export function NotificationBell({ onPress }: { onPress: () => void }) {
  const { palette: colors } = useThemeColors();
  const styles = stylesFor(colors);
  const unread = useUnreadNotificationCount();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Ionicons name="notifications-outline" size={25} color={colors.mark} />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {unread > 9 ? '9+' : String(unread)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    // The reference's badge sits 6 right of and 5 above the 30pt bell box;
    // centred in this 44pt target that is 1 from the right and 2 from the top.
    badge: {
      position: 'absolute',
      top: 2,
      right: 1,
      minWidth: 18,
      height: 18,
      paddingHorizontal: spacing.xs + 1,
      borderRadius: 9,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      fontSize: 11,
      lineHeight: 13,
      fontWeight: '800',
      color: colors.white,
    },
  })
);
