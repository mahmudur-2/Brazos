import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { colors, radius, spacing } from '../lib/theme';

/**
 * One short video attached to a job posting.
 *
 * It stays a poster tile until the reader asks for it. The poster is a paused
 * frame from the real clip, so a viewer can see what the walkthrough contains
 * before opening the controls. Job details have at most a couple of clips,
 * which keeps this lightweight while avoiding a second thumbnail service.
 *
 * Sound is never started implicitly - playback begins from the native
 * controls, at the volume the device is set to, after a deliberate press.
 */
export function JobVideo({ uri, label }: { uri: string; label: string }) {
  const [active, setActive] = useState(false);
  const player = useVideoPlayer(uri, (p) => {
    // A frame shortly into the clip is usually more useful than its opening
    // camera-roll frame. The native player clamps this for very short videos.
    p.currentTime = 0.5;
    p.loop = false;
  });
  const videoRef = useRef<VideoView>(null);

  function enterFullscreen() {
    const video = videoRef.current;
    if (!video) return;

    video.enterFullscreen().catch((error) => {
      console.warn('[JobVideo] Unable to enter fullscreen', error);
    });
  }

  if (!active) {
    return (
      <Pressable
        style={({ pressed }) => [styles.poster, pressed && styles.posterPressed]}
        onPress={() => setActive(true)}
        accessibilityRole="button"
        accessibilityLabel={`Play ${label}`}
      >
        <VideoView
          player={player}
          style={styles.posterVideo}
          nativeControls={false}
          contentFit="cover"
          pointerEvents="none"
        />
        <View style={styles.posterScrim} pointerEvents="none" />
        <View style={styles.posterContent} pointerEvents="none">
          <Ionicons name="play-circle" size={48} color={colors.white} />
          <View style={styles.posterLabel}>
            <Text style={styles.posterText}>{label}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.playerWrap}>
      <VideoView
        ref={videoRef}
        player={player}
        style={styles.player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
      />
      <Pressable
        style={({ pressed }) => [styles.fullscreenButton, pressed && styles.fullscreenButtonPressed]}
        onPress={enterFullscreen}
        accessibilityRole="button"
        accessibilityLabel="Play video fullscreen"
        hitSlop={4}
      >
        <Ionicons name="expand" size={22} color={colors.white} />
      </Pressable>
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
    backgroundColor: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPressed: { opacity: 0.9 },
  posterVideo: { ...StyleSheet.absoluteFillObject },
  posterScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 31, 23, 0.32)' },
  posterContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  posterLabel: {
    minHeight: 28,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 31, 23, 0.78)',
  },
  posterText: { fontSize: 12, fontWeight: '700', color: colors.white },
  playerWrap: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.text,
  },
  player: { width: '100%', height: '100%' },
  fullscreenButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15, 31, 23, 0.82)',
  },
  fullscreenButtonPressed: { opacity: 0.78 },
});
