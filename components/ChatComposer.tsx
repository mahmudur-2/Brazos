import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VoiceNote } from './VoiceNote';
import type { RecorderPhase } from '../hooks/useVoiceRecorder';
import { formatClipDuration } from '../lib/messages';
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
  onPickCamera: () => void;
  onPickLibrary: () => void;
  /** idle | pending | recording | preview — see useVoiceRecorder.ts. */
  recorderPhase: RecorderPhase;
  recorderDurationMs: number;
  /** Local file URI of the just-recorded clip, set only during 'preview'. */
  previewUri: string | null;
  /** Tap the mic icon — arms the recording start delay, or cancels it if
   *  tapped again before it fires. */
  onMicTap: () => void;
  onStopRecording: () => void;
  onSendVoice: () => void;
  onDiscardVoice: () => void;
  /**
   * Camera and mic are native-only in the real app (Platform.OS !== 'web').
   * Exposed as a prop rather than checked internally so a harness/test can
   * force all three controls to render for visual comparison on web.
   */
  showCameraAndMic?: boolean;
};

export function ChatComposer({
  text,
  onChangeText,
  onSend,
  sending,
  onPickCamera,
  onPickLibrary,
  recorderPhase,
  recorderDurationMs,
  previewUri,
  onMicTap,
  onStopRecording,
  onSendVoice,
  onDiscardVoice,
  showCameraAndMic = Platform.OS !== 'web',
}: ChatComposerProps) {
  const isArming = recorderPhase === 'pending';
  const isRecording = recorderPhase === 'recording';
  const isPreviewing = recorderPhase === 'preview';
  const sendDisabled = !text.trim() || sending || isArming || isRecording || isPreviewing;

  // Preview replaces the whole row: reviewing/sending a voice note and
  // composing a text message at the same time isn't a state this needs to
  // support, so camera/library/text-input/text-send all step aside for it.
  if (isPreviewing) {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={onDiscardVoice}
          disabled={sending}
          style={[styles.iconBtn, sending && styles.iconBtnDisabled]}
          hitSlop={6}
          accessibilityLabel="Discard recording"
        >
          <Ionicons
            name="trash-outline"
            size={ICON_GLYPH_SIZE}
            color={sending ? colors.textSubtle : colors.danger}
          />
        </Pressable>

        <View style={styles.previewWrap}>
          {previewUri ? (
            <VoiceNote url={previewUri} durationMs={recorderDurationMs} isOwn={false} />
          ) : null}
        </View>

        <Pressable
          onPress={onSendVoice}
          disabled={sending}
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          accessibilityLabel="Send voice message"
        >
          <Ionicons name="arrow-up" size={SEND_GLYPH_SIZE} color={colors.onPrimary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {showCameraAndMic && (
        <Pressable
          onPress={onPickCamera}
          style={styles.iconBtn}
          hitSlop={6}
          disabled={isArming || isRecording}
        >
          <Ionicons name="camera-outline" size={ICON_GLYPH_SIZE} color={colors.primary} />
        </Pressable>
      )}

      <Pressable
        onPress={onPickLibrary}
        style={styles.iconBtn}
        hitSlop={6}
        disabled={isArming || isRecording}
      >
        <Ionicons name="image-outline" size={ICON_GLYPH_SIZE} color={colors.primary} />
      </Pressable>

      {showCameraAndMic && (
        <Pressable
          onPress={isRecording ? onStopRecording : onMicTap}
          style={[styles.iconBtn, (isArming || isRecording) && styles.iconBtnActive]}
          hitSlop={6}
          disabled={sending}
          accessibilityLabel={
            isRecording ? 'Stop recording' : isArming ? 'Cancel recording' : 'Record a voice message'
          }
        >
          <Ionicons
            name={isRecording ? 'stop' : 'mic-outline'}
            size={ICON_GLYPH_SIZE}
            color={isArming || isRecording ? colors.onPrimary : colors.primary}
          />
        </Pressable>
      )}

      {isRecording ? (
        <View style={styles.recordingFill}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>
            Recording… {formatClipDuration(recorderDurationMs)}
          </Text>
        </View>
      ) : (
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={onChangeText}
          placeholder="Message…"
          placeholderTextColor={colors.textSubtle}
          multiline
          editable={!isArming}
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
    // No safe-area inset added here, deliberately. ChatComposer is only ever
    // rendered inside ChatScreen, which is only ever reached nested inside
    // the app's bottom Tab.Navigator — its tab bar is always visible below
    // this screen and already pads itself for the home indicator. Adding the
    // device's bottom inset again here double-padded the space between the
    // composer and the tab bar, which is exactly the persistent empty-gap bug
    // reported before. If a screen ever hosts this composer WITHOUT a tab bar
    // beneath it, that screen's own SafeAreaView should own the inset instead
    // of this component guessing at it.
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: COMPOSER_CONTROL_SIZE,
    height: COMPOSER_CONTROL_SIZE,
    borderRadius: COMPOSER_CONTROL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: {
    opacity: 0.4,
  },
  iconBtnActive: {
    backgroundColor: colors.danger,
  },
  recordingFill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recordingText: {
    fontSize: 15,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  previewWrap: {
    flex: 1,
    minHeight: COMPOSER_CONTROL_SIZE,
    justifyContent: 'center',
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
