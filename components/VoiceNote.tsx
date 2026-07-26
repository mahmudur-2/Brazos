import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { formatClipDuration } from '../lib/messages';
import { colors, radius, spacing } from '../lib/theme';

type VoiceNoteProps = {
  url: string;
  /** Recorded length, stored at send time so the bubble can show a duration
   *  before the audio has loaded. Falls back to the player's own reading. */
  durationMs: number | null;
  /** Own messages sit on the primary fill, so the controls invert. */
  isOwn: boolean;
};

// A fixed set of bar heights, deliberately not derived from the audio itself:
// real waveform extraction would mean decoding every clip on render. This is
// a static motif that reads as "voice note" while the progress fill carries
// the actual state.
const BARS = [0.35, 0.6, 0.85, 0.5, 1, 0.7, 0.4, 0.9, 0.55, 0.75, 0.45, 0.65,
  0.3, 0.8, 0.5, 0.6];

/**
 * Inline voice-note player: play/pause, a progress-filled bar motif, and a
 * running time — the standard voice-message shape.
 *
 * expo-audio's `useAudioPlayer` holds one native player per mounted note.
 * That's fine at conversation scale (a handful of notes) and is what lets a
 * note keep its own position independently of the others.
 */
export function VoiceNote({ url, durationMs, isOwn }: VoiceNoteProps) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);

  const tint = isOwn ? colors.onPrimary : colors.primary;
  const trackTint = isOwn ? 'rgba(244,241,232,0.35)' : colors.border;

  // Prefer the player's loaded duration; fall back to the value stored at
  // send time so the bubble isn't blank before the clip loads.
  const totalMs =
    status.duration && status.duration > 0
      ? status.duration * 1000
      : durationMs ?? 0;
  const positionMs = (status.currentTime ?? 0) * 1000;
  const progress = totalMs > 0 ? Math.min(positionMs / totalMs, 1) : 0;

  // While playing, count up; otherwise show the clip's total length.
  const timeLabel = status.playing
    ? formatClipDuration(positionMs)
    : formatClipDuration(totalMs);

  const filledBars = useMemo(
    () => Math.round(progress * BARS.length),
    [progress]
  );

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    // Replay from the start once finished, rather than sitting at the end.
    if (status.didJustFinish || progress >= 1) {
      player.seekTo(0);
    }
    player.play();
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={toggle}
        hitSlop={8}
        style={[styles.playBtn, { borderColor: tint }]}
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={16}
          color={tint}
          // The play triangle reads as off-centre inside a circle without this.
          style={status.playing ? undefined : styles.playIcon}
        />
      </Pressable>

      <View style={styles.bars}>
        {BARS.map((h, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: 4 + h * 18,
                backgroundColor: i < filledBars ? tint : trackTint,
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.time, { color: tint }]}>{timeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 190,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    marginLeft: 2,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 24,
  },
  bar: {
    flex: 1,
    borderRadius: radius.pill,
    minWidth: 2,
  },
  time: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 30,
    textAlign: 'right',
  },
});
