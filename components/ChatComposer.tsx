import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioMeterBars } from './AudioMeterBars';
import { DropMenu, type DropMenuItem } from './DropMenu';
import { VoiceNote } from './VoiceNote';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { RecorderPhase } from '../hooks/useVoiceRecorder';
import { DOCUMENTS, LIVE_LOCATION } from '../lib/featureFlags';
import { formatClipDuration } from '../lib/messages';
import { USE_NATIVE_DRIVER } from '../lib/motion';
import { voiceSearch, type VoiceSession } from '../lib/voiceSearch';
import {
  radius,
  spacing,
  themedStyles,
  useThemeColors,
  withAlpha,
  type ColorPalette,
} from '../lib/theme';

/**
 * THE COMPOSER IS THREE ZONES — 2026-08-23.
 *
 *   [ + ]        the attachment drop-up. Camera, Photos, Voice Message, and
 *                (behind their flags) Live location and Document.
 *   [ field ]    the message itself.
 *   [ mic/send ] ONE control that morphs: a dictation mic while the field is
 *                empty, the send arrow the moment there is something to send.
 *
 * WHAT IT REPLACES. Four naked controls in a row — camera, photo library,
 * record-a-voice-note mic, and a filled send disc — which crowded the field
 * into about half the width and offered every attachment path at once whether
 * or not the thread could take one. Collapsing three of them into the [ + ]
 * gives the field its width back and makes the row's shape independent of how
 * many attachment kinds exist, which matters because two more are coming.
 *
 * THE TWO MICS ARE DIFFERENT MICS, and that is the change most worth reading
 * twice. The mic on the RIGHT is DICTATION: it streams speech into the text
 * field through lib/voiceSearch, the same on-device boundary the search bars
 * use, and sends nothing. Recording a voice MESSAGE — an audio clip that
 * becomes a bubble — now lives in the [ + ] menu as "Voice Message". They used
 * to be one glyph doing the second job, and a user reaching for the first got
 * an audio file.
 *
 * NO CIRCLES ON THE GLYPHS. The [ + ], the mic and the send arrow are bare
 * marks with no disc or ring behind them — the ring the send button used to
 * carry is what made the row read as a toolbar rather than a text field.
 *
 * NEVER A DEAD CONTROL, in either direction: the dictation mic renders only
 * once the boundary AFFIRMS on-device recognition on this binary (every
 * degraded case leaves it unrendered, and the send arrow simply appears alone
 * when there is text), and the [ + ] renders only if the menu would have at
 * least one entry — a direct thread with no job has nowhere to store media, so
 * on those threads the button is absent rather than opening an empty panel.
 */

/**
 * Every control (the [ + ], the mic/send morph) shares this size, and the text
 * input matches it too, so the row reads as one strip rather than a text box
 * with buttons stuck on the side.
 */
const COMPOSER_CONTROL_SIZE = 46;
const ICON_GLYPH_SIZE = 26;
const SEND_GLYPH_SIZE = 22;
/** The mic/send crossfade. Short on purpose: it tracks typing, and anything
 *  slower lags behind the first character. */
const MORPH_MS = 140;

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
  /** The live waveform's samples, or null when this binary reports no
   *  metering — see components/AudioMeterBars.tsx. Never synthesised. */
  recorderLevels: number[] | null;
  /** Local file URI of the just-recorded clip, set only during 'preview'. */
  previewUri: string | null;
  /** Enter the voice-MESSAGE recorder. Reached from the [ + ] menu now, not
   *  from a mic in the row — the row's mic is dictation. */
  onMicTap: () => void;
  onStopRecording: () => void;
  onSendVoice: () => void;
  onDiscardVoice: () => void;
  /**
   * Camera and the voice recorder are native-only in the real app
   * (Platform.OS !== 'web'). Exposed as a prop rather than checked internally
   * so a harness can force the controls to render for visual comparison.
   */
  showCameraAndMic?: boolean;
  /**
   * Whether photo and voice attachments are possible in this thread at all.
   * Chat media is stored under `{jobId}/{userId}/…` and its storage policies
   * authorise on that job, so a direct thread (phase36 — a conversation with
   * no job) has no path to key an upload on. Text and offer cards work there;
   * attachments are hidden rather than offered and then failing.
   */
  allowAttachments?: boolean;
  /**
   * Flagged entries. Each renders only when its flag is true AND its handler
   * exists — so flipping a flag without wiring the action still cannot
   * produce a row that does nothing. See lib/featureFlags.ts.
   */
  onShareLiveLocation?: () => void;
  onPickDocument?: () => void;
};

/** Dictation APPENDS; a search field replaces. Someone half-way through a
 *  sentence who reaches for the mic means "and then this", not "instead". */
function joinDictation(base: string, phrase: string): string {
  const left = base.trimEnd();
  if (!left) return phrase;
  if (!phrase) return left;
  return `${left} ${phrase}`;
}

export function ChatComposer({
  text,
  onChangeText,
  onSend,
  sending,
  onPickCamera,
  onPickLibrary,
  recorderPhase,
  recorderDurationMs,
  recorderLevels,
  previewUri,
  onMicTap,
  onStopRecording,
  onSendVoice,
  onDiscardVoice,
  showCameraAndMic = Platform.OS !== 'web',
  allowAttachments = true,
  onShareLiveLocation,
  onPickDocument,
}: ChatComposerProps) {
  const { palette: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);
  const reducedMotion = useReducedMotion();

  // Master 19 draws every composer glyph in gold; light keeps the Heritage
  // primary. The [ + ] is the exception and takes `ink` — the palette's
  // strongest content colour, which is the cream that reads as WHITE in dark
  // and the near-black that reads as its opposite number in light. One token,
  // both themes, no fork.
  const glyph = isDark ? colors.gold : colors.primary;

  const isArming = recorderPhase === 'pending';
  const isRecording = recorderPhase === 'recording';
  const isPreviewing = recorderPhase === 'preview';
  const busy = isArming || isRecording;

  const [menuOpen, setMenuOpen] = useState(false);

  // --- dictation -----------------------------------------------------------
  // False until the boundary affirms on-device recognition on THIS binary;
  // every degraded case leaves the mic unrendered rather than disabled.
  const [dictationReady, setDictationReady] = useState(false);
  const [listening, setListening] = useState(false);
  // The live session's provisional phrase. It paints the field and is never
  // committed — the final arrives once, through onTranscript.
  const [interim, setInterim] = useState<string | null>(null);
  const sessionRef = useRef<VoiceSession | null>(null);
  // What was in the field when the session started, so an interim phrase
  // replaces the last interim rather than compounding on itself.
  const baseTextRef = useRef('');

  useEffect(() => {
    let alive = true;
    void voiceSearch.getAvailability().then((availability) => {
      if (alive) setDictationReady(availability.status === 'available');
    });
    return () => {
      alive = false;
    };
  }, []);

  // An unmount mid-session tears it down without committing.
  useEffect(() => {
    return () => sessionRef.current?.cancel();
  }, []);

  function toggleDictation() {
    if (sessionRef.current) {
      // Second tap: stop listening and commit what was heard.
      sessionRef.current.stop();
      return;
    }
    baseTextRef.current = text;
    setListening(true);
    sessionRef.current = voiceSearch.beginSession({
      onTranscript: (phrase) => onChangeText(joinDictation(baseTextRef.current, phrase)),
      onInterimTranscript: setInterim,
      onEnd: () => {
        sessionRef.current = null;
        setListening(false);
        setInterim(null);
      },
    });
  }

  // --- the mic/send morph --------------------------------------------------
  // While listening the control stays the mic, because a second tap on it is
  // how dictation stops.
  const showSend = !listening && text.trim().length > 0;
  const morph = useRef(new Animated.Value(showSend ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(morph, {
      toValue: showSend ? 1 : 0,
      duration: reducedMotion ? 0 : MORPH_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [morph, reducedMotion, showSend]);

  const micLayer = {
    opacity: morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ scale: morph.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) }],
  };
  const sendLayer = {
    opacity: morph,
    transform: [{ scale: morph.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }],
  };

  const sendDisabled = !text.trim() || sending || busy || isPreviewing;

  // --- the [ + ] menu ------------------------------------------------------
  const menuItems: DropMenuItem[] = [];
  if (allowAttachments && showCameraAndMic) {
    menuItems.push({ key: 'camera', label: 'Camera', icon: 'camera-outline', onPress: onPickCamera });
  }
  if (allowAttachments) {
    menuItems.push({ key: 'photos', label: 'Photos', icon: 'images-outline', onPress: onPickLibrary });
  }
  if (allowAttachments && showCameraAndMic) {
    menuItems.push({ key: 'voice', label: 'Voice Message', icon: 'mic-outline', onPress: onMicTap });
  }
  if (LIVE_LOCATION && onShareLiveLocation) {
    menuItems.push({
      key: 'location',
      label: 'Live location',
      icon: 'navigate-outline',
      onPress: onShareLiveLocation,
    });
  }
  if (DOCUMENTS && onPickDocument) {
    menuItems.push({
      key: 'document',
      label: 'Document',
      icon: 'document-outline',
      onPress: onPickDocument,
    });
  }

  // Preview replaces the whole row: reviewing/sending a voice note and
  // composing a text message at the same time isn't a state this needs to
  // support, so the attachment button, the field and the send all step aside.
  // PHASE 3 — PREVIEW. It replaces the whole row: reviewing a take and
  // composing a text message at the same time is not a state this needs to
  // support, so the attachment button, the field and the send all step aside.
  // X to discard, the clip's own scrubber in the middle, arrow-up to send —
  // the same two-decision shape as the recording pill, one step later.
  if (isPreviewing) {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={onDiscardVoice}
          disabled={sending}
          style={[styles.iconBtn, sending && styles.iconBtnDisabled]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Discard recording"
        >
          <Ionicons
            name="close"
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
          style={[styles.iconBtn, sending && styles.iconBtnDisabled]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Send voice message"
        >
          <Ionicons name="arrow-up" size={SEND_GLYPH_SIZE} color={glyph} />
        </Pressable>
      </View>
    );
  }

  return (
    // The anchor. DropMenu positions itself against this box's edges, so the
    // drop-up grows out of the [ + ] without anything being measured.
    <View style={styles.anchor}>
      <DropMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={menuItems}
        direction="up"
        align="left"
        closeLabel="Close attachment menu"
      />

      <View style={styles.row}>
        {/* Hidden, not disabled, while a take is running: the recording pill
            takes the row, and a greyed-out attachment button beside a live
            recording is a control nobody can use taking space the waveform
            can. */}
        {!isRecording && menuItems.length > 0 && (
          <Pressable
            onPress={() => setMenuOpen((open) => !open)}
            style={styles.iconBtn}
            hitSlop={6}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Attach"
            accessibilityHint="Camera, photos, or a voice message"
            accessibilityState={{ expanded: menuOpen }}
          >
            <Ionicons name="add" size={ICON_GLYPH_SIZE + 4} color={colors.ink} />
          </Pressable>
        )}

        {isRecording ? (
          // PHASE 2 — RECORDING. One pill: the live-dot, the waveform, the
          // elapsed time. The stop control sits outside it on the right, so
          // the pill is a READOUT and the row still has exactly one button.
          <View style={styles.recordingPill}>
            <View style={styles.recordingDot} />
            <AudioMeterBars levels={recorderLevels} />
            <Text style={styles.recordingTime}>{formatClipDuration(recorderDurationMs)}</Text>
          </View>
        ) : (
          <TextInput
            keyboardAppearance={isDark ? 'dark' : 'light'}
            style={[styles.input, listening && interim != null && styles.inputInterim]}
            value={listening && interim != null ? joinDictation(baseTextRef.current, interim) : text}
            onChangeText={onChangeText}
            placeholder={listening ? 'Listening…' : 'Message…'}
            placeholderTextColor={colors.textSubtle}
            multiline
            editable={!isArming && !listening}
          />
        )}

        {isRecording ? (
          <Pressable
            onPress={onStopRecording}
            style={styles.iconBtn}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Stop recording"
          >
            <Ionicons name="stop" size={ICON_GLYPH_SIZE} color={colors.danger} />
          </Pressable>
        ) : (
          // ONE box, two layers. Both are always laid out so the row's width
          // never changes as the text does; only the visible layer takes
          // touches, so a fading-out mic can never eat the send tap.
          <View style={styles.morphSlot}>
            {dictationReady && (
              <Animated.View
                style={[styles.morphLayer, micLayer]}
                pointerEvents={showSend ? 'none' : 'auto'}
              >
                <Pressable
                  onPress={toggleDictation}
                  disabled={sending || busy}
                  style={[styles.iconBtn, listening && styles.iconBtnListening]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={listening ? 'Stop dictation' : 'Dictate a message'}
                  accessibilityState={{ selected: listening }}
                >
                  <Ionicons
                    name={listening ? 'mic' : 'mic-outline'}
                    size={ICON_GLYPH_SIZE}
                    color={listening ? colors.emerald : glyph}
                  />
                </Pressable>
              </Animated.View>
            )}
            <Animated.View
              style={[styles.morphLayer, sendLayer]}
              pointerEvents={showSend ? 'auto' : 'none'}
            >
              <Pressable
                onPress={onSend}
                disabled={sendDisabled}
                style={[styles.iconBtn, sendDisabled && styles.iconBtnDisabled]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Send"
              >
                <Ionicons name="arrow-up" size={SEND_GLYPH_SIZE} color={glyph} />
              </Pressable>
            </Animated.View>
          </View>
        )}
      </View>
    </View>
  );
}

const stylesFor = themedStyles((colors: ColorPalette) =>
  StyleSheet.create({
  anchor: {
    position: 'relative',
  },
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
  // The one wash on a glyph in this row, and it is a STATE, not a chrome:
  // "this mic is listening right now". The same emerald wash the search bars
  // use for the same fact.
  iconBtnListening: {
    backgroundColor: withAlpha(colors.emerald, 0.15),
  },
  morphSlot: {
    width: COMPOSER_CONTROL_SIZE,
    height: COMPOSER_CONTROL_SIZE,
  },
  morphLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The pill the take runs inside. Emerald hairline on the emerald wash in
  // both palettes — the same "live, and being measured" vocabulary the
  // dictation mic uses — so a recording never reads as an error state.
  recordingPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: COMPOSER_CONTROL_SIZE,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: withAlpha(colors.emerald, 0.45),
    backgroundColor: withAlpha(colors.emerald, 0.1),
  },
  // The one red thing in the pill, and it is the universal "live" dot rather
  // than a danger signal.
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recordingTime: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    // Tabular figures, or the pill's width jitters once a second as the
    // digits change and the waveform appears to slide.
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
    // The palette's hairline is the gold one in dark — master 19 rings the
    // message pill exactly that way.
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
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
  // Provisional dictation: the placeholder's treatment until the final phrase
  // commits, so nobody mistakes a guess for what they will send.
  inputInterim: {
    color: colors.textMuted,
  },
  }),
);
