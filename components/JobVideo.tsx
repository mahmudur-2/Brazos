import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors, radius, spacing } from '../lib/theme';

/**
 * One short video attached to a job posting.
 *
 * It stays a poster tile until the reader asks for it. That is not only
 * politeness about autoplay: mounting a VideoView per clip on a screen that
 * may show several would hold a decoder open for each one, so the player is
 * only created once someone has actually tapped.
 *
 * Sound is never started implicitly — playback begins from the native
 * controls, at the volume the device is set to, after a deliberate press.
 */
export function JobVideo({ uri, label }: { uri: string; label: string }) {
  const [active, setActive] = useState(false);

  if (!active) {
    return (
      <Pressable
        style={({ pressed }) => [styles.poster, pressed && styles.posterPressed]}
        onPress={() => setActive(true)}
        accessibilityRole="button"
        accessibilityLabel={`Play ${label}`}
      >
        <Ionicons name="play-circle" size={44} color={colors.primary} />
        <Text style={styles.posterText}>{label}</Text>
      </Pressable>
    );
  }

  return <ActiveVideo uri={uri} />;
}

/**
 * Split out so useVideoPlayer is only ever called on a mounted, wanted clip —
 * hooks cannot be called conditionally, and the hook's own cleanup releases
 * the player when this unmounts.
 */
function ActiveVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    // Deliberately no p.play(): the press opens the player, the reader starts
    // it. Looping a job walkthrough would be noise.
    p.loop = false;
  });

  return (
    <View style={styles.playerWrap}>
      <VideoView
        player={player}
        style={styles.player}
        nativeControls
        contentFit="contain"
        allowsFullscreen
      />
    </View>
  );
}

const TILE_WIDTH = 220;
const TILE_HEIGHT = 132;

const styles = StyleSheet.create({
  poster: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  posterPressed: {
    opacity: 0.9,
  },
  posterText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  playerWrap: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.text,
  },
  player: {
    width: '100%',
    height: '100%',
  },
});
