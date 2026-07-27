import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Every round control (camera, photo, mic, send) shares this size, and the
 * text input matches it too, so the whole row reads as one consistent strip
 * rather than a text box with small buttons stuck on the side.
 *
 * Bumped from 38 to 46 — the icons were reported as reading too small
 * relative to the input twice now; 46 is a deliberately large jump; a couple
 * of pixels would not have been a "noticeable" difference on a phone screen.
 */
export const COMPOSER_CONTROL_SIZE = 46;
const ICON_GLYPH_SIZE = 26;
const SEND_GLYPH_SIZE = 22;

type ChatComposerProps = {
  text: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  sending: boolean;
  isRecording: boolean;
  onPickCamera: () => void;
  onPickLibrary: () => void;
  onMicPressIn: () => void;
  onMicPressOut: () => void;
  /**
   * Camera and mic are native-only in the real app (Platform.OS !== 'web').
   * Exposed as a prop rather than checked internally so a harness/test can
   * force all three controls to render for visual comparison on web.
   */
  showCameraAndMic?: boolean;
  bottomInset: number;
};

export function ChatComposer({
  text,
  onChangeText,
  onSend,
  sending,
  isRecording,
  onPickCamera,
  onPickLibrary,
  onMicPressIn,
  onMicPressOut,
  showCameraAndMic = Platform.OS !== 'web',
  bottomInset,
}: ChatComposerProps) {
  const sendDisabled = !text.trim() || sending || isRecording;

  return (
    // paddingBottom carries the home-indicator inset here rather than on the
    // screen's SafeAreaView, so the composer's own surface colour runs to the
    // bottom of the screen instead of leaving a bare gap.
    <View style={[styles.row, { paddingBottom: spacing.sm + bottomInset }]}>
      {showCameraAndMic && (
        <Pressable
          onPress={onPickCamera}
          style={styles.iconBtn}
          hitSlop={6}
          disabled={isRecording}
        >
          <Ionicons name="camera-outline" size={ICON_GLYPH_SIZE} color={colors.primary} />
        </Pressable>
      )}

      <Pressable
        onPress={onPickLibrary}
        style={styles.iconBtn}
        hitSlop={6}
        disabled={isRecording}
      >
        <Ionicons name="image-outline" size={ICON_GLYPH_SIZE} color={colors.primary} />
      </Pressable>

      {showCameraAndMic && (
        <Pressable
          onPressIn={onMicPressIn}
          onPressOut={onMicPressOut}
          style={[styles.iconBtn, isRecording && styles.iconBtnActive]}
          hitSlop={6}
          disabled={sending}
          accessibilityLabel="Hold to record a voice message"
        >
          <Ionicons
            name={isRecording ? 'stop' : 'mic-outline'}
            size={ICON_GLYPH_SIZE}
            color={isRecording ? colors.onPrimary : colors.primary}
          />
        </Pressable>
      )}

      {isRecording ? (
        <Text style={styles.recordingFill}>Recording…</Text>
      ) : (
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          placeholder="Message…"
          placeholderTextColor={colors.textSubtle}
          multiline
        />
      )}

      <Pressable
        onPress={onSend}
        disabled={sendDisabled}
        style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
      >
        <Ionicons name="arrow-up" size={SEND_GLYPH_SIZE} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // Every control shares COMPOSER_CONTROL_SIZE, so centring aligns them all
    // on one axis regardless of how tall the input grows with more text.
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: COMPOSER_CONTROL_SIZE,
    height: COMPOSER_CONTROL_SIZE,
    borderRadius: COMPOSER_CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: colors.danger,
  },
  recordingFill: {
    flex: 1,
    fontSize: 15,
    color: colors.textMuted,
    paddingVertical: spacing.sm + 2,
  },
  input: {
    flex: 1,
    minHeight: COMPOSER_CONTROL_SIZE,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    lineHeight: 19,
    color: colors.text,
    backgroundColor: colors.background,
    // The explicit nudge asked for: shifts the input down relative to the
    // round controls beside it, which share this row's centred baseline but
    // don't get this extra offset.
    marginTop: spacing.xs,
  },
  sendBtn: {
    width: COMPOSER_CONTROL_SIZE,
    height: COMPOSER_CONTROL_SIZE,
    borderRadius: COMPOSER_CONTROL_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
