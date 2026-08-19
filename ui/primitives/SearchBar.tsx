import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  controls,
  radius,
  spacing,
  withAlpha,
  type EmeraldPalette,
  type as typeScale,
} from '../tokens';
import { themedStyles, useThemeColors } from '../../lib/theme';
import { voiceSearch, type VoiceHoldSession } from '../../lib/voiceSearch';

/**
 * The shared search field (§I).
 *
 * Deliberately state-agnostic: it takes `value`/`onChangeText` and owns no
 * query state itself, because every screen that searches already owns that
 * state (and often a debounce, or a resolved location alongside it). A search
 * bar holding its own copy would fight them.
 *
 * Passing `onPress` renders the same shape as a button instead of an input —
 * the Home-screen case, where the field is an affordance that pushes a
 * dedicated search route rather than something you type into in place.
 *
 * Voice search (4D-4 Block 2): a press-and-hold mic, rendered ONLY when
 * lib/voiceSearch reports the on-device recognizer available — on any other
 * binary or platform it is simply absent (no error state, no disabled ghost).
 * The recognized phrase arrives through the SAME `onChangeText` contract as
 * typed text, so consumers need no change and there is no second write path.
 * Hold to listen, release to stop and commit — the shape the iOS permission
 * string promises ("only while you hold the mic button"), enforced by the
 * boundary's hold session. `disableVoiceSearch` opts a call site out.
 */

type SearchBarProps = {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** Fired on keyboard submit. Search-as-you-type screens can omit it. */
  onSubmit?: () => void;
  /** Render as a button that navigates, rather than an editable input. */
  onPress?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Opt out of the press-and-hold mic. Present by default when available. */
  disableVoiceSearch?: boolean;
  /** Typing posture. The defaults are the terse keyword posture this field
   *  always had; sentence-style surfaces (worker search) pass 'sentences'
   *  plus autoCorrect so conversion changes nothing about their keyboards. */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  /** Suppress the clear control — for a field whose design (the locked 48
   *  mirror) never rendered one. */
  disableClear?: boolean;
  /** Rendered inside the field after the mic — the submit-arrow slot the
   *  converted screens keep. Absent by default. */
  trailing?: ReactNode;
};

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search',
  onSubmit,
  onPress,
  autoFocus = false,
  style,
  accessibilityLabel,
  disableVoiceSearch = false,
  autoCapitalize = 'none',
  autoCorrect = false,
  disableClear = false,
  trailing,
}: SearchBarProps) {
  const { emerald: colors, isDark } = useThemeColors();
  const styles = stylesFor(colors);

  // False until the boundary affirms on-device recognition on THIS binary;
  // every degraded case leaves the mic unrendered rather than disabled.
  const [voiceReady, setVoiceReady] = useState(false);
  const [listening, setListening] = useState(false);
  const sessionRef = useRef<VoiceHoldSession | null>(null);
  const isButton = onPress != null;

  useEffect(() => {
    if (disableVoiceSearch || isButton) return;
    let alive = true;
    void voiceSearch.getAvailability().then((availability) => {
      if (alive) setVoiceReady(availability.status === 'available');
    });
    return () => {
      alive = false;
    };
  }, [disableVoiceSearch, isButton]);

  // An unmount mid-hold tears the session down without committing.
  useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
    };
  }, []);

  const startVoiceHold = () => {
    if (sessionRef.current) return;
    setListening(true);
    sessionRef.current = voiceSearch.beginHold({
      // The transcript's one egress: the exact path typed text takes.
      onTranscript: onChangeText,
      onEnd: () => {
        sessionRef.current = null;
        setListening(false);
      },
    });
  };

  const endVoiceHold = () => {
    sessionRef.current?.release();
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.field, pressed && styles.pressed, style]}
        accessibilityRole="search"
        accessibilityLabel={accessibilityLabel ?? placeholder}
      >
        <Ionicons name="search" size={18} color={colors.emerald} />
        {/* Plain Text, not a disabled TextInput: a disabled input stays
            focusable on some platforms and reads as broken rather than as a
            button. */}
        <Text
          style={[styles.value, !value && styles.placeholder]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.field, style]}>
      <Ionicons name="search" size={18} color={colors.emerald} />
      <TextInput
        keyboardAppearance={isDark ? 'dark' : 'light'}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {value.length > 0 && !disableClear ? (
        <Pressable
          onPress={() => onChangeText('')}
          // The glyph is small; the hit area is not.
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Ionicons name="close-circle" size={18} color={colors.navInactive} />
        </Pressable>
      ) : null}
      {voiceReady && !disableVoiceSearch ? (
        <Pressable
          // Hold-to-talk, deliberately press-in/press-out and never onPress:
          // a tap-to-toggle would let listening outlive the touch, which the
          // permission string rules out.
          onPressIn={startVoiceHold}
          onPressOut={endVoiceHold}
          // 20pt glyph + 4pt padding + 8pt slop lands on the 44pt floor.
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Hold to search by voice"
          style={[styles.mic, listening && styles.micListening]}
        >
          <Ionicons
            name={listening ? 'mic' : 'mic-outline'}
            size={20}
            color={listening ? colors.emerald : colors.navInactive}
          />
        </Pressable>
      ) : null}
      {trailing}
    </View>
  );
}

const stylesFor = themedStyles((colors: EmeraldPalette) =>
  StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: controls.fieldHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.9,
  },
  input: {
    flex: 1,
    ...typeScale.body,
    color: colors.ink,
    // Height comes from the row. Letting the input size itself makes Android
    // add its own vertical padding and the pill grow.
    paddingVertical: 0,
  },
  value: {
    flex: 1,
    ...typeScale.body,
    color: colors.ink,
  },
  placeholder: {
    color: colors.muted,
  },
  mic: {
    padding: spacing.xs,
    borderRadius: radius.pill,
  },
  micListening: {
    // A quiet emerald wash marks "listening now" in both palettes; the
    // colour is a palette read, the alpha a per-surface opacity.
    backgroundColor: withAlpha(colors.emerald, 0.15),
  },
  }),
);
