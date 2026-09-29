import { Pressable, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { navigateAcrossTabs } from '../lib/navigationRef';
import { metricStyles } from '../lib/theme';

/** refs/home-tucked-in.html `.me`: a 36pt round photo. */
const SIZE = 36;

/**
 * 2026-09-28 (LUX-LIST-64 #59) — YOUR PHOTO, RIGHT OF THE BELL, on both Homes:
 * 36 round, the initials disc in #25's colours when there is no photo (the one
 * Avatar every list draws), inside a 44pt target. A tap opens the profile on its
 * edit surface — the same `edit: true` dispatch Worker Home's profile nudge
 * already makes — and that header names "Home" beside its back button (#60).
 */
export function HomeAvatarButton({ name, uri }: { name: string | null | undefined; uri: string | null | undefined }) {
  const styles = stylesFor();
  return (
    <Pressable
      onPress={() => navigateAcrossTabs('Profile', 'ProfileMain', { edit: true })}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Edit your profile"
    >
      <Avatar name={name} uri={uri} size={SIZE} />
    </Pressable>
  );
}

const stylesFor = metricStyles(() =>
  StyleSheet.create({
    button: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      transform: [{ scale: 0.94 }],
    },
  })
);
